---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-r8b-2-iii-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: f508b31be
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only pre-merge review; single write is this artifact. No code/config modified, no server/db/docker command run.'
risk_level: low
verification:
  - "Reviewed the FIXED range d48a6441e..f508b31be (3 commits: RED 1cbe848c6 test-only, GREEN be305d809 runner-only, docs f508b31be) via git show/diff; every byte-level claim verified independently. Execution claims (gated chain 119.4s, tsc 0) relied on the team-lead's re-runs per constraint. Reviewed as-is; stage iv proceeds concurrently on top and is out of scope."
  - 'WHOLE-RANGE (Duty 6): deploy/ diff is EMPTY (git diff --stat d48a6441e..f508b31be -- deploy/ → no output). Only 4 files change: the two test/harness files, the worker artifact, and the plan log. Frozen shas recomputed at TIP f508b31be: barrier q12-database-barrier.sh = bdb9d935e3c09fb01503ba9d016f36a9cf94db5539dfcdc73c1692eb442925ce; command-manifest = aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841; structural-catalog = 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e — all three match the ratified frozen trio. q12-lifecycle-core.py byte-identical across the range (c9cc0d5f… both ends); W-owned q12-writer-resume.py (49ef1a07…) and source-recovery-run.sh (9b0b5d53…) byte-identical both ends.'
  - "REAL-EXECUTION FIDELITY (Duty 1): the cleanup leg drives run_barrier('cleanup') through the SAME private user+mount+net namespace behind the pooler-identity TLS proxy as every other leg (runner :375-414), no DB-command stub. The barrier genuinely re-validates the controller journal: for each entry it re-checks the entry_hash chain (barrier :~495-505 → reject 'invalid journal chain'), filters cleanup rows by phase=='guard_cleanup_complete' AND command_id=='barrier.cleanup' (:508-511), enforces trailing-contiguity (:512-513), single-cutover-epoch allowed-outcome slice == exactly [['intent','capability_issued','capability_claimed']] (:521-533), one shared hex64 capability_manifest across non-intent rows (:534-539), and the claimed-boundary head + intent-with-0*64 (:550-556). Therefore cleanup_rc==0 is a TRUE acceptance oracle (the barrier's reject() is the oracle), and proof.intent_journal_entry_hash == the harness-recomputed intent entry_hash (test :118) binds the accepted chain. The harness builds a FRESH real hash-chained 3-row block (runner :655-697) precisely because the fake-hash install journal used by the verify legs cannot drive cleanup (the cleanup projection re-hashes every entry)."
  - "NO forbidden test-mode DB relaxation of the primary command: MC2_Q12_BARRIER_TEST_MODE is set (test_mode=1) but MC2_Q12_BARRIER_TEST_REAL_RECONNECT is NOT (runner env :365-372) → real_reconnect_test=0. The primary DB command (NODE_RUNNER real DROP SCHEMA q12_guard CASCADE, barrier :1944-1948) executes regardless of test_mode and is PROVEN real by the independent live query below. See P3-1 re: the one thing test_mode does relax (the barrier's SEPARATE fresh-connection terminal-reconnect re-verification)."
  - "TERMINAL PROOF (Duty 2): 18-key EXACT — test asserts Object.keys(proof).sort() equals the exact 18-key set, which matches the barrier's own terminal-proof key list (:767-773) byte-for-byte. guard_residue asserted all-zero (7-field object, test :132-140); state=='guard_cleanup_complete'; operation=='cleanup'; structural_catalog_sha256 == expected_post_migration_catalog_sha256 == after_obs_structural_sha256 (test :112-113); cleanup rollback fields null (database_barrier_rollback_intent_sha256 + required_phase_receipts_sha256, test :115-116). INDEPENDENCE PROVEN: guard_residue_db is a SEPARATE dexec_json over pg_namespace/pg_class/pg_proc/pg_event_trigger (runner :142-150) asserted =={schema:0,relation:0,function:0,event_trigger:0} (test :143-148) — a real second-observer catalog query, NOT the proof's self-report. Pre-cleanup the guard is provably LIVE (the SQLSTATE probes trip P0001), so this is a genuine before/after DROP."
  - "THE SEAM ON REAL ARTIFACTS (Duty 3): core.ProductionExecutor.execute_barrier_cleanup is invoked against seam_context.run_root == str(barrier_run_root) — the REAL run_root the barrier cleanup just populated, not a fixture (runner :735, :773-780). v1 archive byte-exact: archive_matches_activate_receipt (archive bytes == pre-cleanup activate receipt bytes) asserted true (test :200). 10-key v2 EXACT and W-GATE-MATCHED: v2_receipt_keys equals exactly {database_capability_deleted, expected_catalog_sha256, last_command, probe_receipt_sha256, rollback_probes_verified, run_id, schema_version, state, terminal_proof_sha256, zero_guard_residue} (test :174-185) — key-for-key identical to the W forward-resume exact() gate at q12-writer-resume.py:1088 (read-only verified), whose require() also demands canonical_json bytes; v2_matches_expected_contract == (v2 bytes == core.complete_object(expected_v2)) asserted true (test :186). terminal_proof_sha256 binds an INDEPENDENTLY computed digest: seam.terminal_proof_sha256 == out.cleanup_terminal_proof_sha256_after_barrier (harness's own sha256 of the on-disk proof, runner :136-140; test :170,:197). db-capability deleted fail-closed: capability_exists_after_seam asserted false (test :202)."
  - "IDEMPOTENCE same epoch (Duty 4): the 2nd cleanup drive (runner :751 run_barrier('cleanup')) hits the barrier's EARLY terminal-proof re-validation branch (:764-808) — which re-checks the existing 18-key proof EXACT then prints 'q12 database barrier: guard_cleanup_complete proof already verified' and exit 0 BEFORE the NODE_RUNNER DB command (:1944). Test asserts cleanup_rerun_rc==0, stdout contains that exact string, and cleanup_terminal_proof_sha256_after_rerun == …_after_barrier (byte-identical proof, test :153-158). ORDERING VERIFIED: the rerun (runner item 15, :751) precedes the seam (item 16, :773-780) that deletes the capability — and it MUST, because the early branch still references database_capability_sha256 (barrier :798), so a post-deletion rerun would fail capability validation. Multi-epoch cutover-recovery-N re-drive is an EXPLICIT DEFER, recorded in the worker artifact frontmatter explicit_defers + body (:120-124,:199-202) and the plan log (stage iv / server rehearsal)."
  - 'DEFROST P3 FOLDED (Duty 5): the anti-weakening probe now asserts the LITERAL SQLSTATE. The runner wraps each guarded write in DO $q12probe$ … EXCEPTION WHEN OTHERS THEN RAISE NOTICE ''Q12_PROBE_SQLSTATE=%'', SQLSTATE; RAISE; END (runner :592-611) so the probe still trips (rc!=0) AND emits the exact code; the test asserts probe.rc!=0, stderr contains ''Q12 durable guard truth is append-only'' AND ''Q12_PROBE_SQLSTATE=P0001'' AND NOT ''has no field "run_id"'' (test :290-292). Placement is PRE-cleanup (probes at runner item 11, before cleanup item 12; schema still present) — this directly closes the low P3 I raised in mc2-jz6y0.13-r8b-2-ii-defrost-review.md.'
  - "TDD honesty: clean RED/GREEN split — RED 1cbe848c6 changes ONLY the test.ts (adds assertions referencing out.cleanup_rc/…/seam_outcome fields the runner does not yet emit → genuinely fails), GREEN be305d809 changes ONLY the runner.py (adds the fields). Disposable loopback-only container (no external network; --net namespace, lo-only). Did NOT run vitest or any server/db/docker command (constraint); relied on the team-lead's re-runs for the green execution claims — all byte-level claims verified above."
