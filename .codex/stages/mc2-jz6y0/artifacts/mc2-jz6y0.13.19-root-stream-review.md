---
schema_version: orchestration-artifact/v1
artifact_type: independent-correctness-review
task_id: mc2-jz6y0.13.19
stage_id: mc2-jz6y0
review_target: D6 Stream-2 (Root coordinator), plan Tasks 15-19
reviewer: claude fable-5 independent correctness reviewer (read-only)
reviewed_worktree: /home/me/code/mc2/.worktrees/q12-d6-root
reviewed_branch: codex/q12-d6-root
reviewed_range: 72af414c..HEAD (10 commits)
contract: docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md
contract_tail_sha256_verified: 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5
manifest_sha256_verified: aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841
verdict: PASS
scores_p0_p1_p2_p3: '0/0/1/4'
---

# D6 Root-stream (Tasks 15-19) independent correctness review

## Verdict: PASS

No P0 or P1 findings. Every requirement of plan Tasks 15-19, scoped as the plan's
GREEN steps define them, is implemented and matches the frozen contract bytes. The
one P2 is a cross-stream canonicalization reconciliation that by the contract's
ownership table belongs to D6 integration (Stream 3), not a defect in the
implemented Root-stream code. The four P3s are hardening/scope-boundary notes.

## Stop-condition gate (all passed, no stop triggered)

- Contract `tail -c 47092` sha256 = `2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5` (matches authority).
- `deploy/qdrant/q12-command-manifest.json` sha256 = `aaec6fc2…841` (byte-unchanged, matches required).
- Range `72af414c..HEAD` touches exactly the four listed files (+1675, 0 deletions):
  `deploy/qdrant/q12-lifecycle-core.py` (+590, strictly additive),
  `tests/unit/ops/q12-command-manifest.test.ts` (+108),
  `tests/unit/ops/q12-d6-root.test.ts` (+513 new),
  `tests/unit/ops/fixtures/q12-d6-root-runner.py` (+464 new).
- Ruling A verified: `q12-live-cutover.test.ts` is byte-identical to `72af414c` (empty diff).
- Ruling B verified: the two-file write-zone extension (`q12-d6-root.test.ts`,
  `q12-d6-root-runner.py`) is present, both under the 1500-line eslint cap, no
  `eslint-disable`, `eslint.config.mjs` untouched (outside range).

## Reproduced evidence

- Focused suites, root worktree, `SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=synthetic-test-key`, `vitest.config.unit.ts`,
  files `q12-d6-root.test.ts` + `q12-command-manifest.test.ts` +
  `q12-live-cutover.test.ts`: **3 files passed, 278 passed** (matches worker).
- `q12-lifecycle-core.py` diff is strictly additive (0 deleted lines; all 596
  lines land between `run_supervisor` and `parser()`; `parser()` unchanged).
  Module imports cleanly (278 tests import it); `ctypes`/`fcntl`/`stat as
stat_module` present at module top; no D6 symbol collides with existing defs.

## Findings

