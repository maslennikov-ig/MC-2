# Stage `mc2-stds7` — Combined targeted-refinement token safety

Status: accepted locally; commit pending.

## Classification and boundary

Root-owned backend correctness fix. The boundary is the interaction between the five-task
iteration cap, cross-batch execution order, and token-budget stop accounting.

## Acceptance intent

- reproduce the combined cap-and-budget path with eight available tasks;
- execute three of the five selected tasks before the budget stop;
- report exactly two selected tasks as budget-skipped;
- keep the three tasks outside the cap deferred and out of the budget-skipped count;
- pass focused unit/lint/format checks and canonical type/build gates.

## Next action

Commit and close `mc2-stds7`, then continue with `mc2-r7udy`.

project-index: reviewed-no-change — no package, route, service, public API, or operator entrypoint
changed.

docs-reviewed: no-change-needed - the regression test and tracker acceptance capture the internal
accounting contract.

documentation-decision: no external/versioned boundary - repository code, the review finding, and
deterministic tests fully define the behavior.

graph-reviewed: updated - local Graphify refresh completed at 61441 nodes and 7299 communities; no
external semantic/model backend was used.
