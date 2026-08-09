# Stage `mc2-1mmop` — safe workspace and Next cache cleanup

Status: accepted locally; commit delivery pending.

## Classification and boundary

Root-owned destructive-operation safety slice. The boundary is the accepted child worktree and its
exact `packages/web/.next/cache`: both are candidates only when the branch is already merged and
the worktree is clean. Primary, protected, dirty, unmerged, or symlinked paths remain untouched.

## Acceptance intent

- prove the pre-change helper did not expose the Next cache as a cleanup candidate;
- add an exact cache candidate without widening deletion beyond the child worktree;
- preserve dirty and unmerged worktrees, their caches, and their branches;
- enforce the synthetic regression in CI and document dry-run-first operation.

## Next action

Commit the accepted slice with explicit paths, close `mc2-1mmop`, then continue with `mc2-iioip`
in the specification's fixed order.

project-index: reviewed-no-change — the change is to repository orchestration tooling and does not
alter application packages, services, imports, or public facades.

docs-reviewed: updated - handoff and failure-mode guidance now describe the exact cleanup boundary
and dry-run-first workflow.

documentation-decision: no external/versioned boundary - behavior is defined entirely by the
repository-owned cleanup script, Git evidence, and synthetic local regression.

graph-reviewed: no-change-needed - Graphify does not index the orchestration Python helper, and no
application architecture or symbol relationship changed.