| id  | severity | confidence | file:line                                                 | description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------- | ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | P2       | medium     | deploy/qdrant/q12-lifecycle-core.py:174,180 (via D6 use)  | Cross-stream canonicalization cannot be positively confirmed to match Stream 1. `canonical()` is compact key-sorted UTF-8 with NO trailing LF but applies NO Unicode NFC normalization; `complete_object()` = `canonical()` + one LF. D6 publishes immutable objects via `complete_object` (with LF) and transcript lines via `canonical(frame)+"\n"`. The object/frame **hash inputs** for D6 predecision/seal/transcript-head are NOT computed in this range (passed in as `*_sha256` fields), so agreement with Stream 1's stated "NFC compact key-sorted, no trailing LF" hashing is not demonstrable here. Integration blocker only if Stream 1 independently recomputes these hashes; within D6 the values are self-consistent (Root authoritative, probe echoes). Belongs to Stream-3 integration reconciliation. |
| F2  | P3       | high       | q12-lifecycle-core.py D6 block                            | Root-side wire frames (`host_projection`, `predecision_*`, `release`) and the `frame_sha256`/`previous_frame_sha256` envelope chain (contract "Exact frame payloads", lines 344-443) are not built or validated in this range. This is inside the plan's Task 18 **RED narrative** but outside its **GREEN scope** ("object construction, atomic publish + fsync + mode discipline, outcome-table authority"). Recorded so integration knows the frame envelope + transcript-head hashing + full hash-chain validation are not yet covered by Stream 2.                                                                                                                                                                                                                                                                  |
| F3  | P3       | medium     | q12-lifecycle-core.py d6_build_terminal_seal              | The seal binds `run_id/lease_epoch/request_sha256/host_projection_sha256/initial_database_projection_sha256` to the predecision but never cross-checks `fields["predecision_sha256"] == sha256(<predecision bytes>)`. A seal could carry a wrong `predecision_sha256` and still validate. The driver presumably supplies it correctly; the builder does not enforce it.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| F4  | P3       | medium     | q12-lifecycle-core.py d6_validate_secret_source           | Revalidates owner/mode/type/dev/ino before and after **open** (NOFOLLOW, nlink==1, path re-stat via dir_fd), but there is no read in the helper and no "after read" re-fstat, while the contract says "before and after open/read". The read/decode and any after-read revalidation live in the (not-in-range) caller; the helper returns `(fd,dev,ino)` to enable it.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| F5  | P3       | low        | q12-lifecycle-core.py D6_PROBE_ENV; runner schema_version | Root determinations not fixed by the contract, internally consistent, recorded for integration reconciliation (confirms worker finding 3): `PATH="/usr/bin:/bin"`, `HOME="/var/empty"` (contract fixes only LC_ALL/LANG + non-writable-HOME; NODE_OPTIONS/inherited env correctly absent); schema_version strings `megacampus.q12.activation-truth-{predecision,terminal-seal}/v1` are set by the caller/fixture (builders pass them through without format validation) and follow the contract's `/v1` naming family.                                                                                                                                                                                                                                                                                                   |

## Per-focus-area results

**Area 1 — Task 15 retained-command guard (PASS).** `q12-command-manifest.test.ts`
D6 block pins the whole-manifest sha to `aaec6fc2…841`, `schema_version`, the exact
20-id set in amendment order (`ALL_IDS`), length 20, first-5 = barrier ids; asserts
the five retained entries' exact `argv` (literal `RETAINED_BARRIERS`), `argv_sha256`
(literal + `argvHash` self-consistency) and `env == BASE_ENV`; rejects the five
shorthand ids; asserts `MANIFEST_COMMAND_IDS == ALL_IDS`; scans the core source for
`systemctl/systemd/crontab/.service/.timer` (absent). No new command/systemd/cron/
Compose/operator argv is possible without failing the exhaustive id pinning.
Follow-up commit `61887081` **only** reworded a source comment (`systemd unit, cron
job, Compose service` → `no scheduled unit, no periodic job, no compose target`); the
test scan tokens are untouched and the core source is genuinely free of every scanned
token. Guard is meaningful and not narrowed; the reworded comment's assertion is true
(D6 uses posix_spawn, writes JSON files, adds no manifest command).

