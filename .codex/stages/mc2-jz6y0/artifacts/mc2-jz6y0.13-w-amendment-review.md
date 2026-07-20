---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-w-amendment-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: a64f048c
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only pre-merge review; single write is this artifact. No code/config modified, no server/db/docker command run.'
risk_level: low
verification:
  - 'Reviewed range a64f048c..241ee4e2 (4 commits) via git show/diff in worktree /home/me/code/mc2/.worktrees/q12-live-controller; tree clean at 241ee4e2.'
  - 'Frozen bytes at 241ee4e2: barrier 134255ce…, manifest aaec6fc2…, structural-catalog 0b8a943f… — all match.'
  - 'Read the full q12-writer-resume.py diff (window_is_cutover reader, the run_quiesce gate branch :340-363, the resume-side binding branch :1274-1290) and the Opened/require/exact/hex64 helpers (:78-214) they depend on.'
  - "Confirmed the cutover gate's four relaxations (state=maintenance_guarded, last_command=install, rollback_probes_verified=False, probe_receipt_sha256 is None) exactly match the frozen barrier install-receipt shape (q12-database-barrier.sh:304-305 defaults, :681-685 validator pairing, :2124 null emission)."
  - "Confirmed the recovery else-branches (gate + resume binding) are verbatim the pre-amendment conditions/messages, and the test fixture's new windowMode param defaults to the exact recovery shape so pre-existing callers are byte-for-byte unaffected."
  - 'Confirmed the frozen recovery-positive test (~line 5098) is outside every diff hunk (hunks at 1869-1929 and 5888+; zero hunks touch 5000-5199).'
  - 'Confirmed TDD split: RED fd7d2273 touches only the test file (191 insertions), GREEN 2e84c12b touches only q12-writer-resume.py (56+/14-); the 4/6-fail RED claim is statically consistent (cases 1/3/4/5 fail without the branch; cases 2/6 assert unchanged recovery rejection and pass).'
  - "Did NOT run the vitest suite or any server/db/docker command (constraint); relied on the round artifact's 155/155 + tsc=0 evidence plus the additive-only static verification above."
changed_files:
  - deploy/qdrant/q12-writer-resume.py
  - packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts
  - docs/superpowers/specs/2026-07-17-q12-quiesce-window-mode-note.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-w-amendment.md
  - deploy/qdrant/q12-database-barrier.sh
explicit_defers:
  - 'P3-1: the resume-time mode is re-read from the mutable marker at the second window_is_cutover() call site rather than derived from the immutable quiesce-manifest barrier.state; safe (any divergence fails closed, tested by case 6) but requires the Task-9 controller to keep the marker alive from quiesce through resume — consider deriving the resume-time mode from the recorded barrier.state to drop that coupling.'
  - 'P3-2: test-coverage nice-to-haves (non-blocking) — the reverse mode-flip (recovery-shaped manifest + marker present at resume) and present-but-invalid marker variants beyond wrong run_id (bad schema_version, bad mode value, extra key, non-0400 mode, symlink marker) are handled by the code but not each asserted; the wrong-run_id case already proves the hard-fail-not-fallback property.'
  - 'Cross-stream contract (informational): the Task-9 controller must write quiesce-window-mode.json before writers.quiesce AND keep it under the run root through the post-activate resume; the W side correctly fails closed if it is absent at resume.'
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1 — nothing blocks the merge.** Findings: two P3 (test-coverage /
robustness nice-to-haves) plus one informational cross-stream note. The
mode-scoped probe-binding removal is consciously adjudicated **ACCEPTED** (see
below). Frozen bytes are intact; the recovery flow is byte-identical to
pre-amendment; the marker reader is strict and fail-closed; the cutover gate is
exactly the four sanctioned relaxations.

This round implements precisely the surface my design review defined (P2-1 /
P2-1b): the `run_quiesce()` receipt gate and the resume-side quiesce-manifest
barrier binding both branch on a caller-declared run-root marker, with the cutover
branch accepting the join-era `maintenance_guarded`/`install` shape and the
recovery branch left untouched. The implementation is clean, minimal, and tested
on every probed failure path.

# Verification

## Frozen bytes and recovery-path byte-identity (not weakened)

- Barrier `134255ce…`, manifest `aaec6fc2…`, structural-catalog `0b8a943f…` all
  match; only `q12-writer-resume.py` (W-owned) and its test changed in code.
