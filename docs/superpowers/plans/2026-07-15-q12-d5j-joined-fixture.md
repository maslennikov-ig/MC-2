# Q12 D5J Joined Retained-Barrier Fixture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task in the dedicated worktree
> `/home/me/code/mc2/.worktrees/q12-d5j-joined-fixture` (branch
> `codex/q12-d5j-joined-fixture`). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement the Root-owned, test-only, closed joined-fixture composer
that emits one canonical forward or rollback Q12 run — real ordinary command
bindings, D5 retained-barrier groups, W quiesce binding, and mode-bound
final-writer manifests — so W `.13.10` can validate one complete chronology.

**Architecture:** All authority bytes are produced inside
`deploy/qdrant/q12-lifecycle-core.py` through the existing production
serializer/capability/object/checkpoint primitives, extended exactly as the
accepted amendment authorizes. The Python test runner gains one distinct
validated joined request path that calls one internal core composer; the
TypeScript contract gains one discriminated joined spec/materializer. No
deployed CLI, parser, environment, or W-owned file changes.

**Tech Stack:** Python 3 (stdlib only), Vitest, TypeScript, jq, prettier.

## Normative authorities (read before any task)

| Authority                                                                          | File                                                                                              | SHA-256                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| D5J design                                                                         | `docs/superpowers/specs/2026-07-15-q12-joined-retained-barrier-fixture-design.md`                 | `d7e86193142d260a3b8dcd65ef9ce89b64df88d9c93cec68f19705de68edc75d` |
| `.13.22` amendment (binding tables)                                                | `docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md`                  | `d6c4d8e4b2b7f6c53d648fdf587a5520db45fa5d8f3c84668b48b09b6bbe075c` |
| Base command table                                                                 | `docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md` §12 (lines 1048-1209)  | `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15` |
| Lifecycle addendum (FWM, phase graph, resume argv, reindex/source argv extensions) | `docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md`                  | `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27` |
| D4 (writers.quiesce)                                                               | `docs/superpowers/specs/2026-07-14-q12-durable-recovery-projections-addendum-design.md`           | `28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4` |
| D5 (barrier groups, H-adjacency)                                                   | `docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md` | `b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8` |

The amendment §5/§6 tables are the byte truth for every row this plan emits.
Where this plan abbreviates a row list, the amendment governs.

## Global Constraints

- Write zone (closed): `deploy/qdrant/q12-lifecycle-core.py`,
  `deploy/qdrant/q12-command-manifest.json`,
  `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py`,
  `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts`,
  new `packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts`,
  minimum-necessary updates to
  `packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts`,
  `packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts`,
  `packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts`,
  plus `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.21-q12-d5j.md` and
  current orchestration records. Editing `q12-command-manifest.json` and its
  test is authorized by amendment §7 items 1-2 (superseding the D5J design's
  narrower zone); the quiesce-seam/live-cutover/manifest test updates are the
  design's "minimum necessary Root lifecycle test update", each recorded in
  the artifact. Anything else is a stop.
- No deployed CLI/parser/env/manifest test switch; no W-worktree edit; the two
  uncommitted W files in `.worktrees/q12-w-writer-barrier` are untouchable.
- No new command beyond the amendment §2 twenty; no new phase/outcome/object
  kind beyond accepted designs; `root.advance` stays for isolated D5 only.
- No `Date.now()`-style entropy: the engine timestamp stays the fixed literal;
  every derivation is run-root/run-id bound per amendment §3/§6.
- Focused gates (run after every task; both must stay green from Task 3 on):

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/q12-live-cutover.test.ts \
  tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts \
  tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts \
  tests/unit/ops/q12-command-manifest.test.ts
```

plus the identical invocation with `--no-file-parallelism`, and:

```bash
bash -n deploy/qdrant/q12-live-cutover.sh deploy/qdrant/q12-capability-run.sh
python3 -m py_compile deploy/qdrant/q12-lifecycle-core.py \
  packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
