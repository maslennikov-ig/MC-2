---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-live-controller-design-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/self-hosted-qdrant-platform
base_branch: master
base_commit: 9d74abc2
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only design review; single write is this artifact. No code/config/docs modified, no server/db/docker command run.'
risk_level: medium
verification:
  - 'Read both docs at HEAD 9d74abc2: docs/superpowers/specs/2026-07-17-q12-live-controller-design.md and docs/superpowers/plans/2026-07-17-q12-live-controller.md.'
  - "Confirmed the design's citation base is trustworthy: 5e0574b4 (its stage reference) IS an ancestor of HEAD 9d74abc2, and q12-lifecycle-core.py + q12-source-manifest.ts are byte-identical between them (empty git diff), so every cited line resolves against the bytes I read."
  - 'Frozen bytes at 9d74abc2: barrier 134255ce…, manifest aaec6fc2…, structural-catalog 0b8a943f… (all match).'
  - 'Verified grammar/walk claims against bytes: ORDINARY_ROW_GRAMMAR (:56-69), validate_journal_entry_grammar (:202-308) incl. writers.quiesce 5-outcome + accepted-binds-writer_quiesce_manifest, validate_stable_binding_walk (:311-368) two-segment quiesce switch + resource stepping only at pg.backup/intent and deploy.prepare/completed + request-global first/last pin.'
  - 'Verified OQ1 conflict on real bytes: amendment §5 group 3 = writers.quiesce (:214) vs q12-writer-resume.py run_quiesce() gate requiring state=recovery_ready_guarded / last_command=prepare-recovery (:316,:328-331) — a genuine contradiction.'
  - 'Found a SECOND recovery_ready_guarded coupling the design does not cite: the resume-side writer-quiesce-manifest barrier-binding validation (q12-writer-resume.py:1245-1246) + the forward probe binding (:1247-1248).'
  - 'Verified authority + primitives: §7.6 same-production-serializer authorization (amendment :420), §10 no-second-authority (:485-496), Engine production seam __post_init__ (:798-808), append_ordinary_lifecycle (:1619) / derive_root_writer_inventory (:1718) / publish_final_writer_manifest (:1881) / append_controller_milestone (:1988) / retained_chain (:2051), resume_retained_chain idempotence (:2177), supervisor cutover.lock LOCK_EX|LOCK_NB (:6141-6147), _open_snapshot_coordinator (:5718).'
  - 'Verified OQ6: q12-source-manifest.ts validateTransition (:1257, invoked :1454) requires full baseline rows — 8 cron_jobs with active flag (:1264-1277), database.settings/size_bytes (:1280-1296), full q12_guard schema/relations (:1298-1330); the barrier baseline is digests-only (q12-database-barrier.sh:657-661), so baseline.json is not projectable — the OQ6 claim holds.'
  - "Scope addition (HEAD 4f21b93b): reviewed docs/superpowers/specs/2026-07-17-q12-quiesce-window-mode-note.md (OQ1 mechanism). Verified the argv-flag-impossibility reasoning (writers.quiesce argv/env are frozen manifest bytes bound into command_sha256) and traced run_quiesce()'s inputs (:316-345 — it already holds run_root/run_id and applies owner/mode/NOFOLLOW discipline, so the marker read is feasible)."
  - 'Verified from frozen barrier bytes that the maintenance_guarded/install receipt carries rollback_probes_verified==false and probe_receipt_sha256==null (q12-database-barrier.sh:304-305,:681-685,:2124), so the cutover-mode gate must relax those two fields too — not only state/last_command.'
  - 'Did NOT run any server/db/ssh/docker command (constraint).'
changed_files:
  - docs/superpowers/specs/2026-07-17-q12-live-controller-design.md
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-writer-resume.py
  - deploy/postgres/q12-source-manifest.ts
  - deploy/qdrant/q12-database-barrier.sh
  - deploy/qdrant/q12-command-manifest.json
  - docs/superpowers/specs/2026-07-17-q12-quiesce-window-mode-note.md
  - docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md
