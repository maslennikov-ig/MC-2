---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-rl4p9
stage_id: mc2-jz6y0
agent_type: correctness-reviewer
subagent_model: claude-fable-5
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 266de3d7457f81a035c9698768e8b7ffb0053495
review_range: uncommitted diff at 266de3d7 (publisher fix, two files)
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
verdict: PASS
findings_by_severity: 'P0=0, P1=0, P2=0, P3=2'
status: returned
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: Read-only delta review; the sole write is this review artifact. No source, test, doc, branch, or Beads mutation was performed.
risk_level: high
docs_reviewed: no-change-needed
docs_review_notes: Localized script/test fix; runbook publication procedure unchanged; receipt recorded in the B1 stage artifact.
graph_reviewed: no-change-needed
graph_review_notes: Read-only review; no architecture change to refresh.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-rl4p9-b1-publisher-fix-review.md
explicit_defers:
  - 'Two optional P3 parity observations recorded below; reviewer marked no action required.'
verification:
  - 'Diff scope verified: exactly deploy/qdrant/publish-qdrant-operator.sh and packages/course-gen-platform/tests/unit/ops/qdrant-operator-publisher.test.ts (+119/-7).'
  - 'SLSA v1 branch enforces the same three predicates as v0.2 (exact vcs.source, exact vcs.revision, non-empty Dockerfile evidence) with no bypass path; mixed-shape statements route to the v1 branch and fail closed on non-dict members.'
  - 'chmod-before-assert sound: regular-file/symlink check precedes chmod; file lives inside the 0700 publisher state root for its whole life.'
  - 'Fresh rerun: publisher suite 24/24 (20 prior + 4 new) with vitest.config.unit.ts and synthetic env.'
---

# mc2-rl4p9-b1 — Publisher post-cutover fix review

- Stage: mc2-jz6y0
- Task: mc2-rl4p9-b1 (delta correctness review of the GHCR publisher live-cutover fix)
- Reviewer: Claude fable-5 correctness reviewer
- Date: 2026-07-17
- Scope: uncommitted diff in `/home/me/code/mc2/.worktrees/self-hosted-qdrant-platform`, exactly two files
  - `deploy/qdrant/publish-qdrant-operator.sh`
  - `packages/course-gen-platform/tests/unit/ops/qdrant-operator-publisher.test.ts`

# Summary

## Verdict

**PASS**

- P0: 0
- P1: 0
- P2: 0
- P3: 2 (non-blocking observations)

The fix correctly resolves both latent defects that surfaced during the 2026-07-17 live cutover
(0644 metadata-file mode from real buildx v0.34, and the validator accepting only SLSA v0.2). The
SLSA v1 branch enforces the same three security predicates as the v0.2 branch with no bypass path,
the chmod-before-assert change is sound, and the new fixtures faithfully emulate real buildx while
the legacy v0.2 negative tests still exercise the legacy branch. No weakening of existing
assertions, token-safety, or cleanup semantics.

## Scope confirmation

`git diff --stat` shows the diff touches exactly the two named files (30 lines in the script, 96 in
the test). No out-of-scope files. Stop condition (files outside the two named) not triggered.

## Review dimensions

### 1. v1 validator branch enforces the same three security predicates, no bypass path — PASS (confidence: high)

The branch split (`deploy/qdrant/publish-qdrant-operator.sh:404-422`) selects shape then converges
on a single `buildkit_metadata` dict; the three security predicates are applied _after_ convergence
(lines 423-451), so they are identical for both shapes:

- exact `vcs.source == expected_source` and `vcs.revision == expected_revision` — line 428, shared.
- non-empty Dockerfile evidence in `source.infos` (dict entry, matching filename, non-empty `data`)
  — lines 431-451, shared.

Bypass analysis:

- **Both shapes present in one statement.** Branch selection is driven by
  `isinstance(buildDefinition, dict) or isinstance(runDetails, dict)` (line 406). If either v1 key
  is a dict, the v1 branch is forced and `buildkit_metadata` is read _only_ from
  `runDetails.metadata.buildkit_metadata` (line 415). A top-level v0.2 `metadata[...#metadata]` is
  never consulted in that path, so an attacker cannot smuggle valid vcs/source through the v0.2
  location while riding the v1 branch. Security predicates still apply to the v1-sourced dict.
