---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-barrier-fix-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: 241ee4e2
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only pre-merge review of a frozen-file edit; single write is this artifact. No code/config modified, no server/db/docker command run.'
risk_level: medium
verification:
  - 'Reviewed range 241ee4e2..3596aa72 via git show/diff in worktree /home/me/code/mc2/.worktrees/q12-live-controller.'
  - 'Frozen bytes at 3596aa72: manifest aaec6fc2… and structural-catalog 0b8a943f… UNTOUCHED; barrier changed 134255ce… -> 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9 (matches the ratified new sha).'
  - "The barrier diff is exactly seven edits: fd :361 (cat <& -> /proc/self/fd), typcategory<>'A' at the four ACL sites (:1250,:1358,:1455,:1467), and the two mirrored dialect guards (:1303,:1613) — plus one explanatory comment; no other barrier line changed."
  - 'FD audit independently reproduced: the only `cat <&` consuming reads are :296 (structural fd 15) and :361 (catalog fd 13, the bug); fd 13 is re-read by number in the install NODE_RUNNER (`fs.readFileSync(Number(catalogFd))`), so the /proc/self/fd fix restores the offset-0 read; fd 15 is consumed once at :296 and never re-read by number (the install runner destructures 11 positional args so the trailing fd-15 arg is ignored; the terminal runner reads the separate dup fd 19); all other catalog reads use /proc/self/fd fresh opens.'
  - "ACL fix verified: type-inventory list checks (:1252,:1338,:1485,:1843) still list the `_`-prefixed array types WITHOUT the typcategory filter, so arrays remain required-present; only the aclexplode owner-only scans + the REVOKE loop exclude typcategory='A'."
  - "Dialect fix verified against the function's own pre-existing `CASE WHEN jsonb_typeof(...)='array' THEN ... ELSE '[]' END` setconfig idiom; both mirror sites carry the identical guard."
  - 'TDD: ACL RED 270f62a46 -> hard-stop record 6e86d5387 -> ACL GREEN c4c05d762; fd+dialect RED aee28c6ec (genuinely RED with ACL already fixed) -> GREEN f1c00c372; acceptance asserts the full maintenance_guarded shape (seed 47/22/5/8/0, cron 8->0, read-only on, receipt state, 4 tables/10 functions/1 event trigger).'
  - 'Stale-pin sweep: the only non-doc reference to the OLD sha 134255ce is q12-activation-truth.test.ts:36 `W_TUPLE.activation_barrier_sha256`, which is UNUSED in the suite (W_TUPLE is consumed only for managed_inventory/lock_catalog/lock_order shas at :323/:427/:430/:1164…) and is not verified by the probe, so the sha change does NOT break CI.'
  - 'Range scope: 241ee4e2..3596aa72 also contains q12-lifecycle-core.py (+46, commit 292d51770, R4 Sub-round A execution seam) and R4 Sub-round A/B commits — targeted scan shows the lifecycle-core change does not touch validate_*/assemble_*/command_sha256/load_manifest/resolved_command or the frozen contract.'
  - "Did NOT run the vitest suite or any server/db/docker command (constraint); relied on the round's re-run 1-passed acceptance evidence plus the static verification above."
changed_files:
  - deploy/qdrant/q12-database-barrier.sh
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-barrier-cutover.test.ts
  - packages/course-gen-platform/tests/fixtures/q12-live-real-barrier-cutover-runner.py
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-barrier-pg17-acl-fix.md
  - packages/course-gen-platform/tests/unit/ops/q12-activation-truth.test.ts
explicit_defers:
  - 'P2-1: range/scope inaccuracy — the brief says only q12-database-barrier.sh changed among deployed files, but the range also merges q12-lifecycle-core.py (R4 Sub-round A execution seam) + R4 Sub-round A/B commits; low-risk on scan (no frozen/validator touch) but confirm those were reviewed under their own rounds or narrow the merge to the barrier-fix commits.'
  - 'P2-2: cascade incomplete / window-not-ready — dependents still pin the OLD barrier sha (W_TUPLE.activation_barrier_sha256 in q12-activation-truth.test.ts:36, the W-tuple artifact field-4, the frozen-trio contract, repro fields 5-9); CI stays green (field unused) but the window MUST NOT open until field-4 is amended to 3673ee49, the frozen-trio contract updated, fields 5-9 re-run, and the deployed barrier reinstalled + byte-verified.'
  - 'P3-1: pre-existing 5-vs-10 q12_guard function-allowlist drift disclosed in the acceptance harness header — not introduced here; reconcile before the downstream validator that carries the 5-function allowlist runs in the window.'
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1 — the barrier fix is sound and CI-safe, so it is mergeable.**
Findings: two P2 (scope accuracy; cascade/window-readiness) and one P3
(pre-existing disclosed drift). All three are follow-ups, not merge blockers.

