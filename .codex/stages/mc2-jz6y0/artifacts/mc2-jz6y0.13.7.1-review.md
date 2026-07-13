---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.7.1-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The pin and future restore contract govern a production-data clone, secret handling, host exposure, and fail-closed cleanup.
repo: mc2
branch: codex/q12-pg17-restore-pin-review
base_branch: codex/q12-pg17-restore-pin
base_commit: 1e41adc240f69aff9ff9fd53b8b45c1cf6398fc2
reviewed_commit: cd20a12972cb2c8c682c2c084c346cd8a7962415
reviewed_range: 1e41adc240f69aff9ff9fd53b8b45c1cf6398fc2..cd20a12972cb2c8c682c2c084c346cd8a7962415
worktree: /home/me/code/mc2/.worktrees/q12-pg17-restore-pin-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-review.md
success_criteria:
  - Independently resolve the mutable tag, OCI index, and single linux/amd64 manifest through current primary sources without pulling or running the image.
  - Verify PostgreSQL 17.10 version/support semantics and the absence of an PostgreSQL 17 LTS designation.
  - Review digest-versus-tag, platform, source isolation, loopback, secret-file, PG17 compatibility, fail-closed restore, and zero-residue cleanup contracts.
  - Return NO-GO for any P0-P3 finding and leave all live or remote work deferred.
selected_docs:
  - PostgreSQL versioning policy - https://www.postgresql.org/support/versioning/
  - PostgreSQL 17.10 release notes - https://www.postgresql.org/docs/release/17.10/
  - Docker Official postgres image - https://hub.docker.com/_/postgres
  - Docker Official postgres 17/bookworm Dockerfile - https://raw.githubusercontent.com/docker-library/postgres/master/17/bookworm/Dockerfile
  - Docker Official postgres versions - https://raw.githubusercontent.com/docker-library/postgres/master/versions.json
  - Docker Hub tag metadata - https://hub.docker.com/v2/repositories/library/postgres/tags/17.10-bookworm
  - OCI Distribution manifest endpoint - https://registry-1.docker.io/v2/library/postgres/manifests/17.10-bookworm
selected_skills:
  - code-review
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
  - deploy_specialist perspective
catalog_candidates:
  - none - installed review and DevOps skills plus primary PostgreSQL, Docker Official Image, and OCI registry sources cover this bounded review
parallel_decision: sequential - independent review follows immutable research commit cd20a129
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: The immutable P1 finding is accepted and linked to correction 1da2a448 plus zero-finding rereview 0bbc50d2; its dedicated worktree is removed and no image layer, container, network, volume, port, secret, database session, or remote state was created.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: This review changes only its immutable artifact; the research artifact and future restore packet require correction before acceptance.
graph_reviewed: used
graph_review_notes: The existing local GRAPH_REPORT was read for orientation; this review-only artifact does not change durable code or documentation and does not justify a graph refresh.
verification:
  - Docker Registry HEAD/GET and Docker Hub tag metadata independently returned the expected index and single linux/amd64 child digest on 2026-07-13.
  - PostgreSQL primary versioning and 17.10 release sources confirmed current-minor and support semantics.
  - Docker Official source confirmed the PostgreSQL 17 image declares VOLUME /var/lib/postgresql/data and supports the reviewed 17.10 bookworm variant.
  - Research and review artifacts passed repository artifact validation.
  - Review artifact passed Prettier validation and repository process verification passed.
  - Git diff whitespace and immutable reviewed-commit checks passed.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-review.md
explicit_defers:
  - The permanent verify-full Session pooler DSN remains owner-provided and unavailable; no credential was sought or accessed.
  - Every Docker pull/run/create, SSH, Supabase, database, backup, restore, Qdrant, service, staging, production, deploy, and other live or remote action remains deferred to a separately authorized observed window.
  - The future restore packet must correct the P1 finding and receive independent re-review before any image pull or restore.
---

# Summary

## Findings-first verdict

**NO-GO / NEEDS_WORK. Findings: P0: 0, P1: 1, P2: 0, P3: 0.**

The mutable tag resolved consistently at `2026-07-13T08:07:25Z`. Registry
`HEAD`/`GET` and the Docker Hub tag API agreed on:

