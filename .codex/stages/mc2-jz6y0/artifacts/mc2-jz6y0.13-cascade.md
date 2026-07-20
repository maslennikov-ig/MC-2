---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-cascade
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: fcd981b107c8375b4b28ab8802f52d5b35e69943
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-live-controller and branch
  codex/q12-live-controller left in place for orchestrator integration; no push.
  Doc/test-only cascade round; no docker/PG17 surface touched.
risk_level: low
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md updated (standing
  contract + verification contract field-4 value, new implementation-log
  entry). The W-tuple artifact mc2-jz6y0.13.10-q12-w-activation-tuple.md
  amended (field-4 succession). Design/spec docs
  (2026-07-17-q12-live-controller-design.md,
  2026-07-17-q12-quiesce-window-mode-note.md) intentionally left untouched as
  ratified historical baselines -- flagged, not silently decided (see
  classification table).
graph_reviewed: no-change-needed
graph_review_notes: >-
  Doc/test-only cascade round (W-tuple amendment, one new CI-guard test, doc
  sweep); no architecture, durable workflow, or public-surface change.
verification:
  - 'Repro-tool re-run against the fixed barrier (node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs): fields 5-10 reproduce BYTE-IDENTICALLY (zero change to the three tracked JSON assets); field 7 activation_recovery_slice_sha256 confirmed catalog-INDEPENDENT and barrier-fix-independent. Only field 4 changes: 134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68 -> 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9.'
  - 'W-tuple field-4 amendment applied to .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md (table row + verification bullet + new "2026-07-18 AMENDMENT" note + Risks item (d)); python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md -> artifact validation OK.'
  - 'New CI guard packages/course-gen-platform/tests/unit/ops/q12-w-tuple-frozen-byte-guard.test.ts makes W-tuple fields 2/4 load-bearing: reads both sha256 values FROM the tuple artifact table and asserts equality against sha256(deploy/qdrant/q12-command-manifest.json) / sha256(deploy/qdrant/q12-database-barrier.sh). Proven RED then GREEN: appended a byte to the live q12-database-barrier.sh (no matching tuple amendment) -> field-4 test failed with the real mismatch (AssertionError, wrong sha vs 3673ee49...); barrier restored (git status clean, sha256 3673ee49... confirmed) -> all 3 tests pass again. A third sub-assertion proves the guard is discriminating (not vacuous): the tuple value differs from the historical pre-fix sha, and a deliberately-wrong sha never equals either the tuple value or the real bytes.'
  - 'Frozen-sha reference sweep: git grep -n "134255ce" (57 hits) and git grep -n "53647f0a" (2 hits) across the full repo tree (docs/artifacts/tests/plan). Full classification table in this artifact body. 3 current-truth sites updated (the W-tuple itself + 2 in the plan doc''s standing/verification contract + 1 stale hardcoded test constant); 2 sites flagged ambiguous (ratified design/spec docs) and left untouched by reasoned default; all remaining ~53 sites are historical round/review records, unchanged.'
  - 'No-docker suites green: q12-live-controller.test.ts, q12-live-cutover.test.ts, q12-retained-barrier-quiesce-seam.test.ts, q12-retained-barrier-w-composition-seam.test.ts, q12-source-manifest-guard-surface.test.ts, q12-source-manifest-baseline-order-symmetry.test.ts, q12-w-tuple-frozen-byte-guard.test.ts (new), q12-activation-truth.test.ts (touched stale constant) -> 8 files, 376 passed | 16 skipped, 0 failed. pnpm exec tsc --noEmit -> exit 0. prettier --check on all touched/added files -> clean.'
  - 'Frozen manifest/structural/barrier/tool shas confirmed unchanged this round: sha256sum deploy/qdrant/q12-command-manifest.json -> aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841 (FROZEN, untouched); sha256sum deploy/qdrant/q12-database-barrier.sh -> 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9 (the ratified fixed barrier, NOT re-edited); sha256sum deploy/postgres/q12-source-manifest.ts -> 902cd6a1a579ee94f58e290c3e96df49fd42df56b6da576ced2943cdeadb71d3 (the final source-manifest sha, NOT re-edited); q12-structural-catalog.sql prefix 0b8a943f... (FROZEN, out of range, untouched).'
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
  - packages/course-gen-platform/tests/unit/ops/q12-activation-truth.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-w-tuple-frozen-byte-guard.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-cascade.md
