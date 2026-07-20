---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-r8i-round-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: b4d2ae1ee
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only pre-merge review; single write is this artifact. No code/config modified, no server/db/docker command run.'
risk_level: low
verification:
  - 'Reviewed range b4d2ae1ee..8e8bd08f5 (9 commits, 3 TDD triples) via git show/diff; verified against the bytes.'
  - "Whole-range: frozen trio byte-identical at 8e8bd08f5 (aaec6fc2/3673ee49/0b8a943f); W-owned files (q12-writer-resume.py, source-recovery-run.sh) untouched; only q12-lifecycle-core.py changed among deployed files (+461/-166); composer body run_joined_composer NOT touched (no diff hunk); OPERATIONS is still exactly the 5 barrier ops (cleanup NEVER added), CLEANUP_COMMAND_ID='barrier.cleanup' is a separate constant OUTSIDE OPERATIONS/COMMANDS/MANIFEST_COMMAND_IDS; no witness-file mechanism reintroduced."
  - 'R8-I-C: q12-lifecycle-core.py is BYTE-UNTOUCHED across c8f1ad3d9..8e8bd08f5 (empty core diff) — R8-I-C is tests + the §6b.6 design amendment only.'
  - "R8-I-A three §6b.4 extensions, all keyed off the non-manifest CLEANUP_COMMAND_ID: (a) grammar ADDITIVE elif (no existing branch removed/weakened — 0 removed grammar-dispatch lines) mirroring the frozen barrier tail grammar (intent→cap0×64/none, issued/reacquired/claimed/completed→cap≠0/none, accepted→database_barrier_receipt+hex64); (b) capability class cleanup_capability keyed off barrier.cleanup with key 'cleanup:{epoch}', additive (the 'unknown capability command' raise still fires for genuinely-unknown ids); (c) the direct-Engine.append callers publish_cleanup_capability/move_cleanup_capability/append_cleanup_row (a new caller, never through resolved_command)."
  - 'R8-I-A cleanup segment (orchestrate_post_activate_cleanup): journals the exact 5-row guard_cleanup_complete/barrier.cleanup lifecycle; the real frozen barrier child runs at the claimed boundary via the pre-existing, token-guarded MC2_Q12_BARRIER_TEST_MODE (q12-database-barrier.sh:91-92, TEST_MODE_TOKEN :16; trio sha 3673ee49 unchanged); the controller owns the JOURNAL authority + binds the v2-receipt digest in the accepted row, while the executor seam owns the file artifacts (v1 archive / v2 10-key promotion / db-capability deletion) — fixture-owned in tests, real docker/PG17 in R8-B (gated: production fails closed without the hooks). Resume path is idempotent (skips durable rows, reuses on-disk v2 on a completed re-drive).'
  - 'R8-I-A test rescope is the RATIFIED §6b.3 strengthening, not a weakening: the removed toBe(76)/full-parity + R5-E output.postActivate receipt assertions are replaced by toBe(FORWARD_PREFIX+5)=81, a 76-row PREFIX parity (slice(0,76).map(withParityExclusions)), an explicit 5-cleanup-row phase/outcome/command_id assertion, and the journaled 10-key v2 receipt. withParityExclusions (the prefix helper) is unchanged; the cleanup-row comparison additionally drops command_sha256 (barrier-child sandbox argv digest, still grammar-bound ≠ZERO) + accepted_object_sha256 (per-run v2-receipt digest, still grammar-bound hex64), mirroring the existing FWM accepted-row exclusion — scoped to the cleanup rows, not a parity-prefix broadening.'
  - "R8-I-B: _RECOVER_RESUME_FROM is the 8-head Option-A table matching §6b.2 (install→writers.quiesce, verify-after-base→migration.observability.apply, verify-after-observability→migrations_applied, prepare-recovery→source.forward, activate→POST_ACTIVATE_SENTINEL, deploy.prepare→final-writer-manifest, writers.resume.forward→deploy.commit, barrier.cleanup→converge idempotently); the R5-D2 supervisor pointer is appended ONLY for a mid-lifecycle barrier head (startswith 'barrier.' AND outcome≠'completed' AND op∈OPERATIONS), never for completed/cleanup heads — so the #10 false composition is now true by construction; the refusal raises BEFORE resume(), leaving the journal byte-unchanged. drive_forward_tail→drive_forward_sequence is the shared driver; run_live's 76-row forward journal is byte-identical (prefix parity retained)."
  - 'R8-I-B genesis re-pin: validate_stable_binding_walk has 0 diff mentions — its body (the :383-396 per-transition stepping checks AND the :400-405 first/last anchor) is BYTE-UNTOUCHED; the re-pin only changes the request-global VALUE fed to the walk from the durable tail (entries[-1]) to the GENESIS row (entries[0], a legal request-global value that equals entries[0] of both the interrupted and the completed journal). ADVERSARIAL: the re-pin CANNOT mask a tampered mid-journal resource value — the first/last anchor is a separate check from the (unchanged) stepping, which binds every transition to the pg.backup/intent and deploy.prepare/completed witnesses regardless of the anchor.'
  - "R8-I-C probe oracle is NON-CIRCULAR and matches the ratified derived-journal oracle: the expected journal is DERIVED from the INDEPENDENT uninterrupted twin + pinned recovery-shape CONSTANTS (never from the composed run) — insert recovery_reacquired/cutover-recovery-1 + a SECOND capability_claimed/cutover-recovery-1 after the pre-crash claim, step the completed row's lease_epoch to cutover-recovery-1 (consecutive per frozen :514-518); composed == twin+2 rows asserted full-row-byte under the EXISTING exclusions only; lease_epoch is ASSERTED (preCrashClaim=='cutover', inserted=='cutover-recovery-1'), not excluded. §6b.6 records defects #11 (two-process lease reacquisition) and #12 (in-process retained_chain:2258-2298 single-claim) with provenance, matching the ratified oracle."
  - 'Did NOT run the vitest suite or any server/db/docker command (constraint); relied on the reported suite 23/23 + cross-fixture 460/460 + tsc 0, plus the static verification above.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - docs/superpowers/specs/2026-07-17-q12-live-controller-design.md
