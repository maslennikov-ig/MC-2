# Q12 W2+W3 Staged-Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Q12 live-cutover window executor so its data-movement commands run against a real source (real `<exported-id>` snapshot, real `baseline.json`, real staged placeholder values) instead of fixture-derived constants, while keeping the fixture byte-parity oracle green as a separate mechanics check.

**Architecture:** A `production`-gated fork at value resolution only. The fixture path (`derive_joined_fixture_values`) stays verbatim as the closed-composer parity oracle. The production path uses a **staged resolver** advanced by lifecycle-step callbacks, a shared **source-snapshot seam** (lifted from `LivePlanExecutor`) reachable by `OwnerCustodyExecutor`, and a **run-root authority file** so compose (journal `command_sha256`) and out-of-band claim (re-resolution) compute byte-identical argv. Engine/serializer/journal primitives are shared unchanged.

**Tech Stack:** Python 3 (`deploy/qdrant/q12-lifecycle-core.py`, single file), Vitest TS harness driving the CLI as a subprocess (`packages/course-gen-platform/tests/unit/ops/q12-*.test.ts`), `MC2_Q12_REAL_PG17=1`-gated disposable `postgres:17.10` containers, `MC2_Q12_PLAN_*` seam-injection env, `deploy/postgres/q12-source-manifest.ts` (tsx) for baseline capture.

## Global Constraints

- Frozen command-manifest identity `aaec6fc2…` is a HARD STOP: never edit `deploy/qdrant/q12-command-manifest.json` content (its sha is the runtime `--resource-manifest-sha256` binding). Verify unchanged before every commit.
- No Qdrant Cloud mutation; no production DB mutation without a fresh pre-window `plan` + explicit owner "go" on C1 (that is W7, owner-gated — NOT in this plan).
- Owner secrets are path-only in code/docs (`/opt/megacampus/secrets/...`); never print secret values; treat `.env*`/credentials/secret files as read-blocked.
- The fixture byte-parity suite (`run_joined_composer` + the fixture unit suite) MUST stay byte-unchanged; real-path tests are added ALONGSIDE, never by mutating the oracle.
- D5J invariant: for every command, `command["command_sha256"] == capability["command_sha256"]` must hold at claim time. Any staged real value MUST reach BOTH compose and claim identically or fail closed.
- Import shared contracts only from `@megacampus/shared-types`. TDD (Iron Law): no production code without a failing test first. Commit per task.
- All `file:line` references are `deploy/qdrant/q12-lifecycle-core.py` at HEAD `9c49d8599` unless noted.
- Verification config: run vitest with `--config vitest.config.unit.ts` and prefix `SUPABASE_URL="http://localhost:54321" SUPABASE_SERVICE_KEY="dummy"` (the unit config has no Qdrant global-setup). Type-check with `pnpm type-check`.

---

## File Structure

- `deploy/qdrant/q12-lifecycle-core.py` (MODIFY) — the entire code change surface for W2/W3. New: a source-snapshot seam class, a staged resolver class, a `production` flag threaded through `run_live`/`run_recover`, run-root authority-file read/write, structural D4 acceptance encoding. The fixture functions and Engine primitives are untouched.
- `packages/course-gen-platform/tests/unit/ops/q12-w3-window-snapshot-seam.test.ts` (CREATE) — W3-struct: structural wiring + fail-closed with a fake coordinator (here), live leg `MC2_Q12_REAL_PG17`-gated.
- `packages/course-gen-platform/tests/unit/ops/q12-w2-staged-resolver.test.ts` (CREATE) — W2-fork: `production`-gated staged resolver, resolve-once caching, fail-closed on re-resolve drift, fixture path byte-unchanged.
- `packages/course-gen-platform/tests/unit/ops/q12-w2-compose-claim-consistency.test.ts` (CREATE) — W2-consistency: run-root authority round-trip, compose↔claim `command_sha256` equality with fakes.
- `packages/course-gen-platform/tests/unit/ops/q12-w2-real-run-oracle.test.ts` (CREATE) — W2-oracle: structural D4 acceptance checks (real-evidence leg PG17/window-gated).
- `docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md` (REFERENCE) — the co-design this plan implements.

