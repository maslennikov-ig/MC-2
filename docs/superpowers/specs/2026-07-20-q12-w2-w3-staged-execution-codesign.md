# Q12 W2+W3 Staged-Execution Co-Design (the focused design pass §W2/§W3 called for)

- Date: 2026-07-20
- Stage: `mc2-jz6y0`; tracking bead `mc2-uha77`; W2 `mc2-j58wi`, W3 `mc2-58tnx`
- Branch: `codex/self-hosted-qdrant-platform`; worktree `.worktrees/self-hosted-qdrant-platform`
- Predecessor design: `docs/superpowers/specs/2026-07-19-q12-window-execution-wiring-design.md`
- Command/placeholder contract: `docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md`
- Verified at HEAD `ffb7da5fc` (after W4). All `file:line` are `deploy/qdrant/q12-lifecycle-core.py`
  unless noted.

## 0. Why this doc exists

The window-execution wiring plan framed W2 (real values), W3 (snapshot coordinator +
baseline.json), and W4 (stop-after) as independent slices. W1 delivery proved that framing wrong
for W2/W3: the controller only **composes** the journal (freezing argv per D5J), while ordinary
commands **execute out-of-band** through a separate `claim` entrypoint that **re-resolves argv from
manifest+request and byte-binds** `command_sha256`. Real placeholder values are therefore not all
known at a single upfront compose, and turning them real breaks the closed-composer byte-parity
oracle — a public/acceptance-contract change flagged under the orchestrator Stop rule. W4 was
carved off and delivered independently (`ffb7da5fc`). This doc is the co-design for the remaining
coupled W2+W3 core.

## 1. Verified current state (grounded)

1. **OQ5 + OQ6 primitives already exist — but only on the plan executor.**
   `LivePlanExecutor` (`:6047`) owns `_open_snapshot_coordinator` (`:6840`: `BEGIN ISOLATION LEVEL
REPEATABLE READ READ ONLY; SELECT pg_export_snapshot()`, held open, bounded 30s wait, fail-closed
   on dead/ malformed id) and `produce_run_root_baseline` (`:6917`, explicitly "OQ6": captures the
   pre-maintenance source baseline through the held snapshot via `q12-source-manifest.ts capture`
   and publishes `<run-root>/baseline.json` immutably `0400`). These are real and work under the
   `MC2_Q12_REAL_PG17` container tests.

2. **The window executor has no snapshot/baseline capability.** The window runs through
   `ProductionExecutor` (`:760`) / `OwnerCustodyExecutor` (`:915`) via `run_live`/`run_recover`.
   Neither references `_open_snapshot_coordinator` nor `produce_run_root_baseline`. `pg.backup` q12
   mode (`backup-supabase.sh`, invoked by `ProductionExecutor.execute` shelling `command["argv"]`)
   expects a live exported snapshot id and reads `<run-root>/baseline.json` — nothing produces
   either on the window path today.

3. **The window's `<exported-id>` is fixture-derived.** `SUBSTITUTION_PLACEHOLDERS` includes
   `<exported-id>` (`:698`); its value comes from `derive_joined_fixture_values` (`:720`:
   `f"{snapshot[0:8]}-{snapshot[8:16]}-1"`, `snapshot` a fixture constant). `run_live` reads
   `exported_id = values["<exported-id>"]` (`:4018`; recover `:4144`) and threads it into the
   `pg.backup` resource-manifest step (`:3833`) and `deploy.prepare` targets (`:3841`). So the
   composed journal and the (out-of-band) pg.backup execution both key off a **non-existent**
   snapshot on a real run.

4. **Two substitution sources, by design.** `ordinary(...)` lifecycle commands substitute from the
   `values` dict via `append_ordinary_lifecycle` (`:3990`/`:4131`); `d5(...)` / FWM commands resolve
   from `request` via `resolved_command` (`:3985`,`:3852`,`:4127`). W2 must feed real values into
   **both** where a placeholder is consumed.

5. **Staged authorities (each re-verified against the manifest + shells).** Forward order:
   `pg.backup → pg.restore → migration.base/observability → prepare-recovery → source.forward →
reindex.plan → reindex.worker.create → reindex.execute → reindex.verify → deploy.prepare →
deploy.commit`.

   | Placeholder                                                   | Real authority                                                                      | Known                |
   | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------- |
   | `<quiesce-manifest>`                                          | `<run-root>/writer-quiesce-<run-id>.json` (writers.quiesce)                         | UPFRONT (operator)   |
   | `<recovery-run-id>`                                           | accepted `.13.4.1` source-recovery run id                                           | UPFRONT (pre-window) |
   | `<exported-id>`                                               | live `pg_export_snapshot()` held across pg.backup (**W3/OQ5**)                      | at pg.backup open    |
   | `<immutable-generation>`                                      | generation dir printed by the fresh pg.backup (`restore-supabase-drill.sh:302-303`) | AFTER pg.backup      |
   | `<accepted-recovery-manifest-sha256>`                         | `sha256(/var/lib/megacampus-source-recovery/state/manifest.json)`                   | AFTER source.forward |
   | `<accepted-coverage-fingerprint>` / `<accepted-coverage-run>` | accepted coverage `org:course:run` from the recovery journal                        | AFTER source.forward |

## 2. The core tension (why one upfront dict cannot work)

