'use strict';

// ===========================================================================
// Q12 D6 activation-truth fixture runner. Stands in for Root-side inputs in
// disposable, synthetic-only tests: it produces synthetic `docker inspect` /
// `docker compose ps` inventories (Task 10) and synthetic Root frames /
// evidence (Task 14). No real Docker, no live connection, synthetic bytes only.
// ===========================================================================

const crypto = require('node:crypto');

function syntheticId(index) {
  return 'sha256:' + crypto.createHash('sha256').update(`q12-d6-container-${index}`).digest('hex');
}

/**
 * Build a synthetic prepared-quiesced Docker inventory: ten final identities
 * (new production + development) plus five held identities (old production),
 * fifteen unique container IDs, all stopped with restart policy
 * {name:"no",maximum_retry_count:0}. The optional `corrupt` flag injects a
 * single drift for negative tests.
 * @param {{corrupt?: string}} [options]
 */
function buildSyntheticDockerInventory(options = {}) {
  const corrupt = options.corrupt;
  const entries = [];
  for (let i = 0; i < 15; i += 1) {
    const category = i < 10 ? 'final' : 'held';
    entries.push({
      Id: syntheticId(i),
      Name: `/q12-${category}-${i}`,
      category,
      State: { Status: 'exited', Running: false },
      Config: { Image: `megacampus/q12:${category}-${i}`, Labels: { 'q12.role': category } },
      HostConfig: { RestartPolicy: { Name: 'no', MaximumRetryCount: 0 } },
    });
  }
  const composePs = entries.map(entry => ({ ID: entry.Id, State: 'exited', Name: entry.Name }));

  if (corrupt === 'running') {
    entries[3].State = { Status: 'running', Running: true };
  } else if (corrupt === 'restart-policy') {
    entries[4].HostConfig.RestartPolicy = { Name: 'always', MaximumRetryCount: 0 };
  } else if (corrupt === 'missing-compose') {
    composePs.pop();
  } else if (corrupt === 'duplicate-id') {
    entries[2].Id = entries[1].Id;
  } else if (corrupt === 'wrong-count') {
    // 9 final + 5 held.
    entries[9].category = 'held';
  }

  return { inspect: entries, composePs };
}

// ---------------------------------------------------------------------------
// Synthetic Root frames for the Task 14 full-run scenarios. These are the
// Root-side control frames the probe consumes over its control pipe (FD 6) in a
// synthetic run; they carry no secrets and drive no live action.
// ---------------------------------------------------------------------------

/**
 * Build a synthetic Root host_projection control frame for a given
 * classification. The probe validates schema/sequence/hash chaining against it.
 * @param {{classification: string, request_sha256: string,
 *          initial_database_projection_sha256: string, host_projection_sha256: string,
 *          prepared_quiesced_predecessor_sha256: string}} input
 */
function buildRootHostProjectionPayload(input) {
  const proposed = {
    precommit_rollback: 'precommit_rollback',
    committed_finish_forward: 'committed_finish_forward',
    drift_incident: 'drift_incident',
  }[input.classification];
  if (proposed === undefined) {
    throw new Error(`buildRootHostProjectionPayload: unknown classification ${input.classification}`);
  }
  return {
    request_sha256: input.request_sha256,
    initial_database_projection_sha256: input.initial_database_projection_sha256,
    host_projection_sha256: input.host_projection_sha256,
    proposed_classification: proposed,
    prepared_quiesced_predecessor_sha256: input.prepared_quiesced_predecessor_sha256,
  };
}

/**
 * Build a synthetic Root predecision control frame payload for the given
 * classification, with the exact contract classification/action pairing.
 * @param {{classification: string, request_sha256: string, predecision_sha256: string,
 *          planned_r_journal_entry_hash: string | null, planned_r_checkpoint_sha256: string | null,
 *          predecessor_journal_entry_hash: string, predecessor_checkpoint_sha256: string}} input
 */
function buildRootPredecisionPayload(input) {
  const action = {
    precommit_rollback: 'append_r_then_seal',
    committed_finish_forward: 'seal_finish_forward',
    drift_incident: 'abort_incident',
  }[input.classification];
  if (action === undefined) {
    throw new Error(`buildRootPredecisionPayload: unknown classification ${input.classification}`);
  }
  return {
    request_sha256: input.request_sha256,
    predecision_sha256: input.predecision_sha256,
    classification: input.classification,
    action,
    planned_r_journal_entry_hash: input.planned_r_journal_entry_hash,
    planned_r_checkpoint_sha256: input.planned_r_checkpoint_sha256,
    predecessor_journal_entry_hash: input.predecessor_journal_entry_hash,
    predecessor_checkpoint_sha256: input.predecessor_checkpoint_sha256,
  };
}

/**
 * Build a synthetic Root release control frame payload.
 * @param {{request_sha256: string, predecision_sha256: string, sealed_frame_sha256: string,
 *          actual_r_journal_entry_hash: string | null, actual_r_checkpoint_sha256: string | null}} input
 */
function buildRootReleasePayload(input) {
  return {
    request_sha256: input.request_sha256,
    predecision_sha256: input.predecision_sha256,
    sealed_frame_sha256: input.sealed_frame_sha256,
    actual_r_journal_entry_hash: input.actual_r_journal_entry_hash,
    actual_r_checkpoint_sha256: input.actual_r_checkpoint_sha256,
    expected_transaction_end: 'read_only_commit',
    expected_connection_close: true,
  };
}

module.exports = {
  buildSyntheticDockerInventory,
  buildRootHostProjectionPayload,
  buildRootPredecisionPayload,
  buildRootReleasePayload,
};
