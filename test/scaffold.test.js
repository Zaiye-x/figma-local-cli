import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCAFFOLD_PLUGIN_DATA_KEY,
  planScaffold,
  validateScaffoldConfig
} from '../src/scaffold.js';

const config = (overrides = {}) => ({
  schemaVersion: 1,
  project: { code: 'PRJ', name: 'Product Name', version: 'v1' },
  pageMode: 'three',
  platforms: ['desktop', 'mobile'],
  flows: [
    { code: 'F01', name: 'Onboarding' },
    { code: 'F02', name: 'Core Task' }
  ],
  ...overrides
});

const owner = role => JSON.stringify({ schemaVersion: 1, projectCode: 'PRJ', role });
const node = (id, name, role, children = []) => ({
  id,
  type: role.startsWith('page:') ? 'PAGE' : 'SECTION',
  name,
  childCount: children.length,
  pluginData: owner(role),
  children
});
const context = (pages, source = {}) => ({
  source: {
    sessionId: 'plugin-1',
    fileName: 'Personal draft',
    pageId: pages[0]?.id || '0:1',
    pageName: pages[0]?.name || 'Page 1',
    selection: [],
    ...source
  },
  document: { id: '0:0', type: 'DOCUMENT', name: 'Personal draft', pluginData: '' },
  pages
});

test('schema validation is strict, normalized and rejects ambiguous flow codes', () => {
  const validated = validateScaffoldConfig(config({
    project: { code: ' PRJ ', name: ' Product Name ', version: ' v1 ' },
    flows: [{ code: ' F01 ', name: ' Onboarding ' }]
  }));
  assert.deepEqual(validated.project, { code: 'PRJ', name: 'Product Name', version: 'v1' });
  assert.deepEqual(validated.flows, [{ code: 'F01', name: 'Onboarding' }]);
  assert.throws(() => validateScaffoldConfig(config({ schemaVersion: 2 })), /schemaVersion/);
  assert.throws(() => validateScaffoldConfig(config({ pageMode: 'automatic' })), /pageMode/);
  assert.throws(() => validateScaffoldConfig(config({ platforms: ['desktop', 'desktop'] })), /platforms/);
  assert.throws(() => validateScaffoldConfig(config({
    flows: [{ code: 'F01', name: 'One' }, { code: 'F01', name: 'Two' }]
  })), /flows/);
  assert.throws(() => validateScaffoldConfig({ ...config(), typo: true }), /未知字段 typo/);
});

test('empty three-page file adopts Page 1 and produces a deterministic plan', () => {
  const page = { id: '0:1', type: 'PAGE', name: 'Page 1', childCount: 0, pluginData: '', children: [] };
  const plan = planScaffold(validateScaffoldConfig(config()), context([page]));

  assert.equal(plan.executable, true);
  assert.equal(plan.idempotent, false);
  assert.equal(plan.mode, 'three');
  assert.equal(plan.compatibility.resultingPageCount, 3);
  assert.equal(plan.compatibility.starterCompatible, true);
  assert.deepEqual(plan.summary, {
    create: { pages: 2, sections: 13, frames: 0 },
    rename: { pages: 1, sections: 0, frames: 0 },
    adopt: { pages: 0, sections: 0, frames: 0 },
    preserve: { pages: 0, sections: 0, frames: 0 }
  });
  assert.deepEqual(plan.actions[0], {
    action: 'rename',
    objectType: 'PAGE',
    objectId: '0:1',
    from: 'Page 1',
    to: '00 · Map & Journey',
    role: 'page:map',
    pluginData: {
      key: SCAFFOLD_PLUGIN_DATA_KEY,
      value: { schemaVersion: 1, projectCode: 'PRJ', role: 'page:map' }
    }
  });
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.touchesExistingNodes, true);
  assert.deepEqual(plan.source, context([page]).source);
});

test('non-empty unowned page requires explicit adoption and is never guessed', () => {
  const page = {
    id: '0:1',
    type: 'PAGE',
    name: 'Page 1',
    childCount: 1,
    pluginData: '',
    children: [{ id: '1:1', type: 'FRAME', name: 'Existing design', childCount: 0, pluginData: '' }]
  };
  const blocked = planScaffold(validateScaffoldConfig(config()), context([page]));
  assert.equal(blocked.executable, false);
  assert.equal(blocked.actions.length, 0);
  assert.equal(blocked.conflicts[0].code, 'ADOPT_PAGE_REQUIRED');

  const adopted = planScaffold(validateScaffoldConfig(config()), context([page]), { adoptPageId: '0:1' });
  assert.equal(adopted.executable, true);
  assert.equal(adopted.touchesExistingNodes, true);
  assert.equal(adopted.actions[0].action, 'rename');
  assert.match(adopted.notices.join('\n'), /保留 1 个已有顶层节点/);
});

test('unowned target names and unrelated pages are conflicts', () => {
  const page = {
    id: '0:1',
    type: 'PAGE',
    name: '00 · Map & Journey',
    childCount: 0,
    pluginData: '',
    children: []
  };
  const plan = planScaffold(validateScaffoldConfig(config()), context([page]));
  assert.equal(plan.executable, false);
  assert.deepEqual(plan.conflicts.map(item => item.code), ['UNOWNED_NAME_CONFLICT']);
  assert.equal(plan.actions.length, 0);
});

