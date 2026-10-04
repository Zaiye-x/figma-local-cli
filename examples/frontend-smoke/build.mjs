// Narrow reference implementation for examples/smoke.js, not a general Figma-to-code compiler.
import { readFile, mkdir, writeFile, copyFile, lstat } from 'node:fs/promises';
import path from 'node:path';

const [assetDir, outputDir] = process.argv.slice(2);
if (!assetDir || !outputDir) throw new Error('Usage: node examples/frontend-smoke/build.mjs <handoff-dir> <new-output-dir>');
const source = path.resolve(assetDir), out = path.resolve(outputDir);
try { await lstat(out); throw new Error('Output already exists; choose a new directory.'); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
const read = name => readFile(path.join(source, name), 'utf8');
await read('HANDOFF.md');
const snapshot = JSON.parse(await read('snapshot.json'));
const index = JSON.parse(await read('token-index.json'));
const mapping = JSON.parse(await read('component-map.json'));
if (snapshot.completeness.truncated || snapshot.completeness.warnings.length) {
  throw new Error('Resolve incomplete design data before building the sample.');
}
const start = snapshot.nodes.find(n => n.name === '01 · Start');
const complete = snapshot.nodes.find(n => n.name === '02 · Complete');
const instance = start?.children?.find(n => n.type === 'INSTANCE');
const destination = instance?.reactions?.[0]?.actions?.[0]?.destinationId;
if (!start || !complete || destination !== complete.id) throw new Error('Expected the two-screen CLI smoke flow.');
const component = mapping.components.find(c => c.id === instance.mainComponent.id);
if (!component) throw new Error('Button component reference is missing.');
const entries = Array.isArray(index) ? index : index.tokens;
const action = entries.find(t => t.variableId === instance.boundVariables.fills[0].id);
const spacing = entries.find(t => t.variableId === start.boundVariables.paddingLeft.id);
if (!action?.cssName || !spacing?.cssName) throw new Error('Expected exported CSS variable mappings.');
const escape = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rgb = paint => {
  if (paint?.type !== 'SOLID') throw new Error('The smoke sample expects solid paints.');
  const { r, g, b } = paint.color;
  return `rgb(${r * 255} ${g * 255} ${b * 255} / ${paint.opacity ?? 1})`;
};
const primaryButton = node => `<a class="primary-button" data-component-id="${escape(component.id)}"
  data-node-id="${escape(node.id)}" href="#complete">${escape(node.children[0].characters)}</a>`;
const screen = (node, state) => {
  const [heading, body] = node.children;
  return `<section class="screen" id="${state}" data-node-id="${escape(node.id)}" ${state === 'complete' ? 'hidden' : ''}>
    <h1 tabindex="-1">${escape(heading.characters)}</h1>
    <p>${escape(body.characters)}</p>
    ${state === 'start' ? primaryButton(instance) : ''}
  </section>`;
};
const [heading, body] = start.children;
const buttonText = instance.children[0];
const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Figma → Web · CLI smoke</title>
<link rel="stylesheet" href="tokens.css">
<style>
@font-face{font-family:Inter;src:url("InterVariable.woff2") format("woff2");font-weight:100 900;font-display:swap}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#f5f5f5;font-family:Inter,system-ui,sans-serif}
.screen{width:min(${start.width}px,100%);min-height:${start.height}px;background:${rgb(start.fills[0])};
border-radius:${start.cornerRadius}px;padding:${start.paddingTop}px ${start.paddingRight}px ${start.paddingBottom}px calc(var(${spacing.cssName}) * 1px);
display:flex;flex-direction:column;align-items:flex-start;gap:${start.itemSpacing}px}
[hidden]{display:none!important}
h1,p{margin:0;max-width:100%;overflow-wrap:break-word}
h1{font-size:${heading.fontSize}px;line-height:${heading.height}px;font-weight:${heading.fontWeight};outline:none}
p{font-size:${body.fontSize}px;line-height:${body.height}px;font-weight:${body.fontWeight}}
.primary-button{display:inline-flex;align-items:center;justify-content:center;padding:${instance.paddingTop}px ${instance.paddingRight}px;
border-radius:${instance.cornerRadius}px;background:var(${action.cssName});color:${rgb(buttonText.fills[0])};
font-size:${buttonText.fontSize}px;line-height:${buttonText.height}px;font-weight:${buttonText.fontWeight};text-decoration:none}
.primary-button:focus-visible{outline:3px solid #111;outline-offset:4px}
.primary-button:hover{filter:brightness(.94)}.primary-button:active{transform:translateY(1px)}
@media(pointer:coarse){.primary-button{min-height:44px}}
@media(max-width:359px){.screen{border-radius:0}}
</style></head><body>
${screen(start, 'start')}
${screen(complete, 'complete')}
<script>
function show(focus) {
  const state = location.hash === '#complete' ? 'complete' : 'start';
  document.querySelectorAll('.screen').forEach(node => { node.hidden = node.id !== state; });
  if (focus) document.querySelector('#' + state + ' h1').focus();
}
window.addEventListener('hashchange', () => show(true));
show(false);
</script></body></html>`;
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'index.html'), document, { flag: 'wx' });
await copyFile(path.join(source, 'tokens.css'), path.join(out, 'tokens.css'));
component.status = 'mapped-local-example';
component.code = { file: 'index.html', export: 'primaryButton (build.mjs)', framework: 'HTML',
  usage: 'CLI smoke only; ON_CLICK → hash navigation; native link, visible keyboard focus.',
  officialCodeConnect: false };
await writeFile(path.join(out, 'component-map.json'), JSON.stringify(mapping, null, 2) + '\n');
await writeFile(path.join(out, 'source.json'), JSON.stringify({
  purpose: 'CLI smoke feasibility demonstration; not approved business UI',
  handoff: source, capturedAt: snapshot.capturedAt, source: snapshot.source,
  frameIds: [start.id, complete.id], instanceId: instance.id
}, null, 2) + '\n');
console.log(JSON.stringify({ out, source, frameIds: [start.id, complete.id],
  next: 'Copy InterVariable.woff2 and its OFL license here, then serve the output directory.' }, null, 2));
