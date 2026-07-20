---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-r8-amendment-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: 7e873c2e2
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_notes: 'Read-only design-amendment review; single write is this artifact. No code/config/design modified, no server/db/docker command run.'
cleanup_status: not_applicable
risk_level: low
verification:
  - 'RE-TARGETED to the amended commit 94ede2145 (range 7e873c2e2..94ede2145, still ONE docs-only commit, same file/§6b structure); the prior f696b8ae7 is orphaned. The code is byte-identical between 7e873c2e2 and 94ede2145 (empty deploy/ + packages/ diff), so all barrier/fixture/core byte-verification below transfers unchanged; only the doc citations were re-checked against 94ede2145.'
  - "Verified the four f696b8ae7→94ede2145 deltas landed in the committed file: (a) §6b.2 supersession now targets the ORIGINAL §5.5 and references the witness era only as tag provenance ('not as live design text'); (b) §6a item 6 gained the partial-closure framing ('RULING 1 refined, not discarded': RESUME half receipt-only PRESERVED, forced by q12-database-barrier.sh:511-513; CLEANUP half reversed to journaled) — this RESOLVES the prior P3-1; (c) §5.5 gained an in-place operator-mid-incident pointer to §6b.2; (d) the §6b intro base cite is fixed to 7e873c2e2 (14b60142d now appears only as the tag's commit)."
  - "Grepped the COMMITTED file (94ede2145) for 'witness': every NEW reference (§6a item 6 :526/:556, §6b intro :582-583, §6b.2 :690/:694/:717-719, §6b.3 :745-761) is explicit supersession or tag-provenance; the pre-existing occurrences (:116/:247/:345/:391) are the unrelated milestone/resource-stepping-witness concept. No witness reference treats the withdrawn file as live/current design. No witness file is created or depended on."
  - 'Interdiff duty (criterion 2): git diff f696b8ae7 94ede2145 is doc-text-only (30+/20- in the one design file, no non-doc path) and introduces NO new byte-claim — the only code-file citation in its added lines is q12-database-barrier.sh:511-513 (the tail-contiguity gate at :512), already byte-verified in the c1bed1e2 pass; so no fresh byte-verification is required and the transferred verification binds to the tip.'
  - 'Commit touches ONLY the design doc; frozen trio (aaec6fc2/3673ee49/0b8a943f) and W-owned files (q12-writer-resume.py, source-recovery-run.sh) untouched in the range.'
  - "§6b.4 grammar-reject claim CONFIRMED against bytes: validate_journal_entry_grammar (:203) falls to the else-branch operation=next(OPERATIONS...)=None for barrier.cleanup and raises at :309 (COMMANDS.values() lacks barrier.cleanup); resolved_command :699 manifest['commands'][command_id] KeyErrors; capability reconstruction (reload_durable :1078-1084) raises 'unknown capability command'; load_manifest :639 exact-set assert vs MANIFEST_COMMAND_IDS :52 — adding cleanup to OPERATIONS would trip the frozen-manifest hard stop. All three rejecting paths + the critical guard are real and correctly classified as non-frozen Task-9 extensions."
  - "INDEPENDENT search for a 4th rejecting path found NONE: validate_stable_binding_walk is binding-based (tolerant of unknown command_id); the selectors/completions projections (:1321-1324, :1335-1340) SKIP barrier.cleanup via the 'operation is not None' guard (no raise); the CLI claim path (:2744) is argparse-restricted to COMMANDS.values() and off the cleanup journal path. §6b.4's three-path enumeration is complete."
  - "§6b.5 divergence CONFIRMED: the barrier cleanup subcommand publishes the terminal proof and 'exit 0's at q12-database-barrier.sh:2116, BEFORE the generic v1 receipt writer at :2119 (unreachable for cleanup) — so the v2 receipt promotion, capability deletion, and rows 4-5 are controller steps."
  - '§6b.1 tail-contiguity CONFIRMED: q12-database-barrier.sh:512 requires indexes[-1]==len(entries)-1 (cleanup block is the last row), so any writers.resume.* row after the cleanup segment breaks contiguity → this genuinely FORCES writers.resume to stay receipt-only; consecutive cutover→cutover-recovery-N epochs enforced at :514-518.'
  - 'v2 receipt shape CONFIRMED: q12-writer-resume.py:1090 exact({...10 keys...}) requires exactly {schema_version, run_id, state=guard_cleanup_complete, expected_catalog_sha256, zero_guard_residue=true, last_command, rollback_probes_verified, probe_receipt_sha256, terminal_proof_sha256, database_capability_deleted=true} — key-for-key what §6b.1 says the controller must write.'
  - "W-consumer tolerance CONFIRMED and strengthened: the W journal loop (:1443-1485) validates only row SHAPE (JOURNAL_KEYS/canonical/hash-chain; command_id merely a non-empty string) and appends to an in-memory list (never disk) — it tolerates barrier.cleanup rows; moreover the W-side ALREADY knows barrier.cleanup (barrier_command_ids incl 'barrier.cleanup'/'barrier.rollback' at :1665-1674, guard_cleanup_complete handling at :1516-1517), so the extended journal is exactly what the frozen barrier + frozen W-side already expect."
  - '§6b.2 supported heads = the 5 barrier /completed heads (OPERATIONS :27-34 / TARGET_PHASES :93-99) + the 2 ratified R5 checkpoints + the cleanup heads = 8 clean group boundaries; mid-lifecycle heads keep the R5-D2 supervisor pointer; §5.5 prose kept with an in-place supersession pointer; §6a item 6 records the reversal with provenance.'
  - 'Did NOT run the vitest suite or any server/db/docker command (constraint).'
