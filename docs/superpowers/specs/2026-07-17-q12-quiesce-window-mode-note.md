# Design note: mode-aware quiesce precondition (OQ1 W-contract amendment mechanism)

Status: **NOTE ONLY — the W-contract amendment round is NOT started; awaiting the
orchestrator's go + design-review outcome.** Companion to
`2026-07-17-q12-live-controller-design.md` §4 OQ1 / §6.1.

## Ruling being implemented (recorded by the orchestrator)

Side A is product truth: the frozen D5J §5 chronology (`writers.quiesce` at group 3) + the
owner-approved packet order (pause C2→C9; backup is the rollback anchor and must follow the
pause). `q12-writer-resume.py` `run_quiesce()`'s barrier-receipt gate (`:325-335`,
`state=recovery_ready_guarded`/`last_command=prepare-recovery`) is a stale D4-recovery-era
precondition. The amendment must make the precondition **mode-aware, not relaxed**:

- **cutover mode** (join-era window): accept exactly `state=maintenance_guarded`,
  `last_command=install`;
- **recovery mode** (standalone `.13.4.1` source-recovery): keep exactly
  `state=recovery_ready_guarded`, `last_command=prepare-recovery`.

No silent either-or: unconditionally accepting both would weaken both flows. The pinned W
test (`qdrant-source-recovery-runtime.test.ts`, recovery case at `:808-821,:5098`) is
**kept**, and a cutover-mode case is **added**.

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

- marker present, `mode == "cutover"`, `run_id` matches → require
  `state=maintenance_guarded`, `last_command=install` (+ the retained `zero_guard_residue`
  and db-capability-present checks, unchanged);
- **marker absent** → **recovery mode** = the exact current gate
  (`recovery_ready_guarded`/`prepare-recovery`), unchanged.

Absence ⇒ recovery mode is the key backward-compatibility property: the standalone recovery
flow (which never runs the live controller and never writes the marker) keeps its exact
current behavior, so its pinned frozen test stays green unmodified. The new cutover-mode
test writes the marker and feeds `maintenance_guarded`/`install`.

**Why not an env/argv variant on `source-recovery-run.sh`:** even though
`source-recovery-run.sh` is W-owned and editable in the amendment round, the value that
reaches it still originates from the frozen manifest command the controller must run
byte-exact. A run-root marker is the only channel that is (a) caller-declared, (b) explicit
(a file, never inferred from the receipt), (c) mode-aware, and (d) free of any frozen-byte
or child-env change.

## Boundaries of the amendment round (when authorized)

- Write zone: `q12-writer-resume.py` (`run_quiesce` gate + marker read) and its pinned test
  (`qdrant-source-recovery-runtime.test.ts`) — its own commits, own design note, own review.
- **Untouched:** the frozen `q12-command-manifest.json` (`aaec6fc2…`), the `writers.quiesce`
  argv/env, `q12-database-barrier.sh` (`134255ce…`), `q12-structural-catalog.sql`
  (`0b8a943f…`).
- The live controller's side (writing the marker) is a Task-9 controller round; it depends
  on this W amendment landing first for the cutover window to open, but the marker-writing
  itself is inert until the W side reads it.

## Open question for the reviewer

Confirm the marker (out-of-band run-root file) is the accepted channel vs. any alternative
that keeps the frozen manifest intact. If the reviewer prefers the mode be inferred from an
already-present run-root artifact (e.g. the controller's phase.jsonl window kind) rather
than a dedicated marker, that is a viable variant — but it must remain an **explicit**
declaration, never a guess from the receipt state itself.
