import { z } from 'zod';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { searchChunks } from '@/shared/qdrant/search';
import logger from '@/shared/logger';
import { createDocumentEvidenceRepository } from '@/stages/stage4-analysis/evidence/repository';
import { enrichBaselineWithDocumentEvidence } from './advisory-enrichment';
import type { Stage5CurrentEvidenceDecision, Stage5EvidenceEnricher } from './types';

const CurrentDecisionRowSchema = z
  .object({
    id: z.string().uuid(),
    run_id: z.string().uuid(),
    course_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    conflict_id: z.string().uuid().nullable(),
    subject_kind: z.enum(['claim_conflict', 'degraded_evidence', 'detector_capacity']),
    subject_key: z.string().min(1),
    document_id: z.string().uuid().nullable().optional(),
    selected_resolution: z.string().min(1),
    selected_recommendation_value: z.string().min(1).nullable().optional(),
    supersedes_decision_id: z.string().uuid().nullable(),
    decided_at: z.string().datetime(),
  })
  .passthrough();

function currentDecision(value: unknown): Stage5CurrentEvidenceDecision {
  return CurrentDecisionRowSchema.parse(value);
}

/** Build the production-reachable Stage 5 evidence pass used by the BullMQ handler. */
export function createProductionStage5EvidenceEnricher(): Stage5EvidenceEnricher {
  const durableRepository = createDocumentEvidenceRepository(getSupabaseAdmin() as never);
  const repository = {
    getAcceptedRun: durableRepository.getAcceptedRun.bind(durableRepository),
    listItems: durableRepository.listItems.bind(durableRepository),
    listConflicts: durableRepository.listConflicts.bind(durableRepository),
    getLatestDecisions: async (runId: string) =>
      (await durableRepository.getLatestDecisions(runId)).map(currentDecision),
  };

  return input =>
    enrichBaselineWithDocumentEvidence(input, {
      repository,
      search: searchChunks,
      log: logger,
    });
}
