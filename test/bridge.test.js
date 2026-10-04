import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createBridge } from '../src/bridge.js';

async function fixture(t, options = {}) {
  let clock = 1000;
  const bridge = await createBridge({ port: 0, now: () => clock, ...options });
  t.after(() => bridge.close());
  const c = bridge.credentials;
  async function call(route, body, role = 'cli', extra = {}) {
    if (extra.Host) {
      return new Promise((resolve, reject) => {
        const req = http.get(c.url + route, { headers: { Authorization: `Bearer ${c.cliToken}`, ...extra } }, res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks)) }));
        });
        req.on('error', reject);
      });
    }
    const response = await fetch(c.url + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${role === 'plugin' ? c.pluginToken : c.cliToken}`,
        'Content-Type': 'application/json', ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  const meta = { fileName: 'Personal draft', pageName: 'Page 1', pageId: '0:1', selection: [] };
  const poll = (pageId = '0:1') => call('/plugin/poll', { sessionId: 'session-a', meta: { ...meta, pageId } }, 'plugin');
  const bind = () => call('/bind', { sessionId: 'session-a' });
  const submit = (id = 'job-1', operation = 'eval') => call('/jobs', { id, operation, args: { script: 'return 1' } });
  return { call, poll, bind, submit, port: new URL(c.url).port, setTime: value => { clock = value; } };
}

test('auth, Origin, Host and role separation', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/status', undefined, 'cli', { Authorization: 'Bearer invalid' })).status, 401);
  assert.equal((await f.call('/status', undefined, 'plugin')).status, 401);
  assert.equal((await f.call('/status', undefined, 'cli', { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.call('/status', undefined, 'cli', { Host: 'evil.example' })).status, 403);
  assert.equal((await f.call('/status', undefined, 'cli', { Host: `localhost:${f.port}` })).status, 200);
  assert.equal((await f.call('/plugin/poll', {}, 'plugin', { Origin: 'https://evil.example' })).status, 403);
  const allowed = await f.call('/plugin/poll', {}, 'plugin', { Origin: 'null' });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'null');
  assert.equal(allowed.status, 400);
});

test('bind, job dispatch, no replay, acknowledgement and result', async t => {
  const f = await fixture(t);
  assert.equal((await f.bind()).status, 409);
  await f.poll(); await f.bind();
  assert.equal((await f.submit()).data.status, 'queued');
  assert.equal((await f.submit()).data.id, 'job-1');
  assert.equal((await f.poll()).data.job.id, 'job-1');
  assert.equal((await f.poll()).data.job, null);
  const result = { sessionId: 'session-a', jobId: 'job-1', status: 'succeeded', result: { nodeId: '1:2' } };
  assert.equal((await f.call('/plugin/result', { ...result, sessionId: 'other' }, 'plugin')).status, 404);
  assert.equal((await f.call('/plugin/result', result, 'plugin')).status, 200);
  assert.equal((await f.call('/plugin/result', result, 'plugin')).data.duplicate, true);
  assert.equal((await f.call('/jobs/job-1')).data.result.nodeId, '1:2');
  assert.equal((await f.poll()).data.job, null);
});

test('offline and page change reject submissions; queued jobs recheck target', async t => {
  const f = await fixture(t);
  await f.poll(); await f.bind(); await f.submit();
  assert.equal((await f.poll('0:2')).data.job, null);
  assert.match((await f.call('/jobs/job-1')).data.error, /页面改变/);
  assert.equal((await f.submit('job-2')).status, 409);
  await f.bind();
  assert.equal((await f.submit('job-2')).status, 202);
  f.setTime(10000);
  assert.equal((await f.submit('job-3')).status, 409);
});

test('queued timeout never executes; running timeout stays unknown and blocks more work', async t => {
  const f = await fixture(t, { queueMs: 100, runMs: 200 });
  await f.poll(); await f.bind(); await f.submit();
  f.setTime(1101);
  assert.equal((await f.poll()).data.job, null);
  assert.equal((await f.call('/jobs/job-1')).data.status, 'failed');
  await f.submit('job-2'); await f.poll();
  f.setTime(1302);
  assert.equal((await f.call('/jobs/job-2')).data.status, 'indeterminate');
  assert.equal((await f.poll()).data.job, null);
  assert.equal((await f.submit('job-3')).status, 409);
  await f.call('/plugin/result', { sessionId: 'session-a', jobId: 'job-2', status: 'succeeded', result: 42 }, 'plugin');
  const late = (await f.call('/jobs/job-2')).data;
  assert.equal(late.status, 'indeterminate');
  assert.equal(late.lateResult.result, 42);
  assert.equal((await f.submit('job-3')).status, 202);
  await f.poll();
  await f.submit('job-4');
  const duplicate = await f.call('/plugin/result', { sessionId: 'session-a', jobId: 'job-2', status: 'succeeded', result: 42 }, 'plugin');
  assert.equal(duplicate.data.duplicate, true);
  assert.equal((await f.poll()).data.job, null, 'late duplicate must not release a newer running job');
});

test('job/request budgets are enforced', async t => {
  const f = await fixture(t, { maxJobs: 1, bodyLimit: 512 });
  await f.poll(); await f.bind();
  await f.submit();
  assert.equal((await f.submit('job-2')).status, 429);
  assert.equal((await f.call('/jobs', { x: 'x'.repeat(1000) })).status, 413);
});

test('scaffold context is an explicit read operation', async t => {
  const f = await fixture(t);
  await f.poll();
  await f.bind();
  const accepted = await f.call('/jobs', {
    id: 'scaffold-context-1',
    operation: 'scaffold-plan-context',
    args: {}
  });
  assert.equal(accepted.status, 202);
  const rejected = await f.call('/jobs', {
    id: 'unknown-operation-1',
    operation: 'unknown-read',
    args: {}
  });
  assert.equal(rejected.status, 400);
});
