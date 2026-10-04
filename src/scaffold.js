export const SCAFFOLD_PLUGIN_DATA_KEY = 'figma-local-cli.scaffold';

const PAGE_LIMIT = 3;
const PAGE_DEFINITIONS = [
  {
    role: 'page:map',
    name: '00 · Map & Journey',
    sections: [
      ['section:map:start-here', '00.1 · Start Here'],
      ['section:map:user-journey', '00.2 · User Journey'],
      ['section:map:screen-inventory', '00.3 · Screen Inventory'],
      ['section:map:flow-directory', '00.4 · Flow Directory'],
      ['section:map:milestones', '00.5 · Milestones']
    ]
  },
  { role: 'page:product', name: '10 · Product & Prototype', sections: [] },
  {
    role: 'page:system',
    name: '90 · System & Specs',
    sections: [
      ['section:system:foundations', '90.1 · Foundations'],
      ['section:system:local-variables', '90.2 · Local Variables'],
      ['section:system:components', '90.3 · Components'],
      ['section:system:patterns', '90.4 · Patterns'],
      ['section:system:content-accessibility', '90.5 · Content & Accessibility'],
      ['section:system:changelog', '90.6 · Changelog']
    ]
  }
];

const SINGLE_BOUNDARIES = [
  ['section:boundary:map', 'PAGE 00 · Map & Journey', 'page:map'],
  ['section:boundary:product', 'PAGE 10 · Product & Prototype', 'page:product'],
  ['section:boundary:system', 'PAGE 90 · System & Specs', 'page:system']
];

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} 必须是对象`);
  }
  return value;
}

function exactKeys(value, path, allowed, required = allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${path} 包含未知字段 ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) throw new Error(`${path} 缺少字段 ${key}`);
  }
}

function text(value, path, max, pattern) {
  if (typeof value !== 'string') throw new Error(`${path} 必须是字符串`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || (pattern && !pattern.test(normalized))) {
    throw new Error(`${path} 格式无效`);
  }
  return normalized;
}

export function validateScaffoldConfig(input) {
  const root = object(input, '配置');
  exactKeys(root, '配置', ['schemaVersion', 'project', 'pageMode', 'platforms', 'flows']);
  if (root.schemaVersion !== 1) throw new Error('schemaVersion 目前只支持 1');

  const project = object(root.project, 'project');
  exactKeys(project, 'project', ['code', 'name', 'version']);
  const normalizedProject = {
    code: text(project.code, 'project.code', 32, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    name: text(project.name, 'project.name', 120),
    version: text(project.version, 'project.version', 32)
  };

  if (!['three', 'single'].includes(root.pageMode)) {
    throw new Error('pageMode 必须是 three 或 single');
  }
  if (!Array.isArray(root.platforms) || root.platforms.length < 1 || root.platforms.length > 16) {
    throw new Error('platforms 必须包含 1–16 项');
  }
  const platforms = root.platforms.map((item, index) =>
    text(item, `platforms[${index}]`, 32, /^[A-Za-z0-9][A-Za-z0-9_-]*$/));
  if (new Set(platforms).size !== platforms.length) throw new Error('platforms 不得重复');

  if (!Array.isArray(root.flows) || root.flows.length > 100) {
    throw new Error('flows 必须是最多 100 项的数组');
  }
  const flows = root.flows.map((item, index) => {
    const flow = object(item, `flows[${index}]`);
    exactKeys(flow, `flows[${index}]`, ['code', 'name']);
    return {
      code: text(flow.code, `flows[${index}].code`, 32, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
      name: text(flow.name, `flows[${index}].name`, 120)
    };
  });
  if (new Set(flows.map(flow => flow.code)).size !== flows.length) {
    throw new Error('flows.code 不得重复');
  }

  return {
    schemaVersion: 1,
    project: normalizedProject,
    pageMode: root.pageMode,
    platforms,
    flows
  };
}

function pluginData(node) {
  const raw = node?.pluginData;
  if (raw === undefined || raw === null || raw === '') return { kind: 'none', value: null };
  if (typeof raw !== 'string') return { kind: 'malformed', value: null };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !Number.isInteger(value.schemaVersion) || typeof value.projectCode !== 'string' ||
        typeof value.role !== 'string') {
      return { kind: 'malformed', value: null };
    }
    return { kind: 'owned', value };
  } catch {
    return { kind: 'malformed', value: null };
  }
}

function owner(projectCode, role) {
  return {
    key: SCAFFOLD_PLUGIN_DATA_KEY,
    value: { schemaVersion: 1, projectCode, role }
  };
}

function conflict(code, message, node) {
  return {
    code,
    message,
    ...(node ? { objectId: node.id, objectType: node.type, objectName: node.name } : {})
  };
}

function validateOwnedNode(node, expectedRole, projectCode, conflicts) {
  const data = pluginData(node);
  if (data.kind === 'malformed') {
    conflicts.push(conflict('MALFORMED_PLUGIN_DATA',
      `对象 ${node.name} 的 Scaffold Plugin Data 无效`, node));
    return false;
  }
  if (data.kind !== 'owned') return false;
  if (data.value.schemaVersion !== 1) {
    conflicts.push(conflict('MIGRATION_REQUIRED',
      `对象 ${node.name} 使用 Scaffold schemaVersion ${data.value.schemaVersion}，需要迁移计划`, node));
    return false;
  }
  if (data.value.projectCode !== projectCode || data.value.role !== expectedRole) {
    conflicts.push(conflict('OWNERSHIP_CONFLICT',
      `对象 ${node.name} 属于项目 ${data.value.projectCode} / ${data.value.role}`, node));
    return false;
  }
  return true;
}

function findOwned(children, expected, projectCode, conflicts) {
  let match = null;
  for (const child of children) {
    const data = pluginData(child);
    if (data.kind === 'malformed') {
      conflicts.push(conflict('MALFORMED_PLUGIN_DATA',
        `对象 ${child.name} 的 Scaffold Plugin Data 无效`, child));
      continue;
    }
    if (data.kind !== 'owned' || data.value.role !== expected.role) continue;
    if (!validateOwnedNode(child, expected.role, projectCode, conflicts)) continue;
    if (match) {
      conflicts.push(conflict('DUPLICATE_OWNED_ROLE',
        `角色 ${expected.role} 存在多个 Scaffold 对象`, child));
    } else {
      match = child;
    }
  }
  return match;
}

function checkSameNameConflict(node, expected, projectCode, conflicts) {
  if (!node || conflicts.some(item => item.objectId === node.id)) return;
  const data = pluginData(node);
  if (data.kind === 'none') {
    conflicts.push(conflict('UNOWNED_NAME_CONFLICT',
      `同名对象 ${expected.name} 没有 Scaffold 归属标记`, node));
  } else if (data.kind === 'owned' && data.value.schemaVersion !== 1) {
    conflicts.push(conflict('MIGRATION_REQUIRED',
      `同名对象 ${expected.name} 使用 Scaffold schemaVersion ${data.value.schemaVersion}，需要迁移计划`,
      node));
  } else if (data.kind === 'owned' &&
      (data.value.projectCode !== projectCode || data.value.role !== expected.role)) {
    conflicts.push(conflict('OWNERSHIP_CONFLICT',
      `同名对象 ${expected.name} 属于项目 ${data.value.projectCode} / ${data.value.role}`, node));
  }
}

function desiredSections(config) {
  const flowSections = config.flows.map(flow => [
    `section:flow:${flow.code}`,
    `${flow.code} · ${flow.name} · WIP`
  ]);
  return PAGE_DEFINITIONS.map(page => ({
    ...page,
    sections: page.role === 'page:product' ? flowSections : page.sections
  }));
}

function pageShape(page) {
  if (!page || page.type !== 'PAGE' || typeof page.id !== 'string' ||
      typeof page.name !== 'string' || !Number.isInteger(page.childCount) ||
      !Array.isArray(page.children)) {
    throw new Error('Scaffold 上下文包含无效 Page');
  }
  return page;
}

function actionForExisting(node, expected, projectCode, objectType, parentRole) {
  if (node.name === expected.name) {
    return {
      action: 'preserve',
      objectType,
      objectId: node.id,
      name: node.name,
      role: expected.role,
      ...(parentRole ? { parentRole } : {})
    };
  }
  return {
    action: 'rename',
    objectType,
    objectId: node.id,
    from: node.name,
    to: expected.name,
    role: expected.role,
    ...(parentRole ? { parentRole } : {}),
    pluginData: owner(projectCode, expected.role)
  };
}

function actionForCreate(expected, projectCode, objectType, parentRole) {
  return {
    action: 'create',
    objectType,
    name: expected.name,
    role: expected.role,
    ...(parentRole ? { parentRole } : {}),
    pluginData: owner(projectCode, expected.role)
  };
}

function planChildren(parentNode, definitions, projectCode, parentRole, actions, conflicts) {
  const children = parentNode?.children || [];
  for (const [role, name, nested = []] of definitions) {
    const expected = { role, name };
    const owned = findOwned(children, expected, projectCode, conflicts);
    const sameName = children.find(child => child.name === name);
    if (!owned && sameName) checkSameNameConflict(sameName, expected, projectCode, conflicts);
    if (owned) {
      actions.push(actionForExisting(owned, expected, projectCode, 'SECTION', parentRole));
      planChildren(owned, nested, projectCode, role, actions, conflicts);
    } else if (!conflicts.some(item => item.objectId === sameName?.id)) {
      actions.push(actionForCreate(expected, projectCode, 'SECTION', parentRole));
      planChildren(null, nested, projectCode, role, actions, conflicts);
    }
  }
}

function planThree(config, pages, options, actions, conflicts, notices) {
  const definitions = desiredSections(config);
  const targets = new Map();

  for (const expected of definitions) {
    const owned = findOwned(pages, expected, config.project.code, conflicts);
    const sameName = pages.find(page => page.name === expected.name);
    if (!owned && sameName) checkSameNameConflict(sameName, expected, config.project.code, conflicts);
    if (owned) targets.set(expected.role, owned);
  }

  if (!targets.has('page:map') && conflicts.length === 0) {
    let adopted = null;
    if (options.adoptPageId) {
      adopted = pages.find(page => page.id === options.adoptPageId);
      if (!adopted) {
        conflicts.push(conflict('UNKNOWN_ADOPT_PAGE',
          `找不到 --adopt-page ${options.adoptPageId}`));
      } else if (pluginData(adopted).kind !== 'none') {
        conflicts.push(conflict('OWNERSHIP_CONFLICT',
          `Page ${adopted.name} 已有 Scaffold 归属，不能接管`, adopted));
      }
    } else {
      const candidate = pages.length === 1 && pages[0].name === 'Page 1' ? pages[0] : null;
      if (candidate?.childCount === 0 && pluginData(candidate).kind === 'none') {
        adopted = candidate;
      } else if (candidate) {
        conflicts.push(conflict('ADOPT_PAGE_REQUIRED',
          `Page 1 含有 ${candidate.childCount} 个顶层节点；请核对后显式使用 --adopt-page ${candidate.id}`,
          candidate));
      } else {
        conflicts.push(conflict('ADOPT_PAGE_REQUIRED',
          '无法自动选择要采用的 Page；请显式使用 --adopt-page <page-id>'));
      }
    }
    if (adopted) {
      targets.set('page:map', adopted);
      if (adopted.childCount > 0) {
        notices.push(`采用 Page ${adopted.id} 时保留 ${adopted.childCount} 个已有顶层节点`);
      } else {
        notices.push(`采用空白 Page ${adopted.id}`);
      }
    }
  }

  const missingPages = definitions.filter(expected => !targets.has(expected.role)).length;
  const resultingPageCount = pages.length + missingPages;
  if (conflicts.length === 0 && resultingPageCount > PAGE_LIMIT) {
    conflicts.push(conflict('STARTER_PAGE_LIMIT',
      `计划结果为 ${resultingPageCount} 个 Page，超过 Starter 约定上限 ${PAGE_LIMIT}`));
  }

  if (conflicts.length === 0) {
    for (const expected of definitions) {
      const existing = targets.get(expected.role);
      if (existing) {
        actions.push(actionForExisting(existing, expected, config.project.code, 'PAGE'));
      } else {
        actions.push(actionForCreate(expected, config.project.code, 'PAGE'));
      }
      planChildren(existing, expected.sections, config.project.code, expected.role, actions, conflicts);
    }
  }
  return resultingPageCount;
}

function planSingle(config, pages, options, actions, conflicts, notices) {
  if (pages.length !== 1) {
    conflicts.push(conflict('SINGLE_PAGE_REQUIRES_ONE_PAGE',
      `single 模式要求文件当前只有 1 个 Page，实际为 ${pages.length}`));
    return pages.length;
  }
  const page = pages[0];
  const expectedPage = { role: 'page:single', name: page.name };
  const data = pluginData(page);
  let existing = null;
  if (data.kind === 'owned') {
    if (validateOwnedNode(page, expectedPage.role, config.project.code, conflicts)) existing = page;
  } else if (data.kind === 'malformed') {
    validateOwnedNode(page, expectedPage.role, config.project.code, conflicts);
  } else if (options.adoptPageId) {
    if (options.adoptPageId !== page.id) {
      conflicts.push(conflict('UNKNOWN_ADOPT_PAGE', `找不到 --adopt-page ${options.adoptPageId}`));
    } else {
      existing = page;
      notices.push(`采用 Page ${page.id} 时保留 ${page.childCount} 个已有顶层节点`);
    }
  } else if (page.name === 'Page 1' && page.childCount === 0) {
    existing = page;
    notices.push(`采用空白 Page ${page.id}`);
  } else {
    conflicts.push(conflict('ADOPT_PAGE_REQUIRED',
      `Page ${page.name} 不是可自动采用的空白 Page 1；请核对后显式使用 --adopt-page ${page.id}`, page));
  }

  if (conflicts.length === 0 && existing) {
    if (data.kind === 'owned') {
      actions.push(actionForExisting(existing, expectedPage, config.project.code, 'PAGE'));
    } else {
      actions.push({
        action: 'adopt',
        objectType: 'PAGE',
        objectId: page.id,
        name: page.name,
        role: expectedPage.role,
        pluginData: owner(config.project.code, expectedPage.role)
      });
    }
    const sections = desiredSections(config);
    const byRole = new Map(sections.map(item => [item.role, item.sections]));
    const boundaries = SINGLE_BOUNDARIES.map(([role, name, pageRole]) => [
      role,
      name,
      byRole.get(pageRole)
    ]);
    planChildren(existing, boundaries, config.project.code, 'page:single', actions, conflicts);
  }
  return 1;
}

function summarize(actions) {
  const summary = {
    create: { pages: 0, sections: 0, frames: 0 },
    rename: { pages: 0, sections: 0, frames: 0 },
    adopt: { pages: 0, sections: 0, frames: 0 },
    preserve: { pages: 0, sections: 0, frames: 0 }
  };
  for (const action of actions) {
    if (!(action.action in summary)) continue;
    const key = action.objectType === 'PAGE' ? 'pages'
      : action.objectType === 'SECTION' ? 'sections' : 'frames';
    summary[action.action][key]++;
  }
  return summary;
}

export function planScaffold(config, inputContext, options = {}) {
  const validated = validateScaffoldConfig(config);
  const mode = options.pageMode || validated.pageMode;
  if (!['three', 'single'].includes(mode)) throw new Error('--page-mode 必须是 three 或 single');
  if (!inputContext || typeof inputContext !== 'object' || !inputContext.source ||
      !Array.isArray(inputContext.pages)) {
    throw new Error('无效 Scaffold 上下文');
  }
  const pages = inputContext.pages.map(pageShape);
  const proposed = [], conflicts = [], notices = [];
  if (inputContext.document) {
    const data = pluginData(inputContext.document);
    if (data.kind === 'malformed') {
      conflicts.push(conflict('MALFORMED_PLUGIN_DATA',
        '文档根节点的 Scaffold Plugin Data 无效', inputContext.document));
    } else if (data.kind === 'owned') {
      validateOwnedNode(inputContext.document, 'document', validated.project.code, conflicts);
    }
  }
  const resultingPageCount = mode === 'three'
    ? planThree(validated, pages, options, proposed, conflicts, notices)
    : planSingle(validated, pages, options, proposed, conflicts, notices);
  const executable = conflicts.length === 0;
  const actions = executable ? proposed : [];
  const mutating = actions.filter(action => action.action !== 'preserve');

  return {
    schemaVersion: 1,
    kind: 'figma-local-cli/scaffold-plan',
    mode,
    executable,
    idempotent: executable && mutating.length === 0,
    applySupported: false,
    source: inputContext.source,
    project: validated.project,
    compatibility: {
      currentPageCount: pages.length,
      resultingPageCount,
      starterPageLimit: PAGE_LIMIT,
      starterCompatible: resultingPageCount <= PAGE_LIMIT
    },
    summary: summarize(actions),
    actions,
    conflicts,
    notices,
    touchesExistingNodes: executable && actions.some(action =>
      ['rename', 'adopt'].includes(action.action))
  };
}