changed_files:
  - docs/superpowers/specs/2026-07-17-q12-live-controller-design.md
explicit_defers:
  - "P3-1 (RESOLVED in 94ede2145): the prior split of the 'resume-half receipt-only PRESERVED (forced by :511-513) / cleanup-half reversed' framing is now co-located in §6a item 6's partial-closure paragraph (delta b). Residual, low: §6a item 6's provenance still cites the withdrawn witness symbols (recover_post_activate :3591-3633) which live at tag r8d-witness-superseded, not the current tip (run_recover is at :3478) — intentional reversal-record provenance, but a current-tip reader will not find recover_post_activate."
  - 'P3-2: minor citation drift (grammar raise at :309 vs cited :308; the frozen barrier cleanup grammar cited variously as :443-520 / :444-572 / :507-553) — every cited MECHANISM resolves to the correct bytes within a line or two; §6b.3 already tells the R8 author to re-grep before editing.'
  - "Informational: the R8 build must land the three controller extensions (guard_cleanup_complete/barrier.cleanup grammar branch; cleanup capability class; a new Engine.append caller fed the frozen barrier's own command authority) together and OUTSIDE the OPERATIONS/COMMANDS/MANIFEST_COMMAND_IDS coupling; if TDD shows any genuinely needs a manifest entry, that is the fresh hard stop to escalate (the amendment already states this)."
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1.** This is a rigorous, byte-accurate design amendment that correctly
encodes both ratified rulings (R8-A journaled cleanup / OQ3 reinstated; R8-C =
Option A generalized recover), depends on no witness file, requires no manifest or
frozen change, and leaves the frozen trio and W-owned files untouched in the commit.
Every load-bearing byte-claim I re-verified independently held. Findings: two P3
doc-polish items and one informational implementation note — none gates the amendment.

**Significant finding (decision-affecting, positive):** the frozen W consumer
`q12-writer-resume.py` ALREADY carries `barrier.cleanup`/`barrier.rollback` in its
`barrier_command_ids` set and already handles the `guard_cleanup_complete` phase, and
the frozen barrier's `cleanup` subcommand structurally requires the journaled
`guard_cleanup_complete`/`barrier.cleanup` lifecycle. So the R5-E receipt-only
mechanism was the anomaly against frozen truth, and RULING R8-A (reverse it, journal
the cleanup) is the correct alignment — independently confirmed, not merely plausible.
The ONLY component that does not yet understand `barrier.cleanup` is the controller
(`q12-lifecycle-core.py`), whose three exact rejecting paths the amendment (§6b.4)
identifies precisely, all fixable as non-frozen Task-9 extensions.

# Verification

## Ruling compliance (criterion 7)

Docs-only commit; frozen trio + W-owned files untouched (verified by name in the
commit). No witness file created or depended on — every `witness` mention in the new
text marks the R8-D mechanism as **superseded**, preserved off-tip at tag
`r8d-witness-superseded`; §6b.2 row 5 replaces the witness activate-head dispatch with
journal-head dispatch. §5.5's two-head clause is superseded **in place** with a pointer
to §6b.2, its mid-barrier composition kept as the fail-closed branch. §6a item 6 is a
full RULING-1 reversal record (what it said / why it fell / what supersedes it / scope
guard), and — in the amended commit 94ede2145 — a co-located partial-closure paragraph
stating the RESUME half receipt-only is PRESERVED (frozen-forced by
`q12-database-barrier.sh:511-513`) while the CLEANUP half is reversed to journaled
(the prior split is now consolidated; former P3-1 resolved).

## Manifest-append investigation (criterion 3) — complete and correct

`Engine.append` (:1395-1449) writes a caller-supplied `command_id` with no
manifest-membership check. Three Task-9-owned, non-frozen paths currently reject
`barrier.cleanup` and are correctly enumerated for R8 extension: (1)
`validate_journal_entry_grammar` else-branch → raise; (2) `reload_durable` capability
reconstruction → "unknown capability command"; (3) `resolved_command`
`manifest["commands"][command_id]` → `KeyError` (so the existing
`append_ordinary_lifecycle`/`retained_chain`/`append_controller_milestone` callers
cannot be reused; a new `Engine.append` caller is required). The critical guard is
sound: `MANIFEST_COMMAND_IDS = tuple(COMMANDS.values()) + ORDINARY_COMMAND_IDS` and
`load_manifest` (:639) asserts the manifest keys equal it **exactly**, so adding
`cleanup` to `OPERATIONS` would force `barrier.cleanup` into the manifest and trip the
frozen-manifest hard stop. **Independent search for a fourth rejecting path found
none** — `validate_stable_binding_walk` is binding-based and tolerant; the
selectors/completions projections skip non-`OPERATIONS` commands via an
`operation is not None` guard (no raise); the CLI claim path is argparse-restricted and
off the cleanup journal path.

