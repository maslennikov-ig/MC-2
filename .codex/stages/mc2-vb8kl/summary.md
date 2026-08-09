# Stage `mc2-vb8kl` — Qdrant reindex progress isolation

Status: accepted locally; commit pending.

## Classification and boundary

Root-owned Stage 2 bug fix. The boundary is course-level progress only: BullMQ job progress,
document processing, embeddings, and Qdrant writes keep their existing behavior. No reindex or live
service was executed.

## Acceptance intent

- reproduce the unguarded reindex path before changing production code;
- identify reindex origin from the existing `qdrant-reindex-` job-id contract;
- route all eight Stage 2 course-progress writes through one origin-aware guard;
- prove reindex jobs write no course progress while ordinary jobs still do;
- pass the complete Stage 2 unit set, focused lint/format, type-check, and build.

## Evidence

- red: the focused regression observed four course-progress calls across initialization and vector
  indexing for one reindex job;
- green: 12 Stage 2 unit files / 122 tests passed, including zero reindex calls and three ordinary
  vector-phase calls;
- `pnpm type-check` and `pnpm build` passed.

## Next action

Commit `mc2-vb8kl`, then continue with the instrumentation-only boundary of `mc2-wxun`.

project-index: reviewed-no-change — no package, route, service, public API, or operator entrypoint
changed.

docs-reviewed: no-change-needed - behavior is internal and fully expressed by code and regression
coverage.

documentation-decision: no external/versioned boundary - the producer and consumer of the job id
are both repository-owned.

graph-reviewed: updated - local Graphify refresh completed at 61464 nodes and 7310 communities; no
external semantic/model backend was used.