- OCI index:
  `sha256:5530681ea5d3e2ed4ce396f9b5cb443efbac6baf2a8a19c0c0635e40ae7eadce`;
- exactly one `linux/amd64` descriptor, manifest:
  `sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`.

The artifact correctly distinguishes mutable tag/index metadata from the exact
platform manifest that may eventually be pulled and run. PostgreSQL primary
sources also confirm that `17.10`, released 2026-05-14, is the current minor of
supported major 17 on 2026-07-13. PostgreSQL describes supported majors with a
five-year support policy; it does not designate PostgreSQL 17 as “LTS”.

The source-isolation, loopback-only publication, same-major client/server,
`--exit-on-error`, `--single-transaction`, secret-file, and cleanup intentions
are otherwise directionally correct. Acceptance is blocked because the PG17
storage mount needed to make zero-residue cleanup true is not pinned.

## P1 finding

### Q12-PG17-R1 — the contract can leave an anonymous volume containing the restored database

- **Repository evidence:**
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1.md:97` requires an
  “empty data volume” but does not bind it to an exact container path. Lines
  113-116 then require removal of the intended volume and proof of zero matching
  volumes.
- **Primary-image evidence:** the reviewed Docker Official PostgreSQL
  `17/bookworm` Dockerfile declares `VOLUME /var/lib/postgresql/data`. The
  Docker Official Image documentation separately warns that PostgreSQL 17 and
  below must mount persistent data at `/var/lib/postgresql/data`; a mount at the
  PostgreSQL 18+ parent layout does not cover that declared volume.
- **Failure mode:** a future packet can satisfy the prose by creating a unique
  named volume but mount it at the wrong path, or fail to attach it. Docker then
  supplies an anonymous volume at `/var/lib/postgresql/data`. Removing the
  container and the named volume does not by itself prove that anonymous volume
  was removed. The leftover can contain the complete restored production
  database, so this is a production-data residue boundary, not documentation
  polish.
- **Required correction:** pin an exact named-volume attachment to
  `/var/lib/postgresql/data`, assert the running container's destination/source
  mount identity before restore, and capture every container mount ID before
  teardown. Install cleanup traps before create; on success, failure, and
  signals remove the container plus the declared and discovered volume IDs, then
  prove no owned or anonymous mount remains. The future command packet should
  likewise render the mode-0600 password file as a read-only bind mounted
  secret and set `POSTGRES_PASSWORD_FILE` to that exact in-container path.

# Verification

The OCI registry bearer token was held only in a shell variable and was never
printed. No Docker image or layer was pulled. Registry response headers proved
that the tag is an OCI image index and that a direct request for the selected
child returns the same immutable OCI manifest digest. Docker Hub independently
returned the same index, one `linux/amd64` child, and
`last_pushed=2026-07-07T22:11:59.049668Z`.

Primary Docker source reported `version=17.10` with the `bookworm` variant and
the reviewed Dockerfile reported `PG_MAJOR 17`, `PG_VERSION 17.10-1.pgdg12+1`,
and `VOLUME /var/lib/postgresql/data`. Primary PostgreSQL versioning and release
pages supplied the version/support findings above.

Repository checks passed for both artifacts, Prettier, process verification,
whitespace, and the exact immutable reviewed commit. No live or remote check was
performed.

`docs-reviewed: no-change-needed` — this branch changes only the review
artifact; the parent must correct the restore contract and future packet.

`graph-reviewed: used` — the existing report was sufficient for orientation;
there is no graph-impacting implementation change to refresh.

# Delivery / Cleanup

Only this review artifact is changed. Commit `cd20a129` is not accepted. No
temporary runtime resource or secret was created, and no Docker, SSH, Supabase,
database, Qdrant, service, staging, production, or deploy action occurred.

# Risks / Follow-ups / Explicit Defers

- Correct Q12-PG17-R1 and obtain an independent rereview before using the pin in
  a future command packet.
- The permanent verify-full Session pooler DSN remains owner-provided and is not
  present in this review.
- Every image pull, restore, backup, remote observation, and live mutation
  remains deferred to a separately authorized observed window.