- **buildDefinition present but non-dict.** Guarded at line 408: if either `buildDefinition` or
  `runDetails` is present-but-not-both-dict, `invalid()`. A string/list `buildDefinition` cannot
  force the v0.2 branch (the `or` still selects v1, then the guard rejects). No crash; rejected.
- **buildType confusion between branches.** v1 checks `build_definition.get("buildType")` against
  the v1 build-type URL (line 410); v0.2 checks top-level `statement.get("buildType")` against the
  v0.2 URL (line 417). Each branch checks its own build-type against its own constant; the v1
  predicate has no top-level buildType (correct per SLSA v1, where buildType lives inside
  buildDefinition). No cross-branch confusion.
- **Duplicate-key smuggling.** `object_pairs_hook=unique_object` (line 375-381, 387) still rejects
  any duplicated key across the whole document, preventing two `buildType`/`vcs` entries. Preserved.
- **`.get()` on non-dict.** Every `.get()` in the v1 branch is preceded by an `isinstance(..., dict)`
  guard (`build_definition` and `run_details` at line 408, `run_metadata` at 413, `buildkit_metadata`
  at 423). No unguarded attribute access.

The v1 fixture places `vcs`/`source.infos` under `runDetails.metadata.buildkit_metadata`, matching
the shape the team independently validated against the actually-published image (source/revision/
Dockerfile PASS), so the branch reads the security fields from the location real buildx emits.

### 2. chmod-before-assert soundness — PASS (confidence: high)

`deploy/qdrant/publish-qdrant-operator.sh:505-510`:

- Symlink/regular-file check (`[[ -f && ! -L ]]`, line 505) runs **before** `chmod` (line 507).
  `chmod` follows symlinks, so ordering is load-bearing; it is preserved. A symlinked metadata file
  is rejected before any chmod can touch a target.
- The file lives inside `$STATE_ROOT`, created with `mkdir -m 0700` under a process-wide `umask 077`
  (script lines 6, 273, 283). It is an owner-only directory, so no other principal can swap the file
  between the `-L` test and the `chmod`, or between `chmod` and the `stat` assertion. The added
  `chmod` does not widen the pre-existing test→stat TOCTOU window in any exploitable way given the
  0700 state root.
- The change mirrors the already-present remote-provenance pattern (lines 530-534) which chmod's to
  0600 after its own `-L` check, so the metadata path now matches the reviewed remote path. The
  `chmod` failure is hard-failed (`|| fail ...`), and the subsequent `== 600` stat assertion remains
  as an independent post-condition — a defense-in-depth double check, not a replacement.

### 3. Fixtures faithfully emulate real buildx; legacy v0.2 negatives still exercise legacy branch — PASS (confidence: high)

- New v1 modes write the local metadata file at **0644** via the mock (test lines 288-292: `if mode
== slsa-v1* || v1-* then chmod 0644 else chmod 0600`), reproducing the real buildx v0.34 behavior
  that broke the live run. The happy-path test (`publishes with SLSA v1 provenance and a
group-readable metadata file...`) therefore fails if the script's `chmod 0600` fix is reverted
  (the `== 600` assertion would see 644). The fix is test-guarded.
- The v1 happy path asserts two `python3` validator invocations (local metadata + remote), confirming
  both validation call sites accept the v1 shape end-to-end.
- The v0.2 `provenance()` fixture (test lines 32-57) has **no** `buildDefinition`/`runDetails`, so it
  deterministically takes the `else` (legacy) branch. The pre-existing negatives (`wrong-revision`,
  `wrong-source`, `missing-max`, `wrong-remote-*`, `missing-remote-max`) still emit v0.2 shapes and
  still exercise the legacy branch and its three predicates. No legacy coverage lost.
- New v1 negatives cover local (`v1-wrong-revision`, `v1-wrong-source`, `v1-missing-max`) and remote
  (`v1-wrong-remote-revision`, `v1-wrong-remote-source`, `v1-missing-remote-max`) failure modes, each
  asserting the correct failure message and that no `Provenance.SLSA`/publish step runs past the gate,
  plus no run residue and no token leakage.

