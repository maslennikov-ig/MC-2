---
schema_version: orchestration-artifact/v1
artifact_type: correction
task_id: mc2-jz6y0.13.7.1-correction
stage_id: mc2-jz6y0
agent_type: root_orchestrator
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: mc2
branch: codex/q12-pg17-restore-pin
base_branch: codex/self-hosted-qdrant-platform
base_commit: cd20a12972cb2c8c682c2c084c346cd8a7962415
resolves_review: 2e736067
worktree: /home/me/code/mc2/.worktrees/q12-pg17-restore-pin
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-correction.md
selected_skills:
  - superpowers:receiving-code-review
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - root orchestrator - bounded correction after independent finding
catalog_candidates:
  - none - immutable review and Docker Official PostgreSQL 17 source define the correction
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: documentation-only correction created no image, container, volume, network, port, secret, database session, or temporary runtime resource
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: both operations runbooks and the replacement execution packet consume the exact mount, inspection, trap, and zero-residue contract after independent zero-finding rereview
graph_reviewed: used
graph_review_notes: existing report was read; integration refresh follows accepted durable documentation changes
verification:
  - immutable review 2e736067 and Docker Official PostgreSQL 17 bookworm VOLUME path were checked before writing the correction
  - correction pins the only PostgreSQL data mount and the read-only secret bind to exact destinations
  - correction installs cleanup before create, verifies mounts before restore, and proves removal on success, failure, and signals
  - no Docker pull, run, create, SSH, Supabase, credential, database, service, Qdrant, staging, or production operation was performed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-correction.md
explicit_defers:
  - integration Graphify refresh remains closeout-owned after accepted durable documentation changes
  - the permanent Session pooler DSN and every live backup/restore/server action remain external gates
---

# Summary

This forward-only correction closes P1 finding `2e736067` without rewriting the
research or review artifacts. The accepted PostgreSQL 17 restore packet treats
mount identity as a hard pre-restore invariant, not a cleanup suggestion.

For run ID `<run_id>`, create exactly one named data volume owned by that run and
attach it to the Docker Official PostgreSQL 17 path:

```text
type=volume,src=mc2-pg17-restore-<run_id>,dst=/var/lib/postgresql/data
```

The mode-0600 host password file must be attached separately as a read-only bind
at `/run/secrets/mc2_pg_password`, with
`POSTGRES_PASSWORD_FILE=/run/secrets/mc2_pg_password`. The password must never
appear in argv, logs, tracked files, artifacts, or an image layer.

## Mandatory future runtime invariants

1. Install success, failure, interrupt, and termination cleanup traps before the
   first Docker create operation. Generate a collision-resistant run ID and use
   it in the container, network, data-volume, secret-file, and temporary-path
   names. Refuse any pre-existing owned name.
2. Create the named data volume explicitly, record its full name/ID, and mount
   it only at `/var/lib/postgresql/data`. Do not use a PostgreSQL 18 parent path,
   an anonymous data volume, a host data bind, or an additional data mount.
3. Bind the password file read-only to `/run/secrets/mc2_pg_password`. Before
   container start, require owner-only host metadata and a canonical regular
   non-symlink file. Do not copy the secret into the container filesystem.
4. After create and before readiness or restore, inspect the container and
   require exactly one `volume` mount at `/var/lib/postgresql/data`, whose source
   is the recorded named volume and whose write mode is enabled. Require exactly
   one `bind` mount at `/run/secrets/mc2_pg_password`, whose source is the
   canonical expected secret file and whose write mode is disabled. Any other
   mount at either destination is a hard stop before production data is read.
5. Record every container mount source/ID before restore. Run only the accepted
   digest, bind its server port to a kernel-assigned `127.0.0.1` port, and prove
   there is no wildcard/public binding. The restore DSN must name only that
   loopback endpoint and must never reuse the Supabase source hostname.
6. On success, failure, or signal, remove the container with its anonymous
   volumes, then remove the recorded network, named data volume, password file,
   and owned temporary directory. Cleanup must be idempotent and may delete only
   resources whose exact run identity was recorded before use.
7. Before the backup gate can pass, prove that the container, network, expected
   volume, every captured mount source/ID, loopback port, password file, and
   owned temporary path are absent. A cleanup error overrides restore success.

The original image selection remains unchanged:

- tag for drift detection: `postgres:17.10-bookworm`;
- OCI index:
  `sha256:5530681ea5d3e2ed4ce396f9b5cb443efbac6baf2a8a19c0c0635e40ae7eadce`;
- exact runtime `linux/amd64` manifest:
  `postgres@sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`.

# Verification

The correction was checked against the immutable P1 evidence and the Docker
Official PostgreSQL `17/bookworm` declaration
`VOLUME /var/lib/postgresql/data`. It distinguishes the writable named data
volume from the read-only password bind, requires container mount inspection
before any production archive is read, and makes cleanup failure a blocking
result.

The contract remains documentation only. It did not pull an image, create a
Docker resource, access a password, connect to PostgreSQL or Supabase, or touch
the approved server.

# Risks / Follow-ups

Independent rereview returned zero findings, and the accepted runbooks and sole
PG17 execution packet consume this contract. The immutable digest is still only
a prepared restore target: the permanent verify-full Session pooler DSN, safe
server modes, CA/operator installation, fresh archive, live isolated restore,
and zero-residue proof remain mandatory before any migration or Qdrant
activation.
