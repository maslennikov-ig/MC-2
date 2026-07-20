---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-plan-builder-review
stage_id: mc2-jz6y0
agent_type: orchestration-bridge:correctness-reviewer
repo: /home/me/code/mc2
branch: codex/q12-plan-builder
base_branch: codex/self-hosted-qdrant-platform
base_commit: c1d0ca61
worktree: /home/me/code/mc2/.worktrees/q12-plan-builder
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: read-only review; single artifact write, no worktree or branch created.
risk_level: medium
explicit_defers:
  - 'P2 contract note: the live capture() must source guarded_relations from the pre-migration baseline and migrations[].relations from the post-migration delta (barrier global-disjointness, lines 411-412); enforced fail-closed by the delivered validator and already directed to the live-leg implementation stream.'
  - 'P3: --container / MC2_Q12_PLAN_PSQL seams unvalidated (forwarded to the live-leg stream); no explicit bool-as-int negative test; COPY-text escaping robustness note.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-migration-plan-capture.py
  - deploy/qdrant/q12-live-cutover.sh
  - packages/course-gen-platform/tests/unit/ops/q12-migration-plan.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-migration-plan-runner.py
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-plan-builder.md
verification:
  - 'git log/diff pinned to range c1d0ca61..9f9a32c8 (3 commits: RED a46c6173, GREEN 28ec3448, artifact 9f9a32c8); reviewed via git show, not the mutable working tree.'
  - 'Frozen bytes: sha256(q12-database-barrier.sh)=134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68 and sha256(q12-command-manifest.json)=aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841 confirmed unchanged at 9f9a32c8 AND in the current working tree; neither file is in the range diff; q12-structural-catalog.sql not in range.'
  - 'Extracted the frozen expected-catalog jq program (barrier lines 362-413) from real script bytes and manually diffed every clause against validate_expected_catalog / _validate_guarded_relations / _validate_cron_jobs / _validate_migrations.'
  - 'Cross-checked the two other consumer contracts: validateExpectedCatalog in deploy/postgres/q12-source-manifest.ts and buildExpectedCatalog / negative cases in packages/course-gen-platform/tests/unit/ops/q12-database-barrier.test.ts.'
  - 'Read the SQL projection helper q12-migration-plan-capture.py for injection (argv-only exec, no shell), stderr-fail-closed, one REPEATABLE READ READ ONLY txn.'
  - 'Traced credential/run-root path validation (_validate_plan_credential_file, _plan_run_root, require_lexical_absolute, open_parent_directory, ensure_directory) for symlink/hardlink/traversal races.'
  - "Confirmed wrapper routing: OPERATIONS tuple contains no 'plan'/'--plan', so no supervisor invocation can be misrouted."
  - 'Did NOT run docker or the test suites (per constraints); relied on orchestrator fresh runs: unit 10 passed | 1 skipped; real-PG17 11 passed; regression 289 passed; type-check exit 0.'
---

# Summary

**Verdict: PASS.** The delivered plan mode faithfully honours the frozen consumer
contract, is fail-closed, and its tests are honest (real `jq`, real `psql`, real
`python3`, real barrier bytes — not self-referential re-implementations). Both
frozen artifacts are byte-identical to their pinned sha256 in the range HEAD and
in the working tree.

`validate_expected_catalog` is a clause-for-clause mirror of the frozen barrier
jq program (barrier lines 362-413), and where it diverges it is **strictly
stricter** (rejects a superset-safe subset), so anything the builder emits will
pass the barrier's `jq -e` and its sha binding. The self-binding is correct: the
emitted file is written `0o400` and `plan.expected_catalog_sha256 == sha256(file
bytes)`, which is exactly what the barrier re-derives from the opened FD.

No P0/P1 findings. The one item that touches the live cutover window is a
**contract note for the not-yet-written live capture leg** (P2), not a defect in
the delivered code: the frozen barrier requires `guarded_relations` and every
`migrations[].relations` entry to be **globally disjoint** (barrier lines
411-412). This is only satisfiable if the live `capture()` sources
`guarded_relations` from the _pre-migration_ baseline snapshot and each
migration's `relations` from the _newly-created_ relation delta. The delivered
validator enforces this and **fails closed** (no catalog is emitted on
violation — proven by the "collides a migration relation with a guarded relation"
negative test), and the real-PG17 suite demonstrates the correct construction
end to end. The residual risk is purely that the live `capture()` (currently the
accepted fail-closed stub) must wire the same source/delta split; if it does not,
the live window is _blocked_, never silently corrupted.

