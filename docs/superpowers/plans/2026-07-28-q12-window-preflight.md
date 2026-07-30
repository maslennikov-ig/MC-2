# Q12 window pre-flight — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** One read-only probe that asserts every environmental precondition the Q12 live window
depends on, so defects are found in minutes instead of one-per-window-attempt.

**Architecture:** A single Python entry point `deploy/qdrant/q12-window-preflight.py` with a frozen
probe list, driven by the same pooled DSN and the same read-only transaction discipline the plan
capture already uses. Each probe returns a `{id, verdict, detail, evidence}` record; the runner
aggregates them into one canonical 0400 JSON report and exits non-zero on any unmet precondition.
Host probes need no database. A new shared test fixture reproduces the **managed privilege shape**
(non-superuser role, foreign object owners) so the local suite stops being more permissive than
production.

**Tech Stack:** Python 3.13 (stdlib only, same discipline as `q12-migration-plan-capture.py`),
libpq via `psql` service files, `pg` through the existing Node runner only where already used,
Vitest + disposable `postgres:17.10-bookworm` containers for the gated legs.

## Global Constraints

- Read the contract first: `docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`.
  Its § "Hard invariants" and § "Probe list (frozen)" are the acceptance criteria; do not add,
  remove or renumber probes without amending the spec in the same commit.
- Every database statement runs inside `BEGIN READ ONLY` and asserts
  `current_setting('transaction_read_only') = 'on'` before anything else. No DDL, no writes, ever.
- Connect through the pooled production DSN. Connecting directly to the database host is forbidden.
- The probe is NOT one of the 20 frozen manifest commands. `deploy/qdrant/q12-command-manifest.json`
  sha `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841` MUST NOT change.
- `deploy/qdrant/q12-database-barrier.sh` MUST NOT change in this work. If a probe seems to require
  a barrier change, stop and report — that is a separate bead with a W-tuple amendment.
- TDD is mandatory (behaviour change, security-adjacent, production-facing). RED before GREEN for
  every probe, and a two-way mutation check on any probe whose absence would let a known defect
  through.
- Verification commands: `pnpm type-check`, `pnpm build`, and
  `npx vitest run --config vitest.config.unit.ts tests/unit/ops --maxWorkers=3` from
  `packages/course-gen-platform`. The gated legs need `MC2_Q12_REAL_PG17=1` and docker.
- Run `scripts/orchestration/run_process_verification.sh` before any completion claim.
- Never print, log, or embed the DSN, the password, or any capability value. The report carries
  identities and verdicts only.

## File Structure

