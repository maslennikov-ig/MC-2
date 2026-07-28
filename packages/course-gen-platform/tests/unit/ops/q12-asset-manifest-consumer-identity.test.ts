import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// mc2-lzft4: probe H2 asserts the deployed tree's mode and owner AGAINST the tracked asset
// manifest, so a wrong expectation in that manifest makes H2 certify a host the window's own
// children reject. That is exactly what happened: the manifest derived
// `deploy/qdrant/q12-writer-resume.py` as 0444 from the git executable bit, while
// `deploy/qdrant/source-recovery-run.sh` refuses to run unless it is exactly root:root 0644. H2
// went green, the window opened, and C2 failed closed after the barrier had already put
// production into `maintenance_guarded`. These tests keep the manifest tied to the consumer's own
// refusal rather than to a heuristic.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-asset-manifest-consumer-identity-runner.py'
);

type Shape = {
  pins: { path: string; assertion_present: boolean; identity: string; assertion_literal: string }[];
  drifted_consumer: { raised: boolean; message: string };
  unpinned_asset: { raised: boolean; message: string };
  agreement: { path: string; tracked: string; emitted: string; required: string }[];
};

function drive(): Shape {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(result.status, `runner stderr:\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Shape;
}

describe('Q12 deployed-asset manifest: identity comes from the consuming script (mc2-lzft4)', () => {
  it('declares exactly what source-recovery-run.sh refuses to run without', () => {
    // Read the wrapper directly rather than trusting the pin table: this is the assertion the
    // host is actually measured by at C2.
    const wrapper = readFileSync(resolve(repoRoot, 'deploy/qdrant/source-recovery-run.sh'), 'utf8');
    const match = wrapper.match(/"\$RESUME_CONTROLLER"\)\s*==\s*'(\d+):(\d+):(\d+)'/u);
    expect(match, 'the wrapper no longer pins the resume controller identity').not.toBeNull();
    const [, uid, gid, mode] = match as RegExpMatchArray;
    expect(uid).toBe('0');
    expect(gid).toBe('0');

    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'deploy/qdrant/q12-deployed-asset-manifest.json'), 'utf8')
    ) as { assets: { path: string; mode: string | null; owner: string | null; group: string }[] };
    const asset = manifest.assets.find(a => a.path === 'deploy/qdrant/q12-writer-resume.py');
    expect(asset, 'the resume controller is not in the asset manifest').toBeDefined();
    expect(asset?.owner).toBe('root');
    expect(asset?.group).toBe('root');
    // The shell compares an unpadded octal from `stat -c %a`; the manifest stores it zero-padded.
    expect(asset?.mode).toBe(`0${mode}`);
  });

  it('keeps every pin live against the consumer that demands it', () => {
    const out = drive();
    expect(out.pins.length).toBeGreaterThan(0);
    for (const pin of out.pins) {
      expect(`${pin.path}:assertion_present=${pin.assertion_present}`).toBe(
        `${pin.path}:assertion_present=true`
      );
      // root:root:0644 must be the same identity as the shell's 0:0:644.
      expect(pin.identity.replace('root:root:0', '0:0:')).toBe(pin.assertion_literal);
    }
  });

  it('agrees with a fresh emission and with the tracked manifest on every pinned path', () => {
    const out = drive();
    for (const row of out.agreement) {
      expect(`${row.path}:tracked=${row.tracked}`).toBe(`${row.path}:tracked=${row.required}`);
      expect(`${row.path}:emitted=${row.emitted}`).toBe(`${row.path}:emitted=${row.required}`);
    }
  });

  it('refuses to emit a manifest once the consumer stops carrying the assertion', () => {
    const out = drive();
    expect(out.drifted_consumer.raised).toBe(true);
    expect(out.drifted_consumer.message).toContain('no longer carries the identity assertion');
    expect(out.drifted_consumer.message).toContain('re-derive CONSUMER_REQUIRED_IDENTITY');
  });

  it('refuses to emit a manifest that would leave a pinned asset unasserted on the host', () => {
    const out = drive();
    expect(out.unpinned_asset.raised).toBe(true);
    expect(out.unpinned_asset.message).toContain('would therefore go unasserted on the host');
  });
});
