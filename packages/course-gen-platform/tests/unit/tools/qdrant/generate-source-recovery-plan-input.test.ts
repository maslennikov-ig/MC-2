import { createHash } from 'node:crypto';
import { readFileSync, rmSync, statSync, symlinkSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildSourceRecoveryPlanInput,
  parseGeneratePlanInputArgv,
  runGeneratePlanInput,
  writePlanInputOwnerOnly,
  type RecoverySourceInventoryEntry,
} from '../../../../tools/qdrant/generate-source-recovery-plan-input';
import {
  calculateRecoveryManifestSha256,
  normalizeRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest';
import type { ReindexSourceRow } from '../../../../tools/qdrant/reindex-plan';
import type { RecoveryPlaybookRow } from '../../../../tools/qdrant/source-recovery-database';

// `.13.4.1` reviewed plan-input regeneration: rebuild the owner-only recovery manifest from a
// fresh read-only catalog projection plus a size+sha256 inventory of both upload roots. The
// synthetic corpus mirrors the accepted `.13.4` audit truth exactly:
// 261 = 240 eligible (109 canonical + 67 Set A over 39 targets + 58 Set B over 3 targets +
// 4 missing + 2 invalid) + 21 non-eligible (3 development-present + 18 absent Career Playbook).

const RUN_ID = '53000000-0000-4000-8000-000000000042';
const RELEASE_SHA = 'c'.repeat(40);
const OPERATOR_DIGEST = `sha256:${'d'.repeat(64)}`;
const GENERATED_AT = '2026-07-23T12:00:00.000Z';
const DEVELOPMENT_ROOT = '/srv/megacampus/uploads-dev';
const PRODUCTION_ROOT = '/srv/megacampus/uploads';
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const COURSE_ID = '20000000-0000-4000-8000-000000000002';
const USER_ID = '30000000-0000-4000-8000-000000000003';
const PLAYBOOK_ID = '40000000-0000-4000-8000-000000000004';

function hex(value: number, width: number): string {
  return value.toString(16).padStart(width, '0');
}

function syntheticHash(space: number, index: number): string {
  return `${hex(space, 4)}${hex(index, 12)}`.repeat(4);
}

function rowId(space: number, index: number): string {
  return `e${hex(space, 7)}-0000-4000-8000-${hex(index, 12)}`;
}

function playbookSourceId(index: number): string {
  return `f0000000-0000-4000-8000-${hex(index, 12)}`;
}

function eligibleRow(input: {
  space: number;
  index: number;
  storagePath: string;
  hash: string;
  mimeType?: string;
}): ReindexSourceRow {
  return {
    id: rowId(input.space, input.index),
    organizationId: ORGANIZATION_ID,
    courseId: COURSE_ID,
    courseOrganizationId: ORGANIZATION_ID,
    userId: USER_ID,
    storagePath: input.storagePath,
    mimeType: input.mimeType ?? 'application/pdf',
    priority: null,
    hash: input.hash,
    vectorStatus: 'pending',
    errorMessage: null,
    chunkCount: null,
    locale: 'ru',
    alreadyEnqueued: false,
  };
}

function playbookRowFor(input: {
  space: number;
  index: number;
  storagePath: string;
  hash: string;
}): ReindexSourceRow {
  return {
    ...eligibleRow(input),
    courseId: null,
    courseOrganizationId: null,
    userId: null,
    vectorStatus: 'failed',
    errorMessage: 'source unavailable',
  };
}

interface Corpus {
  rows: ReindexSourceRow[];
  playbookRows: RecoveryPlaybookRow[];
  inventory: RecoverySourceInventoryEntry[];
}

function corpus(): Corpus {
  const rows: ReindexSourceRow[] = [];
  const inventory: RecoverySourceInventoryEntry[] = [];
  const playbookRows: RecoveryPlaybookRow[] = [];

  // 109 canonical production sources.
  for (let index = 0; index < 109; index += 1) {
    const relative = `${ORGANIZATION_ID}/${COURSE_ID}/canonical-${hex(index, 3)}.pdf`;
    const hash = syntheticHash(1, index);
    rows.push(eligibleRow({ space: 1, index, storagePath: `uploads/${relative}`, hash }));
    inventory.push({
      root: 'production',
      relative_path: relative,
      size: 1000 + index,
      sha256: hash,
    });
  }

  // Set A: 39 development mirror targets covering 67 rows (28 shared by two rows + 11 single).
  let setARow = 0;
  for (let target = 0; target < 39; target += 1) {
    const relative = `${ORGANIZATION_ID}/${COURSE_ID}/alternate-${hex(target, 3)}.pdf`;
    const hash = syntheticHash(2, target);
    const shares = target < 28 ? 2 : 1;
    for (let share = 0; share < shares; share += 1) {
      rows.push(
        eligibleRow({ space: 2, index: setARow, storagePath: `uploads/${relative}`, hash })
      );
      setARow += 1;
    }
    inventory.push({
      root: 'development',
      relative_path: relative,
      size: 2000 + target,
      sha256: hash,
    });
  }

  // Set B: 3 absent originals whose exact content exists at five other development paths each,
  // covering 58 rows (20 + 19 + 19).
  const setBShares = [20, 19, 19];
  let setBRow = 0;
  for (let content = 0; content < 3; content += 1) {
    const relative = `${ORGANIZATION_ID}/${COURSE_ID}/original-${hex(content, 3)}.pdf`;
    const hash = syntheticHash(3, content);
    for (let share = 0; share < setBShares[content]; share += 1) {
      rows.push(
        eligibleRow({ space: 3, index: setBRow, storagePath: `uploads/${relative}`, hash })
      );
      setBRow += 1;
    }
    for (let candidate = 0; candidate < 5; candidate += 1) {
      inventory.push({
        root: 'development',
        relative_path: `${ORGANIZATION_ID}/copies/content-${content}/candidate-${candidate}.pdf`,
        size: 3000 + content,
        sha256: hash,
      });
    }
  }

  // 4 eligible valid-path rows with truly absent bytes (three share one original + one separate).
  for (let index = 0; index < 4; index += 1) {
    const shared = index < 3;
    rows.push(
      eligibleRow({
        space: 4,
        index,
        storagePath: `uploads/${ORGANIZATION_ID}/${COURSE_ID}/absent-${shared ? 'shared' : 'solo'}.pdf`,
        hash: syntheticHash(4, shared ? 0 : 1),
      })
    );
  }

  // 2 eligible text rows with an invalid relative path (missing the uploads/ prefix) and absent
  // bytes — the audited invalid pair refers to plain-text sources.
  for (let index = 0; index < 2; index += 1) {
    rows.push(
      eligibleRow({
        space: 5,
        index,
        storagePath: `${ORGANIZATION_ID}/${COURSE_ID}/invalid-${index}.txt`,
        hash: syntheticHash(5, index),
        mimeType: 'text/plain',
      })
    );
  }

  // 21 non-eligible Career Playbook rows: 3 with exact development content, 18 absent.
  for (let index = 0; index < 21; index += 1) {
    const relative = `${ORGANIZATION_ID}/career-playbooks/${USER_ID}/playbook-${hex(index, 3)}.pdf`;
    const hash = syntheticHash(6, index);
    rows.push(playbookRowFor({ space: 6, index, storagePath: `uploads/${relative}`, hash }));
    if (index < 3) {
      inventory.push({
        root: 'development',
        relative_path: relative,
        size: 4000 + index,
        sha256: hash,
      });
    } else {
      playbookRows.push({
        id: playbookSourceId(index),
        playbook_id: PLAYBOOK_ID,
        organization_id: ORGANIZATION_ID,
        user_id: USER_ID,
        file_catalog_id: rowId(6, index),
        status: 'failed',
        error_message: 'source unavailable',
      });
    }
  }

  return { rows, playbookRows, inventory };
}

const OPTIONS = {
  runId: RUN_ID,
  releaseSha: RELEASE_SHA,
  generatedAt: GENERATED_AT,
  operatorImageDigest: OPERATOR_DIGEST,
  sourceAuditVersion: 'mc2-jz6y0.13.4-accepted-v1',
  developmentRoot: DEVELOPMENT_ROOT,
  productionRoot: PRODUCTION_ROOT,
} as const;

function build(input: Corpus = corpus()) {
  return buildSourceRecoveryPlanInput({ ...input, options: OPTIONS });
}

describe('.13.4.1 plan-input generator: buildSourceRecoveryPlanInput', () => {
  it('rebuilds the exact audited manifest shape from the catalog projection and inventory', () => {
    const manifest = build();
    expect(manifest.schema_version).toBe('megacampus.qdrant.source-recovery/v1');
    expect(manifest.run_id).toBe(RUN_ID);
    expect(manifest.pre_counts).toEqual({
      total: 261,
      eligible: 240,
      recoverable: 109,
      missing: 129,
      invalid: 2,
      unsupported: 21,
    });
    expect(manifest.expected_post_counts).toEqual({
      total: 261,
      eligible: 240,
      recoverable: 234,
      missing: 4,
      invalid: 2,
      unsupported: 21,
    });
    expect(manifest.copies).toHaveLength(42);
    expect(
      manifest.copies.reduce((total, entry) => total + entry.affected_file_catalog_rows, 0)
    ).toBe(125);
    expect(
      manifest.dispositions.filter(entry => entry.kind === 'eligible_unrecoverable')
    ).toHaveLength(6);
    expect(
      manifest.dispositions.filter(entry => entry.kind === 'career_playbook_retained_derived')
    ).toHaveLength(18);
  });

  it('is deterministic: shuffled inputs produce byte-identical canonical manifests', () => {
    const first = build();
    const scrambled = corpus();
    scrambled.rows.reverse();
    scrambled.inventory.reverse();
    scrambled.playbookRows.reverse();
    const second = build(scrambled);
    expect(calculateRecoveryManifestSha256(second)).toBe(calculateRecoveryManifestSha256(first));
  });

  it('mirrors Set A targets and picks the lexicographically smallest Set B candidate', () => {
    const manifest = build();
    const mirror = manifest.copies.find(entry =>
      entry.target_relative_path.endsWith('alternate-000.pdf')
    );
    expect(mirror).toMatchObject({
      source_relative_path: `${ORGANIZATION_ID}/${COURSE_ID}/alternate-000.pdf`,
      expected_size: 2000,
      expected_sha256: syntheticHash(2, 0),
      affected_file_catalog_rows: 2,
    });
    const content = manifest.copies.find(entry =>
      entry.target_relative_path.endsWith('original-000.pdf')
    );
    expect(content).toMatchObject({
      source_relative_path: `${ORGANIZATION_ID}/copies/content-0/candidate-0.pdf`,
      expected_size: 3000,
      expected_sha256: syntheticHash(3, 0),
      affected_file_catalog_rows: 20,
    });
  });

  it('binds disposition predicates to the exact catalog and playbook rows', () => {
    const manifest = build();
    const invalid = manifest.dispositions.find(entry =>
      entry.expected_storage_path.endsWith('invalid-0.txt')
    );
    expect(invalid).toMatchObject({
      kind: 'eligible_unrecoverable',
      reason: 'source_file_unrecoverable',
      organization_id: ORGANIZATION_ID,
      course_id: COURSE_ID,
      expected_vector_status: 'pending',
      expected_file_error_message: null,
    });
    const playbook = manifest.dispositions.find(entry => entry.file_catalog_id === rowId(6, 20));
    expect(playbook).toMatchObject({
      kind: 'career_playbook_retained_derived',
      reason: 'retained-derived-only',
      course_id: null,
      career_playbook_source_id: playbookSourceId(20),
      expected_career_playbook: {
        playbook_id: PLAYBOOK_ID,
        user_id: USER_ID,
        status: 'failed',
        error_message: 'source unavailable',
      },
    });
  });

  it('fails closed when the corpus drifts from the audited totals', () => {
    const missingCanonical = corpus();
    missingCanonical.inventory = missingCanonical.inventory.filter(
      entry => !entry.relative_path.endsWith('canonical-000.pdf')
    );
    expect(() => build(missingCanonical)).toThrow(/audited/iu);

    const mismatchedAlternate = corpus();
    for (const entry of mismatchedAlternate.inventory) {
      if (entry.relative_path.endsWith('alternate-000.pdf')) entry.sha256 = 'e'.repeat(64);
    }
    expect(() => build(mismatchedAlternate)).toThrow(/audited/iu);

    const absentPlaybookRow = corpus();
    absentPlaybookRow.playbookRows = absentPlaybookRow.playbookRows.slice(1);
    expect(() => build(absentPlaybookRow)).toThrow(/career playbook/iu);
  });

  it('fails closed when rows sharing a storage path disagree on content hash', () => {
    const drifted = corpus();
    const shared = drifted.rows.filter(row => row.storagePath.endsWith('original-000.pdf'));
    expect(shared).toHaveLength(20);
    // Both rows stay content-recoverable (the other content's candidates match), but they now
    // disagree about which bytes their shared target must carry — an impossible copy plan.
    shared[19].hash = syntheticHash(3, 1);
    expect(() => build(drifted)).toThrow(/hash/iu);
  });
});

describe('.13.4.1 plan-input generator: CLI surface', () => {
  const VALID_ARGV = [
    '--output',
    '/var/lib/megacampus-source-recovery/plan-input.json',
    '--run-id',
    RUN_ID,
    '--release-sha',
    RELEASE_SHA,
    '--operator-digest',
    OPERATOR_DIGEST,
    '--source-audit-version',
    'mc2-jz6y0.13.4-accepted-v1',
    '--development-root',
    DEVELOPMENT_ROOT,
    '--production-root',
    PRODUCTION_ROOT,
    '--generated-at',
    GENERATED_AT,
  ];

  it('parses a complete argv into normalized args', () => {
    expect(parseGeneratePlanInputArgv(VALID_ARGV)).toEqual({
      outputPath: '/var/lib/megacampus-source-recovery/plan-input.json',
      runId: RUN_ID,
      releaseSha: RELEASE_SHA,
      operatorImageDigest: OPERATOR_DIGEST,
      sourceAuditVersion: 'mc2-jz6y0.13.4-accepted-v1',
      developmentRoot: DEVELOPMENT_ROOT,
      productionRoot: PRODUCTION_ROOT,
      generatedAt: GENERATED_AT,
    });
  });

  it('rejects unknown flags, a relative output path, and malformed identities', () => {
    expect(() => parseGeneratePlanInputArgv([...VALID_ARGV, '--bogus', 'x'])).toThrow();
    expect(() =>
      parseGeneratePlanInputArgv(
        VALID_ARGV.map(part => (part.endsWith('plan-input.json') ? 'relative.json' : part))
      )
    ).toThrow(/absolute/iu);
    expect(() =>
      parseGeneratePlanInputArgv(VALID_ARGV.map(part => (part === RUN_ID ? 'not-a-uuid' : part)))
    ).toThrow(/run-id/iu);
    expect(() =>
      parseGeneratePlanInputArgv(
        VALID_ARGV.map(part => (part === OPERATOR_DIGEST ? 'sha256:xyz' : part))
      )
    ).toThrow(/digest/iu);
  });

  it('runs the generator through injected deps, writes canonical bytes, reports aggregates only', async () => {
    const input = corpus();
    const write = vi.fn();
    const report = await runGeneratePlanInput(
      parseGeneratePlanInputArgv(VALID_ARGV),
      {
        loadRows: vi.fn().mockResolvedValue(input.rows),
        loadPlaybookRows: vi.fn().mockResolvedValue(input.playbookRows),
        loadInventory: vi.fn().mockResolvedValue(input.inventory),
      },
      write
    );
    expect(write).toHaveBeenCalledOnce();
    const [outputPath, manifest] = write.mock.calls[0];
    expect(outputPath).toBe('/var/lib/megacampus-source-recovery/plan-input.json');
    expect(manifest.run_id).toBe(RUN_ID);
    expect(report).toEqual({
      ok: true,
      run_id: RUN_ID,
      manifest_sha256: calculateRecoveryManifestSha256(manifest),
      copies: 42,
      affected_rows: 125,
      eligible_dispositions: 6,
      career_playbook_dispositions: 18,
      pre_counts: manifest.pre_counts,
      expected_post_counts: manifest.expected_post_counts,
    });
    expect(JSON.stringify(report)).not.toContain(ORGANIZATION_ID);
  });

  describe('writePlanInputOwnerOnly (owner-only publish)', () => {
    it('creates the plan input 0600 with canonical manifest bytes', () => {
      const directory = mkdtempSync('/tmp/mc2-plan-input-writer-');
      try {
        const output = join(directory, 'plan-input.json');
        const manifest = build();
        writePlanInputOwnerOnly(output, manifest);
        expect(statSync(output).mode & 0o777).toBe(0o600);
        const bytes = readFileSync(output, 'utf8');
        expect(bytes).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });

    it('round-trips through the operator acceptance contract: raw bytes hash to the canonical sha', () => {
      // Mirrors source-recovery.ts loadReviewedRecoveryState/createPlan: the operator re-parses
      // the raw file and refuses it unless sha256(raw bytes) equals the canonical manifest sha
      // recomputed from the parsed object. This pins the generator→operator byte contract.
      const directory = mkdtempSync('/tmp/mc2-plan-input-writer-');
      try {
        const output = join(directory, 'plan-input.json');
        const manifest = build();
        writePlanInputOwnerOnly(output, manifest);
        const raw = readFileSync(output, 'utf8');
        const reparsed = JSON.parse(raw);
        expect(createHash('sha256').update(raw).digest('hex')).toBe(
          calculateRecoveryManifestSha256(reparsed)
        );
        expect(normalizeRecoveryManifest(reparsed)).toEqual(manifest);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });

    it('refuses an existing entry or planted symlink instead of writing through it', () => {
      const directory = mkdtempSync('/tmp/mc2-plan-input-writer-');
      try {
        const existing = join(directory, 'plan-input.json');
        writeFileSync(existing, 'pre-existing\n', { mode: 0o600 });
        expect(() => writePlanInputOwnerOnly(existing, build())).toThrow(/EEXIST/u);
        expect(readFileSync(existing, 'utf8')).toBe('pre-existing\n');

        const target = join(directory, 'victim');
        writeFileSync(target, 'victim\n', { mode: 0o600 });
        const linked = join(directory, 'linked.json');
        symlinkSync(target, linked);
        expect(() => writePlanInputOwnerOnly(linked, build())).toThrow(/EEXIST/u);
        expect(readFileSync(target, 'utf8')).toBe('victim\n');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });
});