explicit_defers:
  - 'P2-1: OQ1 W-amendment scope understated — the resume-side quiesce-manifest barrier binding (q12-writer-resume.py:1245-1248) is a second recovery_ready_guarded/probe_receipt coupling that the mode-aware amendment must also relax; expand the OQ1 escalation memo and the W-stream task before the owner scopes the amendment.'
  - 'P2-1b (mode-note): the marker channel is endorsed, but the cutover-mode run_quiesce gate must also relax rollback_probes_verified (True→False) and probe_receipt_sha256 (hex64→null) — both are false/null at maintenance_guarded/install and part of the SAME gate; the note lists only state/last_command. The marker must also be consulted at resume time (:1245-1248) and the cutover-mode quiesce-manifest barrier-binding shape defined.'
  - "P3-1: §5.4 does not specify the controller's cutover.lock posture during its OWN ordinary-lifecycle journaling (only around quiesce/resume/supervisor); clarify in R1's seam design (backstopped today by predecessor-CAS + O_APPEND|O_DSYNC + sequential flow)."
  - 'P3-2: R3 should add an explicit per-supervisor-invocation resource_manifest_sha256 assertion (install→genesis, verify-after-*→snapshot, activate→targets) so a stale per-invocation value is caught in test, not only as a run-time fail-closed abort.'
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
No P0, no P1. Findings: one P2 (OQ1 scope — now covering both the live-controller
design and the quiesce-window-mode note, with concrete sub-points) and two P3
(clarifications). **Nothing invalidates rounds 1–3** — they are genuinely
OQ1-independent and safe to run in parallel, and no design element forces a
frozen-byte change. The quiesce-window-mode note's core choice (an out-of-band,
caller-declared run-root marker rather than a frozen-manifest argv flag or a
journal inference) is **endorsed**; the finding is that it understates the gate/
resume relaxation surface (see the scope-addition section).

The design is rigorous and citation-accurate: its reference commit (5e0574b4) is an
ancestor of the current HEAD and the two heavily-cited source files are byte-identical
between them, so every file:line I spot-checked resolves against the real bytes. The
core compliance claims hold: the controller drives the **same** Engine
(`production:true`), the **same** `load_manifest`/`resolved_command`, and the **same**
`append_ordinary_lifecycle`/`retained_chain`/`append_controller_milestone`/
`publish_final_writer_manifest` primitives — no second authority, exactly what §7.6
(`:420`) authorizes and §10 (`:485-496`) requires, with `run_joined_composer` as the
byte/order parity oracle. Every §5.2 row is emitted through those existing primitives at
their existing phases, so none violates `validate_journal_entry_grammar` or
`validate_stable_binding_walk` (the two-segment quiesce switch and the two-witness
resource stepping match the walk exactly). OQ2–OQ6 are soundly resolved with no frozen
change, and OQ6's "digests-only baseline is insufficient" is verified against
`validateTransition`.

**OQ1 is a real, correctly-escalated hard stop**, not a false alarm: the frozen §5
group-3 quiesce placement contradicts `run_quiesce()`'s `recovery_ready_guarded` gate,
and the design does not silently pick. The owner's mode-aware ruling is sound in
principle (join-era quiesce is still on a **guarded** database — `install` installs the
guard — and the standalone D4 recovery flow is preserved by keeping the strict gate in
recovery mode). **The one material finding (P2-1)** is that the OQ1 W-amendment surface
is larger than the design states: a **second** `recovery_ready_guarded` + probe-receipt
coupling lives in the resume-side quiesce-manifest validation (`q12-writer-resume.py:1245-1248`)
and must also be made mode-aware, or the join flow's `writers.resume.forward` fails
closed even after the OQ3 cleanup receipt. This widens the owner's ruling / W-stream
scope; it does **not** invalidate rounds 1–3 (which use a fixture quiesce manifest and
never execute the live quiesce/resume).

# Verification

## Authority (§10) and primitive reuse — compliant

- Engine production seam (`__post_init__:798-808`): `production is True` ⇒ run root must be
  `/opt/megacampus/backups/q12/<run-id>`, else fixture `/tmp/mc2-q12-d5-root-*` — so R1's
  "`live` fails closed without production/production-root" is a real, testable gate.
- The five journaling primitives the design reuses all exist at the cited locations, and
  `run_joined_composer` (`:2885`) already drives them for the closed fixture; the live
  controller adds only real inputs + real child execution + real supervisor invocations,
  which §7.6 (`:420`) authorizes as "the same production serializer, capability, object,
  and checkpoint primitives." No new resolver/manifest/command/journal authority. Sound.

## Grammar and stable-binding compatibility — no violation