---

## Task 1 — W3-struct: source-snapshot seam reachable by the window executor

**Bead:** `mc2-58tnx`. **Goal:** give `OwnerCustodyExecutor` a snapshot-coordinator + `baseline.json` capability (OQ5/OQ6) behind an isolable seam, so the resolver's `on_snapshot_open()` (Task 2) can obtain a real `<exported-id>` and publish `baseline.json` on the window path.

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py` — add `class SourceSnapshotSeam` (new); have `OwnerCustodyExecutor.__init__` compose one; add `OwnerCustodyExecutor.open_window_snapshot(request, run_root) -> tuple[str, pathlib.Path]`.
- Test: `packages/course-gen-platform/tests/unit/ops/q12-w3-window-snapshot-seam.test.ts` (create)

**Interfaces:**

- Consumes: existing module helpers `PLAN_SNAPSHOT_RE`, `immutable_publish`, `complete_object`, `LifecycleError`, and the source-config env keys already documented on `LivePlanExecutor` (`MC2_Q12_PLAN_SOURCE_CONTAINER`, `MC2_Q12_PLAN_DOCKER`, `MC2_Q12_PLAN_PSQL`, `MC2_Q12_PLAN_FAULT`). Reuses `deploy/postgres/q12-source-manifest.ts` verbatim.
- Produces:
  - `class SourceSnapshotSeam` with `open_snapshot(request, workdir) -> tuple[subprocess.Popen[str], str]`, `close_snapshot(proc) -> None`, `produce_baseline(request, workdir, run_root) -> pathlib.Path`. These are the two `LivePlanExecutor` methods (`_open_snapshot_coordinator` :6840, `_close_snapshot_coordinator` :6897, `produce_run_root_baseline` :6917) factored into one seam class that owns the source-connection state (`docker`, `source_container`, `_source_service`, `_base_env`, `_source_service_env`, `fault`, `repo_root`, `_coordinator`). `LivePlanExecutor` composes the seam and delegates, so its existing gated PG17 tests keep passing byte-identically (refactor-preserving).
  - `OwnerCustodyExecutor.open_window_snapshot(request, run_root) -> tuple[str, pathlib.Path]` returns `(exported_id, baseline_path)` — opens the coordinator, exports the snapshot, produces `baseline.json`, and closes the coordinator. `exported_id` matches `PLAN_SNAPSHOT_RE`.

- [ ] **Step 1: Write the failing structural test (fake seam, no live DB)**

Add to `q12-w3-window-snapshot-seam.test.ts` an in-process python probe (mirror the W4 suite's `spawnSync('/usr/bin/python3', ['-c', probe, CORE, ...])` pattern) that imports the module, monkeypatches `SourceSnapshotSeam.open_snapshot` to return a fake `(FakePopen(), 'ffffffff-ffffffff-1')` and `produce_baseline` to write a `0400` `baseline.json` with a sentinel body, constructs an `OwnerCustodyExecutor`, calls `open_window_snapshot(request, run_root)`, and asserts: (a) returned `exported_id == 'ffffffff-ffffffff-1'` and matches `m.PLAN_SNAPSHOT_RE`; (b) `baseline_path` exists, is mode `0o400`; (c) the fake coordinator's `close` was called exactly once (record on the fake). Print `W3_STRUCT_OK`.

```js
// probe skeleton (assertions abbreviated; expand inline — no placeholders in the real file)
const probe = [
  'import importlib.util,sys,pathlib,tempfile,os,json',
  's=importlib.util.spec_from_file_location("q12",sys.argv[1])',
  'm=importlib.util.module_from_spec(s);sys.modules[s.name]=m;s.loader.exec_module(m)',
  'closed={"n":0}',
  'class FakeProc:\n def __init__(self):\n  self.stdin=None\n def poll(self):\n  return None',
  'def fake_open(self,request,workdir):\n return FakeProc(),"ffffffff-ffffffff-1"',
  'def fake_close(self,proc):\n closed["n"]+=1',
  'def fake_baseline(self,request,workdir,run_root):\n p=pathlib.Path(run_root)/"baseline.json";m.immutable_publish(p,m.complete_object({"k":"v"}),0o400,[]);return p',
  'm.SourceSnapshotSeam.open_snapshot=fake_open',
  'm.SourceSnapshotSeam.close_snapshot=fake_close',
  'm.SourceSnapshotSeam.produce_baseline=fake_baseline',
  'root=pathlib.Path(tempfile.mkdtemp())',
  'ex=m.OwnerCustodyExecutor()',
  'eid,bp=ex.open_window_snapshot({"run_id":"11111111-1111-4111-8111-111111111111"},root)',
  'assert eid=="ffffffff-ffffffff-1" and m.PLAN_SNAPSHOT_RE.fullmatch(eid)',
  'assert bp.exists() and (bp.stat().st_mode & 0o777)==0o400',
  'assert closed["n"]==1, closed',
  'print("W3_STRUCT_OK")',
].join('\n');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `SUPABASE_URL="http://localhost:54321" SUPABASE_SERVICE_KEY="dummy" pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-w3-window-snapshot-seam.test.ts`
Expected: FAIL — `AttributeError: type object 'OwnerCustodyExecutor' has no attribute ... ` / `module 'q12' has no attribute 'SourceSnapshotSeam'` (feature missing).