explicit_defers:
  - 'P3 (a): the ::text collation-order change of absolute hashes introduced by the guard-surface reconciliation round is internally consistent and has no external consumer; not touched by this cascade round.'
  - 'P3 (b): the grantable-coverage confirmation (ACL grantable=true->false for PG17 MAINTAIN, noted in the guard-surface reconciliation round) remains an open confirmation item; not touched by this cascade round.'
  - 'C7 production re-freeze of W-tuple fields 5/6/8/9 (catalog-bound, live-boundary re-freeze checklist item 2) remains open and is explicitly UNCHANGED in scope by this round -- the repro-tool re-run against the fixed barrier reproduced those fields byte-identically, so the re-freeze work still needed is exactly the same as before this cascade (pending the accepted production expected-post-migration-catalog).'
---

# Summary

RATIFIED cascade round: propagates the ratified frozen-barrier-fix round's new
barrier sha256 (`3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9`,
independently reviewed PASS/PASS in
`.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-barrier-fix-review.md`, merged) into
the accepted W activation tuple's field 4, adds a CI guard that makes the W-tuple's
frozen-byte fields load-bearing (so a future barrier/manifest edit without a matching
tuple amendment fails CI instead of silently drifting), and sweeps every current-truth
reference to the historical shas across the tree.

**KEY FINDING CONFIRMED** (repro tool re-run against the fixed barrier): fields 5-10 of
the W tuple reproduce **byte-identically** (zero change to the three tracked JSON
assets: `q12-activation-lock-catalog.test-reference.json`,
`q12-activation-lock-order.test-reference.json`,
`q12-managed-session-inventory-schema.json`). Field 7
(`activation_recovery_slice_sha256`) is confirmed catalog-INDEPENDENT (already known)
and, by this re-run, also barrier-fix-independent (the bytes the fix touched are
outside the hashed RECOVERY-slice range). **Only field 4 changes.** No STOP condition
was hit; the KEY FINDING supplied by the orchestrator is verified, not contradicted.

## 1. W-tuple field-4 amendment

`.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md`:

- Table row (field 4): value `134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68`
  → **AMENDED** `3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9`;
  provenance cell rewritten to cite the frozen-barrier-fix round + its PASS/PASS
  review and explicitly mark the old value historical (the correct barrier sha256 AT
  `60910053`, superseded, not current field-4 truth).
- Verification bullet (`sha256sum deploy/qdrant/q12-database-barrier.sh -> 134255ce…
(field 4)`) updated to cite the new value and point at the amendment note.
- New `### 2026-07-18 AMENDMENT — field-4 succession` subsection added directly under
  the tuple table: states the supersession, the repro-tool re-run result (fields 5-10
  byte-identical), and that checklist item 2 (C7 re-freeze of 5/6/8/9) is unchanged.
- New `# Verification` bullet recording the fresh re-verification (`sha256sum` on the
  live barrier bytes in this worktree, matching `3673ee49…`) and naming the new CI
  guard test.
- New Risks/Follow-ups item `(d)` summarizing the amendment and its non-effect on the
  C7 re-freeze scope.
- `python3 scripts/orchestration/validate_artifact.py
.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md` ->
  **artifact validation OK**.

## 2. CI guard (load-bearing, TDD)

New file
`packages/course-gen-platform/tests/unit/ops/q12-w-tuple-frozen-byte-guard.test.ts`
(no docker). It reads W-tuple fields 2 (`command_manifest_sha256`) and 4
(`activation_barrier_sha256`) **from the tuple artifact's markdown table** (never
hardcodes them as the primary assertion) and asserts each equals the real
`sha256` of `deploy/qdrant/q12-command-manifest.json` /
`deploy/qdrant/q12-database-barrier.sh`. A third test proves the guard is
discriminating: the tuple value differs from the historical pre-fix sha, and a
deliberately-wrong sha never equals either the tuple value or the real file bytes.

