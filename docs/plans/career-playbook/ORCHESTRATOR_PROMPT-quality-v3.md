# Career Playbook Quality v3 — Orchestrator Handoff

Target: repository `/home/me/code/mc2`, epic `mc2-db696`, branch `develop` at `688749159`
Audience: orchestrator agent with repo write access
Runtime: codex
prompt-check: pass (2026-08-11; one warning: 3.2k chars vs 1.5k target)

## Goal

Close the six defects an end-to-end editorial read found in the 2026-08-11 acceptance output, then
re-run acceptance to clear `mc2-db696.110`. The run scored **3.9/5** against a 4.0 threshold; the
deterministic scorecard reported zero criticals, which is exactly why reading mattered.

## Context

Read in order: `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`,
`.codex/stages/mc2-db696.110/evidence/quality-review.md` (the read, and the six defects),
`docs/career-playbook/quality-contract.md` **section 8bis** (normative rules and the design for each
fix), `docs/plans/career-playbook/03-prompts-structure.md` **"Что меняется в v3"** (prompt and node
deltas), `docs/plans/career-playbook/06-quality-acceptance.md` **"L3 после прогона"** (mandatory
acceptance order). Baseline artifact for tests:
`packages/course-gen-platform/artifacts/career-playbook-quality/`.

Queue: `bd ready | grep db696`. Seven tasks, graph wired, no cycles. Unblocked: `.113` (authority),
`.114` (calibration table — needs `.115` first), `.115` (leakage), `.116` (scales), `.117`
(citation support), `.118` (proofreading pass), `.112` (first-draft adherence). `.110` is blocked by
all of them and is the acceptance.

Invariants, all load-bearing and each learned from a failure:

- **What code can assemble, code assembles.** The Sources section works because it is built from the
  ledger; the calibration table failed because the model had to remember what it marked 900 lines
  earlier. Build it the same way.
- Block 5 is to authority what the metric ledger is to numbers: one canonical source, cited
  elsewhere, never restated in other words.
- Never fail closed on a secondary field — a malformed ledger once cost 26 blocks.
- A false positive in a check that drives regeneration spends real money; tighten before shipping.
- `style` never drives regeneration; the canonical 26-block layout lives only in
  `shared/prompts/career-playbook-block-topics.ts`; contracts only from `@megacampus/shared-types`;
  migrations idempotent.
- Time is no longer a constraint — the owner set quality first. Cost ceiling rises to USD 0.60.

## Output

Per task: `pnpm type-check`, `pnpm build`, the scoped suite, then `bd close` with the run recorded.
Never close on an unrun check — say so instead. Every new check needs a positive and a negative case
drawn from the real 2026-08-11 output, not invented samples.

Acceptance `mc2-db696.110` is a **paid run, already authorized**. Follow the L3 order exactly, and
note that two steps exist because they were skipped last time: open the cover image and look at it;
read the whole assembled Markdown end to end and fill the seven-dimension rubric **before** cleanup.
Cleanup runs last. Target: overall >= 4.0/5, zero scorecard criticals, zero blank PDF pages.

Stop and ask before: any push, PR, merge or deploy; a new external key or secret; a plan/code
mismatch; acceptance below threshold after a second read.
