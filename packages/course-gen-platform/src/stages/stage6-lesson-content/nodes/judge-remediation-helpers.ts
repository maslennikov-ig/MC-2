/**
 * Mermaid and table remediation helpers for judge evaluation
 * @module stages/stage6-lesson-content/nodes/judge-remediation-helpers
 *
 * Extracted from judge-node-helpers.ts to comply with max-lines rule.
 */

import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';
import type { MermaidRenderRemediationMetadata } from '../utils/mermaid-render-validator';
import { runMermaidFixPipeline } from '../utils/mermaid-fix-pipeline';
import { runTableFixPipeline, type TableFixPipelineMetrics } from '../utils/table-fix-pipeline';

// ============================================================================
// TYPES
// ============================================================================

export type MermaidAggregateMetrics = NonNullable<
  MermaidRenderRemediationMetadata['aggregateMetrics']
>;

export interface MermaidContentBodyRemediationResult {
  contentBody: LessonContentBody;
  transformed: boolean;
  fieldsScanned: number;
  fieldsTransformed: number;
  pipelineRuns: number;
  aggregateMetrics: MermaidAggregateMetrics;
}

export interface TableContentBodyRemediationResult {
  contentBody: LessonContentBody;
  transformed: boolean;
  fieldsScanned: number;
  fieldsTransformed: number;
  aggregateMetrics: TableFixPipelineMetrics;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MERMAID_HINT_REGEX =
  /```mermaid|^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitgraph)\b/im;
const TABLE_HINT_REGEX = /\|/;

// ============================================================================
// METRICS HELPERS
// ============================================================================

export function createEmptyMermaidAggregateMetrics(): MermaidAggregateMetrics {
  return {
    diagramsTotal: 0,
    diagramsAutoWrapped: 0,
    diagramsFixedRegex: 0,
    diagramsFixedLLM: 0,
    diagramsFallback: 0,
    diagramsSimplified: 0,
    diagramsSplit: 0,
    diagramsStructuredFallback: 0,
  };
}

export function mergeMermaidMetrics(
  target: MermaidAggregateMetrics,
  source: MermaidAggregateMetrics
): MermaidAggregateMetrics {
  return {
    diagramsTotal: target.diagramsTotal + (source.diagramsTotal ?? 0),
    diagramsAutoWrapped: target.diagramsAutoWrapped + (source.diagramsAutoWrapped ?? 0),
    diagramsFixedRegex: target.diagramsFixedRegex + (source.diagramsFixedRegex ?? 0),
    diagramsFixedLLM: target.diagramsFixedLLM + (source.diagramsFixedLLM ?? 0),
    diagramsFallback: target.diagramsFallback + (source.diagramsFallback ?? 0),
    diagramsSimplified: (target.diagramsSimplified ?? 0) + (source.diagramsSimplified ?? 0),
    diagramsSplit: (target.diagramsSplit ?? 0) + (source.diagramsSplit ?? 0),
    diagramsStructuredFallback:
      (target.diagramsStructuredFallback ?? 0) + (source.diagramsStructuredFallback ?? 0),
  };
}

export function createEmptyTableMetrics(): TableFixPipelineMetrics {
  return {
    tablesDetected: 0,
    tablesModified: 0,
    separatorRowsNormalized: 0,
    dataRowsNormalized: 0,
    durationMs: 0,
  };
}

export function mergeTableMetrics(
  target: TableFixPipelineMetrics,
  source: TableFixPipelineMetrics
): TableFixPipelineMetrics {
  return {
    tablesDetected: target.tablesDetected + source.tablesDetected,
    tablesModified: target.tablesModified + source.tablesModified,
    separatorRowsNormalized: target.separatorRowsNormalized + source.separatorRowsNormalized,
    dataRowsNormalized: target.dataRowsNormalized + source.dataRowsNormalized,
    durationMs: target.durationMs + source.durationMs,
  };
}

// ============================================================================
// REMEDIATION FUNCTIONS
// ============================================================================

async function remediateMermaidField(
  value: string,
  aggregate: MermaidContentBodyRemediationResult
): Promise<string> {
  if (!MERMAID_HINT_REGEX.test(value)) {
    return value;
  }

  aggregate.fieldsScanned++;
  const pipelineResult = await runMermaidFixPipeline(value, { skipLLM: true });
  aggregate.pipelineRuns++;
  aggregate.aggregateMetrics = mergeMermaidMetrics(
    aggregate.aggregateMetrics,
    pipelineResult.metrics
  );

  if (!pipelineResult.modified) {
    return value;
  }

  aggregate.transformed = true;
  aggregate.fieldsTransformed++;
  return pipelineResult.content;
}

export async function remediateMermaidInContentBody(
  contentBody: LessonContentBody
): Promise<MermaidContentBodyRemediationResult> {
  const aggregate: MermaidContentBodyRemediationResult = {
    contentBody,
    transformed: false,
    fieldsScanned: 0,
    fieldsTransformed: 0,
    pipelineRuns: 0,
    aggregateMetrics: createEmptyMermaidAggregateMetrics(),
  };

  const intro = await remediateMermaidField(contentBody.intro ?? '', aggregate);

  const sections: LessonContentBody['sections'] = [];
  for (const section of contentBody.sections ?? []) {
    sections.push({
      ...section,
      content: await remediateMermaidField(section.content ?? '', aggregate),
    });
  }

  const examples: LessonContentBody['examples'] = [];
  for (const example of contentBody.examples ?? []) {
    examples.push({
      ...example,
      content: await remediateMermaidField(example.content ?? '', aggregate),
      code: example.code,
    });
  }

  const exercises: LessonContentBody['exercises'] = [];
  for (const exercise of contentBody.exercises ?? []) {
    const hints: string[] = [];
    for (const hint of exercise.hints ?? []) {
      hints.push(await remediateMermaidField(hint, aggregate));
    }

    exercises.push({
      ...exercise,
      question: await remediateMermaidField(exercise.question ?? '', aggregate),
      solution: await remediateMermaidField(exercise.solution ?? '', aggregate),
      hints,
    });
  }

  return {
    ...aggregate,
    contentBody: {
      ...contentBody,
      intro,
      sections,
      examples,
      exercises,
    },
  };
}

function remediateTableField(value: string, aggregate: TableContentBodyRemediationResult): string {
  if (!TABLE_HINT_REGEX.test(value)) {
    return value;
  }

  aggregate.fieldsScanned++;
  const pipelineResult = runTableFixPipeline(value);
  aggregate.aggregateMetrics = mergeTableMetrics(
    aggregate.aggregateMetrics,
    pipelineResult.metrics
  );

  if (!pipelineResult.modified) {
    return value;
  }

  aggregate.transformed = true;
  aggregate.fieldsTransformed++;
  return pipelineResult.content;
}

export function remediateTablesInContentBody(
  contentBody: LessonContentBody
): TableContentBodyRemediationResult {
  const aggregate: TableContentBodyRemediationResult = {
    contentBody,
    transformed: false,
    fieldsScanned: 0,
    fieldsTransformed: 0,
    aggregateMetrics: createEmptyTableMetrics(),
  };

  const intro = remediateTableField(contentBody.intro ?? '', aggregate);

  const sections: LessonContentBody['sections'] = [];
  for (const section of contentBody.sections ?? []) {
    sections.push({
      ...section,
      content: remediateTableField(section.content ?? '', aggregate),
    });
  }

  const examples: LessonContentBody['examples'] = [];
  for (const example of contentBody.examples ?? []) {
    examples.push({
      ...example,
      content: remediateTableField(example.content ?? '', aggregate),
      code: example.code,
    });
  }

  const exercises: LessonContentBody['exercises'] = [];
  for (const exercise of contentBody.exercises ?? []) {
    const hints: string[] = [];
    for (const hint of exercise.hints ?? []) {
      hints.push(remediateTableField(hint, aggregate));
    }

    exercises.push({
      ...exercise,
      question: remediateTableField(exercise.question ?? '', aggregate),
      solution: remediateTableField(exercise.solution ?? '', aggregate),
      hints,
    });
  }

  return {
    ...aggregate,
    contentBody: {
      ...contentBody,
      intro,
      sections,
      examples,
      exercises,
    },
  };
}

export function resolveRemediationStrategy(
  aggregateMetrics: MermaidAggregateMetrics
): MermaidRenderRemediationMetadata['strategy'] {
  const simplified = aggregateMetrics.diagramsSimplified ?? 0;
  const split = aggregateMetrics.diagramsSplit ?? 0;
  const structuredFallback = aggregateMetrics.diagramsStructuredFallback ?? 0;

  const strategyCount = [simplified > 0, split > 0, structuredFallback > 0].filter(Boolean).length;

  if (strategyCount > 1) {
    return 'mixed';
  }
  if (structuredFallback > 0) {
    return 'structured_markdown_fallback';
  }
  if (split > 0) {
    return 'split';
  }
  if (simplified > 0) {
    return 'simplify';
  }
  return 'none';
}
