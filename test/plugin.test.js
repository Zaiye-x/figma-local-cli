import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

test('actual serializer preserves mixed properties, segments, instance refs and budget markers', async () => {
  const source = await readFile(new URL('../plugin/serialize.ts', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm' });
  const { serialize } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const text = { id: '1:2', name: 'Mixed', type: 'TEXT', characters: 'AB', fontSize: Symbol('mixed'),
    getStyledTextSegments: () => [{ start: 0, end: 1, fontSize: 12 }, { start: 1, end: 2, fontSize: 18 }] };
  const instance = { id: '1:3', name: 'Instance', type: 'INSTANCE',
    getMainComponentAsync: async () => ({ id: '2:1', key: 'key', name: 'Button', remote: false, parent: null }) };
  const frame = { id: '1:1', name: 'Frame', type: 'FRAME', children: [text, instance] };
  const full = await serialize([frame], 8, 10);
  assert.deepEqual(full.nodes[0].children[0].fontSize, { mixed: true });
  assert.equal(full.nodes[0].children[0].textSegments.length, 2);
  assert.equal(full.nodes[0].children[1].mainComponent.id, '2:1');
  assert.equal(full.completeness.truncated, false);
  const limited = await serialize([frame], 8, 2);
  assert.equal(limited.completeness.count, 2);
  assert.deepEqual(limited.completeness.truncations[0], { nodeId: '1:1', reason: 'node-budget', omittedChildren: 1 });
});

test('built plugin rejects a changed page, returns errors and never repeats a script', async () => {
  const messages = [];
  const figma = { root: { name: 'Fixture' }, currentPage: { id: '0:1', name: 'Page', selection: [] },
    ui: { postMessage: m => messages.push(m) }, showUI() {}, on() {}, counter: 0 };
  const sandbox = vm.createContext({ figma, __html__: '', console });
  vm.runInContext(await readFile(new URL('../dist/plugin/main.js', import.meta.url), 'utf8'), sandbox);
  await figma.ui.onmessage({ type: 'context-request' });
  const sessionId = messages.at(-1).meta.sessionId;
  const job = { id: 'test-1', operation: 'eval', target: { sessionId, pageId: 'wrong-page' },
    args: { script: 'figma.counter++; return figma.counter;' } };
  await figma.ui.onmessage({ type: 'job', job });
  assert.equal(figma.counter, 0);
  assert.equal(messages.find(m => m.type === 'result').status, 'failed');
  job.id = 'test-2'; job.target.pageId = '0:1';
  await figma.ui.onmessage({ type: 'job', job });
  await figma.ui.onmessage({ type: 'job', job });
  assert.equal(figma.counter, 1);
  job.id = 'test-3'; job.args.script = 'figma.counter++; throw new Error("partial");';
  await figma.ui.onmessage({ type: 'job', job });
  assert.equal(figma.counter, 2);
  assert.match(messages.find(m => m.type === 'result' && m.jobId === 'test-3').error, /局部修改/);
});

test('built plugin returns read-only scaffold context across dynamic pages', async () => {
  const messages = [];
  const owned = JSON.stringify({ schemaVersion: 1, projectCode: 'PRJ', role: 'section:flow:F01' });
  const frame = {
    id: '2:1', name: 'Screen', type: 'FRAME', children: [],
    getPluginData: () => ''
  };
  const section = {
    id: '1:1', name: 'F01 · Onboarding · WIP', type: 'SECTION', children: [frame],
    getPluginData: key => key === 'figma-local-cli.scaffold' ? owned : ''
  };
  const page = {
    id: '0:1', name: 'Page 1', type: 'PAGE', selection: [], children: [section], loaded: 0,
    loadAsync: async () => { page.loaded++; },
    getPluginData: () => ''
  };
  const figma = {
    root: { id: '0:0', name: 'Fixture', children: [page], getPluginData: () => '' },
    currentPage: page,
    ui: { postMessage: message => messages.push(message) },
    showUI() {},
    on() {}
  };
  const sandbox = vm.createContext({ figma, __html__: '', console });
  vm.runInContext(await readFile(new URL('../dist/plugin/main.js', import.meta.url), 'utf8'), sandbox);
  await figma.ui.onmessage({ type: 'context-request' });
  const sessionId = messages.at(-1).meta.sessionId;
  await figma.ui.onmessage({
    type: 'job',
    job: {
      id: 'scaffold-context-1',
      operation: 'scaffold-plan-context',
      target: { sessionId, pageId: '0:1' },
      args: {}
    }
  });
  const result = messages.find(message =>
    message.type === 'result' && message.jobId === 'scaffold-context-1');
  assert.equal(result.status, 'succeeded');
  assert.equal(page.loaded, 1);
  assert.equal(result.result.source.fileName, 'Fixture');
  assert.equal(result.result.pages[0].childCount, 1);
  assert.equal(result.result.pages[0].children[0].pluginData, owned);
  assert.equal(result.result.pages[0].children[0].children[0].name, 'Screen');
  assert.equal(result.result.pages[0].children[0].children[0].children.length, 0);
});
