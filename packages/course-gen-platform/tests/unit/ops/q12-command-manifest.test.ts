import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const MANIFEST = resolve(REPO_ROOT, 'deploy/qdrant/q12-command-manifest.json');
const SUPERVISOR = resolve(REPO_ROOT, 'deploy/qdrant/q12-live-cutover.sh');
const LAUNCHER = resolve(REPO_ROOT, 'deploy/qdrant/q12-capability-run.sh');
const CORE = resolve(REPO_ROOT, 'deploy/qdrant/q12-lifecycle-core.py');
const IDS = [
  'barrier.install',
  'barrier.verify-after-base',
  'barrier.verify-after-observability',
  'barrier.prepare-recovery',
  'barrier.activate',
] as const;
const ENV = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C', LANG: 'C', HOME: '/root' };

function argvHash(argv: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(argv)).digest('hex');
}

describe('Q12 retained command manifest', () => {
  it('contains exactly the five retained commands with canonical literal argv hashes', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      schema_version: string;
      commands: Record<
        string,
        { argv: string[]; argv_sha256: string; env: Record<string, string> }
      >;
    };
    expect(Object.keys(manifest)).toEqual(['schema_version', 'commands']);
    expect(manifest.schema_version).toBe('megacampus.q12.command-manifest/v1');
    expect(Object.keys(manifest.commands)).toEqual(IDS);
    for (const id of IDS) {
      const command = manifest.commands[id];
      expect(command.env).toEqual(ENV);
      expect(command.argv[0]).toBe('/opt/megacampus/deploy/qdrant/q12-database-barrier.sh');
      expect(command.argv_sha256).toBe(argvHash(command.argv));
      expect(command.argv).not.toContain('--');
      expect(command.argv.every(value => !/[;&|`$()\n]/.test(value))).toBe(true);
    }
    expect(manifest.commands['barrier.prepare-recovery'].argv).not.toContain('--after-migration');
  });

  it('deployed wrappers enter only the production core and expose no test bypass', () => {
    for (const wrapper of [SUPERVISOR, LAUNCHER]) {
      const source = readFileSync(wrapper, 'utf8');
      expect(source).toContain('/usr/bin/python3');
      expect(source).toContain('q12-lifecycle-core.py');
      expect(source).not.toMatch(
        /fixture|test[-_ ]?mode|manifest[-_ ]?override|executor[-_ ]?override/i
      );
      const rejected = spawnSync('/usr/bin/bash', [wrapper, '--fixture'], {
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
      });
      expect(rejected.status).not.toBe(0);
    }
    const help = spawnSync('/usr/bin/python3', [CORE, '--help'], { encoding: 'utf8' });
    expect(help.status).toBe(0);
    expect(help.stdout).not.toMatch(/fixture|test|override|inject/i);
  });

  it('freezes the exact public launcher argv surface', () => {
    const source = readFileSync(CORE, 'utf8');
    for (const option of [
      '--run-id',
      '--command-id',
      '--lease-fd',
      '--checkpoint',
      '--capability',
    ]) {
      expect(source).toContain(option);
    }
    for (const forbidden of [
      '--request',
      '--manifest',
      '--executor',
      '--command',
      '--env',
      '--path',
    ]) {
      expect(source).not.toContain(`add_argument('${forbidden}'`);
      expect(source).not.toContain(`add_argument("${forbidden}"`);
    }
  });
});