- `validate_journal_entry_grammar` (`:265-277`) pins `writers.quiesce` to phase `quiesced`
  with the 5-outcome shape and the `accepted`⇒`writer_quiesce_manifest` binding; §5.2
  group 3 matches. Ordinary rows (`:278-288`), controller milestone
  (`migrations_applied`→`migration.observability.apply`, `:71,:286`), and supervisor rows
  (`:289-306`) all match the phases §5.2 assigns.
- `validate_stable_binding_walk` (`:325-341`) switches `quiesce_manifest_sha256` from
  {ZERO|expected} to strictly `expected` at `writers.quiesce/accepted` — matching §4/§5.2.
  Resource stepping (`:342-356`) is permitted only at `pg.backup/intent` or
  `deploy.prepare/completed`, and the request-global value is pinned to `entries[0]` or
  `entries[-1]` (`:357-368`). OQ4's genesis→snapshot→targets three-value walk fits exactly,
  provided each supervisor invocation carries the then-current tail value (see P3-2).

## OQ1 conflict is real; owner ruling is sound but under-scoped (P2-1)

- Amendment §5 (`:214`) places `writers.quiesce` at group 3 (D4 5-outcome lifecycle);
  `run_quiesce()` (`q12-writer-resume.py:316`) refuses unless `state==recovery_ready_guarded`
  and `last_command==prepare-recovery` (`:328-331`) — which only exists after group 10. The
  contradiction is genuine and correctly flagged as a hard stop with "do not touch the W
  file."
- The owner's mode-aware ruling does not weaken the D4 guarantees: at `maintenance_guarded`
  the guard **is** installed (so it is not "quiescing without a guarded database"); the
  relaxed `rollback_probes_verified` precondition is compensated by the group-4 `pg.backup`
  rollback anchor plus the `recover`/rollback path; recovery mode keeps the strict gate, so
  the standalone D4 flow is untouched; "no silent either-or" (explicit caller-declared mode)
  prevents an accidental wrong gate. Sound — **subject to P2-1 and to retaining the
  `zero_guard_residue is False` + capability-present checks in join mode.**
- **P2-1 detail:** the resume path re-validates the writer-quiesce manifest's recorded
  barrier binding at `q12-writer-resume.py:1245-1246`
  (`quiesce["barrier"]["state"]=="recovery_ready_guarded"` **and**
  `hex64(...probe_receipt_sha256)`), and forward mode additionally binds
  `quiesce["barrier"]["probe_receipt_sha256"]==barrier["probe_receipt_sha256"]` (`:1247-1248`).
  A join-era quiesce at `maintenance_guarded` records a `maintenance_guarded` barrier binding
  with no/￭different probe receipt, so `writers.resume.forward` fails closed here regardless
  of the OQ3 cleanup receipt. The mode-aware amendment must relax/mode-gate this second point
  too; the design's OQ1 recommendation cites only `run_quiesce()`'s gate.

## OQ2–OQ6 — sound

- OQ2 (reuse Engine): §7.6-authorized; composer stays the oracle. ✓
- OQ3: `barrier.cleanup`/`rollback` is a **deployed barrier-script subcommand**
  (`q12-database-barrier.sh:2114`), not a manifest command (0 manifest hits) ⇒ no frozen
  change; the v2 `guard_cleanup_complete` receipt then satisfies the resume-forward v2 gate
  (`q12-writer-resume.py:1060-1076`); FWM via `publish_final_writer_manifest` +
  `derive_root_writer_inventory` fed real bytes. ✓ (but see P2-1 for the quiesce-binding gate
  that still blocks forward resume in the join flow.)
- OQ4: with the controller journaling the ordinary rows, the two stepping witnesses exist;
  the 2-step checkpoint-bound resource manifest mirrors the composer's snapshot/targets steps
  and is walk-legal. ✓
- OQ5: `_open_snapshot_coordinator` (`:5718`) exports a snapshot and holds the session open;
  cross-session snapshot import (`SET TRANSACTION SNAPSHOT`) is valid while the exporter stays
  open, so holding it across the child `pg.backup` (groups 4→5) is correct — the same proven
  plan-mode pattern. ✓
- OQ6: verified — `validateTransition` (`:1257`, invoked `:1454`) requires full baseline
  rows (8 cron_jobs with `active`, database `settings`/`size_bytes`, full q12_guard
  schema/relations, `:1264-1330`); the barrier baseline is digests-only
  (`q12-database-barrier.sh:657-661`), so `baseline.json` cannot be projected and the
  controller's direct full-structural capture is required. ✓

## Identity / lease / resume — sound