explicit_defers:
  - "P3-1 (confidence medium, low severity): I could not substantiate a 'derive_run_id UUIDv4 reshape' in this range's controller diff — no derive_run_id symbol exists and there is no run_id/uuid reshaping hunk; derive_joined_fixture_values(run_id,…) (:708, composer-shared) is unchanged in signature. The frozen barrier enforces UUIDv4 at :72 (a non-v4 run_id fails closed at the real child), so the requirement is backstopped; if the reshape is a test-fixture v4 run_id or landed in an earlier round, it is out of this range's controller scope — confirm the intended symbol."
  - 'Informational: the v2-receipt FILE-WRITE (exact 10-key shape) is delegated to the executor seam (fixture-owned in R8-I-A tests; real docker/PG17 in R8-B), with the controller owning the journal + accepted-row digest binding — the correct deferral pattern (mirrors the plan-mode executor hooks), fixture-verified against the W gate now and gated fail-closed (production without the hooks refuses at the pre-flight) until R8-B wires the real path.'
  - 'Informational: the post-activate cleanup/resume remains executor-seam-gated; R8-B wires the real docker/PG17 hooks. Whole-window crash-during-cleanup idempotence is covered by the recovery-epoch re-drive (head 8 converges), and a completed run recovered again is a no-op (head 5/8 accepted).'
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1 — mergeable.** The three sub-rounds faithfully implement the §6b
amendment I PASSed at 94ede2145, against the bytes: the journaled `barrier.cleanup`
segment (R8-I-A), the generalized 8-head Option-A recover dispatch (R8-I-B), and the
non-circular derived-journal probe oracle + the §6b.6 #11/#12 record (R8-I-C).
Findings: one low P3 (an unsubstantiated `derive_run_id` reshape claim) and two
informational deferral notes — none gates the merge.

The load-bearing safety invariants all hold: the frozen trio and W-owned files are
untouched; `cleanup` is NEVER added to `OPERATIONS`/`COMMANDS`/`MANIFEST_COMMAND_IDS`
(the frozen-manifest hard stop is respected); the composer body is byte-unchanged;
`validate_stable_binding_walk` is byte-untouched (the genesis re-pin cannot mask a
tampered mid-journal value); the three §6b.4 extensions are additive and keyed off the
non-manifest `CLEANUP_COMMAND_ID`; and the R8-I-A test rescope is the ratified §6b.3
strengthening with no assertion silently weakened.

# Verification

## Whole-range invariants

Frozen trio byte-identical (`aaec6fc2`/`3673ee49`/`0b8a943f`); W-owned files untouched;
only `q12-lifecycle-core.py` changed among deployed files; `run_joined_composer` body
not in any hunk; `OPERATIONS` still exactly the 5 barrier ops with `CLEANUP_COMMAND_ID`
a separate constant outside the manifest coupling; no witness-file mechanism
reintroduced. R8-I-C leaves the controller byte-untouched (empty `c8f1ad3d9..8e8bd08f5`
core diff).

