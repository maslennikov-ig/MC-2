# Stage `mc2-68qwn` — Q12 name/text union audit

Status: accepted locally; commit pending.

## Classification and boundary

Root-owned PostgreSQL data-integrity audit plus regression. The boundary is silent coercion of a
composite catalog identity to PostgreSQL `name` inside a set operation.

## Acceptance intent

- inspect every named Q12 capture, projection, barrier, and restore-compare surface;
- record evidence and explicit no-hazard results rather than changing safe SQL;
- keep all four composite source-manifest union type anchors under default unit coverage;
- prove a longer-than-63-byte identity through real PostgreSQL 17.10 and production `catalogSql()`;
- pass focused unit/lint/format checks and canonical type/build gates.

## Next action

Commit `mc2-68qwn`, then continue with `mc2-vb8kl` without executing a reindex.

project-index: reviewed-no-change — no package, route, service, public API, or operator entrypoint
changed.

docs-reviewed: updated - the new tracked audit records every inspected surface and evidence.

documentation-decision: no external/versioned boundary - PostgreSQL behavior is measured directly
against the repository-pinned 17.10 fixture and production SQL.

graph-reviewed: updated - local Graphify refresh completed at 61451 nodes and 7327 communities; no
external semantic/model backend was used.
