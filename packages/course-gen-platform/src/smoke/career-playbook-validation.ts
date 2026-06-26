import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookPlaybookStatus,
} from '@megacampus/shared-types';
import { CAREER_PLAYBOOK_FINAL_BLOCK_ORDER } from '@/stages/stage-career-playbook/nodes/final-assembler';

export type CareerPlaybookSmokeEvidenceStatus = 'pass' | 'fail' | 'skipped';

export interface CareerPlaybookSmokeEvidenceCheck {
  id: string;
  status: CareerPlaybookSmokeEvidenceStatus;
  note: string;
}

export interface CareerPlaybookSmokeEvidencePlaybook {
  id: string;
  status: CareerPlaybookPlaybookStatus;
  completedAt?: string | null;
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  finalMarkdown?: string | null;
}

export interface CareerPlaybookSmokePdfEvidence {
  contentType: string;
  sizeBytes: number;
  startsWithPdfHeader?: boolean;
}

export interface CareerPlaybookSmokeShareEvidence {
  isPublic: boolean;
  shareSlug?: string | null;
  publicFetchOk?: boolean;
}

export interface CareerPlaybookSmokeCourseBridgeEvidence {
  courseId?: string | null;
  redirectUrl?: string | null;
  sourceDocumentIds?: string[];
  documentProcessingStatus?: string | null;
  documentProcessingError?: string | null;
}

export interface CareerPlaybookSmokeEvidenceInput {
  playbook: CareerPlaybookSmokeEvidencePlaybook;
  pdf?: CareerPlaybookSmokePdfEvidence;
  share?: CareerPlaybookSmokeShareEvidence;
  courseBridge?: CareerPlaybookSmokeCourseBridgeEvidence;
  requireSurfaces?: boolean;
  requireCourseBridge?: boolean;
}

