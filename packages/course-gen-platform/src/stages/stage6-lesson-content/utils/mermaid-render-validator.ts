/**
 * Mermaid Render Validator
 * @module stages/stage6-lesson-content/utils/mermaid-render-validator
 *
 * Syntax validation alone is not enough for Mermaid quality gates.
 * This module validates that Mermaid blocks are both parse-valid and
 * produce non-empty SVG output at render time.
 */

import mermaid from 'mermaid';
import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';

import { logger } from '@/shared/logger';
import { ensureDOMGlobals } from './mermaid-dom-setup';
import {
  MERMAID_FALLBACK_COMMENT_REGEX,
  countMermaidFallbackComments,
} from './mermaid-fallback-marker';
import { MERMAID_BLOCK_REGEX } from './mermaid-sanitizer';
import { validateMermaidSyntax } from './mermaid-validator';

export { MERMAID_FALLBACK_COMMENT_REGEX, countMermaidFallbackComments };

/**
 * Render validation diagnostic for a single Mermaid block.
 */
export interface MermaidRenderBlockDiagnostic {
  blockIndex: number;
  diagramType: string | null;
  parseValid: boolean;
  renderValid: boolean;
  svgHasRenderableContent: boolean;
  errors: string[];
  codeSnippet: string;
}

export interface MermaidRenderRemediationMetadata {
  attempted: boolean;
  transformed: boolean;
  strategy: 'none' | 'simplify' | 'split' | 'structured_markdown_fallback' | 'mixed';
  fieldsScanned: number;
  fieldsTransformed: number;
  pipelineRuns: number;
  aggregateMetrics?: {
    diagramsTotal: number;
    diagramsAutoWrapped: number;
    diagramsFixedRegex: number;
    diagramsFixedLLM: number;
    diagramsFallback: number;
    diagramsSimplified?: number;
    diagramsSplit?: number;
    diagramsStructuredFallback?: number;
  };
  initialFailedBlocks: number;
  initialFallbackComments: number;
  postFailedBlocks: number;
  postFallbackComments: number;
  error?: string;
}

/**
 * Aggregate result for Mermaid render validation.
 */
export interface MermaidRenderValidationResult {
  passed: boolean;
  totalBlocks: number;
  failedBlocks: number;
  fallbackComments: number;
  diagnostics: MermaidRenderBlockDiagnostic[];
  remediation?: MermaidRenderRemediationMetadata | null;
}

interface ExtractedMermaidBlock {
  index: number;
  code: string;
}

let rendererInitialized = false;
let rendererInitPromise: Promise<void> | null = null;

function getCodeSnippet(code: string, maxLength = 140): string {
  const normalized = code.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function extractMermaidBlocks(content: string): ExtractedMermaidBlock[] {
  const blocks: ExtractedMermaidBlock[] = [];

  MERMAID_BLOCK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = MERMAID_BLOCK_REGEX.exec(content)) !== null) {
    blocks.push({
      index,
      code: match[1].trim(),
    });
    index++;
  }

  return blocks;
}

function hasRenderableSvgContent(svgMarkup: string): boolean {
  if (!svgMarkup || !svgMarkup.includes('<svg')) {
    return false;
  }

  const host = globalThis.document?.createElement('div');
  if (!host) {
    return false;
  }

  host.innerHTML = svgMarkup;
  const svg = host.querySelector('svg');
  if (!svg) {
    return false;
  }

  const candidateElements = svg.querySelectorAll(
    'path, rect, circle, ellipse, polygon, line, text, foreignObject'
  );

  for (const element of candidateElements) {
    if (!element.closest('defs')) {
      return true;
    }
  }

  return false;
}

async function ensureMermaidRendererInitialized(): Promise<void> {
  if (rendererInitialized) {
    return;
  }

  if (rendererInitPromise) {
    return rendererInitPromise;
  }

  rendererInitPromise = Promise.resolve().then(() => {
    ensureDOMGlobals();
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
      },
    });
    rendererInitialized = true;
  });

  return rendererInitPromise;
}

export async function validateMermaidBlockRender(
  code: string,
  blockIndex: number
): Promise<MermaidRenderBlockDiagnostic> {
  const parseResult = await validateMermaidSyntax(code);
  const baseDiagnostic: MermaidRenderBlockDiagnostic = {
    blockIndex,
    diagramType: parseResult.diagramType,
    parseValid: parseResult.valid,
    renderValid: false,
    svgHasRenderableContent: false,
    errors: [],
    codeSnippet: getCodeSnippet(code),
  };

  if (!parseResult.valid) {
    return {
      ...baseDiagnostic,
      errors: parseResult.errors.length > 0 ? parseResult.errors : ['Mermaid parse failed'],
    };
  }

  try {
    await ensureMermaidRendererInitialized();
    const renderId = `mermaid-render-check-${Date.now()}-${blockIndex}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const { svg } = await mermaid.render(renderId, code);

    if (!svg) {
      return {
        ...baseDiagnostic,
        errors: ['Mermaid render returned empty SVG string'],
      };
    }

    const svgHasRenderableContent = hasRenderableSvgContent(svg);
    if (!svgHasRenderableContent) {
      return {
        ...baseDiagnostic,
        svgHasRenderableContent: false,
        errors: ['Mermaid render produced SVG without renderable graph nodes'],
      };
    }

    return {
      ...baseDiagnostic,
      renderValid: true,
      svgHasRenderableContent: true,
      errors: [],
    };
  } catch (error) {
    return {
      ...baseDiagnostic,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function validateMermaidRenderInMarkdown(
  content: string
): Promise<MermaidRenderValidationResult> {
  const blocks = extractMermaidBlocks(content);
  const diagnostics: MermaidRenderBlockDiagnostic[] = [];

  for (const block of blocks) {
    diagnostics.push(await validateMermaidBlockRender(block.code, block.index));
  }

  const failedBlocks = diagnostics.filter(d => !d.renderValid).length;
  const fallbackComments = countMermaidFallbackComments(content);
  const passed = failedBlocks === 0 && fallbackComments === 0;

  if (!passed) {
    logger.warn(
      {
        totalBlocks: blocks.length,
        failedBlocks,
        fallbackComments,
        diagnostics: diagnostics
          .filter(d => !d.renderValid)
          .map(d => ({
            blockIndex: d.blockIndex,
            errors: d.errors,
            codeSnippet: d.codeSnippet,
          })),
      },
      'Mermaid render validation failed'
    );
  }

  return {
    passed,
    totalBlocks: blocks.length,
    failedBlocks,
    fallbackComments,
    diagnostics,
  };
}

function contentBodyToMarkdown(contentBody: LessonContentBody): string {
  const parts: string[] = [];

  if (contentBody.intro) {
    parts.push(contentBody.intro);
  }

  for (const section of contentBody.sections ?? []) {
    parts.push(`## ${section.title}`);
    parts.push(section.content);
  }

  for (const example of contentBody.examples ?? []) {
    parts.push(`### ${example.title}`);
    parts.push(example.content);
    if (example.code) {
      parts.push('```');
      parts.push(example.code);
      parts.push('```');
    }
  }

  for (const exercise of contentBody.exercises ?? []) {
    parts.push(exercise.question);
    if (exercise.solution) {
      parts.push(exercise.solution);
    }
    if (exercise.hints?.length) {
      parts.push(...exercise.hints);
    }
  }

  return parts.join('\n\n');
}

export async function validateMermaidRenderInLessonContentBody(
  contentBody: LessonContentBody
): Promise<MermaidRenderValidationResult> {
  const markdown = contentBodyToMarkdown(contentBody);
  return validateMermaidRenderInMarkdown(markdown);
}