## Row-map, divergence, receipt, tail-contiguity (criteria 1, 2)

The `guard_cleanup_complete`/`barrier.cleanup` 5-row lifecycle, the claimed-boundary
requirement, the consecutive `cutover→cutover-recovery-N` epochs, and the 18-key
terminal proof all match the frozen barrier grammar. The divergence flag is accurate:
the barrier `cleanup` subcommand publishes only the terminal proof and `exit 0`s at
`:2116`, never reaching the v1 receipt writer at `:2119`, so the v1→v2 receipt
promotion, capability deletion, and rows 4-5 are controller steps. The tail-contiguity
gate (`indexes[-1]==len(entries)-1`, `:512`) genuinely forces `writers.resume.*` to
stay receipt-only — any resume row after the cleanup block breaks contiguity and fails
a later idempotent re-drive. The controller-written v2 receipt must match the frozen
resume gate's exact 10-key `exact(...)` at `q12-writer-resume.py:1090` key-for-key,
including `state=guard_cleanup_complete`, `zero_guard_residue=true`,
`database_capability_deleted=true`.

## W-consumer tolerance (criterion 4)

The W journal loop validates row shape only (command_id is merely a required non-empty
string) and appends to an in-memory list — no disk write, no command-membership
rejection — so it tolerates the extended tail. Beyond tolerance, the W-side already
models `barrier.cleanup` (in `barrier_command_ids`, `barrier_terminal_command_ids`, and
`guard_cleanup_complete` handling), so no W-side assumption is violated by the amendment.

## Recover dispatch and probes (criteria 5, 6)

The 8 supported heads are the 5 barrier `/completed` boundaries (`OPERATIONS` /
`TARGET_PHASES`), the 2 ratified R5 checkpoints, and the post-activate cleanup heads —
all clean group boundaries; completion evidence is the journal head only; mid-lifecycle
heads keep the named refusal + supervisor pointer, whose composition is now true under
Option A (supervisor completes the barrier → the completed head is a supported table
row → recover continues). The §6b.6 probe set (install / verify-after-base / activate
→ cleanup segment, one per barrier class, plus the chain-first, marker-unchanged, and
idempotent-convergence salvaged shapes) is an adequate acceptance spec for the R8 build.

## Impact/salvage (criterion 6 second half)

§6b.3 correctly enumerates the R5-E / R5-D / R8-D fixture-era assertions to update as a
ratified STRENGTHENING (no test changed by this document); the 76-row prefix parity is
untouched, with new coverage ADDED for the cleanup segment; the witness **mechanism** is
not salvaged (replaced by journal-head evidence) while the reusable **test shapes**
(chain-first, marker-byte-unchanged, idempotent no-op-success) are called out for salvage
from the tag.

# Risks / Follow-ups

- **P3-1 (RESOLVED in 94ede2145) — reversal-record self-containment.** The prior review
  (of orphaned f696b8ae7) noted the "resume-half receipt-only preserved (forced by
  `:511-513`) / cleanup-half reversed" framing was split across §6a item 6 and §6b.1.
  Delta (b) of the amended commit adds a co-located partial-closure paragraph in §6a item
  6 ("RULING 1 refined, not discarded") that states exactly this, so the item is closed.
  Residual (confidence low): §6a item 6's provenance still cites the withdrawn witness
  symbols (`recover_post_activate`, `:3591-3633`), which resolve at tag
  `r8d-witness-superseded`, not the current tip (`run_recover` is at `:3478`) — intentional
  reversal-record provenance, but a current-tip reader will not find `recover_post_activate`.

- **P3-2 (confidence low) — minor citation drift.** A few cited lines are off by one or
  a small range (grammar raise `:309` vs cited `:308`; the frozen barrier cleanup grammar
  cited as `:443-520` / `:444-572` / `:507-553`). Every cited mechanism resolves to the
  correct bytes; §6b.3 already directs the R8 author to re-grep before editing.

- **Informational — R8 implementation coupling.** The three controller extensions
  (grammar branch, cleanup capability class, new `Engine.append` caller) must land
  together and strictly OUTSIDE the `OPERATIONS`/`COMMANDS`/`MANIFEST_COMMAND_IDS`
  coupling; if TDD later shows any path genuinely cannot accept `barrier.cleanup` without
  a manifest entry, that is the fresh hard stop to escalate — the amendment already says
  so, and this review found no reason to expect it.
