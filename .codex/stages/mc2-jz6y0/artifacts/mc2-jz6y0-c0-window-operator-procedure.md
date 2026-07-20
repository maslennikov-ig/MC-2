---
schema_version: orchestration-artifact/v1
artifact_type: read-only-research
task_id: mc2-jz6y0.13
stage_id: mc2-jz6y0
agent_type: window-operator-procedure research (read-only; no mutation)
subagent_model: claude-fable-5
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: fcd05e27
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-operator-procedure.md
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: read-only research; only this artifact was created.
risk_level: high
docs_reviewed: no-change-needed
docs_review_notes: research artifact only; no behavior changed, no doc updated.
graph_reviewed: no-change-needed
graph_review_notes: read-only research against named files; no code change.
verification:
  - 'Every claim below carries file:line evidence from the current worktree (deploy/qdrant/q12-lifecycle-core.py, q12-live-cutover.sh, q12-command-manifest.json, q12-database-barrier.sh, q12-writer-resume.py, source-recovery-run.sh, deploy/postgres/*.sh, scripts/deploy_blue_green.sh, D5J amendment, window packet, W tuple).'
  - 'python3 scripts/orchestration/validate_artifact.py on this file reports OK.'
  - 'No file other than this artifact was created or modified; no ssh/server/docker/db command was run.'
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-operator-procedure.md
explicit_defers:
  - 'OPEN QUESTION OQ1-OQ6 (section "Open questions"): five load-bearing Task-9 gaps and one chronology contradiction are flagged, not resolved; the window MUST NOT open until the owner/orchestrator resolves them (they are exactly the "Task 9 keeps ... live orchestration" scope of the D5J amendment section 10).'
---

# Summary

Exact operator procedure for the Q12 live-cutover window (Tasks C1..C9 of
`docs/superpowers/plans/2026-07-16-q12-full-completion.md`, packet
`mc2-jz6y0-c0-window-packet.md`), derived only from repo truth. Headline
results:

- The deployed supervisor is **per-operation**: `deploy/qdrant/q12-live-cutover.sh`
  routes `plan` to plan mode and everything else to supervisor mode
  (`q12-live-cutover.sh:4-9`), and supervisor mode takes exactly one positional
  `operation` from the five barrier operations
  (`q12-lifecycle-core.py:6105-6112`, `OPERATIONS` at `:26-32`). The window
  therefore contains **exactly 5 supervisor invocations** — `install`,
  `verify-after-base`, `verify-after-observability`, `prepare-recovery`,
  `activate` — plus one pre-window `plan` invocation.
- Inside a supervisor invocation the engine executes **zero ordinary manifest
  commands**. `main()` builds a request whose `chains` contain only the one
  barrier operation (`q12-lifecycle-core.py:6149-6177`), `run_supervisor`
  iterates only those chains (`:3100-3107`), and the delegated claim CLI
  accepts only `barrier.*` command ids
  (`claim.add_argument("--command-id", choices=tuple(COMMANDS.values()))`,
  `:6116`). The 15 ordinary commands are separate host invocations issued
  between supervisor invocations, verbatim from the frozen manifest
  (`q12-command-manifest.json`, sha256 `aaec6fc2…`).
- The engine that journals ordinary rows (`append_ordinary_lifecycle`,
  `:1619-1716`) is reachable **only** from the closed joined-fixture composer
  (`run_joined_composer`, `:2885-3066`), which requires `joined_profile` and a
  `/tmp/mc2-q12-d5-root-*` root — not settable from the deployed CLI. The real
  `plan|live|recover` controller that would journal ordinary rows in
  production is explicitly Task 9 and is **not in the tree** (D5J amendment
  `docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md:483-496`).
  This produces the blocking open questions in the last section.

## A. Pre-window: the `plan` subcommand

**Yes — plan runs for the SAME run-id as the window, before C1.**

- Invocation: `deploy/qdrant/q12-live-cutover.sh plan --run-id <run-id>
--release-sha <release-sha> --db-url-file /opt/megacampus/secrets/supabase_db_url
--ca-file /opt/megacampus/secrets/prod-ca-2021.crt` (wrapper routing
  `q12-live-cutover.sh:5-9`; parser `q12-lifecycle-core.py:6095-6104`).
