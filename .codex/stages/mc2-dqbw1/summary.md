# Stage `mc2-dqbw1` — Lesson Inspector no-session loading

Active stage id: `mc2-dqbw1`
Status: accepted locally; remote delivery was not requested.

## Scope

Clear Lesson Inspector loading when Supabase auth finishes without a session while preserving the
existing stable authenticated fetch behavior. Do not claim this reproduces the historical
valid-superadmin incident.

## Implementation evidence

- `7b29f9d29` makes the initial-fetch effect observe auth resolution separately from the stable
  `isAuthenticated` boolean.
- While auth is resolving, loading remains active.
- When auth resolves without a session, loading stops without a Supabase query.
- When a session exists, the existing `fetchLessonData()` path remains unchanged and still depends
  on the stable boolean rather than session object identity.
- Focused TDD: the no-session test failed against the old behavior and then passed 1/1.

## Acceptance

- Focused web test — 1/1 passed after failing against the old behavior.
- `pnpm run type-check` — passed.
- `pnpm run build` — passed; the pre-existing Node `DEP0169` warning remains tracked by
  `mc2-p2908.1`.
- Canonical process verification — passed; receipt:
  `.codex/stages/mc2-dqbw1/acceptance-receipt.json`.
- Beads issue `mc2-dqbw1` — closed with product commit `7b29f9d29`.

## Reviews

Documentation: no external/versioned boundary - this is repository-owned hook state and tests.

docs-reviewed: no-change-needed - the existing Lesson Inspector hook remains the stable owner; no
navigation, public contract, or operator procedure changed.

project-index: reviewed-no-change - no stable entrypoint or ownership boundary changed.

graph-reviewed: updated - local Graphify refreshed after `7b29f9d29` without semantic/API
extraction; 61,075 nodes and 87,975 edges were rebuilt, then 7,269 communities reclustered.

## Explicit defer

The 2026-03-21 report involved a valid superadmin session. This change does not reproduce or claim
to settle that path; doing so requires a running application and Network trace.

## Delivery / Cleanup

The accepted change is committed on local `develop`. No child worktree or branch existed to clean.
No merge, push, deploy, live mutation, reindex, migration, secrets/access change, or paid call was
performed.
