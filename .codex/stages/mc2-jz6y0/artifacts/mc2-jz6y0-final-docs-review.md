---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0
stage_id: mc2-jz6y0
agent_type: docs_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: final Q12 documentation controls a destructive source-copy, database-migration, reindex, backup, rollback, and staging-activation sequence
repo: mc2
branch: codex/q12-final-docs-review
base_branch: codex/self-hosted-qdrant-platform
base_commit: e033465ea1c3e6cbf9177ab95ad72ffec7987bb3
reviewed_commit: e033465ea1c3e6cbf9177ab95ad72ffec7987bb3
reviewed_range: 7a808fc21133c5fe024ac6be774e779cd762981d..e033465ea1c3e6cbf9177ab95ad72ffec7987bb3
worktree: /home/me/code/mc2/.worktrees/q12-final-docs-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-docs-review.md
success_criteria:
  - independently reconcile the final Q12 runbooks, current-state docs, Task 6 artifacts, credential evidence, implementation, and Beads truth
  - verify source-recovery paths, flags, ownership, fresh/resume/rollback sequencing, disposition and reindex gates against the host wrapper and Compose
  - verify exact source, recovery, disposition, reindex, backup, credential, local-snapshot, and no-remote-mutation facts
  - return findings-first P0-P3 counts and pass only with zero findings
selected_docs:
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .codex/handoff.md
  - .codex/project-index.md
  - .codex/stages/mc2-jz6y0/summary.md
  - accepted source-recovery runtime, adapter, Task 6, backup, and credential artifacts
selected_skills:
  - code-review
  - orchestration-closeout
  - superpowers:verification-before-completion
selected_agents:
  - docs_reviewer
catalog_candidates:
  - none - installed review and closeout skills cover this bounded documentation review
parallel_decision: sequential - this reviewer evaluates one joined final documentation delta after the accepted Q12 implementation streams
status: returned
delivery_method: cherry-pick
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and local branch remain for orchestrator inspection and integration; no runtime or remote state was changed
risk_level: high
docs_impact: none
docs_reviewed: review-complete-with-findings
docs_review_notes: the numeric/current credential truth is consistent, but the executable activation order and accepted Task 6 artifact tails require correction
graph_reviewed: used
graph_review_notes: read the ignored local report and ran a focused read-only query; no refresh was performed because this stream is review-only
verification:
  - five changed stage artifacts passed validate_artifact.py before review output creation
  - focused Prettier check over all changed docs/artifacts passed using the installed workspace Prettier 3.7.4
  - git diff --check 7a808fc2..e033465e passed
  - scripts/orchestration/run_process_verification.sh passed
  - added-line secret scan found zero PostgreSQL URI, private-key, JWT, GitHub/AWS key, or credential-assignment patterns
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-docs-review.md
explicit_defers:
  - correct and independently rereview the two P1 activation-order findings before treating the Q12 packet as executable
  - reconcile the accepted Task 6 artifact tails and current handoff date before local closeout
---

# Final Q12 Documentation Review

# Summary

## Findings-first verdict

**NEEDS_WORK; P0: 0, P1: 2, P2: 1, P3: 1.** The accepted numeric,
credential, local-snapshot, no-S3-for-staging, and no-remote-mutation facts are
consistent. The runbooks are not yet a safe executable activation packet:
they omit the known fresh database-backup gate and the source-recovery command
from the exact ordered window.

| ID     | Severity | Confidence | Finding                                                                                                           |
| ------ | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Q12-D1 | P1       | high       | The activation runbooks omit the known fail-open database-backup repair and restore drill from their hard gates.  |
| Q12-D2 | P1       | high       | The exact Q12 activation order skips source recovery and moves directly from infrastructure/bootstrap to reindex. |
| Q12-D3 | P2       | high       | Accepted Task 6 artifacts retain next-step text that says acceptance, integration, and cleanup are still pending. |
| Q12-D4 | P3       | high       | The current-state handoff date predates the reviewed July 13 commits.                                             |

## Q12-D1 — P1 — the known broken database backup is not an activation hard gate

- **Files:** `docs/operations/qdrant-self-hosted.md:9`,
  `docs/operations/qdrant-self-hosted.md:362`,
  `docs/operations/qdrant-self-hosted.md:382`,
  `docs/operations/document-evidence.md:317`,
  `docs/operations/document-evidence.md:402`
- **Evidence:** both runbooks describe activation as NO-GO, but their enumerated
  blockers omit `mc2-jz6y0.13.7`, the observed
  `/opt/megacampus/backups` mode `0775`, installation of the accepted
  `deploy/postgres/backup-supabase.sh`, and the required fresh custom-format
  dump plus isolated restore. The Qdrant sequence only says “confirm
  backup/PITR”. In contrast, `.codex/handoff.md:40`,
  `.codex/stages/mc2-jz6y0/summary.md:202`, Beads `.13.7`, and the accepted
  backup rereview record that every dump since 2026-06-28 is a 20-byte
  fail-open artifact and that remote migration remains blocked until the
  parent mode is corrected and a fresh restore succeeds.
- **Impact:** an operator can satisfy the written list with a nominal backup or
  PITR check while the only scheduled database backup remains known-invalid,
  then begin the five remote migrations without the required rollback asset.
  This weakens a destructive migration gate and can turn a migration incident
  into data loss or unrecoverable downtime.
- **Required fix:** add `.13.7` to both NO-GO lists and make it the first ordered
  activation step after the current verify-full Session pooler DSN is
  available: correct the unsafe parent mode, install the reviewed operator and
  owner-only URL/CA files, create a fresh custom dump, validate its complete
  archive output, and restore it into the approved isolated target. Explicitly
  reject the 20-byte historical files as evidence.

