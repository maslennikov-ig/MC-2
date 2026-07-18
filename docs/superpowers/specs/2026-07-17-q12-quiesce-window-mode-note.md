# Design note: mode-aware quiesce precondition (OQ1 W-contract amendment mechanism)

Status: **AMENDMENT ROUND ACTIVE (2026-07-18).** The orchestrator confirmed the W-amendment
is consolidated into the live-controller stream (`codex/q12-live-controller`), superseding the
design §6/§7 "do not touch `q12-writer-resume.py` in this stream" boundary (which served
review isolation; the W stream has no active worker). This note is updated FIRST with the full
P2-1/P2-1b relaxation surface (design-review `mc2-jz6y0.13-live-controller-design-review.md`),
then TDD follows; the round carries its own commit series and its own independent review.
Companion to `2026-07-17-q12-live-controller-design.md` §4 OQ1 / §6.1.

## Ruling being implemented (recorded by the orchestrator)

Side A is product truth: the frozen D5J §5 chronology (`writers.quiesce` at group 3) + the
owner-approved packet order (pause C2→C9; backup is the rollback anchor and must follow the
pause). `q12-writer-resume.py` `run_quiesce()`'s barrier-receipt gate (`:325-335`,
`state=recovery_ready_guarded`/`last_command=prepare-recovery`) is a stale D4-recovery-era
precondition. The amendment must make the precondition **mode-aware, not relaxed**.

The full gate is four coupled fields (verified against the frozen barrier bytes,
`q12-database-barrier.sh`): at the join-era pre-backup edge the only barrier that has run is
`install`, whose receipt is `state=maintenance_guarded`, `last_command=install`,
`rollback_probes_verified=false` (`:304`), `probe_receipt_sha256=null` (`:2124`, the barrier's
own validator pins the false/null pairing at `:681-685`). So the cutover gate must relax **all
four** — not only `state`/`last_command`:

- **cutover mode** (join-era window, `run_quiesce` `q12-writer-resume.py:328-333`): accept
  `state == "maintenance_guarded"`, `last_command == "install"`,
  `rollback_probes_verified is False`, and `probe_receipt_sha256 is None` — while **retaining**
  `zero_guard_residue is False`, `run_id == run_id`, `hex64(expected_catalog_sha256)`, and the
  db-capability-present check (`:336-345`), all unchanged. Relaxing `rollback_probes_verified`
  is sound in the join order: rollback probes are proven later at `prepare-recovery` (group 10),
  and the group-4 `pg.backup` snapshot is the rollback anchor.
- **recovery mode** (standalone `.13.4.1` source-recovery): keep exactly
  `state=recovery_ready_guarded`, `last_command=prepare-recovery`,
  `rollback_probes_verified=True`, `hex64(probe_receipt_sha256)` — the current gate, byte-for-byte.

No silent either-or: unconditionally accepting both would weaken both flows. The pinned W
test (`qdrant-source-recovery-runtime.test.ts`, recovery case at `:808-821,:5098`) is
**kept byte-untouched**, and a cutover-mode case is **added**.

## The mechanism constraint (the load-bearing finding)

The obvious "argv flag on the quiesce path" **cannot** be a new element of the
`writers.quiesce` **manifest** command. That command's argv and env are part of the frozen
`q12-command-manifest.json` (`aaec6fc2…`): `writers.quiesce` resolves to
`source-recovery-run.sh --operation quiesce-writers-only` with the frozen env
(`PATH/LC_ALL/LANG/HOME` + `Q12_EXTERNAL_QUIESCE_LEASE_FD=9`), and the journal binds its
`command_sha256` over exactly those canonical argv bytes (`resolved_command`,
`load_manifest` §2). Adding a `--window-mode` argv element **or** a new env key would:

- change the frozen manifest bytes → **hard STOP** (the standing rule); and
- break byte-parity: the executed child would differ from the journaled/bound command.

