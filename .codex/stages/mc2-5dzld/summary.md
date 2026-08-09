# Stage `mc2-5dzld` — deterministic declaration rebuild

Status: accepted locally; commit delivery pending.

## Classification and boundary

Root-owned build-tooling slice. The observable contract is the existing `build:types` command:
after generated declarations are removed while incremental metadata remains, it must recreate the
complete declaration tree and keep its web consumer type-safe.

## Acceptance intent

- reproduce the stale-`tsbuildinfo` failure before changing the command;
- add a focused real-command regression proof and make it green with the smallest build fix;
- prove a repeated build, workspace type-check, and production build remain green;
- document the cleanup/rebuild behavior without changing runtime application code.

## Next action

Commit the accepted slice with explicit paths, close `mc2-5dzld`, then continue with
`mc2-zt4ju` in the specification's fixed order.

project-index: reviewed-no-change — the existing `build:types` facade and package layout are
unchanged; only its deterministic rebuild semantics and CI coverage changed.

docs-reviewed: updated - the backend README now documents forced declaration rebuild behavior after
`dist` cleanup with retained incremental metadata.

documentation-decision: no external/versioned boundary - TypeScript is repository-pinned and the
supported build-mode flags were verified against the local compiler.

graph-reviewed: no-change-needed - package scripts, CI coverage, and documentation changed without
altering application symbols, imports, or architectural edges.
