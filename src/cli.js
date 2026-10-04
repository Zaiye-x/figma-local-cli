#!/usr/bin/env node
import { readFile, writeFile, mkdir, chmod, unlink, access, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createBridge } from './bridge.js';
import { client } from './client.js';
import { writeAssets } from './assets.js';
import { resolveStateDir } from './state.js';
import { planScaffold, validateScaffoldConfig } from './scaffold.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const print = value => console.log(JSON.stringify(value, null, 2));
const usage = `Figma Local CLI · 0.2.0
  serve                         启动本地服务（保持终端运行）
  pair --copy                   将连接码复制到剪贴板
  doctor                        检查构建产物、Figma 和连接
  sessions                      查看插件会话
  bind <session-id>             绑定会话与当前页面
  inspect [node-id]              读取结构
  scaffold --config FILE        生成项目骨架计划（默认只生成计划）
  eval <script.js>               执行可信 Plugin API 脚本
  screenshot <node-id> --out X   导出 PNG（--format SVG --scale 1）
  extract --out DIR             导出候选设计资产
  handoff --out DIR             导出资产与画框预览
  job <id>                      查询任务，不重放
通用参数：--state DIR；读取参数：--node ID --depth 8 --limit 2000
scaffold：--page-mode three|single --adopt-page ID；第一阶段不支持 --apply
执行参数：--timeout 60（秒，最多300）；handoff：--max-previews 6
默认状态目录为 CLI 源码仓库的 .figma-local；可用 --state 或 FIGMA_LOCAL_STATE 覆盖。
输出目录/文件必须不存在。`;

function parse(args) {
  const options = {}, positionals = [];
  const booleans = new Set(['copy', 'help', 'apply']);
  const valued = new Set(['state', 'out', 'node', 'depth', 'limit', 'timeout', 'format', 'scale',
    'max-previews', 'config', 'page-mode', 'adopt-page']);
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { positionals.push(args[i]); continue; }
    const key = args[i].slice(2);
    if (booleans.has(key)) options[key] = true;
    else if (valued.has(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key] = args[++i];
    else throw new Error(`未知或缺值参数 ${args[i]}`);
  }
  return { options, positionals };
}
function number(value, fallback, max) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new Error(`数值须大于0且不超过 ${max}`);
  return n;
}
async function absent(out) {
  if (!out) throw new Error('请指定 --out');
  try { await lstat(out); }
  catch (e) { if (e.code === 'ENOENT') return; throw e; }
  throw new Error(`输出已存在，拒绝覆盖: ${out}`);
}