So the mode **must enter out-of-band** — declared by the caller, not carried on the frozen
manifest command.

## Recommended mechanism: a caller-declared run-root mode marker

**Who declares it:** the **live controller** (Task-9). It is the only actor that knows the
run is a join-era cutover. Before it invokes the `writers.quiesce` manifest command, the
controller writes a small, uid/gid-1000, mode-`0400` marker under the run root, e.g.
`/opt/megacampus/backups/q12/<run-id>/quiesce-window-mode.json`:

```json
{
  "schema_version": "megacampus.q12.quiesce-window-mode/v1",
  "run_id": "<run-id>",
  "mode": "cutover"
}
```

**How the W quiesce controller uses it (the amendment, in the W stream):**
`q12-writer-resume.py` `run_quiesce()` reads this marker from the run root it is already
given, with the same path/owner/mode/TOCTOU discipline it already applies to its other
inputs, then branches the receipt-state gate:

- marker present, `mode == "cutover"`, `run_id` matches → require the four-field cutover gate
  above (`maintenance_guarded`/`install`/`rollback_probes_verified is False`/
  `probe_receipt_sha256 is None`), retaining `zero_guard_residue is False` + the
  db-capability-present check;
- **marker absent** → **recovery mode** = the exact current gate
  (`recovery_ready_guarded`/`prepare-recovery`/`rollback_probes_verified is True`/
  `hex64(probe_receipt_sha256)`), unchanged.

Absence ⇒ recovery mode is the key backward-compatibility property: the standalone recovery
flow (which never runs the live controller and never writes the marker) keeps its exact
current behavior, so its pinned frozen test stays green unmodified. The new cutover-mode
test writes the marker and feeds `maintenance_guarded`/`install`.

## The second coupling: cutover-mode quiesce-manifest barrier shape + forward-resume binding (P2-1b)

The gate is only half the surface. The `run_quiesce` writer produces a `writer-quiesce-<run-id>.json`
manifest whose `barrier` sub-object is **copied verbatim from the receipt it validated**
(`q12-writer-resume.py:800-805`: `state`, `zero_guard_residue`, `expected_catalog_sha256`,
`probe_receipt_sha256`). So a cutover-mode quiesce necessarily records
`barrier.state = "maintenance_guarded"`, `barrier.probe_receipt_sha256 = null` — that shape is
a **consequence** of relaxing the gate, not extra code.

But `writers.resume.forward` independently re-validates that recorded barrier binding at
`q12-writer-resume.py:1245-1248`, and today it hard-requires the recovery shape:

- `:1246` — `quiesce["barrier"]["state"] == "recovery_ready_guarded"` **and**
  `hex64(quiesce["barrier"]["probe_receipt_sha256"])`;
- `:1248` (forward only) — `quiesce["barrier"]["probe_receipt_sha256"] == barrier["probe_receipt_sha256"]`,
  where `barrier` at resume time is the v2 `guard_cleanup_complete` cleanup receipt (forward
  cleanup carries a real `hex64` probe receipt, `:1076`).

A cutover-mode quiesce records `state=maintenance_guarded` + `probe_receipt_sha256=null`, so
BOTH `:1246` (`recovery_ready_guarded`/`hex64`) and `:1248` (`null == hex64`) fail closed —
`writers.resume.forward` would be unreachable in the join flow **even after** the OQ3 cleanup
receipt. The amendment therefore makes `:1245-1248` mode-aware too, reading the **same run-root
marker at resume time** (same owner/mode/`NOFOLLOW`/`run_id`-match discipline):

