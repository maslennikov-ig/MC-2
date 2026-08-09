# Stage `mc2-c2p8z` — generated colour environment contract

Accepted stage id: `mc2-c2p8z`
Status: accepted locally; remote delivery was not requested.

## Scope

Add the small CI check selected in specification §5.3: every `${VAR:?}` required by the production
application and worker Compose files must be guaranteed in both generated `.env.blue` and
`.env.green` snapshots before deployment.

No live host, colour file, secret, deploy, migration, reindex, push, merge, or paid call was in
scope.

## Classification and acceptance boundary

Medium-risk, root-owned repository-only CI/deploy contract. The checker must derive consumers and
producers from repository artifacts; a hard-coded copy of today's four keys is not acceptable.

## Implementation evidence

- `02aa50dd0` adds `scripts/ci/check_color_env_contract.mjs` and its focused test.
- Required keys are parsed generically from `docker-compose.app.yml` and
  `docker-compose.production.yml`.
- Base keys come from the workflow's `Create .env.production` step; colour-specific keys come from
  the real `write_color_env` generator contract.
- The workflow lint job runs both the current repository check and its synthetic regression test.
- The current contract derives `API_IMAGE`, `WEB_IMAGE`, `QDRANT_METRICS_GID`, and
  `QDRANT_METRICS_TEXTFILE_HOST_DIR`; neither generated colour is missing one.

## Reviews

Documentation: no external/versioned boundary - the behavior is fully defined by repository-owned
Compose, workflow, and deploy-script artifacts.

docs-reviewed: updated - `.claude/docs/deployment-guide.md` now documents generated colour
snapshots, the CI command, and the producer rule for new required variables.

project-index: reviewed-no-change - no application package ownership or public entrypoint changed;
the CI script is documented in the deployment guide.

graph-reviewed: updated - the local graph was queried before implementation, refreshed without
semantic/API extraction, and reclustered to 61,188 nodes, 88,101 edges, and 7,273 communities.

## Acceptance

- Focused RED: the test failed before the checker module existed.
- Focused GREEN: the synthetic one-colour drift case and current repository contract passed.
- CI workflow-gate and deploy-change detection contracts passed.
- `pnpm run type-check` passed.
- `pnpm run build` passed; the pre-existing Node `DEP0169` warning remains tracked by
  `mc2-p2908.1`.
- Canonical process verification passed; receipt:
  `.codex/stages/mc2-c2p8z/acceptance-receipt.json`.

## Delivery / cleanup

The accepted product change is committed locally on `develop`. No child branch or worktree exists.
No push, merge, deploy, host access, secret access, migration, reindex, or paid action was performed.

## Risks / follow-ups / explicit defers

No in-scope implementation debt remains. `mc2-jz6y0.13.6` is the next exact specification item and
is stopped on its owner decision about using the newly available second host for off-host Qdrant
snapshots.

## Next action

Ask the owner for the `mc2-jz6y0.13.6` backup/retention decision before starting another stage.
