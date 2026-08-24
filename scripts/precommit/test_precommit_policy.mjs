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
    assert.equal(formatCommands.some(command => command.includes('exec eslint --fix ')), false);
    assert.equal(formatCommands.some(command => command.startsWith('prettier --write ')), true);

    await writeFile(source, "export const value = { label: 'changed' };\n", 'utf8');
    git(cwd, 'add', 'packages/web/example.ts');
    const semanticCommands = await policy.buildTypeScriptCommands([source], { cwd });
    assert.equal(semanticCommands.some(command => command.includes('exec eslint --fix ')), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('each package is linted from its own directory, not from the repository root', async () => {
  // A root-level `eslint` has never heard of `eslint-config-next`, so it reports every
  // `eslint-disable-next-line @next/next/...` in packages/web as "Definition for rule was not
  // found" — an ERROR, which failed the hook on files nobody had semantically changed.
  const policy = await import(policyUrl);
  const cwd = await makeRepository();
  try {
    const paths = {
      web: 'packages/web/component.ts',
      platform: 'packages/course-gen-platform/src/service.ts',
      types: 'packages/shared-types/src/contract.ts',
      untracked: 'packages/shared-utils/src/helper.ts',
    };
    for (const relative of Object.values(paths)) {
      const absolute = path.join(cwd, relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, "export const value = { label: 'changed' };\n", 'utf8');
      git(cwd, 'add', relative);
    }

    const commands = await policy.buildTypeScriptCommands(
      Object.values(paths).map(relative => path.join(cwd, relative)),
      { cwd }
    );
    const lint = commands.filter(command => command.includes('exec eslint --fix '));

    assert.equal(lint.length, 3, 'one command per linted package, none for shared-utils');
    for (const dir of ['packages/web', 'packages/course-gen-platform', 'packages/shared-types']) {
      assert.equal(
        lint.some(command => command.startsWith(`pnpm --dir=${dir} exec eslint --fix `)),
        true,
        `expected a lint command rooted at ${dir}`
      );
    }
    assert.equal(
      lint.some(command => command.includes('shared-utils')),
      false,
      'shared-utils has no lint script and must not be linted'
    );
    // Every staged file is still formatted, linted package or not.
    assert.equal(
      commands.at(-1).startsWith('prettier --write '),
      true,
      'prettier runs last, over all staged files'
    );
    assert.equal(commands.at(-1).includes('shared-utils'), true);
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
