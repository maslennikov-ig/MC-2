import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';

// mc2-1kcbv — the C2 blocker window attempt #12 (2026-07-29) surfaced, one line past the two
// mc2-awi6q gaps, and the THIRTEENTH instance of the environment-substitution class.
//
// The child selected writers by sweeping whole compose projects:
//   docker ps -aq --filter label=com.docker.compose.project={megacampus-blue,green,megacampus}
// and demanded the result be exactly the ten writers. On production the `megacampus` project also
// holds redis, qdrant, qdrant-dev, docling-mcp, docling-mcp-internal, notebooklm-bridge and
// notebooklm-bridge-dev — seventeen containers — so C2 failed closed with "writer quiesce inventory
// is not exact" AFTER the barrier had already guarded the database. Worse, had the count matched,
// the classifier one line later would have labelled redis a `production-worker` and quiesced it.
//
// The fixture that "covered" this had exactly ten containers in the projects, so a sweep and a
// selection were indistinguishable. The runner makes them distinguishable: a fake `docker` seeded
// with production's REAL project/service composition drives the REAL child, produced by the REAL
// controller, to its after-inventory boundary.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-quiesce-writer-inventory-runner.py'
);

type Case = {
  child: { returncode: number; reachedInventoryBoundary: boolean; stderr: string };
  inventory: {
    mode: string;
    count: number;
    services: string[];
    classes: [string, number][];
  } | null;
};
type Shape = {
  production: Case;
  legacySweep: Case;
  missingWriter: Case;
  extraPlatformService: Case;
  decoyCount: number;
};

let cached: Shape | undefined;

function drive(): Shape {
  if (cached !== undefined) return cached;
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  expect(result.status, `runner stderr:\n${result.stderr}`).toBe(0);
  cached = JSON.parse(result.stdout) as Shape;
  return cached;
}

const EXPECTED_CLASSES: [string, number][] = [
  ['development-api', 1],
  ['development-web', 1],
  ['development-worker', 3],
  ['production-api', 1],
  ['production-web', 1],
  ['production-worker', 3],
];

describe.runIf(RUN_REAL_CONTROLLER)(
  'Q12 C2: the writer inventory on the real compose layout',
  () => {
    it('selects exactly the ten writers out of production’s seventeen containers', () => {
      const out = drive();

      expect(out.decoyCount).toBeGreaterThan(0);
      // -9 is the pass signal: the child SIGKILLs itself one line after publishing the inventory.
      expect(`${out.production.child.returncode} ${out.production.child.stderr}`).toBe('-9 ');
      expect(out.production.inventory?.count).toBe(10);
      expect(out.production.inventory?.classes).toEqual(EXPECTED_CLASSES);
      expect(out.production.inventory?.mode).toBe('0o400');
      expect(out.production.inventory?.services).not.toContain('redis');
      expect(out.production.inventory?.services).not.toContain('qdrant');
      expect(out.production.inventory?.services).not.toContain('notebooklm-bridge');
    });

    // The RED: the pre-fix sweep restored in a scratch copy reproduces the production message.
    it('a child restored to the project-wide sweep fails on the same layout', () => {
      const out = drive();

      expect(out.legacySweep.child.reachedInventoryBoundary).toBe(false);
      expect(out.legacySweep.child.stderr).toContain('writer quiesce inventory is not exact');
      expect(out.legacySweep.inventory).toBeNull();
    });

    // The selection must not have become permissive: a MISSING writer is still fatal.
    it('still fails closed when a writer is absent', () => {
      const out = drive();

      expect(out.missingWriter.child.reachedInventoryBoundary).toBe(false);
      expect(out.missingWriter.child.stderr).toContain('writer quiesce inventory is not exact');
    });

    // ...and the platform may grow without moving the writer set, which is the point of the fix.
    it('is unaffected by a new non-writer service in the same compose project', () => {
      const out = drive();

      expect(out.extraPlatformService.child.reachedInventoryBoundary).toBe(true);
      expect(out.extraPlatformService.inventory?.count).toBe(10);
      expect(out.extraPlatformService.inventory?.classes).toEqual(EXPECTED_CLASSES);
    });
  }
);
