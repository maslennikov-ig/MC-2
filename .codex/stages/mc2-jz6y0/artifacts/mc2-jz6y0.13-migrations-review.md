---
schema_version: orchestration-artifact/v1
artifact_type: independent-review
task_id: mc2-jz6y0.13.1-review
stage_id: mc2-jz6y0
agent_type: correctness-reviewer
repo: mc2
branch: codex/q12-migrations
base_branch: codex/self-hosted-qdrant-platform
base_commit: 5c74869f
worktree: /home/me/code/mc2/.worktrees/q12-migrations
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Review-only branch remains for the orchestrator; temporary dependency links and disposable PostgreSQL are removed before handoff.
risk_level: high
docs_reviewed: no-change-needed
docs_review_notes: This review changes no product or operator documentation; it verifies the final migration-gate remediation and records evidence for orchestrator acceptance.
graph_reviewed: no-change-needed
graph_review_notes: Read-only review of a bounded migration runner used exact SQL, PostgreSQL catalogs, tests, and runtime tamper probes; no graph refresh is appropriate.
verification:
  - Reviewed final remediation 5c74869f against reviewer base 760adf03 and full branch base f9389b69.
  - Recomputed eight fixed SQL digests and the 223-file repository manifest; all hard-coded values match.
  - Fresh disposable PostgreSQL 16 run passed 19/19 focused tests in 14.86 seconds.
  - Fresh course-gen-platform type-check passed.
  - Exact clarifying index uniqueness, predicate, and both metadata expressions independently rejected tamper; restored state returned reused.
  - Missing pgcrypto/digest dependency rejected the prior reproduction.
  - Each of five downstream function/RPC names and each of five downstream trigger names independently blocked historyless base rollback.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-migrations-review.md
explicit_defers:
  - Orchestrator integration, integration-worktree rerun, Beads state, Graphify refresh, and stage closeout remain parent-owned.
  - No remote database, staging, service, secret, deployment, or CI state was read or mutated.
---

# Summary

**Verdict: PASS / APPROVED FOR ORCHESTRATOR INTEGRATION.** Final remediation `5c74869f` closes both residual P1 findings. The review found 0 P0, 0 P1, 0 P2, and 0 P3 issues in the bounded migration gate.

| Priority | Count | Approval impact |
| --- | ---: | --- |
| P0 | 0 | None |
| P1 | 0 | None |
| P2 | 0 | None |
| P3 | 0 | None |

## Findings

No actionable findings.

## Resolved review findings

### Exact external index and pgcrypto dependency

`assertClarifyingSubjectIndex()` now verifies the complete PostgreSQL 16 definition, three-key uniqueness, live/ready/valid state, exact partial predicate, and ordered expressions for `clarifying_questions_document_evidence_subject_unique`. Manual probes independently changed the predicate, the third expression, and uniqueness; every case failed closed. Restoring the exact approved definition returned `reused`, showing the check accepts the intended state without broadening acceptance.

`assertPgcryptoDigestDependency()` requires pgcrypto `1.3` in the `extensions` schema and a callable `extensions.digest(bytea,text)` with the expected result type, C language, invoker security, and empty function configuration. The prior `DROP EXTENSION pgcrypto CASCADE` reproduction is now rejected.

### Complete historyless downstream absence boundary

The rollback preflight inventories both downstream relations, all five function/RPC names, and all five trigger names before any base mutation. Independent disposable-database probes injected each name one at a time with no `150/151` history. All ten probes failed with `Refusing base rollback while downstream live objects remain`; the base remained intact after every refusal. The existing suite separately covers downstream history and the index/totals live sentinels.

# Verification

Fresh commands and outcomes:

```text
DOCUMENT_EVIDENCE_DATABASE_URL=<loopback disposable PostgreSQL 16 URL> \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
  tests/integration/document-evidence-approved-migrations.test.ts \
  --config ../../vitest.shared.ts --reporter=verbose
=> 1 file passed, 19 tests passed, 0 failed; duration 14.86s

pnpm --filter @megacampus/course-gen-platform type-check
=> exit 0

223-file manifest recomputation
=> count 223
=> 3ee5b37c2f727b0d68b00860235362ed72f9fd21a5a1fd871959378379ede1bf

sha256sum <six base apply/rollback SQL files plus 150/151 apply SQL files>
=> all eight values matched their fixed allowlists
```

The 19-test PostgreSQL suite covers apply/reuse, exact-history recovery, reverse rollback/reapply, earlier pending/unknown/gapped/later history, downstream history and live residue, RLS policy, RPC security, execute grants, function body/search path through the catalog manifest, evidence-table constraints/indexes/triggers, same-name clarifying index drift, missing pgcrypto, downstream increment-function residue, and post-rollback base residue.

Additional probes verified all three clarifying-index dimensions and exhaustive downstream name coverage. After every restored approved state, the runner returned `reused`; no overbroad false acceptance or unintended false rejection was observed. Parser behavior is unchanged, source/history digests remain exact, the full frontier runs under the advisory lock, and each base migration remains individually transactional and recoverable.

# Risks / Follow-ups

The gate intentionally pins PostgreSQL 16 catalog rendering, pgcrypto `1.3`, the 223-file repository inventory, eight SQL digests, and allowed cumulative catalog hashes. A deliberate migration addition, PostgreSQL/extension upgrade, or approved SQL/catalog change must update these values through review rather than bypassing the gate.

This PASS approves local integration of the reviewed migration runner. It does not itself authorize or attest any remote database connection, staging mutation, deployment, secrets change, or live migration execution.
