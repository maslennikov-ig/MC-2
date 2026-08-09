# Stage `mc2-db696.57` — current web E2E operator guide

Status: accepted locally; commit pending.

## Classification and boundary

Root-owned documentation slice. The boundary is the runnable Playwright guide: current suite
inventory, authentication inputs, web-server fallback behavior, service prerequisites, focused
commands, and generated artifacts.

## Acceptance intent

- map all 18 current spec files to their actual suite groups;
- document the implemented auth and managed/external server selection contracts;
- remove the reference to a nonexistent environment example;
- prove Markdown formatting and Playwright discovery for 148 tests in 18 files.

## Next action

Commit and close `mc2-db696.57`, then continue with `mc2-db696.60` and add the deterministic
Business Context to follow-up browser transition without live paid work.

project-index: reviewed-no-change — no package boundary, runtime entrypoint, or public application
contract changed.

docs-reviewed: updated - the E2E README now matches current repository behavior.

documentation-decision: no external/versioned boundary - repository tests and configuration are
the authoritative source for this operator guide.

graph-reviewed: no-change-needed - documentation-only test guidance does not change the code graph.