# Verification

## Consumer-contract fidelity (barrier jq lines 362-413 vs Python validator)

Walked every clause. Representative equivalences (Python side = stricter or equal):

- Top-level key set, `schema_version`, `database`/`database_owner == "postgres"`,
  `release_sha` 40-hex, `migration_frontier == "20260704150249"`, both 64-hex
  shas, `inventory_counts` exact dict — all mirrored exactly.
- `guarded_relations`: length 76, unique oid, unique `schema.name`, per-relation
  key set/schema-enum/name+owner regex/`relkind∈{r,p}`, storage set of 5,
  `public==47`/`auth==22`/`storage==5`, `auth.schema_migrations` forbidden,
  `cron.job==1`, `net.http_request_queue==1` — all mirrored.
- `cron_jobs`: length 8, unique jobids, exact key set, `username=="postgres"`,
  `command_sha256` 64-hex — mirrored.
- `migrations`: exact two keys, per-migration key set + hash shapes, non-empty
  relations, per-relation key set/regex/`(parent_schema==null)==(parent_name==null)`,
  `migrations["20260711151000"].catalog_sha256 == expected_post_migration_catalog_sha256`,
  and the **global uniqueness across guarded + all migration relations** —
  mirrored (`_validate_migrations` seeds `all_identities` with the guarded
  identities before appending migration identities).
- **Stricter-and-safe divergences (Python rejects a subset jq accepts):** oid /
  jobid / parent_oid must be a real `int` with an explicit `isinstance(..., bool)`
  guard (defends bool-as-int type confusion that jq's `type=="number"` would
  miss because Python treats `bool` as `int`); `oid > 0`; `HEX*_RE.fullmatch`
  is anchored with no trailing-newline leniency (jq `$` under Oniguruma matches
  before a trailing `\n`).
- **Sort-key equivalence checked explicitly:** the validator asserts sortedness
  via the concatenated identity `f"{schema}.{name}"` while the barrier uses
  `sort_by(.schema,.name)`. These are provably equivalent here because the
  separator `.` (0x2E) is strictly less than every character admissible in a
  schema/name (`[a-z0-9_]` all ≥ 0x30, plus the fixed schema words), so the
  concatenation order-preserves the tuple order even across the field boundary.
  `assemble_expected_catalog` sorts with the tuple key `(schema, name)`, which is
  the same order the barrier's `sort_by` produces.

The two secondary consumers agree: `q12-source-manifest.ts::validateExpectedCatalog`
enforces the same shapes (it is actually _weaker_ on the disjointness — it only
dedupes migration relations among themselves, not against guarded — so the frozen
barrier + the Python validator are the binding, strictest gate, and they match),
and `q12-database-barrier.test.ts::expectedCatalog` builds a valid fixture whose
migration relations are disjoint from `guarded_relations`, confirming the intended
semantics.

## Fail-closed completeness

`run_plan` order is safe: `capture() -> assemble_expected_catalog() ->
validate_expected_catalog() -> immutable_publish()`. `assemble` first checks
required evidence fields and migration key/shape, then `validate` applies the full
frozen schema; the file is written only after `validate` returns. No path emits a
catalog from malformed evidence. `_plan_count_schema` returns `-1` for non-list
evidence, forcing the `inventory_counts` equality to fail. Type-confusion
(bool-as-int, float oid, nested-shape) and duplicate-identity edges are all
rejected. The negative unit table proves _no file is written_ on rejection
(`readFileSync(...).toThrow()`), including the direct global-disjointness
collision case.

## Security / injection (q12-migration-plan-capture.py)

- SQL is built only from module constants + the frozen `q12-structural-catalog.sql`
  bytes (rejected if it contains `;`); no request/env/file value is interpolated
  into SQL. psql/`docker exec` are invoked with an argv list (no shell), so no
  shell-injection surface. One read-only `REPEATABLE READ READ ONLY` txn wrapping
  `COPY (SELECT ...) TO STDOUT`; any stderr or non-zero status fails closed.
- Credential-file validation (`_validate_plan_credential_file`) opens every
  ancestor with `O_NOFOLLOW` via `open_parent_directory`, opens the leaf with
  `O_RDONLY|O_NOFOLLOW`, and `fstat`s the _fd_ for `S_ISREG`, uid/gid==1000,
  mode∈allowed, and `st_nlink==1`. This is robust against symlink swaps and
  hardlink races (no path re-resolution between check and use).
