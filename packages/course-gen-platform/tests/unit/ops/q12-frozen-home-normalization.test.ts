import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

// The frozen manifest declares HOME=/root for all twenty commands — correct when the controller
// ran as root, wrong since the identity amendment (mc2-1by33) moved it to uid 1000. The docker CLI
// resolves its cli-plugins through the config dir under HOME, so an unreadable HOME does not merely
// lose credentials: `docker compose` stops existing. The 2026-07-27 window died in preflight on
// `operator.self-check` with exit 125 and `unknown flag: --project-directory` for exactly that
// reason (mc2-wwc9l). The manifest cannot be edited (frozen sha aaec6fc2, and load_manifest enforces
// byte-equal env per command), so the fix lives at the wrapper seam — the same place the privileged
// launcher lives. Both docker-touching wrappers must carry the SAME block, so this suite compares
// them byte-for-byte and executes the block itself: neither script can be driven end-to-end here
// because both exec an absolute /usr/bin/docker.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const WRAPPERS = ['deploy/qdrant/operator-compose.sh', 'scripts/deploy_blue_green.sh'] as const;
const BEGIN = '# --- frozen-HOME normalization (mc2-wwc9l) ---';
const END = '# --- end frozen-HOME normalization ---';

const workspaces: string[] = [];

afterEach(() => {
  while (workspaces.length > 0) {
    const directory = workspaces.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function source(relative: string): string {
  return readFileSync(resolve(REPO_ROOT, relative), 'utf8');
}

/** The normalization block as it literally appears in a wrapper, markers excluded. */
function block(relative: string): string {
  const text = source(relative);
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < 0) return '';
  return text.slice(start + BEGIN.length, end).trim();
}

/** Run the extracted block with a given HOME and report the HOME it leaves behind. */
function normalize(home: string | undefined): { status: number; home: string; stderr: string } {
  const script = `set -euo pipefail
fail() { printf 'wrapper: %s\\n' "$1" >&2; exit 1; }
${block(WRAPPERS[0])}
printf '%s' "\${HOME-}"`;
  const child = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: home === undefined ? { PATH: process.env.PATH } : { PATH: process.env.PATH, HOME: home },
  });
  return { status: child.status ?? -1, home: child.stdout, stderr: child.stderr };
}

function passwdHome(): string {
  const child = spawnSync('bash', ['-c', 'getent passwd "$(id -u)" | cut -d: -f6'], {
    encoding: 'utf8',
  });
  return child.stdout.trim();
}

describe('Q12 frozen HOME normalization', () => {
  it('is present in both docker-touching wrappers', () => {
    for (const wrapper of WRAPPERS) {
      expect(block(wrapper), `${wrapper} is missing the normalization block`).not.toBe('');
    }
  });

  it('keeps the two copies byte-identical so they cannot drift apart', () => {
    expect(block(WRAPPERS[1])).toBe(block(WRAPPERS[0]));
  });

  it('runs before the first docker invocation in each wrapper', () => {
    for (const wrapper of WRAPPERS) {
      const text = source(wrapper);
      const marker = text.indexOf(BEGIN);
      const firstDocker = text.search(/(^|[^-\w])(\/usr\/bin\/)?docker\s+(compose|run|ps|exec)\b/m);
      expect(marker, `${wrapper}: no normalization block`).toBeGreaterThanOrEqual(0);
      expect(firstDocker, `${wrapper}: no docker invocation found`).toBeGreaterThan(0);
      expect(marker, `${wrapper}: normalization must precede docker`).toBeLessThan(firstDocker);
    }
  });

  it('replaces a HOME the current uid cannot use with the passwd home', () => {
    if (process.getuid?.() === 0) {
      // As root /root IS usable, so this branch cannot be provoked; the passthrough case below
      // is what root exercises, and it is the behaviour that must stay byte-identical.
      expect(normalize('/root').home).toBe('/root');
      return;
    }

    const result = normalize('/root');

    expect(result.status, result.stderr).toBe(0);
    expect(result.home).toBe(passwdHome());
    expect(result.home).not.toBe('/root');
  });

  it('replaces a readable HOME that belongs to someone else', () => {
    // The dangerous case that mode bits alone do not catch: `/` is root-owned but world
    // readable and traversable, so -r/-x both pass. docker would then look for /.docker and
    // fail to read or create it — the same class of breakage as an unreadable /root. Only the
    // ownership test rejects it. A mutation dropping -O from the condition must fail here.
    if (process.getuid?.() === 0) {
      expect(normalize('/').home).toBe('/');
      return;
    }

    const result = normalize('/');

    expect(result.status, result.stderr).toBe(0);
    expect(result.home).toBe(passwdHome());
    expect(result.home).not.toBe('/');
  });

  it('replaces an absent HOME with the passwd home', () => {
    const result = normalize('/nonexistent-frozen-home-fixture');

    expect(result.status, result.stderr).toBe(0);
    expect(result.home).toBe(passwdHome());
  });

  it('replaces an empty or unset HOME', () => {
    expect(normalize('').home).toBe(passwdHome());
    expect(normalize(undefined).home).toBe(passwdHome());
  });

  it('leaves a usable HOME exactly as given — the root path must not change', () => {
    const directory = mkdtempSync('/tmp/mc2-frozen-home-');
    workspaces.push(directory);

    const result = normalize(directory);

    expect(result.status, result.stderr).toBe(0);
    expect(result.home).toBe(directory);
  });

  it('does not touch anything else in the environment', () => {
    const directory = mkdtempSync('/tmp/mc2-frozen-home-keep-');
    workspaces.push(directory);
    const script = `set -euo pipefail
fail() { printf 'wrapper: %s\\n' "$1" >&2; exit 1; }
${block(WRAPPERS[0])}
printf '%s|%s|%s' "\${LC_ALL-}" "\${PATH-}" "\${HOME-}"`;
    const child = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', HOME: directory },
    });

    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toBe(`C|/usr/bin:/bin|${directory}`);
  });

  it('names the frozen-manifest reason in a comment so the next reader does not delete it', () => {
    for (const wrapper of WRAPPERS) {
      const text = source(wrapper);
      expect(text).toContain('frozen');
      expect(text).toContain('mc2-wwc9l');
    }
  });
});

describe('Q12 frozen HOME normalization — fixture writes to the resolved home', () => {
  it('resolves a home the current uid can actually read and traverse', () => {
    const result = normalize('/root');
    const home = process.getuid?.() === 0 ? '/root' : result.home;

    const probe = spawnSync('bash', ['-c', `[[ -r ${home} && -x ${home} ]]`], {
      encoding: 'utf8',
    });

    expect(probe.status, `${home} must be readable and traversable`).toBe(0);
  });
});

// Guard against the fixture silently passing on a machine without /root at all.
describe('environment sanity', () => {
  it('has a root-owned /root to stand in for the frozen HOME', () => {
    const probe = spawnSync('bash', ['-c', 'stat -c %U /root'], { encoding: 'utf8' });
    expect(probe.status).toBe(0);
    expect(probe.stdout.trim()).toBe('root');
  });

  it('resolves a passwd home for the current uid', () => {
    expect(passwdHome()).not.toBe('');
    expect(join(passwdHome(), '.')).toContain('/');
  });
});