jq -e . deploy/qdrant/q12-command-manifest.json
pnpm exec prettier --check \
  packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts \
  packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts \
  packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts
git diff --check
```

(Until Task 6 creates the seam test file, omit it from the vitest file
lists.)

---

### Task 1: Twenty-command canonical manifest + `load_manifest()`

**Files:**

- Modify: `deploy/qdrant/q12-command-manifest.json`
- Modify: `deploy/qdrant/q12-lifecycle-core.py` (`ORDINARY_COMMAND_IDS`
  constant; `load_manifest()` at ~487-501)
- Test: `packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts`

**Interfaces:**

- Produces: `ORDINARY_COMMAND_IDS: tuple[str, ...]` — the fifteen new IDs in
  amendment §2 order (entries 6-20); `MANIFEST_COMMAND_IDS =
tuple(COMMANDS.values()) + ORDINARY_COMMAND_IDS`; `load_manifest()`
  validating the exact twenty-key order and per-entry env.

**Argv assembly rules (frozen here; the test transcribes the resulting exact
arrays and becomes the byte pin):**

1. Every shell token is one JSON argv element; `-v`/`-e` options are two
   elements (`-v`, `value`).
2. `operator prefix` = `/opt/megacampus/deploy/qdrant/operator-compose.sh`,
   `--project-directory`, `/opt/megacampus`, `-f`,
   `/opt/megacampus/docker-compose.infra.yml`, `--env-file`,
   `/opt/megacampus/.env.production`, `--profile`, `operator`, `run`, `--rm`,
   `--no-deps`, `-T` (base:1069-1077). `worker prefix` = the same through
   `run`, then `--no-deps` only (base:1079-1082).
3. Every `reindex.*` entry inserts, between the prefix tail and
   `qdrant-operator`, in this frozen order: first the base DB-capability pair
   (`-v`,
   `/opt/megacampus/backups/q12/<run-id>/secrets/db-capability:/run/secrets/q12_db_capability:ro`,
   `-e`, `Q12_DB_CAPABILITY_FILE=/run/secrets/q12_db_capability`;
   base:1135-1138), then the two lifecycle-addendum receipt groups in their
   listed order (barrier receipt `-v`/`-e`, probe receipt `-v`/`-e`;
   LIFE:302-307). Entry-specific `-e`/`-d`/`--name` options from the base
   table follow after these mounts, then the image command.
4. `RECOVERY_BINDING` expands per base:1102-1112 with exactly one
   `--accepted-coverage-run` pair (amendment §3).
5. `source.forward` uses base:1151 plus the LIFE:295-297
   `--database-barrier-receipt
/opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json` pair.
6. Migration `--confirm` phrases are single elements exactly as base:1149-1150.
7. `writers.quiesce` (D4:266-271) and `writers.resume.forward|rollback`
   (LIFE:259-263) argv; their env adds `Q12_EXTERNAL_QUIESCE_LEASE_FD=9`.
8. All other env objects are exactly
   `{PATH:/usr/sbin:/usr/bin:/sbin:/bin, LC_ALL:C, LANG:C, HOME:/root}`.
9. `argv_sha256` = SHA-256 of `canonical(argv)` (existing rule).

- [ ] **Step 1 (RED):** rewrite `q12-command-manifest.test.ts`: the current
      universal assertions (five-ID shape, every `argv[0]` equal to
      `q12-database-barrier.sh`, single shared env; `:14-51`) are replaced,
      not appended to — barrier-specific assertions stay scoped to the five
      barrier entries. Then assert manifest
      keys equal the amendment §2 twenty in exact order; assert the five
      barrier entries byte-identical to current; assert each new entry's argv
      equals the frozen array transcribed in-test per the rules above; assert
      each `argv_sha256` recomputes; assert quiesce/resume entries carry the
      FD-9 env key and all others exactly the four-key env. Run the focused
      manifest test; expect FAIL (five keys today).
- [ ] **Step 2 (GREEN):** write the fifteen manifest entries; add
      `ORDINARY_COMMAND_IDS`; amend `load_manifest()` to require
      `tuple(manifest["commands"]) == MANIFEST_COMMAND_IDS` and per-entry env
      (base four-key everywhere; plus the FD-9 key for exactly
      `writers.quiesce`, `writers.resume.forward`, `writers.resume.rollback`).
      Compute each `argv_sha256` with the core's own
      `sha256(canonical(argv))`.
- [ ] **Step 3:** run the manifest test (PASS) and both full focused vitest
      invocations (live-cutover/quiesce-seam must stay green — they don't pin
      the manifest key count outside `load_manifest`; if any pin exists,
      update it minimally and record it in the artifact).
- [ ] **Step 4:** `jq -e . deploy/qdrant/q12-command-manifest.json`;
      `python3 -m py_compile deploy/qdrant/q12-lifecycle-core.py`.
- [ ] **Step 5:** commit `feat(q12): expand canonical command manifest to the
frozen D5J twenty`.

### Task 2: Substitution domain and fixture derivations

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py` (`resolved_command()` at
  ~504-518; new `derive_joined_fixture_values()` helper)
