import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  canonical,
  deriveRootRetainedBarrierFixtureRunId,
  materializeRootRetainedBarrierFixture,
  parseLeaseEpoch,
  sha,
  type RetainedBarrierOperation,
  type RetainedChainSpec,
  type RootRetainedBarrierFixtureSpec,
} from './fixtures/q12-retained-barrier-contract.js';

const operations: readonly RetainedBarrierOperation[] = [
  'install',
  'verify-after-base',
  'verify-after-observability',
  'prepare-recovery',
  'activate',
];
const frontierOperations = operations.slice(1);
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync('/tmp/mc2-q12-d5-root-');
  roots.push(value);
  return value;
}

function chain(operation: RetainedBarrierOperation): RetainedChainSpec {
  return {
    operation,
    rootEpoch: parseLeaseEpoch('cutover'),
    cutoverCopyBeforeRecoveryRoot: 'absent',
    recoveryReissues: 0,
    publicationWindowOrphans: 0,
    completionMode: 'normal',
    faultAfter: 'none',
    stopAfter: 'completed',
    installTransaction: operation === 'install' ? 'normal' : 'not-applicable',
  } as RetainedChainSpec;
}

function spec(
  chains: Partial<Record<RetainedBarrierOperation, RetainedChainSpec>>
): RootRetainedBarrierFixtureSpec & { existingQuiesceManifestPath?: string } {
  const candidate = {
    runRoot: root(),
    mode: 'forward',
    completed: Object.keys(chains) as RetainedBarrierOperation[],
    chains,
  } as RootRetainedBarrierFixtureSpec & { existingQuiesceManifestPath?: string };
  if (Object.keys(chains).some(operation => operation !== 'install')) {
    bindQuiescePreimage(candidate);
  }
  return candidate;
}

function bindQuiescePreimage(candidate: RootRetainedBarrierFixtureSpec): string {
  const runId = deriveRootRetainedBarrierFixtureRunId(candidate.runRoot);
  const quiesceManifestPath = join(candidate.runRoot, `writer-quiesce-${runId}.json`);
  writeFileSync(
    quiesceManifestPath,
    `${canonical({
      run_id: runId,
      schema_version: 'megacampus.q12.writer-quiesce/v1',
      state: 'quiesced',
    })}\n`,
    { mode: 0o400 }
  );
  candidate.existingQuiesceManifestPath = quiesceManifestPath;
  return quiesceManifestPath;
}

function frontierSpec(operation: RetainedBarrierOperation): RootRetainedBarrierFixtureSpec {
  const completed = operations.slice(0, operations.indexOf(operation));
  return {
    ...spec(Object.fromEntries(completed.map(item => [item, chain(item)]))),
    mode: 'rollback',
    completed,
    abandonedFrontier: {
      operation: operation as Exclude<RetainedBarrierOperation, 'install'>,
      form: 'issued',
      history: 'initial',
      lease: 'continuous',
      copySet: 'empty',
      exactSuccessBeforeDisposition: false,
      activationCommitRace: 'none',
    },
  };
}

