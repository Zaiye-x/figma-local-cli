import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileTokens, collectComponents, collectCandidates, writeAssets } from '../src/assets.js';

function snapshot() {
  return {
    schemaVersion: 1, capturedAt: '2026-10-04T00:00:00Z',
    source: { fileName: 'fixture', pageName: 'Page', pageId: '0:1' },
    scope: { rootIds: ['1:1'] },
    completeness: { count: 2, truncated: true, truncations: [{ nodeId: '1:1', reason: 'depth' }] },
    nodes: [{ id: '1:1', name: 'Button', key: 'component-key', type: 'COMPONENT',
      paddingLeft: 16, boundVariables: { paddingLeft: { id: 'var-space', type: 'VARIABLE_ALIAS' } },
      children: [{ id: '1:2', type: 'TEXT', fontSize: 16,
        textSegments: [{ start: 0, end: 2, fontSize: 16, characters: 'Go' }] }] }],
    collections: [
      { id: 'c1', name: '基础 / Core', defaultModeId: 'm1', modes: [{ modeId: 'm1', name: 'Default' }, { modeId: 'm2', name: 'Dark' }] },
      { id: 'c2', name: 'Semantic', defaultModeId: 'm3', modes: [{ modeId: 'm3', name: 'Default' }] }
    ],
    variables: [
      { id: 'v1', name: 'color/blue', variableCollectionId: 'c1', resolvedType: 'COLOR',
        valuesByMode: { m1: { r: 0.1, g: 0.2, b: 0.3, a: 0.4 }, m2: { r: 1, g: 1, b: 1 } } },
      { id: 'v2', name: 'color.blue', variableCollectionId: 'c1', resolvedType: 'COLOR',
        valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'v1' }, m2: { type: 'VARIABLE_ALIAS', id: 'v1' } } },
      { id: 'v3', name: 'Action', variableCollectionId: 'c2', resolvedType: 'COLOR',
        valuesByMode: { m3: { type: 'VARIABLE_ALIAS', id: 'v2' } } },
      { id: 'v4', name: 'Label', variableCollectionId: 'c2', resolvedType: 'STRING', valuesByMode: { m3: 'Continue' } },
      { id: 'v5', name: 'Enabled', variableCollectionId: 'c2', resolvedType: 'BOOLEAN', valuesByMode: { m3: true } },
      { id: 'v6', name: 'Space', variableCollectionId: 'c2', resolvedType: 'FLOAT', valuesByMode: { m3: 24 } }
    ], styles: []
  };
}
function getToken(result, id, mode) {
  const entry = result.index.find(e => e.variableId === id && e.modeId === mode);
  return entry.tokenPath.split('.').reduce((group, key) => group[key], result.files[entry.file]);
}

test('DTCG colors, alpha, mode aliases, cross-collection refs and non-DTCG values', () => {
  const result = compileTokens(snapshot());
  assert.deepEqual(getToken(result, 'v1', 'm1').$value, {
    colorSpace: 'srgb', components: [0.1, 0.2, 0.3], alpha: 0.4
  });
  assert.equal(getToken(result, 'v1', 'm2').$value.alpha, 1);
  const blue = result.index.find(i => i.variableId === 'v1' && i.modeId === 'm1');
  assert.equal(getToken(result, 'v2', 'm1').$value, `{${blue.tokenPath}}`);
  assert.notEqual(getToken(result, 'v2', 'm1').$value, getToken(result, 'v2', 'm2').$value,
    'aliases must explicitly preserve mode identity when files are merged');
  assert.deepEqual(result.index.find(i => i.variableId === 'v3').alias, { variableId: 'v2', modeId: 'm1' });
  assert.equal(result.index.find(i => i.variableId === 'v4').status, 'raw-only');
  assert.equal(result.index.find(i => i.variableId === 'v5').originalValue, true);
  assert.equal(getToken(result, 'v6', 'm3').$type, 'number');
  assert.match(result.css, /var\(--/);
  assert.match(result.css, /25.5 51 76.5 \/ 0.4/);
  assert.equal(new Set(result.index.filter(i => i.collectionId === 'c1' && i.modeId === 'm1').map(i => i.tokenPath)).size, 2);
});

test('unknown and cyclic variable aliases fail loudly', () => {
  const missing = snapshot();
  missing.variables[1].valuesByMode.m1.id = 'missing';
  assert.throws(() => compileTokens(missing), /未提取的变量/);
  const cyclic = snapshot();
  cyclic.variables[0].valuesByMode.m1 = { type: 'VARIABLE_ALIAS', id: 'v2' };
  assert.throws(() => compileTokens(cyclic), /循环/);
});

test('candidate values exclude explicitly bound properties; component refs stay unmapped', () => {
  const data = snapshot();
  data.nodes.push({ id: '1:3', type: 'INSTANCE',
    mainComponent: { id: '1:1', name: 'Button', key: 'component-key' } });
  assert.deepEqual(collectCandidates(data).map(c => c.property), ['fontSize']);
  assert.equal(collectComponents(data)[0].status, 'unmapped');
  assert.deepEqual(collectComponents(data)[0].instanceIds, ['1:3']);
});

test('asset package retains mixed text/truncation, has entry point and refuses overwrite', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'figma-assets-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'assets');
  const data = snapshot();
  const report = await writeAssets(out, data);
  assert.equal(report.truncated, true);
  const saved = JSON.parse(await readFile(path.join(out, 'snapshot.json'), 'utf8'));
  assert.deepEqual(saved, data);
  assert.match(await readFile(path.join(out, 'HANDOFF.md'), 'utf8'), /本包没有预览/);
  await assert.rejects(writeAssets(out, data), /拒绝覆盖/);
});