The frozen `q12-database-barrier.sh` edit is exactly the seven ratified changes,
minimal and idiomatic, with the frozen manifest (`aaec6fc2…`) and structural
catalog (`0b8a943f…`) untouched. I independently reproduced the FD audit, verified
the ACL exclusion is sound at all four sites (and that the type inventory still
requires the arrays), and adjudicated the two dialect predicate edits as correct.
No existing test breaks: the one stale `134255ce…` pin left in the tree is an
unused W-tuple fixture field.

The two P2s are about **completing the cascade before the window opens**, not about
the fix itself: the new barrier sha `3673ee49…` is not yet propagated to the
W-tuple field-4 / frozen-trio contract / repro fields 5-9 / the deployed server,
and the review range quietly also merges an R4 lifecycle-core change the brief did
not list. Both are surfaced for the lead.

# Verification

## Frozen surface and diff hygiene

- Manifest `aaec6fc2…` and structural catalog `0b8a943f…` are byte-unchanged; the
  barrier is the only frozen file edited, ratified, new sha `3673ee49…` confirmed.
- The barrier diff is **exactly seven edits** — one fd read, four `typcategory<>'A'`
  ACL-scan filters, two mirrored `jsonb_typeof`-guarded dialect predicates — plus
  one explanatory comment. No other barrier line changed; no validation weakened
  beyond the two adjudicated dialect predicates.

## FD fix + audit (independently reproduced)

The install `NODE_RUNNER` opens the catalog into shared fd 13 once, then re-reads it
by number (`const expected=fs.readFileSync(Number(catalogFd),…)`). The old
`expected_json="$(cat <&"$catalog_fd")"` at :361 consumed fd 13's shared OFD
offset to EOF, so the Node re-read landed empty → tx1 JSON error. The fix
(`cat "/proc/self/fd/$catalog_fd"`) is a fresh independent open at offset 0 that
does not disturb fd 13, matching the barrier's other six catalog reads. Auditing
every `cat <&` and every `/proc/self/fd` read: the **only** consuming reads are
:296 (structural fd 15) and :361 (catalog fd 13). fd 15 is safe — it is consumed
once at :296 and never re-read by number (the install runner destructures 11
positional args, so the trailing fd-15 argument is ignored; the terminal runner
reads the **separate** dup fd 19). So fd 13 was the sole double-consumption, and it
is fixed. This matches the artifact's FD table exactly.

## ACL fix (`typcategory <> 'A'`, four sites)

PostgreSQL auto-creates an array type (`typcategory='A'`, e.g. `_active_run`) for
every composite rowtype; it categorically refuses `GRANT/REVOKE` on array types,
and an unset array `typacl` is NULL → `acldefault('T',owner)` grants PUBLIC=USAGE,
which false-positives the owner-only `EXISTS` scan. Excluding `typcategory='A'` is
sound: PG defines an array type's effective privileges as **following its element
type**, so an owner-only composite type guarantees its array type carries no
independently-grantable ACL — no guarantee is lost. Critically, the four excluded
sites are the `aclexplode` owner-only scans and the `REVOKE` loop only; the
**type-inventory** list checks (:1252,:1338,:1485,:1843) still list the
`_`-prefixed arrays **without** the filter, so the arrays remain required-present
and the inventory guard is not weakened.

## Dialect predicates (:1303 / :1613) — ADJUDICATED SOUND