- Modify: `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py`
  (pure-function tests via `--derive-run-id`-style probe are NOT added; the
  helper is exercised through the manifest/grammar tests and Task 6)
- Test: `packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts`
  (resolution cases)

**Interfaces:**

- Produces:
  `resolved_command(manifest, command_id, request, values: dict[str, str])`
  — `values` maps the eight non-request placeholders + the coverage-run
  literal; missing/unknown/extra placeholder fails closed;
  `derive_joined_fixture_values(run_id: str, quiesce_manifest_path: str) ->
dict[str, str]` implementing amendment §3 derivations exactly (lowercase
  hyphenated run-id rendering; `H[0:8]-H[8:16]-1` exported-id;
  `q12fixture-generation-` + `H'[0:16]`; UUIDv5 recovery-run-id and coverage
  UUIDs; SHA-256 recovery-manifest/coverage-fingerprint preimages;
  release-sha/expected-catalog from the request as today).

- [ ] **Step 1 (RED):** manifest test: for each of the fifteen new commands,
      resolve with a fixed run-id and the §3 fixture derivations recomputed
      independently in TypeScript; assert the resolved argv contains no `<`
      or `>`, equals the expected substituted array, and `command_sha256`
      equals the TS-recomputed SHA-256 of the canonical resolved argv. Add
      negatives: caller-supplied substitution key fails; unresolved
      placeholder fails. Expect FAIL.
- [ ] **Step 2 (GREEN):** implement the expanded substitution map and
      `derive_joined_fixture_values()`; keep the two existing request-driven
      substitutions; thread `values` as an optional parameter defaulting to
      `{}` so all existing barrier callers stay unchanged.
- [ ] **Step 3:** focused gates green; commit `feat(q12): closed substitution
domain with single authorities`.

