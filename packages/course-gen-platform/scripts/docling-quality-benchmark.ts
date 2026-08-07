/**
 * Docling quality and chunking A/B harness.
 *
 * Runs the controlled corpus through the live MCP conversion boundary, then
 * chunks every case with every requested strategy and scores the result. Each
 * case persists its Markdown, raw JSON, normalized JSON, per-strategy chunks and
 * retrieval metrics under `.tmp/docling-benchmark/<label>/` so a claim can be
 * re-checked instead of believed.
 *
 * Honest-metric notes:
 *
 * - Heading hierarchy is asserted on the DISTINCT levels present, not on the
 *   deepest `#` count. A document with only H2 does not prove two levels.
 * - Retrieval is scored on two channels. `--dense` runs the PRODUCTION path —
 *   real Jina v3 vectors, one late-chunking call for every chunk exactly as
 *   `phase-5-embedding.ts` makes it, server-side BM25, RRF — and blocks; the
 *   offline BM25 proxy always runs and is an observation whenever the dense one
 *   is present. Without `--dense` the proxy blocks, and a win is only lexical
 *   reachability.
 * - The gate counts EVIDENCE ATOMS, never chunks: coverage of the facts the
 *   manifest declares for a question, plus two rank-discounted variants over
 *   the same fixed denominator. Chunk-level Recall/MRR/nDCG stay in the report
 *   as description, because both of their halves are properties of how finely
 *   the strategy cut the document rather than of the answer.
 * - Every scored top-k is written out as chunk ids, so "the same chunks in the
 *   same order" is a checkable claim rather than a recollection.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DoclingClient } from '../src/stages/stage2-document-processing/docling/client.js';
import type {
  DoclingConversionBundle,
  DoclingDocument,
} from '../src/stages/stage2-document-processing/docling/types.js';
import { DoclingServeChunker } from '../src/stages/stage2-document-processing/docling/serve-chunker.js';
import type { DoclingChunkingStrategy } from '../src/stages/stage2-document-processing/docling/serve-chunker.js';
import {
  assertConversionProducedText,
  EmptyConversionError,
} from '../src/stages/stage2-document-processing/phases/phase-1-docling-conversion.js';
import {
  evaluateHeadingHierarchy,
  type HeadingHierarchyExpectation,
} from '../src/shared/embeddings/heading-hierarchy.js';
import {
  checkStructure,
  type StructureExpectation,
} from '../src/stages/stage2-document-processing/docling/structure-assertions.js';
import {
  checkOcr,
  scoreOcr,
  type OcrExpectation,
  type OcrScore,
} from '../src/stages/stage2-document-processing/docling/ocr-assertions.js';
import { chunkWithStrategy } from '../src/shared/embeddings/chunking-strategy.js';
import {
  DEFAULT_CHUNKING_CONFIG,
  getAllChunks,
} from '../src/shared/embeddings/markdown-chunker.js';
import { enrichChunks } from '../src/shared/embeddings/metadata-enricher.js';
import { evaluateDenseRetrieval } from '../src/shared/embeddings/dense-retrieval-eval.js';
import {
  detectRetrievalRegressions,
  evaluateRetrieval,
  formatRetrievalRegression,
  RETRIEVAL_REGRESSION_EPSILON,
  type GroundTruthQuestion,
  type RetrievalReport,
} from '../src/shared/embeddings/retrieval-metrics.js';

const CONVERSION_PROFILES = ['baseline', 'pdf-heading-hierarchy'] as const;
type ConversionProfile = (typeof CONVERSION_PROFILES)[number];

interface BenchmarkCase {
  id: string;
  source: string;
  expectedTokens?: string[];
  expectedOrder?: string[];
  headingHierarchy?: Partial<Record<ConversionProfile, HeadingHierarchyExpectation>>;
  requiresNestedList?: boolean;
  minimumColspan?: number;
  structure?: StructureExpectation;
  ocr?: OcrExpectation;
  expectedError?: 'EmptyConversionError';
  provenance?: { minimumRefCoverage?: number; minimumLocationCoverage?: number };
  retrieval?: GroundTruthQuestion[];
}

interface Manifest {
  schemaVersion: number;
  cases: BenchmarkCase[];
}

interface StrategyOutcome {
  strategy: DoclingChunkingStrategy;
  chunkingProfileId: string;
  /** Live dense+sparse retrieval, only when --dense was requested. */
  denseRetrieval?: RetrievalReport | null;
  denseBilledTokens?: number;
  parentChunks: number;
  childChunks: number;
  avgChildTokens: number;
  refCoverage: number;
  locationCoverage: number;
  locationEligible: boolean;
  headingPathCoverage: number;
  durationMs: number;
  retrieval: RetrievalReport | null;
  error?: string;
}