| File                                                                                  | Responsibility                                                                                                                     |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/qdrant/q12-window-preflight.py`                                               | Entry point: argument surface, probe registry, report emission, exit code. Holds NO probe SQL.                                     |
| `deploy/qdrant/q12-preflight-probes.py`                                               | The frozen probe list: one function per probe id, each returning `{id, verdict, detail, evidence}`. Pure, given a query callable.  |
| `deploy/qdrant/q12-deployed-asset-manifest.json`                                      | NEW tracked artifact: the Q12 files that must exist on the server, with expected mode and owner. Consumed by probe H2.             |
| `packages/course-gen-platform/tests/unit/ops/fixtures/q12-managed-role-fixture.py`    | NEW shared fixture: stands up the managed privilege shape (non-superuser barrier role + foreign owners) in a disposable container. |
| `packages/course-gen-platform/tests/unit/ops/fixtures/q12-window-preflight-runner.py` | Drives the probes against that fixture and against synthetic report inputs.                                                        |
| `packages/course-gen-platform/tests/unit/ops/q12-window-preflight.test.ts`            | Assertions for the runner output: probe coverage, verdict semantics, exit codes, read-only discipline.                             |
| `docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`                  | The contract. Amend in lockstep with any probe change.                                                                             |
| `.codex/handoff.md`                                                                   | Current-state only: replace "run the pre-flight by hand" with the command.                                                         |

---

### Task 1: The managed privilege fixture

Every local fixture today makes the test role a superuser that owns everything. That single
convenience hid two of the nine defects. This task makes the strict shape reusable **first**, so
every later task is written against it.

**Files:**

- Create: `packages/course-gen-platform/tests/unit/ops/fixtures/q12-managed-role-fixture.py`
- Reference (already correct, copy its shape): `packages/course-gen-platform/tests/unit/ops/fixtures/q12-guard-trigger-ownership-runner.py`
- Test: `packages/course-gen-platform/tests/unit/ops/q12-managed-role-fixture.test.ts`

**Interfaces:**

- Produces: `start_managed_fixture(docker: str) -> ManagedFixture` with
  `ManagedFixture.container_id: str`, `.psql(sql, role='mc2_barrier') -> CompletedProcess`,
  `.scalar(sql, role='mc2_barrier', options=None) -> str`, `.stop() -> None`.
  The fixture creates: `mc2_barrier` (LOGIN, **not** superuser, owns nothing but its own schema),
  `mc2_auth_admin` and `mc2_storage_admin` (own their tables, grant only `TRIGGER`, `SELECT`,
  `INSERT`, `UPDATE`, `DELETE` to `mc2_barrier`), and a `cron` schema whose `job` table is owned by
  a third role with `SELECT` only — the exact production shape.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/course-gen-platform/tests/unit/ops/q12-managed-role-fixture.test.ts
it('gives the barrier role production-shaped rights: TRIGGER yes, ownership no', () => {
  const out = drive(); // spawns the fixture runner
  expect(out.barrier_is_superuser).toBe(false);
  expect(out.barrier_owns_auth_table).toBe(false);
  expect(out.barrier_has_trigger_on_auth_table).toBe(true);
  expect(out.barrier_can_lock_auth_table).toBe(true);
  expect(out.barrier_can_lock_cron_job).toBe(false); // SELECT only — the mc2-34eua shape
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/course-gen-platform && MC2_Q12_REAL_PG17=1 npx vitest run --config vitest.config.unit.ts tests/unit/ops/q12-managed-role-fixture.test.ts`
Expected: FAIL — the fixture module does not exist.

- [ ] **Step 3: Write the fixture**

Lift the role/grant block verbatim from `q12-guard-trigger-ownership-runner.py` (it is already
correct and already proven against a live 17.10), generalise it to the three owner roles, and add
`start_managed_fixture` / `stop`.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, and the container is removed even on failure (`finally`).

- [ ] **Step 5: Commit**

```bash
git add packages/course-gen-platform/tests/unit/ops/fixtures/q12-managed-role-fixture.py \
        packages/course-gen-platform/tests/unit/ops/q12-managed-role-fixture.test.ts
git commit -m "test(q12): shared managed-privilege fixture (non-superuser role, foreign owners)"
```

---

### Task 2: The probe runner skeleton and its fail-closed contract

Build the aggregation and exit semantics BEFORE any real probe, so probe authors cannot accidentally
weaken them.

**Files:**

- Create: `deploy/qdrant/q12-window-preflight.py`, `deploy/qdrant/q12-preflight-probes.py`
- Create: `packages/course-gen-platform/tests/unit/ops/fixtures/q12-window-preflight-runner.py`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-window-preflight.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1 yet.
- Produces: `PROBES: tuple[Probe, ...]` where
  `Probe = {"id": str, "group": str, "scope": "host"|"database", "run": Callable[[Context], Verdict]}`;
  `Verdict = {"id": str, "verdict": "pass"|"fail"|"unprovable", "detail": str, "evidence": str|None}`;
  `emit_report(verdicts, scope, run_root, report_dir) -> pathlib.Path`;
  `exit_code(verdicts) -> int`.

- [ ] **Step 1: Write the failing test**