- [ ] **Step 3: Extract `SourceSnapshotSeam` and delegate from `LivePlanExecutor`**

Create `class SourceSnapshotSeam` holding the source-connection state and the three methods (moved verbatim in body from `_open_snapshot_coordinator`/`_close_snapshot_coordinator`/`produce_run_root_baseline`, renamed `open_snapshot`/`close_snapshot`/`produce_baseline`). Its `__init__` reads the same env keys `LivePlanExecutor.__init__` reads for source config. In `LivePlanExecutor.__init__`, construct `self._snapshot_seam = SourceSnapshotSeam(...)` sharing `repo_root`/`docker`/`source_container`/`fault`; replace the three method bodies with delegations to `self._snapshot_seam` (keep the old method names as thin wrappers so `_drill_flow` :6971 and other callers are byte-unchanged in behavior). Do NOT change `q12-source-manifest.ts`.

- [ ] **Step 4: Add `OwnerCustodyExecutor.open_window_snapshot` and compose the seam**

In `OwnerCustodyExecutor.__init__` (add one if absent — it currently has none; add `def __init__(self): super().__init__(); self._snapshot_seam = SourceSnapshotSeam(...)`), then:

```python
def open_window_snapshot(self, request, run_root):
    """OQ5+OQ6 on the window path: export a real source snapshot and publish baseline.json.
    Returns (exported_id, baseline_path). The live psql/tsx legs are MC2_Q12_REAL_PG17-gated;
    the structural wiring is unit-testable with a fake seam."""
    run_root = pathlib.Path(run_root)
    baseline_path = self._snapshot_seam.produce_baseline(request, run_root, run_root)
    proc, exported_id = self._snapshot_seam.open_snapshot(request, run_root)
    try:
        if not PLAN_SNAPSHOT_RE.fullmatch(exported_id):
            raise LifecycleError("window snapshot coordinator exported an invalid snapshot id")
    finally:
        self._snapshot_seam.close_snapshot(proc)
    return exported_id, baseline_path
```

Note: `produce_baseline` MUST run before `barrier.install` (it records cron-active/writable); it opens/closes its own coordinator internally (as `produce_run_root_baseline` does at :6940/:6968). The extra `open_snapshot`/`close_snapshot` here yields the held `<exported-id>` the pg.backup step binds. If review shows the baseline and exported-id should share ONE coordinator session, collapse to a single `open_snapshot` + inline capture; keep them separate only if the two-open shape matches the plan executor's real ordering — verify against `backup-supabase.sh:853-926` before finalizing.

