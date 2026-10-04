const PLUGIN_DATA_KEY = 'figma-local-cli.scaffold';

function summarize(node: BaseNode, depth: number): any {
  const result: any = {
    id: node.id,
    type: node.type,
    name: node.name,
    pluginData: node.getPluginData(PLUGIN_DATA_KEY)
  };
  if ('children' in node) {
    result.childCount = node.children.length;
    result.children = depth > 0
      ? node.children.map(child => summarize(child, depth - 1))
      : [];
  }
  return result;
}

export async function readScaffoldContext(source: ReturnType<typeof import('./serialize').context>) {
  const pages = figma.root.children.filter((node): node is PageNode => node.type === 'PAGE');
  await Promise.all(pages.map(page => page.loadAsync()));
  return {
    source,
    document: {
      id: figma.root.id,
      type: figma.root.type,
      name: figma.root.name,
      pluginData: figma.root.getPluginData(PLUGIN_DATA_KEY)
    },
    pages: pages.map(page => summarize(page, 2))
  };
}