interface CaseResult {
  id: string;
  status: 'passed' | 'failed';
  processingTimeMs: number;
  fromCache: boolean;
  documentKey?: string;
  markdownLength: number;
  pages: number;
  textElements: number;
  pictures: number;
  tables: number;
  assertions: Array<{ name: string; passed: boolean; details?: string }>;
  strategies: StrategyOutcome[];
  error?: string;
}

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const FIXTURE_ROOT = path.join(PACKAGE_ROOT, 'tests/integration/fixtures/docling-quality');
const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'manifest.json');
const ALL_STRATEGIES: DoclingChunkingStrategy[] = [
  'legacy_markdown',
  'docling_hierarchical',
  'docling_hybrid',
];

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * Reads an enumerated flag, refusing anything outside the allowed set.
 *
 * Casting the raw string instead would make a typo silent and, for
 * `--candidate`, dangerous: `docling_hybrd` matches no strategy, so the
 * blocking no-regression assertion is never emitted and the run reports green
 * exactly as `--candidate none` does — while the author believes a candidate
 * was gated.
 */
function choice<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = argument(name);
  if (raw === undefined) return fallback;
  const match = allowed.find(value => value === raw);
  if (match === undefined) {
    console.error(`${name}: неизвестное значение ${JSON.stringify(raw)}`);
    console.error(`Допустимо: ${allowed.join(', ')}`);
    process.exit(2);
  }
  return match;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ').trim();
}

function validateStableDocument(document: DoclingDocument): string[] {
  const failures: string[] = [];
  const items = [...document.texts, ...document.pictures, ...document.tables];
  if (items.some(item => !item.id || typeof item.id !== 'string'))
    failures.push('missing stable id');
  if (items.some(item => item.page_no < 1 || !Number.isInteger(item.page_no))) {
    failures.push('invalid page number');
  }
  if (
    items.some(
      item =>
        item.bbox !== undefined &&
        (item.bbox.length !== 4 || item.bbox.some(coordinate => !Number.isFinite(coordinate)))
    )
  ) {
    failures.push('invalid bounding box');
  }
  if (document.metadata.page_count < 1) failures.push('invalid page count');
  return failures;
}

