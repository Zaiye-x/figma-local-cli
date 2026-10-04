import { context, extractAssets, plain, serialize } from './serialize';
import { readScaffoldContext } from './scaffold';

const UI_WIDTH = 380;
const UI_EXPANDED_HEIGHT = 500;
const UI_COLLAPSED_HEIGHT = 104;
const sessionId = `plugin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
let running = false;
const executed = new Set<string>();
figma.showUI(__html__, { width: UI_WIDTH, height: UI_EXPANDED_HEIGHT, themeColors: true });
const postContext = () => figma.ui.postMessage({ type: 'context', meta: context(sessionId) });
figma.on('currentpagechange', postContext);
figma.on('selectionchange', postContext);

function integer(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new Error(`整数范围须为 1–${max}`);
  }
  return value as number;
}

async function nodeInPage(id: string) {
  const node = await figma.getNodeByIdAsync(id);
  if (!node) throw new Error(`找不到节点 ${id}`);
  let ancestor: BaseNode | null = node;
  while (ancestor && ancestor.type !== 'PAGE') ancestor = ancestor.parent;
  if (ancestor?.id !== figma.currentPage.id) throw new Error('节点不在绑定的当前页面');
  return node;
}

async function execute(job: any) {
  if (job.target.sessionId !== sessionId || job.target.pageId !== figma.currentPage.id) {
    throw new Error('执行前目标会话或页面改变，未执行。请重新 bind。');
  }
  const args = job.args || {};
  if (job.operation === 'eval') {
    if (typeof args.script !== 'string' || args.script.length > 500000) throw new Error('无效脚本或脚本过大');
    // Trusted local code, not a sandbox. The Plugin API controls the real document.
    const run = new Function('figma', 'context', `return (async () => {\n${args.script}\n})()`);
    const result = await run(figma, { ...context(sessionId), jobId: job.id });
    return plain(result === undefined ? null : result);
  }
  if (job.operation === 'screenshot') {
    const node = await nodeInPage(args.nodeId);
    if (!('exportAsync' in node)) throw new Error('节点不支持导出，请选择 Frame 或其他画布节点');
    const format = args.format ?? 'PNG';
    if (!['PNG', 'SVG'].includes(format)) throw new Error('仅支持 PNG / SVG');
    const scale = args.scale ?? 1;
    if (typeof scale !== 'number' || scale <= 0 || scale > 4) throw new Error('scale 范围 (0,4]');
    const settings: ExportSettings = format === 'SVG' ? { format: 'SVG' }
      : { format: 'PNG', constraint: { type: 'SCALE', value: scale } };
    const data = await node.exportAsync(settings);
    if (data.length > 14 * 1024 * 1024) throw new Error('导出超过 14MB，请降低 scale 或缩小节点');
    return { nodeId: node.id, name: node.name, format, base64: figma.base64Encode(data) };
  }
  if (job.operation === 'scaffold-plan-context') {
    return readScaffoldContext(context(sessionId));
  }
  const depth = integer(args.depth, 8, 30), limit = integer(args.limit, 2000, 10000);
  const roots: BaseNode[] = args.nodeId ? [await nodeInPage(args.nodeId)]
    : figma.currentPage.selection.length ? [...figma.currentPage.selection] : [figma.currentPage];
  if (job.operation === 'inspect') return { source: context(sessionId), ...await serialize(roots, depth, limit) };
  if (job.operation === 'extract') return extractAssets(roots, sessionId, depth, limit);
  throw new Error('未知操作');
}

figma.ui.onmessage = async message => {
  if (message.type === 'ui-resize') {
    figma.ui.resize(UI_WIDTH, message.collapsed === true ? UI_COLLAPSED_HEIGHT : UI_EXPANDED_HEIGHT);
    return;
  }
  if (message.type === 'context-request') return postContext();
  if (message.type !== 'job') return;
  const job = message.job;
  if (running || executed.has(job.id)) {
    figma.ui.postMessage({ type: 'result', jobId: job.id, status: 'failed',
      error: '插件繁忙或任务已执行；拒绝重复写入。' });
    return;
  }
  executed.add(job.id);
  running = true;
  try {
    const result = await execute(job);
    figma.ui.postMessage({ type: 'result', jobId: job.id, status: 'succeeded', result });
  } catch (error) {
    figma.ui.postMessage({ type: 'result', jobId: job.id, status: 'failed',
      error: `${String(error)}${job.operation === 'eval' ? '；脚本可能已产生局部修改，请检查画布后再决定下一步。' : ''}` });
  } finally {
    running = false;
    postContext();
  }
};