- [ ] **Step 5: Run structural test to verify it passes**

Run: (same as Step 2)
Expected: PASS — `W3_STRUCT_OK`.

- [ ] **Step 6: Add the live PG17-gated leg and run the existing plan suite**

Add a second `it(...)` guarded by `if (!process.env.MC2_Q12_REAL_PG17) return;` that spins the existing disposable `postgres:17.10` source container (reuse the setup from `q12-live-baseline-producer.test.ts`), constructs a real `OwnerCustodyExecutor` with `MC2_Q12_PLAN_SOURCE_CONTAINER` pointed at it, calls `open_window_snapshot`, and asserts a real `baseline.json` (0400, non-empty `baseline` object) + a `pg_export_snapshot`-shaped id. Then confirm the refactor preserved the plan executor:

Run: `MC2_Q12_REAL_PG17=1 SUPABASE_URL="http://localhost:54321" SUPABASE_SERVICE_KEY="dummy" pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-live-baseline-producer.test.ts tests/unit/ops/q12-live-real-full-window.test.ts tests/unit/ops/q12-w3-window-snapshot-seam.test.ts`
Expected: PASS (all three) — the extraction is refactor-preserving for the plan executor and the new window seam works against real PG17.

- [ ] **Step 7: Commit**

```bash
# verify manifest identity unchanged first
git diff --quiet deploy/qdrant/q12-command-manifest.json || { echo "MANIFEST CHANGED — STOP"; exit 1; }
git add deploy/qdrant/q12-lifecycle-core.py packages/course-gen-platform/tests/unit/ops/q12-w3-window-snapshot-seam.test.ts
git commit -m "feat(q12): lift source-snapshot seam to window executor (W3-struct mc2-58tnx)"
```

---

## Task 2 — W2-fork: `production`-gated staged resolver

**Bead:** `mc2-j58wi`. **Goal:** on the production path only, replace the single upfront `values` dict with a staged resolver advanced by lifecycle callbacks; fixture path stays byte-unchanged.

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py` — add `class StagedValueResolver`; thread a `production: bool` flag through `run_live` (:3930) / `run_recover` (:4052) and into `drive_forward_sequence`; select resolver-vs-dict at :3980/:4018.
- Test: `packages/course-gen-platform/tests/unit/ops/q12-w2-staged-resolver.test.ts` (create)

**Interfaces:**

- Consumes: `OwnerCustodyExecutor.open_window_snapshot` (Task 1); existing `derive_joined_fixture_values` (:708), `SUBSTITUTION_PLACEHOLDERS` (:692).
- Produces:
  - `class StagedValueResolver` with `value(placeholder: str) -> str` (fail-closed `LifecycleError` if not yet resolved), `on_snapshot_open(exported_id, baseline_path) -> None` (resolves `<exported-id>`), `on_pg_backup_done(generation_dir: str) -> None` (resolves `<immutable-generation>` from `restore-supabase-drill.sh:302-303` printed dir), `on_source_forward_accepted(recovery_state_dir: pathlib.Path) -> None` (resolves `<accepted-recovery-manifest-sha256>`, `<accepted-coverage-fingerprint>`, `<accepted-coverage-run>` from the recovery `manifest.json` + journal). Resolve-once: a second resolve of an already-set placeholder MUST byte-match the cached value or raise `LifecycleError("staged value re-resolution drift")`. `<quiesce-manifest>`, `<recovery-run-id>` are set at construction (UPFRONT authorities per co-design §1.5 table).
  - `run_live(request, executor, *, production: bool = False)` — when `production` is False, behavior is byte-identical to today (uses `derive_joined_fixture_values`). When True, builds a `StagedValueResolver` and exposes `value()` to `ordinary(...)`/`d5(...)` in place of the frozen dict.

- [ ] **Step 1: Write the failing resolver-unit test**

Add an in-process python probe: construct `StagedValueResolver(run_id, quiesce_manifest_path, recovery_run_id)`; assert `value("<quiesce-manifest>")` returns the path and `value("<exported-id>")` raises `LifecycleError` (not yet staged); call `on_snapshot_open("ffffffff-ffffffff-1", fake_baseline)`; assert `value("<exported-id>")=="ffffffff-ffffffff-1"`; call `on_snapshot_open` again with the SAME id (ok, byte-match) then with a DIFFERENT id and assert `LifecycleError` (drift fail-closed). Print `W2_RESOLVER_OK`.

- [ ] **Step 2: Write the failing "fixture path byte-unchanged" test**

Add a probe that runs the closed-composer twin for a fixed `run_id` with `production=False` and asserts the produced journal bytes equal the committed golden (reuse whatever `run_joined_composer` fixture assertion the existing suite uses; assert the digest is unchanged from HEAD). This pins D1 (no oracle mutation).

- [ ] **Step 3: Run tests to verify they fail**

Run: `SUPABASE_URL="http://localhost:54321" SUPABASE_SERVICE_KEY="dummy" pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-w2-staged-resolver.test.ts`
Expected: FAIL — `module 'q12' has no attribute 'StagedValueResolver'`.

- [ ] **Step 4: Implement `StagedValueResolver` + the production fork**

Add `class StagedValueResolver`. Thread `production: bool` through `run_live`/`run_recover`/`drive_forward_sequence`. At :3980, branch:

```python
if production:
    resolver = StagedValueResolver(request["run_id"], str(quiesce_path), request["recovery_run_id"])
    # ordinary()/d5() read from resolver.value(...) instead of the frozen `values` dict
