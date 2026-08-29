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
milestone_status: replan-required
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: inherited for a bounded measurement implementation
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
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: ignored dependency links created for the focused test were removed before return
risk_level: medium
risk_tags:
  - data
affected_surfaces:
  - backend
  - data
invariants:
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: baseline document was intentionally not created because the only paid run did not complete
verification:
  - set -a; . /home/me/code/mc2/packages/course-gen-platform/.env; set +a; TMPDIR=/tmp ../../node_modules/.bin/vitest run --config vitest.config.unit.ts tests/unit/scripts/measure-playbook-repetition.test.ts (RED): failed as expected
  - set -a; . /home/me/code/mc2/packages/course-gen-platform/.env; set +a; TMPDIR=/tmp ../../node_modules/.bin/vitest run --config vitest.config.unit.ts tests/unit/scripts/measure-playbook-repetition.test.ts (GREEN): passed
  - set -a; . /home/me/code/mc2/packages/course-gen-platform/.env; set +a; TMPDIR=/tmp pnpm exec tsx scripts/measure-playbook-repetition.ts --out ../../docs/career-playbook/2026-08-29-semantic-repetition-baseline.md: blocked by Jina token-per-minute limit after provider invocation
changed_files:
  - packages/course-gen-platform/scripts/measure-playbook-repetition.ts
  - packages/course-gen-platform/tests/unit/scripts/measure-playbook-repetition.test.ts
  - .codex/stages/mc2-1786710715922-25-db11a6c5/artifacts/phase-0-baseline.md
explicit_defers:
  - phase-0 baseline needs an orchestrator-approved retry strategy that avoids repaying for discarded partial embeddings
---

# Summary

The phase-0 measurement code and focused unit test are ready, but the only paid baseline run did
not complete. Jina accepted seven 100-document embedding batches and recorded 150,699 input tokens,
then rejected the next batch with `Token rate limit exceeded: 102,333/100,000 tokens per minute`.
The process exited 1 before writing the baseline document. No phase A/B or other production code was
changed, and no false or partial baseline was saved.

# Scope / Routing

The script contains the one canonical phase-0 audience map copied from section 3 of the spec:
employee 20 blocks, manager 20, HR 14, each including `header`. It distinguishes 27 stored blocks
(`header` plus 26 content blocks) from the 26 content/boundary blocks. Inter-block comparisons are
counted per audience-view; paragraph comparisons never cross a block boundary. Similarity uses
`QualityValidator.cosineSimilarity`, while embeddings use the existing Jina embedding client and
therefore the shared Jina rate/concurrency limiters. Database selection is read-only and accepts
exactly the fourteen rows containing all 27 non-empty blocks; the completed two-block fixture is
excluded.

The owner Graphify graph at `/home/me/code/mc2/graphify-out/graph.json` was used read-only for
orientation because the worktree has no graph. Current-tree source files were confirmed directly.
No graph refresh is appropriate for this blocked measurement-only stream.

# Verification

Focused TDD evidence:

- RED: one test ran and failed on the intended assertion, `measurement script must exist`.
- GREEN: the same one test passed. It hand-checks 12 audience-view pair occurrences, three
  too-close view occurrences, two within-block paragraph pairs and one too-close paragraph pair.
- No broad type-check or unit suite was run; root owns final acceptance.

The read-only preflight found 15 `completed` rows, of which exactly 14 have all 27 stored blocks.
Those 14 contain 1,061,727 characters and 2,074 semantic paragraphs at the script's 100-character
minimum. One incomplete row contains only `header` and `block_1` and is excluded.

The intended primary too-close threshold is 0.85, a high-precision cut above the existing 0.75
Stage-5 broad-overlap threshold. The report also preserves rates at 0.75, 0.80 and 0.90 so phase B
can calibrate against the observed distribution rather than one guessed cut. No too-close rates or
top examples exist yet because the run did not reach a complete result.

# Delivery / Cleanup

Returned for orchestrator decision; not accepted or integrated. The branch commit is a blocked
measurement handoff, not a completed phase-0 baseline.

# Risks / Follow-ups / Explicit Defers

Do not start phases A/B. Do not present the current script commit as baseline proof. A retry must
first choose a bounded approach that preserves completed embedding batches or paces requests under
Jina's 100,000-token/minute account limit; otherwise it will repay for already discarded work.
