# Stage `mc2-db696.65` Summary

Updated: 2026-06-08
Branch: `codex/career-playbook-numeric-provenance`
Beads: `mc2-db696.65`

## Scope

Implemented Career Playbook numeric provenance v1 for the owner viewer:

- Shared contract: `CareerPlaybookNumericFact` schema and `CareerPlaybookBlockState.numeric_facts`.
- Backend generation: deterministic numeric extractor/classifier and prompt guardrails for unsupported precise company-specific numbers.
- Backend persistence: `library.updateNumericFact` mutation patches owner-approved values inside existing `generated_blocks` JSONB and refreshes `final_markdown`.
- Frontend viewer: annotated markdown mode, soft pastel inline numeric triggers, tooltip provenance, Sheet-based correction, compact right-panel summary.
- Tests: backend extractor/mutation regression, web store/viewer, and markdown renderer occurrence/code guards.

## Parallel Decomposition Matrix

| Stream          | Goal                                                | Owner | Write zone                                                    | Dependencies                 | Verification                       | Decision   | Reason                                                                                  |
| --------------- | --------------------------------------------------- | ----- | ------------------------------------------------------------- | ---------------------------- | ---------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| Backend/types   | Schema, extractor, guardrails, update mutation      | local | `packages/shared-types`, Career Playbook backend stage/router | Shared contract before UI    | backend targeted tests, type-check | sequential | Shared `numeric_facts` contract blocks UI integration                                   |
| Frontend viewer | Inline annotated reader UX and owner correction     | local | Career Playbook viewer/store, markdown renderer, locale copy  | Backend/store mutation shape | web targeted tests, type-check     | sequential | UI depends on backend action and shared types                                           |
| Review/QA       | Correctness, prompt regression, docs/graph closeout | local | read-only plus stage/handoff docs                             | Implementation complete      | targeted tests, type-check, build  | local      | Visible subagent spawn was blocked by runtime thread limit; local review checklist used |

## Verification

- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage-career-playbook/numeric-facts.test.ts tests/unit/career-playbook-library-service.test.ts` — passed, 11 tests.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store-viewer.test.ts tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx` — passed, 18 tests.
- `git diff --check` — passed.
- `pnpm type-check` — passed.
- `pnpm build` — passed.

## Review Notes

- Correctness review was completed locally because `multi_agent_v1.spawn_agent` returned `agent thread limit reached`; existing subagents were not closed to avoid interfering with other work.
- Fixed review findings before closeout:
  - markdown annotations now map repeated identical numbers to the correct occurrence fact;
  - inline code/pre/link content is skipped by numeric annotations;
  - backend `final_markdown` patching prefers replacing the edited block text before occurrence fallback.
- No unresolved findings.

## Documentation

- docs-reviewed: no-change-needed - this changes shared API/UI behavior but the stable repo docs already point to Career Playbook stage, library service, viewer route, shared contracts, and verification commands. Public/operator docs do not describe numeric provenance controls yet; no durable doc was stale.
- project-index: reviewed-no-change - existing Career Playbook backend/frontend entrypoints remain accurate.

## Knowledge Graph

- graph-reviewed: updated - ran `graphify update .` and `graphify cluster-only . --no-viz`; `graphify-out/` is ignored and not included in delivery.

## Delivery

- Feature branch: `codex/career-playbook-numeric-provenance`.
- Merge/deploy: not performed in this turn.

## Explicit Defers

- None.
