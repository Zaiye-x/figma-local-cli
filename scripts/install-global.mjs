import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'skills', 'figma-local-cli');
const globalRoot = path.resolve(process.env.TRAE_GLOBAL_SKILLS_DIR ||
  path.join(homedir(), '.trae-cn', 'skills'));
const destination = path.join(globalRoot, 'figma-local-cli');
const legacyDestination = path.join(globalRoot, 'figma-local');

async function exists(target) {
  try { await lstat(target); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function manifest(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await manifest(absolute, relative));
    else if (entry.isFile()) {
      const data = await readFile(absolute);
      result.push({ path: relative, sha256: createHash('sha256').update(data).digest('hex') });
    } else throw new Error(`Skill 包含不支持的文件类型: ${relative}`);
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

const skill = await readFile(path.join(source, 'SKILL.md'), 'utf8');
const frontmatter = skill.match(/^---\n([\s\S]+?)\n---\n([\s\S]+)$/);
if (!frontmatter || !/^name: figma-local-cli$/m.test(frontmatter[1]) ||
    !/^description: \S.+$/m.test(frontmatter[1]) || !frontmatter[2].trim()) {
  throw new Error('Skill frontmatter 或正文无效');
}

spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['unlink', '--global', 'figma-local-cli'], { cwd: root, stdio: 'ignore' });
const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['link'], {
  cwd: root, stdio: 'inherit'
});
if (npm.error || npm.status !== 0) throw new Error('npm link 失败');
const prefix = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['prefix', '--global'], { cwd: root, encoding: 'utf8' });
if (prefix.error || prefix.status !== 0) throw new Error('无法读取 npm 全局目录');
const legacyCommand = path.join(prefix.stdout.trim(), 'bin', 'figma-local');
if (await exists(legacyCommand)) {
  const stat = await lstat(legacyCommand);
  const expectedTarget = path.join(root, 'src', 'cli.js');
  if (!stat.isSymbolicLink() || await realpath(legacyCommand) !== expectedTarget) {
    throw new Error(`拒绝删除无法识别的旧命令: ${legacyCommand}`);
  }
  await rm(legacyCommand);
}

await mkdir(globalRoot, { recursive: true });
const stage = await mkdtemp(path.join(globalRoot, '.figma-local-cli-stage-'));
const backup = path.join(globalRoot, `.figma-local-cli-backup-${process.pid}`);
try {
  await cp(source, stage, { recursive: true });
  const expected = await manifest(source);
  if (JSON.stringify(expected) !== JSON.stringify(await manifest(stage))) {
    throw new Error('Skill 暂存校验失败');
  }
  const hadPrevious = await exists(destination);
  if (hadPrevious) await rename(destination, backup);
  try {
    await rename(stage, destination);
  } catch (error) {
    if (hadPrevious && !await exists(destination)) await rename(backup, destination);
    throw error;
  }
  if (hadPrevious) await rm(backup, { recursive: true, force: true });
  if (JSON.stringify(expected) !== JSON.stringify(await manifest(destination))) {
    throw new Error('全局 Skill 安装后校验失败');
  }
  if (await exists(legacyDestination)) {
    const legacySkill = path.join(legacyDestination, 'SKILL.md');
    const legacy = await readFile(legacySkill, 'utf8');
    if (!/^name: figma-local$/m.test(legacy)) {
      throw new Error(`拒绝删除无法识别的旧 Skill: ${legacyDestination}`);
    }
    await rm(legacyDestination, { recursive: true });
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}

const command = spawnSync('figma-local-cli', ['help'], { cwd: homedir(), encoding: 'utf8' });
if (command.error || command.status !== 0 || !command.stdout.includes('Figma Local CLI')) {
  throw new Error('全局 figma-local-cli 命令验证失败');
}

console.log(JSON.stringify({
  command: 'figma-local-cli',
  commandSource: path.join(root, 'src', 'cli.js'),
  skillSource: source,
  installedSkill: destination
}, null, 2));