else:
    values = derive_joined_fixture_values(request["run_id"], str(quiesce_path))
```

Make `ordinary(...)`/the `exported_id` read (:4018) go through a single `resolve(placeholder)` indirection that is `resolver.value` in production and `values.__getitem__` in fixture mode, so the call sites stay uniform. Do NOT change `append_ordinary_lifecycle` or the Engine.

- [ ] **Step 5: Run tests to verify they pass**

Run: (same as Step 3) + the fixture-parity test.
Expected: PASS — `W2_RESOLVER_OK`, fixture golden byte-unchanged.

- [ ] **Step 6: Commit**

```bash
git diff --quiet deploy/qdrant/q12-command-manifest.json || { echo "MANIFEST CHANGED — STOP"; exit 1; }
git add deploy/qdrant/q12-lifecycle-core.py packages/course-gen-platform/tests/unit/ops/q12-w2-staged-resolver.test.ts
git commit -m "feat(q12): production-gated staged value resolver (W2-fork mc2-j58wi)"
```

---

## Task 3 — W2-consistency: run-root authority file + compose↔claim equality

**Bead:** `mc2-j58wi` (same bead, second increment). **Goal:** persist staged real values into a run-root authority file the out-of-band `claim` re-resolution reads, so compose and claim compute byte-identical argv → identical `command_sha256` (D5J).

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py` — extend the controller-owned resource-manifest artifact (`write_live_resource_manifest` :3492) to carry staged real values; make `resolved_command` (:733) read them on the production path; add the claim-side read.
- Test: `packages/course-gen-platform/tests/unit/ops/q12-w2-compose-claim-consistency.test.ts` (create)

**Interfaces:**

- Consumes: `StagedValueResolver` (Task 2), `resolved_command` (:733), `write_live_resource_manifest` (:3492).
- Produces:
  - A run-root authority file `<run-root>/staged-values-<run-id>.json` (0400, `complete_object` canonical) written by the controller as each stage resolves; single authority per value (D5J single-authority).
  - `resolved_command(manifest, command_id, request, values=None, *, staged_authority: pathlib.Path | None = None)` — when `staged_authority` is set (production claim path), it loads the authority file and merges those placeholders into `substitutions`, so a re-resolution at claim time yields the SAME argv the composer used.

- [ ] **Step 1: Write the failing compose↔claim equality test**