- **cutover mode** at resume: require `quiesce["barrier"]["state"] == "maintenance_guarded"`,
  `zero_guard_residue is False`, `expected_catalog_sha256 == barrier["expected_catalog_sha256"]`,
  and `probe_receipt_sha256 is None`; and for `forward`, **drop** the
  `quiesce.barrier.probe == cleanup.barrier.probe` equality (it cannot hold — the quiesce
  manifest has `null`). Rollback-anchor integrity for the join flow is instead bound by the
  cleanup receipt's OWN probe validation, which already stands independently: the forward
  cleanup receipt requires `last_command == "cleanup"`, `rollback_probes_verified is True`,
  `hex64(probe_receipt_sha256)` (`:1076`) and matches it to the probe-receipt file digest
  (`:1078`). So the probe receipt that exists by resume time is still fully validated — just
  not tied to a value the group-3 cutover quiesce could not have carried.
- **recovery mode** at resume (marker absent): the current `:1246`/`:1248` checks, byte-for-byte.

Net relaxation surface: `run_quiesce` gate (4 fields) + the resume-side quiesce-manifest
barrier binding (`:1245-1248`) with a resume-time marker read + the documented cutover-mode
quiesce-manifest barrier shape. None touches a frozen byte.

**Why not an env/argv variant on `source-recovery-run.sh`:** even though
`source-recovery-run.sh` is W-owned and editable in the amendment round, the value that
reaches it still originates from the frozen manifest command the controller must run
byte-exact. A run-root marker is the only channel that is (a) caller-declared, (b) explicit
(a file, never inferred from the receipt), (c) mode-aware, and (d) free of any frozen-byte
or child-env change.

## Boundaries of the amendment round

- Write zone (this round, own commit series + own independent review):
  `q12-writer-resume.py` — the `run_quiesce` gate (4-field cutover branch + marker read) AND
  the resume-side quiesce-manifest barrier binding (`:1245-1248`, mode-aware + resume-time
  marker read) — and its pinned test (`qdrant-source-recovery-runtime.test.ts`, cutover-mode
  cases added; the recovery case stays **byte-untouched**).
- **Untouched:** the frozen `q12-command-manifest.json` (`aaec6fc2…`), the `writers.quiesce`
  argv/env, `q12-database-barrier.sh` (`134255ce…`), `q12-structural-catalog.sql`
  (`0b8a943f…`).
  _(Historical, 2026-07-18: the barrier sha `134255ce…` here was superseded by `3673ee49…`
  per the ratified barrier-fix round; this W amendment did not touch the barrier — the
  succession is from the separate PG17 barrier-fix round.)_
- The live controller's side (writing the marker before it invokes `writers.quiesce`) is a
  separate Task-9 controller round; it depends on this W amendment landing first for the
  cutover window to open, but the marker-writing itself is inert until the W side reads it.

## Reviewer endorsement recorded

The design review (`mc2-jz6y0.13-live-controller-design-review.md`, "Scope addition") **endorsed**
the out-of-band run-root marker channel over both a frozen-manifest argv flag (impossible — it
would change `aaec6fc2…` and break executed-vs-journaled byte parity) and journal inference
(implicit; couples the security gate to the journal parser). The dedicated
`quiesce-window-mode.json` (strict schema + `mode` enum + `run_id` match + `0400` + uid/gid
1000 + `S_ISREG`/`O_NOFOLLOW`, written once) is an explicit, small, strictly-validatable
declaration, and `run_quiesce` already holds `run_root`/`run_id` and applies exactly this
owner/mode/symlink discipline to its other inputs (db-capability `:336-345`). Fail-closed
behavior verified on every probed path: forgotten marker in a cutover run ⇒ recovery gate ⇒
refuses the `maintenance_guarded`/`install` receipt; a stray/stale `cutover` marker over a
recovery-state receipt fails the `state==maintenance_guarded` check; a wrong `run_id` on the
marker fails the required match; cross-run reuse is blocked by per-run-id roots + the `run_id`
match. The cutover-mode test writes the marker and feeds `maintenance_guarded`/`install`; the
negatives are missing-marker (fails closed to recovery), stray-marker + wrong receipt state,
and wrong `run_id`.