The original `(saved->'database_settings' - 'setconfig')` never executed correctly:
it carried both an operator-precedence issue (`->` vs jsonb `-`) and a scalar-abort
(jsonb `-` refuses a scalar/`null` left operand), so the barrier aborted before
reaching this comparison. The guard therefore **defines** the null-case semantics:
`(CASE WHEN jsonb_typeof(x)='object' THEN x ELSE '{}' END) - 'setconfig'`. This is
the correct definition — a genuine difference in the non-`setconfig` settings still
yields `IS DISTINCT FROM` → drift → fail; **both-empty→match** only passes when
both sides carry no non-`setconfig` settings, which is the legitimate no-settings
state; and `setconfig` and `default_transaction_read_only` are handled by separate,
unchanged predicates. No tamper that should fail now passes: saved-null vs
current-object (or the reverse) with any real non-`setconfig` setting → mismatch →
fail. The fix mirrors the function's own pre-existing
`CASE WHEN jsonb_typeof(...)='array' THEN ... ELSE '[]' END` `setconfig` idiom, and
both mirror sites carry the identical guard.

## TDD integrity and acceptance shape

ACL: RED `270f62a46` → ratified hard-stop record `6e86d5387` → GREEN `c4c05d762`.
fd+dialect: RED `aee28c6ec` (genuinely RED with the ACL already fixed → install
still aborts on the fd double-read) → GREEN `f1c00c372`. The fd defect also has an
isolated postgres-free bash+node repro in the artifact. The end-to-end acceptance
asserts the full `maintenance_guarded` shape: seed inventory `{47,22,5,8,0}`,
baseline cron `8/8`, `barrier_rc=0`, `receipt_state=maintenance_guarded` with the
exact receipt object and hex64 `expected_catalog_sha256`, post-install cron active
`0`, read-only `on`, q12_guard schema present, **4 tables / 10 functions / 1 event
trigger**. No existing test was weakened (the fixture/runner changes are additive
to the harness).

## Stale-pin sweep (no CI break)

The only non-doc reference to the old sha `134255ce…` is
`q12-activation-truth.test.ts:36 W_TUPLE.activation_barrier_sha256`. `W_TUPLE` is
consumed only for `managed_inventory_sha256` / `activation_lock_catalog_sha256` /
`activation_lock_order_sha256` (:323,:427,:430,:1164…); `activation_barrier_sha256`
is **defined but never used**, and the activation-truth probe does not hash the
barrier file, so the barrier sha change does not fail this suite. (It does mean the
W-tuple's barrier-sha binding has no automated guard — see P2-2.)

# Risks / Follow-ups

- **P2-1 (confidence high) — review-range scope inaccuracy.** The brief's "only
  q12-database-barrier.sh changed among deployed files" is not true for
  241ee4e2..3596aa72: it also merges `q12-lifecycle-core.py` (+46, `292d51770`,
  R4 Sub-round A injectable ordinary-execution seam) and the R4 Sub-round A/B
  commits. A targeted scan shows the lifecycle-core change is a bounded,
  parity-neutral execution seam that does not touch `validate_*`/`assemble_*`/
  `command_sha256`/`load_manifest`/`resolved_command` or the frozen contract, so
  it is low-risk — but it is outside this review's barrier-fix scope. Next action:
  confirm the R4 Sub-round A/B lifecycle-core work was reviewed under its own
  rounds, or narrow the merge to the barrier-fix commits.

- **P2-2 (confidence high) — cascade incomplete; window not ready.** The barrier
  sha changed (`134255ce…` → `3673ee49…`) but every dependent still pins the old
  value: `W_TUPLE.activation_barrier_sha256` (unused in the suite, so CI is green),
  the W-tuple artifact field-4, the frozen-trio contract, and the repro-tool
  outputs (fields 5-9). Merging is CI-safe, but the window MUST NOT open until
  field-4 gets its Layer-1 amendment to `3673ee49…`, the frozen-trio contract is
  updated, fields 5-9 are re-run, and the deployed barrier is reinstalled and
  byte-verified. The artifact tracks these. Additionally, consider adding an
  automated guard binding `activation_barrier_sha256` to the deployed barrier bytes
  (today the field is an unexercised fixture constant), so a future barrier/tuple
  drift is caught in CI.

- **P3-1 (confidence medium) — pre-existing 5-vs-10 function-allowlist drift.** The
  acceptance harness header discloses a known, separate, pre-existing 5-vs-10 drift
  between a hardcoded q12_guard function allowlist and the barrier's real
  10-function set. Not introduced by this round (the acceptance confirms the barrier
  installs 10 functions), but reconcile before the downstream validator carrying
  the 5-function allowlist runs in the window.
