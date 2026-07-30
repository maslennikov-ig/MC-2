import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

// 2026-07-27 branch audit: three finished, reviewed, bead-closed pieces of work never reached
// `develop` because they were committed in a worktree parked on another branch (mc2-jc275,
// mc2-v31gc, mc2-sjpbx). Bead status records intent, not delivery, so nothing detected it for
// weeks. This checker is the missing detector: it reports commits that live only on a side branch.
// The hard part is NOT finding non-ancestors — most branches here are delivered by cherry-pick, so
// sha equality is useless and patch-id equality breaks under squash. Subject containment is what
// actually distinguishes "delivered under another sha" from "never delivered".
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const CHECKER = resolve(REPO_ROOT, 'scripts/orchestration/check_stranded_commits.py');

const workspaces: string[] = [];

afterEach(() => {
  while (workspaces.length > 0) {
    const directory = workspaces.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function git(repository: string, ...args: string[]): string {
  const child = spawnSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-01-02T03:04:05+00:00',
      GIT_COMMITTER_DATE: '2026-01-02T03:04:05+00:00',
    },
  });
  if (child.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${child.stderr}`);
  }
  return child.stdout.trim();
}

function commit(repository: string, file: string, contents: string, subject: string): string {
  writeFileSync(join(repository, file), contents);
  git(repository, 'add', file);
  git(repository, 'commit', '-q', '-m', subject);
  return git(repository, 'rev-parse', 'HEAD');
}

/** A repository with `develop` plus one commit, ready for branch scenarios. */
function makeRepository(label: string): string {
  const directory = mkdtempSync(`/tmp/mc2-${label}-`);
  workspaces.push(directory);
  git(directory, 'init', '-q', '-b', 'develop');
  commit(directory, 'base.txt', 'base\n', 'chore: base');
  return directory;
}

interface Finding {
  readonly ref: string;
  readonly commits: ReadonlyArray<{ sha: string; subject: string }>;
}
interface Report {
  readonly target: string;
  readonly stranded: ReadonlyArray<Finding>;
  readonly allowlisted: ReadonlyArray<{ ref: string; reason: string }>;
}
interface Run {
  readonly status: number;
  readonly report: Report;
  readonly stderr: string;
  readonly stdout: string;
}

function check(repository: string, ...extra: string[]): Run {
  const child = spawnSync('/usr/bin/python3', [CHECKER, '--repo', repository, '--json', ...extra], {
    encoding: 'utf8',
  });
  let report = { target: '', stranded: [], allowlisted: [] } as Report;
  if (child.stdout.trim().length > 0) {
    report = JSON.parse(child.stdout) as Report;
  }
  return { status: child.status ?? -1, report, stderr: child.stderr, stdout: child.stdout };
}

describe('check_stranded_commits', () => {
  it('stays silent when every branch is merged into the target', () => {
    const repository = makeRepository('stranded-merged');
    git(repository, 'checkout', '-q', '-b', 'codex/done');
    commit(repository, 'feature.txt', 'feature\n', 'feat: add feature');
    git(repository, 'checkout', '-q', 'develop');
    git(repository, 'merge', '-q', '--no-edit', 'codex/done');

    const run = check(repository);

    expect(run.report.stranded, run.stderr).toEqual([]);
    expect(run.status).toBe(0);
  });

  it('reports a commit that exists only on a side branch', () => {
    const repository = makeRepository('stranded-missing');
    git(repository, 'checkout', '-q', '-b', 'codex/lost');
    const sha = commit(repository, 'lost.txt', 'lost\n', 'fix(web): open current stage preview');
    git(repository, 'checkout', '-q', 'develop');

    const run = check(repository);

    expect(run.status, run.stderr).toBe(1);
    expect(run.report.stranded).toHaveLength(1);
    expect(run.report.stranded[0]?.ref).toBe('codex/lost');
    expect(run.report.stranded[0]?.commits).toEqual([
      { sha: sha.slice(0, 9), subject: 'fix(web): open current stage preview' },
    ]);
  });

  it('treats a cherry-picked subject as delivered even though the sha differs', () => {
    const repository = makeRepository('stranded-cherry');
    git(repository, 'checkout', '-q', '-b', 'codex/picked');
    const source = commit(repository, 'picked.txt', 'picked\n', 'fix(api): repair the thing');
    git(repository, 'checkout', '-q', 'develop');
    git(repository, 'cherry-pick', source);
    // Rewrite the delivered commit so no sha, tree or patch-id is shared with the branch.
    writeFileSync(join(repository, 'picked.txt'), 'picked, then reworked on develop\n');
    git(repository, 'add', 'picked.txt');
    git(repository, 'commit', '-q', '--amend', '--no-edit');

    const run = check(repository);

    expect(run.report.stranded, run.stderr).toEqual([]);
    expect(run.status).toBe(0);
  });

  it('treats a subject that was annotated on delivery as delivered', () => {
    // Re-delivering recovered work normally annotates the subject with the bead id, e.g.
    // "fix(x): y" becomes "fix(x): y (mc2-abc12)". Exact-subject matching alone would keep
    // flagging the source branch forever, which trains everyone to ignore the report.
    const repository = makeRepository('stranded-annotated');
    git(repository, 'checkout', '-q', '-b', 'codex/source');
    commit(repository, 'annotated.txt', 'work\n', 'fix(web): open current stage preview');
    git(repository, 'checkout', '-q', 'develop');
    commit(
      repository,
      'annotated.txt',
      'work\n',
      'fix(web): open current stage preview (mc2-v31gc)'
    );

    const run = check(repository);

    expect(run.report.stranded, run.stderr).toEqual([]);
    expect(run.status).toBe(0);
  });

  it('honours a subject: rule in the allowlist', () => {
    const repository = makeRepository('stranded-subject-rule');
    git(repository, 'checkout', '-q', '-b', 'codex/trigger');
    commit(repository, 'trigger.txt', 'trigger\n', 'chore: trigger deploy after Docker cleanup');
    git(repository, 'checkout', '-q', 'develop');
    const allowlist = join(repository, 'allowlist.txt');
    writeFileSync(
      allowlist,
      'subject:^chore: trigger deploy\tempty CI trigger, carries no content\n'
    );

    const run = check(repository, '--allowlist', allowlist);

    expect(run.report.stranded, run.stderr).toEqual([]);
    expect(run.status).toBe(0);
  });

  it('ignores merge commits and bookkeeping subjects', () => {
    const repository = makeRepository('stranded-noise');
    git(repository, 'checkout', '-q', '-b', 'codex/noise');
    commit(repository, 'noise.txt', 'noise\n', 'bd sync: 2026-01-02 03:04:05');
    commit(repository, 'noise2.txt', 'noise\n', 'chore(beads): record interactions');
    git(repository, 'checkout', '-q', '-b', 'codex/side');
    commit(repository, 'side.txt', 'side\n', 'chore: side');
    git(repository, 'checkout', '-q', 'codex/noise');
    git(repository, 'merge', '-q', '--no-edit', '--no-ff', 'codex/side');
    git(repository, 'checkout', '-q', 'develop');
    git(repository, 'merge', '-q', '--no-edit', 'codex/side');

    const run = check(repository);

    expect(run.report.stranded, run.stderr).toEqual([]);
    expect(run.status).toBe(0);
  });

  it('skips an allowlisted branch and echoes why it was skipped', () => {
    const repository = makeRepository('stranded-allowlist');
    git(repository, 'checkout', '-q', '-b', 'feature/parked');
    commit(repository, 'parked.txt', 'parked\n', 'feat: parked work');
    git(repository, 'checkout', '-q', 'develop');
    const allowlist = join(repository, 'allowlist.txt');
    writeFileSync(
      allowlist,
      '# comment line\nfeature/parked\tparked by the owner until they say otherwise\n'
    );

    const run = check(repository, '--allowlist', allowlist);

    expect(run.report.stranded, run.stderr).toEqual([]);
    expect(run.report.allowlisted).toEqual([
      { ref: 'feature/parked', reason: 'parked by the owner until they say otherwise' },
    ]);
    expect(run.status).toBe(0);
  });

  it('prints a human summary naming the branch and the bead-sized subject', () => {
    const repository = makeRepository('stranded-human');
    git(repository, 'checkout', '-q', '-b', 'codex/lost-human');
    commit(repository, 'lost.txt', 'lost\n', 'fix(web): render markdown preview');
    git(repository, 'checkout', '-q', 'develop');

    const child = spawnSync('/usr/bin/python3', [CHECKER, '--repo', repository], {
      encoding: 'utf8',
    });

    expect(child.status, child.stderr).toBe(1);
    expect(child.stdout).toContain('codex/lost-human');
    expect(child.stdout).toContain('fix(web): render markdown preview');
  });

  it('refuses to guess when the target ref is absent', () => {
    const repository = makeRepository('stranded-no-target');

    const run = check(repository, '--target', 'nonexistent');

    expect(run.status).toBe(2);
    expect(run.stderr).toContain('nonexistent');
  });
});