**Area 2 — Task 16 posix_spawn boundary (PASS).** `d6_build_spawn_file_actions`
emits, in order: OPEN fd0 `/dev/null` O_RDONLY; then for each target in
`(1,2,3,4,5,6,7,9,10,11)` DUP2(source→target) + CLOSE(source) (source-close-after-map)
except FD 9 which must equal source 9 and is neither duped nor closed; then CLOSE(8);
then CLOSEFROM(12) (immediately above 11). Every mapped source is required ≥12 so the
final close-from cannot strand it (clean stage-high-then-map-down pattern, no
source/target collision). CLOSEFROM presence is a hard gate
(`d6_closefrom_capability`, `hasattr(os,'POSIX_SPAWN_CLOSEFROM')`); absence raises "no
fallback" — no preexec_fn/threaded-fork/shell/broad-pass_fds/broker path exists.
Secret open is `O_RDONLY|O_NOFOLLOW|O_CLOEXEC` via parent dir_fd with owner+gid+mode+
S_ISREG+nlink==1 and dev/inode revalidation before/after open plus canonical-path
re-stat. FD 3 password decode is caller-only (documented). The descriptor-pressure
test is real: `scenario_spawn_under_pressure` actually spawns a child under 96 extra
pipes and asserts inherited `child_fds == [0,1,2,3,4,5,6,7,9,10,11]` and exit 0. (F4
is the only note.)

**Area 3 — Task 17 pidfd/proc/OFD (PASS).** `d6_pidfd_open` = `os.pidfd_open`;
`d6_pidfd_getfd` = raw syscall 438 (correct generic-table nr, comment-documented).
`d6_verify_fd9_ofd_contention` proves the retrieved child FD 9 is the canonical 0600
lock (dev/ino, S_ISREG, nlink==1) and that a fresh distinct-OFD `LOCK_EX|LOCK_NB`
still blocks (returns True on contention, False otherwise). `d6_proc_identity` parses
`/proc/<pid>/stat` field 22 correctly (`tail[19]` after final `')'`), exe via
readlink, boot-id from `/proc/sys/kernel/random/boot_id`; `d6_assert_proc_continuity`
rejects any drift (pid-reuse). The `pidfd_gates` scenario really spawns a lock-holding
child and proves: pidfd open, getfd(9), OFD contention True, `no_leak_above_11`
(getfd(40) fails), and continuity rejects a forged start-time. Negative
`ofd_contention_unlocked` returns False when no lock is held. Gates are mandatory (no
test override); the pinned-server PTRACE/Yama policy is honestly reported as a remote
gate and never faked green (local-only capability presence asserted).

**Area 4 — Task 18 predecision/seal (PASS).** `D6_PREDECISION_KEYS` is exactly the
contract's 16 keys; `D6_TERMINAL_SEAL_KEYS` exactly the 26. `d6_build_predecision`
enforces key-set, classification∈3, exact classification/action pair, and planned-R
nullability (both non-null for precommit, both null otherwise).
`d6_build_terminal_seal` enforces key-set, `outcome==D6_OUTCOME[classification]`,
evidence-state∈legal-set, actual-R rules (precommit non-null AND byte-equal predecision
planned; else both null), `probe_exit_status==0`, `transaction_end==read_only_commit`,
`connection_closed is True`, and predecision equality on the bound key subset. The
three outcome literals, classification/action pairs, evidence states and sole
authorities (`task9_retirement_rollback_preparation` / `finish_forward` / `none`)
match the contract outcome table. `d6_publish_immutable_object` writes tmp 0600 →
fsync → chmod 0400 → `rename_noreplace` → dir fsync (result 0400, atomic);
`d6_append_transcript` is O_APPEND 0600 + fsync. File names exactly
`activation-truth-{request,predecision,terminal-seal}-<epoch>.json` and
`activation-truth-transcript-<epoch>.jsonl`. Test proves modes 0400/0400/0400/0600,
publish order request<predecision<seal, transcript fsync < seal publish,
`authority_without_seal=incident_only` (durable-R-without-seal incident-only), and the
acyclic request→predecision→R→transcript→seal authority. (F3 is the only note.)

