# Stage `mc2-db696.79` — Career Playbook source title language

Status: accepted locally; commit pending.

## Classification and boundary

Root-owned backend behavior slice. The boundary is the language value passed from a Career Playbook
source job into Phase 6 title generation. Ordinary course processing keeps its existing database
lookup.

## Acceptance intent

- never query `courses` with a Career Playbook id;
- generate Russian titles when the playbook language is Russian;
- use detected document language for playbook languages not supported by the binary title prompts;
- preserve document-language metadata and the ordinary course path;
- pass deterministic unit, lint, type-check, and build gates without a live or paid call.

## Next action

Commit and close `mc2-db696.79`, then continue in specification order with `mc2-5e4ek.2`.

project-index: reviewed-no-change — this extends an internal Phase 6 call option and does not add a
service, package, queue type, deployment entrypoint, or public API.

docs-reviewed: no-change-needed - the internal option is documented beside its type and changes no
operator workflow.

documentation-decision: no external/versioned boundary - the implementation follows local Phase 6
and Career Playbook job contracts.

graph-reviewed: updated - local Graphify refresh completed at 61390 nodes and 7328 communities; no
external semantic/model backend was used.
