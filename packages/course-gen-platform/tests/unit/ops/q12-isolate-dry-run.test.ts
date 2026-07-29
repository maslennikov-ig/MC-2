import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

// mc2-rjy9k — the frozen data-movement children driven against the plan's restored isolate.
//
// Group G (mc2-bh3ef) catches "this child cannot START in its environment". This harness is the
// second net: "this child starts and then fails on its own inputs", which is attempt #15's second
// cause and the generation's exact-four-files rule.
//
// The isolate is a Supabase PostgreSQL 17.6 restored from the production dump, handed back by the
// plan's persist seam. CI has no such isolate, so here the suite asserts the CONTRACT: every frozen
// command is accounted for, the driven set is real, and every skip carries a structural reason
// rather than a shrug. The driven legs run on the host with MC2_Q12_ISOLATE_HANDLE bound, and the
// resulting report is attached to the window attempt as evidence.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-isolate-dry-run-runner.py'
);
const COMMAND_MANIFEST = resolve(repoRoot, 'deploy/qdrant/q12-command-manifest.json');

interface Child {
  id: string;
  outcome: 'ran' | 'skipped' | 'failed';
  detail: string;
  status?: number;
  env_home?: string;
  argv_tokens_changed?: number;
}

interface DryRunReport {
  schema_version: string;
  isolate: { bound: boolean; database?: string; port?: number };
  children: Child[];
  uncovered_commands: string[];
  in_window_residuals: string[];
}

function driveDryRun(): DryRunReport {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    timeout: 240_000,
    env: { PATH: process.env.PATH, LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as DryRunReport;
}

describe('Q12 isolate dry run: the data-movement children', () => {
  let out: DryRunReport;
  beforeAll(() => {
    out = driveDryRun();
  }, 260_000);

  it('accounts for every frozen manifest command, with no silent omission', () => {
    const manifest = JSON.parse(readFileSync(COMMAND_MANIFEST, 'utf8')) as {
      commands: Record<string, unknown>;
    };
    expect(out.schema_version).toBe('megacampus.q12.isolate-dry-run/v1');
    expect(out.uncovered_commands).toEqual([]);
    expect(out.children.map(child => child.id).sort()).toEqual(
      Object.keys(manifest.commands).sort()
    );
  });

  it('gives every skipped child a structural reason, never a shrug', () => {
    for (const child of out.children.filter(entry => entry.outcome === 'skipped')) {
      expect(`${child.id}: ${child.detail}`.length, child.id).toBeGreaterThan(40);
    }
    // The reason the reindex and forward children cannot be reached is the receipt only
    // barrier.activate mints — not scheduling, and not something a fixture may fabricate.
    const forward = out.children.find(child => child.id === 'source.forward');
    expect(forward?.outcome).toBe('skipped');
    expect(forward?.detail).toContain('barrier-receipt');
    for (const id of ['reindex.plan', 'reindex.execute', 'reindex.verify']) {
      expect(out.children.find(child => child.id === id)?.detail).toContain('receipt');
    }
    const prepare = out.children.find(child => child.id === 'deploy.prepare');
    expect(prepare?.detail).toContain('probe_closed_inbound');
  });

  it('states the in-window residuals rather than papering over them', () => {
    expect(out.in_window_residuals.join(' ')).toContain('dual-bind');
    expect(out.in_window_residuals.join(' ')).toContain('quiesce_client_backends');
    expect(out.in_window_residuals.join(' ')).toContain('probe_closed_inbound');
  });

  it('names the two never-executed migration children as the driven set', () => {
    for (const id of ['migration.base.apply', 'migration.observability.apply']) {
      const child = out.children.find(entry => entry.id === id);
      expect(child, id).toBeDefined();
      if (out.isolate.bound) {
        // On the host: the child ran, under its OWN frozen env, with only the three credential
        // PATHS re-pointed at the isolate.
        expect(`${id}=${child?.outcome}`, child?.detail).toBe(`${id}=ran`);
        expect(child?.env_home).toBe('/root');
        expect(child?.argv_tokens_changed).toBe(3);
      } else {
        expect(child?.outcome).toBe('skipped');
        // A vanilla container is NOT a substitute, and the report says why rather than quietly
        // running against one and reporting a green that means nothing.
        expect(child?.detail).toContain('vanilla PG17.10');
      }
    }
  });
});
