# Q12 Live Controller Design (Task-9 `plan|live|recover`)

Status: **DESIGN DRAFT — awaiting orchestrator ratification. No implementation.**
Author stream: `mc2-jz6y0.13` live-controller design (Fable).
Scope boundary: local design + tests only; **no server/live/db/ssh/docker action**.
Companion plan: `docs/superpowers/plans/2026-07-17-q12-live-controller.md`.

All file:line citations below were taken from bytes that are **identical** in this
worktree (`codex/q12-plan-builder`, HEAD `545cde11`) and the stage tree
(`codex/self-hosted-qdrant-platform`, HEAD `5e0574b4`); the six cited source files
match by sha256 across both trees.

---

## 1. Purpose and precedence

The C0 cutover window (`docs/superpowers/plans/2026-07-16-q12-full-completion.md`
tasks C1..C9, packet `mc2-jz6y0-c0-window-packet.md`) is **not executable against the
current tree**. The window operator-procedure research
(`.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-operator-procedure.md`, section
"Open questions") proved six load-bearing gaps (OQ1..OQ6). They are exactly the scope
the D5J amendment deliberately retained for Task 9:

> Task 9 keeps: the real `plan|live|recover` controller; `barrier.cleanup`, …; live
> orchestration. … Task 9 must consume the manifest entries and serializer/composer
> primitives frozen here with **proven byte- and order-parity and may not fork a second
> authority.**
> — `docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md:485-496`

This document resolves each OQ against frozen truth and defines the Task-9 live
controller. Where two frozen artifacts contradict (OQ1), both sides, the product
consequence of each, and a recommended resolution are stated — the design **does not
silently pick**, and flags the item as a hard stop.

**Precedence and hard constraints (non-negotiable, carried into every implementation
round):**

- The frozen bytes stay byte-identical: `q12-command-manifest.json`
  (`aaec6fc2…`), `q12-database-barrier.sh` (`134255ce…`), `q12-structural-catalog.sql`
  (`0b8a943f…`). **If any frozen-manifest change turns out to be required, that is a hard
  STOP — report, do not touch.**
  _(Historical, 2026-07-18: the barrier sha `134255ce…` here was superseded by
  `3673ee49…` per the ratified barrier-fix round (PG17 ACL/fd/dialect); the current frozen
  barrier is `3673ee49…` and this constraint stands against the current bytes.)_
- One command authority only: the controller consumes the frozen 20-command manifest
  through the existing `load_manifest()` / `resolved_command()` primitives and journals
  through the existing `Engine` serializer/capability/object/checkpoint primitives. **No
  second resolver, manifest, command table, or journaling authority may be created**
  (amendment §2 `:45-51`, §10 `:494-496`).
- No weakening of existing gates. The plan-mode surface (accepted; rounds 8–19,
  review `mc2-jz6y0.13-plan-live-review-r2.md` PASS/PASS) is reused, not duplicated.

---

## 2. What is already built vs. what Task 9 must add

The D5J `.13.21/.13.22` amendment already delivered the **journaling machinery** for the
full joined window as a **closed fixture**:

- `run_joined_composer` (`q12-lifecycle-core.py:2885-3066`) emits the **entire** joined
  journal — the 15 ordinary command lifecycles **and** the 5 `barrier.*` retained chains —
  interleaved in the exact §5 chronology, through one `Engine`. It calls
  `append_ordinary_lifecycle` for ordinary commands (via the `ordinary(...)` helper
  `:2948-2949`) and `retained_chain` for barriers (via `d5(...)` `:2943-2946`), plus
  `append_controller_milestone` (`:3006`) and `publish_final_writer_manifest` (`:2992,
:3048`).
- `append_ordinary_lifecycle` (`:1619-1716`) mints each ordinary lifecycle
  (`intent → capability_issued → capability_claimed → completed`, or the `writers.quiesce`
  five-outcome shape ending in `accepted`) using `resolved_command()` (`:1634`), the
  `ORDINARY_ROW_GRAMMAR` phases (`:1638`), and the shared capability/object primitives
  (`publish_ordinary_capability` `:1644`, `move_ordinary_capability` `:1653,:1682`,
  `immutable_publish` `:1680`, `append` `:1640…`). It also owns the two evidence steps:
  the `resource_step_before_completion` for `deploy.prepare` (`:1683-1686`) and the
  `writers.quiesce` `quiesce_manifest_sha256` switch (`:1698`).
- The `Engine` already carries a **production seam**: `Engine.__post_init__` accepts
  `request["production"] is True` and then requires the run root to be
  `/opt/megacampus/backups/q12/<run-id>` instead of the `/tmp/mc2-q12-d5-root-*` fixture
  shape (`:804-808`).

**The only thing `run_joined_composer` is missing to be a real window driver** is that it
(a) is gated to a fixture profile and a pre-existing W-owned quiesce-manifest preimage
(`:2892-2899`), (b) derives every substitution value deterministically from
`derive_joined_fixture_values` (`:2935`, closed-fixture values `:667-689`) instead of real
run inputs, and (c) journals lifecycles **without executing the real child command** (the
retained result is a deterministic projection tagged `"evidence":"q12-joined-fixture"`,
`:1671`).