async function main() {
  const { options: o, positionals: [command, arg] } = parse(process.argv.slice(2));
  const stateDir = resolveStateDir(root, o.state);
  if (!command || command === 'help' || o.help) return console.log(usage);
  if (command === 'serve') {
    const bridge = await createBridge();
    try {
      await mkdir(stateDir, { recursive: true, mode: 0o700 });
      await chmod(stateDir, 0o700);
      const sessionFile = path.join(stateDir, 'session.json');
      try {
        const stat = await lstat(sessionFile);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('会话文件不是普通文件');
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
      await writeFile(sessionFile, JSON.stringify(bridge.credentials), { mode: 0o600 });
      await chmod(sessionFile, 0o600);
    } catch (error) { await bridge.close(); throw error; }
    console.log('Figma Local CLI 服务已启动 http://127.0.0.1:3055\n下一步：pair --copy → Figma 开发插件粘贴 → sessions → bind');
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      await bridge.close();
      try {
        const file = path.join(stateDir, 'session.json');
        const current = JSON.parse(await readFile(file, 'utf8'));
        if (current.instanceId === bridge.credentials.instanceId) await unlink(file);
      } catch {}
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    return;
  }
  if (command === 'doctor') {
    const exists = async file => { try { await access(file); return true; } catch { return false; } };
    const report = { node: process.version, manifest: path.join(root, 'dist/plugin/manifest.json'),
      pluginBuilt: await exists(path.join(root, 'dist/plugin/main.js')),
      figmaInCommonPaths: await exists('/Applications/Figma.app') ||
        await exists(path.join(process.env.HOME || '', 'Applications/Figma.app')),
      bridge: false, verificationRecord: path.join(root, 'docs/verification.md') };
    try {
      const c = await client(stateDir), status = await c.request('/status');
      Object.assign(report, { bridge: true, binding: status.binding, sessions: status.sessions });
    } catch (error) { report.nextStep = error.message; }
    report.verificationNote = 'doctor 只检查当前环境与连接。真实创建/读回/截图的验收证据见 verificationRecord；不自动推断当前文件已验收。';
    return print(report);
  }
  if (command === 'scaffold') {
    if (!o.config) throw new Error('请指定 --config');
    if (o.apply) throw new Error('Scaffold 第一阶段仅支持计划，不支持 --apply，也不会写入 Figma。');
    let raw;
    try { raw = JSON.parse(await readFile(path.resolve(o.config), 'utf8')); }
    catch (error) { throw new Error(`无法读取 Scaffold 配置: ${error.message}`); }
    const config = validateScaffoldConfig(raw);
    if (o['page-mode'] && !['three', 'single'].includes(o['page-mode'])) {
      throw new Error('--page-mode 必须是 three 或 single');
    }
    const timeout = number(o.timeout, 60, 300) * 1000;
    const c = await client(stateDir);
    const scaffoldContext = await c.run('scaffold-plan-context', {}, timeout);
    const plan = planScaffold(config, scaffoldContext, {
      pageMode: o['page-mode'],
      adoptPageId: o['adopt-page']
    });
    print(plan);
    if (!plan.executable) process.exitCode = 2;
    return;
  }
  const c = await client(stateDir);
  if (command === 'pair') {
    if (!o.copy) throw new Error('请使用 pair --copy；连接码不会打印到日志。');
    const status = await c.request('/status');
    if (status.instanceId !== c.instanceId) throw new Error('服务实例改变，请重启配对');
    const { pluginToken: token, instanceId } = c.credentials;
    const url = 'http://localhost:3055';
    const code = JSON.stringify({ version: 1, url, token, instanceId });
    const result = spawnSync('pbcopy', [], { input: code, encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error('pbcopy 失败；当前配对命令仅支持 macOS');
    return console.log('连接码已复制。请粘贴到 Figma Local CLI 开发插件。');
  }
  if (command === 'sessions') {
    const status = await c.request('/status');
    return print({ binding: status.binding, sessions: status.sessions });
  }
  if (command === 'bind') {
    if (!arg) throw new Error('缺少 session-id');
    return print(await c.request('/bind', { sessionId: arg }));
  }
  if (command === 'job') {
    if (!arg) throw new Error('缺少 job ID');
    return print(await c.request(`/jobs/${encodeURIComponent(arg)}`));
  }
  const timeout = number(o.timeout, 60, 300) * 1000;
  if (command === 'eval') {
    if (!arg) throw new Error('缺少本地脚本路径');
    return print(await c.run('eval', { script: await readFile(path.resolve(arg), 'utf8') }, timeout));
  }
  if (command === 'screenshot') {
    if (!arg) throw new Error('缺少 node-id');
    await absent(o.out);
    const result = await c.run('screenshot', { nodeId: arg, format: (o.format || 'PNG').toUpperCase(),
      scale: number(o.scale, 1, 4) }, timeout);
    await mkdir(path.dirname(path.resolve(o.out)), { recursive: true });
    await writeFile(o.out, Buffer.from(result.base64, 'base64'), { flag: 'wx' });
    return print({ out: path.resolve(o.out), nodeId: result.nodeId, format: result.format });
  }
  const args = { nodeId: o.node || arg, depth: number(o.depth, 8, 30), limit: number(o.limit, 2000, 10000) };
  if (command === 'inspect') return print(await c.run('inspect', args, timeout));
  if (command === 'extract' || command === 'handoff') {
    await absent(o.out);
    const snapshot = await c.run('extract', args, timeout), previews = [];
    if (command === 'handoff') {
      const max = number(o['max-previews'], 6, 30);
      const roots = snapshot.nodes.flatMap(n => n.type === 'PAGE' ? n.children || [] : [n]);
      for (const node of roots.filter(n => ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'].includes(n.type)).slice(0, max)) {
        previews.push(await c.run('screenshot', { nodeId: node.id, format: 'PNG', scale: 1 }, timeout));
      }
    }
    return print(await writeAssets(o.out, snapshot, previews));
  }
  throw new Error(`未知命令 ${command}\n${usage}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
