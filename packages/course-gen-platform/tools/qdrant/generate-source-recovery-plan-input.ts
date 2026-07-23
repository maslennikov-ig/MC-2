import { createHash } from 'node:crypto';
import { closeSync, fchmodSync, openSync, writeSync } from 'node:fs';
import { opendir, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path';

import type { ReindexSourceRow } from './reindex-plan';
import { buildReindexPlan, loadReindexSources } from './reindex-plan';
import { createSourceDatabase } from './reindex-course-embeddings';
import {
  createRecoveryDispositionDatabase,
  createSupabaseRecoveryGateway,
  type RecoveryPlaybookRow,
  type RecoverySupabaseClient,
} from './source-recovery-database';
import {
  calculateRecoveryManifestSha256,
  normalizeRecoveryManifest,
  type SourceRecoveryManifest,
} from './source-recovery-manifest';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';

/**
 * `.13.4.1` reviewed plan-input regeneration. The accepted `.13.4` source audit deliberately kept
 * every identity in a disposable owner-only directory, so the reviewed recovery manifest the
 * wrapper consumes (`--plan-input`) must be REGENERATED from a fresh read-only catalog projection
 * plus a size+sha256 inventory of both upload roots. The audited truths are pinned fail-closed:
 * `261 = 240 eligible (109 canonical + 67 Set A over 39 mirror targets + 58 Set B over 3 content
 * targets + 4 missing + 2 invalid) + 21 non-eligible (3 development-present + 18 absent Career
 * Playbook)`, i.e. exactly 42 copies restoring 125 rows and 6+18 owner-approved dispositions.
 * Any drift from that classification refuses to emit a manifest. The operator `plan` mode
 * re-verifies the same totals and every per-row predicate live before publishing the immutable
 * state manifest, so this generator can never smuggle an unaudited mutation.
 *
 * Identities never leave the manifest file: the CLI report carries aggregate counts and the
 * canonical manifest sha256 only. Kept side-effect-free on import for unit-driven parts.
 */

const STORAGE_PREFIX = 'uploads/';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40,64}$/u;
const OPERATOR_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const RECOVERY_VECTOR_STATUSES = new Set(['pending', 'indexing', 'indexed', 'failed']);

// Identities (paths, catalog ids) must never leave the owner-only manifest: error messages carry
// only a short sha256 correlator that the operator can recompute against the protected data.
function redact(identity: string): string {
  return createHash('sha256').update(identity).digest('hex').slice(0, 12);
}

const EXACT_PRE_COUNTS = {
  total: 261,
  eligible: 240,
  recoverable: 109,
  missing: 129,
  invalid: 2,
  unsupported: 21,
} as const;
const EXACT_POST_COUNTS = {
  total: 261,
  eligible: 240,
  recoverable: 234,
  missing: 4,
  invalid: 2,
  unsupported: 21,
} as const;
const EXACT_COPIES = 42;
const EXACT_AFFECTED_ROWS = 125;
const EXACT_ELIGIBLE_DISPOSITIONS = 6;
const EXACT_PLAYBOOK_DISPOSITIONS = 18;

export interface RecoverySourceInventoryEntry {
  root: 'development' | 'production';
  relative_path: string;
  size: number;
  sha256: string;
}

export interface SourceRecoveryPlanInputOptions {
  runId: string;
  releaseSha: string;
  generatedAt: string;
  operatorImageDigest: string;
  sourceAuditVersion: string;
  developmentRoot: string;
  productionRoot: string;
}

interface RowClassification {
  canonical: ReindexSourceRow[];
  mirror: ReindexSourceRow[];
  content: ReindexSourceRow[];
  missing: ReindexSourceRow[];
  invalid: ReindexSourceRow[];
  unsupportedPresent: ReindexSourceRow[];
  unsupportedAbsent: ReindexSourceRow[];
}

