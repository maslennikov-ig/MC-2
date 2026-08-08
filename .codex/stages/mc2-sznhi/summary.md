# Stage `mc2-sznhi` — localized intro teaser guard

Active stage id: `mc2-sznhi`
Status: in progress.

## Scope

Select exact teaser patterns for every locale represented by `CONTENT_LABELS`, preserve exact
next-lesson-title detection, and avoid rejecting ordinary same-lesson transitions. Do not run live
generation or paid calls.

## Classification and boundary

Medium root-owned backend behavior slice. Acceptance covers the Stage 6 intro guard, its language
input from the existing generator, and focused unit tests. No public API, migration, database, UI,
deploy, merge, or remote delivery boundary is involved.

## Acceptance intent

- The localized pattern map is exhaustive for the shared language contract.
- Positive cases cover at least three non-ru/en writing systems.
- Negative cases prove normal transition phrasing remains allowed.
- Existing en/ru phrases and exact next-lesson-title matching remain intact.
- Focused unit tests, `pnpm run type-check`, `pnpm run build`, and process verification pass.

## Reviews

Documentation: no external/versioned boundary - locale and guard behavior are repository-owned.

docs-reviewed: no-change-needed - the existing Stage 6 guard remains the stable owner.

project-index: reviewed-no-change - no stable entrypoint or ownership boundary changes.

graph-reviewed: used - focused local Graphify query confirmed the guard-to-generator and shared
language-contract boundary; graph refresh waits for accepted product changes.

## Next action

Add failing localized teaser tests, implement exhaustive locale selection, then run the bounded
acceptance set.