describe('Root/W retained-barrier quiesce preimage seam', () => {
  it('rejects the old all-five synthetic quiesce digest when no byte preimage exists', async () => {
    const candidate = spec(
      Object.fromEntries(operations.map(operation => [operation, chain(operation)]))
    );
    delete candidate.existingQuiesceManifestPath;

    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
      /existing.*quiesce.*manifest|quiesce.*preimage/iu
    );
    expect(existsSync(join(candidate.runRoot, 'phase.jsonl'))).toBe(false);
    expect(existsSync(join(candidate.runRoot, 'capabilities'))).toBe(false);
  });

  it('derives all later-four quiesce bindings from exact unchanged W-owned bytes', async () => {
    const candidate = spec(
      Object.fromEntries(operations.map(operation => [operation, chain(operation)]))
    );
    const quiesceManifestPath = candidate.existingQuiesceManifestPath!;
    const before = readFileSync(quiesceManifestPath);
    const expectedDigest = sha(before);
    const preimage = JSON.parse(before.toString()) as Record<string, unknown>;

    const fixture = await materializeRootRetainedBarrierFixture(candidate);

    expect(readFileSync(quiesceManifestPath)).toEqual(before);
    expect(new Set(fixture.journalEntries.map(row => row.run_id))).toEqual(
      new Set([preimage.run_id])
    );
    for (const operation of operations.slice(1)) {
      const capabilityPath = fixture.capabilityPaths.get(`${operation}:cutover`)!;
      const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as Record<
        string,
        unknown
      >;
      expect(capability.quiesce_manifest_sha256).toBe(expectedDigest);
      expect(
        fixture.journalEntries
          .filter(row => row.command_id === `barrier.${operation}`)
          .every(row => row.quiesce_manifest_sha256 === expectedDigest)
      ).toBe(true);
    }
  });

  it.each(frontierOperations)(
    'rejects a completed prefix plus abandoned %s frontier without a W preimage',
    async operation => {
      const candidate = frontierSpec(operation);
      delete candidate.existingQuiesceManifestPath;

      await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
        /existing.*quiesce.*manifest|quiesce.*preimage/iu
      );
      expect(existsSync(join(candidate.runRoot, 'phase.jsonl'))).toBe(false);
      expect(existsSync(join(candidate.runRoot, 'capabilities'))).toBe(false);
    }
  );

  it.each(frontierOperations)(
    'binds a completed prefix plus abandoned %s frontier to exact W bytes',
    async operation => {
      const candidate = frontierSpec(operation);
      const quiesceManifestPath =
        candidate.existingQuiesceManifestPath ?? bindQuiescePreimage(candidate);
      const expectedDigest = sha(readFileSync(quiesceManifestPath));

      const fixture = await materializeRootRetainedBarrierFixture(candidate);

      const disposition = fixture.journalEntries.find(
        row => row.outcome === 'retained_attempt_abandoning'
      )!;
      expect(disposition.quiesce_manifest_sha256).toBe(expectedDigest);
      const capabilityPath = fixture.capabilityPaths.get(`${operation}:cutover`)!;
      const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as Record<
        string,
        unknown
      >;
      expect(capability.quiesce_manifest_sha256).toBe(expectedDigest);
      expect(
        fixture.journalEntries
          .filter(row => row.command_id === `barrier.${operation}`)
          .every(row => row.quiesce_manifest_sha256 === expectedDigest)
      ).toBe(true);
    }
  );

  it.each(['quiesceManifestSha256', 'quiesce_manifest_sha256'] as const)(
    'rejects attempted caller digest override %s before producer state',
    async override => {
      const candidate = spec({
        'verify-after-base': chain('verify-after-base'),
      }) as RootRetainedBarrierFixtureSpec & Record<string, unknown>;
      candidate[override] = 'f'.repeat(64);

      await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
        /digest override|caller.*digest|quiesce.*sha256/iu
      );
      expect(existsSync(join(candidate.runRoot, 'phase.jsonl'))).toBe(false);
      expect(existsSync(join(candidate.runRoot, 'capabilities'))).toBe(false);
    }
  );

  it('rejects a direct runner digest override before producer state', () => {
    const candidate = spec({
      'verify-after-base': chain('verify-after-base'),
    }) as RootRetainedBarrierFixtureSpec & Record<string, unknown>;
    candidate.quiesce_manifest_sha256 = 'f'.repeat(64);
    const runner = join(
      repoRoot,
      'packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py'
    );

    const child = spawnSync('/usr/bin/python3', [runner], {
      input: JSON.stringify(candidate),
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    });

    expect(child.status).not.toBe(0);
    expect(child.stderr).toMatch(/caller quiesce digest override is forbidden/iu);
    expect(existsSync(join(candidate.runRoot, 'phase.jsonl'))).toBe(false);
    expect(existsSync(join(candidate.runRoot, 'capabilities'))).toBe(false);
  });

  it.each(['outside-root', 'symlink', 'hardlink', 'unsafe-mode', 'missing'] as const)(
    'rejects unsafe existing quiesce preimage %s before producer state',
    async mutation => {
      const candidate = spec({
        'verify-after-base': chain('verify-after-base'),
      }) as RootRetainedBarrierFixtureSpec & { existingQuiesceManifestPath: string };
      const original = candidate.existingQuiesceManifestPath;
      if (mutation === 'outside-root') {
        const outside = join(root(), 'writer-quiesce-outside.json');
        writeFileSync(outside, '{"outside":true}\n', { mode: 0o400 });
        candidate.existingQuiesceManifestPath = outside;
      } else if (mutation === 'symlink') {
        const link = join(candidate.runRoot, 'writer-quiesce-link.json');
        symlinkSync(original, link);
        candidate.existingQuiesceManifestPath = link;
      } else if (mutation === 'hardlink') {
        const link = join(candidate.runRoot, 'writer-quiesce-hardlink.json');
        linkSync(original, link);
        candidate.existingQuiesceManifestPath = link;
      } else if (mutation === 'unsafe-mode') {
        chmodSync(original, 0o600);
      } else {
        candidate.existingQuiesceManifestPath = join(candidate.runRoot, 'missing.json');
      }

      await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
        /quiesce.*(?:path|manifest|file|mode|link|missing|safe)|outside.*root/iu
      );
      expect(existsSync(join(candidate.runRoot, 'phase.jsonl'))).toBe(false);
      expect(existsSync(join(candidate.runRoot, 'capabilities'))).toBe(false);
    }
  );

  it('rejects a fixture runRoot ancestor symlink in run-id derivation and materialization', async () => {
    const parent = root();
    const target = join(parent, 'target');
    const alias = join(parent, 'alias');
    const runRoot = join(alias, 'run');
    mkdirSync(join(target, 'run'), { recursive: true, mode: 0o700 });
    symlinkSync(target, alias, 'dir');
    const candidate: RootRetainedBarrierFixtureSpec = {
      runRoot,
      mode: 'forward',
      completed: ['install'],
      chains: { install: chain('install') },
    };

    expect(() => deriveRootRetainedBarrierFixtureRunId(runRoot)).toThrow(
      /fixture root.*(?:symlink|safe|real directory|ancestor)/iu
    );
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
      /fixture root.*(?:symlink|safe|real directory|ancestor)/iu
    );
    expect(existsSync(join(target, 'run', 'phase.jsonl'))).toBe(false);
    expect(existsSync(join(target, 'run', 'capabilities'))).toBe(false);
  });

  it('rejects a quiesce preimage changed after validation before producer state', async () => {
    const candidate = spec({
      'verify-after-base': chain('verify-after-base'),
    }) as RootRetainedBarrierFixtureSpec & {
      quiesceManifestMutation: 'replace-after-validation';
    };
    candidate.quiesceManifestMutation = 'replace-after-validation';

    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
      /quiesce.*(?:changed|identity|replaced)/iu
    );
    expect(existsSync(join(candidate.runRoot, 'phase.jsonl'))).toBe(false);
    expect(existsSync(join(candidate.runRoot, 'capabilities'))).toBe(false);
  });
});