Probe: with a fake resolver producing known values, (a) compose a `pg.backup` command via the production compose path and capture its `command_sha256`; (b) write the staged-values authority file; (c) re-resolve the same command via the claim path (`resolved_command(..., staged_authority=path)`) and assert the two `command_sha256` are byte-equal. Then corrupt one authority value and assert the claim `command_sha256` DIFFERS (proving the bind is load-bearing). Print `W2_CONSISTENCY_OK`.

- [ ] **Step 2: Run test to verify it fails**

Run: `SUPABASE_URL="http://localhost:54321" SUPABASE_SERVICE_KEY="dummy" pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-w2-compose-claim-consistency.test.ts`
Expected: FAIL — `resolved_command() got an unexpected keyword argument 'staged_authority'`.

- [ ] **Step 3: Implement the authority file + claim-side read**

Write the authority file from the controller as stages resolve (piggyback on the checkpoint-bound resource-manifest write at :3492 or a sibling immutable-publish). Add the `staged_authority` kwarg to `resolved_command`; on the production claim path, load and merge. Keep the fixture path (no `staged_authority`) byte-unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: (same as Step 2)
Expected: PASS — `W2_CONSISTENCY_OK`.

- [ ] **Step 5: Commit**

```bash
git diff --quiet deploy/qdrant/q12-command-manifest.json || { echo "MANIFEST CHANGED — STOP"; exit 1; }
git add deploy/qdrant/q12-lifecycle-core.py packages/course-gen-platform/tests/unit/ops/q12-w2-compose-claim-consistency.test.ts
git commit -m "feat(q12): run-root staged-value authority for compose/claim byte-parity (W2-consistency mc2-j58wi)"
```

---

## Task 4 — W2-oracle: structural D4 acceptance encoding

