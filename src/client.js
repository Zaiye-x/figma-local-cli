import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export async function client(stateDir = '.figma-local') {
  let credentials;
  try { credentials = JSON.parse(await readFile(path.join(stateDir, 'session.json'), 'utf8')); }
  catch { throw new Error('找不到本地会话。请先在项目目录运行 npm start。'); }
  const { url, cliToken, instanceId } = credentials;
  if (url !== 'http://127.0.0.1:3055' || typeof cliToken !== 'string') throw new Error('无效会话文件');
  async function request(route, data) {
    let response;
    try {
      response = await fetch(url + route, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${cliToken}`, 'Content-Type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw new Error('本地服务不可达；先检查 serve。若刚提交了写任务，请用 job 查询，勿直接重放。');
    }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }
  async function run(operation, args = {}, timeoutMs = 60000) {
    const id = randomUUID();
    // Print ID before submission so a lost HTTP response cannot hide a possibly running write.
    process.stderr.write(`任务 ${id} · ${operation}\n`);
    let job = await request('/jobs', { id, operation, args, timeoutMs });
    while (['queued', 'running'].includes(job.status)) {
      await new Promise(resolve => setTimeout(resolve, 400));
      job = await request(`/jobs/${id}`);
    }
    if (job.status !== 'succeeded') throw new Error(`${job.error || job.status}\n任务 ID: ${id}`);
    return job.result;
  }
  return { credentials, instanceId, request, run };
}