function isNormalizedRelativeStoragePath(storagePath: string): boolean {
  if (isAbsolute(storagePath) || storagePath.includes('\\')) return false;
  const components = storagePath.split('/');
  if (components.some(component => component === '' || component === '.' || component === '..')) {
    return false;
  }
  return storagePath.startsWith(STORAGE_PREFIX) && storagePath.length > STORAGE_PREFIX.length;
}

function classifyRows(
  rows: readonly ReindexSourceRow[],
  productionByPath: ReadonlyMap<string, RecoverySourceInventoryEntry>,
  developmentByPath: ReadonlyMap<string, RecoverySourceInventoryEntry>,
  developmentByHash: ReadonlyMap<string, readonly RecoverySourceInventoryEntry[]>
): RowClassification {
  // Eligibility and the pre-copy gap taxonomy come from the SAME `buildReindexPlan` the operator
  // `plan` mode re-derives live (readSourceCounts), so the generator can never accept a row the
  // operator would refuse. The probe is hash-exact: a canonical path whose bytes drifted from the
  // catalog hash is NOT recoverable here (stricter than the readability-only live probe — any
  // such drift surfaces as a fail-closed count mismatch instead of a silent copy plan).
  const probe = (row: ReindexSourceRow): boolean | 'invalid_source_path' => {
    if (!isNormalizedRelativeStoragePath(row.storagePath)) return 'invalid_source_path';
    const relativePath = row.storagePath.slice(STORAGE_PREFIX.length);
    return productionByPath.get(relativePath)?.sha256 === row.hash;
  };
  const plan = buildReindexPlan(rows, probe);
  const reasonByFileId = new Map(plan.gaps.map(gap => [gap.fileId, gap.reason]));
  const canonicalIds = new Set([...plan.candidateFileIds, ...plan.alreadyEnqueuedFileIds]);

  const classification: RowClassification = {
    canonical: [],
    mirror: [],
    content: [],
    missing: [],
    invalid: [],
    unsupportedPresent: [],
    unsupportedAbsent: [],
  };
  for (const row of rows) {
    if (canonicalIds.has(row.id)) {
      classification.canonical.push(row);
      continue;
    }
    const reason = reasonByFileId.get(row.id);
    const relativePath = isNormalizedRelativeStoragePath(row.storagePath)
      ? row.storagePath.slice(STORAGE_PREFIX.length)
      : null;
    if (reason === 'source_missing') {
      if (developmentByPath.get(relativePath as string)?.sha256 === row.hash) {
        classification.mirror.push(row);
      } else if ((developmentByHash.get(row.hash)?.length ?? 0) > 0) {
        classification.content.push(row);
      } else {
        classification.missing.push(row);
      }
    } else if (reason === 'invalid_source_path') {
      classification.invalid.push(row);
    } else if (reason !== undefined) {
      const present =
        (relativePath !== null &&
          (productionByPath.get(relativePath)?.sha256 === row.hash ||
            developmentByPath.get(relativePath)?.sha256 === row.hash)) ||
        (developmentByHash.get(row.hash)?.length ?? 0) > 0;
      (present ? classification.unsupportedPresent : classification.unsupportedAbsent).push(row);
    } else {
      throw new Error(`Row ${redact(row.id)} has no reindex-plan classification`);
    }
  }
  return classification;
}

function indexInventory(inventory: readonly RecoverySourceInventoryEntry[]): {
  productionByPath: Map<string, RecoverySourceInventoryEntry>;
  developmentByPath: Map<string, RecoverySourceInventoryEntry>;
  developmentByHash: Map<string, RecoverySourceInventoryEntry[]>;
} {
  const productionByPath = new Map<string, RecoverySourceInventoryEntry>();
  const developmentByPath = new Map<string, RecoverySourceInventoryEntry>();
  const developmentByHash = new Map<string, RecoverySourceInventoryEntry[]>();
  for (const entry of inventory) {
    const byPath = entry.root === 'production' ? productionByPath : developmentByPath;
    if (byPath.has(entry.relative_path)) {
      throw new Error(`Duplicate ${entry.root} inventory path ${redact(entry.relative_path)}`);
    }
    byPath.set(entry.relative_path, entry);
    if (entry.root === 'development') {
      const bucket = developmentByHash.get(entry.sha256) ?? [];
      bucket.push(entry);
      developmentByHash.set(entry.sha256, bucket);
    }
  }
  for (const bucket of developmentByHash.values()) {
    bucket.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  }
  return { productionByPath, developmentByPath, developmentByHash };
}

