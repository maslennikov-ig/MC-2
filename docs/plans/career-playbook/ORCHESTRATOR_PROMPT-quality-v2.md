# Career Playbook Quality v2 — Orchestrator Handoff

Target: repository `/home/me/code/mc2`, epic `mc2-db696`
Audience: orchestrator agent with repo write access
Runtime: codex
prompt-check: pass (2026-08-11; one warning: 2.4k chars vs 1.5k target)

## Goal

Raise Career Playbook generation from the measured 2.6/5 to >= 4.0/5, with grounding >= 3/5,
coherence >= 4/5, PDF >= 4/5, cost <= $0.35, wall clock <= 25 min, <= 6 block regenerations.

## Context

Read in order, then start: `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`,
`docs/plans/buzzing-jingling-oasis.md` (plan), `docs/career-playbook/quality-contract.md`
(normative), `docs/career-playbook/quality-root-cause-2026-08-11.md` (causes RC-1..RC-10 with
file:line), `docs/plans/career-playbook/03-prompts-structure.md` (prompt spec v2),
`docs/ADR-008-career-playbook-pdf-rendering.md`, `docs/plans/career-playbook/06-quality-acceptance.md`,
`.codex/stages/mc2-db696.105/evidence/quality-review.md`. Test data:
`packages/course-gen-platform/artifacts/career-playbook-quality/`.

Queue: `bd ready | grep db696`. 19 tasks, dependency graph wired, no cycles. Start at
`mc2-db696.107.1` (blocks five others). Independent: `.106.1`, `.108.1`, `.108.2`, `.108.3`, `.107.6`.

Invariants: metric_ledger is the only source of numbers; evidence_ledger and generated_on are
filled by code, never by the model; `style` never triggers regeneration; formalizable defects
become deterministic checks, not new prompt bans; the canonical 26-block layout lives only in
`shared/prompts/career-playbook-block-topics.ts`; contracts only from `@megacampus/shared-types`;
migrations idempotent (insert-if-missing then converge); every new check needs a positive and a
negative test from the real run.

## Output

Per task: `pnpm type-check` and `pnpm build` plus the scoped suite, then `bd close` with the run
recorded. Never close on an unrun check — say so instead. Stage artifacts per `AGENTS.md`; update
`.codex/handoff.md`; record explicit defers in Beads.

Stop and ask before: the paid live run (`mc2-db696.110`); any push, PR, merge or deploy; needing a
new external key or secret; a plan/code mismatch; acceptance below threshold (follow
`06-quality-acceptance.md`, not prompt tuning).

Branch note: `codex/career-playbook-quality-review` holds two commits absent from `develop`.
Decide delivery first; verify with `python3 scripts/orchestration/check_stranded_commits.py`.