changed_files:
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-verify-chain.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-verify-chain-runner.py
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-iii.md
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
explicit_defers:
  - "P3-1 (confidence medium, informational, NOT a defect): the runner comment (:26) and test comment (test :77) say 'no MC2_Q12_BARRIER_TEST_MODE relaxation of the DB command'. Accurate for the PRIMARY command (the real DROP SCHEMA, proven real by the independent guard_residue_db==0 query and the pre-cleanup P0001 probes proving the guard was live). BUT test_mode=1 with real_reconnect_test=0 DOES bypass the barrier's SEPARATE fresh-connection terminal-reconnect re-verification (gate barrier :1952 is false → the synthetic path :2063-2074 sets terminal structural/default/cron hashes from expected values rather than re-querying). The harness's own independent guard_residue_db query is what supplies the real second-observer residue proof — i.e., that query is LOAD-BEARING, not redundant. Suggest the comment note that the fresh-connection residue re-check is harness-supplied in test_mode so a future reader does not assume the barrier itself re-queried on a fresh connection here."
  - "P3-2 (confidence low, optional hardening): there is no INLINE negative control in this leg proving the barrier REJECTS a tampered cleanup journal (e.g., a wrong entry_hash or a non-contiguous tail → rc!=0). The positive drive is a genuine acceptance oracle and the barrier's rejection logic (:495-556) is frozen and independently reviewed, so this is acceptable; a single asserted rejection would harden the 'barrier is the oracle' claim within the leg itself."
  - "P3-3 (confidence low, scope-boundary note): the cleanup journal's capability_manifest_sha256 is a synthetic constant sha256('q12-r8b2iii-cleanup-capability-manifest') (runner :658), NOT bound to the real db-capability file digest. This is correct/acceptable — the barrier only requires the issued/claimed rows to share ONE hex64 capability_manifest (:534-539) and does not cross-check it against the capability file for the journal path — but noting the scope boundary: journal capability provenance is synthetic in this harness leg."
  - "Informational: the deployed SERVER barrier remains 3673ee49 (repo is bdb9d935); the byte-verified pre-rehearsal server reinstall + the server-side full-path run_live rehearsal remain the team-lead's explicit deferred pre-window gates (correctly recorded in the worker artifact)."
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1, no P2.** R8-B-2-iii extends the real-PG17 harness past activate to
drive the REAL frozen barrier `cleanup` (bytes bdb9d935, same proxy/namespace path,
no DB-command stub) off the activated state and then feeds the REAL barrier-produced
terminal proof through the R8-B-1 ProductionExecutor seam end-to-end — with an empty
deploy diff (harness/test/docs only). All six adversarial duties verified against the
actual bytes:

