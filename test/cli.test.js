import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const run = args => spawnSync(process.execPath, ['src/cli.js', ...args], {
  cwd: root,
  encoding: 'utf8'
});

test('help documents scaffold as a plan-only command', () => {
  const result = run(['help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /scaffold --config/);
  assert.match(result.stdout, /默认只生成计划/);
});

test('scaffold validates required arguments before connecting', () => {
  const result = run(['scaffold']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /请指定 --config/);
  assert.doesNotMatch(result.stderr, /本地会话/);
});

test('phase one rejects apply before connecting or writing', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'figma-scaffold-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = path.join(directory, 'figma-project.json');
  await writeFile(config, JSON.stringify({
    schemaVersion: 1,
    project: { code: 'PRJ', name: 'Product Name', version: 'v1' },
    pageMode: 'three',
    platforms: ['desktop'],
    flows: []
  }));
  const result = run(['scaffold', '--config', config, '--apply']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /第一阶段仅支持计划/);
  assert.doesNotMatch(result.stderr, /本地会话/);
});
