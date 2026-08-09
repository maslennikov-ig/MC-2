# Stage `mc2-mt07s` — Stage 6 raw-language phase routing

Status: accepted locally; commit pending.

## Classification and boundary

Root-owned backend cleanup after evidence-based restatement. The original ru/en-only routing risk
expired when Stage 6 moved to phase/tier selection. The accepted boundary removes the remaining
dead normalized path and proves that both live generation and self-review routing preserve an
arbitrary language code.

## Acceptance intent

- remove the uncalled `getStage6ModelConfig` normalization path;
- remove the unused language-keyed primary fallback map;
- pass `de` unchanged through main generation and self-review phase configuration;
- make no unsupported claim about live output quality in a language tier;
- pass focused unit/lint/format checks and canonical type/build gates.

## Next action

Commit and close `mc2-mt07s`, then narrow `mc2-stds7` to its remaining S-2 test.

project-index: reviewed-no-change — no package, route, service, public API, or operator entrypoint
changed.

docs-reviewed: no-change-needed - the tracker and tests record the narrowed routing contract; no
operator flow or published language-support promise changed.

documentation-decision: no external/versioned boundary - repository call graphs, types, tracker
evidence, and deterministic tests fully define the behavior.

graph-reviewed: updated - local Graphify refresh completed at 61430 nodes and 7310 communities; no
external semantic/model backend was used.