- The supervisor takes `cutover.lock` `LOCK_EX|LOCK_NB` on FD 9 per invocation (`:6141-6147`),
  so the controller MUST release FD 9 before each supervisor call (a held FD-9 OFD would
  block it) — exactly §5.4. `resume_retained_chain` (`:2177`) is idempotent (completed
  operation ⇒ no-op; else reuse the durable result or re-delegate), matching §5.5. ✓ (See
  P3-1 for the controller's own-journaling lock posture.)

## Plan bounding — correct

- R0 = OQ1 escalation (no code). R1–R3 (skeleton + genesis parity; snapshot coordinator +
  `baseline.json`; resource-manifest 2-step) never execute the live quiesce/resume — they use
  a fixture quiesce manifest (as the composer does) and disposable PG17 sources — so they are
  genuinely OQ1-independent and safe to run now. R4–R8 are likewise journaling/producer parity
  rounds; only the live **window opening** is OQ1-gated, consistent with the plan's Round-0
  dependency note. The per-round verification contract (real-PG17 + no-docker + tsc +
  frozen-byte identity + composer parity + no W-file change + `validate_artifact.py`) is
  complete.

# Risks / Follow-ups

- **P2-1 (confidence high) — OQ1 W-amendment scope is understated.** The mode-aware
  relaxation must cover BOTH `run_quiesce()`'s receipt gate (`q12-writer-resume.py:316,:328-331`)
  AND the resume-side quiesce-manifest barrier-binding validation (`:1245-1246`) plus the
  forward probe binding (`:1247-1248`); otherwise the join flow's `writers.resume.forward`
  fails closed even after the OQ3 cleanup receipt. Also decide what barrier state /
  probe-receipt the join-era quiesce manifest should record. Next action: expand the OQ1
  escalation memo and the filed W-stream task to enumerate this second coupling before the
  owner finalizes the ruling. Does not block R1–R3.

- **P3-1 (confidence medium) — controller lock posture during its own journaling.** §5.4
  specifies FD-9 custody around quiesce/resume and release before supervisor invocations but
  is silent on whether the controller holds `cutover.lock` while appending its OWN ordinary
  rows. Not a correctness hole (predecessor-CAS + `O_APPEND|O_DSYNC` + strictly sequential
  flow), but specify it in R1's seam for symmetry with the supervisor's exclusive lock.

- **P3-2 (confidence low) — per-invocation resource-hash assertion.** The request-global
  resource-manifest pin (`:357-368`) means each supervisor invocation must carry the current
  stepped tail value; R3's RED should assert install→genesis, verify-after-\*→snapshot,
  activate→targets and that a stale value fails the walk, so a mis-stepped invocation is
  caught in test rather than only as a run-time abort.

- **Informational — OQ1 remains the single window-open blocker.** Per the design and the
  owner ruling, the window cannot open until the mode-aware W-contract amendment (scoped per
  P2-1) is ratified and delivered by the W stream; R1–R8 proceed as journaling/producer
  parity work in the meantime.

# Scope addition — OQ1 quiesce-window-mode note (HEAD 4f21b93b)

`docs/superpowers/specs/2026-07-17-q12-quiesce-window-mode-note.md` proposes the
concrete OQ1 W-amendment mechanism. Verdict on the note: the **channel is correct
and endorsed**; the **gate-relaxation surface it describes is incomplete** (a
sharper, byte-grounded version of P2-1). This does not change the overall PASS/PASS
or the R1–R3 safety conclusion — the note is a NOTE, and these are completeness
items the W-amendment design must close before it is implemented.

## Endorsed: the out-of-band marker channel

- **Argv-flag impossibility is correct.** `writers.quiesce` resolves to a frozen
  manifest command whose canonical argv/env bytes are bound into `command_sha256`
  (`resolved_command`/`load_manifest`); a `--window-mode` argv element or a new env
  key would change `q12-command-manifest.json` (`aaec6fc2…`) — a hard stop — and
  break executed-vs-journaled byte parity. So the mode must enter out-of-band. ✓
- **Marker over journal-inference is the right call.** A dedicated
  `quiesce-window-mode.json` (schema + exact `mode` enum + `run_id` match + 0400 +
  uid/gid 1000 + `S_ISREG`/`O_NOFOLLOW`, written once) is an explicit declaration
  with a small, strictly-validatable surface; inferring the window kind by parsing
  `phase.jsonl` couples the security gate to the journal parser and is implicit.
  `run_quiesce()` already holds `run_root`/`run_id` and applies exactly this
  owner/mode/symlink discipline to its other inputs (e.g. the db-capability check
  `q12-writer-resume.py:337-344`), so the marker read is feasible in place.

## Failure-mode probes (all fail closed)

- **Forgotten marker in a cutover run:** absence ⇒ recovery gate ⇒ requires
  `recovery_ready_guarded`/`prepare-recovery`; at group 3 the receipt is
  `maintenance_guarded`/`install`, so the gate **refuses** the quiesce. Fail closed. ✓
- **Stray/stale `cutover` marker in a recovery-state run root:** the gate still
  validates the exact receipt state, so a `cutover` marker with a
  `recovery_ready_guarded` receipt fails the `state==maintenance_guarded` check ⇒
  refuse. The marker selects _which_ state is required; it never bypasses the
  receipt, the guard, the FD-9 lease, or the root-run source-recovery child. Fail
  closed. ✓
- **Cross-run reuse:** run roots are per-run-id (`/opt/megacampus/backups/q12/<run-id>/`)
  and the marker carries a `run_id` the gate must match, so a later run-id neither
  inherits nor matches a prior marker. Load-bearing: the amendment MUST enforce the
  `run_id` match and rely on fresh per-window run-ids (both already true for the
  controller's UUID run-ids). ✓
- **Recovering an aborted cutover** (same run-id) correctly keeps the `cutover`
  marker and uses the cutover gate — that is the join flow's own recover path, not
  the standalone D4 recovery (which uses a different run-id and no marker). No
  cross-contamination.

## The incompleteness (P2-1, made concrete and byte-grounded)

The note scopes the amendment as "`run_quiesce` gate (state/last_command) + marker
read + its pinned test." Two load-bearing pieces are missing:

1. **The cutover-mode `run_quiesce` gate must relax two MORE fields.** The current
   gate (`q12-writer-resume.py:325-335`) also requires `rollback_probes_verified is
True` and `hex64(probe_receipt_sha256)`. From the frozen barrier bytes, the
   `maintenance_guarded`/`install` receipt carries `rollback_probes_verified=false`
   (`q12-database-barrier.sh:304`) and `probe_receipt_sha256=null` (`:2124`, and the
   barrier's own validator pins this pairing at `:681-685`). So the cutover gate can
   only pass if it ALSO accepts `rollback_probes_verified==false` and a null
   `probe_receipt_sha256` — while retaining `zero_guard_residue is False` and the
   db-capability check as the note says. Relaxing `rollback_probes_verified` is
   sound in the join order (rollback is proven later at `prepare-recovery`, with the
   group-4 `pg.backup` snapshot as the anchor), but the note must say so explicitly.

2. **The resume-side coupling must be made mode-aware too.** The
   `writers.resume.forward` path independently re-validates the quiesce manifest's
   recorded barrier binding at `q12-writer-resume.py:1245-1246`
   (`state=="recovery_ready_guarded"` AND `hex64(probe_receipt_sha256)`) and, for
   forward, binds `quiesce["barrier"]["probe_receipt_sha256"]==barrier["probe_receipt_sha256"]`
   (`:1247-1248`). A cutover-mode quiesce at `maintenance_guarded` records a
   `maintenance_guarded` barrier binding with a null probe receipt, so resume fails
   closed here even after the OQ3 cleanup receipt. The amendment must therefore also
   (a) make `:1245-1248` mode-aware — reading the same persisted run-root marker at
   resume time — and (b) define exactly what a cutover-mode quiesce manifest records
   for `barrier.state`/`barrier.probe_receipt_sha256` and how forward-resume binds
   it (e.g. to the probe receipt that exists by resume time). The note's "Boundaries
   / write zone" (`run_quiesce` gate + marker read) should be widened to include the
   resume-side binding and the quiesce-manifest barrier-binding shape.

## Net

The mode marker is the correct mechanism and its fail-closed behavior checks out on
every probed path. Before the W-amendment round starts, its design must enumerate
the full relaxation surface: `run_quiesce` (state + last_command + rollback_probes_verified

- probe_receipt_sha256), the resume-side quiesce-manifest binding (`:1245-1248`) with
  a resume-time marker read, and the cutover-mode quiesce-manifest barrier shape — plus
  both the retained-recovery frozen test and the new cutover-mode test. None of this
  touches a frozen byte, and none of it gates R1–R3.
