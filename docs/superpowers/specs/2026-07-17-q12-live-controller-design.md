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