function runtimeStats(): Record<string, string | number | null> {
  for (const container of [
    'megacampus-docling-serve',
    'docling-serve',
    'docling-mcp-docling-serve-1',
  ]) {
    try {
      const memory = execFileSync(
        'docker',
        ['stats', '--no-stream', '--format', '{{.MemUsage}}', container],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
      const restartCount = Number(
        execFileSync('docker', ['inspect', '-f', '{{.RestartCount}}', container], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
      );
      // `docker stats` answers `0B / 0B` for a name it cannot really measure and
      // still exits 0, so an empty reading must fall through to the next name
      // instead of being reported as a measurement.
      if (!memory || memory.startsWith('0B / 0B')) continue;
      return { serveContainer: container, serveMemory: memory, serveRestartCount: restartCount };
    } catch {
      // Try the next local/production container name.
    }
  }
  return { serveContainer: null, serveMemory: null, serveRestartCount: null };
}

/**
 * Runs one chunking strategy over an accepted conversion and scores it.
 */
async function runStrategy(
  strategy: DoclingChunkingStrategy,
  bundle: DoclingConversionBundle,
  benchmarkCase: BenchmarkCase,
  chunker: DoclingServeChunker,
  caseDirectory: string,
  dense: boolean
): Promise<StrategyOutcome> {
  const startedAt = Date.now();
  try {
    const result = await chunkWithStrategy(bundle.markdown, {
      strategy,
      source: { documentKey: bundle.documentKey, rawJsonPath: bundle.rawJsonPath },
      config: DEFAULT_CHUNKING_CONFIG,
      chunker,
    });

    await fs.writeFile(
      path.join(caseDirectory, `chunks-${strategy}.json`),
      `${JSON.stringify(
        {
          strategy: result.strategy,
          chunkingProfileId: result.chunkingProfileId,
          coverage: result.coverage,
          metadata: result.metadata,
          parents: result.parent_chunks,
          children: result.child_chunks,
        },
        null,
        2
      )}\n`
    );

    const headingPathCoverage =
      result.child_chunks.length > 0
        ? result.child_chunks.filter(chunk => chunk.heading_path !== 'Root').length /
          result.child_chunks.length
        : 0;

    let denseRetrieval: RetrievalReport | null = null;
    let denseBilledTokens = 0;
    if (dense && benchmarkCase.retrieval) {
      const enriched = enrichChunks(getAllChunks(result), {
        document_id: `bench-${benchmarkCase.id}`,
        document_name: benchmarkCase.id,
        organization_id: 'bench-org',
        course_id: 'bench-course',
        document_priority: 'CORE',
        document_weight: 1,
      });
      const evaluation = await evaluateDenseRetrieval(enriched, benchmarkCase.retrieval, {
        // Collection names must not collide across strategies or cases, and must
        // never be the production alias; the module refuses that outright.
        collectionName: `bench_${benchmarkCase.id}_${strategy}`.replace(/[^a-z0-9_]/giu, '_'),
        k: 5,
      });
      denseRetrieval = evaluation.report;
      denseBilledTokens = evaluation.billedTokens;
    }

    return {
      strategy: result.strategy,
      chunkingProfileId: result.chunkingProfileId,
      denseRetrieval,
      denseBilledTokens,
      parentChunks: result.parent_chunks.length,
      childChunks: result.child_chunks.length,
      avgChildTokens: result.metadata.avg_child_tokens,
      refCoverage: result.coverage.refCoverage,
      locationCoverage: result.coverage.locationCoverage,
      locationEligible: result.coverage.locationEligible,
      headingPathCoverage,
      durationMs: Date.now() - startedAt,
      retrieval: benchmarkCase.retrieval
        ? evaluateRetrieval(result.child_chunks, benchmarkCase.retrieval, 5)
        : null,
    };
  } catch (error) {
    return {
      strategy,
      chunkingProfileId: 'n/a',
      parentChunks: 0,
      childChunks: 0,
      avgChildTokens: 0,
      refCoverage: 0,
      locationCoverage: 0,
      locationEligible: false,
      headingPathCoverage: 0,
      durationMs: Date.now() - startedAt,
      retrieval: null,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

/**
 * `--candidate none`: no strategy is proposed as the default.
 *
 * The no-regression gate then blocks nothing and every strategy is recorded as
 * an observation. This is the honest setting while the evidence does not name a
 * winner — it is not a way to silence a red gate for a strategy one still
 * intends to ship as the default.
 */
type CandidateSelection = DoclingChunkingStrategy | 'none';

const CANDIDATE_SELECTIONS: readonly CandidateSelection[] = [...ALL_STRATEGIES, 'none'];

function strategyAssertions(
  benchmarkCase: BenchmarkCase,
  outcomes: StrategyOutcome[],
  candidate: CandidateSelection,
  notes: string[]
): CaseResult['assertions'] {
  const assertions: CaseResult['assertions'] = [];

  for (const outcome of outcomes) {
    if (outcome.error) {
      assertions.push({
        name: `strategy:${outcome.strategy}`,
        passed: false,
        details: outcome.error,
      });
      continue;
    }
    if (outcome.strategy === 'legacy_markdown') continue;

    const minimumRef = benchmarkCase.provenance?.minimumRefCoverage;
    if (minimumRef !== undefined) {
      assertions.push({
        name: `provenance-refs:${outcome.strategy}`,
        passed: outcome.refCoverage >= minimumRef,
        details: `${(outcome.refCoverage * 100).toFixed(1)}% >= ${(minimumRef * 100).toFixed(1)}%`,
      });
    }

    const minimumLocation = benchmarkCase.provenance?.minimumLocationCoverage;
    if (minimumLocation !== undefined && outcome.locationEligible) {
      assertions.push({
        name: `provenance-location:${outcome.strategy}`,
        passed: outcome.locationCoverage >= minimumLocation,
        details: `${(outcome.locationCoverage * 100).toFixed(1)}% >= ${(minimumLocation * 100).toFixed(1)}%`,
      });
    }
  }

  // No control question may regress against the legacy strategy on ANY of the
  // three atom metrics. Checking only the reciprocal rank passes a strategy
  // that keeps the first hit first while losing the rest of the evidence;
  // checking chunk counts passes one that merely duplicates it. This blocks only
  // for the candidate default; the other strategies stay measured and reported,
  // because knowing that a non-selected strategy regresses is the evidence that
  // selected the candidate in the first place.
  const legacy = outcomes.find(outcome => outcome.strategy === 'legacy_markdown');
  const channels: Array<{
    label: string;
    read: (outcome: StrategyOutcome) => RetrievalReport | null | undefined;
  }> = [
    { label: 'lexical', read: outcome => outcome.retrieval },
    { label: 'dense', read: outcome => outcome.denseRetrieval },
  ];

  // When the live dense+sparse run is present it is the one that blocks: it IS
  // production ranking. The offline BM25 proxy exists for when it is not, and
  // it stays reported either way — but gating on pure BM25 while the real
  // ranker is measured would gate on a configuration nobody runs.
  const blockingChannel = outcomes.some(outcome => outcome.denseRetrieval) ? 'dense' : 'lexical';

  for (const channel of channels) {
    const before = legacy && channel.read(legacy);
    if (!before) continue;
    for (const outcome of outcomes) {
      if (outcome.strategy === 'legacy_markdown') continue;
      const after = channel.read(outcome);
      if (!after) continue;
      const regressed = detectRetrievalRegressions(before, after).map(formatRetrievalRegression);
      if (outcome.strategy === candidate && channel.label === blockingChannel) {
        assertions.push({
          name: `no-${channel.label}-regression:${outcome.strategy}`,
          passed: regressed.length === 0,
          details: regressed.length === 0 ? undefined : `regressed: ${regressed.join('; ')}`,
        });
      } else if (regressed.length > 0) {
        const role = outcome.strategy === candidate ? 'кандидат, не блокирует' : 'не кандидат';
        notes.push(
          `- ${benchmarkCase.id} · ${outcome.strategy} (${role}, ${channel.label}): ${regressed.join('; ')}`
        );
      }
    }
  }

  return assertions;
}

async function compareBaseline(
  baselineDirectory: string | undefined,
  current: CaseResult[]
): Promise<string[]> {
  if (!baselineDirectory) return [];
  const baseline = JSON.parse(
    await fs.readFile(path.resolve(REPO_ROOT, baselineDirectory, 'metrics.json'), 'utf8')
  ) as { cases: CaseResult[] };
  return current.map(result => {
    const previous = baseline.cases.find(candidate => candidate.id === result.id);
    if (!previous) return `- ${result.id}: baseline отсутствует`;
    const delta = result.markdownLength - previous.markdownLength;
    return `- ${result.id}: ${previous.status} → ${result.status}; Markdown ${previous.markdownLength} → ${result.markdownLength} (${delta >= 0 ? '+' : ''}${delta}); время ${previous.processingTimeMs} → ${result.processingTimeMs} мс`;
  });
}

async function main(): Promise<void> {
  const label = argument('--label') ?? `run-${new Date().toISOString().replace(/[:.]/gu, '-')}`;
  const serverUrl = argument('--url') ?? process.env.DOCLING_MCP_URL ?? 'http://127.0.0.1:8000/mcp';
  const serveUrl =
    argument('--serve-url') ?? process.env.DOCLING_SERVE_URL ?? 'http://127.0.0.1:5001';
  const conversionProfile = choice<ConversionProfile>(
    '--conversion-profile',
    CONVERSION_PROFILES,
    'baseline'
  );
  const requestedStrategies = argument('--strategies')
    ?.split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
  const unknownStrategies = (requestedStrategies ?? []).filter(
    value => !ALL_STRATEGIES.includes(value as DoclingChunkingStrategy)
  );
  if (unknownStrategies.length > 0) {
    console.error(`--strategies: неизвестные значения ${unknownStrategies.join(', ')}`);
    console.error(`Допустимо: ${ALL_STRATEGIES.join(', ')}`);
    process.exit(2);
  }
  const strategies = (requestedStrategies ?? ALL_STRATEGIES) as DoclingChunkingStrategy[];
  const candidate = choice<CandidateSelection>('--candidate', CANDIDATE_SELECTIONS, 'none');
  // A candidate that is not measured cannot be gated, and reporting it as the
  // proposed default would be a claim nothing checked.
  if (candidate !== 'none' && !strategies.includes(candidate)) {
    console.error(`--candidate ${candidate} отсутствует в --strategies ${strategies.join(',')}`);
    process.exit(2);
  }
  const notes: string[] = [];
  const cachePath = path.resolve(
    argument('--cache') ??
      process.env.DOCLING_CACHE_PATH ??
      path.join(REPO_ROOT, '.tmp/docling-cache')
  );
  const outputDirectory = path.join(REPO_ROOT, '.tmp/docling-benchmark', label);
  // The engine is a SERVICE-level setting on the MCP container, not a request
  // parameter: the accepted `/mcp` conversion tool takes only a source. So the
  // run records what the container reports rather than what the caller wished
  // for, and an A/B is two runs against two container configurations.
  const ocrPreset = process.env.DOCLING_MCP_OCR_PRESET ?? 'easyocr';
  const ocrLang = process.env.DOCLING_MCP_OCR_LANG ?? 'ru,en';
  const stagingDirectory = path.join(PACKAGE_ROOT, 'uploads/docling-benchmark', label);
  const baselineDirectory = argument('--baseline');
  const onlyCase = argument('--case');
  const nonBlocking = process.argv.includes('--non-blocking');
  // Off by default: --dense embeds every chunk through the PAID Jina API and
  // needs a reachable Qdrant. It must be an explicit, authorized choice.
  const dense = process.argv.includes('--dense');
  if (dense && !process.env.JINA_API_KEY) {
    console.error('--dense требует JINA_API_KEY (реальные платные вызовы api.jina.ai)');
    process.exit(2);
  }
  // The benchmark never shares Redis keys with production embeddings. A run
  // under a fresh label is therefore cold and its billed-token count is the
  // real cost of the measurement; re-running the same label reuses exactly the
  // vectors that label produced. Sharing the production namespace is how the
  // first dense evidence came out billing zero tokens and silently scored
  // vectors that some earlier run had computed in another context.
  process.env.EMBEDDING_CACHE_NAMESPACE =
    argument('--embedding-cache-namespace') ?? `embedding-bench:${label}`;
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as Manifest;

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.mkdir(stagingDirectory, { recursive: true });
  await fs.mkdir(cachePath, { recursive: true });
  process.env.DOCLING_UPLOADS_BASE_PATH = PACKAGE_ROOT;
  process.env.DOCLING_CONTAINER_UPLOADS_PATH = '/app/uploads';

  const client = new DoclingClient({ serverUrl, cachePath, timeout: 1_200_000, maxRetries: 1 });
  const chunker = new DoclingServeChunker({ baseUrl: serveUrl });
  const results: CaseResult[] = [];
  const ocrScores = new Map<string, OcrScore>();

  try {
    for (const benchmarkCase of manifest.cases) {
      if (onlyCase && benchmarkCase.id !== onlyCase) continue;
      const caseDirectory = path.join(outputDirectory, benchmarkCase.id);
      const source = path.resolve(FIXTURE_ROOT, benchmarkCase.source);
      const stagedSource = path.join(stagingDirectory, path.basename(source));
      await fs.mkdir(caseDirectory, { recursive: true });
      await fs.copyFile(source, stagedSource);
      const startedAt = Date.now();
      const assertions: CaseResult['assertions'] = [];
      const strategyOutcomes: StrategyOutcome[] = [];
      let bundle: DoclingConversionBundle | undefined;

      try {
        bundle = await client.convertDocumentBundle(stagedSource);
        await Promise.all([
          fs.writeFile(path.join(caseDirectory, 'document.md'), bundle.markdown),
          fs.copyFile(bundle.rawJsonPath, path.join(caseDirectory, 'raw.json')),
          fs.writeFile(
            path.join(caseDirectory, 'normalized.json'),
            `${JSON.stringify(bundle.document, null, 2)}\n`
          ),
        ]);
        assertConversionProducedText(bundle.markdown, stagedSource);
        if (benchmarkCase.expectedError) {
          assertions.push({
            name: benchmarkCase.expectedError,
            passed: false,
            details: 'conversion unexpectedly succeeded',
          });
        }

        const normalizedMarkdown = normalize(bundle.markdown);
        for (const token of benchmarkCase.expectedTokens ?? []) {
          assertions.push({
            name: `contains:${token}`,
            passed: normalizedMarkdown.includes(normalize(token)),
          });
        }
        let previousIndex = -1;
        for (const token of benchmarkCase.expectedOrder ?? []) {
          const index = normalizedMarkdown.indexOf(normalize(token), previousIndex + 1);
          assertions.push({ name: `order:${token}`, passed: index > previousIndex });
          previousIndex = index;
        }

        // Distinct heading levels, not maximum heading depth: a document whose
        // only headings are H2 must not prove a two-level hierarchy.
        const expectation = benchmarkCase.headingHierarchy?.[conversionProfile];
        if (expectation) {
          const verdict = evaluateHeadingHierarchy(bundle.markdown, expectation);
          assertions.push({
            name: `heading-hierarchy[${conversionProfile}]`,
            passed: verdict.passed,
            details: verdict.details,
          });
        }

        if (benchmarkCase.requiresNestedList) {
          const hasNestedList = /\n[ \t]+(?:[-*+]\s+)?\d+(?:\.\d+)*[.)]\s+Вложенный/iu.test(
            bundle.markdown
          );
          assertions.push({
            name: 'nested-list',
            passed: hasNestedList,
            details: hasNestedList ? undefined : 'nested list indentation was not preserved',
          });
        }
        if (benchmarkCase.minimumColspan !== undefined) {
          const maximumColspan = Math.max(
            0,
            ...bundle.document.tables.flatMap(table =>
              table.cells.flatMap(row => row.map(cell => cell.colspan ?? 1))
            )
          );
          assertions.push({
            name: 'merged-table-cell',
            passed: maximumColspan >= benchmarkCase.minimumColspan,
            details: `${maximumColspan}`,
          });
        }
        // Structure is asserted on the RAW document: the sheet a cell belongs
        // to, the order of the slides and the fact that an equation arrived as
        // an equation exist nowhere in the Markdown rendering.
        if (benchmarkCase.structure) {
          const rawDocument: unknown = JSON.parse(await fs.readFile(bundle.rawJsonPath, 'utf8'));
          for (const check of checkStructure(rawDocument, benchmarkCase.structure)) {
            assertions.push({
              name: check.name,
              passed: check.passed,
              details: check.details,
            });
          }
        }

        // OCR is scored on the Markdown the pipeline accepted, because that is
        // what every downstream consumer reads. The score is recorded whole —
        // per-phrase similarity and the recovered text — so a comparison
        // between engines can be re-checked instead of believed.
        if (benchmarkCase.ocr) {
          const score = scoreOcr(bundle.markdown, benchmarkCase.ocr);
          ocrScores.set(benchmarkCase.id, score);
          for (const check of checkOcr(score, benchmarkCase.ocr)) {
            assertions.push({
              name: check.name,
              passed: check.passed,
              details: check.details,
            });
          }
        }

        const stableFailures = validateStableDocument(bundle.document);
        assertions.push({
          name: 'stable-normalized-json',
          passed: stableFailures.length === 0,
          details: stableFailures.join(', ') || undefined,
        });

        for (const strategy of strategies) {
          strategyOutcomes.push(
            await runStrategy(strategy, bundle, benchmarkCase, chunker, caseDirectory, dense)
          );
        }
        assertions.push(...strategyAssertions(benchmarkCase, strategyOutcomes, candidate, notes));

        results.push({
          id: benchmarkCase.id,
          status: assertions.every(assertion => assertion.passed) ? 'passed' : 'failed',
          processingTimeMs: bundle.processingTimeMs,
          fromCache: bundle.fromCache,
          documentKey: bundle.documentKey,
          markdownLength: bundle.markdown.length,
          pages: bundle.document.metadata.page_count,
          textElements: bundle.document.texts.length,
          pictures: bundle.document.pictures.length,
          tables: bundle.document.tables.length,
          assertions,
          strategies: strategyOutcomes,
        });
      } catch (error) {
        const isExpectedEmpty =
          benchmarkCase.expectedError === 'EmptyConversionError' &&
          error instanceof EmptyConversionError;
        assertions.push({
          name: benchmarkCase.expectedError ?? 'conversion',
          passed: isExpectedEmpty,
          details: error instanceof Error ? error.message : String(error),
        });
        results.push({
          id: benchmarkCase.id,
          status: isExpectedEmpty ? 'passed' : 'failed',
          processingTimeMs: bundle?.processingTimeMs ?? Date.now() - startedAt,
          fromCache: bundle?.fromCache ?? false,
          documentKey: bundle?.documentKey,
          markdownLength: bundle?.markdown.length ?? 0,
          pages: bundle?.document.metadata.page_count ?? 0,
          textElements: bundle?.document.texts.length ?? 0,
          pictures: bundle?.document.pictures.length ?? 0,
          tables: bundle?.document.tables.length ?? 0,
          assertions,
          strategies: strategyOutcomes,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
      }
    }
  } finally {
    await client.disconnect();
    await fs.rm(stagingDirectory, { recursive: true, force: true });
  }

  const comparison = await compareBaseline(baselineDirectory, results);
  const stats = runtimeStats();
  const metrics = {
    schemaVersion: 2,
    label,
    serverUrl,
    serveUrl,
    conversionProfile,
    strategies,
    candidate,
    notes,
    chunkingConfig: DEFAULT_CHUNKING_CONFIG,
    generatedAt: new Date().toISOString(),
    runtime: stats,
    cases: results,
  };
  await fs.writeFile(
    path.join(outputDirectory, 'metrics.json'),
    `${JSON.stringify(metrics, null, 2)}\n`
  );

  /** Gated atom metrics, then the descriptive chunk-level Recall. */
  const retrievalCells = (report: RetrievalReport | null | undefined): string =>
    report
      ? `${report.atomCoverageAtK.toFixed(2)} | ${report.atomMrrAtK.toFixed(2)} | ${report.atomDcgAtK.toFixed(2)} | ${report.recallAtK.toFixed(2)} / ${report.recallCeilingAtK.toFixed(2)}`
      : '— | — | — | —';

  const strategyRows = results.flatMap(result =>
    result.strategies.map(
      outcome =>
        `| ${result.id} | ${outcome.strategy} | ${outcome.parentChunks} | ${outcome.childChunks} | ${outcome.avgChildTokens} | ${(outcome.headingPathCoverage * 100).toFixed(0)}% | ${(outcome.refCoverage * 100).toFixed(0)}% | ${outcome.locationEligible ? `${(outcome.locationCoverage * 100).toFixed(0)}%` : 'n/a'} | ${retrievalCells(outcome.retrieval)} | ${outcome.durationMs} |`
    )
  );

  const report = [
    `# Docling A/B — ${label}`,
    '',
    `MCP: \`${serverUrl}\` · Serve: \`${serveUrl}\` · conversion profile: \`${conversionProfile}\` · кандидат: \`${candidate}\``,
    '',
    ...(candidate === 'none'
      ? [
          'Кандидат не назначен: ни одна стратегия не предлагается в качестве',
          'default, поэтому блокирующая проверка регрессий не применяется, а все',
          'стратегии записаны как наблюдения.',
          '',
        ]
      : []),
    `Serve memory: ${stats.serveMemory ?? 'not measured'}; restarts: ${stats.serveRestartCount ?? 'not measured'}`,
    '',
    '## Конвертация',
    '',
    '| Case | Result | Time, ms | Markdown | Pages | Assertions |',
    '|---|---:|---:|---:|---:|---:|',
    ...results.map(
      result =>
        `| ${result.id} | ${result.status} | ${result.processingTimeMs} | ${result.markdownLength} | ${result.pages} | ${result.assertions.filter(assertion => assertion.passed).length}/${result.assertions.length} |`
    ),
    '',
    '## Стратегии чанкинга',
    '',
    'Метрики этой таблицы — лексический прокси (BM25 с параметрами коллекции), не dense-ранжирование Jina.',
    '',
    '`Atoms@5` — доля ОБЪЯВЛЕННЫХ фактов вопроса, покрытых top-5. `aMRR` и `aDCG` —',
    'те же атомы со скидкой за ранг (`1/rank` и `1/log2(rank+1)`), усреднённые по тому',
    'же фиксированному знаменателю. Знаменатель одинаков для всех стратегий, а',
    'повторное попадание одного и того же факта в пять чанков считается один раз.',
    '',
    'Колонка `R@5` — «факт / потолок» на уровне чанков. Оставлена как описание:',
    'и числитель, и знаменатель зависят от того, насколько мелко стратегия режет',
    'документ, поэтому она не входит в gate и не сравнима между стратегиями.',
    '',
    `Регрессия — падение atom-coverage, aMRR или aDCG на любом контрольном вопросе; допуск ${RETRIEVAL_REGRESSION_EPSILON} покрывает только погрешность представления чисел. Исчезнувший вопрос тоже регрессия. Атом, который не несёт ни один чанк стратегии (факт разрезан границей), попадает в \`unreachableAtoms\` и одновременно снижает coverage.`,
    dense
      ? 'Блокирует dense+sparse канал (это и есть production-ранжирование); лексический прокси — наблюдение.'
      : 'Блокирует лексический прокси: dense-прогон не запрашивался (`--dense`).',
    '',
    '| Case | Strategy | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox | Atoms@5 | aMRR | aDCG | R@5 факт/потолок | ms |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...strategyRows,
    '',
    'Полные ранжированные списки chunk id и посписочный статус каждого атома —',
    'в `metrics.json` (`strategies[].retrieval.questions[].rankedChunkIds` и',
    '`.atoms`). Утверждение «те же чанки в том же порядке» проверяется по ним.',
    '',
    '## Проваленные проверки',
    '',
    ...(results.flatMap(result =>
      result.assertions
        .filter(assertion => !assertion.passed)
        .map(assertion => `- ${result.id} · ${assertion.name}: ${assertion.details ?? 'failed'}`)
    ).length > 0
      ? results.flatMap(result =>
          result.assertions
            .filter(assertion => !assertion.passed)
            .map(
              assertion => `- ${result.id} · ${assertion.name}: ${assertion.details ?? 'failed'}`
            )
        )
      : ['Нет.']),
    ...(dense
      ? [
          '',
          '## Dense+sparse retrieval (реальные jina-embeddings-v3)',
          '',
          'Тот же production-путь: один вызов `generateEmbeddingsWithLateChunking(chunks,',
          "'retrieval.passage', true)` на все чанки — ровно как в `phase-5-embedding.ts`,",
          'server-side BM25 + dense prefetch, RRF, поиск через `searchChunks({enable_hybrid:true})`',
          'во временной коллекции с',
          `production-схемой (включая payload-индексы: без них strict mode отклоняет фильтр и hybrid молча падает в dense-only). Кэш эмбеддингов изолирован в namespace \`${process.env.EMBEDDING_CACHE_NAMESPACE}\`. Оплачено токенов в этом прогоне: ${results.reduce(
            (sum, result) =>
              sum +
              result.strategies.reduce(
                (inner, outcome) => inner + (outcome.denseBilledTokens ?? 0),
                0
              ),
            0
          )}.`,
          '',
          '| Case | Strategy | Atoms@5 | aMRR | aDCG | R@5 факт/потолок |',
          '|---|---|---:|---:|---:|---:|',
          ...results.flatMap(result =>
            result.strategies
              .filter(outcome => outcome.denseRetrieval)
              .map(
                outcome =>
                  `| ${result.id} | ${outcome.strategy} | ${retrievalCells(outcome.denseRetrieval)} |`
              )
          ),
        ]
      : []),
    ...(ocrScores.size > 0
      ? [
          '',
          '## OCR',
          '',
          `Движок этого прогона: \`${ocrPreset}\`, языки \`${ocrLang}\`. Движок — настройка`,
          'КОНТЕЙНЕРА MCP, а не параметр запроса, поэтому A/B — это два прогона против двух',
          'конфигураций, а не два запроса. Схожесть фраз — посимвольная, не «содержит»:',
          'частично прочитанная фраза видна как 0.8, а не как ноль.',
          '',
          '`Гомоглифы` — сколько кириллических фраз вернулись латиницей, которая выглядит так же',
          '(РОСТ → POCT). Это отдельная колонка, потому что нормализация спрятала бы ровно тот',
          'провал, ради которого сравнение и делается.',
          '',
          '| Case | Кириллица | Схожесть фраз | Гомоглифы | Ячейки таблицы |',
          '|---|---:|---:|---:|---:|',
          ...[...ocrScores.entries()].map(
            ([id, score]) =>
              `| ${id} | ${score.cyrillicCharacters} | ${score.meanPhraseSimilarity.toFixed(3)} | ` +
              `${score.homoglyphSubstitutions} | ` +
              `${score.tableCellAccuracy === null ? 'n/a' : score.tableCellAccuracy.toFixed(3)} |`
          ),
          '',
          'Пофразный разбор с восстановленным текстом — в `ocr-scores.json`.',
        ]
      : []),
    ...(notes.length > 0 ? ['', '## Наблюдения по не-кандидатам', '', ...notes] : []),
    ...(comparison.length > 0 ? ['', '## Было → стало', '', ...comparison] : []),
    '',
  ].join('\n');
  await fs.writeFile(path.join(outputDirectory, 'report.md'), report);
  if (ocrScores.size > 0) {
    await fs.writeFile(
      path.join(outputDirectory, 'ocr-scores.json'),
      `${JSON.stringify({ ocrPreset, ocrLang, cases: Object.fromEntries(ocrScores) }, null, 2)}\n`
    );
  }

  const failed = results.filter(result => result.status === 'failed');
  console.log(`Docling benchmark: ${results.length - failed.length}/${results.length} passed`);
  console.log(path.join(outputDirectory, 'report.md'));
  if (failed.length > 0 && !nonBlocking) process.exitCode = 1;
}

await main();
// Redis and the MCP transport keep the event loop alive after the report is
// written, so an ordinary return would hang the run instead of ending it.
process.exit(process.exitCode ?? 0);
