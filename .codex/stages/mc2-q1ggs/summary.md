# Stage `mc2-q1ggs` — shared host-operation lock

Active stage id: `mc2-q1ggs`
Status: accepted locally; remote delivery was not requested.

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

## Implementation evidence

- `beca7ef72` adds the shared `flock` helper and the generic infrastructure wrapper.
- Production, development, rollback, and legacy deploy entrypoints acquire
  `/opt/megacampus/.host-operation.lock` before mutation.
- A rejected operation reports its safe operation label and exits 75 without printing child-command
  arguments.
- CI ships both helper files; modifying either is deploy-relevant.
- Focused TDD: the wrapper, delivery-contract, and deploy-relevance tests failed against the old
  behavior, then the contention and existing fail-closed suites passed after implementation.

## Reviews

Documentation: docs-resolve - official GitHub Actions concurrency documentation and the util-linux
`flock` manual were inspected because the boundary depends on versioned external behavior.

docs-reviewed: updated - `.claude/docs/deployment-guide.md` now documents the shared lock, exit 75,
the manual infrastructure wrapper, and the cooperative-boundary limitation.

project-index: reviewed-no-change - no product ownership or package entrypoint changed; the stable
operator entrypoint belongs in the deployment guide.

graph-reviewed: updated - the local graph was refreshed without semantic/API extraction and
reclustered to 61,117 nodes, 88,027 edges, and 7,272 communities.

## Acceptance

- Focused shell and deploy-contract command — passed: contention, release-after-exit, deploy
  relevance, CI delivery, workflow gates, and existing blue/green fail-closed behavior.
- `pnpm run type-check` — passed.
- `pnpm run build` — passed; the pre-existing Node `DEP0169` warning remains tracked by
  `mc2-p2908.1`.
- Canonical process verification — passed; receipt:
  `.codex/stages/mc2-q1ggs/acceptance-receipt.json`.
- Beads issue `mc2-q1ggs` — closed with product commit `beca7ef72`.

## Delivery / cleanup

The accepted change is committed on local `develop`. No child branch or worktree existed to clean.
No merge, push, deploy, SSH, secret, access, migration, reindex, or paid operation was performed.

## Next action

Continue in exact specification order at `mc2-2vtmk`. Its credential repair remains bounded by §9:
inspect and propose locally, but stop before any secret, access, or production change.
