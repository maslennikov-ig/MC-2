---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-r8b-early-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: c52106c29
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Backfill (independent) pre-merge review of already-merged rounds; read-only, single artifact write. No code/config modified, no server/db/docker command run.'
risk_level: low
verification:
  - "Reviewed range c52106c29..81d83c9f5 (5 commits: R8-B-1 triple + R8-B-2-i pair) as of 81d83c9f5 (the defrost adc927305 sits on top and was reviewed separately); every byte-level claim verified independently, execution claims relied on the team-lead's re-runs per the constraint."
  - 'Whole-range: only q12-lifecycle-core.py changed among deployed files (+114/-4); frozen trio at 81d83c9f5 = aaec6fc2 / 3673ee49 (pre-defrost, correct for this point) / 0b8a943f — byte-identical; W-owned files (q12-writer-resume.py, source-recovery-run.sh, q12-source-manifest.ts) untouched; no manifest change. R8-B-2-i leaves the core byte-untouched (empty ec58f75e4..81d83c9f5 core diff) — test-only.'
  - "R8-B-1 execute_barrier_cleanup NEVER fabricates: it CONSUMES the barrier child's on-disk 18-key terminal proof (database-barrier-cleanup-terminal-proof.json) and the prepare-recovery probe receipt (database-barrier-probe-receipt.json) through validate_regular_file(mode=0o400) and binds their real sha256 — mirroring execute() binding sha256(child stdout). The barrier-child that PRODUCES the terminal proof is downstream R8-B-2; this hook owns only the controller file-artifact half."
  - "v1 archive is byte-exact: v1_receipt_bytes = validate_regular_file(receipt_path, 0400); immutable_publish(database-barrier-receipt-v1-before-cleanup.json, v1_receipt_bytes, 0400, []) writes exactly the predecessor bytes the frozen barrier's archive gate (q12-database-barrier.sh:640/644) requires."
  - "v2 promotion is the EXACT 10-key shape, key-for-key vs the W forward-resume gate (q12-writer-resume.py:1090-1101): {schema_version=…/v2, run_id, state=guard_cleanup_complete, expected_catalog_sha256, zero_guard_residue=True, last_command=cleanup, rollback_probes_verified=True, probe_receipt_sha256, terminal_proof_sha256, database_capability_deleted=True} — same key set and values the gate's exact()+require() demand. Written in place via atomic_replace(receipt_path, complete_object(receipt_object), 0o400)."
  - "Byte-twin with the fixture: both the real seam and the fixture executor (q12-retained-barrier-runner.py:732-741, q12-production-executor-cleanup-runner.py:139-148) build the IDENTICAL 10-key dict and serialize via CORE.complete_object (canonical NFC + trailing LF) — and the W gate itself requires data == canonical_json(receipt)+b'\\n', so any conforming producer is byte-identical for the same inputs. The write PRIMITIVE differs (fixture immutable_publish vs real in-place atomic_replace) but the receipt BYTES are identical (the byte-twin the R8-B-1 suite asserts, team-lead 3/3)."
  - "Capability deletion is fail-closed and NOT tolerant of an already-absent capability: validate_regular_file(secrets/db-capability, 0400) enforces the producer-owned 0400/regular/no-symlink identity BEFORE the unlink and RAISES if the file is absent; the unlink runs via open_parent_directory (O_NOFOLLOW ancestor walk) + os.unlink(dir_fd=parent) + os.fsync(parent). Resume idempotence is preserved elsewhere: orchestrate_post_activate_cleanup reuses the on-disk v2 when durable('capability_completed') instead of re-calling execute_barrier_cleanup, so the intolerant delete is never re-hit on a resume."
  - 'Only existing production primitives reused (validate_regular_file / immutable_publish / atomic_replace / open_parent_directory / sha256 / canonical / complete_object); no new file-I/O primitive; the seam mirrors the execute()/launch_claim delegation discipline (consume producer artifacts, bind real digests).'
  - "execute_forward_resume is DELIBERATELY ABSENT on ProductionExecutor (server-side owner-custody child). The pre-flight require_post_activate_executor is split into TWO distinct named checks: (1) execute_barrier_cleanup absent → generic 'not wired' refusal; (2) execute_forward_resume absent → the resume-SPECIFIC refusal. Adversarial ordering: the real ProductionExecutor (cleanup present, resume absent) passes check 1 and fails closed at check 2 with the resume-specific reason, BEFORE any journal row / run-root mutation — the pre-flight remains the first statement of run_live/run_recover; the non-production fixture path returns early and is unaffected."
  - 'R8-B-2-i harness is a genuine real-PG17 chain, not smoke: the runner imports the R4 install runner as a module and REUSES its container/seed/identity/proxy/namespace scaffolding VERBATIM (not a fork), drives real install→base-migration→verify-after-base(20260711140000_guard_verified)→observability-migration→verify-after-observability(20260711151000_guard_verified) via the same unprivileged user+mount+net namespace + pooler-identity TLS proxy on a loopback-only (127.0.0.1::5432) disposable container — no shared-DB / prod reachability. The test asserts a BYTE-MATCH CONTRACT key-for-key and value-for-value against the frozen forward predecessor-gate receipt shape (state=<migration>_guard_verified, last_command=verify-extended, zero_guard_residue=false, rollback_probes_verified=true, probe_receipt_sha256 hex64), plus the exhaustive verify_expected_guards guard-surface — genuine byte/shape assertions.'
  - 'The R8-B-1 artifact records the capability-deletion provenance, the byte-twin, the accepted fixture asymmetry (child-side vs seam-side deletion, downstream), and the deliberate execute_forward_resume absence + resume-specific pre-flight split.'
  - "Did NOT run the vitest suite or any server/db/docker command (constraint); relied on the team-lead's re-runs (seam suite 3/3; verify-chain gated 1 passed 115.15s) for execution claims — all byte-level claims verified above."
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-production-executor-cleanup-runner.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-verify-chain.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-verify-chain-runner.py
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-1.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-i.md
explicit_defers:
  - "Informational: the real seam promotes the v2 IN PLACE via atomic_replace while the fixture writes via immutable_publish — a write-PRIMITIVE difference driven by the real in-place v1→v2 promotion vs the fixture's fresh path; the receipt BYTES are byte-identical (both complete_object of the same 10-key dict, which is what the W gate consumes), so this is not a byte-twin divergence."
  - 'Informational: this round wires only the file-artifact half; the frozen barrier cleanup child that PRODUCES the terminal proof against real PostgreSQL, and execute_forward_resume (server-side owner custody), are downstream (R8-B-2 / server custody). require_post_activate_executor keeps a production run fail-closed until those land, so the incremental wiring is safe.'
  - 'Backfill scope note: these rounds are already merged to stage (worker-review + team-lead verification only); this independent pass finds no P0/P1, so no corrective round is required — findings remain fully actionable had any surfaced.'
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1** — the already-merged R8-B-1 production seam and R8-B-2-i harness are
correct; no corrective round is required. Findings: three informational notes only.

