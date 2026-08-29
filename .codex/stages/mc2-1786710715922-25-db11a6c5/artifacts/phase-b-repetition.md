---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1786710715922-25-db11a6c5/stage-manifest.json
stream_owner: phase-b-worker
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: role-guide root acceptance and measured dev run
public_facade: career playbook generation pipeline
bounded_acceptance: focused canonicalization, digest, judge, ledger, Jina client and spend-guard tests
non_goals:
  - schema or data migration
  - database prompt mutation
  - canonical topic, block layout or audience-map changes
  - reindex
  - paid or live generation
evidence:
  - none
task_id: mc2-1786710716114-26-01631777
epic_id: mc2-db696
stage_id: mc2-1786710715922-25-db11a6c5
session_id: n/a
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: worker
subagent_model: gpt-5.6-sol
reasoning_effort: medium
model_reasoning_rationale: deterministic pipeline and provider reliability changes required integration-level reasoning
repo: mc2
branch: codex/role-guide-audiences
base_branch: develop
base_commit: 1a7db7837ced30fbf2905ab2b1b486df2ae99acf
worktree: /home/me/code/mc2/.worktrees/role-guide-audiences
write_zone:
  - packages/course-gen-platform/src/shared/embeddings/jina-client.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/audience-scope.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/cross-block-judge.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/prior-blocks-digest.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/repetition-thresholds.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/semantic-repetition.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/spec-builder-canonical.ts
  - packages/course-gen-platform/tests/unit/shared/embeddings/jina-client-usage-observer.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/cross-block-judge.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/quality-ledger.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/semantic-repetition.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/spec-builder.test.ts
  - .codex/stages/mc2-1786710715922-25-db11a6c5/artifacts/phase-b-repetition.md
success_criteria:
  - model-produced do_not_repeat cannot affect the normalized exact result
  - do_not_repeat and prior-block context contain only shared-audience peers
  - semantic block pairs are gated only inside a shared audience view at cosine 0.85
  - paragraphs of at least 100 normalized characters are gated inside each block
  - critical contradiction issues reach the existing regeneration ledger and name both cross-block participants
  - full final judge embeds once and reuses unchanged hash-keyed vectors on re-judge
  - Jina receipts reach career_playbooks cost_breakdown and 429 retries wait out the provider window
selected_docs:
  - specs/028-role-guide-audiences/spec.md
  - docs/career-playbook/2026-08-29-semantic-repetition-baseline.md
  - packages/course-gen-platform/src/shared/embeddings/generate.ts
selected_skills:
  - superpowers-test-driven-development
  - superpowers-systematic-debugging
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - phase-0-baseline
  - phase-a-audiences
parallel_decision: sequential-after-phase-a
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: temporary isolated-worktree dependency links removed after focused verification
risk_level: high
risk_tags:
  - retry
  - state-transition
  - idempotency
  - public-api
affected_surfaces:
  - backend
  - api
invariants:
  - audience-union-complete
  - canonical-26-topics-unchanged
  - no-cross-playbook-cache-reuse
  - one-final-judge-semantic-pass
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: root owns final measured docs and graph refresh after the single paid dev acceptance run
verification:
  - focused Phase B RED after harness setup: 6 expected failures and 64 passes
  - Jina usage observer RED: 1 expected failure and 1 pass
  - final-judge-only and cache RED: 2 expected failures and 36 passes
  - alias and inclusive-threshold RED: 2 expected failures
  - published-status digest RED: 1 expected failure and 18 skips
  - pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/spec-builder.test.ts tests/unit/stages/stage-career-playbook/quality-ledger.test.ts tests/unit/stages/stage-career-playbook/cross-block-judge.test.ts tests/unit/stages/stage-career-playbook/semantic-repetition.test.ts tests/unit/shared/embeddings/jina-client-usage-observer.test.ts --reporter=dot: 81 passed
  - pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/metrics/no-anonymous-spend.test.ts --reporter=dot: 13 passed
  - targeted eslint --quiet on ten new or affected source and test files: passed
  - git diff --check: passed
changed_files:
  - packages/course-gen-platform/src/shared/embeddings/jina-client.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/audience-scope.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/cross-block-judge.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/prior-blocks-digest.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/repetition-thresholds.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/semantic-repetition.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/spec-builder-canonical.ts
  - packages/course-gen-platform/tests/unit/shared/embeddings/jina-client-usage-observer.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/cross-block-judge.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/quality-ledger.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/semantic-repetition.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/spec-builder.test.ts
  - .codex/stages/mc2-1786710715922-25-db11a6c5/artifacts/phase-b-repetition.md
