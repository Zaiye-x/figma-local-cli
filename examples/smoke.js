// Executed by: node src/cli.js eval examples/smoke.js
// Only creates new objects; does not delete or modify existing designs.
// Each explicit invocation creates a new sample. Do not blindly retry a timeout.
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
const suffix = context.jobId.slice(0, 8);
const collection = figma.variables.createVariableCollection(`CLI Smoke ${suffix}`);
const color = figma.variables.createVariable('color/action', collection, 'COLOR');
color.setValueForMode(collection.defaultModeId, { r: 0.08, g: 0.38, b: 0.92, a: 1 });
const space = figma.variables.createVariable('space/content', collection, 'FLOAT');
space.setValueForMode(collection.defaultModeId, 24);

function text(value, size = 16, weight = 'Regular') {
  const node = figma.createText();
  node.fontName = { family: 'Inter', style: weight };
  node.fontSize = size;
  node.characters = value;
  return node;
}
function frame(name, x) {
  const node = figma.createFrame();
  node.name = name;
  node.resize(360, 420);
  node.x = x; node.y = 0;
  node.layoutMode = 'VERTICAL';
  node.primaryAxisSizingMode = 'FIXED';
  node.counterAxisSizingMode = 'FIXED';
  node.itemSpacing = 20;
  node.paddingTop = node.paddingRight = node.paddingBottom = node.paddingLeft = 24;
  node.setBoundVariable('paddingLeft', space);
  node.cornerRadius = 16;
  node.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.98, b: 1 } }];
  return node;
}
const board = figma.createSection();
board.name = `CLI Smoke · ${suffix}`;
board.x = Math.round(figma.viewport.center.x);
board.y = Math.round(figma.viewport.center.y);
const first = frame('01 · Start', 24);
const second = frame('02 · Complete', 408);
board.appendChild(first); board.appendChild(second);
first.y = second.y = 64;
first.appendChild(text('Local Agent → Figma', 26, 'Semi Bold'));
first.appendChild(text('Native layers. Reusable assets.'));
second.appendChild(text('Ready for handoff', 26, 'Semi Bold'));
second.appendChild(text('Inspect structure and export tokens.'));
const button = figma.createComponent();
button.name = `Button / Primary · ${suffix}`;
button.layoutMode = 'HORIZONTAL';
button.primaryAxisSizingMode = 'AUTO';
button.counterAxisSizingMode = 'AUTO';
button.paddingLeft = button.paddingRight = 20;
button.paddingTop = button.paddingBottom = 12;
button.cornerRadius = 8;
button.fills = [figma.variables.setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 0.08, g: 0.38, b: 0.92 } }, 'color', color)];
const label = text('Continue', 15, 'Semi Bold');
label.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
button.appendChild(label);
board.appendChild(button);
button.x = 24; button.y = 520;
const instance = button.createInstance();
first.appendChild(instance);
await instance.setReactionsAsync([{
  trigger: { type: 'ON_CLICK' },
  actions: [{ type: 'NODE', destinationId: second.id, navigation: 'NAVIGATE',
    transition: null, preserveScrollPosition: false }]
}]);
board.resizeWithoutConstraints(792, 640);
figma.currentPage.selection = [first, second, button];
figma.viewport.scrollAndZoomIntoView([board]);
return { sectionId: board.id, frameIds: [first.id, second.id], componentId: button.id,
  instanceId: instance.id, collectionId: collection.id, variableIds: [color.id, space.id] };