- Default run root is the production root
  `/opt/megacampus/backups/q12/<run-id>` (`_plan_run_root`,
  `q12-lifecycle-core.py:4499-4509`); the catalog is emitted immutably 0400 at
  `<run-root>/expected-post-migration-catalog.json` (`run_plan`,
  `:4530, :4550`). All five barrier commands reference exactly that path
  (`q12-command-manifest.json:16-17` etc.), and `run_claim` re-reads the file
  from the run root and recomputes its byte sha256 to re-resolve the command
  (`:2814-2819`) — so the plan MUST have used the window's run-id, otherwise
  the claim fails closed with "manifested child command binding mismatch".
- The `--expected-catalog-sha256` passed to every supervisor invocation is the
  plan result field `expected_catalog_sha256` = sha256 of the emitted FILE
  bytes (`run_plan` result, `:4561-4573`), NOT the inner
  `expected_post_migration_catalog_sha256` field.
- **User: uid 1000 `claude-deploy`, not root.** Plan credential checks require
  the DSN/CA files to be uid/gid 1000 (`_validate_plan_credential_file`,
  `:4476-4496`); `ensure_directory` requires every run-root component to be
  uid/gid 1000 mode 0700 (`:437-469`); `immutable_publish`/`validate_regular_file`
  require uid/gid 1000 on the catalog (`:501-524`). uid/gid 1000 on
  megacampus-prod is `claude-deploy` (server preflight artifact
  `mc2-jz6y0.13.7-server-preflight-20260713.md:69-70`; SSH target
  `claude-deploy@95.81.98.230`, `mc2-jz6y0.13-deploy-preflight.md:109`).
  Rehearsal #13 confirms the deployed path works and produced a 0400 catalog
  (`.codex/handoff.md`, "Rehearsal #13 ... catalog ... (0400, sha de9e6b03…)").
- Preconditions that must hold before/at plan and window open:
  - No `MC2_Q12_PLAN_*` test seam env in a production run
    (`assert_production_seam_lockdown`, `:4214-4224`); pinned restore image
    `public.ecr.aws/supabase/postgres@sha256:d00c45c7…` (`:4590-4593`).
  - `/opt/megacampus/docker-compose.infra.yml` + `/opt/megacampus/.env.production`
    must exist and the operator service must reference the Phase B image
    `ghcr.io/maslennikov-ig/mc-2/qdrant-operator@sha256:0fe4265c…` with pull
    auth resolved (packet `mc2-jz6y0-c0-window-packet.md:108`; all
    `operator.self-check`/`reindex.*` argv mount them,
    `q12-command-manifest.json:135-149, :298-344`).
  - No active q12 lock/journal: supervisor mode itself opens
    `/opt/megacampus/backups/q12/cutover.lock` and takes `LOCK_EX|LOCK_NB`
    (`q12-lifecycle-core.py:6141-6147`) — any other holder makes it fail
    closed. A fresh window requires a fresh run root (composer analogue
    `:2937-2938`); a pre-existing `phase.jsonl` for the same run-id is resumed,
    not restarted (section F).
  - Scheduled-backup timer interaction: the daily scheduler REFUSES to run
    while Q12 is active — it takes a nonblocking SHARED flock on the same
    `cutover.lock` (`deploy/postgres/scheduled-backup-run.sh:8-9, :88-89`,
    "refusing scheduled backup while Q12 is active"). Conversely the window's
    `pg.backup` takes the backup-directory lock and fails with "backup already
    running" if the 00:30 Europe/Amsterdam timer run is mid-flight
    (`backup-supabase.sh:900-901`; timer identity
    `docs/operations/qdrant-self-hosted.md:528-533`). Schedule the window away
    from 00:30 Europe/Amsterdam.

## B. The exact supervisor sequence and the two stepping hashes

Order (packet C-task mapping):

| #   | Supervisor invocation (positional operation) | Window task                                              | Barrier child executed inside the claim                                          |
| --- | -------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 0   | `plan`                                       | pre-window                                               | none (isolated restore + catalog emission only)                                  |
| 1   | `install`                                    | C1                                                       | `barrier.install`                                                                |
| 2   | `verify-after-base`                          | C4 (after `migration.base.apply`)                        | `barrier.verify-after-base` (`verify-extended --after-migration 20260711140000`) |
| 3   | `verify-after-observability`                 | C4 (after `migration.observability.apply`)               | `barrier.verify-after-observability` (`--after-migration 20260711151000`)        |
| 4   | `prepare-recovery`                           | C5 (before `source.forward`)                             | `barrier.prepare-recovery`                                                       |
| 5   | `activate`                                   | C9 (after nginx switch, before `writers.resume.forward`) | `barrier.activate`                                                               |

