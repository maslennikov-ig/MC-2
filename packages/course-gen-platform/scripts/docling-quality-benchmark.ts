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
 * - Retrieval scoring is the lexical half of production retrieval (BM25 with the
 *   collection's own parameters). Dense Jina v3 ranking is not exercised here,
 *   so a win reported by this harness is a lexical-reachability win.
 * - Recall@K is divided by all relevant chunks, and its reachable ceiling is
 *   printed next to it, so a saturated top-k cannot read as a perfect score.
 * - A control question must not regress on Recall, MRR or nDCG. Guarding the
 *   reciprocal rank alone passed strategies that kept the first hit first and
 *   lost the rest of the evidence.
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
import { chunkWithStrategy } from '../src/shared/embeddings/chunking-strategy.js';
import { DEFAULT_CHUNKING_CONFIG } from '../src/shared/embeddings/markdown-chunker.js';
import {
  evaluateRetrieval,
  type GroundTruthQuestion,
  type RetrievalReport,
} from '../src/shared/embeddings/retrieval-metrics.js';

type ConversionProfile = 'baseline' | 'pdf-heading-hierarchy';

interface BenchmarkCase {
  id: string;
  source: string;
  expectedTokens?: string[];
  expectedOrder?: string[];
  headingHierarchy?: Partial<Record<ConversionProfile, HeadingHierarchyExpectation>>;
  requiresNestedList?: boolean;
  minimumColspan?: number;
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
  caseDirectory: string
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

    return {
      strategy: result.strategy,
      chunkingProfileId: result.chunkingProfileId,
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
 * Numeric slack allowed before a per-question drop counts as a regression.
 *
 * Set to floating-point noise, not to a quality allowance: every metric here is
 * rank-derived, so the smallest real drop a question can suffer (first hit
 * falling from rank 1 to rank 2) is 0.5 for the reciprocal rank and ~0.37 for
 * nDCG@5. A tolerance of 0.01 therefore admits no genuine quality loss.
 */
const RETRIEVAL_REGRESSION_TOLERANCE = 0.01;

/** Every metric a control question is guarded on. */
const RETRIEVAL_METRICS: Array<{
  name: string;
  read: (outcome: RetrievalReport['questions'][number]) => number;
}> = [
  { name: 'recall@5', read: outcome => outcome.recallAtK },
  { name: 'mrr', read: outcome => outcome.reciprocalRank },
  { name: 'ndcg@5', read: outcome => outcome.ndcgAtK },
];

/**
 * `--candidate none`: no strategy is proposed as the default.
 *
 * The no-regression gate then blocks nothing and every strategy is recorded as
 * an observation. This is the honest setting while the evidence does not name a
 * winner — it is not a way to silence a red gate for a strategy one still
 * intends to ship as the default.
 */
type CandidateSelection = DoclingChunkingStrategy | 'none';

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
  // three metrics. Checking only the reciprocal rank passes a strategy that
  // keeps the first hit first while losing the rest of the evidence, which is
  // exactly how a Recall and nDCG regression stayed invisible. This blocks only
  // for the candidate default; the other strategies stay measured and reported,
  // because knowing that a non-selected strategy regresses is the evidence that
  // selected the candidate in the first place.
  const legacy = outcomes.find(outcome => outcome.strategy === 'legacy_markdown');
  if (legacy?.retrieval) {
    for (const outcome of outcomes) {
      if (outcome.strategy === 'legacy_markdown' || !outcome.retrieval) continue;
      const regressed = outcome.retrieval.questions.flatMap(question => {
        const before = legacy.retrieval!.questions.find(other => other.id === question.id);
        if (!before) return [];
        return RETRIEVAL_METRICS.flatMap(metric => {
          const drop = metric.read(before) - metric.read(question);
          return drop > RETRIEVAL_REGRESSION_TOLERANCE
            ? [
                `${question.id}/${metric.name} ${metric.read(before).toFixed(3)}→${metric
                  .read(question)
                  .toFixed(3)}`,
              ]
            : [];
        });
      });
      if (outcome.strategy === candidate) {
        assertions.push({
          name: `no-retrieval-regression:${outcome.strategy}`,
          passed: regressed.length === 0,
          details: regressed.length === 0 ? undefined : `regressed: ${regressed.join('; ')}`,
        });
      } else if (regressed.length > 0) {
        notes.push(
          `- ${benchmarkCase.id} · ${outcome.strategy} (не кандидат): ${regressed.join('; ')}`
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
  const conversionProfile = (argument('--conversion-profile') ?? 'baseline') as ConversionProfile;
  const strategies = (argument('--strategies')
    ?.split(',')
    .map(value => value.trim()) ?? ALL_STRATEGIES) as DoclingChunkingStrategy[];
  const candidate = (argument('--candidate') ?? 'none') as CandidateSelection;
  const notes: string[] = [];
  const cachePath = path.resolve(
    argument('--cache') ??
      process.env.DOCLING_CACHE_PATH ??
      path.join(REPO_ROOT, '.tmp/docling-cache')
  );
  const outputDirectory = path.join(REPO_ROOT, '.tmp/docling-benchmark', label);
  const stagingDirectory = path.join(PACKAGE_ROOT, 'uploads/docling-benchmark', label);
  const baselineDirectory = argument('--baseline');
  const onlyCase = argument('--case');
  const nonBlocking = process.argv.includes('--non-blocking');
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as Manifest;

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.mkdir(stagingDirectory, { recursive: true });
  await fs.mkdir(cachePath, { recursive: true });
  process.env.DOCLING_UPLOADS_BASE_PATH = PACKAGE_ROOT;
  process.env.DOCLING_CONTAINER_UPLOADS_PATH = '/app/uploads';

  const client = new DoclingClient({ serverUrl, cachePath, timeout: 1_200_000, maxRetries: 1 });
  const chunker = new DoclingServeChunker({ baseUrl: serveUrl });
  const results: CaseResult[] = [];

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
        const stableFailures = validateStableDocument(bundle.document);
        assertions.push({
          name: 'stable-normalized-json',
          passed: stableFailures.length === 0,
          details: stableFailures.join(', ') || undefined,
        });

        for (const strategy of strategies) {
          strategyOutcomes.push(
            await runStrategy(strategy, bundle, benchmarkCase, chunker, caseDirectory)
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

  const strategyRows = results.flatMap(result =>
    result.strategies.map(
      outcome =>
        `| ${result.id} | ${outcome.strategy} | ${outcome.parentChunks} | ${outcome.childChunks} | ${outcome.avgChildTokens} | ${(outcome.headingPathCoverage * 100).toFixed(0)}% | ${(outcome.refCoverage * 100).toFixed(0)}% | ${outcome.locationEligible ? `${(outcome.locationCoverage * 100).toFixed(0)}%` : 'n/a'} | ${outcome.retrieval ? `${outcome.retrieval.recallAtK.toFixed(2)} / ${outcome.retrieval.recallCeilingAtK.toFixed(2)}` : '—'} | ${outcome.retrieval ? outcome.retrieval.mrr.toFixed(2) : '—'} | ${outcome.retrieval ? outcome.retrieval.ndcgAtK.toFixed(2) : '—'} | ${outcome.durationMs} |`
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
    'Recall@5/MRR/nDCG@5 — лексический прокси (BM25 с параметрами коллекции), не dense-ранжирование Jina.',
    '',
    'Колонка `R@5` — «факт / потолок». Потолок = `min(релевантных, 5) / релевантных`:',
    'стратегия, которая режет тот же документ мельче, механически снижает свой',
    'собственный потолок, поэтому Recall@5 между стратегиями напрямую не сравним,',
    'и выбор кандидата опирается на ранговые метрики и на отсутствие регрессий.',
    '',
    `Регрессией считается падение больше ${RETRIEVAL_REGRESSION_TOLERANCE} по любой из трёх метрик на любом контрольном вопросе.`,
    '',
    '| Case | Strategy | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox | R@5 факт/потолок | MRR | nDCG@5 | ms |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...strategyRows,
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
    ...(notes.length > 0 ? ['', '## Наблюдения по не-кандидатам', '', ...notes] : []),
    ...(comparison.length > 0 ? ['', '## Было → стало', '', ...comparison] : []),
    '',
  ].join('\n');
  await fs.writeFile(path.join(outputDirectory, 'report.md'), report);

  const failed = results.filter(result => result.status === 'failed');
  console.log(`Docling benchmark: ${results.length - failed.length}/${results.length} passed`);
  console.log(path.join(outputDirectory, 'report.md'));
  if (failed.length > 0 && !nonBlocking) process.exitCode = 1;
}

await main();
