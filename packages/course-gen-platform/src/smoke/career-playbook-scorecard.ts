/**
 * Career Playbook — deterministic quality scorecard (acceptance level L1)
 * @module smoke/career-playbook-scorecard
 *
 * Runs the quality-contract checks over a finished Role Guide and returns a
 * structured report. This is the gate that does not depend on a model being in a
 * good mood: the 2026-08-11 review found four classes of defect by hand, and
 * every one of them is formalizable, so none of them should ever again require a
 * human to notice it.
 *
 * See docs/plans/career-playbook/06-quality-acceptance.md.
 */

import {
  CareerPlaybookRoleProfileSpecSchema,
  type CareerPlaybookBlockId,
  type CareerPlaybookBlockState,
  type CareerPlaybookJudgeIssue,
  type CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  runCareerPlaybookContractChecks,
  type CareerPlaybookQualityCheckContext,
} from '@/stages/stage-career-playbook/nodes/quality-checks';
import {
  validateAntiGoalsMinimum,
  validateDecisionMatrixMinimum,
  validateFailureModesMinimum,
  validateMermaidCoverage,
} from '@/stages/stage-career-playbook/nodes/cross-block-judge-checks';

export interface CareerPlaybookScorecardInput {
  /** Assembled guide markdown; split into blocks on `## ` headings. */
  markdown: string;
  /** Parsed RoleProfileSpec (ledgers, generation date, business-context mode). */
  roleProfileSpec: unknown;
  businessContextMode?: 'universal' | 'company_specific';
}

export interface CareerPlaybookScorecardReport {
  pass: boolean;
  criticalCount: number;
  byCategory: Record<string, number>;
  issues: CareerPlaybookJudgeIssue[];
  blocksScanned: number;
  ledger: { metrics: number; sources: number; generatedOn: string | null };
}

const HEADER_PATTERN = /^##\s+Header\s*$/i;
const NUMBERED_BLOCK_PATTERN = /^##\s+([1-9]|1[0-9]|2[0-6])\.\s+/;

/**
 * Split assembled markdown back into blocks by their canonical `## ` headings.
 * The scorecard runs on a finished document (an artifact from a live run, or a
 * fixture), so it has to recover the block boundaries the graph knew at
 * generation time.
 */
export function splitCareerPlaybookMarkdownIntoBlocks(
  markdown: string
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  const lines = markdown.split(/\r?\n/);
  const blocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> = {};

  let currentId: CareerPlaybookBlockId | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentId) return;
    blocks[currentId] = { content: buffer.join('\n').trim(), status: 'generated', attempt: 1 };
    buffer = [];
  };

  for (const line of lines) {
    if (HEADER_PATTERN.test(line)) {
      flush();
      currentId = 'header';
    } else {
      const numbered = NUMBERED_BLOCK_PATTERN.exec(line);
      if (numbered) {
        flush();
        currentId = `block_${numbered[1]}`;
      }
    }

    if (currentId) buffer.push(line);
  }
  flush();

  return blocks;
}

function countByCategory(issues: CareerPlaybookJudgeIssue[]): Record<string, number> {
  return issues.reduce<Record<string, number>>((counts, issue) => {
    const key = issue.category ?? 'uncategorized';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

/**
 * Score a finished guide. Returns every critical finding, grouped by category,
 * with a hard pass threshold of zero criticals.
 */
export function scoreCareerPlaybook(
  input: CareerPlaybookScorecardInput
): CareerPlaybookScorecardReport {
  const parsedSpec = CareerPlaybookRoleProfileSpecSchema.safeParse(input.roleProfileSpec);
  const spec: CareerPlaybookRoleProfileSpec | null = parsedSpec.success ? parsedSpec.data : null;
  const blocks = splitCareerPlaybookMarkdownIntoBlocks(input.markdown);

  const context: CareerPlaybookQualityCheckContext = {
    metricLedger: spec?.metric_ledger ?? [],
    evidenceLedger: spec?.evidence_ledger ?? [],
    generatedOn: spec?.generated_on,
    businessContextMode: input.businessContextMode ?? spec?.business_context?.mode ?? 'universal',
    publishedAntiGoals: blocks.block_2?.content ? [blocks.block_2.content] : [],
  };

  const issues: CareerPlaybookJudgeIssue[] = [
    ...runCareerPlaybookContractChecks(blocks, context),
    // The pre-existing structural minimums belong in the same report: a guide
    // that satisfies the contract but lost its decision matrix is still not
    // publication-ready.
    ...(blocks.block_2?.content ? validateAntiGoalsMinimum(blocks.block_2.content) : []),
    ...(blocks.block_5?.content ? validateDecisionMatrixMinimum(blocks.block_5.content) : []),
    ...(blocks.block_21?.content ? validateFailureModesMinimum(blocks.block_21.content) : []),
    ...validateMermaidCoverage(blocks),
  ];

  const criticals = issues.filter(issue => issue.severity === 'critical');

  return {
    pass: criticals.length === 0,
    criticalCount: criticals.length,
    byCategory: countByCategory(criticals),
    issues,
    blocksScanned: Object.keys(blocks).length,
    ledger: {
      metrics: spec?.metric_ledger.length ?? 0,
      sources: spec?.evidence_ledger.length ?? 0,
      generatedOn: spec?.generated_on ?? null,
    },
  };
}

/** Human-readable report for a terminal or an evidence file. */
export function formatCareerPlaybookScorecard(report: CareerPlaybookScorecardReport): string {
  const lines = [
    `Career Playbook scorecard: ${report.pass ? 'PASS' : 'FAIL'}`,
    `Blocks scanned: ${report.blocksScanned}`,
    `Ledger: ${report.ledger.metrics} metrics, ${report.ledger.sources} sources, generated ${
      report.ledger.generatedOn ?? 'unknown'
    }`,
    `Critical findings: ${report.criticalCount}`,
  ];

  for (const [category, count] of Object.entries(report.byCategory).sort()) {
    lines.push(`  ${category}: ${count}`);
  }

  for (const issue of report.issues.filter(item => item.severity === 'critical')) {
    lines.push(
      `  - [${issue.category ?? 'uncategorized'}] ${issue.block_id}: ${issue.description}`
    );
  }

  return lines.join('\n');
}
