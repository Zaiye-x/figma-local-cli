import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveStateDir } from '../src/state.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('global command uses repository state unless explicitly overridden', () => {
  assert.equal(resolveStateDir(root, undefined, {}), path.join(root, '.figma-local'));
  assert.equal(resolveStateDir(root, 'relative-state', {}), path.resolve('relative-state'));
  assert.equal(resolveStateDir(root, undefined, { FIGMA_LOCAL_STATE: '/tmp/figma-state' }),
    '/tmp/figma-state');
});

test('canonical global skill has valid trigger metadata and maintenance contract', async () => {
  const source = await readFile(new URL('../skills/figma-local-cli/SKILL.md', import.meta.url), 'utf8');
  assert.match(source, /^---\nname: figma-local-cli\ndescription: [^\n]+\n---\n/);
  assert.doesNotMatch(source.split('\n')[2].slice('description: '.length), /: |<|>|TODO/);
  assert.match(source, /\/figma-local-cli/);
  assert.match(source, /npm run install:global/);
  assert.match(source, /sessions/);
  assert.match(source, /bind/);
  assert.match(source, /禁止自动重放/);
});

test('package exposes only the unified global command name', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(pkg.bin, { 'figma-local-cli': './src/cli.js' });
});