**Bead:** `mc2-j58wi` (same bead, third increment). **Goal:** encode the LOCKED D4 real-run acceptance oracle structurally; the real-evidence leg stays PG17/window-gated.

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py` — add `accept_real_run(children_exit_codes, barrier_receipt, recovery_journal) -> None` (raises `LifecycleError` on any failing condition) and call it at the production run_live/run_recover acceptance point.
- Test: `packages/course-gen-platform/tests/unit/ops/q12-w2-real-run-oracle.test.ts` (create)

**Interfaces:**

- Consumes: the barrier receipt v2 shape already validated in `OwnerCustodyExecutor.execute_forward_resume` (:944-1024).
- Produces: `accept_real_run(...)` enforcing D4: (1) every real child exited 0; (2) barrier receipt v2 `state == "guard_cleanup_complete"`; (3) coverage `org:course:run` present in the recovery journal. Byte-parity does NOT gate a real run (asserted by a test that a real run with a DIFFERENT-but-valid journal than the fixture golden is still accepted).

- [ ] **Step 1: Write the failing oracle test**

Probe: `accept_real_run([0,0,0], valid_v2_receipt, journal_with_coverage)` returns None; each of the three negatives (`[0,1,0]`; receipt `state != guard_cleanup_complete`; journal missing coverage) raises `LifecycleError`. Plus the byte-parity-independence assertion. Print `W2_ORACLE_OK`.

- [ ] **Step 2: Run test to verify it fails**

Run: `SUPABASE_URL="http://localhost:54321" SUPABASE_SERVICE_KEY="dummy" pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-w2-real-run-oracle.test.ts`
Expected: FAIL — `module 'q12' has no attribute 'accept_real_run'`.

- [ ] **Step 3: Implement `accept_real_run` and wire it**

Add the function; call it on the production acceptance point (guarded by `production`). Fixture path untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: (same as Step 2)
Expected: PASS — `W2_ORACLE_OK`.

- [ ] **Step 5: Full focused suite + type-check, then commit**

```bash
SUPABASE_URL="http://localhost:54321" SUPABASE_SERVICE_KEY="dummy" pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-*.test.ts
pnpm type-check
git diff --quiet deploy/qdrant/q12-command-manifest.json || { echo "MANIFEST CHANGED — STOP"; exit 1; }
git add deploy/qdrant/q12-lifecycle-core.py packages/course-gen-platform/tests/unit/ops/q12-w2-real-run-oracle.test.ts
git commit -m "feat(q12): structural D4 real-run acceptance oracle (W2-oracle mc2-j58wi)"
```

Expected: focused `q12-*` suite green (fixture parity intact + new real-path tests), type-check EXIT=0.

---

## Task 5 — W5: rehearse the newly-wired real path against the disposable stack

**Bead:** `mc2-v68w6`. **Goal:** drive the full production path (`production=True`) against a disposable PG17 stack end-to-end under `MC2_Q12_REAL_PG17=1`, respecting the IN-WINDOW-only residual (real Qdrant reindex/nginx stay window-only).

**Files:**

- Test/harness: extend `q12-live-real-full-window.test.ts` or add `q12-w5-real-path-rehearsal.test.ts` (create) that runs `run_live(..., production=True)` with `MC2_Q12_PLAN_*` seams pointed at disposable containers and the real data-movement commands actually executing against them.

- [ ] **Step 1** Author the rehearsal harness reusing the disposable-PG17 setup; execute the real staged resolver → snapshot seam → pg.backup/pg.restore/source.forward/reindex(seam) → deploy(seam) chain; assert the D4 oracle accepts and byte-parity mechanics still hold for the composer twin.
- [ ] **Step 2** Run: `MC2_Q12_REAL_PG17=1 SUPABASE_URL="http://localhost:54321" SUPABASE_SERVICE_KEY="dummy" pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-w5-real-path-rehearsal.test.ts`. Expected: PASS.
- [ ] **Step 3** Record the IN-WINDOW-only residual (what could NOT be rehearsed on disposable infra) explicitly in `.codex/handoff.md`. Commit.

---

## Task 6 — W6: window operator runbook v2 (docs)

**Bead:** `mc2-naz8j`. **Goal:** author the current window operator runbook superseding the 2026-07-17 procedure, reflecting `--stop-after` (W4), the staged real path (W2/W3), and the D4 oracle.

- [ ] **Step 1** Write `docs/qdrant/q12-window-operator-runbook-v2.md`: C1..C10 sequence, the reversible STOP-point (`--stop-after deploy.prepare` is the last reversible checkpoint; `barrier.activate` is PAST the point of no return), recover semantics, the owner-held C9 activate gate, and the D4 acceptance criteria. Reference (do not inline) secret paths.
- [ ] **Step 2** Cross-check every command against the frozen manifest and the CLI `--help`. Commit.

---

## Task 7 — W7: open the live window (OWNER-GATED — STOP)

**Bead:** `mc2-i9h3y`. **This task is NOT executed by the agent.** It requires a fresh pre-window `plan`, explicit owner "go" on C1, and the owner personally holds the C9 `barrier.activate` / nginx switch (the irreversible point of no return). The agent prepares (fresh plan output, runbook, green rehearsal) and STOPS; the owner opens the window. Phase D closeout follows the window.

---

## Self-Review

- **Spec coverage:** co-design §6.1 W3-struct → Task 1; §6.2 W2-fork → Task 2; §6.3 W2-consistency → Task 3; §6.4 W2-oracle → Task 4; §6.5 W5/W7 → Tasks 5 & 7; W6 runbook → Task 6. D1 (no-oracle-mutation) → Task 2 Step 2; D2 (staged resolver) → Task 2; D3 (authority file) → Task 3; D4 (locked oracle) → Task 4; D5 (window wiring, option a) → Task 1. Verifiability boundary §4 honored: structural here, live legs PG17/window-gated.
- **Placeholder scan:** code steps carry real signatures and real env/commands; illustrative probe skeletons are marked "expand inline — no placeholders in the real file" and must be fully written when implemented.
- **Type consistency:** `SourceSnapshotSeam.{open_snapshot,close_snapshot,produce_baseline}`, `OwnerCustodyExecutor.open_window_snapshot`, `StagedValueResolver.{value,on_snapshot_open,on_pg_backup_done,on_source_forward_accepted}`, `resolved_command(..., staged_authority=)`, `accept_real_run(...)` are used consistently across tasks.
