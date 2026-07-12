---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.26
stage_id: mc2-jz6y0
agent_type: correctness-worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: the final staging activation gate must distinguish an approved environment target from forbidden Compose hard-coding without weakening either contract
repo: mc2
branch: codex/q12-activation-contract-fix
base_branch: codex/self-hosted-qdrant-platform
base_commit: e033465ea1c3e6cbf9177ab95ad72ffec7987bb3
resolves_review: ffed8300
worktree: /home/me/code/mc2/.worktrees/q12-activation-contract-fix
write_zone:
  - packages/course-gen-platform/tests/unit/ops/document-evidence-dev-activation-contract.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.26.md
success_criteria:
  - require the approved production-environment example to contain exactly the active true/active/100 document-evidence triplet
  - require every production Compose file to remain environment-driven and omit hard-coded active values
  - preserve the existing development worker and package assertions
  - rerun the exact final backend Stage 2/4/5/6 matrix with zero failures and skips
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-focused.md at ffed8300
selected_skills:
  - superpowers:receiving-code-review
  - superpowers:systematic-debugging
  - superpowers:test-driven-development
  - test-pass
  - superpowers:verification-before-completion
selected_agents:
  - correctness worker
catalog_candidates:
  - none - installed correctness and verification skills cover this test-only correction
parallel_decision: sequential - one stale assertion is the sole failed seam and the broad matrix depends on its focused correction
status: returned
delivery_method: cherry-pick
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: dedicated worktree and branch remain available for orchestrator inspection and independent review; local build outputs are ignored and no runtime resource was started
risk_level: medium
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: the approved 100 percent staging target is already durable in the environment example, handoff, runbooks, and closed decision; only its stale test contract changed
graph_reviewed: no-change-needed
graph_review_notes: this test-only correction changes no source, runtime, API, architecture, or durable workflow relationship; no Graphify refresh is warranted
verification:
  - TDD RED at e033465e: focused contract passed 1/2 and failed exactly because the blanket non-development assertion rejected DOCUMENT_EVIDENCE_ENABLED=true in .env.production.example
  - focused GREEN: passed 1/1 file and 2/2 tests with zero skips
  - exact final backend Stage 2/4/5/6 matrix after required workspace package builds: passed 125/125 files and 1893/1893 tests with zero skips
  - course-gen-platform package type-check: passed
  - focused Prettier and git diff --check: passed
  - delegated artifact validation and repository process verification: passed
  - self-review: P0 0, P1 0, P2 0, P3 0
changed_files:
  - packages/course-gen-platform/tests/unit/ops/document-evidence-dev-activation-contract.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.26.md
explicit_defers:
  - no implementation defer; remote activation, database, Docker, service, secret, SSH, staging, and production mutation remain outside this test-only stream
---

# Summary

The failed final-focused gate was deterministic test drift. The owner-approved
staging target is already the exact `true` / `active` / `100` triplet in
`.env.production.example`, while the old test combined that file with Compose
and prohibited the triplet everywhere outside development.

The corrected contract now treats the two boundaries independently. It
requires the production environment example to contain exactly one value for
each of the three activation variables, in the approved triplet. It then
checks `docker-compose.infra.yml`, `docker-compose.app.yml`, and
`docker-compose.production.yml` separately: each must continue to reference
the external `${PRODUCTION_ENV_FILE:-.env.production}` and none may hard-code
an active value. The existing exact-value assertions for both development
workers and the package environment example are unchanged.

# Verification

At base `e033465e`, the focused test reproduced the report at `ffed8300`: one
of two tests failed because the blanket assertion found
`DOCUMENT_EVIDENCE_ENABLED=true` in `.env.production.example`. After the
test-only correction, the focused file passed 2/2 with zero skips.

The first broad run was an environment-preparation failure: this fresh
worktree had no built `@megacampus/shared-utils` package, so 60 suites could
not resolve its package entry. No source change was made in response. After
building the same shared workspace prerequisites recorded by the final-focused
worker, the exact backend command from `mc2-jz6y0-final-focused.md` passed
125/125 files and 1,893/1,893 tests with zero skips. The package type-check
also passed.

The test matrix is release-tier for the affected contract: the inner focused
test proves exact staging and Compose boundaries, while the full Stage 2/4/5/6
matrix proves the corrected assertion does not weaken document processing,
analysis, advisory enrichment, decision-aware retrieval, Qdrant, privacy, or
observability coverage.

# Risks / Follow-ups

This correction intentionally does not parse or activate a live environment.
It proves the checked-in target and indirection contract only. No environment,
configuration, product source, Beads state, docs, Graphify output, database,
Docker resource, service, secret, SSH target, staging system, production
system, or remote runtime was changed.

Independent review should confirm that exact-value filtering rejects duplicate
or alternative values in the environment example and that the Compose
assertions preserve both external environment loading and the hard-coding
prohibition.