export interface CareerPlaybookSmokeEvidenceReport {
  status: 'pass' | 'fail';
  checks: CareerPlaybookSmokeEvidenceCheck[];
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function summarizeEvidenceStatus(
  checks: CareerPlaybookSmokeEvidenceCheck[]
): CareerPlaybookSmokeEvidenceReport['status'] {
  return checks.some(check => check.status === 'fail') ? 'fail' : 'pass';
}

function validateCompletedPlaybook(
  playbook: CareerPlaybookSmokeEvidencePlaybook
): CareerPlaybookSmokeEvidenceCheck {
  if (playbook.status !== 'completed') {
    return {
      id: 'completed-playbook',
      status: 'fail',
      note: `Expected completed status; found ${playbook.status}.`,
    };
  }

  if (!hasText(playbook.completedAt)) {
    return {
      id: 'completed-playbook',
      status: 'fail',
      note: 'Completed playbook is missing completedAt evidence.',
    };
  }

  if (!hasText(playbook.finalMarkdown)) {
    return {
      id: 'completed-playbook',
      status: 'fail',
      note: 'Completed playbook is missing finalMarkdown evidence.',
    };
  }

  return {
    id: 'completed-playbook',
    status: 'pass',
    note: `Career Playbook ${playbook.id} is completed with final markdown.`,
  };
}

function validateGeneratedBlocks(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): CareerPlaybookSmokeEvidenceCheck {
  const missing = CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.filter(blockId => {
    const content = generatedBlocks[blockId]?.content;
    return !hasText(content);
  });

  if (missing.length > 0) {
    return {
      id: 'generated-blocks',
      status: 'fail',
      note: `Missing generated block evidence: ${missing.join(', ')}.`,
    };
  }

  return {
    id: 'generated-blocks',
    status: 'pass',
    note: `All ${CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.length} required blocks are present.`,
  };
}

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
    if (!TABLE_SEPARATOR_PATTERN.test(lines[index])) continue;

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

function countMermaidDiagrams(markdown: string): number {
  return markdown.match(/```mermaid[\s\S]*?```/gi)?.length ?? 0;
}

function validateDeterministicContent(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): CareerPlaybookSmokeEvidenceCheck {
  const issues: string[] = [];
  const antiGoals = countStructuredItems(generatedBlocks.block_2?.content ?? '');
  const decisions = countStructuredItems(generatedBlocks.block_5?.content ?? '');
  const failureModes = countStructuredItems(generatedBlocks.block_21?.content ?? '');
  const dependenciesMermaid = countMermaidDiagrams(generatedBlocks.block_10?.content ?? '');
  const careerMermaid = countMermaidDiagrams(generatedBlocks.block_11?.content ?? '');
  const processMermaid = countMermaidDiagrams(generatedBlocks.block_16?.content ?? '');

  if (antiGoals < 4)
    issues.push(`Expected block_2 to contain at least 4 anti-goals; found ${antiGoals}.`);
  if (decisions < 4)
    issues.push(`Expected block_5 to contain at least 4 decisions; found ${decisions}.`);
  if (failureModes < 3) {
    issues.push(`Expected block_21 to contain at least 3 failure modes; found ${failureModes}.`);
  }
  if (dependenciesMermaid < 1) issues.push('Expected block_10 dependencies Mermaid coverage.');
  if (careerMermaid < 1) issues.push('Expected block_11 career path Mermaid coverage.');
  if (processMermaid < 1) issues.push('Expected block_16 main process Mermaid coverage.');

  if (issues.length > 0) {
    return {
      id: 'deterministic-content',
      status: 'fail',
      note: issues.join(' '),
    };
  }

  return {
    id: 'deterministic-content',
    status: 'pass',
    note: 'Required Mermaid, anti-goal, decision-matrix, and failure-mode checks passed.',
  };
}

function validatePdf(
  pdf: CareerPlaybookSmokePdfEvidence | undefined,
  requireSurfaces: boolean
): CareerPlaybookSmokeEvidenceCheck {
  if (!pdf) {
    return {
      id: 'pdf-export',
      status: requireSurfaces ? 'fail' : 'skipped',
      note: 'PDF export evidence was not supplied.',
    };
  }

  if (pdf.contentType !== 'application/pdf' || pdf.sizeBytes <= 0 || !pdf.startsWithPdfHeader) {
    return {
      id: 'pdf-export',
      status: 'fail',
      note: 'PDF evidence must be application/pdf, non-empty, and start with a PDF header.',
    };
  }

  return {
    id: 'pdf-export',
    status: 'pass',
    note: `PDF export returned ${pdf.sizeBytes} bytes.`,
  };
}

function validateShare(
  share: CareerPlaybookSmokeShareEvidence | undefined,
  requireSurfaces: boolean
): CareerPlaybookSmokeEvidenceCheck {
  if (!share) {
    return {
      id: 'public-share',
      status: requireSurfaces ? 'fail' : 'skipped',
      note: 'Public share evidence was not supplied.',
    };
  }

  if (!share.isPublic || !hasText(share.shareSlug) || share.publicFetchOk !== true) {
    return {
      id: 'public-share',
      status: 'fail',
      note: 'Share evidence must include public=true, a share slug, and a successful public fetch.',
    };
  }

  return {
    id: 'public-share',
    status: 'pass',
    note: `Public share ${share.shareSlug} rendered successfully.`,
  };
}

function validateCourseBridge(
  courseBridge: CareerPlaybookSmokeCourseBridgeEvidence | undefined,
  requireSurfaces: boolean
): CareerPlaybookSmokeEvidenceCheck {
  if (!courseBridge) {
    return {
      id: 'course-bridge',
      status: requireSurfaces ? 'fail' : 'skipped',
      note: 'Course bridge evidence was not supplied.',
    };
  }

  if (
    !hasText(courseBridge.courseId) ||
    !hasText(courseBridge.redirectUrl) ||
    !courseBridge.sourceDocumentIds ||
    courseBridge.sourceDocumentIds.length === 0
  ) {
    return {
      id: 'course-bridge',
      status: 'fail',
      note: 'Course bridge evidence must include courseId, redirectUrl, and source document IDs.',
    };
  }

  if (courseBridge.documentProcessingStatus === 'failed') {
    return {
      id: 'course-bridge',
      status: 'fail',
      note: `Course bridge document processing failed: ${
        courseBridge.documentProcessingError ?? 'unknown error'
      }.`,
    };
  }

  return {
    id: 'course-bridge',
    status: 'pass',
    note: `Course bridge created ${courseBridge.courseId} with ${courseBridge.sourceDocumentIds.length} source document(s)${
      hasText(courseBridge.documentProcessingStatus)
        ? `; document processing reached ${courseBridge.documentProcessingStatus}`
        : ''
    }.`,
  };
}

export function validateCareerPlaybookSmokeEvidence(
  input: CareerPlaybookSmokeEvidenceInput
): CareerPlaybookSmokeEvidenceReport {
  const requireSurfaces = input.requireSurfaces ?? true;
  const requireCourseBridge = input.requireCourseBridge ?? requireSurfaces;
  const checks: CareerPlaybookSmokeEvidenceCheck[] = [
    validateCompletedPlaybook(input.playbook),
    validateGeneratedBlocks(input.playbook.generatedBlocks),
    validateDeterministicContent(input.playbook.generatedBlocks),
    validatePdf(input.pdf, requireSurfaces),
    validateShare(input.share, requireSurfaces),
    validateCourseBridge(input.courseBridge, requireCourseBridge),
  ];

  return {
    status: summarizeEvidenceStatus(checks),
    checks,
  };
}
