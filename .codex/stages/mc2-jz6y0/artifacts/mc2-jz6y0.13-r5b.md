---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r5b
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 39c4542c4
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-live-controller and branch
  codex/q12-live-controller left in place for orchestrator integration; no push.
  Sub-round B is pure in-process fixture journaling (no docker/PG17), so there are
  no container resources to reclaim.
risk_level: medium
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log
  updated (R5 Sub-round B done, under Round 5 — real forward FWM producer) in the
  same delivery; design spec doc unchanged (deploy.commit at group 15 and the
  activate barrier at group 16 are exactly the amendment section-5 forward
  chronology / design section 6a full-window twin the plan Round 5 already
  specifies; this round introduces no new design decision). No other
  product-behavior doc changed.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Local change confined to deploy/qdrant/q12-lifecycle-core.py (run_live body
  only) + the ops test file; no architecture, durable workflow, or public-surface
  change. Worktree is a delegated stream awaiting integration, so no local
  Graphify refresh here.
verification:
  - 'RED->GREEN: c48f2ca93 -> 1cda05ad7. RED (c48f2ca93, test only) extended the R5 Sub-round A FWM parity test to the full forward window: it now asserts live.journalEntries.length===76, adds a Part 1b structural check that rows 69-76 are exactly [activation_ready/intent, activation_ready/capability_issued, activation_ready/capability_claimed, activation_ready/completed] for deploy.commit then [activation_committing/intent, activated/capability_issued, activated/capability_claimed, activated/completed] for barrier.activate, and widens the Part 2 full-journal twin from composer.journalEntries.slice(0,68) to the full 76-row composer forward journal (both under withParityExclusions). Confirmed RED genuinely failed against the unmodified 68-row run_live: "expected 68 to be 76" at the length assertion.'
  - 'GREEN (1cda05ad7): run_live (deploy/qdrant/q12-lifecycle-core.py) now, immediately after the publish_final_writer_manifest("forward", ...) call and before engine.reload_durable(), adds `ordinary("deploy.commit")` then `d5("activate")` — a verbatim mirror of run_joined_composer''s forward tail (forward_tail_through_activation_ready() ends with record(ordinary("deploy.commit")); the profit=="forward" arm then calls d5("activate") at :3026). No new primitive: ordinary()/d5() were already the in-scope run_live helpers. run_joined_composer''s own body is UNCHANGED (git diff confined to run_live''s own body + comment).'
  - 'Row-structure proof (Part 1b): the deploy.commit ordinary lifecycle (rows 69-72) sits at phase activation_ready for all four outcomes (ORDINARY_ROW_GRAMMAR["deploy.commit"] == ("activation_ready","activation_ready")); the activate barrier (rows 73-76) has its selector/intent row at SELECTOR_PHASES["activate"] == "activation_committing" and the capability_issued/capability_claimed/completed rows at TARGET_PHASES["activate"] == "activated". The literals were verified against retained_chain / selector_intent_from_head / delegate_claim / finish in q12-lifecycle-core.py, not guessed. The full 76-row window = 13 ordinary lifecycles + genesis/FWM + 5 in-process barriers.'
  - 'Full-journal-twin proof (Part 2): live.journalEntries.map(withParityExclusions) deep-equals composer.journalEntries.map(withParityExclusions) across ALL 76 rows (previously slice(0,68)). The blessed exclusion set stays CLOSED and the row-scoped accepted_object_sha256 exclusion stays applied to the single writers.resume.forward/accepted FWM row only; deploy.commit and activate rows carry exactly the unmodified 4-field blessed set. The FWM-content byte-parity (Part 3) and self-consistency assertions from R5-A are unchanged and still pass (FWM is now rows 67-68 of 76; fwmAcceptedIndex stays 67).'
  - 'Forced count corrections in the R4 tests (NOT gate weakening — run_live genuinely gained one ordinary lifecycle and one in-process barrier, both crossing the real child boundary): R4 Sub-round A ordinaryKeys.length 12->13 and live.childExecutions 16->18 (D5_CLAIM_DELEGATIONS 4->5, i.e. install/verify-after-base/verify-after-observability/prepare-recovery + activate); R4 Sub-round B barrierKeys gains "activate:cutover" (5th real-wrapper barrier claim, STRENGTHENING the assertion by covering the new barrier). The per-child real-execution and capability-binding loops in both tests are count-general and unchanged.'
  - 'Suite green (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-live-controller.test.ts): 7/7 after GREEN, including "journals groups 14-16 (FWM, deploy.commit, barrier.activate) as a full 76-row byte/order twin of the composer".'
  - 'pnpm exec tsc --noEmit = 0 (course-gen-platform), re-run after the GREEN commit.'
  - 'Frozen bytes byte-identical, verified after GREEN: q12-command-manifest.json aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841, q12-database-barrier.sh 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9, q12-structural-catalog.sql 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e. No W-owned file changed (q12-writer-resume.py, source-recovery-run.sh, q12-source-manifest.ts untouched). run_joined_composer body byte-unchanged.'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5b.md -> artifact validation OK.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
