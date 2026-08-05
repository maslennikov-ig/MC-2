import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DoclingClient } from '../src/stages/stage2-document-processing/docling/client.js';
import type {
  DoclingConversionBundle,
  DoclingDocument,
} from '../src/stages/stage2-document-processing/docling/types.js';
import {
  assertConversionProducedText,
  EmptyConversionError,
} from '../src/stages/stage2-document-processing/phases/phase-1-docling-conversion.js';

interface BenchmarkCase {
  id: string;
  source: string;
  expectedTokens?: string[];
  expectedOrder?: string[];
  minimumHeadingDepth?: number;
  requiresNestedList?: boolean;
  minimumColspan?: number;
  expectedError?: 'EmptyConversionError';
}

interface Manifest {
  schemaVersion: number;
  cases: BenchmarkCase[];
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
  error?: string;
}

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const FIXTURE_ROOT = path.join(PACKAGE_ROOT, 'tests/integration/fixtures/docling-quality');
const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'manifest.json');

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ').trim();
}

function maximumHeadingDepth(markdown: string): number {
  return Math.max(
    0,
    ...markdown.split('\n').map(line => /^(#{1,6})\s/u.exec(line)?.[1].length ?? 0)
  );
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
  for (const container of ['megacampus-docling-serve', 'docling-serve']) {
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
      return { serveMemory: memory || null, serveRestartCount: restartCount };
    } catch {
      // Try the other local/production container name.
    }
  }
  return { serveMemory: null, serveRestartCount: null };
}

async function compareBaseline(
  baselineDirectory: string | undefined,
  current: CaseResult[]
): Promise<string[]> {
  if (!baselineDirectory) return [];
  const baseline = JSON.parse(
    await fs.readFile(path.resolve(baselineDirectory, 'metrics.json'), 'utf8')
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
  const cachePath = path.resolve(
    argument('--cache') ??
      process.env.DOCLING_CACHE_PATH ??
      path.join(REPO_ROOT, '.tmp/docling-cache')
  );
  const outputDirectory = path.join(REPO_ROOT, '.tmp/docling-benchmark', label);
  const stagingDirectory = path.join(PACKAGE_ROOT, 'uploads/docling-benchmark', label);
  const baselineDirectory = argument('--baseline');
  const nonBlocking = process.argv.includes('--non-blocking');
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as Manifest;

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.mkdir(stagingDirectory, { recursive: true });
  await fs.mkdir(cachePath, { recursive: true });
  process.env.DOCLING_UPLOADS_BASE_PATH = PACKAGE_ROOT;
  process.env.DOCLING_CONTAINER_UPLOADS_PATH = '/app/uploads';

  const client = new DoclingClient({ serverUrl, cachePath, timeout: 1_200_000, maxRetries: 1 });
  const results: CaseResult[] = [];

  try {
    for (const benchmarkCase of manifest.cases) {
      const caseDirectory = path.join(outputDirectory, benchmarkCase.id);
      const source = path.resolve(FIXTURE_ROOT, benchmarkCase.source);
      const stagedSource = path.join(stagingDirectory, path.basename(source));
      await fs.mkdir(caseDirectory, { recursive: true });
      await fs.copyFile(source, stagedSource);
      const startedAt = Date.now();
      const assertions: CaseResult['assertions'] = [];
      let bundle: DoclingConversionBundle | undefined;

      try {
        bundle = await client.convertDocumentBundle(stagedSource);
        await Promise.all([
          fs.writeFile(path.join(caseDirectory, 'document.md'), bundle.markdown),
          fs.copyFile(
            path.join(cachePath, `${bundle.documentKey}.json`),
            path.join(caseDirectory, 'raw.json')
          ),
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
        if (benchmarkCase.minimumHeadingDepth !== undefined) {
          const headingDepth = maximumHeadingDepth(bundle.markdown);
          assertions.push({
            name: 'heading-depth',
            passed: headingDepth >= benchmarkCase.minimumHeadingDepth,
            details: `${headingDepth}`,
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
    schemaVersion: 1,
    label,
    serverUrl,
    generatedAt: new Date().toISOString(),
    runtime: stats,
    cases: results,
  };
  await fs.writeFile(
    path.join(outputDirectory, 'metrics.json'),
    `${JSON.stringify(metrics, null, 2)}\n`
  );

  const report = [
    `# Docling A/B — ${label}`,
    '',
    `Endpoint: \`${serverUrl}\``,
    '',
    `Serve memory: ${stats.serveMemory ?? 'not measured'}; restarts: ${stats.serveRestartCount ?? 'not measured'}`,
    '',
    '| Case | Result | Time, ms | Markdown | Pages | Assertions |',
    '|---|---:|---:|---:|---:|---:|',
    ...results.map(
      result =>
        `| ${result.id} | ${result.status} | ${result.processingTimeMs} | ${result.markdownLength} | ${result.pages} | ${result.assertions.filter(assertion => assertion.passed).length}/${result.assertions.length} |`
    ),
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
