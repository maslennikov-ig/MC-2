---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0
stage_id: mc2-jz6y0
agent_type: documentation_engineer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: the final Q12 runbooks control backup, migration, source recovery, rollback, reindex, and staging activation ordering
repo: mc2
branch: codex/q12-final-docs-correction
base_branch: codex/self-hosted-qdrant-platform
base_commit: e033465ea1c3e6cbf9177ab95ad72ffec7987bb3
resolves_review: 69fd5610
worktree: /home/me/code/mc2/.worktrees/q12-final-docs-correction
write_zone:
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .codex/handoff.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5-rereview.md
  - this artifact
success_criteria:
  - make database-backup gate .13.7 an explicit pre-migration hard stop in both runbooks
  - insert the accepted source-recovery wrapper and exact cardinality/residue/rollback gates before reindex
  - reconcile accepted Task 6 artifact tails with integrated and cleaned truth while preserving the immutable negative review
  - update the current-state handoff date
selected_docs:
  - immutable final documentation review 69fd5610
  - accepted source-recovery Task 6 implementation and rereview artifacts
  - accepted database-backup implementation, rereview, and credential-discovery artifacts
selected_skills:
  - superpowers:receiving-code-review
  - code-review
  - orchestration-closeout
  - superpowers:verification-before-completion
selected_agents:
  - documentation_engineer
catalog_candidates:
  - none - installed review and closeout skills cover this bounded documentation correction
parallel_decision: sequential - all findings reconcile one joined executable activation sequence and current-state packet
status: returned
delivery_method: cherry-pick
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: dedicated correction worktree and local branch remain for independent rereview and orchestrator integration
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: both Q12 operator runbooks and current-state acceptance artifacts now encode the complete backup, recovery, rollback, and reindex order
graph_reviewed: no-change-needed
graph_review_notes: parent explicitly owns the final Graphify refresh; this bounded correction performs no Graphify write
verification:
  - focused Prettier 3.7.4 over all six changed documentation/artifact files passed
  - all three changed orchestration artifacts passed validate_artifact.py
  - git diff check and exact six-file write-zone check passed
  - repository process verification passed
  - added-line secret-pattern scan returned zero matches
  - findings-first self-review returned P0 0, P1 0, P2 0, P3 0
changed_files:
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .codex/handoff.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5-rereview.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-docs-correction.md
explicit_defers:
  - no remote action is performed; Q12 remains NO-GO until the current verify-full Session pooler URL and every documented live gate pass
  - off-host S3 remains production defer mc2-jz6y0.13.6 and is not a staging gate
---

# Final Q12 Documentation Correction

## Summary

Corrects all four findings from immutable review `69fd5610`. Both runbooks now
make `.13.7` a hard pre-migration gate and reject the historical 20-byte files
as evidence. The exact activation window calls the accepted source-recovery
wrapper before reindex, requires `42/125`, all 24 dispositions, `234 + 6 = 240`,
zero eligible gaps and residue, and retains the pre-reindex rollback boundary.
Accepted Task 6 artifact tails now match their integrated/cleaned frontmatter,
and the handoff date reflects the July 13 evidence.

## Finding Disposition

| Finding | Resolution                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q12-D1  | Added the current DSN, safe backup parent, reviewed operator/input installation, fresh full archive validation, and isolated restore sequence to both runbooks. |
| Q12-D2  | Inserted the documented source-recovery wrapper, exact truth gates, and explicit pre-reindex rollback boundary into the numbered activation window.             |
| Q12-D3  | Replaced stale future-work tails with accepted integration and cleanup truth; immutable negative review `2c861d34` remains returned.                            |
| Q12-D4  | Updated `.codex/handoff.md` to 2026-07-13.                                                                                                                      |

## Remote Boundary

This is a documentation-only correction. It does not install an operator, read
or write a secret, connect to PostgreSQL, copy a source, start a service, mutate
Qdrant, deploy, or change staging/production state.

# Verification

- Installed Prettier 3.7.4 check over all six changed files: passed.
- `validate_artifact.py` over both changed Task 6 artifacts and this correction
  artifact: 3/3 passed.
- `git diff --check` and exact six-file write-zone assertion: passed.
- `scripts/orchestration/run_process_verification.sh`: passed.
- Added-line PostgreSQL URI, private-key, JWT, GitHub/AWS key, and credential
  assignment scan: zero matches.
- Findings-first self-review against `69fd5610` and accepted operator history:
  P0 0, P1 0, P2 0, P3 0.

# Risks / Follow-ups

The current Session pooler URL and live restore proof remain unavailable remote
inputs. This correction adds no new defer and does not authorize partial
activation; production off-host S3 remains separately deferred as
`mc2-jz6y0.13.6`.