**Area 5 — Task 19 post-R narrowing / race / restart (PASS).**
`D6_POST_R_PROBE_ALLOWED` = exactly {emit_sealed, receive_release, read_only_commit,
close_connection, emit_closed, exit} — the contract's sole probe narrowing.
`D6_POST_R_ROOT_ALLOWED` = {append_transcript, fsync_transcript,
publish_terminal_seal, fsync_terminal_seal, prove_probe_exit, close_pipes,
permit_task9_retirement} — the append/fsync-transcript + publish/fsync-seal
publications plus the exact contract-line-78 retirement handoff steps; journal rows,
rollback, capabilities, receipts, final-writer, new sessions are excluded (negatives
asserted). `D6_PRECOMMIT_RACE_ORDER` matches the contract ordering exactly
(publish_predecision → append_r → fsync_r → obtain_sealed → release → receive_closed →
observe_clean_exit → fsync_transcript → publish_terminal_seal), transcript fsync before
seal. `d6_crash_authority` implements every crash rule (predecision-no-R continue iff
continuity else abandoned; durable-R-no-seal incident_only; committed seal →
finish_forward only if no-R and unique tip; precommit seal → task9 only, requires R;
incident seal → none). `d6_select_restart_authority` selects the unique tip whose
predecessor/actual-R head == canonical head and rejects reused epochs, forked lineage
(duplicate `previous_terminal_seal`), broken chains (`chain_ok` false), multiple tips
and stale head. Note: the per-epoch hash-chain **validation** that produces `chain_ok`
is a caller input, not computed here (part of F2's coverage note).

**Area 6 — cross-stream consistency (FLAGGED, F1).** Stream 2 storage: immutable
objects `complete_object` = NFC-absent compact key-sorted + one trailing LF;
transcript = `canonical(frame)` + one LF per line. Stream 2 hashing convention for D6
objects is NOT exercised in this range (sha fields are inputs), and `canonical()`
omits explicit NFC normalization. Practically moot today (all D6 payloads are ASCII
hex/enum/int/UUID), but not positively confirmable against Stream 1's stated
"NFC compact key-sorted, no trailing LF" — recorded as F1 for integration
reconciliation. Worker finding 3 (schema_version strings; spawn PATH/HOME as Root
determinations) confirmed internally consistent and recorded (F5).

**Area 7 — test integrity / additive / no live / no secrets (PASS).** 278/278 pass
with real, non-tautological assertions (kernel-exercising spawn/pidfd, exact
file-action sequences, exhaustive key-set equality, mode/ordering proofs, and matched
negatives). RED anchors are real (RED commits precede each feat commit). Remote gates
are honestly flagged, never faked. `q12-lifecycle-core.py` additions alter no existing
function (verified by reading the diff: zero deleted lines, additions between
`run_supervisor` and unchanged `parser()`). No live/remote path (posix_spawn/pidfd/
files/`/dev/null` only; no network, Supabase, docker, or subprocess-to-remote). No
secret bytes hashed or logged; fixtures use synthetic secrets.

## Significant findings

1. **F1 — cross-stream hash convention (P2, medium).** Evidence: `canonical()` lacks
   NFC and has no trailing LF; `complete_object()` adds one LF; D6 object/frame hash
   inputs are passed in, not computed here. Implication: Stream 1↔Stream 2 frame/object
   hash agreement is undemonstrated at this layer and must be reconciled before
   integration wires the probe (Stream 1) to the Root frames. Within D6 the values are
   self-consistent. Next action: Stream-3 integration must pin one canonicalization
   (confirm NFC + no-trailing-LF for hash inputs) shared by the Root frame builder and
   the `.cjs` probe, then add a cross-language hash-equality fixture.

2. **F2 — Root frame envelope not in range (P3, high).** Evidence: no `frame_sha256`/
   `previous_frame_sha256` builder, no `host_projection`/`predecision_*`/`release`
   frame payload assertions, no transcript-head or hash-chain validation. Implication:
   the wire protocol and full restart hash-chain validation remain to be provided
   (Stream 1 / later task); this range delivers the object builders + authority logic
   only, consistent with the plan's Task 18/19 GREEN scoping. Next action: integration
   should confirm which stream owns the frame envelope and chain validation and that
   `chain_ok` upstream exists before Task 9 relies on restart selection.

3. **F3 — seal does not self-verify predecision_sha256 (P3, medium).** Evidence:
   `d6_build_terminal_seal` binds five predecision fields but not
   `predecision_sha256` against the predecision bytes. Implication: a mis-supplied
   `predecision_sha256` passes the builder. Next action: have the driver (or builder)
   assert `predecision_sha256 == sha256` of the published predecision object under the
   final canonicalization chosen in F1.

---

# Delta review (correction round)

Range `072cc210..HEAD` (6 commits `a370fc2b..6742b58d`), same worktree
`/home/me/code/mc2/.worktrees/q12-d6-root`. Scope: only the delta closing prior F1
(P2) + F3/F4 (P3). This section does not re-litigate the round-1 PASS.

## Delta verdict: PASS

The three fixes are real and none weakens an existing guard. Two new findings arise
in the delta — one P2 (a functional offset hazard the after-read fix introduces on the
FD3/FD4 path) and one P3 (the seal-binding helper is defined and tested but not wired,
with an inaccurate docstring). Both are latent (their consumers are out of this range)
and trivially remediable; neither reverses a round-1 guarantee, so the delta passes,
with the two items flagged to close before the `.13.13` join.

## Delta stop-gate (all passed)

- Delta touches exactly 3 write-zone files: `deploy/qdrant/q12-lifecycle-core.py`
  (+102/-12), `tests/unit/ops/q12-d6-root.test.ts` (+52), `fixtures/q12-d6-root-runner.py`
  (+71). No out-of-zone write; manifest test file untouched this round.
- `q12-command-manifest.json` sha256 still `aaec6fc2…841` (byte-unchanged).
- Full `tests/unit/ops/` broad regression: 727 passed, 36 skipped, **1 failed**
  (`qdrant-observability-contract.test.ts:223` `QDRANT_METRICS_GID=[0-9]+`) — verified
  **unrelated**: that file is untouched across the entire D6 range (`72af414c..HEAD`)
  and references `canonical`/`d6_`/`activation-truth` zero times; it is an environmental
  GID-interpolation check, not a hash regression. No hash-pinned test changed → confirms
  the NFC edit to the shared `canonical()` is a no-op on existing (ASCII) data.
- `q12-d6-root.test.ts` alone: 25 passed (17 round-1 + 8 new correction tests).

## Per-fix results

**Fix 1 — NFC in `canonical()` (CORRECT, closes prior F1 on the Stream-2 side).**
`_nfc` recursively NFC-normalizes string keys **and** string values through dicts,
lists and tuples, and is applied to the whole value **before** `json.dumps`;
`sort_keys=True` therefore sorts already-normalized keys (correct order: normalize then
sort); `ensure_ascii=False`, compact separators and **no trailing LF** are preserved;
`complete_object()` still appends exactly one LF (unchanged). The RED test
(`canonical_nfc`) proves composed `U+00E9` and decomposed `e`+`U+0301` hash identically
for both a value position (`{"name": …}`) and a key position (`{…: 1}`), and asserts no
trailing LF — a real anchor that fails without the fix. Residual: byte-parity with
Stream 1 is proven only against a reference NFC form; that the actual `.cjs` probe
applies identical recursive-NFC + no-LF hashing remains an integration-join check (F2
carry-over, Stream 1 not in range).

**Fix 2 — after-read secret revalidation (CORRECT, but introduces D-F1 below).**
`d6_assert_secret_identity_stable` re-fstats after the read and enforces S_ISREG,
owner uid+gid, mode∈set, nlink==1, full 5-tuple equality vs the pre-read snapshot, and
dev/ino match against a fresh `follow_symlinks=False` path stat. It **actually runs on
the FD3/FD4 path**: `d6_validate_secret_source` (the sole FD3/FD4 opener) now reads the
descriptor to EOF and then calls it inline; the existing `validate_secret` positives
and the new `secret_after_read` chmod / inode-swap negatives all exercise it and fail
closed. Answers team-lead Q3: yes, enforced, not merely present.

**Fix 3 — seal↔predecision binding (SOUND logic + tested, but NOT WIRED; D-F2 below).**
`d6_predecision_sha256 = sha256(canonical(predecision))` (no LF); `d6_verify_seal_binding`
rejects `seal["predecision_sha256"] != expected`. The RED tamper test proves rejection.
Logic is correct. However `grep` shows **zero call sites** in the core: neither
`d6_crash_authority` nor `d6_select_restart_authority` (nor any load path) invokes it —
only the test fixture does. Its docstring nonetheless asserts it is "invoked wherever a
seal is validated against the predecision it claims (restart authority and chain
selection)," which is not true in the current code (`d6_select_restart_authority`
operates on epoch-metadata dicts, not full seal+predecision objects). So F3 is closed
as a _tested mechanism_ but not yet _enforced_ in the authority path.

