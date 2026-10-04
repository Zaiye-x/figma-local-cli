import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename, rm, lstat } from 'node:fs/promises';
import path from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 12);
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'token';
const typeMap = { COLOR: 'color', FLOAT: 'number' };
const json = value => JSON.stringify(value, null, 2) + '\n';
const isAlias = value => value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS';

export function compileTokens(snapshot) {
  const collections = new Map(snapshot.collections.map(c => [c.id, c]));
  const variables = new Map(snapshot.variables.map(v => [v.id, v]));
  const paths = new Map(snapshot.variables.map(v => {
    const c = collections.get(v.variableCollectionId);
    if (!c) throw new Error(`变量 ${v.id} 缺少 collection`);
    return [v.id, [`c_${slug(c.name)}_${hash(c.id)}`, `t_${slug(v.name)}_${hash(v.id)}`]];
  }));
  const index = [], warnings = [], files = {};
  const tokenPath = (id, modeId) => [paths.get(id)[0], `m_${hash(modeId)}`, paths.get(id)[1]];
  const cssName = id => '--' + paths.get(id).join('--').replaceAll('_', '-');
  function resolve(v, modeId, stack = []) {
    const key = `${v.id}@${modeId}`;
    if (stack.includes(key)) throw new Error(`变量别名循环: ${[...stack, key].join(' → ')}`);
    const value = v.valuesByMode[modeId];
    if (value === undefined) throw new Error(`变量 ${v.name} 缺少模式值 ${modeId}`);
    if (isAlias(value)) {
      const target = variables.get(value.id);
      if (!target) throw new Error(`变量 ${v.name} 引用未提取的变量 ${value.id}；请导入依赖后再提取`);
      if (target.resolvedType !== v.resolvedType) throw new Error(`变量 ${v.name} 别名类型不一致`);
      const collection = collections.get(target.variableCollectionId);
      const targetMode = v.variableCollectionId === target.variableCollectionId ? modeId : collection.defaultModeId;
      const resolved = resolve(target, targetMode, [...stack, key]);
      return { ...resolved, alias: target.id, targetMode };
    }
    if (!typeMap[v.resolvedType]) return { supported: false };
    if (v.resolvedType === 'COLOR') {
      if (!value || !['r', 'g', 'b'].every(k => Number.isFinite(value[k]) && value[k] >= 0 && value[k] <= 1) ||
          (value.a !== undefined && (!Number.isFinite(value.a) || value.a < 0 || value.a > 1))) {
        throw new Error(`无效颜色 ${v.name}`);
      }
      return { supported: true, literal: {
        colorSpace: 'srgb', components: [value.r, value.g, value.b], alpha: value.a ?? 1
      } };
    }
    if (!Number.isFinite(value)) throw new Error(`无效数值 ${v.name}`);
    return { supported: true, literal: value };
  }
  const css = [':root {'];
  for (const c of snapshot.collections) {
    for (const mode of c.modes) {
      const group = {}, dependencies = new Map();
      for (const v of snapshot.variables.filter(v => v.variableCollectionId === c.id)) {
        const resolved = resolve(v, mode.modeId);
        const [groupKey, modeKey, tokenKey] = tokenPath(v.id, mode.modeId);
        const entry = { variableId: v.id, key: v.key, name: v.name, collectionId: c.id,
          collectionName: c.name, modeId: mode.modeId, modeName: mode.name,
          tokenPath: tokenPath(v.id, mode.modeId).join('.'), cssName: cssName(v.id),
          type: v.resolvedType, status: resolved.supported ? 'supported' : 'raw-only',
          originalValue: v.valuesByMode[mode.modeId] };
        index.push(entry);
        if (!resolved.supported) {
          warnings.push(`${v.name} (${v.resolvedType}) 原样保存在快照与索引，不输出为 DTCG token。`);
          continue;
        }
        group[groupKey] ||= {};
        group[groupKey][modeKey] ||= {};
        if (group[groupKey][modeKey][tokenKey]) throw new Error(`Token 名称冲突: ${entry.tokenPath}`);
        const aliasPath = resolved.alias && tokenPath(resolved.alias, resolved.targetMode).join('.');
        group[groupKey][modeKey][tokenKey] = {
          $type: typeMap[v.resolvedType],
          $value: resolved.alias ? `{${aliasPath}}` : resolved.literal,
          ...(v.description ? { $description: v.description } : {}),
          $extensions: { 'figma-local': { variableId: v.id, collectionId: c.id, modeId: mode.modeId } }
        };
        if (resolved.alias) {
          const target = variables.get(resolved.alias);
          dependencies.set(target.variableCollectionId, resolved.targetMode);
          entry.alias = { variableId: target.id, modeId: resolved.targetMode };
        }
        if (mode.modeId === c.defaultModeId) {
          let value;
          if (resolved.alias) value = `var(${cssName(resolved.alias)})`;
          else if (v.resolvedType === 'COLOR') {
            const { components, alpha } = resolved.literal;
            value = `rgb(${components.map(n => Number((n * 255).toFixed(4))).join(' ')} / ${alpha})`;
          } else value = String(resolved.literal);
          css.push(`  ${cssName(v.id)}: ${value};`);
        }
      }
      const filename = `${slug(c.name)}-${hash(c.id)}.${slug(mode.name)}-${hash(mode.modeId)}.tokens.json`;
      files[filename] = {
        $extensions: { 'figma-local': { collectionId: c.id, modeId: mode.modeId,
          dependencyModes: Object.fromEntries(dependencies) } }, ...group
      };
      index.filter(i => i.collectionId === c.id && i.modeId === mode.modeId).forEach(i => { i.file = filename; });
    }
  }
  css.push('}', '');
  return { files, css: css.join('\n'), index, warnings: [...new Set(warnings)] };
}