test('single-page fallback is explicit and creates three boundary sections', () => {
  const page = { id: '0:1', type: 'PAGE', name: 'Page 1', childCount: 0, pluginData: '', children: [] };
  const plan = planScaffold(
    validateScaffoldConfig(config({ pageMode: 'three' })),
    context([page]),
    { pageMode: 'single' }
  );
  assert.equal(plan.mode, 'single');
  assert.equal(plan.executable, true);
  assert.equal(plan.compatibility.resultingPageCount, 1);
  assert.deepEqual(plan.summary.create, { pages: 0, sections: 16, frames: 0 });
  assert.deepEqual(plan.summary.adopt, { pages: 1, sections: 0, frames: 0 });
  assert.deepEqual(
    plan.actions.filter(action => action.parentRole === 'page:single').map(action => action.name),
    [
      'PAGE 00 · Map & Journey',
      'PAGE 10 · Product & Prototype',
      'PAGE 90 · System & Specs'
    ]
  );
  assert.equal(plan.actions.some(action => action.objectType === 'PAGE' && action.action === 'create'), false);
});

test('owned scaffold is idempotent and preserves all expected objects', () => {
  const mapSections = [
    ['section:map:start-here', '00.1 · Start Here'],
    ['section:map:user-journey', '00.2 · User Journey'],
    ['section:map:screen-inventory', '00.3 · Screen Inventory'],
    ['section:map:flow-directory', '00.4 · Flow Directory'],
    ['section:map:milestones', '00.5 · Milestones']
  ].map(([role, name], index) => node(`1:${index}`, name, role));
  const flowSections = [
    node('2:1', 'F01 · Onboarding · WIP', 'section:flow:F01'),
    node('2:2', 'F02 · Core Task · WIP', 'section:flow:F02')
  ];
  const systemSections = [
    ['section:system:foundations', '90.1 · Foundations'],
    ['section:system:local-variables', '90.2 · Local Variables'],
    ['section:system:components', '90.3 · Components'],
    ['section:system:patterns', '90.4 · Patterns'],
    ['section:system:content-accessibility', '90.5 · Content & Accessibility'],
    ['section:system:changelog', '90.6 · Changelog']
  ].map(([role, name], index) => node(`3:${index}`, name, role));
  const pages = [
    node('0:1', '00 · Map & Journey', 'page:map', mapSections),
    node('0:2', '10 · Product & Prototype', 'page:product', flowSections),
    node('0:3', '90 · System & Specs', 'page:system', systemSections)
  ];

  const plan = planScaffold(validateScaffoldConfig(config()), context(pages));
  assert.equal(plan.executable, true);
  assert.equal(plan.idempotent, true);
  assert.equal(plan.actions.every(action => action.action === 'preserve'), true);
  assert.deepEqual(plan.summary.preserve, { pages: 3, sections: 13, frames: 0 });
  assert.deepEqual(plan.summary.create, { pages: 0, sections: 0, frames: 0 });
  assert.equal(plan.touchesExistingNodes, false);
});

test('owned objects with another project or stale schema are conflicts', () => {
  const page = {
    id: '0:1',
    type: 'PAGE',
    name: '00 · Map & Journey',
    childCount: 0,
    pluginData: JSON.stringify({ schemaVersion: 1, projectCode: 'OTHER', role: 'page:map' }),
    children: []
  };
  const projectConflict = planScaffold(validateScaffoldConfig(config()), context([page]));
  assert.equal(projectConflict.conflicts[0].code, 'OWNERSHIP_CONFLICT');

  page.pluginData = JSON.stringify({ schemaVersion: 0, projectCode: 'PRJ', role: 'page:map' });
  const schemaConflict = planScaffold(validateScaffoldConfig(config()), context([page]));
  assert.equal(schemaConflict.conflicts[0].code, 'MIGRATION_REQUIRED');
});

test('same-name incompatible ownership and document ownership are blocking conflicts', () => {
  const wrongRole = {
    id: '0:1',
    type: 'PAGE',
    name: '00 · Map & Journey',
    childCount: 0,
    pluginData: owner('page:product'),
    children: []
  };
  const pageConflict = planScaffold(validateScaffoldConfig(config()), context([wrongRole]));
  assert.equal(pageConflict.conflicts.some(item => item.code === 'OWNERSHIP_CONFLICT'), true);

  const mapPage = node('0:1', '00 · Map & Journey', 'page:map', [{
    id: '1:1',
    type: 'SECTION',
    name: '00.1 · Start Here',
    childCount: 0,
    pluginData: owner('section:flow:F01'),
    children: []
  }]);
  const sectionConflict = planScaffold(
    validateScaffoldConfig(config()),
    context([mapPage, node('0:2', '10 · Product & Prototype', 'page:product'),
      node('0:3', '90 · System & Specs', 'page:system')])
  );
  assert.equal(sectionConflict.conflicts.some(item => item.objectId === '1:1' &&
    item.code === 'OWNERSHIP_CONFLICT'), true);

  const foreignDocument = context([
    { id: '0:1', type: 'PAGE', name: 'Page 1', childCount: 0, pluginData: '', children: [] }
  ]);
  foreignDocument.document.pluginData = JSON.stringify({
    schemaVersion: 1,
    projectCode: 'OTHER',
    role: 'document'
  });
  const documentConflict = planScaffold(validateScaffoldConfig(config()), foreignDocument);
  assert.equal(documentConflict.conflicts[0].code, 'OWNERSHIP_CONFLICT');
  assert.equal(documentConflict.conflicts[0].objectType, 'DOCUMENT');
});
