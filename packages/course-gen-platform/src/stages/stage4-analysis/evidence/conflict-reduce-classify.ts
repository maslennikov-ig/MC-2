/**
 * The reduce-and-classify half of a conflict run.
 *
 * @module conflict-reduce-classify
 *
 * Split out of `conflict-detection-run.ts` to keep that file under its length limit. The seam is
 * where the work stops being per-CLAIM and becomes per-PROPOSITION: mapping asks what each claim
 * asserts, and everything here asks which of those assertions disagree.
 */

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
  type DocumentConflict,
  type DocumentEvidenceCard,
  type EvidenceSourceRef,
} from '@megacampus/shared-types';
import {
  CONFLICT_CLASSIFY_SYSTEM_PROMPT,
  CONFLICT_REDUCE_SYSTEM_PROMPT,
  CapacityCheckpointSchema,
  ClassificationCheckpointSchema,
  ClassificationOutputSchema,
  ClusterSchema,
  ConflictCluster,
  ConflictMapClaim,
  DetectorCapacityIssueSchema,
  ReductionCheckpointSchema,
  ReductionOutputSchema,
  assertBoundedRequest,
  buildClassificationPayload,
  buildReductionPayload,
  canonicalKey,
  comparePrecedence,
  emptyUsage,
  fullConflictPayloadHash,
  hashInput,
  materializeConflict,
  restoreCheckpoint,
  sha256,
  sumUsage,
} from './conflict-detector';
import { verificationStatus } from './conflict-detection-port';

import type { ConflictRunContext } from './conflict-detection-run';

/**
 * REDUCE and CLASSIFY: fold each proposition's value groups down to a comparable number, then
 * ask the model which of the survivors actually contradict one another.
 *
 * A proposition whose reduction exhausts the budget is marked degraded and skipped rather than
 * failing the run — the same trade the map phase makes, for the same reason.
 */
export async function runReduceAndClassifyPhase(args: {
  context: ConflictRunContext;
  propositionEntries: Array<[string, Map<string, ConflictMapClaim[]>]>;
  claimsById: Map<string, ConflictMapClaim>;
  cardsByClaim: Map<string, { card: DocumentEvidenceCard; refs: EvidenceSourceRef[] }>;
  conflictsByFingerprint: Map<string, { conflict: DocumentConflict; payloadHash: string }>;
  batchCount: { value: number };
}): Promise<void> {
  const {
    context,
    propositionEntries,
    claimsById,
    cardsByClaim,
    conflictsByFingerprint,
    batchCount: batchCountRef,
  } = args;
  const {
    input,
    dependencies,
    identity,
    checkpoints,
    usage,
    issues,
    verification,
    recordOutputUsage,
    persistCapacityIssue,
    callWithinAttemptBudget,
  } = context;
  let batchCount = batchCountRef.value;

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

  batchCountRef.value = batchCount;
}