explicit_defers:
  - 'Marker lifetime assertion (R5 Sub-round C): run_live does not yet write the
    quiesce-window-mode.json cutover marker before writers.quiesce, nor does the test
    assert its presence/mode/schema. That is the next unblocked sub-round.'
  - 'Recover/resume-forward tail past activate (R5 Sub-round D/E) remains HELD for the
    two pending orchestrator rulings (OQ3 cleanup = receipt-only-no-journal-row; recover
    idempotence scope). run_live still stops at engine.reload_durable() after activate; no
    live/recover CLI wiring, no real-PG17 barrier.cleanup->v2-receipt->resume.forward leg.'
  - 'The FWM inventory + activate chain stay the FIXTURE derivation (derive_root_writer_inventory
    over W-owned quiesce bytes + default_joined_chain) exactly like the composer — no live
    writer-topology authority is introduced. Real full-window execution is R8.'
---

# Summary

R5 Sub-round B (forward window close: `deploy.commit` group 15 + `activate`
group 16) is delivered on branch `codex/q12-live-controller`: RED `c48f2ca93`
-> GREEN `1cda05ad7` -> docs. The Task-9 live controller `run_live` now journals
the **full 76-row forward window** as a byte/order **twin** of
`run_joined_composer`'s forward path: after the group-14 FWM it appends
`ordinary("deploy.commit")` (rows 69-72) and `d5("activate")` (rows 73-76),
then `reload_durable()`. This closes the forward-journal parity duty: every
forward row `run_live` emits is now proven byte/order-identical to the composer
oracle under the closed blessed exclusion set (plus the single row-scoped FWM
`accepted_object_sha256` exclusion ratified in R5-A).

No frozen byte changed; no second authority was forked (`run_live` reuses the
same `ordinary`/`d5`/`retained_chain`/`publish_final_writer_manifest`
primitives, and `run_joined_composer`'s body is byte-unchanged).

# Verification

- RED `c48f2ca93` / GREEN `1cda05ad7`; frozen bytes verified byte-identical
  after GREEN (manifest `aaec6fc2…`, barrier `3673ee49…`, structural-catalog
  `0b8a943f…`).
- `q12-live-controller.test.ts` 7/7 — the full-window twin now asserts
  length 76, the deploy.commit/activate row structure (Part 1b), and the
  all-76-row twin (Part 2). R4-A/R4-B count assertions corrected to the true
  extended window (12->13 ordinary, 4->5 barriers, +activate:cutover) — a
  truthful update, not a weakening.
- `pnpm exec tsc --noEmit` = 0 (course-gen-platform). No W-owned file changed.
- `validate_artifact.py` on this file -> OK.

# Risks / Follow-ups

- **R5-C (marker lifetime) is the next unblocked sub-round.** `run_live` must
  write `quiesce-window-mode.json` (schema `megacampus.q12.quiesce-window-mode/v1`,
  mode=cutover, 0400) before `writers.quiesce`, with a present/mode/schema
  assertion before the group-3 row and at post-activate, plus malformed/missing
  negatives.
- **R5-D/E (recover + real-PG17 post-activate legs) stay HELD** for the two
  pending orchestrator rulings (OQ3 cleanup receipt-only; recover idempotence
  scope).
- **Fixture scope unchanged.** The activate chain uses `default_joined_chain`
  and the FWM inventory the fixture derivation, exactly as the composer — real
  full-window execution remains R8.
