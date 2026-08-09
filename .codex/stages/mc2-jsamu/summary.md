# Stage `mc2-jsamu` — monorepo formatting baseline

Status: accepted locally; repository delivery pending.

## Classification and boundary

Root-owned repository-health stage. The parent was restructured before formatting so every
measured path has one owner: raw captures, repository metadata/generated artifacts, docs, specs,
packages, and final global verification.

## Acceptance intent

- preserve the 11 malformed raw LLM captures byte-for-byte;
- exclude only justified generated, cache, tool-owned, installed-agent, and immutable-evidence
  paths;
- format the remaining 29 docs, 1 specs, and 74 packages files with the pinned Prettier version;
- make `pnpm format:check`, `pnpm type-check`, and `pnpm build` green on one final tree.

## Measured implementation

- Before: 138 formatting mismatches plus 11 Prettier parse blockers.
- After the ownership boundary: docs 29, specs 1, packages 74, other 0; no parse blockers.
- Formatting batches: exactly 29 docs, 1 specs, and 74 packages files changed.
- The specs Markdown needed two formatter passes for legacy escaped asterisks; the second pass
  stabilized its SHA and the following check passed.

## Next action

Commit the explicit task-owned paths, deliver through `develop`, and wait for the exact CI result.
The next ordered backlog item after delivery is `mc2-5dzld`.

project-index: reviewed-no-change — all detected source-file changes are Prettier-only; paths,
exports, runtime behavior, and ownership boundaries are unchanged.

docs-reviewed: updated - `.prettierignore` now documents the raw-capture, generated-output,
tool-state, cache, installed-agent, and immutable-evidence ownership boundary.

graph-reviewed: no-change-needed - Prettier-only source changes preserve symbols, imports, and
architectural edges; the ignore boundary affects tooling ownership, not the application graph.

## Explicit defers

- Beads task `mc2-xq2w0` tracks the closeout scanner's false positive on intentional
  `TODO`/`FIXME` literals in placeholder-validator tests. The literals remain unchanged in meaning;
  weakening the tests is outside this formatting-only stage.
- Beads task `mc2-vr7ic` tracks the pre-commit hook's inability to restage forced tracked goal
  snapshots and its blocking of formatting-only legacy files on pre-existing lint errors.

## Acceptance evidence

- `pnpm format:check`: passed globally; all matched files use Prettier code style.
- `pnpm type-check`: passed across all five workspace packages.
- `pnpm build`: passed, including the 75-page Next production build.
- canonical process verification and stage readiness: passed.
- acceptance receipt: `.codex/stages/mc2-jsamu/acceptance-receipt.json`.
- post-hook reconciliation: all 102 delivered docs/specs/packages files equal canonical
  `Prettier(HEAD)` output; two transient ESLint auto-fixes were detected and discarded.
