---
schema_version: orchestration-artifact/v1
artifact_type: docs-research
task_id: mc2-jz6y0.13.7.1
stage_id: mc2-jz6y0
agent_type: docs_researcher
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: mc2
branch: codex/q12-pg17-restore-pin
base_branch: codex/self-hosted-qdrant-platform
base_commit: 1e41adc240f69aff9ff9fd53b8b45c1cf6398fc2
worktree: /home/me/code/mc2/.worktrees/q12-pg17-restore-pin
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1.md
selected_skills:
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - docs_researcher
  - deploy_specialist perspective
catalog_candidates:
  - none - installed assets and primary PostgreSQL, Docker Official Image, and registry sources cover this bounded pin
status: returned
delivery_method: cherry-pick
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: all registry and documentation checks were read-only; no image, layer, container, volume, network, port, credential, database session, or temporary runtime resource was created
risk_level: high
docs_impact: ops-deploy
docs_reviewed: needs-update
docs_review_notes: both operations runbooks and the replacement server execution packet must use the exact linux/amd64 manifest digest below
graph_reviewed: used
graph_review_notes: existing local report was read for orientation; this research-only branch does not refresh the graph
verification:
  - PostgreSQL versioning and 17.10 release sources were checked on 2026-07-13
  - Docker Official postgres tag metadata and raw OCI registry manifests were resolved twice independently without pulling layers
  - two raw index resolutions and two Docker Hub API resolutions returned the same index and linux/amd64 manifest digests
  - no Docker pull, run, create, inspect of local runtime state, SSH, Supabase, credential, database, service, Qdrant, staging, or production operation was performed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1.md
explicit_defers:
  - the exact image must be pulled and inspected only inside the authorized observed mutation window after the permanent Session pooler DSN is available
  - a real fresh archive, loopback-isolated restore, verification, and zero-residue cleanup remain live gates
  - tag mutability requires re-resolving the human-readable tag for drift while still pulling and running only the accepted immutable digest
---

# Summary

The isolated restore target is pinned for `linux/amd64` to the Docker Official
Image PostgreSQL `17.10` Debian bookworm variant:

- human-readable tag: `postgres:17.10-bookworm`;
- OCI multi-platform index:
  `sha256:5530681ea5d3e2ed4ce396f9b5cb443efbac6baf2a8a19c0c0635e40ae7eadce`;
- exact `linux/amd64` OCI manifest to pull and run:
  `postgres@sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`.

PostgreSQL `17.10` is the current minor release in the supported PostgreSQL 17
major as of 2026-07-13. PostgreSQL does not designate major 17 as an “LTS”
edition; it publishes supported majors and cumulative minor releases. The
Supabase source reports PostgreSQL `17.6`, so the accepted dump client, restore
client, and disposable server all remain within major 17. The live drill must
record their exact minor versions rather than calling `17.7` current.

The tag is mutable metadata and is not a runtime pin. Future drift in the tag
must be reported, but the accepted drill must use the immutable `linux/amd64`
manifest digest above unless a new first-party pin is reviewed and approved.

## Consulted primary sources

Checked on 2026-07-13:

- PostgreSQL versioning policy:
  https://www.postgresql.org/support/versioning/
- PostgreSQL 17.10 release notes:
  https://www.postgresql.org/docs/release/17.10/
- Docker Official `postgres` image source and supported variants:
  https://github.com/docker-library/postgres
- Docker Official Image description:
  https://hub.docker.com/_/postgres
- Docker Hub tag metadata:
  https://hub.docker.com/v2/repositories/library/postgres/tags/17.10-bookworm
- OCI registry manifest endpoint used with anonymous bearer authentication:
  https://registry-1.docker.io/v2/library/postgres/manifests/17.10-bookworm

## Future isolated restore contract

This contract is documentation, not an executed action:

1. Re-resolve `postgres:17.10-bookworm` and record whether the tag still maps to
   the reviewed index and `linux/amd64` manifest. Drift is a stop, not permission
   to silently accept a new digest.
2. Pull only
   `postgres@sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`
   and prove the local image identity and `linux/amd64` platform before create.
3. Create a unique disposable container, network, and empty data volume. Bind
   PostgreSQL only to a kernel-assigned loopback port; publish no wildcard or
   public interface. Keep the random database password in a mode-0600 file and
   supply it through the image's supported password-file input, never argv,
   logs, tracked files, or an artifact.
4. Require `pg_isready`, then prove `SHOW server_version` reports major 17. Use
   the server's explicit loopback address only; never point the restore command
   at the Supabase source host.
5. Restore the exact newly published archive with
   `/usr/lib/postgresql/17/bin/pg_restore`, `--exit-on-error`, and
   `--single-transaction`. Do not weaken an ownership, role, extension, or ACL
   failure merely to obtain a green drill; treat it as a failed rollback gate.
6. Verify restore exit status, PostgreSQL logs, expected schema/table inventory,
   representative row counts, database size, and absence of source-side writes.
   Record archive checksum, container image digest, client/server versions, and
   observation timestamps without credentials.
7. Remove the disposable container, network, volume, password file, and any
   owned temporary state on both success and failure. Prove zero matching
   containers, networks, volumes, published ports, secret files, and temporary
   paths before proceeding to migrations.

# Verification

Two raw `docker buildx imagetools inspect --raw` resolutions at
`2026-07-13T07:56:23Z` and `2026-07-13T07:56:26Z` returned the same OCI index
and `linux/amd64` child manifest. Two independent Docker Hub API resolutions at
`2026-07-13T07:56:41Z` and `2026-07-13T07:56:42Z` returned the same pair. The
tag metadata reported `tag_last_pushed=2026-07-07T22:11:59.049668Z`.

All four reads agreed on index
`sha256:5530681ea5d3e2ed4ce396f9b5cb443efbac6baf2a8a19c0c0635e40ae7eadce`
and `linux/amd64` manifest
`sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`.
No layer was downloaded and no local or remote runtime state changed.

# Risks / Follow-ups

The image pin resolves only the local restore target; it does not satisfy the
database backup gate. A permanent verify-full Session pooler DSN, safe server
directory modes, validated CA/operator installation, fresh custom archive, real
restore, and zero-residue proof remain mandatory. The accepted production S3
defer is unchanged and is not a staging prerequisite.

The Docker tag can be republished for base-image rebuilds. Re-resolution is a
drift detector; immutable execution remains digest-only. If the accepted digest
becomes unavailable or PostgreSQL publishes a new minor before the live window,
stop and obtain a new reviewed pin rather than silently following the tag.
