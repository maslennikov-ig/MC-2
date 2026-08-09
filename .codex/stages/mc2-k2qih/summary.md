# Stage `mc2-k2qih` — Career Playbook reader-panel motion

Status: accepted locally; commit pending.

## Classification and boundary

Root-owned narrow UI craft task. The boundary is the existing Career Playbook reader layout and
its left/right panel toggles; active-section sync and TOC autoscroll were already complete and are
unchanged.

## Acceptance intent

- animate both rail exits and entrances with transform/opacity and smooth document relayout;
- preserve URL state, semantic removal, sticky scrolling, and existing TOC synchronization;
- disable motion when the operating system requests reduced motion;
- cover animated exit and reduced-motion behavior with focused unit tests;
- add authenticated Chromium coverage for CI and pass lint, formatting, type-check, and build.

## Next action

Commit and close `mc2-k2qih`, then restate `mc2-mt07s` against current phase-based routing.

project-index: reviewed-no-change — no route, service, package, public API, or operator entrypoint
changed.

docs-reviewed: no-change-needed - motion behavior is covered by tests and changes no documented
operator or public contract.

documentation-decision: external/versioned boundary used - implementation follows the fetched
Emil Kowalski motion guidance at
https://raw.githubusercontent.com/emilkowalski/skill/main/skills/emil-design-eng/SKILL.md for
transform/opacity, short ease-out motion, and reduced-motion support.

graph-reviewed: updated - local Graphify refresh completed at 61418 nodes and 7337 communities; no
external semantic/model backend was used.
