# Stage `mc2-q1ggs` — shared host-operation lock

Active stage id: `mc2-q1ggs`
Status: in progress.

## Scope

Add one non-blocking host lock to the repository-declared production, development, rollback, and
legacy deploy entrypoints. Provide the same wrapper for cooperating infrastructure operations.

Do not create accounts, change `sudoers`, SSH keys, secrets, or access. Do not deploy or perform any
live, migration, reindex, or paid operation.

## Decision and evidence

The owner selected the smallest option after reviewing the trade-off: keep the shared account and
add a common lock now; revisit separate identities and narrower privileges only if another regular
operator appears.

The 2026-08-07 incident proves the race is real. GitHub workflow concurrency is scoped to workflow
and branch, while an independent SSH process bypasses it. The server entrypoints currently acquire
no common lock.

## Classification and acceptance boundary

High-risk, root-owned operations concurrency slice with no live execution. Acceptance is limited to
isolated shell contention, repository deployment contracts, type-check, build, and process checks.

## Next action

Write the focused failing contention and delivery-contract tests, then add the minimum shared
`flock` implementation.
