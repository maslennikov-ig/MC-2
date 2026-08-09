# Stage `mc2-db696.78` — valid development CSP connect origins

Status: accepted locally; commit pending.

## Classification and boundary

Root-owned security/configuration slice. The boundary is the development-only `connect-src`
directive and the Career Playbook browser regression that originally captured its console noise.

## Acceptance intent

- remove every invalid partial-IP wildcard source;
- preserve localhost and `.local` development access;
- admit configured private endpoints as exact HTTP/WebSocket origins only;
- prove Chrome logs no invalid CSP source error;
- leave production CSP unchanged and pass focused plus canonical code gates.

## Next action

Commit and close `mc2-db696.78`, then continue in specification order with `mc2-db696.79` and trace
Career Playbook language through source processing without a live generation call.

project-index: reviewed-no-change — the helper changes an existing Next.js development header and
does not add a package, service, deployment entrypoint, or public production contract.

docs-reviewed: no-change-needed - existing environment variable names and operator workflows do not
change.

documentation-decision: used docs-resolve for Next.js context and the W3C CSP Level 3 host-source
grammar for the versioned security syntax; repository code determined the exact integration.

graph-reviewed: updated - local Graphify refresh completed at 61377 nodes and 7298 communities; no
external semantic/model backend was used.