### Task 3: Journal grammar and segment-aware stable bindings

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py`
  (`validate_journal_entry_grammar` ~141-223; `reload_durable` stable-binding
  block ~787-795; `dispose_durable_frontier` rollback-FWM rows ~1911-1940)
- Test: `packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts`
  (grammar unit block; existing ZERO-hash pins)

**Interfaces:**

- Produces: `ORDINARY_ROW_GRAMMAR: dict[str, dict]` — per ordinary command:
  `selector_phase`, `target_phase`, allowed outcomes; the FWM pair rules
  (`writers.resume.forward`@`prepared_quiesced`,
  `writers.resume.rollback`@`rollback_preparing`, both real-hash,
  intent=`none`/accepted=`final_writer_manifest`); `writers.quiesce` five
  outcomes with `accepted`+`writer_quiesce_manifest` pairing; controller
  milestone `migrations_applied/completed` bound to
  `migration.observability.apply`. Removal of the ZERO special case.

Exact phase table (from amendment §5): `operator.self-check` sel=tgt
`preflight`; `writers.quiesce` sel=tgt `quiesced`; `pg.backup` sel
`snapshot_exported` tgt `backup_committed`; `pg.restore` sel=tgt
`restore_verified`; `migration.base.apply` sel=tgt `restore_verified`;
`migration.observability.apply` sel=tgt `base_migration_guarded` (plus the
`migrations_applied` milestone); `source.forward` sel=tgt `source_recovered`;
`reindex.plan|worker.create|execute` sel=tgt `reindex_started`;
`reindex.verify` sel=tgt `qdrant_verified`; `deploy.prepare` sel=tgt
`qdrant_verified`; `deploy.commit` sel=tgt `activation_ready`.

- [ ] **Step 1 (RED):** add a grammar unit block to `q12-live-cutover.test.ts`
      driving `reload_durable` (via the existing journal-mutation harness)
      with: each ordinary command at its exact phase/outcome (accepted);
      wrong phase/outcome/command combinations (rejected); quiesce
      `accepted`+`writer_quiesce_manifest` (accepted) and any other pairing
      (rejected); forward FWM pair with real hash (accepted); either FWM row
      with ZERO hash (rejected); `migrations_applied/completed` with the
      witness binding (accepted) and with any barrier binding (rejected);
      `root.advance` unchanged. Expect FAIL.
- [ ] **Step 2 (GREEN):** implement `ORDINARY_ROW_GRAMMAR` inside
      `validate_journal_entry_grammar`; replace the
      `writers.resume.rollback` ZERO clause with the real-hash pair rule for
      both resume commands; extend the accepted-object pairing to
      (`writer_quiesce_manifest`, 64-hex) exactly on the quiesce `accepted`
      row.
- [ ] **Step 3 (RED):** segment tests: a joined-shape journal (contains a
      `quiesced` group) with zeroes after `quiesced/accepted` (rejected) and
      with the correct two-segment shape (accepted); an isolated journal
      (no `quiesced` group) binding the request digest on every row stays
      accepted exactly as today — the reload rule is: before any
      `quiesced/accepted` row, a row may bind either 64 zeroes or the
      request digest; from the `quiesced/accepted` row on, only the request
      digest. Joined strictness (pre-switch rows must be zeroes) is asserted
      by the composer self-check and the seam test, not by reload;
      `resource_manifest_sha256` stepping anywhere other than the two frozen
      steps (rejected). Expect FAIL.
- [ ] **Step 4 (GREEN):** make the two bindings segment-aware in
      `reload_durable` per amendment §4 items 7-8 with the isolated
      request-global fallback above (helper
      `expected_stable_bindings(seq_context)`); keep the other four
      request-global. The existing later-four isolated fixtures
      (quiesce-seam `:148-153`) must stay green unmodified.
- [ ] **Step 5:** update `dispose_durable_frontier` to resolve the real
      `writers.resume.rollback` hash via `resolved_command`; update every
      existing test pin of the ZERO hash to the real recomputed hash
      (strengthening — record each touched assertion in the artifact).
- [ ] **Step 6:** both focused vitest invocations green; commit
      `feat(q12): ordinary-row grammar and segment-aware bindings`.

### Task 4: Serializer primitives and ordinary lifecycle emission

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py` (extract from
  `bootstrap_selector` ~1218-1252 and the `run_supervisor` chain loop
  ~2169-2212; generalize `publish_capability`/`finish` for ordinary
  commands)

**Interfaces:**

- Produces (all Engine methods, internal-only):
  - `append_retained_selector_from_current_head(operation, command)` —
    requires current head phase == `PREDECESSOR_PHASES[operation]`; appends
    only the D5 selector intent (no `root.advance`). `bootstrap_selector`
    keeps its synthetic-predecessor behavior for isolated D5 and now calls
    the extracted selector appender.
  - `materialize_retained_operation(engine, manifest, operation, chain)` —
    one complete D5 group from the current head; called by both
    `run_supervisor` (isolated) and the joined composer.
  - `append_ordinary_lifecycle(engine, manifest, command_id, values)` —
    emits the amendment §4 four-row lifecycle (or the D4 five-row quiesce
    lifecycle when `command_id == "writers.quiesce"`) with capability files
    in `capabilities/issued|claimed|completed/` and a result file, reusing
    the existing `publish_capability`/`move_capability`/`finish` primitives
    parameterized by command; returns the head entry.
  - `append_controller_milestone(engine, phase, witness_command_id, values)`
    — one `completed` row per amendment §4 item 6.
