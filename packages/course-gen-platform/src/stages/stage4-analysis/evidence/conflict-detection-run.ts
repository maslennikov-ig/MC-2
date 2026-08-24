/**
 * One conflict-detection run: map claims to propositions, reduce them into clusters, classify
 * the clusters that disagree.
 *
 * @module conflict-detection-run
 *
 * Split out of `conflict-detector.ts`. This is the pipeline; the contract and the model port are
 * next door. Every phase is checkpointed, because a run that dies halfway has to RESUME rather
 * than pay for the same calls again — which is why nearly every step computes a `batchKey` and
 * an `inputHash` before doing anything.
 *
 * Re-exported by `conflict-detector.ts`, so no import path changes.
 */

import {
  DocumentConflictSchema,
  DocumentEvidenceCardsSchema,
  type DocumentConflict,
  type DocumentEvidenceCard,
  type EvidenceSourceRef,
} from '@megacampus/shared-types';
import {
  CONFLICT_CLASSIFY_SYSTEM_PROMPT,
  CONFLICT_MAP_SYSTEM_PROMPT,
  CONFLICT_REDUCE_SYSTEM_PROMPT,
  CapacityCheckpointSchema,
  ClassificationCheckpointSchema,
  ClassificationOutputSchema,
  ClusterSchema,
  ConflictCluster,
  ConflictMapClaim,
  ConflictMetricDeltas,
  ConflictModelCallError,
  DetectDocumentConflictsDependencies,
  DetectDocumentConflictsInput,
  DetectorCapacityIssue,
  DetectorCapacityIssueSchema,
  MapCheckpointSchema,
  MapOutputSchema,
  Proposition,
  ReductionCheckpointSchema,
  ReductionOutputSchema,
  Usage,
  UsageSchema,
  assertBoundedRequest,
  buildClassificationPayload,
  buildMapPayload,
  buildReductionPayload,
  canonicalKey,
  checkpointIndex,
  collectConflictMetricDeltas,
  comparePrecedence,
  detectorIdentity,
  emptyConflictMetricDeltas,
  emptyUsage,
  exactRequestTokens,
  flattenClaims,
  fullConflictPayloadHash,
  hashInput,
  materializeConflict,
  restoreCheckpoint,
  sha256,
  sumUsage,
  validateConfig,
  validateMappedClaims,
} from './conflict-detector';
import { verificationStatus, type ConflictDetectionResult } from './conflict-detection-port';

/**
 * A bounded-policy failure that says what actually failed.
 *
 * The `cause` was already attached, and it was already invisible: the
 * orchestration logger prints `error.message` and nothing else, so a live run
 * (mc2-2pplo, 2026-08-15) reported only "failed within the bounded execution
 * policy" and the real reason cost another paid run to find. The cause's own
 * message now travels in this message too.
 */
export class ConflictDetectionExecutionError extends Error {
  constructor(
    readonly metricDeltas: ConflictMetricDeltas,
    options?: { cause?: unknown }
  ) {
    super(
      `Conflict detection failed within the bounded execution policy: ${describeCause(options?.cause)}`,
      options
    );
    this.name = 'ConflictDetectionExecutionError';
  }
}

/** One readable line for a thrown value of any shape. */
function describeCause(cause: unknown): string {
  if (cause === undefined) return 'no cause recorded';
  if (cause instanceof Error) {
    const nested = cause.cause instanceof Error ? ` <- ${cause.cause.message}` : '';
    return `${cause.name}: ${cause.message}${nested}`;
  }
  return typeof cause === 'string' ? cause : JSON.stringify(cause);
}

type ConflictExecutionTracker = { metricDeltas: () => ConflictMetricDeltas };

export async function detectDocumentConflicts(
  input: DetectDocumentConflictsInput,
  dependencies: DetectDocumentConflictsDependencies
): Promise<ConflictDetectionResult> {
  const tracker: ConflictExecutionTracker = { metricDeltas: emptyConflictMetricDeltas };
  try {
    return await detectDocumentConflictsCore(input, dependencies, tracker);
  } catch (error) {
    if (error instanceof ConflictDetectionExecutionError) throw error;
    throw new ConflictDetectionExecutionError(tracker.metricDeltas(), { cause: error });
  }
}