```typescript
it('exits non-zero on any fail, and on any unprovable without evidence', () => {
  const out = drive(['--self-test']); // synthetic verdicts, no DB, no host
  expect(out.exit_all_pass).toBe(0);
  expect(out.exit_with_one_fail).not.toBe(0);
  expect(out.exit_with_unprovable_no_evidence).not.toBe(0);
  expect(out.exit_with_unprovable_with_evidence).toBe(0);
  // no silent skips: every frozen probe id appears in the report
  expect(out.report_ids).toEqual(out.frozen_ids);
  expect(out.report_mode).toBe('0o400');
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `q12-window-preflight.py` does not exist.

- [ ] **Step 3: Write the skeleton**

`PROBES` starts as a frozen tuple of id/group/scope records with `run` raising
`NotImplementedError`; `--self-test` injects synthetic verdicts so the aggregation is testable
without a database or a host. `emit_report` writes canonical JSON at `0400` via the existing
`immutable_publish` discipline (O_EXCL temp + rename + fsync).

- [ ] **Step 4: Run it and watch it pass**

- [ ] **Step 5: Mutation check**

Break `exit_code` so `unprovable` without evidence returns 0. Re-run: the test MUST go red. Restore.

- [ ] **Step 6: Commit**

---

### Task 3: Group A — privilege reachability

The C1 wall. This is the task that would have found defects #6, #7 and half of `mc2-ipwyc`.

**Files:**

- Modify: `deploy/qdrant/q12-preflight-probes.py`
- Modify: the runner and test from Task 2

**Interfaces:**

- Consumes: `start_managed_fixture` (Task 1); `PROBES`, `Verdict` (Task 2).
- Produces: probes `A1`..`A7` per the contract table.

- [ ] **Step 1: Write the failing test** — against the managed fixture, prove each probe BITES:

```typescript
it('fails A3 when the barrier role lacks TRIGGER on a guarded relation', () => {
  const out = drive();
  expect(out.a3_all_granted).toBe('pass');
  expect(out.a3_one_revoked).toBe('fail'); // REVOKE TRIGGER on one table
  expect(out.a3_one_revoked_detail).toContain('auth_table_00');
});
it('fails A2 when a guarded relation carries only SELECT (the cron.job shape)', () => {
  expect(drive().a2_select_only).toBe('fail');
});
it('fails A4 when a cron relation is in the guarded set', () => {
  expect(drive().a4_cron_present).toBe('fail');
});
```

- [ ] **Step 2: Run and watch fail** — probes raise `NotImplementedError`.

- [ ] **Step 3: Implement A1..A7**

One read-only query per probe, all inside `BEGIN READ ONLY`. A2 uses
`has_table_privilege(current_user, oid, 'UPDATE') OR … 'DELETE' OR … 'TRUNCATE' OR … 'MAINTAIN'`;
A3 uses `has_table_privilege(current_user, oid, 'TRIGGER')`. Every `fail` detail names the exact
relations, sorted, capped at the first 10 with a count.

- [ ] **Step 4: Run and watch pass**

- [ ] **Step 5: Commit**

---

### Task 4: Group B — the pooled session

**Files:** as Task 3, plus a second connection helper.

**Interfaces:**

- Produces: probes `B1`..`B4`.
- B1/B2/B3 need their own connections; the helper must reuse the same DSN source, never a direct one.

- [ ] **Step 1: Write the failing test**

```typescript
it('records whether the startup option arrived, and fails if a runner still depends on it', () => {
  const out = drive();
  expect(out.b1_verdict).toBe('pass');
  expect(out.b1_detail).toMatch(/options (delivered|not delivered)/u);
});
it('fails B2 when SET does not survive to the next statement (transaction-mode pooling)', () => {
  expect(drive().b2_transaction_mode).toBe('fail');
});
```

- [ ] **Step 2: Run and watch fail**

- [ ] **Step 3: Implement B1..B4**

B1 opens one connection with `options=-c default_transaction_read_only=on` and reads the setting
back. B2 opens a connection, issues `SET`, and reads it back in a **separate** statement. B3 sets a
distinctive `application_name` and looks itself up in `pg_stat_activity`. B4 reads
`pg_database.datdba`.

- [ ] **Step 4: Run and watch pass**

- [ ] **Step 5: Commit**

---

### Task 5: Groups C, D, E — the unrun path, catalog agreement, quiesce feasibility

**Interfaces:** produces `C1`..`C6`, `D1`, `E1`, `E2`.

D1 MUST reuse the barrier's own structural-catalog SQL (`deploy/qdrant/q12-structural-catalog.sql`)
under `SET LOCAL search_path=pg_catalog` — reimplementing it would recreate `mc2-2rzf6`.

C5 and C6 are `unprovable` by construction. Their `evidence` strings are part of the contract; a
test asserts they are non-empty and name a real artifact.

- [ ] **Step 1: Write the failing tests** (one per probe, each proving the probe bites)
- [ ] **Step 2: Run and watch fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch pass**
- [ ] **Step 5: Mutation check on D1** — feed a catalog captured in a different `search_path`; D1
      MUST go red. This is the `mc2-2rzf6` regression guard.
- [ ] **Step 6: Commit**

---

### Task 6: Group H — host probes and the tracked asset manifest

**Files:**

- Create: `deploy/qdrant/q12-deployed-asset-manifest.json`
- Modify: probes module

**Interfaces:** produces `H1`..`H5`. No database access.

The manifest is generated once from the current `deploy/qdrant` + `deploy/postgres` Q12 file set
(path, expected mode, expected owner, sha256 at the target commit) and is then **tracked**, so H2 is
a byte comparison instead of the hand-eyeballing that is itself a defect surface.

- [ ] **Step 1: Write the failing test** — H2 must fail on a single changed byte, a wrong mode, and
      a wrong owner; H3 must not match its own command line (the `pgrep` trap from 2026-07-28).
- [ ] **Step 2: Run and watch fail**
- [ ] **Step 3: Implement + generate the manifest**
- [ ] **Step 4: Run and watch pass**
- [ ] **Step 5: Commit**

---

### Task 7: Wire it into the window flow and close the loop

**Files:**

- Modify: `.codex/handoff.md` (§ "Next recommended" — replace the manual pre-flight prose with the
  command and the report path; keep the file at or under 200 lines)
- Modify: `deploy/qdrant/q12-live-cutover.sh` — refuse to open the window without a `pass` report
  whose `captured_at` is within the last 30 minutes and whose `tree_sha` matches the deployed tree.

This last one is what makes the pre-flight load-bearing instead of advisory.

- [ ] **Step 1: Write the failing test** — the cutover entry point refuses on a missing report, a
      stale report, and a report from a different tree.
- [ ] **Step 2: Run and watch fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch pass**
- [ ] **Step 5: Full gates** — ops suite, gated real-PG17 legs, `pnpm type-check`, `pnpm build`,
      `scripts/orchestration/run_process_verification.sh`
- [ ] **Step 6: Commit and deliver** via `/push-dev`

---

## After the pre-flight runs — how this continues

The pre-flight is not the end of the work; it is the instrument that makes the rest cheap. The
sequence after Task 7 lands:

1. **Run it for real, host scope first.** `--scope host` needs no database and no run root. Fix
   whatever it names.
2. **Reinstall the server Q12 tree.** The barrier and the controller both moved on 2026-07-28
   (`56a7a88e`, `2e867be46`), so the deployed tree is stale. H2 proves it byte-for-byte afterwards.
3. **Fresh run root + fresh `plan`.** `plan` creates its own root and only reads production. Run root
   `5e9b7256-…` is burnt — every attempt burns its run-id.
4. **Run the full pre-flight** against that root: `--scope all --run-root <fresh>`.
5. **Triage the report.** Every `fail` becomes a bead with the probe id in the title, is fixed under
   TDD, and is delivered. Every `unprovable` is checked for a real evidence pointer. Then re-run
   from step 4 — the loop is minutes, not attempts.
6. **When the report is all green**, open the window to the reversible `--stop-after deploy.prepare`
   hold, with the report attached to the attempt as evidence.
7. **C9/C10 stay owner-gated.** The pre-flight lowers the risk of reaching them; it does not grant
   authority to cross them. That decision remains explicit and separate, and `mc2-i9h3y` tracks it.
8. **Keep the probe list growing.** Any future defect found in a window MUST land as a new probe in
   the same commit as its fix, with the spec amended. That is the ratchet: the class of defect that
   cost nine attempts can only be paid for once per instance.

## Self-review

- **Spec coverage:** every probe in the contract's frozen list maps to Task 3 (A), 4 (B), 5 (C/D/E)
  or 6 (H); the hard invariants map to Task 2; the success criterion maps to Task 7.
- **Placeholders:** none — each task names its files, its interfaces and its RED/GREEN commands.
- **Type consistency:** `Probe` / `Verdict` / `Context` are defined once in Task 2 and used verbatim
  in Tasks 3-6; `start_managed_fixture` is defined in Task 1 and used in Tasks 3-5.