1. **Real-execution fidelity** — cleanup runs the same namespaced/proxied path; the
   barrier genuinely re-hashes and validates the controller journal to the claimed
   boundary (frozen grammar :508-556), so `cleanup_rc==0` is a true acceptance oracle
   and `intent_journal_entry_hash` binds the accepted chain.
2. **Terminal proof** — 18-key exact (matches the barrier's own key list), guard_residue
   all-zero, structural==after-obs, null cleanup rollback fields; and q12_guard is proven
   gone by an **independent** live pg_namespace/pg_class/pg_proc/pg_event_trigger query,
   not the proof's self-report.
3. **The seam on real artifacts** — invoked against the real run_root; v1 archive
   byte-exact; the 10-key v2 exact and **key-for-key identical to the W forward-resume
   gate** (q12-writer-resume.py:1088); terminal_proof_sha256 binds an independently
   computed digest; db-capability deleted fail-closed.
4. **Idempotence (same epoch)** — the 2nd drive hits the barrier's early
   "proof already verified" branch with a byte-identical proof, **ordered before** the
   seam deletes the capability (and it must be, since that branch still reads the
   capability sha); multi-epoch recovery re-drive is an explicit defer, recorded.
5. **Defrost P3 folded** — the probe now asserts the literal `Q12_PROBE_SQLSTATE=P0001`,
   placed pre-cleanup; this directly closes the low P3 I raised in the defrost review.
6. **Whole-range** — barrier stays bdb9d935, manifest aaec6fc2, catalog 0b8a943f;
   W-owned + core .py byte-untouched; disposable loopback-only container.

Findings: **three P3 informational** notes (a comment-accuracy nuance about the one
verification test_mode relaxes and why the independent query is load-bearing; an optional
inline negative-control; a synthetic-capability-provenance scope note). None block merge.

# Verification

See the structured `verification:` block above — each item is an independent byte-level
check (frozen-sha recomputation at the tip; barrier journal-grammar + early-branch +
18-key + W-gate cross-reads; independent-query independence; TDD RED/GREEN split). I did
not run the vitest suite or any server/db/docker command per the read-only constraint and
relied on the team-lead's stated re-runs (gated chain 119.4s, tsc 0) for the green
execution claims.

# Risks / Follow-ups

- **P3-1 (comment accuracy, informational):** the "no test-mode relaxation of the DB
  command" wording is true for the primary DROP but omits that test_mode bypasses the
  barrier's fresh-connection terminal-reconnect residue re-check; the harness's own
  independent `guard_residue_db` query supplies that second-observer proof and is
  therefore load-bearing. A one-line comment clarification would prevent a future
  misread. No correctness impact.
- **P3-2 (optional hardening):** no inline negative control asserting the barrier rejects
  a tampered cleanup journal; the positive drive + frozen/reviewed rejection logic make
  this acceptable.
- **P3-3 (scope note):** the journal `capability_manifest_sha256` is a synthetic constant
  (the barrier does not bind it to the real capability file for the journal path), so
  acceptable — noted as a harness scope boundary.
- **Program-level (team-lead-owned, not this round):** deployed SERVER barrier still
  3673ee49 vs repo bdb9d935 — byte-verified reinstall + full-path `run_live` server
  rehearsal remain the non-negotiable pre-window gates; `execute_forward_resume` and the
  real barrier-cleanup child under server owner-custody remain downstream, production
  fail-closed at the split pre-flight until then.