- Consumes: Task 1 manifest/IDs, Task 2 `resolved_command`, Task 3 grammar.

- [ ] **Step 1 (RED):** in the live-cutover test, drive a minimal core probe
      (same pattern as existing engine-level cases) asserting: an isolated D5
      chain built through the extracted primitives is byte-identical to the
      current `run_supervisor` output for one `install`-only and one
      later-four spec (guards the extraction against regressions). Expect
      FAIL until extraction lands.
- [ ] **Step 2 (GREEN):** perform the extractions with zero behavior change;
      rerun both focused invocations (must be green — this is the
      no-regression gate for 271 existing cases).
- [ ] **Step 3 (RED):** engine-level cases for `append_ordinary_lifecycle`
      (correct rows/capability graph/result; grammar-validated on reload) and
      `append_controller_milestone` (witness present accepted; witness absent
      fails). Expect FAIL.
- [ ] **Step 4 (GREEN):** implement both; commit `feat(q12): serializer
primitives for joined composition`.

### Task 5: Dual-path FWM publisher and Root inventory

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py` (new
  `publish_final_writer_manifest(engine, mode, inventory, command)`; new
  `derive_root_writer_inventory(quiesce_manifest_bytes, run_id,
include_targets: bool)`; rewire `dispose_durable_frontier` to it)

**Interfaces:**

- Produces:
  - `derive_root_writer_inventory(...) -> dict` — parses the validated
    W-owned `megacampus.q12.writer-quiesce/v1` bytes read-only; returns the
    ten originals plus (when `include_targets`) the five §6.3
    frozen-derivation targets (13 keys each, `intended_restart_policy`
    `{name:"unless-stopped",maximum_retry_count:0}`, `class` copied).
  - `publish_final_writer_manifest(engine, mode, inventory, command)` —
    object at `final-writer-manifest-<mode>-<run-id>.json`, mode `0400`,
    no-replace; intent/accepted pair bound to the mode's resume command with
    the real resolved hash; intent un-checkpointed, acceptance checkpointed
    with the correct predecessor (existing pattern at ~1911-1940). With
    `inventory` present it publishes the full eleven-key
    `megacampus.q12.final-writer-manifest/v1` object (joined path). With
    `inventory=None` it retains the pre-existing five-key isolated-fixture
    reduction — the isolated D5 quiesce manifests are deliberately minimal
    digest preimages (`q12-retained-barrier-quiesce-seam.test.ts:79-93`
    writes 3 keys; `q12-live-cutover.test.ts:87-88` writes `{}`) and carry
    no ten-writer array, so the isolated path cannot and must not derive an
    inventory. The reduction is upgraded in place to the real resume hash and
    the mode-bound rollback path; its object shape is unchanged existing
    behavior, and only joined positives assert the eleven-key schema.
- Consumes: Task 2 `resolved_command`; Task 4 append primitives.

- [ ] **Step 1 (RED):** engine-level cases: forward FWM at the forward path
      with 5 targets + 5 dev finals and 5 production held; rollback FWM at
      the rollback path with 10 originals final and held per profile;
      same-path second publication fails (`immutable_publish` no-replace);
      forward-path rollback publication fails; writer arrays sorted by
      `project, service, id`; all thirteen keys present per entry; ZERO-hash
      rows rejected (Task 3 grammar). Expect FAIL.
- [ ] **Step 2 (GREEN):** implement; rewire `dispose_durable_frontier` to the
      new publisher with `inventory=None` (isolated D5 rollback fixtures keep
      the five-key reduction but gain the real hash and the mode-bound
      rollback path); update every existing pin of the ZERO hash and the
      single `final-writer-manifest-<run-id>.json` path (strengthening; list
      each in the artifact).
- [ ] **Step 3:** add a one-line code comment on the isolated reduction
      object marking it a knowingly schema-id-sharing fixture reduction (the
      normative eleven-key shape is joined-only), and record the same in the
      artifact; both focused invocations green; commit `feat(q12): dual-path