**Task 9 = the production twin of `run_joined_composer`:** the same `Engine`, the same
primitives, driven with `production:true`, **real** substitution values sourced per §3,
**real** child execution between the selector and completion rows, and the real barrier
operations run as the deployed supervisor invocations. The closed composer becomes the
**parity oracle** the live journal must match (§10 parity duty; §7.6 `:418-421` explicitly
authorizes emitting the ordinary groups "through the same production serializer,
capability, object, and checkpoint primitives").

---

## 3. Frozen-truth constraints the controller must honor

- **The 20-command order and per-entry frozen argv/env** (amendment §2 `:59-107`). The
  controller consumes them verbatim; it substitutes only the typed placeholders of §3
  `:120-131`, each from its single frozen authority ("already-hashed run input **or a
  prior fsynced checkpoint-bound resource manifest**; never a fresh live lookup, never
  caller-supplied", `:137-139`).
- **The §5 forward chronology (16 groups, `:210-228`)** is the exact journal order:
  1 `preflight`/`operator.self-check` (genesis) → 2 `install` → 3 `quiesced`/`writers.quiesce`
  → 4 `snapshot_exported`/`pg.backup` intent → 5 `backup_committed`/`pg.backup` target →
  6 `restore_verified`/`pg.restore`+`migration.base.apply` → 7 `verify-after-base` →
  `migration.observability.apply` → 8 `verify-after-observability` → 9 `migrations_applied`
  milestone → 10 `prepare-recovery` → 11 `source_recovered`/`source.forward` →
  12 `reindex_started`/`reindex.plan`+`worker.create`+`execute` → 13 `qdrant_verified`/`reindex.verify`+`deploy.prepare`
  → 14 `prepared_quiesced` forward FWM → 15 `activation_ready`/`deploy.commit` → 16 `activate`.
- **The row model (§4 `:144-203`)**: uniform four-outcome ordinary lifecycle;
  `pg.backup`'s split selector (`snapshot_exported` intent / `backup_committed` target,
  `:158-164`); the `writers.quiesce` five-outcome D4 shape (`:173-174`); controller
  milestones are one Root `completed` row bound to a witness command whose lifecycle is
  already durable (`:175-184`); the two-segment `quiesce_manifest_sha256` binding (64
  zeroes through `quiesced/capability_completed`, real digest at `quiesced/accepted`
  onward, `:189-193`); the evidence-stepped `resource_manifest_sha256` (`:196-200`).
- **Identity split**: everything that appends to the journal is Root = uid/gid 1000
  `claude-deploy` (journal/checkpoint/capability files must be uid/gid 1000,
  `ensure_directory` `:459-469`, `validate_regular_file` `:517-524`, claim FD checks
  `:2673-2683`, canonical lock `:397-408`). `source-recovery-run.sh` (writers.quiesce /
  source.forward / writers.resume.\*) **must run as root** (`:114`) with the FD-9 lease held
  (`q12-writer-resume.py:287-297`, manifest env `Q12_EXTERNAL_QUIESCE_LEASE_FD=9`). The
  supervisor takes the canonical `cutover.lock` exclusively for each invocation
  (`:6141-6147`), so the FD-9 lease may be held only around quiesce/resume and must be
  released before any supervisor invocation.
- **The composer is the parity oracle**: the live journal, driven with the same
  deterministic inputs, must be byte/order-identical to `run_joined_composer` on the shared
  fields (row schema, `command_id`, `command_sha256`, phase, outcome, hash chain,
  checkpoints). Real-execution result evidence is the one legitimately-varying surface and
  lives in the side result file, not the journal row (§ 6.4).

---

## 4. Open-question resolutions (evidence-grounded)

### OQ1 — quiesce ordering contradiction — **HARD STOP (frozen-artifact conflict)**

**The conflict is real and both sides are frozen and test-pinned.**

- **Side A — early quiesce is product truth** (chronology + packet + operational
  correctness). The §5 chronology places `writers.quiesce` at **group 3**, immediately
  after `install` (group 2) and **before** `pg.backup`/migrations/`prepare-recovery`
  (amendment `:214`); the packet lists it as C2 (`:171-183`); and operationally a cutover
  **must** pause writers before it exports the consistent source snapshot that `pg.backup`
  (group 4) turns into the rollback anchor. At group 3 the only barrier that has run is
  `install`, so `database-barrier-receipt.json` is `state=maintenance_guarded`,
  `last_command=install` (`q12-database-barrier.sh:2107`).
- **Side B — the W quiesce gate is a hard, test-locked precondition demanding a
  _later_ state.** `q12-writer-resume.py` `run_quiesce()` (`:316`) requires, before it will
  quiesce (`:325-335`): `state == "recovery_ready_guarded"` (`:328`),
  `last_command == "prepare-recovery"` (`:330`), `zero_guard_residue is False` (`:329`),
  `rollback_probes_verified is True` (`:331`). That receipt state exists **only after**
  `prepare-recovery` (group 10 / C5a; `q12-database-barrier.sh:352-358,:2112`). The gate
  is **locked by a passing frozen test**: `qdrant-source-recovery-runtime.test.ts` feeds
  exactly `recovery_ready_guarded`/`prepare-recovery` via `composeWriterFixture()`
  (`:808-821`) and asserts `result.status === 0` for the real controller run
  (`:5098,:5103`).

**Product consequence of each:**

- Adopt Side A (relax the W gate to accept `maintenance_guarded`/`last_command=install`):
  requires editing `q12-writer-resume.py` (a **W-owned file**, whose change is forbidden
  by amendment §7 `:428` and outside Task-9's parity-only mandate) **and** rewriting the
  frozen W test. Both W protocols are declared "structurally unchanged" (§5 `:247-249`).
  This is a **W-contract amendment**, not a Task-9 code change.
- Adopt Side B (move quiesce after `prepare-recovery`): contradicts the frozen D5J §5
  group-3 placement and the packet C2 ordering, and would make the group-4 `pg.backup`
  snapshot capture a source that is **still taking writes** up to group 10 — defeating the
  purpose of the rollback anchor. Re-freezing the §5 chronology is a design-amendment stop.

**Recommendation (for owner ruling — do not implement without it):** Side A is the
operational truth — a cutover must quiesce before the consistent backup, and the
`recovery_ready_guarded` gate is a **D4 recovery-only-era precondition** that predates the
join and was never updated when quiesce was pulled forward. The correct resolution is a
**scoped W-contract amendment**: relax `run_quiesce()`'s receipt gate to accept the
join-era pre-backup state (`state=maintenance_guarded`, `last_command=install`, with
`zero_guard_residue`/capability-present checks retained), and update the pinned W test
accordingly, while preserving the standalone D4 recovery-only flow (which still reaches
`recovery_ready_guarded` before its own quiesce) via a mode/parameter that selects the
gate. **This is outside both the D5J §7 write zone and Task-9's "no W-file change /
parity-only" scope; it needs owner ratification and belongs to the W stream, not this
controller.** Until ratified, C2 `writers.quiesce` is unimplementable and unexecutable —
**the window cannot open.** (This is the single blocking item; OQ2–OQ6 are resolvable
within Task-9.)

### OQ2 — no production producer of ordinary journal rows — **RESOLVED (reuse the Engine)**

`append_ordinary_lifecycle` (`:1619`) has exactly one caller today —
`run_joined_composer` at `:2949` — and the composer is gated to a fixture profile
(`:2892-2894`), a pre-existing W-owned quiesce manifest (`:2895-2899`), and (unless
`production:true`) a `/tmp/mc2-q12-d5-root-*` root (`:807`).

**Resolution:** the live controller drives the **same** `Engine` with `production:true`
(`:804`) and calls the **same** `append_ordinary_lifecycle` / `retained_chain` /
`append_controller_milestone` / `publish_final_writer_manifest` primitives — this is the
"serializer-primitive extraction … through the same production serializer, capability,
object, and checkpoint primitives" that §7.6 (`:418-421`) authorizes. No second authority
is created (§10 `:496`); the composer remains the parity oracle. The controller supplies
**real** substitution values (§3 authorities) instead of `derive_joined_fixture_values`,
and the retained result file records the real child result rather than the fixture tag
(§6.4).

### OQ3 — resume needs a `guard_cleanup_complete` receipt + a real FWM — **RESOLVED (Task-9 orchestration, no manifest change)**

`writers.resume.*` requires a **v2** receipt `state=guard_cleanup_complete`,
`database_capability_deleted=true`, `terminal_proof_sha256` set
(`q12-writer-resume.py:1060-1073`; forward additionally `last_command=="cleanup"` `:1076`),
plus a real `final-writer-manifest-{mode}-<run-id>.json`
(`:1035,:1288-1291`). That receipt is written **only** by `q12-database-barrier.sh` in its
`rollback|cleanup` subcommand (`:2114`). `barrier.cleanup` is **not** in the frozen
20-command manifest (grep: 0 hits) — it is Task-9 scope (amendment §10 `:485`). The only
FWM producer today is `publish_final_writer_manifest` (`:1881`), which with `inventory=None`
emits a "five-key fixture reduction" (`:1891-1896`) and is called only from the composer
(`:2992,:3048`) and one Engine rollback path (`:2635`).

**Resolution (all Task-9-owned; frozen manifest untouched):**

- The barrier-cleanup receipt is produced by the controller **orchestrating
  `deploy/qdrant/q12-database-barrier.sh cleanup` (or `rollback`) directly** as a Task-9
  post-activation step. This subcommand already exists in the deployed barrier script
  (`:2114`); it is **not** a manifest ordinary command and needs **no** manifest change.
  `barrier.cleanup` being "Task 9 scope" means Task-9 owns invoking it — which is exactly
  this controller. When the controller journals the cleanup lifecycle it extends the joined
  graph under the parity duty (§10 `:492-494`), not a fork.
- The real FWM is produced by the controller calling `publish_final_writer_manifest` with
  the **real Root-derived inventory** (§6 `:306-357`): the ten originals parsed read-only
  from the W-owned quiesce manifest bytes, plus the five targets recorded by
  `deploy.prepare` in its checkpoint-bound resource manifest. This is the existing
  `derive_root_writer_inventory` path (`:1718`, called by the composer at `:2971-2973`) fed
  real bytes — no new authority.

### OQ4 — production `--resource-manifest-sha256` value + stepping — **RESOLVED (real checkpoint-bound resource manifest)**

`resource_manifest_sha256` is a request-object key (`validate_request:2853`, 64-hex
`:2860-2861`), seeded into `Engine.current_resource_manifest_sha256` (`:799`). The
stepping walk (`validate_stable_binding_walk:342-356`) permits it to change row-to-row
**only** at a `pg.backup` row with `outcome=="intent"` (`:346-347`) or a `deploy.prepare`
row with `outcome=="completed"` (`:349-350`), and otherwise pins it request-global to the
first/last entry value (`:357-365`). In the deployed **5-supervisor-only** window there are
no ordinary rows, so the hash **cannot step** — the same constant must be passed to all
five invocations, and repo truth does not name it (procedure artifact OQ4).

**Resolution:** with the Task-9 controller journaling the ordinary rows, the two stepping
witnesses (`pg.backup/intent`, `deploy.prepare/completed`) **exist**, so the resource hash
becomes a real, stepped, checkpoint-bound artifact:

- **Initial value** (through `install`, `operator.self-check`, `writers.quiesce`): the
  sha256 of a genesis resource-manifest object the controller fsyncs into the run root
  before the first row (a documented, recomputable "empty accepted resource manifest";
  exact shape frozen in the design's TDD RED). This replaces the unnamed constant of the
  5-invocation window.
- **Step 1 at `pg.backup/intent`** (§4.8 `:198`): the controller records the exported
  snapshot identity `<exported-id>` (from OQ5) into a new checkpoint-bound resource
  manifest and sets `current_resource_manifest_sha256` to its digest before the intent row
  — mirroring the composer's `snapshot_step` (`:2957,:2976`).
- **Step 2 at `deploy.prepare/completed`** (§4.8 `:199`): the controller records the five
  captured target identities into the resource manifest and steps the hash via
  `append_ordinary_lifecycle(..., resource_step_before_completion=<targets-digest>)`
  (`:1683-1686`) — mirroring the composer's `targets_step` (`:2958,:2987`).

Every `<exported-id>`/`<immutable-generation>`/target substitution is then sourced from
this "prior fsynced checkpoint-bound resource manifest" exactly as §3 `:126-131,:137-139`
requires. The supervisor invocations carry the current stepped value per invocation.

### OQ5 — no deployed q12 snapshot exporter — **RESOLVED (reuse the plan coordinator)**

`pg.backup` q12 mode requires an **already-open, externally exported** snapshot id
(`backup-supabase.sh:502-507`, shape `^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$`); it does
not open its own session. The scheduled coprocess exporter (`:858-881`) is scheduled-only
because it holds the session in-process for the scheduled dump. The **plan executor already
has the reusable pattern**: `_open_snapshot_coordinator`
(`q12-lifecycle-core.py:5718-5773`) spawns a long-lived `psql`, runs
`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();`
(`:5755-5757`), validates the id against `PLAN_SNAPSHOT_RE` (`:5771`), and **keeps the
session open** (`:5773`), closed later by `_close_snapshot_coordinator` (`:5775-5781`).

**Resolution:** the live controller reuses `_open_snapshot_coordinator` /
`_close_snapshot_coordinator` (the accepted plan-mode primitive — the directive's "reuse
its primitives"): open the coordinator against the live source, capture `<exported-id>`,
record it into the resource manifest (OQ4 step 1), hold the session open through
`pg.backup` (group 4→5), close after commit. No frozen-byte change; no manual owner-DSN
psql (respecting corrections-design §9).

### OQ6 — `$RR/baseline.json` has no producer — **RESOLVED (controller captures the full source baseline; not projectable from the barrier baseline)**

`pg.backup` q12 mode reads `/opt/megacampus/backups/q12/<run-id>/baseline.json`
(`backup-supabase.sh:918-926`) and hands it to the manifest generator as `--baseline`
(`:576`); `q12-source-manifest.ts` `validateTransition` (`:1258+`, invoked `:1450-1454`)
requires a **full structural baseline**: `cron_jobs` (8 full rows), `database`
(`settings`/`size_bytes`), full `q12_guard` relations and `guarded_relations`
(`:1264-1330`). The only baseline artifacts produced today are `database-barrier-baseline.json`
(`q12-database-barrier.sh:2014-2024`, nested `.baseline` is **digests only** —
`baseline_structural_catalog_sha256`, `…_sha256`, `pg_net_queue_count`, `:657-661`) and the
lifecycle 5-key reduction (`q12-lifecycle-core.py:2401-2417`). **Both are lossy** — the
structural rows are already discarded — so `baseline.json` **cannot be projected** from
them.

**Resolution:** the controller **captures the full structural source baseline directly
from the live source inside the held snapshot session** (OQ5), using the accepted
plan-mode source-capture path (the frozen `q12-structural-catalog.sql` projection the plan
executor already runs to build the source payload), and writes it to
`<run-root>/baseline.json` (0400, uid 1000) before `pg.backup` consumes it. This reuses the
plan surface's source-capture discipline; no frozen-byte change. (The exact key mapping
from the structural payload to the `validateTransition` shape is pinned in the design's TDD
RED against a disposable PG17 source, reusing the round-8..19 real-PG17 harness.)

---

## 5. The live controller

### 5.1 Placement and authority

Add two subcommands to the **existing** `q12-lifecycle-core.py` and route them through the
**existing** `q12-live-cutover.sh` wrapper (`plan`→plan, `live`/`recover`→the new
controller, everything else→supervisor). This is the "real `plan|live|recover` controller"
§10 assigns to Task 9; adding it is Task-9's mandate, **not** a §7 wrapper-change violation
(§7 constrains the D5J `.13.21/.13.22` amendment work, not Task-9 `:395-431`). The
controller creates **no** new command/resolver/manifest — it drives the same `Engine`
(`production:true`), the same `load_manifest()`/`resolved_command()`, and the same
serializer/capability/object/checkpoint primitives, so the "one authority" rule holds
(§2, §10).

- `live` — drives the forward window from the genesis `operator.self-check` row to
  `activate`, sequencing ordinary child execution + journaling and the five supervisor
  invocations, and orchestrating the two root-side sub-flows (`source-recovery-run.sh`,
  the barrier cleanup) with correct identity/lease custody.
- `recover` — resumes an interrupted run from the durable journal (idempotent restart) and
  drives the rollback profile (`writers.resume.rollback` + rollback FWM) when the window is
  abandoned before the activate point of no return.

### 5.2 Forward sequence (controller acts ↔ §5 groups)

| §5 group                                   | Controller act                                                                                                                                                                                                                                                          | Identity / lease                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1 `preflight`                              | journal `operator.self-check` lifecycle (genesis, seq=1); execute the real self-check child                                                                                                                                                                             | Root(1000) journals; child via `sudo` (root) |
| 2 `install`                                | invoke supervisor `install` (`q12-live-cutover.sh install …`)                                                                                                                                                                                                           | uid 1000; no lease held                      |
| 3 `quiesced`                               | **BLOCKED by OQ1**: hold FD-9 lease; invoke `sudo source-recovery-run.sh --operation quiesce-writers-only`; journal `writers.quiesce` 5-outcome lifecycle binding the real `writer-quiesce-<run-id>.json`; switch `quiesce_manifest_sha256` at `accepted`; release FD 9 | Root journals; child root + FD-9             |
| 4–5 `snapshot_exported`/`backup_committed` | open snapshot coordinator (OQ5); step resource hash to `<exported-id>` (OQ4); write `baseline.json` (OQ6); journal `pg.backup` split lifecycle; execute real `pg.backup`; close coordinator; journal `pg.restore` lifecycle; execute the isolated restore drill         | uid 1000 journals; children env-frozen       |
| 6 `restore_verified`                       | journal + execute `migration.base.apply` (phase-internal)                                                                                                                                                                                                               | uid 1000                                     |
| 7                                          | invoke supervisor `verify-after-base`; journal + execute `migration.observability.apply`                                                                                                                                                                                | uid 1000                                     |
| 8                                          | invoke supervisor `verify-after-observability`                                                                                                                                                                                                                          | uid 1000                                     |
| 9 `migrations_applied`                     | `append_controller_milestone("migrations_applied", witness "migration.observability.apply")` (composer parity `:3005-3009`)                                                                                                                                             | uid 1000                                     |
| 10 `prepare-recovery`                      | invoke supervisor `prepare-recovery` (→ `recovery_ready_guarded`)                                                                                                                                                                                                       | uid 1000                                     |
| 11 `source_recovered`                      | invoke `sudo source-recovery-run.sh` forward; journal `source.forward` lifecycle                                                                                                                                                                                        | Root journals; child root                    |
| 12 `reindex_started`                       | journal + execute `reindex.plan`, `reindex.worker.create`, `reindex.execute`                                                                                                                                                                                            | uid 1000 journals; children root/docker      |
| 13 `qdrant_verified`                       | journal + execute `reindex.verify`; journal + execute `deploy.prepare`, capturing five target identities and stepping resource hash at completion (OQ4 step 2)                                                                                                          | uid 1000 journals                            |
| 14 `prepared_quiesced`                     | `publish_final_writer_manifest("forward", real_inventory, resolved writers.resume.forward)` (OQ3)                                                                                                                                                                       | uid 1000                                     |
| 15 `activation_ready`                      | journal + execute `deploy.commit`                                                                                                                                                                                                                                       | uid 1000 journals; child root (`sudo nginx`) |
| C7 pause                                   | between group 13 and 14/15: structurally the window pauses (no lock/session held; writers stay quiesced, restart policy `no`, `q12-writer-resume.py:1000-1006`) for the local re-freeze (procedure §E)                                                                  | —                                            |
| 16 `activate`                              | H-stream nginx switch; invoke supervisor `activate` (→ `activated`); **point of no return**                                                                                                                                                                             | uid 1000                                     |
| post                                       | orchestrate `q12-database-barrier.sh cleanup` → v2 `guard_cleanup_complete` (OQ3); hold FD-9; `sudo source-recovery-run.sh` `writers.resume.forward`; release FD 9                                                                                                      | Root journals; child root + FD-9             |

### 5.3 Producers (summary)

| Artifact                                                                      | Producer (this controller)                                                 | Reuse                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| run-root `baseline.json` (full structural)                                    | capture from live source in held snapshot session                          | plan `q12-structural-catalog.sql` capture path |
| held snapshot session + `<exported-id>`                                       | `_open_snapshot_coordinator`/`_close_snapshot_coordinator`                 | plan `:5718-5781`                              |
| checkpoint-bound resource manifest + 2 steps                                  | controller writes/steps at `pg.backup/intent` & `deploy.prepare/completed` | `Engine` `:1683-1686`, walk `:342-356`         |
| `writer-quiesce-<run-id>.json` consumption + `quiesce_manifest_sha256` switch | W child produces the manifest; controller binds it at `quiesced/accepted`  | `:1698`, source-recovery `:519-522`            |
| real forward/rollback FWM                                                     | `publish_final_writer_manifest` with real `derive_root_writer_inventory`   | `:1881,:1718`                                  |
| v2 `guard_cleanup_complete` receipt                                           | orchestrate `q12-database-barrier.sh cleanup\|rollback`                    | barrier `:2114`                                |
| ordinary journal rows                                                         | `append_ordinary_lifecycle` (production seam)                              | `:1619`                                        |

### 5.4 Identity, lease, and FD custody

The controller runs as **uid 1000 `claude-deploy`** (it journals; all journal/capability
state must be uid 1000). Root-side children (`operator.self-check`, `writers.quiesce`,
`source.forward`, `reindex.*`, `deploy.*`, `writers.resume.*`) are executed via `sudo` with
the exact frozen manifest env applied through `env -i` (procedure §C `:263-270`). The FD-9
lease (`exec 9<>…cutover.lock; flock -x -n 9`) is opened by the controller and passed into
the sudo'd `source-recovery-run.sh` **only** around groups 3 (quiesce) and the post-activate
resume; it is **released before every supervisor invocation**, which takes the same
`cutover.lock` exclusively for its own duration (`:6141-6147`). The single-writer invariant
(one `cutover.lock` holder at a time) keeps the collaboratively-built `phase.jsonl`
race-free: the controller and the supervisor invocations append to the same journal with
predecessor-CAS + `O_APPEND|O_DSYNC`, never concurrently.

### 5.5 Resume / recover semantics

- **Barrier resume**: a failed supervisor invocation is re-run unchanged; the engine takes
  `resume_retained_chain` and either reuses the durable result or re-delegates
  (`run_supervisor:3104-3106`, procedure §F). Idempotent restart is the designed path
  (`q12-live-cutover.test.ts:769-806`).
- **Ordinary resume**: the `recover` controller reloads the durable journal, finds the
  last durable ordinary head, and continues the chronology; a completed ordinary lifecycle
  is a no-op. The controller never re-executes a child whose `completed` row is durable
  (the retained result file is the witness).
- **Rollback**: before `activate`, `recover` drives the rollback profile — the rollback
  FWM at `final-writer-manifest-rollback-<run-id>.json` (distinct path, §6 `:291-297`),
  bound to `writers.resume.rollback`, and the barrier `rollback` → v2 receipt →
  `writers.resume.rollback` — matching the composer's rollback branch (`:3013-3053`) for
  parity.
- **Composed recover procedure (RULING 2 option (a), 2026-07-18).** `run_recover` supports
  resuming from exactly the two clean forward checkpoints — the C7 head
  (`deploy.prepare`/`completed`) and the crash-after-FWM head
  (`writers.resume.forward`/`accepted`). It FAILS CLOSED (named refusal, never heuristic
  continuation) on every other durable head, including a **mid-barrier partial** (a
  `barrier.<op>` head that has not reached its clean supported checkpoint). Mid-barrier heads
  are deliberately NOT resumed by `recover`; they belong to the STANDALONE supervisor
  entrypoint (`q12-live-cutover.sh <op> …`), which `recover` leaves byte-untouched and whose
  `resume_retained_chain` is idempotent. The **operator procedure** for a mid-barrier crash
  is therefore a two-step composition:
  1. re-run the standalone supervisor for the crashed operation:
     `q12-live-cutover.sh <op> …` (idempotent barrier resume, `resume_retained_chain`);
  2. then run `q12-live-cutover.sh recover …`, which continues from the now-advanced,
     supported head.
     To make this actionable at 3am, `run_recover`'s named refusal for a `barrier.<op>` head
     **includes the exact step-1 command** (`… ; re-run the standalone supervisor
'q12-live-cutover.sh <op>' to resume this barrier, then run recover`) — the operator gets
     the next step from the error text, not archaeology (implemented R5 Sub-round D2).
     **R8 obligation:** the R8 execution smoke + the server custody rehearsal MUST prove this
     composition actually holds on a single journal (mid-barrier crash → standalone supervisor
     re-run → `recover` continue). If it does not compose end-to-end, that is a **found defect**
     (a real R5-D2 follow-up), not a scope extension.
- **SUPERSEDED — see §6b.2 (R8-C Option A, defect #10, ratified 2026-07-18; IMPLEMENTED R8-I-B
  2026-07-18).** **Operator mid-incident: do NOT follow the "exactly two/three clean checkpoints"
  story above — see §6b.2 (the 8-head recover dispatch).** `recover` is generalized to resume from
  ANY clean completed-group head (including every `barrier.<op>/completed`), so this clause's
  two-step mid-barrier composition now holds by construction and is the supported path. As built
  (R8-I-B), the dispatch is `run_recover`'s `_RECOVER_RESUME_FROM` table + the `barrier.cleanup`
  branch driving the shared `drive_forward_sequence`; the mid-lifecycle standalone-supervisor
  pointer (R5-D2) is retained ONLY for a claimed-but-not-completed barrier head. The full
  supersession record + the required per-barrier-class probes live in §6b.2 / §6b.6.
- **ADDENDUM — operator truth for a REAL mid-lifecycle crash (found-defects #18/#19, ratified
  2026-07-19; R8-B-2-iv-3).** The two-step composition above (standalone supervisor → `recover`)
  advances a crashed barrier to a `completed` head under a **recovery epoch**
  (`cutover-recovery-N`). Against the **real frozen barrier + frozen controller** that recovery-epoch
  advance is **NOT reachable from the controller for a mid-lifecycle crash**, in BOTH directions:
  - **Forward ops (`install`/`verify-*`/`prepare-recovery`/`activate`) — #18.** The controller CAN
    mint a recovery epoch (`resume_retained_chain`), but the frozen barrier `install` child pins its
    input checkpoint to `lease_epoch=="cutover"` (`q12-database-barrier.sh:421/432/439`) and fails
    closed on a recovery-epoch re-claim; `verify-extended`/`prepare-recovery`/`activate` consume NO
    per-leg input checkpoint at all (`input_checkpoint_file` is only assigned for `install` `:421` and
    `cleanup`/`rollback` `:582`). So a real forward-op supervisor re-claim under a recovery epoch never
    completes.
  - **Cleanup — #19.** The frozen barrier cleanup child DOES accept a recovery epoch (`:444-598`,
    grammar `:514-518`), but the **controller never mints one**: `barrier.cleanup ∉ OPERATIONS`
    (`q12-lifecycle-core.py:27-33`) so `run_supervisor` cannot target it (`:4058-4065`), and the sole
    cleanup driver `orchestrate_post_activate_cleanup` is hardcoded cutover-only
    (`:1791/1797/1808/1814/1838`).
    **What IS true (and now proven real, R8-B-2-iv-3):** a **cleanup** mid-crash
    (`barrier.cleanup/capability_claimed/cutover`) is resumed by `recover` **under `cutover`** (no
    supervisor, no recovery epoch), converging **+0** to the uninterrupted twin — the real twin of the
    fixture head-8 precedent (`q12-live-controller.test.ts:1046`,
    `q12-live-real-cleanup-recovery.test.ts`). For a **forward** mid-crash the real operator action is a
    window **ABORT via the rollback path** (which the frozen barrier DOES drive under a recovery epoch,
    `:444-598`) where the rollback predecessor gate permits, else the **manual runbook** — NOT a
    forward supervisor re-claim. The composed supervisor→recover recovery-epoch story
    (`recovery_reacquired` + a second `capability_claimed` under `cutover-recovery-N`, §6b.6) is
    inherently **W-side / server-custody** and is validated at the **server rehearsal**, not from the
    controller fusion (HONEST NOTE: the per-crash-point operator specifics are validated there; this
    addendum deliberately does not over-specify unverified procedure). The R5-D2 pointer TEXT is left
    UNCHANGED this round (following it on a forward crash yields a NAMED fail-closed-safe barrier
    refusal, not damage); any rewording is deferred to the rehearsal/runbook round.

### 5.6 Parity duty (the §10 obligation)

A CI parity proof drives the `live`/`recover` controller with the **same deterministic
inputs** the closed composer uses and asserts the produced `phase.jsonl`, checkpoints,
capability tree, and FWM objects are **byte/order-identical** to `run_joined_composer` on
the shared fields (row schema, `command_id`, `command_sha256`, phase, outcome, hash chain).
The real-execution result evidence (side result files) is the documented delta and is
covered by separate real-PG17 execution tests. This discharges "consume the … primitives …
with proven byte- and order-parity and may not fork a second authority" (§10 `:494-496`)
and the §8 fail-closed additions (`:435-452`).

---

## 6. Hard-stop items (must be resolved by the owner/orchestrator, not by this stream)

1. **OQ1 — the quiesce receipt-state contradiction (blocking).** Two frozen, test-pinned
   artifacts conflict; the recommended resolution requires a **W-contract amendment** to
   `q12-writer-resume.py`'s `run_quiesce()` gate (relax to the join-era
   `maintenance_guarded`/`install` state) plus the pinned W test — **outside** the D5J §7
   write zone and Task-9's parity-only scope. The window cannot open until this is ratified
   and delivered by the W stream. **Do not touch `q12-writer-resume.py` in this stream.**
2. **Any required frozen-manifest change is a hard stop.** The design deliberately avoids
   one: `barrier.cleanup` is invoked as a **barrier-script subcommand** (already deployed),
   not added to the 20-command manifest; every producer reuses existing primitives. If TDD
   later shows a producer genuinely cannot be built without adding a manifest entry or
   changing frozen barrier/SQL bytes, **stop and report** — do not modify `aaec6fc2…` /
   `134255ce…` / `0b8a943f…`.
   _(Historical, 2026-07-18: `134255ce…` here was superseded by `3673ee49…` per the
   ratified barrier-fix round; the current frozen barrier is `3673ee49…`.)_

Nothing else in OQ2–OQ6 requires an owner ruling; they are implementable within Task-9
under the plan below.

---

## 6a. Post-ratification refinements (recorded 2026-07-18)

The orchestrator ratified the design and ruled the four open decisions; these refine the
sections above (evidence re-verified against the same byte-identical files):

1. **Barrier orchestration = in-process (§5.2 refined).** The controller drives the five
   barriers **in-process via `retained_chain`** (like the composer's `d5()`), not as five
   separate supervisor invocations — one authority, one `LeaseSession`, trivial composer
   parity, no lock/FD custody handoff. The standalone supervisor CLI invocations stay
   byte-untouched and remain the manual/recovery entrypoint. **The C7 pause is a planned
   controller EXIT at a checkpoint (a `stopAfter`-style stop after group 13) plus a
   `recover`-resume — the controller must NOT hold `cutover.lock` across the multi-hour C7
   pause.** R4 is shaped accordingly.

2. **OQ6 producer corrected.** `baseline.json` is produced by reusing
   **`q12-source-manifest.ts capture --snapshot <id>`** (with no `--baseline`, it sets
   `baseline = cutover = the capture`, `q12-source-manifest.ts:1449`) through the plan
   snapshot coordinator, extracting the `.baseline` field to `<run-root>/baseline.json`
   (0400). This is the projection `validateTransition` diffs against; the earlier idea of
   re-deriving via the frozen `q12-structural-catalog.sql` is the **wrong projection** and is
   withdrawn.

3. **OQ6 baseline timing pinned (pre-`barrier.install`), with evidence.** `validateTransition`
   requires the baseline to carry cron `active=true` and `default_transaction_read_only=off`.
   `barrier.install` IS the maintenance edge: it requires exactly 8 **active** cron rows
   pre-mutation (`q12-database-barrier.sh:1504-1506`), captures `q12_guard.baseline` from that
   pre-mutation state (`:952-969`), then **deactivates cron** (`:1513`
   `UPDATE cron.job SET active=false WHERE active`) and **sets read-only** (`:1531`, `:1548`
   `ALTER DATABASE postgres SET default_transaction_read_only=on`). Therefore the controller
   must capture `baseline.json` **before group 2 (`barrier.install`)** — at/after genesis
   (group 1), while the source is still cron-active and writable. This corrects §5.2's OQ6 row
   ("inside the held snapshot session", which is post-quiesce/post-install and would yield an
   invalid `active=false` baseline).

4. **Parity exclusion set is explicit + pinned (per ruling 1).** Every parity test enumerates
   the excluded physical-binding fields verbatim — `capability_manifest_sha256`, `entry_hash`,
   `previous_hash` (they transitively carry the journal file's device+inode). **Open point
   carried to R3:** `resource_manifest_sha256` on the two stepped rows (`pg.backup/intent`,
   `deploy.prepare/completed`) binds the real checkpoint-bound resource-manifest **artifact
   digest** in production vs. the composer's fixture step derivation
   (`sha256("q12:resource-step:snapshot:<run-id>")`), so it cannot match across
   fixture-vs-production and would need to join the pinned exclusion set **on those rows only**
   — flagged for the orchestrator's blessing before R3's stepped-row parity test, since ruling
   1 requires exclusions be blessed, not ad-hoc. (Substitution VALUES sourced from the artifact
   are seeded to the fixture derivations in the parity test, so `command_sha256` parity holds.)

5. **§5.2 "post" row wording corrected (ruling 1c, receipt-only).** The §5.2 forward-sequence
   `post` row's prose ("orchestrate `q12-database-barrier.sh cleanup` → v2 `guard_cleanup_complete`
   … `writers.resume.forward`") read as if the post-activate cleanup/resume were journaled steps;
   they are NOT. The frozen §5/D5J chronology ends at `barrier.activate` (76 rows) and the journal
   grammar has no cleanup `command_id`, so the cleanup is RECEIPT-ONLY: `run_live` adds no journal
   row and instead RECORDS the v2 receipt-backed cleanup + resume outcomes off-journal
   (`output["postActivate"]`). The bytes win over the prose — same correction class as the R1
   parity-wording note. (Implemented R5 Sub-round E.)

6. **RULING-1 REVERSAL RECORD (part iii of the R8 amendment; ratified 2026-07-18).** Item 5
   above (the R5-E "receipt-only / no journal row after activate" correction, itself the R5-E
   restatement of correction #5) is **REVERSED for the real path** by the R8-A hard-stop
   resolution. It is retained here only as provenance; §6b is the governing text.
   - **What RULING 1 (item 5 / R5-E correction #5) said.** After `barrier.activate` (the 76th
     journal row) the controller adds **no** journal row for the post-activate barrier cleanup
     or the forward writer resume; the cleanup is **receipt-only**, recorded off-journal in
     `output["postActivate"]` (the frozen §5/D5J chronology "ends at `barrier.activate`" and "the
     journal grammar has no cleanup `command_id`"). Implemented as
     `orchestrate_post_activate_cleanup` (`q12-lifecycle-core.py:3251-3307`) and the R8-D
     witness-file dispatch (`recover_post_activate`, `:3591-3633`).
   - **Why it fell.** It was a **fixture-era simplification** that contradicts the
     **earlier-ratified OQ3** (§4 OQ3 `:206-233`), which requires a real journaled
     `guard_cleanup_complete` lifecycle so that `writers.resume.*` can consume a real **v2**
     receipt. The premise "the journal grammar has no cleanup `command_id`" is only true of the
     _current_ core grammar, not of frozen truth: the frozen barrier `cleanup` subcommand
     **structurally requires** a journaled `guard_cleanup_complete`/`barrier.cleanup` lifecycle
     at the claimed boundary before it will run and validates that lifecycle as its own authority
     (`q12-database-barrier.sh:444-572`, esp. `:507-553`). Receipt-only cannot produce the tail
     the frozen barrier and the frozen resume gate (`q12-writer-resume.py:1088-1101`) both demand.
     RULING 1 therefore silently narrowed the real path below OQ3 and the frozen scripts.
   - **What supersedes it.** **§6b** (this amendment): the real post-activate segment **journals**
     the `guard_cleanup_complete` capability lifecycle with `command_id=barrier.cleanup`, promotes
     the archived v1 receipt to the exact 10-key v2 receipt, journals the `accepted` row binding
     the v2 receipt digest, and only then has `writers.resume.forward` **validate** (not journal)
     that receipt. `recover` is generalized (R8-C = Option A) so `barrier.activate`/`completed`
     is just the last barrier head whose tail is the journaled cleanup segment.
   - **What is PRESERVED (the partial closure — RULING 1 is refined, not discarded).** R5-E's
     receipt-only decision is NOT wholly reversed: the **RESUME half stays receipt-only** —
     `writers.resume.forward` still journals **no** rows in this segment — but that is now **FORCED
     by frozen truth** rather than a fixture simplification: the barrier's tail-contiguity rule
     (`q12-database-barrier.sh:511-513` — the `guard_cleanup_complete`/`barrier.cleanup` block must
     be the **last contiguous** rows, else `reject("interleaved database lifecycle")`) means any
     resume row appended after the cleanup block would break the barrier's own grammar. Only the
     **CLEANUP half is reversed** to a journaled `guard_cleanup_complete` lifecycle (§6b.1). So the
     net: receipt-only **resume** PRESERVED (and now frozen-forced); receipt-only **cleanup**
     REVERSED to journaled.
   - **Scope guard (unchanged).** The **merged R5 forward twin is untouched**: parity is scoped to
     the **76-row prefix** ending at `barrier.activate` (§3 `:105-112`, §5.6 `:431-440`). Only
     everything strictly **after** the `activate` row changes. The receipt-only mechanism and its
     witness file are superseded, not the forward journal.

## 6b. R8 post-activation amendment (OQ3 reinstated; recover generalized) — ratified 2026-07-18

This section is the **single blocking design gate before any R8 implementation**. It encodes two
**ratified** orchestrator rulings (not open questions):

- **RULING R8-A (hard-stop resolution).** The controller orchestrates
  `deploy/qdrant/q12-database-barrier.sh cleanup` **directly** as a Task-9 post-activation step and
  **journals** the `barrier.cleanup` lifecycle, extending the joined graph under the §10 parity
  duty. `barrier.cleanup` is **not** a manifest ordinary command and needs **no** manifest change —
  the cleanup segment's grammar authority is the frozen barrier script's **own** validation
  (`q12-database-barrier.sh:444-572`), not manifest resolution. RULING 1 (§6a item 5 / R5-E
  correction #5, "receipt-only / no rows after activate") is **reversed** for the real path; the
  merged R5 76-row forward twin **stands untouched**; only everything **after** the `activate` row
  changes. Re-drive idempotence is already frozen-designed via cleanup recovery epochs
  (`cutover → cutover-recovery-N`, consecutive; `q12-database-barrier.sh:514-518`).
- **RULING R8-C (= Option A).** Generalize `recover` to resume from **any clean completed-group
  boundary head**, driving `drive_forward_tail` from the next group via **one dispatch table**
  derived from the frozen 76-row chronology group map (§3 `:105-112`, §5.2 `:334-355`) plus the new
  post-activate cleanup segment — not five point-fixes. This **subsumes R8-D** (activate is just the
  last barrier head; its tail is now the journaled cleanup segment) and **R8-E** (a complete run
  recovered again). Named fail-closed **remains** for mid-lifecycle heads, unknown `command_id`s,
  and any broken/short chain.

All citations below are derived from bytes in this worktree (`codex/q12-live-controller`, re-based
onto the clean R5 tip `7e873c2e2` after the witness-round reconciliation reset — the superseded
witness commits are preserved at tag `r8d-witness-superseded`); frozen trio sha256 unchanged
(`aaec6fc2…` manifest, `3673ee49…` barrier, `0b8a943f…` catalog). Where the runtime fixture
(`packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts`) and the
frozen barrier script agree, that is stated; where they diverge, it is flagged (§6b.5).

### 6b.1 Part (i) — Exact row-map of the post-activate segment (derived from the runtime fixture)

Authority: the fixture helper `appendDatabaseTerminalLifecycle`
(`qdrant-source-recovery-runtime.test.ts:2154-2434`), cross-checked against the frozen barrier
grammar (`q12-database-barrier.sh:444-572`) and the frozen resume gate
(`q12-writer-resume.py:1088-1101`). Every row is a `megacampus.q12.cutover-journal/v1` row appended
by the **controller** (Root/uid-1000) through `Engine.append` (`q12-lifecycle-core.py:1395-1449`);
the barrier **child** only reads and validates them.

**Base (no-recovery) cleanup lifecycle — 5 ordered rows, all `phase=guard_cleanup_complete`,
`command_id=barrier.cleanup`:**

| #   | phase                                                                                                                                                                                                                                                                                                                                                                                           | outcome              | accepted_object_kind         | accepted_object_sha256 | lease_epoch | key bound fields                                                                                                       | authority                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------- | ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | guard_cleanup_complete                                                                                                                                                                                                                                                                                                                                                                          | intent               | none                         | null                   | cutover     | `capability_manifest_sha256 = 0×64` (intent carries no capability); default preimage                                   | fixture `:2217-2226`; barrier requires `intent.capability_manifest_sha256=="0"*64` `:551`             |
| 2   | guard_cleanup_complete                                                                                                                                                                                                                                                                                                                                                                          | capability_issued    | none                         | null                   | cutover     | `capability_manifest_sha256 = hostCapabilitySha256` (issued host-command-capability/v1)                                | fixture `claimInitialDatabaseCapability` `:1188-1191`; barrier epoch-0 slice `:524`                   |
| 3   | guard_cleanup_complete                                                                                                                                                                                                                                                                                                                                                                          | capability_claimed   | none                         | null                   | cutover     | `capability_manifest_sha256 = hostCapabilitySha256`; **this is the claimed boundary the barrier requires**             | fixture `:1193-1200`; barrier head-at-claimed check `:546-553`                                        |
|     | — **barrier child runs here** — validates journal to the claimed boundary (`:444-572`), performs the DB guard cleanup, publishes the 18-key `…terminal-proof.json` (`:2076-2112`), and **`exit 0`s at `:2116`**. The **controller** then archives v1 → `database-barrier-receipt-v1-before-cleanup.json`, **promotes** the receipt to v2, **deletes** the db capability, and journals rows 4–5. |                      |                              |                        |             |                                                                                                                        |                                                                                                       |
| 4   | guard_cleanup_complete                                                                                                                                                                                                                                                                                                                                                                          | capability_completed | none                         | null                   | cutover     | `capability_manifest_sha256 = currentHostCapabilitySha256`; completed-capability renamed into `completed/`             | fixture `:2397-2413`; `databaseCompletionEpoch` returns `cutover` when no existing proof `:1162-1167` |
| 5   | guard_cleanup_complete                                                                                                                                                                                                                                                                                                                                                                          | accepted             | **database_barrier_receipt** | **sha256(v2 receipt)** | cutover     | binds the promoted v2 `database-barrier-receipt/v2` digest; `capability_manifest_sha256 = currentHostCapabilitySha256` | fixture `:2415-2434`; barrier acceptance-shape rule `:540-545`                                        |

**Re-drive / recovery-epoch idempotence.** When a cleanup re-drive is required
(`databaseRecoveryRequired`, fixture `:1203-1205`), the epoch steps `cutover → cutover-recovery-1`
with a `recovery_reacquired` + `capability_claimed` slice in the recovery epoch
(fixture `:2272-2332`), and `databaseCompletionEpoch` returns `cutover-recovery-1`
(`:1166`). The frozen barrier enforces **consecutive** epochs `["cutover",
"cutover-recovery-1", …]` (`q12-database-barrier.sh:514-518`) and the per-epoch outcome slices
(`:520-532`): epoch 0 = `[intent, capability_issued, capability_claimed]`, a middle/last recovery
epoch = `[recovery_reacquired, capability_claimed]`. This is the **same** `cutover → cutover-recovery-N`
recovery-epoch discipline the design already froze for the barriers (§5.5 `:384-386`), so cleanup
re-drive is idempotent by construction.

**The v1 → v2 promotion (exact 10-key schema).** The archived predecessor is the v1
`database-barrier-receipt/v1` (`state=activated`, `last_command=activate`), copied to
`database-barrier-receipt-v1-before-cleanup.json` at 0400 (fixture `:2182-2187`; frozen barrier
validates the archive already exists and matches at `:642-644`). The promoted receipt is the exact
**10-key** `megacampus.q12.database-barrier-receipt/v2`:
`{schema_version, run_id, state=guard_cleanup_complete, expected_catalog_sha256,
zero_guard_residue=true, last_command=cleanup, rollback_probes_verified=true, probe_receipt_sha256,
terminal_proof_sha256, database_capability_deleted=true}` (fixture `:2415-2426`), which is exactly
what the frozen forward resume gate requires key-for-key (`q12-writer-resume.py:1090-1101`). Row 5's
`accepted_object_sha256` binds this v2 receipt's digest. The **terminal-proof** file is the 18-key
`megacampus.q12.database-barrier-terminal-proof/v1` (fixture `:2366-2397`; frozen barrier
`keys|length==18`, schema, `state=guard_cleanup_complete` at `:2079-2088`) — fixture and frozen
**agree** on the terminal proof shape.

**Does `writers.resume.forward` journal rows here? NO — it is receipt-only (derived, not guessed).**
Two independent frozen constraints force this:

1. The frozen barrier requires the `guard_cleanup_complete`/`barrier.cleanup` rows to be the **last
   contiguous block** in the journal (`indexes == list(range(indexes[0], indexes[-1]+1)) and
indexes[-1] == len(entries)-1`, `q12-database-barrier.sh:511-513`, else "interleaved database
   lifecycle"). Any `writers.resume.*` row appended **after** the cleanup lifecycle would break that
   terminal contiguity and make a subsequent idempotent cleanup re-drive fail closed. So no resume
   row may follow the cleanup segment.
2. The runtime fixture confirms it: `appendDatabaseTerminalLifecycle` journals **only** the
   `barrier.cleanup` lifecycle as the tail, and `q12-writer-resume.py` then **validates** the v2
   receipt (`:1088-1101`) — its journal loop (`:1443-1485`) is a **read-only** re-validation pass
   (it appends parsed rows to an in-memory list, never to disk).

`writers.resume.forward`'s **only** journal rows are the **group-14 forward FWM**
(`prepared_quiesced/intent` + `prepared_quiesced/accepted`, `command_id=writers.resume.forward`),
which are **inside the untouched 76-row prefix** (§5.2 group 14 `:350`; `FWM_ROW_PHASES`
`q12-lifecycle-core.py:74-77`). The post-activate resume child (`sudo source-recovery-run.sh
writers.resume.forward`) then unpauses the writers after validating the v2 receipt, journaling
nothing.

**Who executes the barrier child and when.** After the controller has journaled rows 1–3 (bringing
the journal head to `guard_cleanup_complete`/`capability_claimed`, the boundary the barrier demands
at `:546-553`), the controller invokes the frozen `q12-database-barrier.sh cleanup` directly
(RULING R8-A). The child validates the journal, does the DB cleanup, publishes the terminal proof,
and exits at `:2116` **without writing any `database-barrier-receipt.json`**. The controller then
promotes v1→v2, deletes the db capability, and journals rows 4–5. This split is the concrete
fixture-vs-frozen relationship flagged in §6b.5.

### 6b.2 Part (ii) — Amended recover head-dispatch table (Option A, generalized)

One dispatch table replaces the R5 two-head dispatch (`run_recover`,
`q12-lifecycle-core.py:3723-3734`) **and** the R8-D activate-head branch (`:3735-3743`). The
supported-head set is the set of **clean completed-group boundary heads** of the frozen 76-row
chronology (§3 `:105-112`; the emit order in `run_live` `:3525-3562` + `drive_forward_tail`
`:3366-3397`) plus the new post-activate cleanup heads. Full durable-chain validation
(`Engine` construction + `reload_durable` `:958-991`, which walks every row through
`validate_journal_entry_grammar` and `validate_stable_binding_walk`) runs **before** dispatch, so a
broken/short chain never reaches the table.

> **IMPLEMENTED — R8-I-B (2026-07-18).** The above line refs cite the pre-R8-I-B baseline. As
> built: `drive_forward_tail` is generalized into the shared, resumable `drive_forward_sequence`
> (`q12-lifecycle-core.py:3498`, walking `_FORWARD_STEP_ORDER`), which BOTH `run_live` (`:3632`)
> and `run_recover` (`:3754`) drive. The dispatch table is `_RECOVER_RESUME_FROM` (`:3487`) plus
> the `barrier.cleanup`-any-outcome branch, both consumed at `run_recover:3862`; each maps to the
> `_FORWARD_STEP_ORDER` step to resume from (or `_POST_ACTIVATE_SENTINEL` for the cleanup segment).
> `orchestrate_post_activate_cleanup` (`:3262`) is made resumable (accepted → idempotent no-op;
> mid-cleanup → continue from the interrupted outcome). The R5-D2 pointer text (`:3888`) is amended
> in lockstep: appended ONLY for a mid-lifecycle (claimed-but-not-completed) barrier head.

**Supported heads → resume action:**

| #   | head (phase / outcome / command_id)                                                                        | §5 group | resume action                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | maintenance_guarded / completed / `barrier.install`                                                        | 2        | re-drive forward from group 3 (`writers.quiesce`, incl. the snapshot resource-step before `pg.backup`)                                 |
| 2   | base_migration_guarded / completed / `barrier.verify-after-base`                                           | 7        | re-drive forward from `migration.observability.apply` (group 7 continuation)                                                           |
| 3   | observability_migration_guarded / completed / `barrier.verify-after-observability`                         | 8        | re-drive forward from the `migrations_applied` milestone (group 9)                                                                     |
| 4   | recovery_ready_guarded / completed / `barrier.prepare-recovery`                                            | 10       | re-drive forward from `source.forward` (group 11)                                                                                      |
| 5   | activated / completed / `barrier.activate`                                                                 | 16       | **the last barrier head**: its "tail" is the **journaled cleanup segment** (§6b.1) — re-drive the cleanup lifecycle; **subsumes R8-D** |
| 6   | qdrant_verified / completed / `deploy.prepare`                                                             | 13 (C7)  | `drive_forward_tail(include_fwm=True)` from group 14 (existing R5 checkpoint, `:3723-3728`)                                            |
| 7   | prepared_quiesced / accepted / `writers.resume.forward`                                                    | 14       | `drive_forward_tail(include_fwm=False)` from group 15 `deploy.commit` (existing R5 checkpoint, `:3729-3734`)                           |
| 8   | guard_cleanup_complete / {capability_issued, capability_claimed, capability_completed} / `barrier.cleanup` | post     | re-drive the cleanup segment from the interrupted outcome via the `cutover → cutover-recovery-N` epochs (idempotent, §6b.1)            |

Rows 1–5 are the barrier terminal-group completed heads (all 5 of `OPERATIONS`,
`q12-lifecycle-core.py:27-34`; `TARGET_PHASES` `:93-99`). Rows 6–7 are the two ratified R5
checkpoints, now table rows rather than the special-cased `if` branches. Row 5 **subsumes R8-D**:
the activate head is no longer special-cased against a witness file; it is one supported head whose
resume action is the cleanup segment. **R8-E is subsumed** too — a complete run recovered again
lands on head 5 (or head 8 mid-cleanup) and the re-drive **converges byte/order-identical** to an
uninterrupted run because the cleanup epochs are idempotent; there is no separate "already complete"
witness dispatch.

**Fail-closed (named refusal, never heuristic continuation):**

- **Mid-lifecycle heads** — a `barrier.<op>` head that has **not** reached its clean completed
  boundary (e.g. `…/intent`, `…/capability_claimed` of an in-flight barrier). These keep the
  **standalone supervisor pointer** (`resume_retained_chain` via `q12-live-cutover.sh <op>`); recover
  emits the exact next-step command in its error text (the R5-D2 mechanism, `:3750-3762`). Under
  Option A this composition is now **true**: after the standalone supervisor advances the barrier to
  its completed head, that head is a **supported** table row (1–5), so `recover` continues.
- **Unknown `command_id`** — any head whose command is not in the supported set and not a
  resumable `barrier.<op>` mid-lifecycle → named `LifecycleError` (`:3759-3762`).
- **Broken/short chain** — rejected by the full validation walk during `Engine` construction /
  `reload_durable` (`:958-991`) before dispatch is reached.

**Recover journals nothing extra.** A resumed group journals **exactly** what `run_live` would from
that point (`drive_forward_tail` / the cleanup re-drive reuse the same `ordinary`/`d5`/cleanup
callers), so a resumed run converges **byte/order-identical** to an uninterrupted one — the §10
parity duty holds for `recover` as it does for `live` (§5.6 `:431-440`).

**Doc-forward supersession (§5.5 and the R5-D2 error text) — the governing record.** §5.5's
"Composed recover procedure (RULING 2 option (a))" clause — which fixed `recover`'s supported set to
the two clean forward checkpoints and routed every mid-barrier crash through the standalone
supervisor — is **superseded by this table**. (The witness-era §5.5 activate-head edit from the
withdrawn R8-D round is GONE with the reconciliation reset; it survives only as tag provenance
`r8d-witness-superseded`, not as live design text.) Under this table `recover` resumes from ANY clean
completed-group head, so the mid-barrier two-step composition is now **TRUE by construction and is the
SUPPORTED path**: the standalone supervisor completes a crashed barrier to its `barrier.<op>/completed`
head and `recover` resumes `drive_forward_tail` from the next group. A barrier claimed-but-**not**-
completed (mid-lifecycle) head stays the **fail-closed** supervisor-pointer branch of this one table.
The R5-D2 error-pointer text stays correct for a MID-LIFECYCLE head (keep the supervisor pointer); for
a COMPLETED barrier head it no longer applies (recover resumes directly), so the pointer text is
amended in lockstep with the implementation (it lands with the R8 code, not this document). §5.5 keeps
its original prose plus a one-line pointer to this §6b.2.

### 6b.3 Part (iv) — Impact list on existing R5 / R8-D tests (RATIFIED STRENGTHENING, not weakening)

Updating these fixture-era assertions is **ratified** by RULING R8-A/R8-C and reinstates the
earlier-ratified OQ3; it strengthens the tests to frozen truth. **No test is changed by this
document** — this is the enumerated to-do for the R8 RED step. (Rough locations; the R8 author
re-greps before editing.)

- **`q12-live-controller.test.ts` R5-E assertions** — the "post-activate is receipt-only / `run_live`
  adds **no** journal row after `activate`" and "`output["postActivate"]` records the cleanup
  off-journal" assertions. **Change:** assert the post-activate segment now journals the 5-row
  `guard_cleanup_complete`/`barrier.cleanup` lifecycle + the v2-receipt `accepted` row (§6b.1);
  `writers.resume.forward` stays receipt-only.
- **`q12-live-controller.test.ts` R5-D assertions** — the two-head recover dispatch (`deploy.prepare`
  / `writers.resume.forward`) and the "unsupported head fails closed" cases. **Change:** replace with
  the Option A table (§6b.2): 8 supported heads; barrier completed heads resume; mid-lifecycle heads
  fail closed.
- **`q12-live-controller.test.ts` R8-D assertions** — the witness-file mechanism
  (`post-activate-resume-receipt.json`, `POST_ACTIVATE_RESUME_RECEIPT_*`,
  `validate_post_activate_resume_witness`, `recover_post_activate` present/absent/invalid dispatch,
  `q12-lifecycle-core.py:3144-3248,:3591-3633`). **Change:** the witness-file dispatch is
  **superseded by journal-head-based dispatch** (row 5 of the table); the "already complete" and
  "re-driven" outcomes fold into idempotent cleanup re-drive convergence. The witness-file
  assertions are removed, not merely relaxed.
  **Salvage from the tag.** The full superseded witness implementation + its RED/GREEN/docs TDD
  evidence is preserved at the local tag `r8d-witness-superseded` (commit `14b60142d`, reachable
  after the reconciliation reset). The R8 author SHOULD SALVAGE the reusable **test shapes** that
  carry over unchanged to the journal-based design, reshaping them onto journal-head dispatch: (a)
  the **chain-first** assertion (corrupt a head hash field while leaving `resource_manifest_sha256`
  intact so recover reaches Engine construction, then assert the durable-chain walk fails —
  `journal entry hash mismatch` — BEFORE any dispatch); (b) the **marker-byte-unchanged-after-recover**
  assertion (the 0400 cutover-window marker is untouched by any recover path); (c) the **idempotent
  no-op-success** semantics for a completed run recovered again (now expressed as convergence to the
  identical durable chain, not a witness-file no-op). The witness **mechanism** (the side file, the
  present/absent/invalid tamper dispatch) is NOT salvaged — it is replaced by journal-head evidence.
- **Parity assertions (`q12-live-controller` parity proof)** — the 76-row forward twin parity is
  **untouched** (still scoped to the 76-row prefix, §6a item 4). New parity coverage is **added** for
  the post-activate cleanup segment against the runtime-fixture row-map (§6b.1), not subtracted from
  the prefix.

Ratification basis: this section (§6b) + RULING R8-A/R8-C (2026-07-18). None of these edits touches
the frozen trio, the manifest, or any W-owned file.

### 6b.4 Manifest-append structural investigation (the flagged tension) — verdict: NO manifest change; NOT a hard stop

The orchestrator flagged a possible tension: does any engine append/validation path **structurally
require** `command_id ∈ manifest` for the `barrier.cleanup` rows? Investigation of the append and
journal-grammar paths in `q12-lifecycle-core.py`:

- **Append is manifest-free.** `Engine.append` (`:1395-1449`) writes caller-supplied `command_id` /
  `command_sha256` into the row and performs **no** manifest-membership check; `JOURNAL_KEYS`
  (`:109-129`) carries no manifest constraint. The frozen barrier's own `guard_cleanup_complete`
  journal validator (`q12-database-barrier.sh:446-572`) requires `command_id == "barrier.cleanup"`
  (`:507-508`) and validates schema/chain/epoch/outcome **itself** — it does **not** require manifest
  membership and does **not** bind `command_sha256` to any manifest argv. So the `command_sha256` for
  the cleanup rows is controller-supplied (derivable from the frozen cleanup invocation's own argv),
  and **no manifest entry is needed to append or to validate these rows**.
- **Verdict: `barrier.cleanup` rows CAN be appended and barrier-validated without a manifest command.
  No frozen-manifest change is structurally required. This is NOT a fresh hard stop.**

However, three **Task-9-owned, non-frozen** core paths in `q12-lifecycle-core.py` currently **reject**
these rows and must be **extended** in R8 (this is in-scope core work, not a manifest/frozen change):

1. **`validate_journal_entry_grammar` (`:203-309`, called from `reload_durable:981`)** falls to the
   `else` branch for `command_id="barrier.cleanup"` (`:290-293`: `operation = next((… OPERATIONS …),
None)` → `None`) and raises "journal outcome/phase/command grammar mismatch" (`:308`). R8 must add
   a `guard_cleanup_complete`/`barrier.cleanup` grammar branch mirroring the frozen barrier tail
   grammar (`q12-database-barrier.sh:507-545`) so `recover`/`reload_durable` accept the extended
   journal.
2. **Capability reconstruction (`reload_durable:1071-1087`)** matches a capability's `command_id`
   against `OPERATIONS` (`:1078-1079`) or `ORDINARY_COMMAND_IDS` (`:1084`); `barrier.cleanup` matches
   neither and raises "unknown capability command" (`:1086`). R8 must add the cleanup capability
   class.
3. **The existing lifecycle callers cannot be reused.** `append_ordinary_lifecycle` (`:1635`),
   `retained_chain` (`:2481`), and `append_controller_milestone` (`:2020`) all route through
   `resolved_command` (`:699`, `source = manifest["commands"][command_id]`), which **`KeyError`s** on
   the non-manifest `"barrier.cleanup"`; and `retained_chain` is keyed on `OPERATIONS` (which excludes
   `cleanup`). R8 must journal the cleanup lifecycle through a **new** caller of `Engine.append` fed
   the frozen barrier's own command authority — a new **caller**, not a second journaling/resolver
   authority (`Engine.append` stays the one primitive; §2 / §10 hold).

**Critical guard:** R8 must **not** add `cleanup` to `OPERATIONS` (`:27-34`), because
`MANIFEST_COMMAND_IDS = tuple(COMMANDS.values()) + ORDINARY_COMMAND_IDS` (`:52`) and `load_manifest`
asserts `tuple(manifest["commands"]) == MANIFEST_COMMAND_IDS` **exactly** (`:639`) — so extending
`OPERATIONS` would force `barrier.cleanup` into the manifest and **trip the frozen-manifest hard
stop**. The three extensions above must therefore land **outside** the `OPERATIONS`/`COMMANDS`/
`MANIFEST_COMMAND_IDS` coupling. **If R8 TDD later shows any of these paths genuinely cannot accept
`barrier.cleanup` without a manifest entry, THAT is the fresh hard stop to escalate** (do not resolve
it here).

### 6b.5 Fixture ↔ frozen-barrier agreement / divergence

- **AGREE — journal grammar.** The runtime fixture's cleanup lifecycle
  (`qdrant-source-recovery-runtime.test.ts:2154-2434`) matches the frozen barrier grammar
  (`q12-database-barrier.sh:507-553`): terminal-contiguous `guard_cleanup_complete`/`barrier.cleanup`
  block, `intent.capability_manifest_sha256 == 0×64`, single-capability binding per epoch, all
  intermediate `accepted_object_kind == none`, consecutive `cutover → cutover-recovery-N` epochs.
- **AGREE — terminal proof.** 18-key `megacampus.q12.database-barrier-terminal-proof/v1`,
  `state=guard_cleanup_complete` (fixture `:2366-2397` ↔ frozen `:2076-2112`, esp. `keys|length==18`
  at `:2083`).
- **AGREE — v2 receipt shape (as consumed).** The fixture-written v2 receipt (`:2415-2426`) is exactly
  the 10-key `database-barrier-receipt/v2` the frozen resume gate requires
  (`q12-writer-resume.py:1090-1101`).
- **DIVERGE (flagged) — who writes the v2 receipt.** The frozen barrier `cleanup` subcommand writes
  **only** the terminal proof and **`exit 0`s at `q12-database-barrier.sh:2116`** — it never writes
  `database-barrier-receipt.json` (the generic v1 receipt writer at `:2119-2147`, `RECEIPT_SCHEMA =
…/v1` at `:9`, is unreachable for `cleanup`/`rollback`, which exit first). It also does not delete
  the db capability. The runtime fixture **synthesizes** the v2 receipt, the v1 archive, the
  capability deletion, and the completed/accepted journal rows itself (`:2182-2187,:2397-2434`). So in
  the **real** path the v1→v2 receipt promotion, the db-capability deletion
  (`q12-writer-resume.py:1072-1075` requires it absent), and rows 4–5 are **Task-9 controller** steps,
  not the frozen barrier's. This is exactly what the ruling's "promote the v1 receipt to the v2
  receipt (exact 10-key schema)" means. It is **not** a frozen-byte change (the v2 receipt is written
  by the controller to the run root; the barrier bytes are untouched), but it **is** a real
  fixture-vs-frozen split the R8 build must implement, and the frozen barrier **alone** cannot satisfy
  the resume gate.

### 6b.6 Required acceptance probes (composed mid-barrier recovery — the ratified R8-C obligation)

The deferred R8-C fixture probe becomes a **REQUIRED acceptance test** of the R8 amendment round: the
composed procedure §5.5 promises must be **proven** on a single durable journal, not just asserted in
prose. Minimum coverage — **one probe per barrier head class**:

1. **install** (first barrier, group 2), 2. **verify-after-base** (a mid-forward barrier, group 7),
2. **activate** (the last barrier, group 16 → the journaled post-activate cleanup segment, §6b.1).

Each probe: drive `run_live` (fixture executors) to a full uninterrupted run and snapshot its durable
journal as the **independent twin**; then, on a fresh root, drive `run_live` with a mid-barrier crash
for that op (leave the barrier claimed-but-not-completed); run the **standalone supervisor** for that
op (`q12-live-cutover.sh <op>` → `run_supervisor`, idempotent `resume_retained_chain`) to complete the
barrier to its `barrier.<op>/completed` head; then run `recover`, which per §6b.2 resumes the shared
`drive_forward_sequence` from the next group (for `activate`, this drives the journaled cleanup
segment). Also assert the mid-lifecycle (claimed-but-not-completed) head, BEFORE the supervisor step,
fails closed with the supervisor-pointer refusal AND leaves the durable journal byte-unchanged.

> **NOTE — REAL scope of these probes (found-defects #18/#19, ratified 2026-07-19; R8-B-2-iv).** The
> DERIVED recovery-epoch oracle below (`recovery_reacquired` + a second `capability_claimed` under
> `cutover-recovery-1`, +2 rows) is proven at the **FIXTURE** level for install/verify-after-base/
> activate (the fixture executors synthesize the recovery-epoch barrier result). Against the **real
> frozen barrier + frozen controller** the composed supervisor→recover recovery-epoch story is NOT
> reachable from the controller fusion, in BOTH directions: **forward ops** — the controller mints the
> recovery epoch but the frozen barrier `install` child rejects a recovery-epoch input checkpoint
> (`q12-database-barrier.sh:421/432/439`; #18, empirically confirmed); **cleanup** — the frozen barrier
> cleanup child ACCEPTS a recovery epoch (`:444-598`, `:514-518`) but the controller NEVER mints one
> (`barrier.cleanup ∉ OPERATIONS`, `q12-lifecycle-core.py:27-33`/`:4058-4065`; cleanup driver hardcoded
> cutover-only `:1791/1797/1808/1814/1838`; #19). Therefore the REAL (disposable-container fusion)
> coverage is: (a) the mid-forward-crash → NAMED fail-closed refusal (delivered, R8-B-2-iv-2); and
> (b') the REAL **cutover** cleanup-crash `recover` convergence — `run_recover` resumes the cleanup
> segment under `cutover` (no supervisor, no recovery epoch), converging **+0** to the uninterrupted
> twin (delivered GREEN, `q12-live-real-cleanup-recovery.test.ts`, the real twin of the fixture head-8
> precedent `q12-live-controller.test.ts:1046`). The recovery-epoch composed probe (+2) and the
> multi-epoch `cutover-recovery-2` cleanup re-drive are inherently **W-side / server-custody** and are
> **DEFERRED to the server rehearsal**, which MUST exercise the recovery-epoch cleanup leg (supervisor-
> or W-side-minted per its own contract) so the defer lands.

**The acceptance oracle is the DERIVED expected journal (condition 4 below is the SOLE primary
oracle), NOT byte-equivalence to the uninterrupted twin.** Construct the expected journal IN THE TEST
(never by running the composed procedure) as: the uninterrupted `run_live` twin, with — at the resumed
barrier group ONLY — the ratified recovery-shape **INSERTION**: keep the pre-crash rows byte-as-is
(`intent`/cutover, `capability_issued`/cutover, `capability_claimed`/cutover); INSERT
`recovery_reacquired`/`cutover-recovery-1` + a SECOND `capability_claimed`/`cutover-recovery-1`
immediately AFTER the pre-crash `capability_claimed/cutover`; the barrier's `completed` row's
`lease_epoch` steps to `cutover-recovery-1`. Everything OUTSIDE that barrier group is byte/order-
identical to the twin. Then assert:

1. **Full-row-byte equality**: composed == derived, under the EXISTING field-level exclusions only
   (`capability_manifest_sha256`, `entry_hash`, `previous_hash`, `resource_manifest_sha256` at its
   established row scoping, the FWM/cleanup row-scoped `accepted_object_sha256`/`command_sha256`).
   `lease_epoch` is **NOT** excluded — asserted exactly (cutover for pre-crash rows,
   `cutover-recovery-1` for the inserted + completed rows; consecutive per the frozen grammar
   `q12-database-barrier.sh:514-518`). The two INSERTED rows are asserted as FULL row shapes (phase,
   outcome, command_id, command_sha256, epoch, accepted-object fields), not mere presence.
2. **Explicit row-count arithmetic**: composed == uninterrupted + 2 per resumed barrier (83 vs 81 for
   one resumed barrier).
3. **Non-circularity** holds by construction: expected derives from the INDEPENDENT twin + the ratified
   recovery-shape CONSTANTS (pinned by `q12-live-cutover.test.ts:94-132` + the frozen epoch grammar),
   NEVER from running the composed procedure.

> **⚠ PRE-MERGE REVIEWER FLAG (ratified design-text change, covered by the R8-C ruling).** The
> acceptance-oracle wording above was CHANGED from "byte-equivalent to the uninterrupted twin" to the
> derived-journal oracle. Two found defects made the prior oracle candidates unsatisfiable and are
> recorded here with provenance:
>
> - **Found defect #11 — uninterrupted-equality is unsatisfiable.** The composed probe is a
>   **two-process lease reacquisition**: the crash-at-`capability_claimed` `run_live` exits (releasing
>   the canonical lease) and a SEPARATE `q12-live-cutover.sh <op>` supervisor process reacquires it
>   (`q12-lifecycle-core.py:3922` sets `lease_reacquired = new_session and bool(engine.journal)`), so
>   the resumed barrier completes under `cutover-recovery-1` with EXTRA rows (`recovery_reacquired` +
>   a second `capability_claimed`) and can NEVER equal an uninterrupted twin. The two-process contract
>   is pinned by `q12-live-cutover.test.ts:94-132`.
> - **Found defect #12 — in-process-reissue-equality is unsatisfiable.** An in-process
>   `recoveryReissues=1` twin (`retained_chain:2258-2298`) emits a SINGLE claim under the recovery
>   epoch and never emits/preserves the pre-crash `capability_claimed/cutover` row, whereas the
>   two-process crash-at-claimed preserves that pre-crash row append-only — so they differ by one row.
>
> The COMPOSITION is CORRECT (it matches the pinned two-process contract `q12-live-cutover.test.ts:94-132`);
> only the oracle spec was corrected. No `run_live`/`run_joined_composer`/`retained_chain`/recover-
> dispatch/cleanup-grammar body changed; the fixture leg is test/fixture/docs only.

If any class does not compose end-to-end (composed ≠ derived), that is a **found defect** to
STOP-and-report before fixing (per the R8-C ruling), not a silent workaround. The real-PG17 leg of
these probes (`MC2_Q12_REAL_PG17=1`) is the downstream R8-B/real-execution round; the fixture leg is
required by THIS amendment's implementation. **IMPLEMENTED R8-I-C** (fixture leg): the composed crash
seam is the scoped `barrierClaimCrash` (`frontier_claim_command`/`frontier_claim_fault="claim-row"`),
the standalone-supervisor step is the `supervisorController` fixture entrypoint
(`run_supervisor_controller_fixture`), and the three probes + fail-closed legs live in
`q12-live-controller.test.ts` (R8-I-C describe block).

## 7. Bounded implementation (see the companion plan)

`docs/superpowers/plans/2026-07-17-q12-live-controller.md` bounds the work into TDD
rounds (RED→GREEN→docs each), all local + tests, frozen bytes untouched, composer as
oracle, reusing the plan-mode primitives. Round 0 is the OQ1 escalation gate; no round that
depends on C2 quiesce may start until OQ1 is ratified.

---

## 8. Verification of this design

- Every claim carries a file:line citation from bytes proven identical across this
  worktree and the stage tree (six source files match by sha256).
- No code changed; no frozen byte touched; no server/db/ssh/docker command run.
- `python3 scripts/orchestration/validate_artifact.py` is not applicable (this is a
  `docs/superpowers/specs` design doc, not a stage artifact); the companion plan carries
  the round-by-round verification contract.