function groupCopyRows(
  rows: readonly ReindexSourceRow[],
  label: string
): Map<string, { hash: string; rows: ReindexSourceRow[] }> {
  const byTarget = new Map<string, { hash: string; rows: ReindexSourceRow[] }>();
  for (const row of rows) {
    const target = row.storagePath.slice(STORAGE_PREFIX.length);
    const group = byTarget.get(target);
    if (!group) {
      byTarget.set(target, { hash: row.hash, rows: [row] });
      continue;
    }
    if (group.hash !== row.hash) {
      throw new Error(`Rows sharing ${label} target ${redact(target)} disagree on content hash`);
    }
    group.rows.push(row);
  }
  return byTarget;
}

function requireVectorStatus(row: ReindexSourceRow): 'pending' | 'indexing' | 'indexed' | 'failed' {
  if (!RECOVERY_VECTOR_STATUSES.has(row.vectorStatus)) {
    throw new Error(`Row ${redact(row.id)} carries an unsupported vector status`);
  }
  return row.vectorStatus as 'pending' | 'indexing' | 'indexed' | 'failed';
}

export function buildSourceRecoveryPlanInput(input: {
  rows: readonly ReindexSourceRow[];
  playbookRows: readonly RecoveryPlaybookRow[];
  inventory: readonly RecoverySourceInventoryEntry[];
  options: SourceRecoveryPlanInputOptions;
}): SourceRecoveryManifest {
  const { productionByPath, developmentByPath, developmentByHash } = indexInventory(
    input.inventory
  );
  const rows = [...input.rows].sort((left, right) => left.id.localeCompare(right.id));
  const classification = classifyRows(rows, productionByPath, developmentByPath, developmentByHash);

  const preCounts = {
    total: rows.length,
    eligible:
      classification.canonical.length +
      classification.mirror.length +
      classification.content.length +
      classification.missing.length +
      classification.invalid.length,
    recoverable: classification.canonical.length,
    missing:
      classification.mirror.length + classification.content.length + classification.missing.length,
    invalid: classification.invalid.length,
    unsupported: classification.unsupportedPresent.length + classification.unsupportedAbsent.length,
  };
  const postCounts = {
    ...preCounts,
    recoverable:
      classification.canonical.length +
      classification.mirror.length +
      classification.content.length,
    missing: classification.missing.length,
  };

  const mirrorGroups = groupCopyRows(classification.mirror, 'Set A');
  const contentGroups = groupCopyRows(classification.content, 'Set B');
  const copyPlans: Array<{
    target: string;
    source: RecoverySourceInventoryEntry;
    rows: ReindexSourceRow[];
  }> = [];
  for (const [target, group] of mirrorGroups) {
    const source = developmentByPath.get(target);
    if (!source || source.sha256 !== group.hash) {
      throw new Error(`Set A mirror source drifted for target ${redact(target)}`);
    }
    copyPlans.push({ target, source, rows: group.rows });
  }
  for (const [target, group] of contentGroups) {
    const candidates = developmentByHash.get(group.hash) ?? [];
    if (candidates.length === 0) {
      throw new Error(`Set B content source drifted for target ${redact(target)}`);
    }
    copyPlans.push({ target, source: candidates[0], rows: group.rows });
  }
  copyPlans.sort((left, right) => left.target.localeCompare(right.target));

  const driftReport = JSON.stringify({
    pre: preCounts,
    post: postCounts,
    copies: copyPlans.length,
    affected_rows: copyPlans.reduce((total, plan) => total + plan.rows.length, 0),
    eligible_dispositions: classification.missing.length + classification.invalid.length,
    career_playbook_dispositions: classification.unsupportedAbsent.length,
  });
  if (
    !sameCounts(preCounts, EXACT_PRE_COUNTS) ||
    !sameCounts(postCounts, EXACT_POST_COUNTS) ||
    copyPlans.length !== EXACT_COPIES ||
    copyPlans.reduce((total, plan) => total + plan.rows.length, 0) !== EXACT_AFFECTED_ROWS ||
    classification.missing.length + classification.invalid.length !== EXACT_ELIGIBLE_DISPOSITIONS ||
    classification.unsupportedAbsent.length !== EXACT_PLAYBOOK_DISPOSITIONS
  ) {
    throw new Error(
      `Classification does not match the exact audited recovery totals: ${driftReport}`
    );
  }

  const copies = copyPlans.map((plan, index) => ({
    entry_id: `copy-${String(index + 1).padStart(3, '0')}`,
    source_relative_path: plan.source.relative_path,
    target_relative_path: plan.target,
    expected_size: plan.source.size,
    expected_sha256: plan.source.sha256,
    affected_file_catalog_rows: plan.rows.length,
  }));

  const playbookByFileId = new Map(input.playbookRows.map(row => [row.file_catalog_id, row]));
  const dispositionRows = [
    ...classification.missing.map(row => ({ row, kind: 'eligible_unrecoverable' as const })),
    ...classification.invalid.map(row => ({ row, kind: 'eligible_unrecoverable' as const })),
    ...classification.unsupportedAbsent.map(row => ({
      row,
      kind: 'career_playbook_retained_derived' as const,
    })),
  ].sort((left, right) => left.row.id.localeCompare(right.row.id));
  const dispositions = dispositionRows.map((entry, index) => {
    const base = {
      entry_id: `disposition-${String(index + 1).padStart(3, '0')}`,
      kind: entry.kind,
      file_catalog_id: entry.row.id,
      organization_id: entry.row.organizationId,
      course_id: entry.row.courseId,
      expected_hash: entry.row.hash,
      expected_storage_path: entry.row.storagePath,
      expected_vector_status: requireVectorStatus(entry.row),
      expected_file_error_message: entry.row.errorMessage,
    };
    if (entry.kind === 'eligible_unrecoverable') {
      return { ...base, reason: 'source_file_unrecoverable' as const };
    }
    const playbook = playbookByFileId.get(entry.row.id);
    if (!playbook) {
      throw new Error(
        `Absent Career Playbook row ${redact(entry.row.id)} has no playbook source row`
      );
    }
    return {
      ...base,
      career_playbook_source_id: playbook.id,
      expected_career_playbook: {
        playbook_id: playbook.playbook_id,
        user_id: playbook.user_id,
        status: playbook.status,
        error_message: playbook.error_message,
      },
      reason: 'retained-derived-only' as const,
    };
  });

  return normalizeRecoveryManifest({
    schema_version: 'megacampus.qdrant.source-recovery/v1',
    run_id: input.options.runId,
    release_sha: input.options.releaseSha,
    generated_at: input.options.generatedAt,
    operator_image_digest: input.options.operatorImageDigest,
    source_audit_version: input.options.sourceAuditVersion,
    development_root: input.options.developmentRoot,
    production_root: input.options.productionRoot,
    pre_counts: preCounts,
    expected_post_counts: postCounts,
    copies,
    dispositions,
  });
}

