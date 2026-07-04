import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookJudgeIssue,
} from '@megacampus/shared-types';

export interface MermaidDiagramRequirement {
  blockId: CareerPlaybookBlockId;
  label: string;
  minDiagrams: number;
}

export interface ValidateMermaidCoverageOptions {
  requirements?: MermaidDiagramRequirement[];
  requireAll?: boolean;
}

export const CAREER_PLAYBOOK_MERMAID_REQUIREMENTS: MermaidDiagramRequirement[] = [
  { blockId: 'block_10', label: 'dependencies', minDiagrams: 1 },
  { blockId: 'block_11', label: 'career path', minDiagrams: 1 },
  { blockId: 'block_16', label: 'main process', minDiagrams: 1 },
];

const TABLE_SEPARATOR_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.includes('|', 1);
}

function isNonEmptyTableRow(line: string): boolean {
  return (
    line
      .split('|')
      .map(cell => cell.trim())
      .filter(Boolean).length > 0
  );
}

function countMarkdownTableBodyRows(markdown: string): number {
  const lines = markdown.split(/\r?\n/);
  let total = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (!TABLE_SEPARATOR_PATTERN.test(lines[index])) {
      continue;
    }

    let rowIndex = index + 1;
    while (rowIndex < lines.length && isTableLine(lines[rowIndex])) {
      if (!TABLE_SEPARATOR_PATTERN.test(lines[rowIndex]) && isNonEmptyTableRow(lines[rowIndex])) {
        total += 1;
      }
      rowIndex += 1;
    }
  }

  return total;
}

function countMarkdownListItems(markdown: string): number {
  return markdown.split(/\r?\n/).filter(line => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)).length;
}

function countStructuredItems(markdown: string): number {
  return Math.max(countMarkdownTableBodyRows(markdown), countMarkdownListItems(markdown));
}

function buildMinimumIssue(
  blockId: CareerPlaybookBlockId,
  label: string,
  found: number,
  minimum: number
): CareerPlaybookJudgeIssue {
  return {
    block_id: blockId,
    severity: 'critical',
    description: `Expected ${blockId} to contain at least ${minimum} ${label}; found ${found}.`,
    suggestion: `Add concrete rows until ${blockId} has at least ${minimum} ${label}.`,
  };
}

export function validateAntiGoalsMinimum(
  markdown: string,
  minimum = 4
): CareerPlaybookJudgeIssue[] {
  const found = countStructuredItems(markdown);
  return found >= minimum ? [] : [buildMinimumIssue('block_2', 'anti-goals', found, minimum)];
}

export function validateDecisionMatrixMinimum(
  markdown: string,
  minimum = 4
): CareerPlaybookJudgeIssue[] {
  const found = countStructuredItems(markdown);
  return found >= minimum ? [] : [buildMinimumIssue('block_5', 'decisions', found, minimum)];
}

export function validateFailureModesMinimum(
  markdown: string,
  minimum = 3
): CareerPlaybookJudgeIssue[] {
  const found = countStructuredItems(markdown);
  return found >= minimum ? [] : [buildMinimumIssue('block_21', 'failure modes', found, minimum)];
}

export function countMermaidDiagrams(markdown: string): number {
  return markdown.match(/```mermaid[\s\S]*?```/gi)?.length ?? 0;
}

export function validateMermaidCoverage(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  options: ValidateMermaidCoverageOptions = {}
): CareerPlaybookJudgeIssue[] {
  const requirements = options.requirements ?? CAREER_PLAYBOOK_MERMAID_REQUIREMENTS;
  const applicableRequirements = options.requireAll
    ? requirements
    : requirements.filter(requirement => Boolean(generatedBlocks[requirement.blockId]?.content));

  return applicableRequirements.flatMap(requirement => {
    const content = generatedBlocks[requirement.blockId]?.content ?? '';
    const found = countMermaidDiagrams(content);

    if (found >= requirement.minDiagrams) {
      return [];
    }

    return [
      {
        block_id: requirement.blockId,
        severity: 'critical',
        description: `Expected ${requirement.label} Mermaid coverage in ${requirement.blockId}: at least ${requirement.minDiagrams} diagram(s), found ${found}.`,
        suggestion: `Add a fenced mermaid diagram for the ${requirement.label} view.`,
      } satisfies CareerPlaybookJudgeIssue,
    ];
  });
}
