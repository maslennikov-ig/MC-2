# Stage `mc2-sznhi` — localized intro teaser guard

Active stage id: `mc2-sznhi`
Status: accepted locally; remote delivery was not requested.

## Scope

Select exact teaser patterns for every locale represented by `CONTENT_LABELS`, preserve exact
next-lesson-title detection, and avoid rejecting ordinary same-lesson transitions. Do not run live
generation or paid calls.

## Classification and boundary

Medium root-owned backend behavior slice. Acceptance covers the Stage 6 intro guard, its language
input from the existing generator, and focused unit tests. No public API, migration, database, UI,
deploy, merge, or remote delivery boundary is involved.

## Acceptance intent

- The localized pattern map is exhaustive for the shared language contract.
- Positive cases cover at least three non-ru/en writing systems.
- Negative cases prove normal transition phrasing remains allowed.
- Existing en/ru phrases and exact next-lesson-title matching remain intact.
- Focused unit tests, `pnpm run type-check`, `pnpm run build`, and process verification pass.

## Implementation evidence

- `bcb197989` replaces the six global patterns with an exhaustive locale-keyed map typed from
  `CONTENT_LABELS`.
- Both initial and corrective generator passes now provide the generation language to the guard.
- Unknown language codes use the same English fallback as the shared language contract.
- Patterns require an explicit localized lesson, section, or chapter phrase; ordinary transitions
  remain accepted.
- Focused TDD: 18/39 cases failed against the old behavior, then 40/40 passed after the change and
  fallback coverage was added.

## Reviews

Documentation: no external/versioned boundary - locale and guard behavior are repository-owned.

docs-reviewed: no-change-needed - the existing Stage 6 guard remains the stable owner.

project-index: reviewed-no-change - no stable entrypoint or ownership boundary changes.

graph-reviewed: updated - focused local Graphify query confirmed the guard-to-generator and shared
language-contract boundary; after `bcb197989`, the graph was rebuilt without semantic/API
extraction to 61,095 nodes and 88,001 edges, then reclustered to 7,251 communities.

## Acceptance

- Focused backend unit test through `vitest.config.unit.ts` — 40/40 passed after 18 localized
  teaser cases failed against the old behavior.
- `pnpm run type-check` — passed.
- `pnpm run build` — passed; the pre-existing Node `DEP0169` warning remains tracked by
  `mc2-p2908.1`.
- Canonical process verification — passed; receipt:
  `.codex/stages/mc2-sznhi/acceptance-receipt.json`.
- Beads issue `mc2-sznhi` — closed with product commit `bcb197989`.

## Delivery / Cleanup

The accepted change is committed on local `develop`. No child worktree or branch existed to clean.
No merge, push, deploy, live generation, paid call, reindex, migration, secrets, or access change
was performed.

## Next action

Start Tier 2 with `mc2-3sz3d`, the false-green backend test bootstrap, in exact spec order.
