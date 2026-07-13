---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.7.1-rereview
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: This rereview closes a production-data residue finding across exact Docker mount identity, secret isolation, source separation, and fail-closed teardown.
repo: mc2
branch: codex/q12-pg17-restore-pin-rereview
base_branch: codex/q12-pg17-restore-pin
base_commit: cd20a12972cb2c8c682c2c084c346cd8a7962415
reviewed_commit: 1da2a448
reviewed_range: cd20a12972cb2c8c682c2c084c346cd8a7962415..1da2a448
resolves_review: 2e736067
worktree: /home/me/code/mc2/.worktrees/q12-pg17-restore-pin-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-rereview.md
success_criteria:
  - Independently rereview correction 1da2a448 against immutable P1 review 2e736067.
  - Require exact PostgreSQL 17 named-volume and canonical read-only password-bind contracts before production data is read.
  - Require loopback source separation, pre-create cleanup traps, captured mount IDs, scoped idempotent removal, and cleanup failure overriding restore success.
  - Accept only with P0, P1, P2, and P3 all zero and preserve the reviewed tag, index, and linux/amd64 manifest.
selected_docs:
  - immutable research artifact mc2-jz6y0.13.7.1.md
  - immutable P1 review mc2-jz6y0.13.7.1-review.md at 2e736067
  - Docker Official postgres 17/bookworm Dockerfile - https://raw.githubusercontent.com/docker-library/postgres/master/17/bookworm/Dockerfile
  - Docker Official postgres image - https://hub.docker.com/_/postgres
  - PostgreSQL versioning policy - https://www.postgresql.org/support/versioning/
  - PostgreSQL 17.10 release notes - https://www.postgresql.org/docs/release/17.10/
selected_skills:
  - code-review
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
  - deploy_specialist perspective
catalog_candidates:
  - none - installed review and DevOps skills plus the immutable primary-source evidence cover this bounded rereview
parallel_decision: sequential - rereview follows immutable correction commit 1da2a448
status: returned
delivery_method: cherry-pick
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: All checks were read-only; no image, layer, container, volume, network, port, secret, database session, temporary runtime resource, or remote/live state was created.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: This branch changes only its immutable rereview artifact; future runbooks and the exact execution packet must consume the accepted correction contract.
graph_reviewed: used
graph_review_notes: The existing local GRAPH_REPORT was read for orientation; a review-only artifact does not justify graph refresh.
verification:
  - The correction range contains only mc2-jz6y0.13.7.1-correction.md and git diff whitespace validation passed.
  - Research artifact and immutable review hashes match their reviewed commits; the tag, index, and linux/amd64 manifest values are unchanged.
  - Research, correction, immutable review, and rereview artifacts passed repository artifact validation.
  - The rereview artifact passed Prettier validation and repository process verification passed.
  - Post-commit git show, exact-parent, exact-file, clean-worktree, and remote-tracking checks complete before delivery.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-rereview.md
explicit_defers:
  - The permanent verify-full Session pooler DSN remains owner-provided and unavailable; no credential was sought or accessed.
  - Every Docker pull/run/create, SSH, Supabase, database, backup, restore, Qdrant, service, staging, production, deploy, and other live or remote action remains deferred to a separately authorized observed window.
  - The accepted documentation contract still requires an exact executable packet and observed zero-residue proof before migration or activation.
---

# Summary

## Findings-first verdict

**PASS / ACCEPT. Findings: P0: 0, P1: 0, P2: 0, P3: 0.**

P1 finding `Q12-PG17-R1` from immutable review `2e736067` is closed by the
forward-only correction. The correction makes the Docker Official PostgreSQL 17
data destination, secret destination, mount inspection, and teardown proof hard
preconditions rather than implementation choices. No historical artifact was
rewritten.

## Closed-finding evidence

### Q12-PG17-R1 — CLOSED

