import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import prettier from 'prettier';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const policyUrl = pathToFileURL(path.join(import.meta.dirname, 'staged-file-policy.mjs')).href;
const goalFormatterUrl = pathToFileURL(
  path.join(import.meta.dirname, 'format-tracked-goal-snapshots.mjs')
).href;
const prettierBin = path.join(repoRoot, 'node_modules', '.bin', 'prettier');

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

async function makeRepository() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'mc2-precommit-'));
  git(cwd, 'init', '--quiet');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'user.name', 'Test User');
  await writeFile(path.join(cwd, '.gitignore'), '.codex/*\n', 'utf8');
  git(cwd, 'add', '.gitignore');
  git(cwd, 'commit', '--quiet', '-m', 'baseline');
  return cwd;
}

test('format-only staged source skips ESLint while semantic changes remain lintable', async () => {
  const policy = await import(policyUrl).catch(() => null);
  assert.equal(typeof policy?.buildTypeScriptCommands, 'function');

  const cwd = await makeRepository();
  try {
    const source = path.join(cwd, 'packages/web/example.ts');
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, "export const value={label:'old'}\n", 'utf8');
    git(cwd, 'add', 'packages/web/example.ts');
    git(cwd, 'commit', '--quiet', '-m', 'source');

    execFileSync(prettierBin, ['--write', source], { cwd, stdio: 'ignore' });
    git(cwd, 'add', 'packages/web/example.ts');
    const formatCommands = await policy.buildTypeScriptCommands([source], { cwd });
    assert.equal(formatCommands.some(command => command.startsWith('eslint --fix ')), false);
    assert.equal(formatCommands.some(command => command.startsWith('prettier --write ')), true);

    await writeFile(source, "export const value = { label: 'changed' };\n", 'utf8');
    git(cwd, 'add', 'packages/web/example.ts');
    const semanticCommands = await policy.buildTypeScriptCommands([source], { cwd });
    assert.equal(semanticCommands.some(command => command.startsWith('eslint --fix ')), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('ignored goal snapshot is formatted and force-restaged without broad staging', async () => {
  const formatter = await import(goalFormatterUrl).catch(() => null);
  assert.equal(typeof formatter?.formatTrackedGoalSnapshots, 'function');

  const cwd = await makeRepository();
  try {
    const relative = '.codex/goals/mc2-test/scope-criterion-snapshot.json';
    const snapshot = path.join(cwd, relative);
    await mkdir(path.dirname(snapshot), { recursive: true });
    await writeFile(snapshot, '{"goal_id":"mc2-test","criteria":[]}\n', 'utf8');
    git(cwd, 'add', '-f', '--', relative);

    const unrelated = path.join(cwd, 'unrelated.txt');
    await writeFile(unrelated, 'must remain unstaged\n', 'utf8');

    const handled = await formatter.formatTrackedGoalSnapshots({ cwd });
    assert.deepEqual(handled, [relative]);
    assert.equal(git(cwd, 'diff', '--name-only'), '');
    assert.equal(git(cwd, 'diff', '--cached', '--name-only'), `${relative}\n`);
    const canonical = await prettier.format('{"goal_id":"mc2-test","criteria":[]}\n', {
      filepath: snapshot,
    });
    assert.equal(git(cwd, 'show', `:${relative}`), canonical);
    assert.equal(await readFile(unrelated, 'utf8'), 'must remain unstaged\n');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