function walk(nodes, callback) {
  for (const node of nodes || []) { callback(node); walk(node.children, callback); }
}

export function collectComponents(snapshot) {
  const entries = new Map();
  walk(snapshot.nodes, node => {
    if (['COMPONENT', 'COMPONENT_SET'].includes(node.type)) {
      const old = entries.get(node.id);
      entries.set(node.id, { ...old, referenceOnly: false, id: node.id, key: node.key, name: node.name, type: node.type,
        variantProperties: node.variantProperties, properties: node.componentPropertyDefinitions,
        status: 'unmapped', code: null, instanceIds: old?.instanceIds || [] });
    }
    if (node.type === 'INSTANCE' && node.mainComponent) {
      const component = node.mainComponent;
      if (!entries.has(component.id)) entries.set(component.id, { ...component, type: 'COMPONENT',
        status: 'unmapped', code: null, referenceOnly: true, instanceIds: [] });
      entries.get(component.id).instanceIds.push(node.id);
    }
  });
  return [...entries.values()];
}

export function collectCandidates(snapshot) {
  const entries = new Map();
  function record(node, property, value) {
    if (value === undefined || value?.mixed) return;
    const key = `${property}:${JSON.stringify(value)}`;
    if (!entries.has(key)) entries.set(key, { property, value, count: 0, nodeIds: [], status: 'needs-review' });
    const item = entries.get(key);
    item.count++;
    if (item.nodeIds.length < 50) item.nodeIds.push(node.id);
  }
  walk(snapshot.nodes, node => {
    for (const key of ['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'cornerRadius', 'fontSize', 'lineHeight', 'letterSpacing', 'effects']) {
      if (!node.boundVariables?.[key]) record(node, key, node[key]);
    }
    for (const paint of Array.isArray(node.fills) ? node.fills : []) {
      if (paint.type === 'SOLID' && !paint.boundVariables?.color) {
        record(node, 'fill', { ...paint.color, a: paint.opacity ?? 1 });
      }
    }
  });
  return [...entries.values()].sort((a, b) => b.count - a.count);
}

export async function writeAssets(outDir, snapshot, previews = []) {
  const out = path.resolve(outDir);
  try { await lstat(out); throw new Error(`输出已存在，拒绝覆盖: ${out}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const tokens = compileTokens(snapshot), components = collectComponents(snapshot);
  await mkdir(path.dirname(out), { recursive: true });
  const staging = `${out}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(staging, { recursive: false });
  try {
    await mkdir(path.join(staging, 'tokens'));
    const save = (file, value) => writeFile(path.join(staging, file), json(value), { flag: 'wx' });
    await save('snapshot.json', snapshot);
    await save('token-index.json', { schemaVersion: 1, warnings: tokens.warnings, tokens: tokens.index });
    for (const [file, data] of Object.entries(tokens.files)) await save(`tokens/${file}`, data);
    await writeFile(path.join(staging, 'tokens.css'), tokens.css, { flag: 'wx' });
    await save('candidates.json', collectCandidates(snapshot));
    await save('component-map.json', { scope: snapshot.scope, components });
    if (previews.length) {
      await mkdir(path.join(staging, 'previews'));
      const previewIndex = [];
      for (const preview of previews) {
        const file = `${hash(preview.nodeId)}.${preview.format.toLowerCase()}`;
        await writeFile(path.join(staging, 'previews', file), Buffer.from(preview.base64, 'base64'), { flag: 'wx' });
        previewIndex.push({ nodeId: preview.nodeId, name: preview.name, file });
      }
      await save('previews/index.json', previewIndex);
    }
    await writeFile(path.join(staging, 'design.md'), [
      '# 设计资产提取记录', '',
      `来源：${snapshot.source.fileName} / ${snapshot.source.pageName} (${snapshot.source.pageId})`,
      `采集：${snapshot.capturedAt}`, '',
      `结构节点：${snapshot.completeness.count}；截断：${snapshot.completeness.truncated ? '**是，请分块重提取**' : '否'}。`,
      `变量：${snapshot.variables.length}；本地样式：${snapshot.styles.length}；组件/组件引用：${components.length}。`, '',
      '## 待确认的规范', '',
      '- 确认哪些画框已批准，补齐桌面、移动端与加载/空/错误状态。',
      '- 审核 candidates.json 的数值频次，结合用途命名语义 token。',
      '- FLOAT 保持 number；尺寸需要明确单位后再转成 dimension，CSS 使用时可乘 1px。',
      '- Token 路径含模式命名空间；按 token-index.json 合并所需模式及依赖文件，不要删除模式层。',
      '- 跨 collection 别名明确指向目标的默认模式；CSS 仅导出各 collection 默认模式。',
      '- STRING/BOOLEAN 不在标准 token 子集内，保留原值；不要当作已丢弃。',
      '- 在 component-map.json 补充代码路径和导出名；当前均为 unmapped。',
      '- snapshot.json 保留本地样式与原型 reactions；不推断业务逻辑。', '',
      ...tokens.warnings.map(w => `- ${w}`), ''
    ].join('\n'));
    await writeFile(path.join(staging, 'HANDOFF.md'), [
      '# 前端 Agent 交接入口', '',
      '先读 design.md、snapshot.json 的 source/scope/completeness，再读 token-index.json 和 component-map.json。',
      '本目录是设计读回资料；语义规范、代码映射和视觉认可状态仍需按 design.md 审核。', '',
      '1. 选定已认可的画框，核对 previews 与节点结构；截断时先分块重新提取。',
      '2. 复用变量别名、Auto Layout、文本分段和已有代码组件；不要机械地绝对定位所有图层。',
      '3. 补充响应式规则、键盘焦点、可访问名称与状态行为。',
      '4. 在浏览器运行并截图，对照 Figma；没有运行证据不得声称通过验收。',
      '5. 后续提取写入新目录，通过 diff 审核，再更新规范与映射；不要覆盖人工补充的资产。', '',
      previews.length ? `真实导出预览：${previews.length} 张，索引见 previews/index.json。`
        : '本包没有预览；用 screenshot 导出目标画框后再做视觉对照。', ''
    ].join('\n'));
    await rename(staging, out);
    return { out, nodes: snapshot.completeness.count, truncated: snapshot.completeness.truncated,
      variables: snapshot.variables.length, components: components.length, previews: previews.length,
      warnings: tokens.warnings };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