## R8-I-A — journaled cleanup segment

The three §6b.4 extensions land exactly and additively off `CLEANUP_COMMAND_ID`: (a) a
grammar `elif` mirroring the frozen barrier tail grammar with no existing branch
removed; (b) a `cleanup_capability` class with a `cleanup:{epoch}` key, the
`unknown capability command` raise preserved for real unknowns; (c) the direct
`Engine.append` cleanup callers (`publish_cleanup_capability`/`move_cleanup_capability`/
`append_cleanup_row`), never through `resolved_command`. `orchestrate_post_activate_cleanup`
journals the exact 5-row lifecycle, runs the real frozen barrier child at the
`capability_claimed` boundary via the **pre-existing token-guarded** `MC2_Q12_BARRIER_TEST_MODE`
(barrier `:91-92`, token `:16`; trio sha unchanged), and binds the v2-receipt digest in
the `accepted` row. The controller owns the journal; the executor seam owns the file
artifacts (v1 archive / v2 10-key promotion / capability deletion) — fixture in tests,
real docker/PG17 in R8-B, fail-closed in production until then. The resume path is
idempotent. The test rescope is the ratified §6b.3 strengthening: `toBe(76)`→
`toBe(FORWARD_PREFIX+5)`, a 76-row **prefix** parity retained, the 5 cleanup rows
asserted, the journaled 10-key v2 receipt asserted; `withParityExclusions` is unchanged
and the cleanup-row-only extra exclusions (`command_sha256` sandbox digest,
`accepted_object_sha256` per-run receipt digest — both still grammar-bound) mirror the
existing FWM accepted-row shape.

## R8-I-B — generalized Option-A dispatch

`_RECOVER_RESUME_FROM` is the 8-head table matching §6b.2 exactly (the 5 barrier
completed heads → the next group; C7 → FWM; resume-accepted → `deploy.commit`;
`barrier.cleanup` → idempotent convergence). The R5-D2 supervisor pointer is appended
**only** for a mid-lifecycle barrier head, so the #10 false-composition is true by
construction, and the fail-closed refusal raises before `resume()` (journal
byte-unchanged). The `drive_forward_tail`→`drive_forward_sequence` refactor keeps
run_live's forward journal byte-identical (prefix parity retained). **Genesis re-pin
(adversarial):** `validate_stable_binding_walk` has zero diff mentions — its stepping
body and first/last anchor are byte-untouched; the re-pin only changes the request
value to `entries[0]` (a legal request-global value), and the unchanged per-transition
stepping still binds every resource transition to its witnesses, so a tampered
mid-journal value cannot be masked.

## R8-I-C — derived-journal oracle

The probe derives the expected journal from the independent uninterrupted twin + pinned
recovery-shape constants (never from the composed run): insert
`recovery_reacquired`/`cutover-recovery-1` + a second `capability_claimed`/`cutover-recovery-1`
after the pre-crash claim, step the `completed` row's `lease_epoch` to
`cutover-recovery-1` (consecutive per frozen `:514-518`); `composed == twin+2 rows`
under the existing exclusions only, with `lease_epoch` asserted (not excluded). §6b.6
records defects #11 (two-process lease reacquisition) and #12 (in-process single-claim)
with provenance, matching the ratified oracle. The controller is untouched.

# Risks / Follow-ups

- **P3-1 (confidence medium, low severity) — `derive_run_id` claim unsubstantiated.**
  No `derive_run_id` symbol or run_id/uuid reshaping hunk exists in this range's
  controller diff; `derive_joined_fixture_values(run_id, …)` (`:708`, composer-shared)
  is unchanged in signature. The UUIDv4 requirement is backstopped by the frozen barrier
  (`:72`, which fails a non-v4 run_id at the real child). If the reshape is a
  test-fixture v4 run_id or landed earlier, it is out of this range's controller scope —
  confirm the intended symbol.

- **Informational — v2 receipt seam-delegation.** The exact 10-key v2-receipt
  file-write is the executor seam's (fixture in R8-I-A tests, real docker/PG17 in R8-B);
  the controller owns the journal + accepted-row digest binding. This is the correct,
  fail-closed-gated deferral pattern (production refuses at the pre-flight until R8-B
  wires the hooks) and the 10-key W-gate shape is fixture-verified now.

- **Informational — crash-during-cleanup coverage.** Head 8 (`barrier.cleanup/*`)
  converges the segment idempotently via the recovery epochs, and a completed run
  recovered again is a no-op (`accepted` head), so the R5 crash-during-post-activate gap
  is now addressed within R8-I's scope; the real-execution smoke remains R8-B.