async function detectDocumentConflictsCore(
  input: DetectDocumentConflictsInput,
  dependencies: DetectDocumentConflictsDependencies,
  tracker: ConflictExecutionTracker
): Promise<ConflictDetectionResult> {
  validateConfig(input);
  if (dependencies.port.retryOwner !== 'port') throw new Error('Conflict port must own retries');
  const run = await dependencies.repository.getAcceptedRun(
    input.runId,
    input.courseId,
    input.organizationId
  );
  if (run.status !== 'accepted' || run.id !== input.runId) {
    throw new Error('Conflict detection requires the accepted persisted evidence run');
  }
  const cards = DocumentEvidenceCardsSchema.parse(
    await dependencies.repository.listItems(input.runId)
  );
  const claims = flattenClaims(cards);
  const usage = emptyUsage();
  const verification = { verified: 0, degraded: 0, not_required: 0 };
  const issues: DetectorCapacityIssue[] = [];
  if (claims.length < 2) {
    return {
      conflicts: [],
      issues,
      batchCount: 0,
      usage,
      verification,
      metricDeltas: emptyConflictMetricDeltas(),
    };
  }

  const checkpointRows = await dependencies.repository.listConflictCheckpoints(input.runId);
  const checkpoints = checkpointIndex(checkpointRows);
  const initialCheckpointKeys = new Set(checkpoints.keys());
  const invocationUsage = emptyUsage();
  const metricDeltas = () =>
    collectConflictMetricDeltas(checkpoints, initialCheckpointKeys, invocationUsage);
  tracker.metricDeltas = metricDeltas;
  const recordOutputUsage = (value: unknown): Usage | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const parsed = UsageSchema.safeParse((value as Record<string, unknown>).usage);
    if (!parsed.success) return undefined;
    sumUsage(invocationUsage, parsed.data);
    return parsed.data;
  };
  const identity = detectorIdentity(input);
  const identityHash = hashInput(identity);
  const restoredCapacityIssues: DetectorCapacityIssue[] = [];
  for (const value of checkpoints.values()) {
    const capacity = CapacityCheckpointSchema.safeParse(value.checkpoint);
    if (capacity.success && capacity.data.issue.config_hash === identityHash) {
      restoredCapacityIssues.push(capacity.data.issue);
    }
  }
  if (restoredCapacityIssues.length > 0) {
    const restoredConflicts = new Map<string, DocumentConflict>();
    let restoredBatchCount = 0;
    for (const value of checkpoints.values()) {
      if (!value.checkpoint || typeof value.checkpoint !== 'object') continue;
      const record = value.checkpoint as Record<string, unknown>;
      if (
        [
          'conflict_map',
          'conflict_reduction',
          'conflict_classification',
          'conflict_capacity_degraded',
        ].includes(String(record.kind))
      ) {
        restoredBatchCount += 1;
      }
      const checkpointUsage = UsageSchema.safeParse(record.usage);
      if (checkpointUsage.success) sumUsage(usage, checkpointUsage.data);
      const checkpointConflicts = DocumentConflictSchema.array().safeParse(record.conflicts);
      if (checkpointConflicts.success) {
        for (const conflict of checkpointConflicts.data) {
          restoredConflicts.set(conflict.conflict_fingerprint, conflict);
        }
      }
      if (Array.isArray(record.verification)) {
        for (const entry of record.verification) {
          if (!entry || typeof entry !== 'object') continue;
          const status = (entry as Record<string, unknown>).status;
          if (status === 'verified' || status === 'degraded' || status === 'not_required') {
            verification[status] += 1;
          }
        }
      }
    }
    return {
      conflicts: [...restoredConflicts.values()].sort((left, right) =>
        left.conflict_fingerprint.localeCompare(right.conflict_fingerprint)
      ),
      issues: restoredCapacityIssues,
      batchCount: restoredBatchCount,
      usage,
      verification,
      metricDeltas: metricDeltas(),
    };
  }
  const persistCapacityIssue = async (
    details: {
      boundary: string;
      clusterCount: number;
      propositionKey?: string;
    },
    capacityUsage: Usage = emptyUsage()
  ): Promise<DetectorCapacityIssue> => {
    const issue = DetectorCapacityIssueSchema.parse({
      kind: 'detector_capacity',
      reason: 'detector_capacity_degraded',
      call_plan_hash: hashInput({
        boundary: details.boundary,
        usedModelAttempts: usage.model_calls,
        maxModelCalls: input.maxModelCalls,
        claimCount: claims.length,
        clusterCount: details.clusterCount,
      }),
      config_hash: identityHash,
      ...(details.propositionKey
        ? { proposition_key_hash: `sha256:${sha256(details.propositionKey)}` }
        : {}),
      claim_count: claims.length,
      cluster_count: details.clusterCount,
    });
    const batchKey = `capacity:${sha256(issue.call_plan_hash).slice(0, 24)}`;
    const checkpoint = { kind: 'conflict_capacity_degraded', issue, usage: capacityUsage };
    await dependencies.repository.commitConflictBatch({
      runId: input.runId,
      courseId: input.courseId,
      organizationId: input.organizationId,
      batchKey,
      inputHash: issue.call_plan_hash,
      structuredCheckpoint: checkpoint,
      conflicts: [],
      detectionModel: input.detectionModel,
      detectionVersion: input.detectionVersion,
      verificationStatus: 'degraded',
    });
    checkpoints.set(batchKey, { inputHash: issue.call_plan_hash, checkpoint });
    return issue;
  };
  const callWithinAttemptBudget = async (details: {
    boundary: string;
    clusterCount: number;
    propositionKey?: string;
    invoke: () => Promise<unknown>;
  }): Promise<{ output?: unknown; issue?: DetectorCapacityIssue }> => {
    if (usage.model_calls >= input.maxModelCalls) {
      return { issue: await persistCapacityIssue(details) };
    }
    try {
      return { output: await details.invoke() };
    } catch (error) {
      if (error instanceof ConflictModelCallError) {
        sumUsage(usage, error.usage);
        sumUsage(invocationUsage, error.usage);
        if (usage.model_calls >= input.maxModelCalls) {
          return {
            issue: await persistCapacityIssue(
              {
                ...details,
                boundary: `${details.boundary}:retry-exhausted`,
              },
              error.usage
            ),
          };
        }
      }
      throw error;
    }
  };
  const mapRequestFits = (batch: ConflictMapClaim[]): boolean =>
    exactRequestTokens(
      CONFLICT_MAP_SYSTEM_PROMPT,
      buildMapPayload({
        language: input.language,
        claims: batch,
        max_input_tokens: input.maxInputTokens,
        max_output_tokens: input.maxOutputTokens,
        max_model_calls: input.maxModelCalls,
      })
    ) <= input.maxInputTokens;
  const mapBatches: ConflictMapClaim[][] = [];
  for (let offset = 0; offset < claims.length; offset += input.maxClaimsPerMapBatch) {
    let remaining = claims.slice(offset, offset + input.maxClaimsPerMapBatch);
    while (remaining.length > 0) {
      if (mapRequestFits(remaining)) {
        mapBatches.push(remaining);
        break;
      }
      let low = 1;
      let high = remaining.length - 1;
      let fittingPrefix = 0;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (mapRequestFits(remaining.slice(0, middle))) {
          fittingPrefix = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      if (fittingPrefix === 0) {
        const issue = await persistCapacityIssue({
          boundary: `map-input:${sha256(remaining[0].claim_id).slice(0, 16)}`,
          clusterCount: claims.length,
        });
        return {
          conflicts: [],
          issues: [issue],
          batchCount: 1,
          usage,
          verification,
          metricDeltas: metricDeltas(),
        };
      }
      mapBatches.push(remaining.slice(0, fittingPrefix));
      remaining = remaining.slice(fittingPrefix);
    }
  }
  const mapCallCount = mapBatches.length;
  if (mapCallCount > input.maxModelCalls) {
    const issue = DetectorCapacityIssueSchema.parse({
      kind: 'detector_capacity',
      reason: 'detector_capacity_degraded',
      call_plan_hash: hashInput({ mapCallCount, claimCount: claims.length }),
      config_hash: hashInput(identity),
      claim_count: claims.length,
      cluster_count: claims.length,
    });
    await dependencies.repository.commitConflictBatch({
      runId: input.runId,
      courseId: input.courseId,
      organizationId: input.organizationId,
      batchKey: 'capacity:pre-map',
      inputHash: issue.call_plan_hash,
      structuredCheckpoint: { kind: 'conflict_capacity_degraded', issue, usage: emptyUsage() },
      conflicts: [],
      detectionModel: input.detectionModel,
      detectionVersion: input.detectionVersion,
      verificationStatus: 'degraded',
    });
    checkpoints.set('capacity:pre-map', {
      inputHash: issue.call_plan_hash,
      checkpoint: { kind: 'conflict_capacity_degraded', issue, usage: emptyUsage() },
    });
    return {
      conflicts: [],
      issues: [issue],
      batchCount: 1,
      usage,
      verification,
      metricDeltas: metricDeltas(),
    };
  }
  const propositions: Proposition[] = [];
  let batchCount = 0;
  for (const [batchIndex, batch] of mapBatches.entries()) {
    const batchKey = `map:${String(batchIndex).padStart(6, '0')}`;
    const portInput = {
      language: input.language,
      claims: batch,
      max_input_tokens: input.maxInputTokens,
      max_output_tokens: input.maxOutputTokens,
      max_model_calls: input.maxModelCalls - usage.model_calls,
    };
    const inputHash = hashInput({ identity, kind: 'map', batch });
    let checkpoint = restoreCheckpoint(checkpoints, batchKey, inputHash, MapCheckpointSchema);
    if (!checkpoint) {
      if (usage.model_calls >= input.maxModelCalls) {
        const issue = await persistCapacityIssue({
          boundary: batchKey,
          clusterCount: claims.length,
        });
        return {
          conflicts: [],
          issues: [issue],
          batchCount: batchCount + 1,
          usage,
          verification,
          metricDeltas: metricDeltas(),
        };
      }
      let rawOutput: unknown;
      try {
        rawOutput = await dependencies.port.mapBatch(portInput);
      } catch (error) {
        if (error instanceof ConflictModelCallError) {
          sumUsage(usage, error.usage);
          sumUsage(invocationUsage, error.usage);
          if (usage.model_calls >= input.maxModelCalls) {
            const issue = await persistCapacityIssue(
              {
                boundary: `${batchKey}:retry-exhausted`,
                clusterCount: claims.length,
              },
              error.usage
            );
            return {
              conflicts: [],
              issues: [issue],
              batchCount: batchCount + 1,
              usage,
              verification,
              metricDeltas: metricDeltas(),
            };
          }
        }
        throw error;
      }
      recordOutputUsage(rawOutput);
      const output = MapOutputSchema.parse(rawOutput);
      if (output.usage.model_calls > input.maxModelCalls - usage.model_calls) {
        sumUsage(usage, output.usage);
        const issue = await persistCapacityIssue(
          {
            boundary: `${batchKey}:reported-attempts`,
            clusterCount: claims.length,
          },
          output.usage
        );
        return {
          conflicts: [],
          issues: [issue],
          batchCount: batchCount + 1,
          usage,
          verification,
          metricDeltas: metricDeltas(),
        };
      }
      validateMappedClaims(output.propositions, batch);
      checkpoint = {
        kind: 'conflict_map',
        propositions: output.propositions.map(value => ({
          ...value,
          proposition_key: canonicalKey(value.proposition_key),
          value_key: canonicalKey(value.value_key),
        })),
        usage: output.usage,
      };
      await dependencies.repository.commitConflictBatch({
        runId: input.runId,
        courseId: input.courseId,
        organizationId: input.organizationId,
        batchKey,
        inputHash,
        structuredCheckpoint: checkpoint,
        conflicts: [],
        detectionModel: input.detectionModel,
        detectionVersion: input.detectionVersion,
        verificationStatus: 'not_required',
      });
      checkpoints.set(batchKey, { inputHash, checkpoint });
    }
    validateMappedClaims(checkpoint.propositions, batch);
    propositions.push(...checkpoint.propositions);
    sumUsage(usage, checkpoint.usage);
    batchCount += 1;
  }

  const claimsById = new Map(claims.map(claim => [claim.claim_id, claim]));
  const cardsByClaim = new Map<string, { card: DocumentEvidenceCard; refs: EvidenceSourceRef[] }>();
  for (const card of cards) {
    for (const claim of card.key_claims) {
      if (claim.source_refs.some(ref => ref.document_id !== card.document_id)) {
        throw new Error('Persisted claim source ref does not belong to its evidence card');
      }
      cardsByClaim.set(claim.claim_id, { card, refs: claim.source_refs });
    }
  }
  const byProposition = new Map<string, Map<string, ConflictMapClaim[]>>();
  for (const proposition of propositions) {
    const claim = claimsById.get(proposition.claim_id);
    if (!claim) throw new Error('Conflict mapping output violated the persisted claim allowlist');
    const propositionKey = canonicalKey(proposition.proposition_key);
    const valueKey = canonicalKey(proposition.value_key);
    const values = byProposition.get(propositionKey) ?? new Map<string, ConflictMapClaim[]>();
    values.set(valueKey, [...(values.get(valueKey) ?? []), claim]);
    byProposition.set(propositionKey, values);
  }

  const conflictsByFingerprint = new Map<
    string,
    { conflict: DocumentConflict; payloadHash: string }
  >();
  const propositionEntries = [...byProposition.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
  for (const [propositionKey, groups] of propositionEntries) {
    const valueEntries = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
    if (valueEntries.length < 2) continue;
    let clusters: ConflictCluster[] = valueEntries.map(([valueKey, groupClaims]) => {
      const claimIds = groupClaims.map(claim => claim.claim_id).sort();
      return ClusterSchema.parse({
        cluster_id: `cluster:${sha256(JSON.stringify({ propositionKey, valueKey, claimIds })).slice(0, 48)}`,
        canonical_value_key: valueKey,
        claim_ids: claimIds,
      });
    });
    let level = 0;
    let capacityDegraded = false;
    while (clusters.length > input.maxValueGroupsPerComparison) {
      const next: ConflictCluster[] = [];
      for (let offset = 0; offset < clusters.length; offset += input.reductionFanIn) {
        const children = clusters.slice(offset, offset + input.reductionFanIn);
        const batchKey = `reduce:${sha256(propositionKey).slice(0, 16)}:${String(level).padStart(3, '0')}:${String(offset / input.reductionFanIn).padStart(5, '0')}`;
        const request = {
          language: input.language,
          proposition_key: propositionKey,
          clusters: children.map(cluster => ({
            ...cluster,
            representative_claims: cluster.claim_ids
              .map(id => claimsById.get(id))
              .filter((claim): claim is ConflictMapClaim => claim !== undefined)
              .sort(comparePrecedence)
              .slice(0, 3),
          })),
          max_input_tokens: input.maxInputTokens,
          max_output_tokens: input.maxOutputTokens,
          max_model_calls: input.maxModelCalls - usage.model_calls,
        };
        assertBoundedRequest(
          CONFLICT_REDUCE_SYSTEM_PROMPT,
          buildReductionPayload(request),
          input.maxInputTokens
        );
        const inputHash = hashInput({ identity, kind: 'reduce', propositionKey, level, children });
        let checkpoint = restoreCheckpoint(
          checkpoints,
          batchKey,
          inputHash,
          ReductionCheckpointSchema
        );
        if (!checkpoint) {
          const call = await callWithinAttemptBudget({
            boundary: batchKey,
            clusterCount: clusters.length,
            propositionKey,
            invoke: () => dependencies.port.reduceValueGroups(request),
          });
          if (call.issue) {
            issues.push(call.issue);
            capacityDegraded = true;
            break;
          }
          recordOutputUsage(call.output);
          const output = ReductionOutputSchema.parse(call.output);
          if (output.usage.model_calls > input.maxModelCalls - usage.model_calls) {
            sumUsage(usage, output.usage);
            issues.push(
              await persistCapacityIssue(
                {
                  boundary: `${batchKey}:reported-attempts`,
                  clusterCount: clusters.length,
                  propositionKey,
                },
                output.usage
              )
            );
            capacityDegraded = true;
            break;
          }
          const expected = children.map(child => child.cluster_id).sort();
          const actual = output.partitions.flatMap(partition => partition.child_cluster_ids).sort();
          if (
            new Set(actual).size !== actual.length ||
            JSON.stringify(actual) !== JSON.stringify(expected)
          ) {
            throw new Error('Reduction partition must exactly cover the child cluster allowlist');
          }
          const childById = new Map(children.map(child => [child.cluster_id, child]));
          const reduced = output.partitions.map(partition => {
            const childIds = [...partition.child_cluster_ids].sort();
            const claimIds = [
              ...new Set(childIds.flatMap(id => childById.get(id)?.claim_ids ?? [])),
            ].sort();
            return ClusterSchema.parse({
              cluster_id: `cluster:${sha256(JSON.stringify({ propositionKey, level, childIds })).slice(0, 48)}`,
              canonical_value_key: canonicalKey(partition.canonical_value_key),
              claim_ids: claimIds,
            });
          });
          checkpoint = { kind: 'conflict_reduction', clusters: reduced, usage: output.usage };
          await dependencies.repository.commitConflictBatch({
            runId: input.runId,
            courseId: input.courseId,
            organizationId: input.organizationId,
            batchKey,
            inputHash,
            structuredCheckpoint: checkpoint,
            conflicts: [],
            detectionModel: input.detectionModel,
            detectionVersion: input.detectionVersion,
            verificationStatus: 'not_required',
          });
          checkpoints.set(batchKey, { inputHash, checkpoint });
        }
        if (capacityDegraded) break;
        sumUsage(usage, checkpoint.usage);
        next.push(...checkpoint.clusters);
        batchCount += 1;
      }
      if (capacityDegraded) break;
      if (next.length >= clusters.length) {
        const issue = DetectorCapacityIssueSchema.parse({
          kind: 'detector_capacity',
          reason: 'detector_capacity_degraded',
          call_plan_hash: hashInput({
            propositionKeyHash: sha256(propositionKey),
            level,
            clusterIds: clusters.map(cluster => cluster.cluster_id),
          }),
          config_hash: hashInput(identity),
          proposition_key_hash: `sha256:${sha256(propositionKey)}`,
          claim_count: clusters.reduce((sum, cluster) => sum + cluster.claim_ids.length, 0),
          cluster_count: clusters.length,
        });
        const issueKey = `capacity:${sha256(propositionKey).slice(0, 16)}`;
        const issueHash = issue.call_plan_hash;
        const restored = restoreCheckpoint(
          checkpoints,
          issueKey,
          issueHash,
          CapacityCheckpointSchema
        );
        if (!restored) {
          await dependencies.repository.commitConflictBatch({
            runId: input.runId,
            courseId: input.courseId,
            organizationId: input.organizationId,
            batchKey: issueKey,
            inputHash: issueHash,
            structuredCheckpoint: {
              kind: 'conflict_capacity_degraded',
              issue,
              usage: emptyUsage(),
            },
            conflicts: [],
            detectionModel: input.detectionModel,
            detectionVersion: input.detectionVersion,
            verificationStatus: 'degraded',
          });
          checkpoints.set(issueKey, {
            inputHash: issueHash,
            checkpoint: { kind: 'conflict_capacity_degraded', issue, usage: emptyUsage() },
          });
        }
        issues.push(issue);
        batchCount += 1;
        capacityDegraded = true;
        break;
      }
      clusters = next.sort((a, b) => a.cluster_id.localeCompare(b.cluster_id));
      level += 1;
    }

    if (capacityDegraded) continue;

    const batchKey = `classify:${sha256(propositionKey).slice(0, 16)}`;
    const portInput = {
      language: input.language,
      proposition_key: propositionKey,
      clusters: clusters.map(cluster => ({
        ...cluster,
        representative_claims: cluster.claim_ids
          .map(id => claimsById.get(id))
          .filter((claim): claim is ConflictMapClaim => claim !== undefined)
          .sort(comparePrecedence)
          .slice(0, 3),
      })),
      max_input_tokens: input.maxInputTokens,
      max_output_tokens: input.maxOutputTokens,
      max_model_calls: input.maxModelCalls - usage.model_calls,
    };
    assertBoundedRequest(
      CONFLICT_CLASSIFY_SYSTEM_PROMPT,
      buildClassificationPayload(portInput),
      input.maxInputTokens
    );
    const inputHash = hashInput({ identity, kind: 'classify', propositionKey, clusters });
    let checkpoint = restoreCheckpoint(
      checkpoints,
      batchKey,
      inputHash,
      ClassificationCheckpointSchema
    );
    if (!checkpoint) {
      const call = await callWithinAttemptBudget({
        boundary: batchKey,
        clusterCount: clusters.length,
        propositionKey,
        invoke: () => dependencies.port.classifyProposition(portInput),
      });
      if (call.issue) {
        issues.push(call.issue);
        batchCount += 1;
        break;
      }
      recordOutputUsage(call.output);
      const output = ClassificationOutputSchema.parse(call.output);
      if (output.usage.model_calls > input.maxModelCalls - usage.model_calls) {
        sumUsage(usage, output.usage);
        issues.push(
          await persistCapacityIssue(
            {
              boundary: `${batchKey}:reported-attempts`,
              clusterCount: clusters.length,
              propositionKey,
            },
            output.usage
          )
        );
        batchCount += 1;
        break;
      }
      const clusterById = new Map(clusters.map(cluster => [cluster.cluster_id, cluster]));
      const materialized = output.conflicts
        .map(item => materializeConflict(item, clusterById, claimsById, cardsByClaim, input))
        .filter((value): value is DocumentConflict => value !== undefined);
      const localPayloads = new Map<string, string>();
      for (const conflict of materialized) {
        const payloadHash = fullConflictPayloadHash(conflict);
        const prior =
          localPayloads.get(conflict.conflict_fingerprint) ??
          conflictsByFingerprint.get(conflict.conflict_fingerprint)?.payloadHash;
        if (prior && prior !== payloadHash) {
          throw new Error('Same conflict fingerprint has a different semantic payload');
        }
        localPayloads.set(conflict.conflict_fingerprint, payloadHash);
      }
      const conflictVerification = [];
      for (const conflict of materialized) {
        const verificationResult = await verificationStatus(
          conflict,
          input,
          dependencies.verifyMaterialSources
        );
        conflictVerification.push({
          conflict_fingerprint: conflict.conflict_fingerprint,
          ...verificationResult,
        });
      }
      const statuses = conflictVerification.map(value => value.status);
      const aggregateStatus = statuses.includes('degraded')
        ? 'degraded'
        : statuses.includes('verified')
          ? 'verified'
          : 'not_required';
      checkpoint = {
        kind: 'conflict_classification',
        output,
        conflicts: materialized,
        verification: conflictVerification,
        usage: output.usage,
      };
      await dependencies.repository.commitConflictBatch({
        runId: input.runId,
        courseId: input.courseId,
        organizationId: input.organizationId,
        batchKey,
        inputHash,
        structuredCheckpoint: checkpoint,
        conflicts: materialized,
        detectionModel: input.detectionModel,
        detectionVersion: input.detectionVersion,
        verificationStatus: aggregateStatus,
        conflictVerification: conflictVerification.map(value => ({
          conflictFingerprint: value.conflict_fingerprint,
          status: value.status,
          planHash: value.plan_hash,
          plannedDocumentCount: value.planned_document_count,
          plannedRefCount: value.planned_ref_count,
          batchCount: value.batch_count,
        })),
      });
      checkpoints.set(batchKey, { inputHash, checkpoint });
    }
    sumUsage(usage, checkpoint.usage);
    for (const value of checkpoint.verification) verification[value.status] += 1;
    for (const conflict of checkpoint.conflicts) {
      const payloadHash = fullConflictPayloadHash(conflict);
      const prior = conflictsByFingerprint.get(conflict.conflict_fingerprint);
      if (prior && prior.payloadHash !== payloadHash) {
        throw new Error('Same conflict fingerprint has a different semantic payload');
      }
      conflictsByFingerprint.set(conflict.conflict_fingerprint, { conflict, payloadHash });
    }
    batchCount += 1;
  }

  const conflicts = [...conflictsByFingerprint.values()]
    .map(value => value.conflict)
    .sort((left, right) => left.conflict_fingerprint.localeCompare(right.conflict_fingerprint));
  dependencies.log?.info(
    {
      conflictCount: conflicts.length,
      batchCount,
      verification,
    },
    'Document conflict detection complete'
  );
  return { conflicts, issues, batchCount, usage, verification, metricDeltas: metricDeltas() };
}
