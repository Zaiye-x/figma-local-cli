type Json = any;

export function plain(value: any): Json {
  if (typeof value === 'symbol') return { mixed: true };
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_key, item) =>
    typeof item === 'symbol' ? { mixed: true } : item));
}

const fields = [
  'x', 'y', 'width', 'height', 'rotation', 'visible', 'locked', 'opacity', 'blendMode',
  'absoluteTransform', 'relativeTransform', 'absoluteBoundingBox', 'absoluteRenderBounds',
  'fills', 'strokes', 'strokeWeight', 'strokeAlign', 'dashPattern',
  'cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius',
  'effects', 'constraints', 'layoutMode', 'layoutWrap', 'layoutSizingHorizontal',
  'layoutSizingVertical', 'primaryAxisSizingMode', 'counterAxisSizingMode',
  'primaryAxisAlignItems', 'counterAxisAlignItems', 'counterAxisAlignContent',
  'itemSpacing', 'counterAxisSpacing', 'paddingTop', 'paddingRight', 'paddingBottom',
  'paddingLeft', 'layoutAlign', 'layoutGrow', 'layoutPositioning', 'minWidth',
  'maxWidth', 'minHeight', 'maxHeight', 'clipsContent', 'layoutGrids',
  'characters', 'fontName', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'textAlignHorizontal', 'textAlignVertical', 'textAutoResize', 'textStyleId',
  'textCase', 'textDecoration', 'paragraphSpacing', 'paragraphIndent',
  'fillStyleId', 'strokeStyleId', 'effectStyleId', 'gridStyleId', 'boundVariables',
  'explicitVariableModes', 'resolvedVariableModes', 'componentPropertyDefinitions',
  'componentProperties', 'componentPropertyReferences', 'variantProperties',
  'key', 'description', 'descriptionMarkdown', 'reactions', 'exportSettings'
];

export async function serialize(roots: readonly BaseNode[], depth = 8, limit = 2000) {
  let count = 0;
  const truncations: Json[] = [], warnings: string[] = [];
  async function visit(node: BaseNode, level: number): Promise<Json> {
    count++;
    const out: Json = { id: node.id, type: node.type, name: node.name };
    for (const key of fields) {
      if (key in node) {
        try { out[key] = plain((node as any)[key]); }
        catch (error) { warnings.push(`${node.id}.${key}: ${String(error)}`); }
      }
    }
    if (node.type === 'TEXT' && node.characters.length) {
      try {
        out.textSegments = plain(node.getStyledTextSegments([
          'fontName', 'fontSize', 'fontWeight', 'textDecoration', 'textCase',
          'lineHeight', 'letterSpacing', 'fills', 'textStyleId', 'fillStyleId'
        ]));
      } catch (error) { warnings.push(`${node.id}.textSegments: ${String(error)}`); }
    }
    if (node.type === 'INSTANCE') {
      try {
        const component = await node.getMainComponentAsync();
        out.mainComponent = component
          ? { id: component.id, key: component.key, name: component.name, remote: component.remote,
              componentSetId: component.parent?.type === 'COMPONENT_SET' ? component.parent.id : null }
          : null;
      } catch (error) { warnings.push(`${node.id}.mainComponent: ${String(error)}`); }
    }
    if ('children' in node) {
      out.childCount = node.children.length;
      out.children = [];
      for (let i = 0; i < node.children.length; i++) {
        if (level >= depth || count >= limit) {
          truncations.push({ nodeId: node.id, reason: level >= depth ? 'depth' : 'node-budget',
            omittedChildren: node.children.length - i });
          break;
        }
        out.children.push(await visit(node.children[i], level + 1));
      }
    }
    return out;
  }
  const nodes = [];
  for (let i = 0; i < roots.length; i++) {
    if (count >= limit) {
      truncations.push({ reason: 'root-budget', omittedRoots: roots.length - i });
      break;
    }
    nodes.push(await visit(roots[i], 0));
  }
  return { nodes, completeness: { truncated: truncations.length > 0, count, depth,
    nodeBudget: limit, truncations, warnings } };
}

export function context(sessionId: string) {
  return { sessionId, fileName: figma.root.name, pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
    selection: figma.currentPage.selection.map(n => ({ id: n.id, name: n.name, type: n.type })) };
}

async function readStyles() {
  const styles: Json[] = [];
  const groups = [
    await figma.getLocalPaintStylesAsync(), await figma.getLocalTextStylesAsync(),
    await figma.getLocalEffectStylesAsync(), await figma.getLocalGridStylesAsync()
  ];
  for (const group of groups) for (const style of group) {
    const out: Json = { id: style.id, key: style.key, name: style.name,
      type: style.type, description: style.description };
    for (const key of ['paints', 'effects', 'layoutGrids', 'fontName', 'fontSize',
      'lineHeight', 'letterSpacing', 'paragraphSpacing', 'textCase', 'textDecoration', 'boundVariables']) {
      if (key in style) out[key] = plain((style as any)[key]);
    }
    styles.push(out);
  }
  return styles;
}

export async function extractAssets(roots: readonly BaseNode[], sessionId: string, depth: number, limit: number) {
  const tree = await serialize(roots, depth, limit);
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  return {
    schemaVersion: 1, capturedAt: new Date().toISOString(), source: context(sessionId),
    scope: { rootIds: roots.map(n => n.id), variableScope: 'all-local-file',
      componentScope: 'selected-subtrees-and-instance-references' },
    ...tree,
    collections: collections.map(c => ({ id: c.id, name: c.name, key: c.key,
      defaultModeId: c.defaultModeId, modes: plain(c.modes), variableIds: c.variableIds,
      hiddenFromPublishing: c.hiddenFromPublishing })),
    variables: variables.map(v => ({ id: v.id, key: v.key, name: v.name,
      variableCollectionId: v.variableCollectionId, resolvedType: v.resolvedType,
      valuesByMode: plain(v.valuesByMode), scopes: plain(v.scopes),
      description: v.description, codeSyntax: plain(v.codeSyntax),
      hiddenFromPublishing: v.hiddenFromPublishing })),
    styles: await readStyles()
  };
}