## Convention assessment (team-lead question)

**Seal/entry hashing over `canonical()` (no LF) while durable files publish
`complete_object()` (canonical + one LF): internally consistent and SAFE to carry to the
`.13.13` join AS AN EXPLICITLY DOCUMENTED validation-at-load convention — not a defect
now.** Every D6 hash (`d6_predecision_sha256`, `d6_verify_seal_binding`, and the existing
`entry_hash` at `q12-lifecycle-core.py:1411`) is computed over the in-memory canonical
(no-LF) form; the trailing LF on published files is storage-only (POSIX text / JSONL
append friendliness) and is never the hash preimage anywhere in the D6 code. The single
hazard: any future consumer (Task 9 / restart loader / transcript-head hashing) that
hashes the **raw published file bytes** (which carry the LF) instead of re-canonicalizing
the parsed object will mismatch. Safe iff `.13.13` (a) parses → `canonical()` → hash,
never hashes file bytes, and (b) applies the same rule to transcript-head hashing (hash
canonical frames, not raw JSONL bytes). Recommend recording this as a named convention in
the `.13.19` integration artifact.

## New delta findings

| id   | severity | confidence | file:line                                                                      | description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | -------- | ---------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-F1 | P2       | medium     | q12-lifecycle-core.py d6_validate_secret_source (read loop → return, no lseek) | The after-read revalidation reads the secret descriptor to EOF (`while os.read(descriptor, 1MB): pass`) but never rewinds before returning it; the contract maps this same validated descriptor to child FD 3/FD 4 and the child decodes the password from FD 3. A descriptor inherited at EOF yields an empty sequential read — the round-1 code did no read so the offset stayed at 0, making this a **new** hazard the correction introduces. Consumer is out of range, and a positioned (`pread`) consumer is immune, so it is latent, but it contradicts the function's own docstring ("caller … decodes the password"). Next action: add `os.lseek(keep, 0, os.SEEK_SET)` before return, or document a "Root rewinds / child positioned-reads" contract, before the FD3/FD4 read path is wired. |
| D-F2 | P3       | high       | q12-lifecycle-core.py:3551 d6_verify_seal_binding                              | Binding verifier is defined and unit-tested but has no call site in the core; `d6_crash_authority` / `d6_select_restart_authority` do not invoke it, so a seal carrying a mismatched `predecision_sha256` is still not rejected by the authority-selection path. The docstring overclaims ("invoked wherever a seal is validated … restart authority and chain selection"). F3 is closed as a mechanism, not as enforcement. Next action: call `d6_verify_seal_binding` in the load/restart path once full seal+predecision objects are materialized, and correct the docstring to state it is a helper awaiting wiring.                                                                                                                                                                              |

Round-1 findings status: **F1 (P2) closed** on the Stream-2 side (NFC placement correct,
no hash regression); **F4 (P3) closed** (after-read revalidation real and enforced on the
FD3/FD4 path); **F3 (P3) partially closed** (mechanism tested, not wired — now D-F2);
**F2 (P3, frame envelope / chain validation / cross-stream `.cjs` parity) remains an
integration-join item**. No secret bytes hashed or logged (FD 3 explicitly never hashed;
comment retained); no live/remote path added.
