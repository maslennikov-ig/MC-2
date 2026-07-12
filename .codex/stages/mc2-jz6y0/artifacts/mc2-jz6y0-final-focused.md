---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0
stage_id: mc2-jz6y0
agent_type: test-worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Final cross-stage release evidence must distinguish an actual activation-contract regression from harmless test diagnostics.
repo: /home/me/code/mc2
branch: codex/q12-final-focused
base_branch: codex/self-hosted-qdrant-platform
base_commit: e033465ea1c3e6cbf9177ab95ad72ffec7987bb3
worktree: /home/me/code/mc2/.worktrees/q12-final-focused
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-focused.md
success_criteria:
  - Run the exact Q11 backend Stage 2/4/5/6 focused matrix with synthetic Supabase values and report fresh totals.
  - Run the exact shared three-file contract matrix and web three-file conflict matrix without weakened filters or snapshots.
  - Build required workspace packages first and run artifact, formatting, diff, and process gates.
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/project-index.md
  - graphify-out/GRAPH_REPORT.md from the primary checkout because graphify-out is ignored in this worker worktree
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-focused.md
selected_skills:
  - test-pass
  - verification-before-completion
selected_agents:
  - QA/correctness test worker
catalog_candidates:
  - none - installed test-pass and verification-before-completion cover this read/test/evidence stream
parallel_group: final-release-evidence
depends_on_streams:
  - final integration SHA e033465ea1c3e6cbf9177ab95ad72ffec7987bb3
parallel_decision: parallel
status: blocked
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: The immutable NO-GO artifact was integrated, its linked correction/review passed, and the dedicated worktree/local branch were removed. The temporary JSON report and ignored worktree build outputs are gone; no remote runtime was touched.
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: Only a verification artifact changed; the discovered mismatch requires code/config contract reconciliation by the owning stream, not documentation changes by this test worker.
graph_reviewed: used
graph_review_notes: Read the existing primary-checkout Graphify report for orientation. Tests and this evidence artifact do not alter architecture or source relationships, so no worker graph refresh is needed.
verification:
  - pnpm install --frozen-lockfile: passed; lockfile unchanged, 1795 packages linked from the local store
  - shared-logger, shared-types, and shared-utils builds: passed
  - Backend Stage 2/4/5/6 matrix: failed; 125 files collected, 1892/1893 tests passed, 1 failed, zero skipped
  - Shared contract matrix: passed 3/3 files and 23/23 tests, zero skipped
  - Web material-conflict matrix: passed 3/3 files and 20/20 tests, zero skipped; four non-blocking jsdom scrollTo diagnostics
  - Artifact validator, focused Prettier, git diff --check, and process verification: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-focused.md
explicit_defers:
  - Release go remains blocked until the dev-only activation contract and the approved production example are reconciled and the exact backend matrix is rerun green.
  - Q12 remote execution, live reindex, service or secret changes, staging mutation, and production mutation remain outside this worker scope.
---

# Summary

Final focused release evidence on `e033465e` is **NO-GO**. Shared contracts and the web material-conflict matrix are green, but the backend matrix has one deterministic contract failure. The prior Q11 baseline was 124 files / 1,869 tests; the current filters collect 125 files / 1,893 tests. Of those, 1,892 pass and one fails, with no skips.

The blocking test is:

```text
tests/unit/ops/document-evidence-dev-activation-contract.test.ts
document evidence dev activation contract > does not activate staging or production configuration
```

The assertion at line 67 requires all non-development configuration to omit the active triplet, while `.env.production.example` currently contains:

```text
DOCUMENT_EVIDENCE_ENABLED=true
DOCUMENT_EVIDENCE_MODE=active
DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100
```

This is an actual contract/configuration mismatch, not log noise. The worker did not change product code or choose which side of the contract is authoritative.

# Verification

Prerequisites:

```bash
pnpm install --frozen-lockfile
pnpm --filter @megacampus/shared-logger build \
  && pnpm --filter @megacampus/shared-types build \
  && pnpm --filter @megacampus/shared-utils build
```

Both commands exited 0. The frozen install reported the lockfile up to date and linked 1,795 packages. All three workspace package builds passed.

Exact backend matrix:

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=q12-final-focused-service-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts \
  tests/unit/stages/stage2-document-processing/qdrant-recovery-policy.test.ts \
  tests/unit/stages/stage4-analysis \
  tests/unit/stages/stage5-generation \
  tests/unit/stages/stage6 \
  tests/unit/shared/qdrant \
  tests/unit/ops/document-evidence-dev-activation-contract.test.ts \
  tests/unit/ops/document-evidence-log-privacy-contract.test.ts \
  tests/unit/ops/document-evidence-observability-contract.test.ts \
  tests/unit/shared/metrics/document-evidence-textfile.test.ts
```

Result: exit 1; 125 files, 1,892 passed tests, 1 failed test, zero skipped. A second collection-equivalent run used Vitest's JSON reporter only to obtain untruncated totals and reproduced the same failure; its `/tmp` report was removed. `vitest list --filesOnly` independently confirmed 125 collected files.

Shared contracts:

```bash
pnpm --filter @megacampus/shared-types exec vitest run \
  tests/document-evidence.test.ts \
  tests/clarifying-question-contract.test.ts \
  tests/stage5-document-evidence-enrichment.test.ts
```

Result: exit 0; 3/3 files and 23/23 tests passed in 258 ms; zero skipped.

Web material conflicts:

```bash
pnpm --filter @megacampus/web exec vitest run \
  components/generation-graph/panels/clarifying/__tests__/DocumentEvidenceQuestion.test.tsx \
  components/generation-graph/panels/clarifying/__tests__/ClarifyingPanel.document-conflicts.test.tsx \
  tests/unit/document-conflicts-e4-fixture-policy.test.ts
```

Result: exit 0; 3/3 files and 20/20 tests passed in 3.83 seconds; zero skipped. Vitest printed four `Not implemented: Window's scrollTo() method` messages after the passing summary. They are jsdom diagnostics and did not fail assertions or the command.

# Risks / Follow-ups

No filters, assertions, snapshots, or skip behavior were weakened. Synthetic loopback Supabase values were supplied only to the unit process. No Supabase request, database, Qdrant, Docker, browser, service, secret, SSH, staging, production, or remote mutation occurred.

Recommendation: reconcile the approved production activation state with the dev-only contract in the owning implementation stream, review that decision explicitly, then rerun this exact backend matrix. Shared and web evidence can be retained as green evidence for `e033465e`, but they do not override the backend NO-GO.
