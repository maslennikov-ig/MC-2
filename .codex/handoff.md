# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `feature/career-playbook-pdf`
Base branch: `feature/career-playbook-library-share` stacked on PR #33

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open: #24 base orchestration, #25 Phase 1, #26 backend stage 2, #27 backend stage 3, #28 Phase A frontend, #29 Phase B frontend, #32 Phase B transport, #33 Phase 10 library/share.
- `mc2-db696.8` is ready for stacked PR delivery on this branch after review-and-fix pass `mc2-db696.14`: backend PDF service, Mermaid inline SVG rendering, protected and rate-limited `careerPlaybook.exportPdf`, Docker Chromium runtime, and PDF smoke verification are implemented.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.14` - Phase 8 review and E2E/PDF verification pass.
- Stage summary: [`.codex/stages/mc2-db696.8/summary.md`](./stages/mc2-db696.8/summary.md)
- Review summary: [`.codex/stages/mc2-db696.14/summary.md`](./stages/mc2-db696.14/summary.md)
- Artifacts: original Phase 8 context/review under [`.codex/stages/mc2-db696.8/artifacts`](./stages/mc2-db696.8/artifacts) and review pass artifacts under [`.codex/stages/mc2-db696.14/artifacts`](./stages/mc2-db696.14/artifacts).

## Next recommended

Next stage id: `mc2-db696.9`
Recommended action: push the `feature/career-playbook-pdf` review fixes to PR #34 after Beads closeout, then start JD to Course bridge on a new stacked branch from `feature/career-playbook-pdf`. `mc2-db696.11` remains blocked until `mc2-db696.8` and `mc2-db696.9` are both closed.

- If PR #24/#25/#26/#27/#28/#29/#32/#33 land first, rebase/retarget before more dependent work.
- Independent marketing work may proceed separately if its base branch decision is explicit.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25/#26/#27/#28/#29/#32/#33 status, and avoid dependent work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Frontend PDF action wiring remains deferred in `mc2-db696.8.3` because the current branch has no private Career Playbook viewer/actions surface; this also blocks a full browser PDF-download E2E.
- Real Supabase RLS/staging smoke and browser e2e share/PDF flow remain in `mc2-db696.11`.
- Queue worker completion and live SSE/subscription status streaming remain separate Career Playbook integration work tracked as `mc2-db696.13`.
- JD bridge and broader end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
