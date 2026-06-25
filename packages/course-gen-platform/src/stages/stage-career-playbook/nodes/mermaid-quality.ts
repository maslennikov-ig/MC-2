import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookJudgeIssue,
  CareerPlaybookQualityIssue,
} from '@megacampus/shared-types';
import { runMermaidFixPipeline } from '@/stages/stage6-lesson-content/utils/mermaid-fix-pipeline';
import { validateMermaidSyntax } from '@/stages/stage6-lesson-content/utils/mermaid-validator';

const MERMAID_BLOCK_PATTERN = /```mermaid\s*([\s\S]*?)```/gi;

interface MermaidBlockMatch {
  fullMatch: string;
  code: string;
  startIndex: number;
  endIndex: number;
}

interface InvalidMermaidBlock {
  index: number;
  code: string;
  errors: string[];
}

interface MermaidMarkdownRemediationResult {
  content: string;
  fallbackCount: number;
  repairedCount: number;
  modified: boolean;
}

export interface CareerPlaybookMermaidRemediationResult {
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  qualityIssues: CareerPlaybookQualityIssue[];
}

function extractMermaidBlocks(markdown: string): MermaidBlockMatch[] {
  const regex = new RegExp(MERMAID_BLOCK_PATTERN.source, MERMAID_BLOCK_PATTERN.flags);
  const blocks: MermaidBlockMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({
      fullMatch: match[0],
      code: match[1].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return blocks;
}

function firstError(errors: string[]): string {
  return errors.find(error => error.trim().length > 0)?.trim() ?? 'Unknown Mermaid parse error';
}

export async function findInvalidCareerPlaybookMermaidBlocks(
  markdown: string
): Promise<InvalidMermaidBlock[]> {
  const blocks = extractMermaidBlocks(markdown);
  const invalid: InvalidMermaidBlock[] = [];

  for (const [index, block] of blocks.entries()) {
    const validation = await validateMermaidSyntax(block.code);
    if (!validation.valid) {
      invalid.push({
        index,
        code: block.code,
        errors: validation.errors,
      });
    }
  }

  return invalid;
}

export async function validateCareerPlaybookMermaidSyntax(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): Promise<CareerPlaybookJudgeIssue[]> {
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, block] of Object.entries(generatedBlocks)) {
    if (!block?.content || !/```mermaid/i.test(block.content)) continue;

    const invalidBlocks = await findInvalidCareerPlaybookMermaidBlocks(block.content);
    for (const invalid of invalidBlocks) {
      issues.push({
        block_id: blockId,
        severity: 'critical',
        description: `Found invalid Mermaid syntax in ${blockId} diagram ${invalid.index + 1}: ${firstError(invalid.errors)}`,
        suggestion: 'Fix or replace the Mermaid diagram so it parses before publishing.',
      });
    }
  }

  return issues;
}

function buildFallbackBlock(errors: string[]): string {
  const message = firstError(errors).replace(/\s+/g, ' ').slice(0, 220);
  return `> Диаграмма не была отображена автоматически: Mermaid-синтаксис не прошёл проверку. Проверьте связи в этом разделе вручную.\n>\n> Техническая причина: ${message}`;
}

async function replaceInvalidMermaidWithFallback(content: string): Promise<{
  content: string;
  fallbackCount: number;
}> {
  const blocks = extractMermaidBlocks(content);
  if (blocks.length === 0) {
    return { content, fallbackCount: 0 };
  }

  let fallbackCount = 0;
  let cursor = 0;
  let nextContent = '';

  for (const block of blocks) {
    const validation = await validateMermaidSyntax(block.code);
    nextContent += content.slice(cursor, block.startIndex);
    if (validation.valid) {
      nextContent += block.fullMatch;
    } else {
      fallbackCount += 1;
      nextContent += buildFallbackBlock(validation.errors);
    }
    cursor = block.endIndex;
  }

  nextContent += content.slice(cursor);
  return { content: nextContent, fallbackCount };
}

async function remediateCareerPlaybookMermaidMarkdown(
  content: string
): Promise<MermaidMarkdownRemediationResult> {
  const invalidBefore = await findInvalidCareerPlaybookMermaidBlocks(content);
  if (invalidBefore.length === 0) {
    return {
      content,
      fallbackCount: 0,
      repairedCount: 0,
      modified: false,
    };
  }

  const pipelineResult = await runMermaidFixPipeline(content, { skipLLM: true });
  const fallbackResult = await replaceInvalidMermaidWithFallback(pipelineResult.content);
  let nextContent = fallbackResult.content;
  let invalidAfter = await findInvalidCareerPlaybookMermaidBlocks(nextContent);

  if (invalidAfter.length > 0) {
    nextContent = nextContent.replace(MERMAID_BLOCK_PATTERN, () =>
      buildFallbackBlock(['Invalid Mermaid syntax'])
    );
    invalidAfter = await findInvalidCareerPlaybookMermaidBlocks(nextContent);
  }

  if (invalidAfter.length > 0) {
    nextContent = nextContent.replace(MERMAID_BLOCK_PATTERN, '');
  }

  const trimmedContent = nextContent.trim();
  return {
    content: trimmedContent,
    fallbackCount:
      pipelineResult.metrics.diagramsFallback + fallbackResult.fallbackCount + invalidAfter.length,
    repairedCount: invalidBefore.length,
    modified: trimmedContent !== content.trim(),
  };
}

function buildMermaidQualityIssue(params: {
  blockId: CareerPlaybookBlockId;
  fallbackCount: number;
  repairedCount: number;
}): CareerPlaybookQualityIssue {
  const usedFallback = params.fallbackCount > 0;
  return {
    id: `mermaid:${params.blockId}`,
    source: 'mermaid',
    severity: 'warning',
    blockId: params.blockId,
    title: usedFallback ? 'Mermaid-диаграмма заменена' : 'Mermaid-диаграмма исправлена',
    message: usedFallback
      ? 'Одна или несколько Mermaid-диаграмм в блоке не прошли синтаксическую проверку и были заменены безопасным markdown-текстом.'
      : 'Одна или несколько Mermaid-диаграмм в блоке были автоматически исправлены перед сохранением.',
    suggestion: usedFallback
      ? 'Откройте блок и восстановите диаграмму вручную, если визуальная схема нужна в финальной инструкции.'
      : 'Проверьте, что исправленная диаграмма передаёт нужные связи и не требует ручной правки.',
    action: 'edit',
  };
}

export async function remediateCareerPlaybookMermaidBlocks(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): Promise<CareerPlaybookMermaidRemediationResult> {
  const updatedBlocks = { ...generatedBlocks };
  const qualityIssues: CareerPlaybookQualityIssue[] = [];

  for (const [blockId, block] of Object.entries(generatedBlocks)) {
    if (!block?.content || !/```mermaid/i.test(block.content)) continue;

    const remediation = await remediateCareerPlaybookMermaidMarkdown(block.content);
    if (!remediation.modified) continue;

    updatedBlocks[blockId] = {
      ...block,
      content: remediation.content,
    };
    qualityIssues.push(
      buildMermaidQualityIssue({
        blockId,
        fallbackCount: remediation.fallbackCount,
        repairedCount: remediation.repairedCount,
      })
    );
  }

  return {
    generatedBlocks: updatedBlocks,
    qualityIssues,
  };
}

export async function remediateCareerPlaybookFinalMarkdown(
  finalMarkdown: string | null | undefined
): Promise<MermaidMarkdownRemediationResult> {
  if (!finalMarkdown?.trim() || !/```mermaid/i.test(finalMarkdown)) {
    return {
      content: finalMarkdown ?? '',
      fallbackCount: 0,
      repairedCount: 0,
      modified: false,
    };
  }

  return remediateCareerPlaybookMermaidMarkdown(finalMarkdown);
}