final-writer manifests with Root inventory`.

### Task 6: Joined composer, runner path, TS contract (forward)

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py` (new internal
  `run_joined_composer(request) -> dict`)
- Modify: `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py`
  (distinct validated joined request path keyed on `joinedProfile`)
- Modify: `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts`

**Interfaces:**

- Produces (TS):

```ts
export interface JoinedRetainedBarrierFixtureSpec {
  runRoot: string;
  joinedProfile: 'forward' | 'rollback';
  /** rollback only */
  completedPrefixLength?: 1 | 2 | 3 | 4;
  /** rollback only; must be the exact next operation per the D5J table */
  frontier?: RetainedFrontierSpec;
  /** mandatory for every joined profile, including clean rollback prefix 1 */
  quiesceManifestPath: string;
  /** approved D5 per-chain scenario dimensions, unchanged semantics */
  chains?: Readonly<Partial<Record<RetainedBarrierOperation, RetainedChainSpec>>>;
}
export interface JoinedRetainedBarrierFixtureResult extends RootRetainedBarrierFixtureResult {
  ordinaryHeadEntryHashes: ReadonlyMap<string, string>; // phase -> head hash
  forwardFinalWriterManifestPath: string | null;
  rollbackFinalWriterManifestPath: string | null;
}
export async function materializeJoinedRetainedBarrierFixture(
  spec: JoinedRetainedBarrierFixtureSpec
): Promise<JoinedRetainedBarrierFixtureResult>;
```

- Runner: `joinedProfile` in the stdin spec routes to the joined path;
  unknown keys, caller digests/rows, and a missing `quiesceManifestPath` fail
  before any producer state; the production request is built exactly like the
  isolated path (same fixture constants) plus Task 2 derived values.
- Core: `run_joined_composer` validates the closed request, then emits the
  amendment §5 forward chronology (groups 1-16) through Tasks 4-5 primitives,
  with the §4 item 7-8 segment switches at `quiesced/accepted` and the two
  resource-manifest steps. Returns the Task-6 result projection including
  ordinary heads and FWM paths. `reload_durable` on the produced root must
  succeed (self-check inside the composer before returning).

- [ ] **Step 1 (RED):** create the seam test with the forward positive. The
      test constructs the W-owned quiesce manifest exactly in the accepted
      committed W shape (`q12-writer-resume.py:1233-1252` at W tip
      `7b7cc6b9`): five top-level keys
      `{schema_version, run_id, status, barrier, writers}`, ten writer
      entries of fifteen fields each (five `production-*` and five
      `development-*` classes) — this is the LIFE:323 "exact original-ten
      evidence" preimage, not an invented projection. Assertions:
      exact full row sequence (phase, outcome, command_id per amendment §5,
      asserted as an ordered literal list), genesis = `operator.self-check`
      intent at seq 1, one `phase.jsonl`, one device/inode across
      checkpoints/copies, real quiesce digest from the W-owned file after
      `quiesced/accepted`, both segment switches at the exact rows, one
      forward FWM (path + 11 keys + inventory), no rollback artifact, every
      `command_sha256` recomputed independently in TS from the manifest +
      derivations, and `reload_durable` acceptance. Expect FAIL.
- [ ] **Step 2 (RED negatives, same file):** unknown key; missing quiesce
      path; caller `command_sha256`; caller phase array; `root.advance` in a
      joined positive (compose then mutate via the existing negative-only
      helper — must fail on reload); second journal/side-bundle (two-root
      merge via `rehashJournalAndCheckpointsAfterMutation` — fail); missing
      manifest entry (temporarily point the runner at a 19-key manifest copy
      under the fixture root — `load_manifest` fail before `phase.jsonl`).
- [ ] **Step 3 (GREEN):** implement composer + runner path + TS contract until
      the forward family passes.
