import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  parseEmitSourceForwardAcceptanceArgv,
  runEmitSourceForwardAcceptance,
  writeSourceForwardAcceptanceAuthority,
} from '../../../../tools/qdrant/emit-source-forward-acceptance';
import {
  calculateRecoveryManifestSha256,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest';

// W7a real leg CLI: parse the source.forward acceptance emit argv and drive computeSourceForwardAcceptance,
// writing the authority through an injectable writer. Infra-free (synthetic single-course manifest +
// fake evidence repository + fake writer).
const RECOVERY_RUN_ID = '51000000-0000-4000-8000-000000000005';
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const COURSE_ID = '20000000-0000-4000-8000-000000000002';
const RUN_ID = '52000000-0000-4000-8000-000000000005';

function manifest(): SourceRecoveryManifest {
  return {
    schema_version: 'megacampus.qdrant.source-recovery/v1',
    run_id: RECOVERY_RUN_ID,
    release_sha: 'b'.repeat(40),
    generated_at: '2026-07-12T12:00:00.000Z',
    operator_image_digest: `sha256:${'c'.repeat(64)}`,
    source_audit_version: 'unit-reviewed-v1',
    development_root: '/srv/megacampus/uploads-dev',
    production_root: '/srv/megacampus/uploads',
    pre_counts: { total: 6, eligible: 6, recoverable: 0, missing: 4, invalid: 2, unsupported: 0 },
    expected_post_counts: {
      total: 6,
      eligible: 6,
      recoverable: 0,
      missing: 4,
      invalid: 2,
      unsupported: 0,
    },
    copies: [],
    dispositions: Array.from({ length: 6 }, (_, index) => ({
      entry_id: `eligible-${index}`,
      kind: 'eligible_unrecoverable' as const,
      file_catalog_id: `e0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      organization_id: ORGANIZATION_ID,
      course_id: COURSE_ID,
      expected_hash: 'a'.repeat(64),
      expected_storage_path: `uploads/org/course/audited-${index}.pdf`,
      expected_vector_status: 'pending' as const,
      expected_file_error_message: null,
      reason: 'source_file_unrecoverable' as const,
    })),
  };
}

function deps() {
  const value = manifest();
  return {
    loadReviewedRecoveryState: vi.fn().mockResolvedValue({
      manifest: value,
      manifestSha256: calculateRecoveryManifestSha256(value),
      journal: {
        schema_version: 'megacampus.qdrant.source-recovery-progress/v1',
        run_id: value.run_id,
        manifest_sha256: calculateRecoveryManifestSha256(value),
        revision: 48,
        phase: 'verified',
        copy_states: {},
        disposition_kinds: Object.fromEntries(
          value.dispositions.map(entry => [entry.entry_id, entry.kind])
        ),
        disposition_states: Object.fromEntries(
          value.dispositions.map(entry => [entry.entry_id, 'disposition_verified'])
        ),
      },
    }),
    evidenceRepository: {
      getAcceptedRun: vi.fn((runId: string) => Promise.resolve({ id: runId, status: 'accepted' })),
      listItems: vi.fn(() =>
        Promise.resolve(
          value.dispositions.map(entry => ({
            document_id: entry.file_catalog_id,
            document_name: 'doc',
            priority: 'CORE',
            authority_scope: 'course_source',
            content_quality: 0,
            course_relevance: 0,
            processing_mode: 'metadata_only',
            summary: null,
            key_claims: [],
            terminology: [],
            constraints: [],
            limitations: [],
            coverage_status: 'failed',
            coverage_reason: 'source_file_unrecoverable',
            token_counts: { original: 0, summary: 0, allocated: 0 },
          }))
        )
      ),
    },
  };
}

const VALID_ARGV = [
  '--manifest',
  '/secure/recovery/manifest.json',
  '--journal',
  '/secure/recovery/journal.json',
  '--recovery-run-id',
  RECOVERY_RUN_ID,
  '--accepted-coverage-run',
  `${ORGANIZATION_ID}:${COURSE_ID}:${RUN_ID}`,
  '--output',
  '/opt/megacampus/backups/q12/run/source-forward-acceptance.json',
];

describe('W7a real leg: emit-source-forward-acceptance CLI', () => {
  it('parses a complete argv into normalized args', () => {
    expect(parseEmitSourceForwardAcceptanceArgv(VALID_ARGV)).toEqual({
      manifestPath: '/secure/recovery/manifest.json',
      journalPath: '/secure/recovery/journal.json',
      recoveryRunId: RECOVERY_RUN_ID,
      coverageRun: `${ORGANIZATION_ID}:${COURSE_ID}:${RUN_ID}`,
      outputPath: '/opt/megacampus/backups/q12/run/source-forward-acceptance.json',
    });
  });

  it('rejects an unknown flag and a relative output path', () => {
    expect(() => parseEmitSourceForwardAcceptanceArgv([...VALID_ARGV, '--bogus', 'x'])).toThrow();
    expect(() =>
      parseEmitSourceForwardAcceptanceArgv(
        VALID_ARGV.map(part =>
          part.endsWith('.json') && part.startsWith('/opt') ? 'relative.json' : part
        )
      )
    ).toThrow(/absolute/iu);
  });

  it('computes the authority and writes it through the injected writer', async () => {
    const write = vi.fn();
    const args = parseEmitSourceForwardAcceptanceArgv(VALID_ARGV);
    const authority = await runEmitSourceForwardAcceptance(args, deps(), write);
    expect(authority.schema).toBe('megacampus.q12.source-forward-acceptance/v1');
    expect(authority.recovery_manifest_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(authority.coverage_fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(authority.coverage_run).toBe(`${ORGANIZATION_ID}:${COURSE_ID}:${RUN_ID}`);
    expect(write).toHaveBeenCalledExactlyOnceWith(args.outputPath, authority);
  });

  it('fails closed on a coverage run that is not an org:course:run triple', async () => {
    const write = vi.fn();
    await expect(
      runEmitSourceForwardAcceptance(
        { ...parseEmitSourceForwardAcceptanceArgv(VALID_ARGV), coverageRun: 'a:b' },
        deps(),
        write
      )
    ).rejects.toThrow(/organization:course:run/iu);
    expect(write).not.toHaveBeenCalled();
  });

  describe('writeSourceForwardAcceptanceAuthority (root-safe publish)', () => {
    const AUTHORITY = {
      schema: 'megacampus.q12.source-forward-acceptance/v1',
      recovery_manifest_sha256: 'a'.repeat(64),
      coverage_fingerprint: 'b'.repeat(64),
      coverage_run: `${ORGANIZATION_ID}:${COURSE_ID}:${RUN_ID}`,
    } as const;

    it('creates the authority owner-only 0400 with exact single-line content', () => {
      const directory = mkdtempSync('/tmp/mc2-emit-writer-');
      try {
        const output = join(directory, 'source-forward-acceptance.json');
        writeSourceForwardAcceptanceAuthority(output, AUTHORITY);
        expect(statSync(output).mode & 0o777).toBe(0o400);
        expect(readFileSync(output, 'utf8')).toBe(`${JSON.stringify(AUTHORITY)}\n`);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });

    it('refuses an existing entry instead of truncating it', () => {
      const directory = mkdtempSync('/tmp/mc2-emit-writer-');
      try {
        const output = join(directory, 'source-forward-acceptance.json');
        writeFileSync(output, 'pre-existing\n', { mode: 0o600 });
        expect(() => writeSourceForwardAcceptanceAuthority(output, AUTHORITY)).toThrow(/EEXIST/u);
        expect(readFileSync(output, 'utf8')).toBe('pre-existing\n');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });

    it('refuses a planted symlink and never writes through it', () => {
      const directory = mkdtempSync('/tmp/mc2-emit-writer-');
      try {
        const target = join(directory, 'symlink-target');
        writeFileSync(target, 'victim\n', { mode: 0o600 });
        const output = join(directory, 'source-forward-acceptance.json');
        symlinkSync(target, output);
        expect(() => writeSourceForwardAcceptanceAuthority(output, AUTHORITY)).toThrow(/EEXIST/u);
        expect(readFileSync(target, 'utf8')).toBe('victim\n');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });
});
