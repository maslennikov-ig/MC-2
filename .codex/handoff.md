# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `codex/career-playbook-generation-status`
Base branch: `feature/career-playbook-pdf` stacked on PR #34

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open: #24 base orchestration, #25 Phase 1, #26 backend stage 2, #27 backend stage 3, #28 Phase A frontend, #29 Phase B frontend, #32 Phase B transport, #33 Phase 10 library/share, #34 PDF export.
- `mc2-db696.13` is closed on this branch: Career Playbook generation now queues `JobType.CAREER_PLAYBOOK`, routes through the sandbox processor, persists completed/failed output, and the wizard polls `generation.getStatus` until terminal status.
- Review follow-up `mc2-db696.13.4` is closed: retry handling, stale terminal job removal, enqueue compensation, stale error clearing, non-course queue cleanup, and active-generation edit locks are implemented and tested.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.13` - generation worker completion and polling status transport.
- Stage summary: [`.codex/stages/mc2-db696.13/summary.md`](./stages/mc2-db696.13/summary.md)
- Artifacts: [`.codex/stages/mc2-db696.13/artifacts`](./stages/mc2-db696.13/artifacts), including worker/frontend stream reports and Goodall/Bacon review adjudication.
- Previous PDF/export context remains under [`.codex/stages/mc2-db696.8`](./stages/mc2-db696.8), review pass under [`.codex/stages/mc2-db696.14`](./stages/mc2-db696.14), and TOKEN-backed auth E2E under [`.codex/stages/mc2-db696.15`](./stages/mc2-db696.15).

## Next recommended

Next delivery action: push `codex/career-playbook-generation-status` and open a stacked PR targeting `feature/career-playbook-pdf`.

Next stage id: `mc2-db696.9`
Recommended action: start JD to Course bridge on a new stacked branch after the current generation-status PR is opened. `mc2-db696.11` remains blocked until `mc2-db696.8` and `mc2-db696.9` are both closed.

- If PR #24/#25/#26/#27/#28/#29/#32/#33/#34 land first, rebase/retarget before more dependent work.
- Independent marketing work may proceed separately if its base branch decision is explicit.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25/#26/#27/#28/#29/#32/#33/#34 status, and avoid dependent work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Frontend PDF action wiring remains deferred in `mc2-db696.8.3` because the current branch has no private Career Playbook viewer/actions surface; this blocks full browser PDF-download E2E, but the TOKEN-backed Phase A wizard E2E now passes.
- Real Supabase RLS/staging smoke and browser e2e share/PDF flow remain in `mc2-db696.11`.
- Live Redis/Supabase worker E2E for wizard -> approve -> BullMQ worker -> completed/final_markdown was not run in `mc2-db696.13`; `mc2-db696.11` notes were updated to include it.
- SSE/subscription status streaming remains deferred; `mc2-db696.13` intentionally implemented polling over existing `httpBatchLink`.
- JD bridge and broader end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
