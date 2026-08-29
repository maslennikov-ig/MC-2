---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1786710715922-25-db11a6c5/stage-manifest.json
stream_owner: phase-0-worker
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: role-guide-audience phase A/B orchestrator
public_facade: measure-playbook-repetition-cli
bounded_acceptance: one focused RED/GREEN and one fourteen-playbook baseline run
non_goals:
  - production audience map
  - phase A/B implementation
  - schema or data mutation
evidence:
  - none
task_id: mc2-1786710716114-26-01631777-baseline
epic_id: mc2-db696
stage_id: mc2-1786710715922-25-db11a6c5
session_id: n/a
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-sol
reasoning_effort: medium
model_reasoning_rationale: implementation and measured data workflow needed reliable TDD and provider-boundary handling
repo: mc2
branch: codex/role-guide-audiences
base_branch: develop
base_commit: 9250c1be9a26e196b5809fa95038731919360826
worktree: /home/me/code/mc2/.worktrees/role-guide-audiences
write_zone:
  - packages/course-gen-platform/scripts/measure-playbook-repetition.ts
  - packages/course-gen-platform/tests/unit/scripts/measure-playbook-repetition.test.ts
  - docs/career-playbook/2026-08-29-semantic-repetition-baseline.md
  - .codex/stages/mc2-1786710715922-25-db11a6c5/artifacts/phase-0-baseline.md
success_criteria:
  - measure semantic block pairs inside each audience-view on fourteen completed playbooks
  - measure paragraph similarity only within the same block
  - save a reproducible baseline before production-code changes
selected_docs:
  - specs/028-role-guide-audiences/spec.md
  - docs/plans/swift-wobbling-dusk.md
selected_skills:
  - superpowers:test-driven-development
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: ignored dependency links were removed; prose-free checkpoint intentionally retained for zero-cost resume
risk_level: medium
risk_tags:
  - data
affected_surfaces:
  - backend
  - data
invariants:
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: reproducible baseline saved without customer prose or open UUIDs
verification:
  - set -a; . /home/me/code/mc2/packages/course-gen-platform/.env; set +a; TMPDIR=/tmp ../../node_modules/.bin/vitest run --config vitest.config.unit.ts tests/unit/scripts/measure-playbook-repetition.test.ts (RED): one existing pass and one expected failure
  - set -a; . /home/me/code/mc2/packages/course-gen-platform/.env; set +a; TMPDIR=/tmp ../../node_modules/.bin/vitest run --config vitest.config.unit.ts tests/unit/scripts/measure-playbook-repetition.test.ts (GREEN): 2 tests passed
  - set -a; . /home/me/code/mc2/packages/course-gen-platform/.env; set +a; TMPDIR=/tmp pnpm exec tsx scripts/measure-playbook-repetition.ts --out ../../docs/career-playbook/2026-08-29-semantic-repetition-baseline.md --cache .cache/career-playbook-repetition/jina-embeddings-v3.json: passed for 14 complete playbooks
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-1786710715922-25-db11a6c5/artifacts/phase-0-baseline.md: passed
changed_files:
  - packages/course-gen-platform/scripts/measure-playbook-repetition.ts
  - packages/course-gen-platform/tests/unit/scripts/measure-playbook-repetition.test.ts
  - docs/career-playbook/2026-08-29-semantic-repetition-baseline.md
  - .codex/stages/mc2-1786710715922-25-db11a6c5/artifacts/phase-0-baseline.md
explicit_defers:
  - none
---

# Summary

Phase 0 is ready for root acceptance. The reproducible baseline covers all fourteen complete
27-block Career Playbooks, keeps block-pair and within-block paragraph metrics separate, and proves
meaningful semantic repetition at the distribution-selected 0.85 threshold. No phase A/B or other
production code was changed.

# Scope / Routing

The script contains the one canonical phase-0 audience map copied from section 3 of the spec:
employee 20 blocks, manager 20, HR 14, each including `header`. It distinguishes 27 stored blocks
(`header` plus 26 content blocks) from the 26 content/boundary blocks. Inter-block comparisons are
counted per audience-view; paragraph comparisons never cross a block boundary. Similarity uses
`QualityValidator.cosineSimilarity`, while embeddings use the existing Jina embedding client and
therefore the shared Jina rate/concurrency limiters. Database selection is read-only and accepts
exactly the fourteen rows containing all 27 non-empty blocks; the completed two-block fixture is
excluded.

The first paid attempt exposed Jina's 100,000-token/minute limit after losing seven successful
batches. The repaired script now hashes every text, persists only hashes and 768-number embeddings,
atomically replaces its checkpoint after each successful batch, resumes in original order without
repaying cache hits, paces to 75,000 observed tokens per window, and waits 61 seconds before retrying
a 429. The production Jina client was not changed.

The owner Graphify graph at `/home/me/code/mc2/graphify-out/graph.json` was used read-only for
orientation because the worktree has no graph. Current-tree source files were confirmed directly;
no graph refresh is needed for this measurement script and evidence document.

# Verification

Focused TDD evidence for the repair:

- RED: the existing metric test passed and the new checkpoint test failed only because
  `embedTextsWithCheckpoint` did not exist.
- GREEN: 2/2 tests passed. The new test performs a real atomic write, interrupts after one batch,
  confirms the cache contains no prose, resumes only the missing text, waits on an injected 429 and
  returns all embeddings in original order.
- The existing test still hand-checks 12 audience-view pair occurrences and two within-block
  paragraph pairs using literal orthogonal embeddings.
- No broad type-check or unit suite was run; root owns final acceptance.

The read-only preflight found 15 `completed` rows, of which exactly 14 have all 27 stored blocks.
Those 14 contain 1,061,727 characters and 2,074 semantic paragraphs at the script's 100-character
minimum. One incomplete row contains only `header` and `block_1` and is excluded.

The completed baseline measured 6,594 audience-view block-pair occurrences and 6,829 paragraph
pairs within one block. Matrix counts:

- view pairs: 79 at 0.75, 23 at 0.80, 8 at 0.85, 0 at 0.90;
- within-block pairs: 143 at 0.75, 55 at 0.80, 18 at 0.85, 5 at 0.90.

The working threshold is 0.85: it is the highest candidate retaining at least five occurrences in
both metric families. Rates are 0.12% between blocks inside views and 0.26% inside blocks. Manual
spot-checks confirmed actual repeated onboarding plans, repeated business-goal/CAC material and
repeated sprint-readiness checklists. Therefore the metric has a real semantic signal and does not
trigger the empty-baseline stop.

The successful invocation generated 2,443 unique embeddings in 62 paid batches, 588,993 input
tokens, catalogue cost $0.029450. The earlier failed invocation had already processed 150,699
tokens, catalogue cost $0.007535. Total observed phase-0 Jina usage is 739,692 tokens / $0.036985.
The 21 MiB ignored checkpoint has 2,443 SHA-256 keys, every value is a 768-number vector, and it
contains no customer prose.

# Delivery / Cleanup

Returned ready for root acceptance; not yet accepted or integrated. Dependency links created only
to run the focused test are removed before return. The ignored prose-free checkpoint remains in the
worktree so an unchanged-input rerun makes zero paid calls.

# Risks / Follow-ups / Explicit Defers

Root still owns acceptance and any transition to phase A. Phase 0 itself has no remaining defer.