`derive_joined_fixture_values` returns a single upfront dict. Real `<exported-id>` is only known once
the W3 coordinator opens (at the pg.backup step); `<immutable-generation>` only after pg.backup runs;
the recovery-manifest sha + coverage only after source.forward is accepted. A real run therefore needs
a **staged resolver** that reads on-disk authorities as the window advances, and each resolved value
must reach both the **compose** (journal `command_sha256`) and the **claim** (out-of-band execution
re-resolution) **identically**, or D5J's `command["command_sha256"] == capability["command_sha256"]`
byte-bind fails closed at claim time.

## 3. Design decisions

### D1 — Clean fixture/real fork (do NOT mutate the parity oracle)

`production is True` selects the **staged real resolver**; otherwise the existing
`derive_joined_fixture_values` upfront dict stays verbatim as the **closed-composer parity oracle**
(`run_joined_composer` and the whole fixture unit suite unchanged). The real path forks at value
resolution only; the Engine/serializer/journal primitives are shared unchanged (byte/order parity of
the _mechanics_ is preserved; only the _substituted values_ differ on a real run).

### D2 — Staged resolver shape

Replace the single `values` argument on the production path with a resolver object that exposes
`value(placeholder)` and is advanced by lifecycle-step callbacks:

- `on_snapshot_open()` — W3 opens the coordinator, returns real `<exported-id>`, produces
  `baseline.json`; called from `step_pg_backup` **before** `ordinary("pg.backup")`.
- `on_pg_backup_done()` — reads the printed generation dir → `<immutable-generation>`.
- `on_source_forward_accepted()` — reads recovery `manifest.json` sha + coverage → the last three.
  The resolver caches resolved values immutably (resolve-once; a re-resolve must byte-match or fail
  closed) so a recover re-drive is deterministic.

### D3 — Compose/claim consistency (D5J)

Because ordinary commands execute out-of-band via `claim` which re-resolves from `request`, every
staged real value the composer used must be persisted into a **run-root authority file** the claim
re-resolution reads, so both sides compute the identical argv → identical `command_sha256`. Candidate:
extend the existing checkpoint-bound resource-manifest artifacts (already controller-owned, OQ4,
`write_live_resource_manifest`) to carry the staged real values, and have `resolved_command`'s
production path read them. This keeps ONE authority per value (D5J single-authority) and no second
oracle.

### D4 — Real-run acceptance oracle (LOCKED — owner steer 2026-07-20 = design default)

A real run is accepted iff: (1) every real child exits 0; AND (2) the barrier receipt v2 reaches
`guard_cleanup_complete` (state machine intact); AND (3) coverage evidence (`org:course:run`) is
present in the recovery journal. The fixture byte-parity suite stays green **separately** as the
mechanics oracle. Byte-parity does NOT gate a real run.

### D5 — W3 window wiring

Lift the OQ5/OQ6 capability to the window executor. Two options:

- **(a)** Add snapshot-coordinator + `produce_run_root_baseline` methods to `OwnerCustodyExecutor`
  (owner-custody already owns the privileged server seam), invoked by the resolver's
  `on_snapshot_open()`. The real psql/tsx subprocess sits behind an isolable seam (as W1 isolated
  `_invoke_resume`) so the **structural** wiring is unit-testable with a fake, and only the live leg
  is `MC2_Q12_REAL_PG17`-gated.
- **(b)** Factor the two `LivePlanExecutor` methods into a shared mixin/module both executors use
  (avoids duplication; larger blast radius).
  Lean (a) for a smaller, reviewable blast radius; revisit if duplication is material.

## 4. Verifiability boundary (critical, honest)

- **Verifiable HERE (no live DB):** the fixture/real fork (D1), the resolver scaffold + resolve-once
  caching + fail-closed gates (D2), the compose↔claim authority-file round-trip byte-consistency (D3)
  against a **fake** coordinator/authorities (the W1 capture-subclass pattern), argv/`command_sha256`
  equality proofs, and the `production`-gated selection. All TDD, all green in the unit config.
- **NOT verifiable here (needs the live source / PG17):** the real `pg_export_snapshot()` value, the
  real baseline capture, the real generation dir, the real recovery-manifest sha/coverage, and the
  end-to-end real-run oracle (D4). These are `MC2_Q12_REAL_PG17`-gated and/or IN-WINDOW-only under
  #18 rollback-abort, and are validated at W5 (rehearsal, disposable stack) and W7 (owner-gated).

## 5. Hard invariants (unchanged from §4 of the wiring design)

Frozen manifest sha `aaec6fc2…` (HARD STOP), no Qdrant Cloud mutation, owner secrets path-only, no
production mutation without a fresh pre-window `plan` + owner go on C1, keep the fixture-parity +
strict/recovery/rollback suites intact and add real-path tests alongside.

## 6. Proposed task decomposition (TDD, sequential — one file, no parallel writers)

1. **W3-struct** (verifiable here): OwnerCustody snapshot-coordinator + baseline.json wiring behind an
   isolable subprocess seam; unit-test validation/fail-closed/wiring with a fake; live leg PG17-gated.
2. **W2-fork** (verifiable here): `production`-gated staged resolver replacing the upfront dict on the
   real path only; fixture path byte-unchanged; resolve-once caching; fail-closed on re-resolve drift.
3. **W2-consistency** (verifiable here): staged values persisted to the run-root authority file;
   `resolved_command` production path reads them; compose↔claim `command_sha256` equality proof with
   fakes.
4. **W2-oracle** (partial here): encode D4 acceptance checks structurally; the real-evidence leg is
   window/PG17-gated.
5. **W5/W7** (gated): rehearsal + owner-gated window validate the real legs end-to-end.
