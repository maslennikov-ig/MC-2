# Stage `mc2-n6szm` — reindex test lint cleanup

Status: accepted locally; commit delivery pending.

## Classification and boundary

Root-owned test-maintenance slice. The boundary is the single oversized reindex test surface and
its extracted fixture/CLI files. Production Qdrant code, lint policy, and the broader test-tree debt
are unchanged.

## Acceptance intent

- measure the exact baseline before edits;
- replace no-await async mocks with explicit Promise-returning operations without rule disables;
- split fixtures, command/recovery groups, and CLI coverage along existing semantic boundaries;
- prove zero ESLint problems and all 67 focused tests, type-check, and production build remain green.

## Next action

Commit the accepted slice with explicit paths, close `mc2-n6szm`, then continue with `mc2-1mmop`
in the specification's fixed order.

project-index: reviewed-no-change — only test organization changed; production symbols, imports,
and package facades are unchanged.

docs-reviewed: no-change-needed - the durable behavior and operator workflow are unchanged; the
split file names are internal test organization.

documentation-decision: no external/versioned boundary - the task is governed by repository-pinned
ESLint/Vitest configuration and local test behavior.

graph-reviewed: no-change-needed - test-only fixture and spec boundaries do not change the
application knowledge graph.
