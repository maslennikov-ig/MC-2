---
schema_version: orchestration-artifact/v1
artifact_type: independent-review
task_id: mc2-jz6y0.13.1-review
stage_id: mc2-jz6y0
agent_type: correctness-reviewer
repo: mc2
branch: codex/q12-migrations
base_branch: codex/self-hosted-qdrant-platform
base_commit: cb7f4490
worktree: /home/me/code/mc2/.worktrees/q12-migrations
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Review-only branch remains for the orchestrator; temporary dependency links and disposable PostgreSQL are removed before handoff.
risk_level: high
docs_reviewed: no-change-needed
docs_review_notes: This review changes no product or operator documentation; it assesses the remediated migration runner against the approved migration and Q12 activation contracts.
graph_reviewed: no-change-needed
graph_review_notes: Read-only review of a bounded migration runner used exact SQL, tests, and PostgreSQL catalog evidence; no graph refresh is appropriate.
verification:
  - Reviewed remediation cb7f4490 against prior review 47b7623e and full branch base f9389b69.
  - Recomputed the fixed 223-file repository manifest and downstream 150/151 SHA-256 digests; all values match.
  - Fresh disposable PostgreSQL 16 run passed 16/16 focused tests in 12.13 seconds.
  - Fresh course-gen-platform type-check passed.
  - Manual tamper checks rejected table ACL, function search_path, and function body drift.
  - Reproduction proved same-name clarifying_questions index drift and missing pgcrypto are incorrectly reused.
  - Reproduction proved an unhistoried downstream increment function survives a successful base rollback.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-migrations-review.md
explicit_defers:
  - Implementation fixes and regression tests for the two residual P1 findings belong to the migration worker/orchestrator.
  - No remote database, staging, service, secret, deployment, or CI state was read or mutated.
---

# Summary

**Verdict: BLOCKED / DO NOT APPROVE REMOTE APPLY OR ROLLBACK.** Remediation `cb7f4490` fully resolves the exact 223-file history frontier and blocks rollback when `150/151` history or the three current downstream sentinels remain. Exact catalog hashing also detects drift for the evidence-table objects it includes. Two P1 scope gaps remain, so the previous security/live-state and historyless-downstream findings are not fully closed.

| Priority | Count | Approval impact |
| --- | ---: | --- |
| P0 | 0 | None |
| P1 | 2 | Blocks approval and remote mutation |
| P2 | 0 | None |
| P3 | 0 | None |

## Findings

### P1 — The “exact” base manifest omits two migration-owned dependencies

- **File:** `packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts:22`
- **Evidence:** `DOCUMENT_EVIDENCE_TABLES` contains only the seven new evidence tables. Consequently, the exact index query at line 602 never hashes `clarifying_questions_document_evidence_subject_unique`, which migration `20260711130000` creates on `public.clarifying_questions`; the fallback check at line 511 validates only its name. The manifest also has no extension/schema dependency inventory even though `20260711130000_document_conflict_auto_answers.sql:3` creates `extensions.pgcrypto` and `document_evidence_sha256()` calls `extensions.digest`.
- **Reproduction:** After a clean `120/130/140` apply, replacing `clarifying_questions_document_evidence_subject_unique` with a same-name `UNIQUE(id)` index made the runner return `reused`. In a separate clean run, `DROP EXTENSION pgcrypto CASCADE` removed `extensions.digest` while leaving `document_evidence_sha256(text)`; the runner again returned `reused`. The accepted wrapper then fails when invoked because its required digest function is absent.
- **Impact:** Remote reuse/recovery can certify a wrong uniqueness boundary or a broken automatic-decision hashing dependency. This contradicts the claimed exact index/live-object verification and can produce duplicate decision questions or runtime failures after activation.
- **Required fix:** Extend the exact forward/absent manifests to cover every existing relation modified by these migrations, at minimum the full definition/state of `clarifying_questions_document_evidence_subject_unique`, plus the required extension/schema and exact callable dependency for `extensions.digest`. Add same-name index-definition and missing/altered extension regressions.

### P1 — Historyless downstream residue is checked by only three sentinels

- **File:** `packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts:918`
- **Evidence:** `assertNoDownstreamLiveObjects()` checks only the 150 index, the 151 totals table, and the totals RPC. It does not inspect the four `increment_document_evidence_*` functions or five triggers created by `20260711151000`; those names are also absent from `DOCUMENT_EVIDENCE_FUNCTIONS` at line 32 and therefore from the rollback absence digest at line 888.
- **Reproduction:** After a clean base apply with no downstream history/sentinels, creating `public.increment_document_evidence_terminal_totals()` left a downstream-named function with no history. Base rollback returned `rolled_back`, removed all `120/130/140` history, and the function still resolved afterwards.
- **Impact:** A partially repaired or externally drifted 151 state can survive the supposedly clean `151 -> 120` boundary. History then claims the evidence stack is absent while executable downstream residue remains, invalidating recovery and future reapply assumptions.
- **Required fix:** Verify an exact complete 150/151 absence manifest before base rollback, including all downstream indexes/comments, totals table/RLS/ACL, RPC, increment functions/bodies/security configuration/ACLs, and triggers/enabled state. Add a regression that leaves each downstream object class without history and proves rollback refuses before mutating the base.

# Verification

Fresh commands and outcomes:

```text
DOCUMENT_EVIDENCE_DATABASE_URL=<loopback disposable PostgreSQL 16 URL> \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
  tests/integration/document-evidence-approved-migrations.test.ts \
  --config ../../vitest.shared.ts --reporter=verbose
=> 1 file passed, 16 tests passed, 0 failed; duration 12.13s

pnpm --filter @megacampus/course-gen-platform type-check
=> exit 0

223-file manifest recomputation
=> 3ee5b37c2f727b0d68b00860235362ed72f9fd21a5a1fd871959378379ede1bf

150/151 sha256sum
=> a7f6d6958b158d10f53f3fb0103047f0ea1ade8a020d78176e365237e4eccfe8
=> 5f675b1a8a933128520b2fb9d42632a9cbefff2e57ec72f06cd42cd6e0a090e3
```

The 16-test suite freshly proves rejection of prior-history gaps/unknown rows/tails, downstream history and current sentinel residue, policy/RPC/grant/evidence-table constraint/index/trigger drift, and one base rollback residue. Additional manual tamper probes confirmed that table ACL, function `search_path`, and function-body changes are rejected. The two reproductions above demonstrate the remaining uncovered catalog scopes.

Parser behavior for the six fixed base files is unchanged from the established allowlisted splitter. Base and downstream source digests match. Apply remains ascending, rollback descending, each base migration remains individually transactional, and the full frontier check runs under the advisory lock before mutation. No new parser, digest, history-prefix, or per-migration partial-failure regression was found.

# Risks / Follow-ups

Do not merge this implementation as an approved Q12 remote gate until both P1 findings are fixed and independently re-reviewed. The worker artifact currently overstates “all owned indexes” and historyless downstream coverage; update that evidence with the new regressions. The next review must rerun the 16 tests plus exact `clarifying_questions` index, pgcrypto dependency, and complete downstream-absence cases on disposable PostgreSQL.