function sameCounts(
  left: Record<string, number>,
  right: Readonly<Record<string, number>>
): boolean {
  return Object.keys(right).every(key => left[key] === right[key]);
}

export interface GeneratePlanInputArgs {
  outputPath: string;
  runId: string;
  releaseSha: string;
  operatorImageDigest: string;
  sourceAuditVersion: string;
  developmentRoot: string;
  productionRoot: string;
  generatedAt: string;
}

const FLAG_TO_KEY: Readonly<Record<string, keyof GeneratePlanInputArgs>> = {
  '--output': 'outputPath',
  '--run-id': 'runId',
  '--release-sha': 'releaseSha',
  '--operator-digest': 'operatorImageDigest',
  '--source-audit-version': 'sourceAuditVersion',
  '--development-root': 'developmentRoot',
  '--production-root': 'productionRoot',
  '--generated-at': 'generatedAt',
};

export function parseGeneratePlanInputArgv(argv: readonly string[]): GeneratePlanInputArgs {
  const parsed: Partial<GeneratePlanInputArgs> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    const key = FLAG_TO_KEY[flag];
    if (key === undefined || value === undefined) {
      throw new Error(`Unknown or incomplete plan-input generator argument: ${flag}`);
    }
    parsed[key] = value;
  }
  const required: Array<keyof GeneratePlanInputArgs> = [
    'outputPath',
    'runId',
    'releaseSha',
    'operatorImageDigest',
    'sourceAuditVersion',
    'developmentRoot',
    'productionRoot',
  ];
  for (const key of required) {
    if (!parsed[key]) {
      throw new Error(
        'plan-input generator requires --output --run-id --release-sha --operator-digest ' +
          '--source-audit-version --development-root --production-root [--generated-at]'
      );
    }
  }
  const args = { generatedAt: new Date().toISOString(), ...parsed } as GeneratePlanInputArgs;
  for (const path of [args.outputPath, args.developmentRoot, args.productionRoot]) {
    if (!isAbsolute(path) || resolvePath(path) !== path) {
      throw new Error('plan-input generator paths must be explicit normalized absolute paths');
    }
  }
  if (!UUID_V4_PATTERN.test(args.runId)) {
    throw new Error('plan-input generator --run-id must be a lower-case UUIDv4');
  }
  if (!RELEASE_SHA_PATTERN.test(args.releaseSha)) {
    throw new Error('plan-input generator --release-sha must be a lower-case hex git sha');
  }
  if (!OPERATOR_DIGEST_PATTERN.test(args.operatorImageDigest)) {
    throw new Error('plan-input generator --operator-digest must be a sha256:<hex64> digest');
  }
  return args;
}