explicit_defers:
  - root final pnpm type-check and pnpm test:unit acceptance
  - root single paid dev generation, editorial reading, cost-row proof and final semantic remeasurement
  - root Graphify refresh after durable code and measured documentation are complete
---

# Summary

Phase B is ready for root acceptance. Canonical normalization now discards every model-produced
`do_not_repeat` value and rebuilds each of the 26 boundary lists in canonical order from the Phase A
audience map. A peer is included only when the blocks share a document and their normalized alias
sets do not intersect. For example, two deliberately different model lists for `block_9` both
produce the same exact 18-topic list; self, `block_12` and every other disjoint-audience topic are
absent.

The prior-block digest now reads only completed `generated` blocks that share at least one audience
with the union of the target group. This filtering happens before anti-goal, authority, number and
cadence extraction, so a disjoint or unfinished block cannot leak through a high-priority section.

The final cross-block judge now runs a deterministic semantic gate at the baseline threshold 0.85.
Eligible shared-audience block pairs produce two existing critical `contradiction` issues, one for
each participant, and paragraphs of at least 100 normalized characters produce a critical issue for
their own block. These issues merge with the existing deterministic/LLM verdict and therefore enter
the current quality ledger and regeneration route. Disjoint-audience pairs are removed before any
provider call and cannot produce an issue even for identical vectors.

# Scope / Routing

Semantic embeddings are intentionally disabled in bounded group judge windows and run only on the
full-document final judge. The judge closure owns a bounded 4,096-entry process-local LRU. Its keys
are `playbookId:SHA256(text)` and its values are vectors, so customer prose is not retained and no
playbook can reuse another playbook's vectors. An unchanged final re-judge makes no second Jina call;
changed text embeds only the missing hashes.

The evaluator calls the shared Jina batch entry point once per missing checked set and uses the
existing `QualityValidator.cosineSimilarity` path. Each real provider batch receipt is observed by a
backward-compatible optional fourth `generateEmbeddings` argument and copied into Career Playbook
`nodeCosts` as `semanticRepetition`; this is the persisted source for
`career_playbooks.cost_breakdown`. Existing three-argument course cost callers remain unchanged.

Provider errors stay visible as judge warnings and fall back once to the other deterministic checks;
there is no node-level retry loop. The shared client now prevents transient token-per-minute pressure
from exhausting retries inside the same window: HTTP 429 honors numeric `Retry-After` up to five
minutes, otherwise waits 60 seconds. Network and 5xx failures keep the existing 1/2/4-second
exponential policy.

No schema, database prompt, canonical topic, canonical audience assignment, block layout, persisted
row, secret, reindex or paid service was changed or invoked. The specification section 3 audience
checkboxes were consumed unchanged.

# Verification

TDD covered each observable boundary. RED proved that model text still controlled
`do_not_repeat`, a disjoint prior block leaked into the digest, semantic checks did not execute,
bounded windows repeated provider work, unchanged final re-judges re-embedded content, alias
normalization and inclusive 0.85 behavior were absent, and an unfinished prior block leaked. Jina
observer and fake-timer REDs also proved the missing cost receipt and the old one-second 429 retry.

GREEN is 81/81 across the five focused Phase B suites and 13/13 for the anonymous-spend guard.
Integration assertions prove final-judge execution, both regeneration participants, cost receipt
shape, no bounded-window spend, same-playbook cache reuse, cross-playbook cache isolation, disjoint
pair suppression, exact 0.85 inclusion and intrablock paragraph routing. Jina tests prove the new
fourth argument, unchanged third-argument compatibility, `Retry-After`, 60-second fallback and
unchanged one-second 5xx retry. Targeted ESLint and `git diff --check` pass.

Per the assigned boundary, this worker did not run root `pnpm type-check`, full `pnpm test:unit`, a
live/dev generation or a second semantic measurement.

# Delivery / Cleanup

The stream is returned on `codex/role-guide-audiences` for root acceptance. Temporary dependency
links used only by the isolated worktree were removed after verification.

# Risks / Follow-ups / Explicit Defers

The sole paid dev acceptance run must show that the semantic gate actually completed rather than
taking its visible provider-degradation path, and must contain Jina `semanticRepetition` rows in
`career_playbooks.cost_breakdown`. Root then owns the post-change measurement against the recorded
8/6,594 shared-view block-pair and 18/6,829 paragraph-pair baseline, the final type/unit acceptance,
the editorial reading of all three documents, and the safe Graphify refresh. A persistent provider
outage remains deliberately non-fatal to generation but cannot be counted as AC-4 acceptance.