Each invocation is:

```
deploy/qdrant/q12-live-cutover.sh <operation> \
  --run-id <run-id> \
  --release-sha <release-sha> \
  --operator-digest <operator-digest-64hex> \
  --resource-manifest-sha256 <resource-64hex> \
  --quiesce-manifest-sha256 <quiesce-64hex> \
  --expected-catalog-sha256 <sha256-of-run-root-catalog-file>
```

(arguments `q12-lifecycle-core.py:6105-6112`; grammar `validate_request`
`:2844-2868`: run-id UUID, release-sha 40-hex, all four hashes 64-hex.)

Per-invocation internal row sequence (production path): `root.advance`
"accepted" at `PREDECESSOR_PHASES[op]` (`bootstrap_selector`, `:1475-1484`;
phases map `:99-105`) → `barrier.<op>` `intent` at `SELECTOR_PHASES[op]`
(`activate` selects `activation_committing` with the H-checkpoint CAS,
`:1495-1523`) → retained copy + capability publication → `capability_issued`
→ delegated claim across a process boundary (`delegate_claim` `:2015-2049` →
`q12-capability-run.sh` → `run_claim` `:2661-2841`: moves issued→claimed,
appends `capability_claimed`, executes the barrier child via
`ProductionExecutor.execute`, publishes the retained result) → `completed` at
`TARGET_PHASES[op]` (`finish`, `:2423-2455`). `install` additionally publishes
`database-barrier-baseline.json` (`write_install_baseline`, `:2401-2421`).
The barrier receipt state machine matches: install→`maintenance_guarded`,
verify-extended→`<migration>_guard_verified`,
prepare-recovery→`recovery_ready_guarded`, activate→`activated`
(`q12-database-barrier.sh:2107-2114`); prepare-recovery hard-requires the
prior receipt `20260711151000_guard_verified` (`:352-358`) — this pins
invocation order 2→3→4.

**Ordinary commands inside the chain: none.** The 15 ordinary manifest
commands (C1 `operator.self-check`; C2 `writers.quiesce`; C3
`pg.backup`/`pg.restore`; C4 `migration.base.apply`/`migration.observability.apply`;
C5 `source.forward`; C6 `reindex.plan`/`reindex.worker.create`/`reindex.execute`/
`reindex.verify`; C8 `deploy.prepare`/`deploy.commit`; C9
`writers.resume.forward`; RB `writers.resume.rollback`) are host invocations
issued by the operator BETWEEN supervisor invocations, byte-exact per the
frozen manifest argv/env. The D5J forward group chronology (amendment §5,
`:210-228`) is the frozen JOURNAL order for the fixture/Task-9 controller;
the deployed 5-invocation production journal contains only `root.advance` +
`barrier.*` rows (see OQ2/OQ3).

**Stepping hash #1 — `--quiesce-manifest-sha256`:**

- Initial value: 64 zeroes (`ZERO`, `:24`) for `plan`-independent `install`
  (the quiesce manifest does not exist yet). ZERO is grammar-legal
  (`validate_request` only requires 64-hex).
- Real value: sha256 of the file bytes of
  `/opt/megacampus/backups/q12/<run-id>/writer-quiesce-<run-id>.json` — the
  exact path is derived by `source-recovery-run.sh:519-522` and enforced by
  `deploy_blue_green.sh` (`Q12_EXPECTED_MANIFEST` equality,
  `scripts/deploy_blue_green.sh:75-78`); the digest is computed exactly as
  `sha256sum` of that file (`source-recovery-run.sh:909`; composer binding
  `q12-lifecycle-core.py:2895-2899`). Pass it in every supervisor invocation
  after `writers.quiesce` has published the manifest.
- Binding rule: the two-segment walk (`validate_stable_binding_walk`,
  `:311-341`; amendment §4 item 8 `:189-200`) switches to
  mandatory-real only at a `writers.quiesce` `accepted` row. That row never
  exists in the 5-invocation production journal, so the journal stays in the
  pre-switch segment where every row must carry ZERO **or** the request value —
  mixing ZERO-era rows with real-value rows across invocations is valid.
