# Stage `mc2-2vtmk` — durable GHCR read access

Accepted stage id: `mc2-2vtmk`
Status: accepted locally; remote code delivery was not requested.

## Scope

Measure production GHCR access as `claude-deploy`, repair it with the least privilege supplied by
the owner, and prevent CI from replacing the persistent host credential with a short-lived job
token. Acceptance is a fresh-session manifest inspection of an immutable private image without an
image pull or credential/config disclosure.

No deploy, service mutation, root credential change, migration, reindex, push, or paid call was in
scope.

## Decision and evidence

The initial production probe returned `denied`. The persistent Docker config mtime fell inside a
successful CI deploy job, and both deploy scripts authenticated in the default config with that
job's `GITHUB_TOKEN`. GitHub expires that token after the job, so the evidence does not prove that a
prior PAT expired.

Commit `63b4e2efd` moves CI login into a private temporary `DOCKER_CONFIG` and removes it on exit.
Commit `38cf560d5` narrows both deploy jobs to `contents: read` and `packages: read`; build jobs keep
the write permission they require.

The owner explicitly authorized installing the supplied read-only credential before repository
delivery. Installation used stdin with terminal echo disabled and a same-directory mode-0600 backup
that restored on any failure or signal. Verification succeeded, the backup was deleted, and a
fresh independent SSH session repeated the immutable manifest inspection successfully as
`claude-deploy` UID 1000. No secret, Docker config content, or image layer was emitted.

## Reviews

Documentation: docs-resolve - official GitHub Actions `GITHUB_TOKEN` lifetime and GitHub Container
registry authentication guidance were inspected because the diagnosis and least-privilege boundary
depend on external behavior.

docs-reviewed: updated - `.claude/docs/deployment-guide.md` now separates persistent host and
job-scoped CI credentials and documents the temporary-config delivery requirement.

project-index: reviewed-no-change - package ownership and application entrypoints did not change;
the durable operator behavior belongs in the deployment guide and failure-mode record.

graph-reviewed: updated - the local graph was queried, refreshed without semantic/API extraction,
and reclustered to 61,169 nodes, 88,074 edges, and 7,265 communities.

## Acceptance

- Focused ephemeral-auth, deploy-relevance, workflow-gate, and blue/green fail-closed tests passed.
- `pnpm type-check` passed.
- `pnpm build` passed; the pre-existing Node `DEP0169` warning remains tracked by `mc2-p2908.1`.
- Independent security review passed after the deploy permissions were narrowed and the reviewer
  confirmed the final live rollback evidence left no findings.
- Canonical process verification passed; the acceptance receipt is
  `.codex/stages/mc2-2vtmk/acceptance-receipt.json`.

## Delivery / cleanup

The product fix is committed locally on `develop`. No child branch or worktree exists. The live
credential config is owned by `claude-deploy` with mode `0600`; its temporary rollback backup was
deleted after successful verification.

No merge, push, deploy, image pull, service mutation, migration, reindex, or paid call was performed.

## Risks / follow-ups / explicit defers

- Repository delivery is intentionally deferred by the owner's request to finish the backlog first.
  The first later deploy must include `63b4e2efd`; running an older deploy revision can overwrite the
  persistent credential again.
- Docker stores this credential in its standard mode-0600 config because the host has no configured
  credential helper; it is access-controlled, not encrypted at rest.

## Next action

Continue in exact specification order at `mc2-c2p8z`.
