/**
 * Calling the model for conflict detection, and checking that what comes back is in scope.
 *
 * @module conflict-detection-port
 *
 * Split out of `conflict-detector.ts` at 1672 lines of code. Three subjects lived in that file:
 * the CONTRACT (schemas, prompts, types), the PORT (this) and the RUN (the map/reduce/classify
 * pipeline). Everything here exists because the other side is a language model or a vector store
 * — `assertVerificationRefs` most of all, which refuses a ref from a document the claim was
 * never checked against rather than filtering it out.
 *
 * Re-exported by `conflict-detector.ts`, so no import path changes.
 */

import { z } from 'zod';
import { type DocumentConflict, type EvidenceSourceRef } from '@megacampus/shared-types';
import {
  CONFLICT_CLASSIFY_SYSTEM_PROMPT,
  CONFLICT_MAP_SYSTEM_PROMPT,
  CONFLICT_REDUCE_SYSTEM_PROMPT,
  ClassificationOutputSchema,
  ConflictDetectionPort,
  ConflictMetricDeltas,
  ConflictModelCallError,
  DetectDocumentConflictsDependencies,
  DetectDocumentConflictsInput,
  DetectorCapacityIssue,
  ProductionConflictInvokeInput,
  ProductionConflictInvokeResult,
  ProductionConflictPortOptions,
  ReductionOutputSchema,
  Usage,
  UsageSchema,
  VerifyConflictSideResult,
  buildClassificationPayload,
  buildMapPayload,
  buildReductionPayload,
  emptyUsage,
  hashInput,
  mapOutputSchemaFor,
  withEnvelope,
} from './conflict-detector';

export const MAX_VERIFICATION_DOCUMENTS_PER_BATCH = 16;
export const MAX_VERIFICATION_REFS_PER_BATCH = 64;
export const MAX_VERIFICATION_BATCHES_PER_SIDE = 8;

export function representativeValues(values: string[], limit: number): string[] {
  if (values.length <= limit) return values;
  if (limit === 1) return [values[0]];
  return Array.from(
    new Set(
      Array.from(
        { length: limit },
        (_, index) => values[Math.floor((index * (values.length - 1)) / (limit - 1))]
      )
    )
  );
}

export function assertVerificationRefs(
  result: VerifyConflictSideResult,
  side: DocumentConflict['sides'][number]
): boolean {
  const documentIds = new Set(side.document_ids);
  const allowedRefs = new Set(
    side.source_refs.map(ref => `${ref.document_id}:${ref.chunk_id ?? ''}`)
  );
  for (const documentId of result.verifiedDocumentIds) {
    if (!documentIds.has(documentId)) throw new Error('Qdrant returned a foreign document ref');
  }
  for (const ref of result.sourceRefs ?? []) {
    if (
      !documentIds.has(ref.documentId) ||
      !allowedRefs.has(`${ref.documentId}:${ref.chunkId ?? ''}`)
    ) {
      throw new Error('Qdrant returned a foreign source ref');
    }
  }
  const verifiedDocuments = new Set(result.verifiedDocumentIds);
  const returnedRefs = new Set(
    (result.sourceRefs ?? []).map(ref => `${ref.documentId}:${ref.chunkId ?? ''}`)
  );
  return (
    [...documentIds].every(documentId => verifiedDocuments.has(documentId)) &&
    side.source_refs.every(ref => returnedRefs.has(`${ref.document_id}:${ref.chunk_id ?? ''}`))
  );
}

export interface ConflictVerificationResult {
  status: 'verified' | 'degraded' | 'not_required';
  plan_hash: string;
  planned_document_count: number;
  planned_ref_count: number;
  batch_count: number;
}

export async function verificationStatus(
  conflict: DocumentConflict,
  input: DetectDocumentConflictsInput,
  verify: DetectDocumentConflictsDependencies['verifyMaterialSources']
): Promise<ConflictVerificationResult> {
  if (conflict.severity === 'informational') {
    return {
      status: 'not_required',
      plan_hash: hashInput({ conflict: conflict.conflict_fingerprint, kind: 'not_required' }),
      planned_document_count: 0,
      planned_ref_count: 0,
      batch_count: 0,
    };
  }
  const plans = conflict.sides.flatMap((side, sideIndex) => {
    const selectedDocuments = representativeValues(
      [...side.document_ids].sort(),
      MAX_VERIFICATION_DOCUMENTS_PER_BATCH * MAX_VERIFICATION_BATCHES_PER_SIDE
    );
    const batches = [];
    for (
      let offset = 0;
      offset < selectedDocuments.length;
      offset += MAX_VERIFICATION_DOCUMENTS_PER_BATCH
    ) {
      const documentIds = selectedDocuments.slice(
        offset,
        offset + MAX_VERIFICATION_DOCUMENTS_PER_BATCH
      );
      const refsByDocument = new Map(
        documentIds.map(documentId => [
          documentId,
          side.source_refs
            .filter(ref => ref.document_id === documentId)
            .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
        ])
      );
      const requiredRefs = documentIds
        .map(documentId => refsByDocument.get(documentId)?.[0])
        .filter((ref): ref is EvidenceSourceRef => ref !== undefined);
      const remainingRefs = documentIds
        .flatMap(documentId => refsByDocument.get(documentId)?.slice(1) ?? [])
        .slice(0, Math.max(0, MAX_VERIFICATION_REFS_PER_BATCH - requiredRefs.length));
      batches.push({
        sideIndex,
        statement: side.statement,
        documentIds,
        sourceRefs: [...requiredRefs, ...remainingRefs],
      });
    }
    return batches;
  });
  const plan = {
    conflictFingerprint: conflict.conflict_fingerprint,
    batches: plans.map(batch => ({
      sideIndex: batch.sideIndex,
      documentIds: batch.documentIds,
      sourceRefs: batch.sourceRefs,
    })),
  };
  const summary = {
    plan_hash: hashInput(plan),
    planned_document_count: plans.reduce((sum, batch) => sum + batch.documentIds.length, 0),
    planned_ref_count: plans.reduce((sum, batch) => sum + batch.sourceRefs.length, 0),
    batch_count: plans.length,
  };
  if (!verify) return { status: 'degraded', ...summary };
  try {
    let complete = true;
    for (const batch of plans) {
      const result = await verify({
        query: batch.statement,
        organizationId: input.organizationId,
        courseId: input.courseId,
        documentIds: batch.documentIds,
        groupByDocument: true,
      });
      complete =
        assertVerificationRefs(result, {
          statement: batch.statement,
          claim_ids: [],
          document_ids: batch.documentIds,
          source_refs: batch.sourceRefs,
        }) && complete;
    }
    return { status: complete ? 'verified' : 'degraded', ...summary };
  } catch (error) {
    if (error instanceof Error && /foreign/iu.test(error.message)) throw error;
    return { status: 'degraded', ...summary };
  }
}