## Q12-D2 — P1 — exact activation order omits the 42-copy recovery workflow

- **File:** `docs/operations/qdrant-self-hosted.md:379`
- **Evidence:** lines 374-377 correctly require the 42 no-replace copies and 24
  audited dispositions before reindex. Lines 382-399 then claim to give the
  exact one-window order, but after migrations/assets/infra/bootstrap they jump
  directly to the deterministic Qdrant reindex. The source-recovery wrapper
  documented at lines 329-352 is never invoked in that ordered list.
  `deploy/qdrant/source-recovery-run.sh:310-328` is the accepted path that holds
  the writer flock and sequences plan, execute, copy verification, disposition
  apply, and disposition verification.
- **Impact:** following the numbered activation packet skips the only reviewed
  write path that turns `109/240` recoverable rows into `234/240` and durably
  records the six eligible failures. The later gap-free reindex should fail
  closed, but only after migrations, service changes, and a writer pause have
  already begun; bypassing or improvising around that failure would weaken
  source parity and audit guarantees.
- **Required fix:** insert the exact source-recovery wrapper step after the
  required migrations and before collection reindex. Require the same run ID
  and reviewed owner-only manifest/journal, exact `42/125`, all 24 verified
  dispositions, `240 = 234 + 6`, zero unresolved eligible gaps, and zero owned
  residue before allowing the reindex worker to start. Keep rollback explicitly
  pre-reindex and reuse all required common wrapper arguments.

## Q12-D3 — P2 — accepted Task 6 artifacts still instruct future acceptance and cleanup

- **Files:**
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5.md:184`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5-rereview.md:112`
- **Evidence:** both frontmatters now say `status: accepted`,
  `accepted_by_orchestrator: yes`, and `cleanup_status: cleaned`. Their body
  tails still say to run independent review, integrate only after acceptance,
  remove the worktree, or that acceptance/integration/cleanup remain owned by
  the orchestrator. The immutable negative review correctly remains
  `status: returned`, `accepted_by_orchestrator: no`; its cleanup history is
  truthfully recorded as cleaned after the linked correction passed.
- **Impact:** the same artifact presents mutually exclusive delivery states.
  Future closeout or handoff agents can repeat accepted work or report a false
  pending worktree even though the summary and Beads child are closed.
- **Required fix:** preserve the immutable negative findings, but replace the
  stale Task 6 implementation/rereview tail sections with an integrated-state
  note that references the accepted correction/review and cleaned local
  worktrees. Do not change the negative review decision to accepted.

## Q12-D4 — P3 — handoff update date is stale

- **File:** `.codex/handoff.md:3`
- **Evidence:** the handoff says `Updated: 2026-07-12`, while both reviewed
  commits `7a808fc2` and `e033465e` were authored and committed on
  2026-07-13 Europe/Moscow and the handoff contains their accepted facts.
- **Impact:** this is minor, but it makes the current-state handoff look older
  than the evidence it summarizes and complicates chronological audit.
- **Required fix:** update the handoff date to `2026-07-13` with the correction.

# Verified Consistency

- Source truth agrees across runbooks, handoff, summary, Beads, and Task 6:
  `261 total / 240 eligible / 21 missing_course`, `42` physical copies restore
  `125` logical rows, six eligible plus eighteen Career Playbook dispositions,
  and reindex parity `234 + 6 = 240`.
- Task 6 evidence consistently reports 3/3 focused and 456/456 combined tests.
  The concrete Stage 4 adapter binding, tenant CAS, crash resume, replacement
  inode rollback guard, and residue sentinels are present in the accepted test
  and final rereview.
- Credential truth is consistent: 16 unique candidates, six complete external
  URIs, zero working, stale `/opt/megacampus/.env.backup`, validated Supabase
  Root 2021 CA, and one remaining external input—a current owner-supplied or
  rotated Session pooler DSN that passes verify-full.
- Local Qdrant snapshots are correctly described as development-staging
  evidence only. External S3 is not a staging gate and remains the bounded
  production defer `.13.6`.
- No document claims a staging copy, migration, service change, Qdrant mutation,
  or secret activation has occurred. The credential artifact records a
  read-only audit and contains no raw candidate value.
- The source-recovery fresh/resume/rollback flags, common paths, UID/GID 1001,
  modes 0600/0700, same-device capability boundary, networkless executor, and
  unconditional copy verification agree with the wrapper and Compose. The
  blocking defect is their omission from the final ordered packet, not a
  mismatch inside the standalone command.

# Verification

- `validate_artifact.py`: all five changed stage artifacts passed.
- Prettier 3.7.4: all changed docs and artifacts passed.
- `git diff --check 7a808fc2..e033465e`: passed.
- `scripts/orchestration/run_process_verification.sh`: passed.
- Secret-pattern scan of the reviewed diff: zero raw PostgreSQL URIs, private
  keys, JWTs, GitHub/AWS keys, or credential assignments.
- Graphify: existing ignored report read and focused read-only query run; the
  result was orientation-only and no graph refresh occurred.
- Type-check/build/browser/E2E: not rerun because the reviewed range changes
  documentation and stage metadata only; accepted implementation evidence is
  cited above and no executable source changed in this range.

# Risks / Follow-ups

## Delivery / Defers

Only this review artifact was written. No Beads status, Graphify output,
credential, server file, database, source tree, service, container, Qdrant,
snapshot, S3 object, staging, or production state was changed. Q12 remains
NO-GO until the current Session pooler DSN exists, the truthful database-backup
gate passes, these documentation findings are corrected and re-reviewed, and
the complete authorized activation window can execute without partial
activation.