- `_plan_run_root`: `run_id` is UUID4-validated before it is used in the path;
  an operator-supplied `--run-root` must equal the production root or match
  `^/tmp/mc2-q12-plan-[^/]+$` (fullmatch), and `require_lexical_absolute` rejects
  `.`/`..`/non-normalised paths. No traversal.

## Wrapper routing regression

`q12-live-cutover.sh` routes to `plan` only when `$1 ∈ {plan, --plan}`, else
`supervisor`. `OPERATIONS = (install, verify-after-base, verify-after-observability,
prepare-recovery, activate)` contains neither token, and every existing supervisor
call passes an operation as `$1`, so non-plan behaviour is byte-identical to the
pre-change `exec ... supervisor "$@"`. The routing test drives the real wrapper
for both tokens.

## Test honesty (guards the "mock emulating wrong reality" failure class)

- `frozenBarrierCatalogFilter()` slices the jq program out of the **real barrier
  bytes** (marker `jq -e --arg schema "$EXPECTED_SCHEMA" '` … `' <<<"$expected_json"`)
  and `assertPassesFrozenBarrier` runs the **real `jq` binary** against the
  emitted file — not a TS re-implementation.
- The fixture runner loads and calls the **real** `q12-lifecycle-core.run_plan`
  /`parser()`; only the capture leg is replaced by an injected `FakePlanExecutor`
  (deep-copied evidence), isolating the deterministic builder surface that this
  delivery owns.
- The real-PG17 suite spins a disposable PostgreSQL 17.10, builds a
  Supabase-shaped schema **including decoys** (`realtime.messages`,
  `cron.job_run_details`, `net.http_response`) that the frozen filter must drop,
  runs the **real** capture helper via `docker exec`, applies the two real
  migration-shaped packets, builds evidence from real captures, runs the real
  builder, and asserts the output passes the **real** frozen `jq`. It honestly
  discloses the one un-reproducible leg (Supabase's non-superuser TRIGGER-privilege
  filtering of auth/storage internals) and defers it to synthetic unit cases.
- RED/GREEN split is genuine: `a46c6173` adds only the test + fixture (573
  insertions, zero core changes); `28ec3448` adds the implementation.

# Risks / Follow-ups

- **[P2 · confidence: high on the contract, medium on the live wiring] Live
  capture must preserve the guarded/delta source split.** The frozen barrier's
  global-uniqueness gate (lines 411-412) requires `guarded_relations` (pre-migration
  baseline) and each `migrations[].relations` (newly-created delta) to be disjoint.
  The delivered validator enforces this and fails closed; the real-PG17 test
  demonstrates the correct construction. When the live `capture()` leg replaces the
  stub, it must (a) capture `guarded_relations` from the pre-migration source
  snapshot, and (b) compute `migrations[].relations` as the _added_ relations only.
  If it instead sourced `guarded_relations` from the migrated target, every
  migration-created public table would collide and the barrier would reject at
  cutover (blocked, not corrupted). Recommend an explicit live-leg assertion/comment
  binding this invariant. `LivePlanExecutor._relation_delta` correctly keys on
  `(schema, name)`; note the PG17 test's local `delta` keys on `name` only —
  harmless there (all public) but the production helper is the correct one.

- **[P3 · confidence: high] `--container` and `MC2_Q12_PLAN_PSQL` are unvalidated
  seams in the capture helper (live-leg / test only).** `--container` flows into
  `docker exec -i <container>` argv with no shape check; a value beginning with `-`
  could be misparsed as a docker flag. `MC2_Q12_PLAN_PSQL` selects the psql binary
  from the environment. Both are internal/dead until the live leg wires them
  (`_run_capture` does not propagate `MC2_Q12_PLAN_PSQL`). Recommend validating the
  container name (e.g. `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$`) when the live leg is
  implemented.

- **[P3 · confidence: medium] No explicit bool-as-int / float-oid negative test.**
  The validator defends against these (verified by reading the `isinstance(...,
bool)` and `isinstance(oid, int)` guards), but the unit negative table does not
  exercise them. Adding one case per type-confusion class would lock the behaviour
  against regression.

- **[P3 · confidence: low] `COPY (... jsonb ...) TO STDOUT` text-format escaping.**
  The capture helper relies on relation names / JSON containing no COPY-special
  characters (tab/newline/backslash). Safe for the constrained
  `^[a-z_][a-z0-9_]*$` schema and validated by the PG17 run, but worth a defensive
  note if the projection ever widens to free-form text columns.