### 4. No weakening of existing assertions, token-safety, or cleanup semantics — PASS (confidence: high)

- No existing assertion was deleted or relaxed; the diff is purely additive in the test file
  (new fixture builder, new mock modes, three new `it` blocks) and additive/branch-widening in the
  script (new v1 branch, one new chmod line). The full suite still runs the prior 20 tests plus 4 new.
- `expectNoToken` / `expectNoRunResidue` are invoked in every new test, preserving the token-safety
  and cleanup invariants for the new paths. The synthetic token constant and stdin-only login checks
  are untouched.
- Cleanup traps, `finalize_process`, and the 0700 state-root lifecycle are unchanged.

## Significant findings

None that block or endanger the live-cutover phase. The fix is a faithful, test-guarded correction
of the two post-push defects, and the SLSA v1 acceptance branch preserves the full security contract.
The published image's remote provenance was independently validated (source/revision/Dockerfile
PASS), and the re-run local suite confirms both the 0644→0600 hardening and the dual-shape validator.

# Risks / Follow-ups

## P3 observations (non-blocking)

- **P3 (confidence: medium)** — There is no test for the combination "v0.2 provenance shape _and_
  0644 metadata mode". The mock writes v0.2 fixtures at 0600, so only the v1 happy path exercises the
  0644→chmod fix. This is not a real gap: the script's `chmod 0600` is shape-independent and runs
  before the validator branch, and real buildx v0.34 emits 0644 regardless of provenance shape, so
  the v1 happy path already guards the regression. Optional: add a `wrong`-free v0.2 happy variant at
  0644 for symmetry.
- **P3 (confidence: medium)** — The v1 branch does not assert the presence of the SLSA v1
  in-toto envelope fields (`_type`, `predicateType`) — it keys purely on `buildDefinition`/
  `runDetails` and the inner `buildType`. This matches the v0.2 branch's existing posture (it also
  keys on `buildType` + metadata key rather than envelope type), so it introduces no new laxity, and
  the exact vcs/source/revision + Dockerfile predicates remain the real integrity gate. Noted only
  for parity awareness; no action required.

# Verification

## Fresh command evidence

Scope check:

```
$ git -C .worktrees/self-hosted-qdrant-platform diff --stat
 deploy/qdrant/publish-qdrant-operator.sh           | 30 +++++--
 .../unit/ops/qdrant-operator-publisher.test.ts     | 96 +++++++++++++++++++++-
 2 files changed, 119 insertions(+), 7 deletions(-)
```

State-root mode confirmation:

```
$ grep -n 'umask\|mkdir -m 0700\|STATE_ROOT' deploy/qdrant/publish-qdrant-operator.sh
6:umask 077
273:  if ! mkdir -m 0700 -- "$STATE_ROOT"; then
283:  chmod 0700 "$STATE_ROOT"
```

Test run (read-only, no network/docker):

```
$ cd packages/course-gen-platform && SUPABASE_URL=http://127.0.0.1:54321 \
    SUPABASE_SERVICE_KEY=synthetic-test-key \
    pnpm vitest run --config vitest.config.unit.ts \
    tests/unit/ops/qdrant-operator-publisher.test.ts

 ✓ tests/unit/ops/qdrant-operator-publisher.test.ts (24 tests) 5298ms
     ✓ requires well-formed full local Buildx provenance for the accepted source revision
     ✓ requires well-formed full remote provenance for the verified pushed digest
     ✓ requires well-formed full SLSA v1 local Buildx provenance for the accepted source revision
     ✓ requires well-formed full SLSA v1 remote provenance for the verified pushed digest
     ✓ publishes with SLSA v1 provenance and a group-readable metadata file as real buildx writes them

 Test Files  1 passed (1)
      Tests  24 passed (24)
```

All 24 tests pass (20 prior + 4 new). Test suite did not fail; stop condition not triggered.

---

**VERDICT: PASS — P0: 0, P1: 0, P2: 0, P3: 2**
