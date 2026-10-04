import path from 'node:path';

export function resolveStateDir(root, explicit, env = process.env) {
  return path.resolve(explicit || env.FIGMA_LOCAL_STATE || path.join(root, '.figma-local'));
}