**RED → GREEN proof performed this round (not committed):** appended a comment line
to the live `deploy/qdrant/q12-database-barrier.sh` (no tuple amendment to match) and
re-ran the suite — the field-4 test failed with a genuine `AssertionError` (tuple
`3673ee49…` vs the mutated file's real sha `09ff1e35…`); the other two tests were
unaffected (field 2 still matched; the discrimination test still held). The barrier
file was then restored byte-for-byte (`sha256sum` re-confirmed `3673ee49…`, `git
status` clean) and the suite re-run GREEN (3/3). This demonstrates the guard bites on
a real unauthorized drift and is not vacuously true.

Only the manifest and barrier fields are guarded: the W tuple carries no separate
structural-catalog field of its own (the structural-catalog sha `0b8a943f…` is a
"frozen-trio" member tracked outside this 11-field tuple, not one of its fields), so
no third guard was added for it — consistent with the instruction to add one "if the
tuple carries a structural-catalog field" (it does not).

## 3. Frozen-sha reference sweep — classification table

`git grep -n "134255ce"` → 57 occurrences; `git grep -n "53647f0a"` → 2 occurrences
(both truncated/full forms included by the prefix search). Every occurrence
classified CURRENT-TRUTH (a live contract statement) vs HISTORICAL (a past
round/review record describing what was true then, or narrating the transition).

| File : Line(s)                                                                                                      | Class                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Changed?                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-barrier-fix-review.md:19,25,53,134,156`                             | historical (the fix round's own review; already documents 134255ce→3673ee49)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-barrier-pg17-acl-fix.md:200,232,343`                                | historical (fix-round artifact; :232/:343 narrate "the cascade, not executed here" — this round)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-live-controller-design-review.md:20`                                | historical (round review pinned at a commit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-live-controller.md:40,78`                                           | historical (R3 delivered-stream artifact)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-plan-builder-review.md:30`                                          | historical (round review pinned at a commit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-plan-builder.md:26-38,46,107`                                       | historical (per-round delivery log, each entry frozen-at-that-round)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-plan-live-review-r2.md:19,77`                                       | historical (round review pinned at a commit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-plan-live-review.md:32`                                             | historical (round review pinned at a commit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r4.md:51,58,65,169,188,268`                                         | historical (R4 delivered-stream artifact)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-w-amendment-review.md:19,59`                                        | historical (round review pinned at a commit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-w-amendment.md:58,131`                                              | historical (delivered-stream artifact)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md:20,57`                                 | **current-truth** (the accepted W tuple — this round's primary amendment target)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **yes → 3673ee49…**                                                                                 |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-docs-review.md:90,122`                                           | historical (round review)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-join-review.md:29,62`                                            | historical (round review)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-q12-root.md:63`                                                  | historical (delivered-stream artifact)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | no                                                                                                  |
| `.codex/stages/mc2-jz6y0/summary.md:551,628`                                                                        | historical (append-only stage-summary journal entries, each dated to a past delivery)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | no                                                                                                  |
| `docs/superpowers/plans/2026-07-17-q12-live-controller.md:13` (Scope and standing contract)                         | **current-truth** (live, every-round standing constraint)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **yes → 3673ee49…**                                                                                 |
| `docs/superpowers/plans/2026-07-17-q12-live-controller.md:193` (Verification contract)                              | **current-truth** (live, every-round verification constraint)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **yes → 3673ee49…**                                                                                 |
| `docs/superpowers/plans/2026-07-17-q12-live-controller.md:405` (R4 Sub-round C log entry)                           | historical (log entry recording pre-fix-round state)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | no                                                                                                  |
| `docs/superpowers/plans/2026-07-17-q12-live-controller.md:457` (Frozen-barrier-fix-round log entry)                 | historical (log entry narrating "the cascade, not executed here, orchestrator's next step" — this artifact IS that step)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | no                                                                                                  |
| `docs/superpowers/specs/2026-07-17-q12-live-controller-design.md:39,421`                                            | **FLAGGED — judgment call.** Reads as a live "hard constraint... carried into every implementation round" (current-truth-shaped language), but is a one-time ratified design baseline never revised since ratification (git log: 2 commits, both pre-dating the barrier-fix round) and was NOT named in the orchestrator's explicit target list (plan / handoff.md / orchestrator.toml / "any current-state doc"). Classified **historical** by reasoned default (design docs in this repo's workflow are frozen ratification records, not living contracts); left untouched. Flagging for reviewer confirmation rather than guessing wrong. | no (flagged)                                                                                        |
| `docs/superpowers/specs/2026-07-17-q12-quiesce-window-mode-note.md:145`                                             | **FLAGGED — same judgment call as above** (ratified W-amendment-mechanism note, 2 commits, both pre-dating the barrier-fix round; describes the "Untouched" set at the time that round's boundary was ratified). Classified **historical**; left untouched; flagged for reviewer confirmation.                                                                                                                                                                                                                                                                                                                                               | no (flagged)                                                                                        |
| `packages/course-gen-platform/tests/unit/ops/q12-activation-truth.test.ts:36` (`W_TUPLE.activation_barrier_sha256`) | **current-truth** (live hardcoded constant in an active test file; explicitly flagged as a stale pin in `mc2-jz6y0.13-barrier-fix-review.md:25` — "the only non-doc reference to the OLD sha... UNUSED in the suite... does NOT break CI" but still a drifted current-truth value)                                                                                                                                                                                                                                                                                                                                                           | **yes → 3673ee49…** (verified unused by any assertion before editing; comment added explaining why) |
| `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-source-manifest-round-review.md:19,65` (`53647f0a…`)                | historical (the source-manifest round's own review; already documents 53647f0a→902cd6a1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | no                                                                                                  |

**Totals:** 59 occurrences (57 × `134255ce…` + 2 × `53647f0a…`) across 20 distinct
files. 5 sites changed (2 in the W-tuple artifact, 2 in the plan doc, 1 in the test
file); 2 sites flagged ambiguous and left untouched by reasoned default; the remaining
52 sites are historical round/review records, correctly left untouched.

No `134255ce…`/`53647f0a…` occurrence was found in `.codex/handoff.md` or
`.codex/orchestrator.toml` (confirmed empty by the same sweep) — neither needed
updating.

# Verification

- Repro tool (`node
.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs`)
  re-run against the fixed barrier: fields 5-10 byte-identical to the pre-fix values
  already frozen in the tuple; confirms the KEY FINDING supplied by the orchestrator
  and rules out any STOP condition.
- `python3 scripts/orchestration/validate_artifact.py
.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md` ->
  artifact validation OK.
- `python3 scripts/orchestration/validate_artifact.py
.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-cascade.md` -> artifact validation OK
  (this file).
- New CI guard proven RED (live barrier byte mutation, no tuple amendment -> field-4
  assertion fails with a real `AssertionError`) then GREEN (barrier restored,
  `git status` clean, 3/3 pass).
- No-docker suites green (from `packages/course-gen-platform`, `SUPABASE_URL`/
  `SUPABASE_SERVICE_KEY` synthetic, `pnpm exec vitest run --config
vitest.config.unit.ts`): `q12-live-controller.test.ts`,
  `q12-live-cutover.test.ts`, `q12-retained-barrier-quiesce-seam.test.ts`,
  `q12-retained-barrier-w-composition-seam.test.ts`,
  `q12-source-manifest-guard-surface.test.ts`,
  `q12-source-manifest-baseline-order-symmetry.test.ts`,
  `q12-w-tuple-frozen-byte-guard.test.ts` (new), `q12-activation-truth.test.ts`
  (touched constant) -> **8 files, 376 passed | 16 skipped, 0 failed**.
- `pnpm exec tsc --noEmit` -> exit 0.
- `prettier --check` on all touched/added files -> clean (one file auto-formatted by
  `prettier --write` after initial authoring; re-verified clean and re-run green).
- Frozen bytes this round: `sha256sum deploy/qdrant/q12-command-manifest.json` =
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841` (FROZEN,
  untouched); `sha256sum deploy/qdrant/q12-database-barrier.sh` =
  `3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9` (the ratified
  fixed barrier, NOT re-edited by this round); `sha256sum
deploy/postgres/q12-source-manifest.ts` =
  `902cd6a1a579ee94f58e290c3e96df49fd42df56b6da576ced2943cdeadb71d3` (the final
  source-manifest sha, NOT re-edited); `q12-structural-catalog.sql` prefix
  `0b8a943f…` (FROZEN, out of range, untouched). `git status --short` shows only the 4
  intended changed files + this new artifact.

# Risks / Follow-ups

- **Flagged ambiguity (design/spec docs).** The two design/spec-note occurrences
  (`2026-07-17-q12-live-controller-design.md:39,421`,
  `2026-07-17-q12-quiesce-window-mode-note.md:145`) read with current-truth-shaped
  language ("hard constraints... carried into every implementation round") but were
  classified historical (ratified, never-revised baselines) by reasoned default and
  left untouched, since the orchestrator's own target list did not name them. If the
  orchestrator wants these updated too for reader consistency, that is a small,
  low-risk follow-up (doc-only, no code/test surface).
- **P3 (a) / (b) carried forward unchanged** — see `explicit_defers` above; neither is
  touched by this round.
- **C7 (fields 5/6/8/9 production re-freeze) unchanged in scope** — this cascade
  round's repro-tool re-run proves the re-freeze work needed is identical to before
  the barrier fix (pure catalog substitution once the accepted production catalog
  exists); no new work created or resolved here.
- No STOP condition was hit: the repro tool did not change fields 5-10 (KEY FINDING
  confirmed), and no current-truth-vs-historical classification was genuinely
  unresolvable — the two flagged design/spec sites have a reasoned default with an
  explicit flag, not a guess presented as fact.