- [ ] **Step 4:** both focused invocations (now four files) green; prettier
      on the new/changed TS; commit `feat(q12): joined forward composer and
W-composition seam`.

### Task 7: Rollback profiles and the activation frontier

**Files:** same as Task 6.

**Interfaces:** consumes Task 6; produces the rollback half of the composer:
prefixes 1-4 clean and exact-next-frontier per the D5J tables, D5-owned
frontier forms via the existing frontier machinery, exact `R`, complete
retirement, immediate rollback FWM ancestry, dual-FWM activation frontier.

- [ ] **Step 1 (RED):** table-driven rollback cases: each prefix 1-4 clean
      and with its sole frontier; assert the exact additional chronology per
      D5J §rollback table + amendment bindings; clean profiles add no `R`;
      frontier profiles have `R` then immediate rollback FWM with nothing
      between; held-set cardinality 0 for prefixes 1-4, 5 at the activation
      frontier with byte-identical target entries to the forward FWM; both
      FWM objects durable at their distinct paths in the activation-frontier
      run; wrong/second frontier and install-as-frontier fail; completed
      activation truth in a rollback profile fails; post-`R` forward
      authority fails; reverse-receipt-for-unreached-phase remains a W-side
      negative (not composed here). Expect FAIL.
- [ ] **Step 2 (GREEN):** implement rollback composition.
- [ ] **Step 3:** gates green; commit `feat(q12): joined rollback profiles
with dual FWM`.

### Task 8: Closure coverage — wrappers, parity, serialized suite

**Files:**

- Modify: seam test; `q12-live-cutover.test.ts` (only if a shared helper is
  needed); no deployed file changes.

- [ ] **Step 1 (RED):** seam cases: both deployed wrappers
      (`q12-live-cutover.sh`, `q12-capability-run.sh`) and the core CLI
      parser reject any joined/profile/fixture argument (drive via the
      existing sandboxed wrapper executor); every positive dies if the runner
      or TS helper serializes authority independently (reuse the existing
      "runner cannot construct rows" guard pattern: attempt a joined request
      carrying a prebuilt row — fail before producer state); ordinary
      file-parallel and fully serialized suites stay green.
- [ ] **Step 2 (GREEN/verify):** run both focused invocations and the full
      acceptance command set from Global Constraints; expected: all green,
      zero pending, clean `/tmp` fixture residue (existing cleanup
      assertions).
- [ ] **Step 3:** commit `test(q12): D5J closure coverage`.

### Task 9: Workspace gates, artifact, Beads, push

- [ ] **Step 1:** `pnpm type-check` (workspace) and `pnpm build` — expect
      exit 0.
- [ ] **Step 2:** write
      `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.21-q12-d5j.md` from
      `.codex/stage-artifact-template.md` (status `returned`, verification
      command list with results, changed files, defers) and validate:
      `python3 scripts/orchestration/validate_artifact.py
.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.21-q12-d5j.md`.
- [ ] **Step 3:** `bd comments add mc2-jz6y0.13.21 "<evidence>"`; commit
      `docs(q12): record D5J implementation evidence`; `git push origin
codex/q12-d5j-joined-fixture`.
- [ ] **Step 4:** independent correctness + docs reviews (separate
      subagents), P0/P1-zero gate; fix cycle on findings; only then
      integration into `codex/self-hosted-qdrant-platform` (Task 10 of the
      stage, outside this plan's write zone).

## Self-review notes

- Spec coverage: D5J TDD contract items 1-9 map to Tasks 6 (1, 2, 5, 6),
  7 (3, 4), 8 (7, 8); item 9 (W import) is W `.13.10` scope by design.
  Amendment §9 items 1-8 map to Tasks 1/2 (1), 3 (2, 5, 8), 6 (6, 7),
  7 (3, 4).
- The extraction-regression gate (Task 4 Step 2) protects the 271 existing
  cases before any joined behavior lands.
- Existing-test updates are enumerated and justified only as strengthening
  (ZERO→real hash, five-key→eleven-key FWM, single→dual path); every touched
  assertion is recorded in the artifact.