export function writePlanInputOwnerOnly(
  outputPath: string,
  manifest: SourceRecoveryManifest
): void {
  // Same publish hardening as the acceptance emit: create-new only ('wx' refuses an existing
  // entry INCLUDING a planted symlink), then finalize the mode on the owned descriptor. The
  // bytes are the canonical manifest serialization, so the wrapper's raw-sha check holds.
  const content = `${JSON.stringify(normalizeRecoveryManifest(manifest), null, 2)}\n`;
  const contentSha = createHash('sha256').update(content).digest('hex');
  if (contentSha !== calculateRecoveryManifestSha256(manifest)) {
    throw new Error('Plan-input serialization diverged from canonical manifest bytes');
  }
  const fd = openSync(outputPath, 'wx', 0o600);
  try {
    writeSync(fd, content, null, 'utf-8');
    fchmodSync(fd, 0o600);
  } finally {
    closeSync(fd);
  }
}

export interface GeneratePlanInputDependencies {
  loadRows(): Promise<ReindexSourceRow[]>;
  loadPlaybookRows(fileCatalogIds: readonly string[]): Promise<RecoveryPlaybookRow[]>;
  loadInventory(
    developmentRoot: string,
    productionRoot: string
  ): Promise<RecoverySourceInventoryEntry[]>;
}

export interface GeneratePlanInputReport {
  ok: true;
  run_id: string;
  manifest_sha256: string;
  copies: number;
  affected_rows: number;
  eligible_dispositions: number;
  career_playbook_dispositions: number;
  pre_counts: SourceRecoveryManifest['pre_counts'];
  expected_post_counts: SourceRecoveryManifest['expected_post_counts'];
}