- `barrier.*` capabilities themselves may carry ZERO or the request value
  (`:1124-1131`).

**Stepping hash #2 — `--resource-manifest-sha256`:**

- The walk allows the per-row value to change ONLY at a `pg.backup` `intent`
  row or a `deploy.prepare` `completed` row (`:342-356`; amendment "the
  `<exported-id>` before group 4's intent and the five captured target
  identities before group 13's `deploy.prepare` completion", `:196-200`).
  Those rows are written only by the composer/Task-9 controller
  (`run_joined_composer` `:2956-2958, :2975-2987` — fixture step values
  `sha256("q12:resource-step:snapshot:<run-id>")` and
  `sha256("q12:resource-step:targets:<run-id>")`).
- Consequence for the deployed 5-invocation window: the production journal has
  no stepping witness rows, so the resource hash **cannot step** — the SAME
  64-hex value must be passed to all five invocations, or a later
  `reload_durable` fails "journal stable binding mismatch:
  resource_manifest_sha256". Repo truth does not name the production constant
  (no deployed resource-manifest producer exists) — see OQ4.

**`--operator-digest`:** 64-hex (`:2860-2862`), request-global across the run
(`:322-324`). The only production operator identity in evidence is the Phase B
GHCR index digest hex `0fe4265ca80eb100912f6ce8155b061712db90ace4e0b1641e63e9a1a247e199`
(packet `:108`; handoff Phase B receipt). The corrections design shows the
supervisor taking `--operator-digest "$OPERATOR_DIGEST"` without pinning the
byte source (`2026-07-13-q12-live-cutover-corrections-design.md:857`) — value
choice is an owner/orchestrator determination, but it must be identical in all
five invocations.

**`--release-sha`:** 40-hex release commit of the deployed release; identical
in all five invocations (`:322-324`); also passed to
`deploy.prepare`/`deploy.commit` (`deploy_blue_green.sh:68-69` regex).

## C. Which user runs what

- **All lifecycle-core invocations (plan, 5×supervisor, the delegated claim it
  spawns) run as uid/gid 1000 `claude-deploy`.** Fail-closed evidence:
  `ensure_directory` rejects any run-root component not uid/gid 1000 mode 0700
  (`q12-lifecycle-core.py:459-469`); journal/checkpoint/capability files must
  be uid/gid 1000 (`validate_regular_file`, `:517-524`); the claim process
  re-checks inherited journal FD 8 and lease FD 9 are uid/gid 1000
  (`run_claim`, `:2673-2683`); the canonical `cutover.lock` must be uid/gid
  1000 mode 0600 (`validate_canonical_lease_lock`, `:397-408`). Running any of
  these as root would create root-owned state and fail closed.
- **`source-recovery-run.sh` (writers.quiesce, source.forward,
  writers.resume.\*) must run as root**: `[[ $EUID -eq 0 ]] || fail 'production
source recovery must run as root'` (`source-recovery-run.sh:114`), while its
  "controller" identity constants are 1000:1000 (`:8-9`) — it validates the
  claude-deploy-owned run root/capability/lock and spawns
  `q12-writer-resume.py` with `env -i PATH=… LC_ALL=C LANG=C HOME=/root
Q12_EXTERNAL_QUIESCE_LEASE_FD=9` (`:293-296, :339-343`).
- **Lease FD 9 choreography**: `writers.quiesce`/`writers.resume.*` require an
  inherited FD 9 open on `/opt/megacampus/backups/q12/cutover.lock` with the
  exclusive flock HELD by the calling shell (`q12-writer-resume.py:287-297`
  proves contention via `flock -n` failure; manifest env
  `Q12_EXTERNAL_QUIESCE_LEASE_FD=9`, `q12-command-manifest.json:168-174,
:563-569, :582-588`). The supervisor takes the SAME lock exclusively for the
  duration of each of its invocations (`q12-lifecycle-core.py:6141-6147`), so
  the operator must hold the FD-9 lease ONLY around the three
  quiesce/resume invocations and release it before any supervisor invocation.
- The manifest env (`PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C
HOME=/root`, `load_manifest` `:640-645`) is the fixed child environment; it
  does not select the executing user. `deploy_blue_green.sh --q12-mode` uses
  `sudo nginx`/`sudo tee` internally (`:29-30`) and `reindex.*`/`operator.self-check`
  need docker access; `pg.backup`/`pg.restore` read claude-deploy-owned 0400/0600
  inputs. Practical shape: SSH as `claude-deploy`, run lifecycle-core commands
  directly, run root-required commands via `sudo` with the frozen env applied
  with `env -i` (exact env bytes: manifest `env` objects).

## D. Placeholder computation — who substitutes what

The engine substitutes placeholders ONLY when it resolves a command
(`resolved_command`, `:692-716`), and the production request supplies exactly
three: `<run-id>`, `<expected-post-migration-catalog-sha256>`,
`<release-sha>` (`:702-707`). The `derive_joined_fixture_values` table
(`:667-689`) is CLOSED-FIXTURE ONLY (amendment §3 table `:120-131`, column
"Closed-fixture derivation"); production values must come from "the
already-hashed run input or a prior fsynced resource manifest bound to the
current checkpoint" (`:137-142`) — i.e. the Task-9 controller. In the deployed
window the OPERATOR substitutes them by hand from these authorities:

| Placeholder                                                   | Deployed production source                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<run-id>`                                                    | operator-generated lowercase UUIDv4, fixed at plan time (`UUID4_RE` `:4195-4197`)                                                                                                                                                                                |
| `<expected-post-migration-catalog-sha256>`                    | plan result `expected_catalog_sha256` (= sha256 of run-root catalog file bytes, `:4561-4573`, re-derived at claim `:2814-2816`)                                                                                                                                  |
| `<release-sha>`                                               | deployed release commit (owner input)                                                                                                                                                                                                                            |
| `<exported-id>`                                               | id returned by `SELECT pg_export_snapshot()` in a live REPEATABLE READ session that must stay open through `pg.backup` (shape `^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$`, `backup-supabase.sh:502-506, :880-881`) — no deployed exporter exists for q12 mode (OQ5) |
| `<immutable-generation>`                                      | generation directory name printed/pointed by the fresh `pg.backup` (`generation-<UTC>-<uuid>` regex, `restore-supabase-drill.sh:302-303`; pointer `latest.json`, `backup-supabase.sh:784`)                                                                       |
| `<quiesce-manifest>`                                          | exactly `/opt/megacampus/backups/q12/<run-id>/writer-quiesce-<run-id>.json`, published by `writers.quiesce` (`source-recovery-run.sh:519-522`; equality check `deploy_blue_green.sh:75-78`)                                                                      |
| `<recovery-run-id>`                                           | run id of the `.13.4.1` source-recovery run (its own state at `/var/lib/megacampus-source-recovery`); production authority = "accepted recovery run" evidence (amendment `:128`) — operator supplies the accepted value                                          |
| `<accepted-recovery-manifest-sha256>`                         | sha256 of `/var/lib/megacampus-source-recovery/state/manifest.json` bytes after `source.forward` acceptance (amendment `:129`)                                                                                                                                   |
| `<accepted-coverage-fingerprint>` / `<accepted-coverage-run>` | accepted coverage evidence of the recovery run (`org:course:run` triple; amendment `:130-131`) — read from the recovery journal/receipts, never invented                                                                                                         |

Fixture derivations for the same names (for cross-checking the fixture tests
only): `q12-lifecycle-core.py:667-689` — e.g. `<exported-id>` =
`H[0:8]-H[8:16]-1` of `sha256("q12:snapshot-export:<run-id>")`,
`<recovery-run-id>` = UUIDv5(namespace=run-id, "q12-source-recovery").

## E. C7 (local re-freeze between C6 and C8)

- **Input needed from the run root:** only
  `/opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json`
  (0400) — produced pre-window by `plan` and proven equal to the live
  post-migration DB by the two `verify-extended` receipts in C4 (plan C4
  step 3; W tuple checklist item 2,
  `mc2-jz6y0.13.10-q12-w-activation-tuple.md:123-129`). Fetch a copy locally.
- **Work (local repo, not the server):** re-run
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs`
  and the parametric mechanical test with
  `MC2_Q12_ACTIVATION_CATALOG_FILE=<local copy>` (test hook
  `q12-w-activation-lock-proof-pg17.test.ts:208-210`); re-freeze fields
  5/6/8/9; rename `deploy/qdrant/q12-activation-lock-{catalog,order}.test-reference.json`
  → production names; update the tuple artifact; commit + push (plan Task C7).
- **Does the window pause to allow it? Yes, structurally.** Every phase is a
  discrete host process; after C6 (`reindex.verify`) nothing holds any lock or
  session — the next mutation is `deploy.prepare` (C8), and the next
  supervisor invocation is `activate` (C9). Writers remain quiesced/held
  during the pause (their restart policy is pinned to `no`,
  `q12-writer-resume.py:1000-1006`), so the pause only extends the write
  outage; nothing expires.

## F. Failure / rollback / point of no return

- **Failed supervisor invocation → re-run the SAME invocation.** On restart
  the engine reloads the durable journal, and because the operation's selector
  already exists it takes `resume_retained_chain` (`run_supervisor`
  `:3104-3106`; `resume_retained_chain` `:2177-2390`): it reconstructs the
  unique capability chain, publishes a `cutover-recovery-N` successor when the
  lease was really lost (`engine.lease_reacquired`, `:3094-3098`), retires
  predecessors to `superseded`, and either re-uses a durable result without
  re-executing the child or re-delegates the claim. A completed operation is a
  no-op (`:2181-2182`). Idempotent restart is the designed recovery path
  (fixture proof: `q12-live-cutover.test.ts:769-806` "restarts the same root …
  without duplicate rows or child replay").
- **`abandonedFrontier`** (skip-the-frontier disposition, `R` row
  `rollback_preparing/retained_attempt_abandoning` + rollback FWM,
  `materialize_frontier_precondition`/`dispose_durable_frontier`
  `:2457-2642`) is a request key that the production CLI never sets
  (`main()` request `:6149-6177`) — abandoning a barrier frontier in
  production is NOT reachable through the deployed wrapper (Task 9 / D6
  post-R narrowing scope).
- **Failed ordinary command:** pre-activation everything is additive or
  isolated (packet "Откат по фазам"): the restore drill is isolated;
  `source.forward` copies are exact no-replace; the reindex collection sits
  behind an unswitched alias; `deploy.prepare` stages the inactive color.
  Writer rollback = `writers.resume.rollback` (manifest `:571-589`), which is
  lease-bound (FD 9 held) and requires the run root's
  `final-writer-manifest-rollback-<run-id>.json` plus a v2
  `guard_cleanup_complete` barrier receipt (`q12-writer-resume.py:1055-1073`)
  — see OQ3/OQ6 for the producers of those inputs.
- **Point of no return: `barrier.activate` (C9).** Before it, reads can fall
  back to Qdrant Cloud and nginx can be truthfully re-prepared; after the
  activate capability lifecycle completes (`activated`, receipt
  `state=activated`, `q12-database-barrier.sh:2113`), the run is
  finish-forward only (`writers.resume.forward`), per the packet (`:97,
:121`) and the D6 finish-forward authority (`q12-root-join.test.ts:313-327`).

## G. Operator checklist (numbered, with STOP points)

Legend: `[cd]` = run as `claude-deploy` (uid 1000); `[root]` = run as root
(sudo); `env*` = apply the exact frozen manifest env for that command with
`env -i`. `RID`=<run-id>, `RR`=/opt/megacampus/backups/q12/$RID,
`CAT_SHA`=plan `expected_catalog_sha256`, `QM`=$RR/writer-quiesce-$RID.json.

0. **STOP — do not open the window**: OQ1..OQ6 below are unresolved; steps
   marked (OQ…) cannot succeed against the current tree.
1. `[cd]` Pre-window: generate `RID` (uuidv4); run
   `deploy/qdrant/q12-live-cutover.sh plan --run-id $RID --release-sha
<release-sha> --db-url-file /opt/megacampus/secrets/supabase_db_url
--ca-file /opt/megacampus/secrets/prod-ca-2021.crt`; record `CAT_SHA` from
   the JSON result. Verify no scheduled backup is running / not near 00:30
   Europe/Amsterdam. **STOP — owner confirms window open (packet gate).**
2. `[cd]` C1: `deploy/qdrant/q12-live-cutover.sh install --run-id $RID
--release-sha <sha> --operator-digest <digest> --resource-manifest-sha256
<RM> --quiesce-manifest-sha256 $(printf '0%.0s' {1..64}) …zeros…
--expected-catalog-sha256 $CAT_SHA` (RM per OQ4). Verify
   `$RR/database-barrier-receipt.json` state `maintenance_guarded`,
   `$RR/secrets/db-capability` 0400.
3. `[root]` C1: `env*` `operator.self-check` argv verbatim
   (`q12-command-manifest.json:134-150`).
4. C2 `writers.quiesce` (OQ2, OQ1 — journal precondition + receipt-order
   contradiction): once resolved — `[root]` with FD 9 lease held
   (`exec 9<>/opt/megacampus/backups/q12/cutover.lock; flock -x -n 9`), `env*`
   `source-recovery-run.sh --operation quiesce-writers-only --run-id $RID`;
   then release FD 9. Verify `QM` exists (10 writers, status quiesced);
   `QSHA=$(sha256sum $QM)`. **STOP — verify no active write path.**
5. C3: open the snapshot coordinator session (OQ5), capture `<exported-id>`;
   `[cd?]` `env*` `pg.backup` argv with `--q12-run-id $RID --snapshot
<exported-id>` (requires `$RR/baseline.json` — OQ6); close the coordinator
   after commit; record `<immutable-generation>` from the new generation;
   `env*` `pg.restore` argv with `--generation <immutable-generation> --run-id
$RID --q12-db-capability-file $RR/secrets/db-capability`. **STOP if the
   isolated drill is not PASS with zero residue.**
6. `[cd]` C4: `env*` `migration.base.apply` argv verbatim; then supervisor
   `verify-after-base` (same six arguments; `--quiesce-manifest-sha256 $QSHA`
   from here on); `env*` `migration.observability.apply`; then supervisor
   `verify-after-observability`. Verify receipt
   `20260711151000_guard_verified`. **STOP if any verify-extended fails —
   guarded rollback path per `.13.15`.**
7. `[cd]` C5a: supervisor `prepare-recovery`; receipt
   `recovery_ready_guarded`.
8. `[root]` C5b: `env*` `source.forward` argv verbatim with
   `--run-id <recovery-run-id>`, `--q12-db-capability-file
$RR/secrets/db-capability`, `--external-quiesce-manifest $QM`,
   `--database-barrier-receipt $RR/database-barrier-receipt.json`
   (`q12-command-manifest.json:260-296`). Verify 42 copies / 24 dispositions,
   no `--allow-gaps`.
9. `[root]` C6: `env*` `reindex.plan` → `reindex.worker.create` →
   `reindex.execute` → `reindex.verify` argv verbatim, substituting `RID`,
   `<recovery-run-id>`, `<accepted-recovery-manifest-sha256>`,
   `<accepted-coverage-fingerprint>`, `<accepted-coverage-run>` (section D).
   **STOP if `reindex.verify` is not PASS.**
10. Local machine, C7: fetch `$RR/expected-post-migration-catalog.json`;
    re-freeze fields 5/6/8/9 with `MC2_Q12_ACTIVATION_CATALOG_FILE`; rename
    assets; commit; push. **STOP — confirm D6 tests green on production
    tuple before C8.**
11. `[root]` C8: `env*` `deploy.prepare` argv (`--release-sha <sha>
--external-quiesce-manifest $QM`); verify inactive color healthy against
    self-hosted Qdrant; `env*` `deploy.commit`. **STOP — last owner check
    before the point of no return.**
12. C9: H-stream nginx switch (durable `nginx_switch_intent` before reload —
    H `.13.12` contract); `[cd]` supervisor `activate`; verify receipt
    `state=activated`. **POINT OF NO RETURN — finish-forward only.**
13. Barrier cleanup to v2 `guard_cleanup_complete` receipt (OQ3 — not a
    manifest command); then `[root]` with FD 9 lease held: `env*`
    `writers.resume.forward` argv; verify writers healthy; release FD 9.
14. Rollback path (any time BEFORE step 12's activate): do not proceed;
    barrier rollback/cleanup to the v2 receipt (OQ3), then `[root]` FD-9-held
    `env*` `writers.resume.rollback` (requires
    `final-writer-manifest-rollback-$RID.json` — OQ3).

## Open questions (load-bearing; DO NOT GUESS — resolve before the window)

- **OQ1 — quiesce ordering contradiction.** The packet/plan/D5J chronology
  puts `writers.quiesce` at C2, before backup/migrations/prepare-recovery
  (packet `:171-183`; amendment §5 group 3 `:214`), but the deployed W quiesce
  controller fail-closes unless `database-barrier-receipt.json` already shows
  `state=recovery_ready_guarded` / `last_command=prepare-recovery`
  (`q12-writer-resume.py:316-335`), which only exists AFTER C4+C5a
  (`q12-database-barrier.sh:352-358, :2112`). Both cannot hold in one linear
  window. Repo truth is contradictory; needs an owner/design ruling (either
  the receipt gate or the C-task order is stale).
- **OQ2 — no deployed producer of ordinary journal rows.** W's quiesce
  controller also requires the run journal head to be a `writers.quiesce`
  `capability_claimed` row with matching capability files
  (`q12-writer-resume.py:347-500`), but the only code that appends ordinary
  rows is the closed fixture composer (`append_ordinary_lifecycle` called
  solely from `run_joined_composer`, `:2948-2949`); the deployed CLI journals
  only `root.advance` + `barrier.*` rows. The real journaling controller is
  explicitly Task 9 (amendment `:483-496`). C2/C9/RB are therefore
  unexecutable against the current tree.
- **OQ3 — resume requires a barrier `cleanup`/`rollback` that is not in the
  manifest.** `writers.resume.*` requires a v2 receipt
  `state=guard_cleanup_complete` with `database_capability_deleted=true`
  (`q12-writer-resume.py:1062-1073`); only `q12-database-barrier.sh
rollback|cleanup` writes it (`:2114`), and `barrier.cleanup` is Task 9
  (amendment `:485`), absent from the frozen 20-command manifest. Forward
  resume additionally needs `final-writer-manifest-forward-<run-id>.json`,
  whose only producer is the composer/Task-9 (`publish_final_writer_manifest`,
  `:1881-1986`).
- **OQ4 — production `--resource-manifest-sha256` value is unnamed.** It must
  be one constant 64-hex across all five invocations (section B), but no
  deployed component produces a resource manifest; the amendment assigns it to
  checkpoint-bound Task-9 evidence (`:196-200`). ZERO is grammar-legal but is
  a determination, not repo truth.
- **OQ5 — no deployed q12 snapshot exporter.** `pg.backup` q12 mode demands an
  externally exported, still-open snapshot (`backup-supabase.sh:502-506`);
  the only live exporters are the scheduled-mode coprocess (`:858-882`,
  scheduled-only) and the plan executor's coordinator
  (`q12-lifecycle-core.py:5718-5774`, plan-internal). The window has no
  deployed coordinator; a manual owner-DSN psql session would violate the
  "operators must not run subcommands manually" rule
  (corrections design §9, `:843-847`).
- **OQ6 — `$RR/baseline.json` has no producer.** `pg.backup` q12 mode opens
  `/opt/megacampus/backups/q12/<run-id>/baseline.json`
  (`backup-supabase.sh:924-931`); the barrier/lifecycle publish only
  `database-barrier-baseline.json` (`q12-database-barrier.sh:223`,
  `q12-lifecycle-core.py:2417`). Whether Task 9 copies/projects it is
  unresolved.

# Verification

- All file:line citations were taken from fresh reads of the current worktree
  during this research session (2026-07-17); the frozen manifest byte set and
  the 20-command order were read verbatim from
  `deploy/qdrant/q12-command-manifest.json`.
- `python3 scripts/orchestration/validate_artifact.py
.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-operator-procedure.md`
  → OK.
- No server, database, docker, or ssh command was executed; no file other than
  this artifact was created or modified.

# Risks / Follow-ups

- The six open questions above are exactly the D5J amendment's retained Task 9
  scope ("the real `plan|live|recover` controller … `barrier.cleanup` … live
  orchestration", amendment §10). Until Task 9 (or an owner-ratified manual
  deviation from corrections-design §9) exists, only plan, the five barrier
  supervisor invocations, `operator.self-check`, the two migrations,
  `pg.restore` (given a generation), `source.forward`, `reindex.*`, and
  `deploy.prepare|commit` are executable end-to-end; `writers.quiesce`,
  `pg.backup`, `writers.resume.*` are blocked.
- If any supervisor invocation is retried after a real lease loss, the journal
  gains `cutover-recovery-N` epochs — expected, not an error (section F).
- This artifact intentionally repeats no secret value; all secret references
  are paths.
