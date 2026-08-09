# Stage `mc2-zt4ju` — compiled API start runtime

Status: accepted locally; commit delivery pending.

## Classification and boundary

Root-owned runtime compatibility slice. The observable contract is the existing compiled API
`start` command under the repository's Node 24 environment. It must resolve the built ESM graph
without changing source imports, worker commands, or application behavior.

## Acceptance intent

- reproduce the native Node `ERR_MODULE_NOT_FOUND` before changing the command;
- add a safe real-command regression proof that cannot load repository environment files;
- align local compiled start with the established production-container `tsx` runtime;
- prove the focused contract, workspace type-check, and production build remain green.

## Next action

Commit the accepted slice with explicit paths, close `mc2-zt4ju`, then continue with `mc2-n6szm`
in the specification's fixed order.

project-index: reviewed-no-change — the API entrypoint, module graph, and package layout are
unchanged; only the existing start facade and its CI proof changed.

docs-reviewed: updated - the backend README and entrypoint usage now identify `pnpm start` as the
supported compiled runtime path.

documentation-decision: docs-resolve blocked because the Node runtime version is not lockfile-owned;
first-party fallback used - official Node ESM documentation confirms relative specifiers require
file extensions, matching the reproduced Node 24 failure.

graph-reviewed: used - `GRAPH_REPORT.md` and a focused Graphify query located the compiled server,
logger, and Supabase import chain; no graph refresh is needed for a package-script-only runtime fix.