export async function runGeneratePlanInput(
  args: GeneratePlanInputArgs,
  dependencies: GeneratePlanInputDependencies,
  write: (outputPath: string, manifest: SourceRecoveryManifest) => void = writePlanInputOwnerOnly
): Promise<GeneratePlanInputReport> {
  const rows = await dependencies.loadRows();
  const inventory = await dependencies.loadInventory(args.developmentRoot, args.productionRoot);
  const { productionByPath, developmentByPath, developmentByHash } = indexInventory(inventory);
  const classification = classifyRows(
    [...rows].sort((left, right) => left.id.localeCompare(right.id)),
    productionByPath,
    developmentByPath,
    developmentByHash
  );
  const playbookRows = await dependencies.loadPlaybookRows(
    classification.unsupportedAbsent.map(row => row.id).sort()
  );
  const manifest = buildSourceRecoveryPlanInput({
    rows,
    playbookRows,
    inventory,
    options: {
      runId: args.runId,
      releaseSha: args.releaseSha,
      generatedAt: args.generatedAt,
      operatorImageDigest: args.operatorImageDigest,
      sourceAuditVersion: args.sourceAuditVersion,
      developmentRoot: args.developmentRoot,
      productionRoot: args.productionRoot,
    },
  });
  write(args.outputPath, manifest);
  return {
    ok: true,
    run_id: manifest.run_id,
    manifest_sha256: calculateRecoveryManifestSha256(manifest),
    copies: manifest.copies.length,
    affected_rows: manifest.copies.reduce(
      (total, entry) => total + entry.affected_file_catalog_rows,
      0
    ),
    eligible_dispositions: manifest.dispositions.filter(
      entry => entry.kind === 'eligible_unrecoverable'
    ).length,
    career_playbook_dispositions: manifest.dispositions.filter(
      entry => entry.kind === 'career_playbook_retained_derived'
    ).length,
    pre_counts: manifest.pre_counts,
    expected_post_counts: manifest.expected_post_counts,
  };
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(path);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolveHash());
    stream.on('error', rejectHash);
  });
  return hash.digest('hex');
}

async function walkRoot(
  root: 'development' | 'production',
  rootPath: string
): Promise<RecoverySourceInventoryEntry[]> {
  const resolvedRoot = await realpath(rootPath);
  const entries: RecoverySourceInventoryEntry[] = [];
  const pending: string[] = [resolvedRoot];
  while (pending.length > 0) {
    const directory = pending.pop() as string;
    const handle = await opendir(directory);
    for await (const item of handle) {
      const path = join(directory, item.name);
      if (item.isDirectory()) {
        pending.push(path);
      } else if (item.isFile()) {
        const relativePath = relative(resolvedRoot, path).split(sep).join('/');
        const details = await stat(path);
        entries.push({
          root,
          relative_path: relativePath,
          size: details.size,
          sha256: await hashFile(path),
        });
      }
      // Symlinks and special files are deliberately excluded: the audit hashed regular files only.
    }
  }
  return entries;
}

export function createDefaultGeneratePlanInputDependencies(): GeneratePlanInputDependencies {
  return {
    loadRows: () => loadReindexSources(createSourceDatabase()),
    loadPlaybookRows: fileCatalogIds =>
      createRecoveryDispositionDatabase(
        createSupabaseRecoveryGateway(getSupabaseAdmin() as unknown as RecoverySupabaseClient)
      ).listCareerPlaybookExpectedRows(fileCatalogIds),
    loadInventory: async (developmentRoot, productionRoot) => [
      ...(await walkRoot('development', developmentRoot)),
      ...(await walkRoot('production', productionRoot)),
    ],
  };
}

async function main(): Promise<void> {
  const args = parseGeneratePlanInputArgv(process.argv.slice(2));
  const report = await runGeneratePlanInput(args, createDefaultGeneratePlanInputDependencies());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('generate-source-recovery-plan-input.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