R8-B-1 adds the real `ProductionExecutor` post-activate file-artifact seam — the
production risk boundary — and it is hardened and faithful: it never fabricates
producer data (it consumes the barrier child's on-disk 18-key terminal proof and the
probe receipt through `validate_regular_file(0400)` and binds their real digests),
archives the v1 activate receipt byte-exact, promotes in place to the exact 10-key
`database-barrier-receipt/v2` the W forward-resume gate demands key-for-key, and deletes
the db-capability behind a fail-closed identity check that is deliberately intolerant of
an already-absent capability. It reuses only existing production primitives, is a byte
twin of the fixture's v2, deliberately omits `execute_forward_resume` (server-side owner
custody), and splits the pre-flight into two distinct named checks so a production run
fails closed with the resume-specific reason before any journal/run-root mutation.
R8-B-2-i is a genuine, disposable-container-only real-PG17 verify chain reusing the R4
scaffolding verbatim, asserting the receipts byte-match the frozen predecessor-gate shape.

# Verification

## Whole-range integrity

Only `q12-lifecycle-core.py` changed (+114/-4); frozen trio byte-identical at 81d83c9f5
(`aaec6fc2`/`3673ee49` pre-defrost/`0b8a943f`); W-owned files and the manifest untouched;
R8-B-2-i is core-byte-untouched (test-only).

## R8-B-1 — the production file-artifact seam

- **No fabrication.** `execute_barrier_cleanup` reads the barrier child's on-disk terminal
  proof + probe receipt via `validate_regular_file(0400)` and binds their real sha256 —
  the same delegation discipline as `execute()`.
- **Byte-exact v1 archive** via `immutable_publish` of the validated predecessor bytes.
- **Exact 10-key v2** matching the W gate (`q12-writer-resume.py:1090-1101`) key-for-key and
  value-for-value, written in place via `atomic_replace(complete_object(dict), 0400)`.
- **Fail-closed capability deletion:** `validate_regular_file(0400)` (regular/no-symlink/
  identity) BEFORE the `unlink` — raises on an already-absent capability (the ratified
  intolerance; the frozen barrier never deletes it) — then `open_parent_directory`
  (O_NOFOLLOW) + `unlink(dir_fd=…)` + `fsync`. Resume never re-hits this (the durable
  `capability_completed` branch reuses the on-disk v2).
- **Only existing primitives**; **byte twin** of the fixture v2 (identical 10-key dict via
  `complete_object`, per the W gate's own canonical requirement).
- **`execute_forward_resume` deliberately absent**; the pre-flight is split into two named
  checks, so the real ProductionExecutor (cleanup present, resume absent) fails closed at
  the resume-specific check before any journal/run-root mutation, with the pre-flight still
  the first statement of `run_live`/`run_recover`. Both orderings hold adversarially.

## R8-B-2-i — the real-PG17 verify chain (test-only)

The runner imports the R4 install runner and reuses its scaffolding verbatim (not a fork),
drives the real install→base→verify-after-base→observability→verify-after-observability
chain on a loopback-only disposable container via the unprivileged namespace + pooler-
identity TLS proxy (no shared-DB/prod reachability), and asserts a byte-match contract
(key-for-key, value-for-value) against the frozen predecessor-gate receipt shape plus the
exhaustive `verify_expected_guards` guard-surface — genuine assertions, not smoke.

# Risks / Follow-ups

- **Informational — write-primitive asymmetry.** The real seam promotes v2 in place via
  `atomic_replace` while the fixture uses `immutable_publish` (fresh path); the receipt
  BYTES are identical (both `complete_object` of the same 10-key dict), so the byte-twin
  holds on the content the W gate consumes — not a divergence.
- **Informational — incremental wiring.** The barrier cleanup child that produces the
  terminal proof, and `execute_forward_resume`, are downstream (R8-B-2 / server custody);
  `require_post_activate_executor` keeps production fail-closed until they land.
- **Backfill scope.** These rounds are already merged; this independent pass surfaced no
  P0/P1, so no corrective round is required.
