---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-osty1/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: stage-2-data-loss-and-safety
public_facade: n/a
bounded_acceptance: every open backlog item carries exactly one bucket and its evidence
non_goals:
  - fixing anything found by the triage
  - ranking the backlog before the triage is complete
  - reindex, schema migrations, secrets or access changes, force-push
evidence:
  - none
task_id: mc2-osty1
epic_id: mc2-p2908
stage_id: mc2-osty1
session_id: mc2-osty1
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: read-mostly audit; the hard part is refusing unverified verdicts, not depth
repo: mc2
branch: develop
base_branch: develop
base_commit: ad80c7c95
worktree: /home/me/code/mc2
write_zone:
  - .beads (issue state only)
  - .codex/stages/mc2-osty1
  - .codex/goals/mc2-osty1
success_criteria:
  - each of the 89 open items lands in exactly one bucket
  - no close without a commit sha or a measurement
  - REF: records no longer appear in bd ready
selected_docs:
  - pypi.org/pypi/docling-mcp/json (upstream release gate)
selected_skills:
  - orchestration-bridge:orchestrator-stage
selected_agents:
  - Explore x3 (read-only triage streams)
catalog_candidates:
  - none
parallel_group: triage-streams
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: read-only streams shared the primary worktree and wrote no file; git status confirms nothing to clean
risk_level: low
risk_tags:
  - none
affected_surfaces:
  - none
invariants:
  - none
docs_impact: docs-only
docs_reviewed: updated
docs_review_notes: two measured corrections to specs/025-remaining-debt/spec.md recorded in the stage summary
verification:
  - pnpm format:check: failed (138 unformatted + 11 unparseable, exit 2 — this IS the measurement)
  - pnpm build:types after removing one emitted declaration: passed (exit 0) while the declaration stayed missing — reproduces mc2-5dzld
  - npx eslint packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.test.ts: failed (16 errors, 4 warnings)
  - curl https://pypi.org/pypi/docling-mcp/json: passed (latest 3.0.0, 2026-07-31)
  - bd ready REF: count before/after: passed (10 -> 0)
  - git merge-base --is-ancestor for all 13 cited shas: passed (all ancestors of develop)
  - node re-run of the sectionCount split for mc2-raw1i: failed the issue's premise (never reaches 0 on a non-empty lesson)
changed_files:
  - .codex/stages/mc2-osty1/summary.md
  - .codex/stages/mc2-osty1/stage-manifest.json
  - .codex/stages/mc2-osty1/artifacts/mc2-osty1.md
explicit_defers:
  - mc2-3gz2m — gated on deep research; Stage 5 must not start before findings are in hand
  - mc2-8m90f — precondition measured as not fired (evidence tables empty)
---

# Summary

Triaged the 51 root-owned items of the 89-item backlog against the code. Six closed
with a commit sha or a measurement, ten `REF:` records taken out of `bd ready`, the rest
kept with evidence, a size and the risk they carry.

Two claims in `specs/025-remaining-debt/spec.md` were wrong and are corrected by
measurement: `format:check` fails on 138 files plus 11 unparseable, not 11; and
`mc2-gbctb` was fixed on 2026-06-28, so it is not a deploy hazard and does not move to
Stage 2.

One defect was reproduced rather than judged from its description. `mc2-5dzld`: removing a
single emitted declaration while keeping `tsconfig.tsbuildinfo` makes `pnpm build:types`
report success without restoring it. The experiment could have failed and did not.

# Scope / Routing

Write zone was Beads issue state plus this stage's own directory; no source file changed.
Three read-only `Explore` streams took 38 items (Career Playbook 13, content pipeline 15,
code-review/tooling 10). Delegation qualified on context isolation — the 89 items do not
fit one window — and on parallel latency. Read-only streams shared the primary worktree,
so no worktree isolation was needed, and `git status` confirms they wrote nothing.

# Verification

Listed in the frontmatter. Every `already_fixed` verdict cites `git log -S` output; every
`real` verdict cites a file:line or a command result.

# Delivery / Cleanup

All four streams accepted. The three delegated streams went idle without delivering their
tables and needed an explicit nudge; a mid-run status ping produced no reply at all.
Their verdicts were accepted only after every cited sha was checked against `develop` with
`git merge-base --is-ancestor` (13/13 ancestors, subjects matching) and the five
highest-risk claims were re-read at source. One of those re-checks changed nothing but
sharpened a P1: `mc2-raw1i`'s guard exists and is dead code.

Nothing to clean: read-only streams shared the primary worktree and wrote no file.

# Risks / Follow-ups / Explicit Defers

Eleven of the 56 surviving work items need an owner decision rather than engineering, and
none of them blocks other work. The two that matter most:

- the eight LanguageTool items (`mc2-z6er` and children) have zero implementation since
  2026-02-16, and the repository has since grown its own grammar handling — is a
  self-hosted LanguageTool still wanted?
- `mc2-q1ggs` — separate accounts, a shared lock, or narrower sudoers.

`mc2-jsamu`'s children do not cover 28 of the 138 unformatted files; the breakdown needs
widening or a `.prettierignore` batch before `mc2-jsamu.6` can go green.

Two verdicts are recorded as `real (unverified)` because settling them needs a live run
outside a read-only mandate: `mc2-5e4ek.1` and `mc2-1nots`. Both had their filed
hypotheses disproved by code, so the cause is genuinely open — not quietly assumed.

`mc2-1ugj1`'s verdict reads repository migrations only; this project does not auto-apply
migrations in CI, so confirm against the live publication before fixing.
