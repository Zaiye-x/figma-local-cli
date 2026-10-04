import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';

await mkdir('dist/plugin', { recursive: true });
await build({ entryPoints: ['plugin/main.ts'], outfile: 'dist/plugin/main.js',
  bundle: true, target: 'es2017', format: 'iife' });
await copyFile('plugin/ui.html', 'dist/plugin/ui.html');
await writeFile('dist/plugin/manifest.json', JSON.stringify({
  name: 'Figma Local CLI',
  id: 'figma-local-cli-dev',
  api: '1.0.0',
  main: 'main.js',
  ui: 'ui.html',
  editorType: ['figma'],
  documentAccess: 'dynamic-page',
  networkAccess: {
    allowedDomains: ['none'],
    devAllowedDomains: ['http://localhost:3055']
  }
}, null, 2) + '\n');
console.log('Built dist/plugin/manifest.json');