- **Exact data mount:** correction lines 54-59 require exactly one named volume
  at `/var/lib/postgresql/data`. Lines 72-74 prohibit the PostgreSQL 18 parent
  path, anonymous data volumes, host data binds, and extra data mounts. This
  covers the Docker Official PostgreSQL 17 `VOLUME /var/lib/postgresql/data`
  declaration and prevents Docker from supplying an implicit anonymous PGDATA
  volume.
- **Pre-restore identity:** lines 78-84 require, before readiness or restore,
  exactly one writable `volume` mount at the PG17 destination with the recorded
  named source, exactly one read-only `bind` at the secret destination, and a
  hard stop before production data is read on any mismatch. Every mount
  source/ID is captured before restore.
- **Canonical secret bind:** lines 61-64 and 75-83 require a mode-0600,
  owner-only canonical regular non-symlink host file, a read-only bind at
  `/run/secrets/mc2_pg_password`, and
  `POSTGRES_PASSWORD_FILE=/run/secrets/mc2_pg_password`. Copying the password
  into the container is forbidden, as are password values in argv, logs,
  tracked files, artifacts, or image layers.
- **Source and port isolation:** lines 84-87 require only the accepted digest,
  a kernel-assigned `127.0.0.1` port with no wildcard/public binding, and a
  restore DSN that names only that loopback endpoint and never the Supabase
  source hostname.
- **Fail-closed cleanup:** lines 68-71 install success, failure, interrupt, and
  termination traps before the first Docker create operation and bind all owned
  resource names to a collision-resistant run ID. Lines 88-94 remove the
  container with anonymous volumes, then the recorded network, named volume,
  secret file, and temporary directory. Removal is idempotent and restricted to
  pre-recorded run identities; every captured mount ID must be absent, and any
  cleanup error overrides restore success.

Together, the explicit PG17 destination and pre-restore mount assertion prevent
anonymous production-data residue from being created in the normal contract.
Capturing every mount source plus removing container anonymous volumes and the
named data volume makes unexpected residue fail the gate instead of being
silently accepted.

## Preserved image pin and history

The correction retains the original values exactly:

- drift-detection tag: `postgres:17.10-bookworm`;
- OCI index:
  `sha256:5530681ea5d3e2ed4ce396f9b5cb443efbac6baf2a8a19c0c0635e40ae7eadce`;
- runtime `linux/amd64` manifest:
  `postgres@sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`.

The `cd20a129..1da2a448` range adds only the correction artifact. The research
artifact SHA-256 matches its `cd20a129` blob, and the external review file
SHA-256 matches commit `2e736067`. A new mutable-tag registry lookup was not
needed: this rereview verifies correction semantics and preservation of the
same-day immutable primary-source evidence, while the contract still requires
tag re-resolution as a drift stop immediately before live use.

# Verification

Repository artifact validation passed for the research, correction, immutable
review, and this rereview. Prettier reported the rereview formatted, process
verification reported `orchestration contract OK`, and `git diff --check`
passed. The correction range contained exactly one added correction artifact;
the rereview branch contains only this review artifact on top of `1da2a448`.

The current research artifact and its `cd20a129` blob both hashed to
`1284abc2d23c258c367a28c378a96f0bcddf04195036d5964dc26bf5cb42d150`.
The external immutable review and its `2e736067` blob both hashed to
`1995018352e36522af0505ce701d252232e84e80ad7f6d8c98eed47626b42c32`.
No Docker image or layer was pulled, and no runtime or remote action was taken.

`docs-reviewed: no-change-needed` — only this rereview artifact changes; the
accepted correction remains the source for future runbook and packet updates.

`graph-reviewed: used` — the existing report was sufficient for orientation;
there is no implementation or architecture change to refresh.

# Delivery / Cleanup

Only this immutable rereview artifact changes. No temporary symlink or runtime
resource was needed. Acceptance covers the documentation contract at
`1da2a448`; it does not authorize or claim a live restore.

# Risks / Follow-ups / Explicit Defers

- The future executable restore packet must implement these exact invariants and
  receive its own review before execution.
- The permanent verify-full Session pooler DSN remains owner-provided and absent.
- Every image pull, backup, restore, remote observation, and live mutation
  remains deferred to a separately authorized observed window.
