/**
 * What the judge writes to `generation_trace` when it finishes.
 *
 * @module judge-trace
 *
 * Split out of `judge-node-helpers.ts`, where it was one nested object literal inside
 * `finalizeJudgeResult` — about half of that function's cyclomatic complexity of 53, and none of
 * it a decision: every branch is `present ? shape it : null`, which is shaping, not logic.
 *
 * The trims are deliberate and are the reason this is worth its own module. A judge run can
 * produce hundreds of claims and dozens of diagnostics, and the trace row is read by a person in
 * a viewer, not by a query — so claims are capped at five and failed Mermaid diagnostics at
 * three. Raising either is a decision about how much a row costs to store and read.
 */

import type { CascadeResult } from '../judge/cascade/types';

interface JudgeTraceInput {
  finalRecommendation: unknown;
  finalScore: unknown;
  decisionAction: unknown;
  needsRegeneration: unknown;
  judgeModelsUsed: string[];
  enrichedOutput: unknown;
  cascadeResult: CascadeResult | null | undefined;
  factualWarnings: unknown;
  sourceGroundingRemediation?: { changed: boolean; tasks: unknown } | null;
  mermaidRenderValidation?: {
    passed: boolean;
    totalBlocks: number;
    failedBlocks: number;
    fallbackComments: unknown;
    diagnostics: Array<{
      parseValid: boolean;
      blockIndex: number;
      errors: unknown;
      codeSnippet: unknown;
    }>;
    remediation?: unknown;
  } | null;
  tableFixMetrics: unknown;
}

/** The five claims a reader can act on, with the evidence each was checked against. */
function summarizeFactualDiagnostics(cascadeResult: CascadeResult | null | undefined) {
  const factual = cascadeResult?.factualVerificationResult;
  if (!factual) return null;

  return {
    overallAccuracyScore: factual.overallAccuracyScore,
    contradictedClaims: factual.contradictedClaims,
    unverifiedClaims: factual.unverifiedClaims,
    noEvidenceClaims: factual.noEvidenceClaims,
    claims: factual.claims.slice(0, 5).map(claim => ({
      text: claim.text,
      status: claim.verificationStatus,
      confidence: claim.confidence,
      evidenceChunkIds: claim.ragEvidence.map(chunk => chunk.chunk_id),
      mismatchReason: claim.diagnostics?.mismatchReason,
    })),
  };
}

/** Only the diagrams that FAILED to parse, three of them, with the code that failed. */
function summarizeMermaidGate(mermaidRenderValidation: JudgeTraceInput['mermaidRenderValidation']) {
  if (!mermaidRenderValidation) return null;

  return {
    passed: mermaidRenderValidation.passed,
    totalBlocks: mermaidRenderValidation.totalBlocks,
    failedBlocks: mermaidRenderValidation.failedBlocks,
    fallbackComments: mermaidRenderValidation.fallbackComments,
    failedDiagnostics: mermaidRenderValidation.diagnostics
      .filter(diagnostic => !diagnostic.parseValid)
      .slice(0, 3)
      .map(diagnostic => ({
        blockIndex: diagnostic.blockIndex,
        errors: diagnostic.errors,
        codeSnippet: diagnostic.codeSnippet,
      })),
    remediation: mermaidRenderValidation.remediation ?? null,
  };
}

export function buildJudgeTraceOutput(input: JudgeTraceInput): Record<string, unknown> {
  const { cascadeResult } = input;

  return {
    finalRecommendation: input.finalRecommendation,
    finalScore: input.finalScore,
    decisionAction: input.decisionAction,
    needsRegeneration: input.needsRegeneration,
    judgeModelsUsed: input.judgeModelsUsed,
    enrichedOutput: input.enrichedOutput,
    qualitySummary: cascadeResult?.heuristicResults?.qualitySummary ?? null,
    factualDiagnostics: summarizeFactualDiagnostics(cascadeResult),
    factualWarnings: input.factualWarnings,
    sourceGroundingRemediation: input.sourceGroundingRemediation
      ? {
          changed: input.sourceGroundingRemediation.changed,
          tasks: input.sourceGroundingRemediation.tasks,
        }
      : null,
    factualIssueVeto: cascadeResult?.factualIssueVetoApplied
      ? { applied: true, issue: cascadeResult.blockingFactualIssue }
      : null,
    mermaidRenderGate: summarizeMermaidGate(input.mermaidRenderValidation),
    tableRemediation: input.tableFixMetrics,
  };
}
