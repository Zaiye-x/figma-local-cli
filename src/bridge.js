import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const token = () => randomBytes(32).toString('base64url');
const fail = (status, message) => Object.assign(new Error(message), { status });
const same = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const allowedOrigins = new Set(['null', 'https://www.figma.com', 'https://figma.com']);
const operations = new Set(['inspect', 'eval', 'screenshot', 'extract']);
const identifier = value => typeof value === 'string' && /^[\w:.-]{1,128}$/.test(value);

async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(413, '请求过大；请缩小节点范围或图片尺寸。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw fail(400, '无效 JSON'); }
}

export async function createBridge({
  port = 3055, now = Date.now, onlineMs = 8000, queueMs = 20000,
  runMs = 60000, maxJobs = 250, bodyLimit = 24 * 1024 * 1024
} = {}) {
  const instanceId = randomUUID(), cliToken = token(), pluginToken = token();
  const sessions = new Map(), jobs = new Map();
  let binding = null;
  const online = s => s && now() - s.lastSeen < onlineMs;
  const publicSession = s => ({
    sessionId: s.sessionId, ...s.meta, online: Boolean(online(s)),
    lastSeen: s.lastSeen, busyJobId: s.busyJobId || null
  });
  function settleTimeouts() {
    for (const j of jobs.values()) {
      if (j.status === 'queued' && now() - j.createdAt >= queueMs) {
        Object.assign(j, { status: 'failed', error: '排队超时，未分发执行。', finishedAt: now() });
      } else if (j.status === 'running' && now() - j.startedAt >= j.timeoutMs) {
        Object.assign(j, { status: 'indeterminate',
          error: '执行结果未知；不得直接重放。请查询 job，并在 Figma 检查结果。', finishedAt: now() });
        // Keep the session busy until the original result arrives.
      }
    }
  }
  const server = http.createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      const port = server.address().port;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) throw fail(403, 'Host rejected');
      const url = new URL(req.url, 'http://127.0.0.1');
      const isPlugin = url.pathname.startsWith('/plugin/');
      const origin = req.headers.origin;
      if (origin && (!isPlugin || !allowedOrigins.has(origin))) throw fail(403, 'Origin rejected');
      if (isPlugin && origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      if (req.method === 'OPTIONS' && isPlugin) return send(204, {});
      if (!same(req.headers.authorization, `Bearer ${isPlugin ? pluginToken : cliToken}`)) {
        throw fail(401, '认证失败；服务重启后请重新配对。');
      }
      settleTimeouts();
      const path = url.pathname;
      if (req.method === 'GET' && path === '/status') {
        return send(200, { instanceId, binding, sessions: [...sessions.values()].map(publicSession),
          jobCount: jobs.size });
      }
      if (req.method === 'GET' && path.startsWith('/jobs/')) {
        const job = jobs.get(path.slice(6));
        if (!job) throw fail(404, '任务不存在（服务重启会清除内存任务）。');
        return send(200, job);
      }
      if (req.method !== 'POST') throw fail(404, 'Not found');
      const body = await readBody(req, bodyLimit);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, '请求须为 JSON 对象');
      if (path === '/bind') {
        const s = sessions.get(body.sessionId);
        if (!online(s)) throw fail(409, '插件未在线。请打开 Figma 文件、运行开发插件并配对。');
        binding = { instanceId, sessionId: s.sessionId, pageId: s.meta.pageId };
        return send(200, { binding, target: publicSession(s) });
      }
      if (path === '/jobs') {
        if (!binding) throw fail(409, '尚未绑定目标。先运行 sessions，再运行 bind <session-id>。');
        if (!identifier(body.id) || !operations.has(body.operation)) throw fail(400, '无效任务');
        if (jobs.has(body.id)) return send(200, jobs.get(body.id));
        const s = sessions.get(binding.sessionId);
        if (!online(s)) throw fail(409, '绑定插件已离线，请重新打开并配对。');
        if (s.meta.pageId !== binding.pageId) throw fail(409, '当前页面已切换，请重新 bind。');
        if (s.busyJobId && jobs.get(s.busyJobId)?.status === 'indeterminate') {
          throw fail(409, '上一任务结果未知，仍可能执行。先检查 Figma 或等待原结果。');
        }
        if (jobs.size >= maxJobs) throw fail(429, '本次服务任务上限已达；保存结果后重启服务。');
        const timeoutMs = body.timeoutMs ?? runMs;
        if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000) {
          throw fail(400, 'timeoutMs 须在 100–300000 之间');
        }
        const job = { id: body.id, operation: body.operation, args: body.args || {},
          target: { ...binding }, status: 'queued', createdAt: now(), timeoutMs };
        jobs.set(job.id, job);
        return send(202, job);
      }
      if (path === '/plugin/poll') {
        const { sessionId, meta } = body;
        if (!identifier(sessionId) || !meta || !identifier(meta.pageId) ||
            typeof meta.fileName !== 'string' || typeof meta.pageName !== 'string' ||
            !Array.isArray(meta.selection)) throw fail(400, '无效插件上下文');
        let s = sessions.get(sessionId);
        if (!s) {
          if (sessions.size >= 32) throw fail(429, '会话数已达上限');
          s = { sessionId, busyJobId: null };
          sessions.set(sessionId, s);
        }
        s.meta = { fileName: meta.fileName.slice(0, 500), pageId: meta.pageId,
          pageName: meta.pageName.slice(0, 500), selection: meta.selection.slice(0, 100) };
        s.lastSeen = now();
        let next = null;
        if (!s.busyJobId) {
          for (const j of jobs.values()) {
            if (j.status !== 'queued' || j.target.sessionId !== sessionId) continue;
            if (j.target.pageId !== meta.pageId) {
              Object.assign(j, { status: 'failed', error: '执行前页面改变，任务未执行。', finishedAt: now() });
              continue;
            }
            j.status = 'running';
            j.startedAt = now();
            s.busyJobId = j.id;
            next = j;
            break;
          }
        }
        return send(200, { instanceId, job: next });
      }
      if (path === '/plugin/result') {
        const j = jobs.get(body.jobId), s = sessions.get(body.sessionId);
        if (!j || j.target.sessionId !== body.sessionId || !s) throw fail(404, '任务/会话不匹配');
        if (!['succeeded', 'failed'].includes(body.status)) throw fail(400, '无效结果状态');
        // A lost result acknowledgement may be retried; never execute the job twice.
        if ((['succeeded', 'failed'].includes(j.status) && j.startedAt !== undefined) || j.lateResult) {
          return send(200, { accepted: true, duplicate: true });
        }
        if (!['running', 'indeterminate'].includes(j.status)) throw fail(409, '任务尚未分发');
        if (j.status === 'indeterminate') {
          j.lateResult = { status: body.status, result: body.result, error: body.error, receivedAt: now() };
        } else {
          Object.assign(j, { status: body.status, result: body.result, error: body.error, finishedAt: now() });
        }
        if (s.busyJobId === j.id) s.busyJobId = null;
        return send(200, { accepted: true });
      }
      throw fail(404, 'Not found');
    } catch (error) {
      if (!res.headersSent) send(error.status || 500, { error: error.message });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const timer = setInterval(settleTimeouts, 500);
  timer.unref();
  return {
    credentials: { version: 1, instanceId, url: `http://127.0.0.1:${server.address().port}`,
      cliToken, pluginToken, pid: process.pid },
    close: async () => {
      clearInterval(timer);
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
