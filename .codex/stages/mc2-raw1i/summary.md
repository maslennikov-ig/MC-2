# Stage `mc2-raw1i` — reachable empty-section guard

Active stage id: `mc2-raw1i`
Status: accepted locally; remote delivery was not requested.

## Scope

Make the existing Stage 6 `emptySections` guard reachable by counting actual H2 content-section
headers instead of non-empty fragments returned by `String.split()`. Preserve exact H2 counts and
leave generation, scoring, database, and live processing outside this stage.

## Implementation evidence

- `0d551f046` replaces fragment counting with exact H2 header counting.
- Intro-only and H1-only content now reports zero sections and reaches the existing critical
  `emptySections` failure.
- H1 titles and nested H3 headings no longer inflate the H2 content-section count.
- The legacy density fixture now uses the H2 structure produced and consumed by Stage 6.
- Focused TDD: 3/3 tests failed against the old behavior and then passed after the change.

## Acceptance

- Focused unit test through `vitest.config.unit.ts` — 3/3 passed.
- `pnpm run type-check` — passed.
- `pnpm run build` — passed; the pre-existing Node `DEP0169` warning remains tracked by
  `mc2-p2908.1`.
- Canonical process verification — passed; receipt:
  `.codex/stages/mc2-raw1i/acceptance-receipt.json`.
- Beads issue `mc2-raw1i` — closed with product commit `0d551f046`.

## Reviews

Documentation: no external/versioned boundary - the change uses repository-owned parsing and test
infrastructure only.

docs-reviewed: no-change-needed - the existing Stage 6 heuristic result remains the stable owner;
no navigation, public contract, or operator procedure changed.

project-index: reviewed-no-change - no stable entrypoint or ownership boundary changed.

graph-reviewed: updated - local code graph refreshed after `0d551f046` without semantic/API
extraction; 61,048 nodes and 87,951 edges were rebuilt, then 7,268 communities reclustered.

## Delivery / Cleanup

The accepted change is committed on local `develop`. No child worktree or branch existed to clean.
No merge, push, deploy, live generation, provider call, reindex, or migration was performed.