export function createProductionConflictDetectionPort(
  options: ProductionConflictPortOptions
): ConflictDetectionPort {
  if (!Number.isSafeInteger(options.maxRetries) || options.maxRetries < 0) {
    throw new Error('Conflict port maxRetries must be non-negative');
  }
  if (!options.invoke && !options.modelId?.trim()) {
    throw new Error('Configured Stage 4 model ID is required for conflict detection');
  }
  let clientPromise:
    | Promise<Awaited<ReturnType<(typeof import('@/shared/llm/client'))['createLLMClient']>>>
    | undefined;
  const invoke =
    options.invoke ??
    (async (input: ProductionConflictInvokeInput): Promise<ProductionConflictInvokeResult> => {
      const { createLLMClient } = await import('@/shared/llm/client');
      clientPromise ??= createLLMClient({ maxRetries: 0 });
      const client = await clientPromise;
      const response = await client.generateCompletion(JSON.stringify(input.payload), {
        model: options.modelId!,
        temperature: 0,
        maxTokens: input.maxOutputTokens,
        systemPrompt: input.systemPrompt,
        ...(options.courseId
          ? {
              costContext: {
                courseId: options.courseId,
                stage: 'stage_4' as const,
                phase: 'stage_4_conflict_detection',
              },
            }
          : {}),
      });
      return {
        content: response.content,
        usage: {
          input_tokens: response.inputTokens,
          output_tokens: response.outputTokens,
          total_cost_usd: client.estimateCost(response),
        },
      };
    });

  async function call<T>(
    input: ProductionConflictInvokeInput,
    schema: z.ZodType<T>,
    maxModelCalls: number
  ): Promise<T & { usage: Usage }> {
    let attempts = 0;
    let lastError: unknown;
    const accumulated = emptyUsage();
    const allowedAttempts = Math.min(options.maxRetries + 1, maxModelCalls);
    while (attempts < allowedAttempts) {
      attempts += 1;
      try {
        const response = await invoke(input);
        accumulated.input_tokens += response.usage.input_tokens;
        accumulated.output_tokens += response.usage.output_tokens;
        accumulated.total_cost_usd += response.usage.total_cost_usd;
        const { safeJSONParse } = await import('@/shared/workspace-utils');
        const parsed = schema.parse(safeJSONParse(response.content));
        return {
          ...parsed,
          usage: UsageSchema.parse({
            model_calls: attempts,
            input_tokens: accumulated.input_tokens,
            output_tokens: accumulated.output_tokens,
            total_cost_usd: accumulated.total_cost_usd,
          }),
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw new ConflictModelCallError(
      'Conflict detection model request failed within the bounded retry policy',
      UsageSchema.parse({ ...accumulated, model_calls: attempts }),
      { cause: lastError }
    );
  }

  return {
    retryOwner: 'port',
    async mapBatch(input) {
      const payload = buildMapPayload(input);
      const result = await call(
        {
          kind: 'map',
          systemPrompt: CONFLICT_MAP_SYSTEM_PROMPT,
          payload,
          maxOutputTokens: input.max_output_tokens,
        },
        withEnvelope('propositions', mapOutputSchemaFor(input.claims.map(claim => claim.claim_id))),
        input.max_model_calls
      );
      return result;
    },
    async reduceValueGroups(input) {
      const payload = buildReductionPayload(input);
      return call(
        {
          kind: 'reduce',
          systemPrompt: CONFLICT_REDUCE_SYSTEM_PROMPT,
          payload,
          maxOutputTokens: input.max_output_tokens,
        },
        withEnvelope('partitions', ReductionOutputSchema.omit({ usage: true })),
        input.max_model_calls
      );
    },
    async classifyProposition(input) {
      const payload = buildClassificationPayload(input);
      return call(
        {
          kind: 'classify',
          systemPrompt: CONFLICT_CLASSIFY_SYSTEM_PROMPT,
          payload,
          maxOutputTokens: input.max_output_tokens,
        },
        withEnvelope('conflicts', ClassificationOutputSchema.omit({ usage: true })),
        input.max_model_calls
      );
    },
  };
}

export type ConflictDetectionResult = {
  conflicts: DocumentConflict[];
  issues: DetectorCapacityIssue[];
  batchCount: number;
  usage: Usage;
  verification: { verified: number; degraded: number; not_required: number };
  metricDeltas: ConflictMetricDeltas;
};