- The `run_quiesce()` `else` branch and the resume-side `else` branch are the
  pre-amendment conditions and error strings verbatim (`recovery_ready_guarded` /
  `prepare-recovery` / `rollback_probes_verified is True` / `hex64(probe_receipt_sha256)` /
  the `mode=="forward"` probe equality). The test fixture's new
  `windowMode = {}` parameter defaults to the exact recovery barrier shape and
  writes no marker, so every pre-existing caller is byte-for-byte unaffected; the
  frozen recovery-positive test (~5098) is outside all hunks. (Static-verified; I
  did not run the suite — relying on the round's 155/155 + tsc=0.)

## Marker reader — strict and fail-closed

`window_is_cutover()` returns `False` **only** on `not os.path.lexists(marker)`
(true absence ⇒ recovery). Any present marker is opened through `Opened(...,
0o400)`, which enforces canonical absolute path (`realpath==path`, rejecting a
symlink in **any** component), `S_ISREG and not S_ISLNK`, `O_NOFOLLOW`, uid/gid
1000, mode 0400, and a before/open/after identity match (dev/ino/uid/gid/mode/
size/nlink) — then `exact({schema_version,run_id,mode})` and
`require(schema=='megacampus.q12.quiesce-window-mode/v1' and run_id==run_id and
mode=='cutover')`. Every one of those raises `ResumeError`, so a
**present-but-invalid marker HARD-FAILS and never falls back to recovery**, and a
**symlink / dangling-symlink marker HARD-FAILS** (not treated as absent). The
`run_id` match is present and load-bearing (tested). Confirmed.

## Cutover gate — exactly the four sanctioned relaxations

The `if window_is_cutover()` gate accepts `state=='maintenance_guarded'`,
`last_command=='install'`, `rollback_probes_verified is False`,
`probe_receipt_sha256 is None`, and **retains** schema_version, `run_id==run_id`,
`zero_guard_residue is False`, and `hex64(expected_catalog_sha256)`; the shared
db-capability check (`S_ISREG`/not-symlink/uid/gid/0400) runs after the branch for
both modes. These four relaxations match the frozen barrier's install receipt
exactly (`rollback_probes_verified=false` `:304`, `probe_receipt_sha256=null`
`:2124`, pairing pinned at `:681-685`). No extra field is relaxed.

## Mode-scoped binding removal — ADJUDICATED ACCEPTED

The cutover forward-resume drops the original `quiesce.barrier.probe ==
barrier.probe` equality (`:1248`). This is sound and I found no missing substitute:

- At group-3 (`maintenance_guarded`) the quiesce manifest is written before any
  probe receipt exists, so there is structurally nothing to bind (`probe_receipt_sha256`
  is `null`).
- The resume-time rollback proof is still fully validated, independently, by the
  forward **cleanup receipt's own gate** (`last_command=='cleanup'` and
  `rollback_probes_verified is True` and `hex64(probe_receipt_sha256)`, originally
  `:1076`, plus the receipt↔file digest match `:1078`).
- The strongest cross-binding available in the cutover ordering —
  `expected_catalog_sha256` — **is** required in the cutover resume binding
  (`quiesce["barrier"]["expected_catalog_sha256"] == barrier["expected_catalog_sha256"]`,
  `:1278`), tying the quiesce and the resume-time cleanup receipt to the same run
  (`run_id`) and the same migration catalog. There is no other join-era artifact
  present at both quiesce and resume that could be bound and is omitted.

So the removal loses no obtainable guarantee; the forward resume remains gated on a
valid `guard_cleanup_complete` receipt for this run_id and catalog with rollback
proven. Accepted.

## Negatives — adequate

The six new cases cover: cutover accept (marker + maintenance_guarded receipt);
**forgotten marker in cutover** → recovery gate refuses (`/quiesce-ready/`);
**stray cutover marker over a recovery receipt** → named cutover error
(`/cutover-quiesce-ready/`); **wrong-run_id marker** → hard-fail
(`/window mode marker/`, proving invalid-marker does not fall back to recovery);
cutover resume accept; and **the mode flip** — a cutover-shaped quiesce manifest
with the marker **missing at resume** → `/writer quiesce barrier binding is
invalid/` with no resume state written. The two call sites run in **separate
script invocations** (quiesce vs resume), so a flip is a marker-state difference
between invocations, and the immutable quiesce-manifest `barrier.state` binding
catches it fail-closed.

## TDD integrity

RED `fd7d2273` = test file only (191 insertions); GREEN `2e84c12b` =
`q12-writer-resume.py` only (56+/14-). Against the unmodified script, cases 1/3/4/5
fail (no marker branch ⇒ the recovery gate/binding rejects the cutover shapes or
accepts the stray-marker recovery receipt), and cases 2/6 pass because they assert
the unchanged recovery rejection — exactly the artifact's "4 of 6 failed." No
existing test was weakened; the fixture change is a backward-compatible optional
parameter.

# Risks / Follow-ups

- **P3-1 (confidence low) — resume-time mode re-reads the mutable marker.**
  `window_is_cutover()` is evaluated again at resume from the marker file rather
  than derived from the immutable quiesce-manifest `barrier.state` (which already
  records `maintenance_guarded` vs `recovery_ready_guarded`). It is safe — any
  divergence fails closed and is tested (case 6) — but it couples correctness to
  the Task-9 controller keeping the marker alive through the post-activate resume.
  Consider deriving the resume-time mode from the recorded `barrier.state` to
  remove the marker-persistence coupling and the two-invocation divergence surface.

- **P3-2 (confidence low) — test-coverage nice-to-haves.** The reverse mode-flip
  (recovery-shaped manifest + a marker appearing at resume) and present-but-invalid
  marker variants beyond wrong `run_id` (bad `schema_version`, bad `mode`, extra
  key, non-0400 mode, symlink marker) are all handled by the code but not each
  asserted. The wrong-`run_id` case already proves the critical hard-fail-not-
  fallback property; adding a symlink/perms marker case would lock the `Opened`
  discipline for the marker specifically.

- **Informational — cross-stream contract.** The Task-9 controller must write
  `quiesce-window-mode.json` (schema + `run_id` + `mode:"cutover"`, 0400, uid/gid 1000) before invoking the frozen `writers.quiesce` command AND keep it under the
  run root through the post-activate resume; the W side correctly fails closed if
  it is absent at resume. This W amendment is inert until that controller round
  writes the marker.
