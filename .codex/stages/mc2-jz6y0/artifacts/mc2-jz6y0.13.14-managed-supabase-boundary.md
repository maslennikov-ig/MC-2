---
schema_version: orchestration-artifact/v1
artifact_type: decision-evidence
task_id: mc2-jz6y0.13.14
stage_id: mc2-jz6y0
agent_type: docs_researcher
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The decision controls whether the live database barrier may claim a complete structural-DDL exclusion boundary on managed Supabase.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 35101aed8843ce2c32806d4efc20562e306e1576
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.14-managed-supabase-boundary.md
success_criteria:
  - Reconcile the approved Q12 barrier with current PostgreSQL 17, Supabase, and Supautils behavior.
  - Distinguish the tenant/client DDL fence from the provider superuser, reserved-role, shared-object, and background-worker plane.
  - Present one exact owner decision without authorizing any live mutation.
selected_docs:
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - https://supabase.com/docs/guides/database/postgres/event-triggers
  - https://github.com/supabase/supautils/tree/v3.2.2
  - https://www.postgresql.org/docs/17/event-trigger-definition.html
  - https://www.postgresql.org/docs/17/event-trigger-matrix.html
  - https://www.postgresql.org/docs/17/functions-admin.html
  - https://www.postgresql.org/docs/17/bgworker.html
selected_skills:
  - senior-devops
  - senior-architect
selected_agents:
  - docs_researcher
catalog_candidates:
  - none - installed skills and first-party sources cover the decision
parallel_group: W-source-truth
depends_on_streams:
  - mc2-jz6y0.13.10 local candidate implementation and independent review
parallel_decision: sequential
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: Read-only research produced no worktree, remote state, database mutation, or disposable runtime.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: The approved base specification remains unchanged; the owner-approved trust boundary is normative in the recoverable-lifecycle addendum.
graph_reviewed: no-change-needed
graph_review_notes: The decision is based on version-sensitive first-party behavior and read-only source capability probes, not repository architecture discovery.
verification:
  - approved design SHA-256 5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15 rechecked unchanged
  - current Supabase Event Trigger documentation reviewed
  - Supautils v3.2.2 privileged-role event-trigger behavior reviewed
  - PostgreSQL 17 event-trigger behavior, firing matrix, backend signaling, and background-worker boundaries reviewed
  - source PostgreSQL 17.6 capability and session inventory read in BEGIN READ ONLY and rolled back
  - source Supautils privileged and reserved role settings read in BEGIN READ ONLY and rolled back
  - canonical structural query returned one 64-hex hash and identical results under two fixed search paths in BEGIN READ ONLY and rolled back
  - owner accepted recommended option 1 in the current task on 2026-07-13
  - Supautils v3.2.2 tag commit 64792e14681bba81c9adccdcfd598715cd052eb5 rechecked from the first-party repository
  - recoverable-lifecycle addendum SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27
  - independent lifecycle docs rereview passed with P0=P1=P2=P3=0
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.14-managed-supabase-boundary.md
  - docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md
  - docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md
explicit_defers:
  - GHCR, server, Supabase, Qdrant, service, secret, schema, role, event-trigger, and deployment mutations remain governed by the existing Q12 remote gate; this decision authorizes none of them by itself.
---

# Summary

The approved Q12 correction design remains unchanged at SHA-256
`5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`.
Current first-party product truth adds one boundary that the design could not
infer from the tenant credential alone.

Hosted Supabase lets its non-superuser `postgres` role create and manage event
triggers through Supautils. A run-bound `ddl_command_start` trigger can therefore
reject ordinary concurrent local DDL unless the same session proves the Q12
database capability. PostgreSQL 17 rolls the attempted DDL back when that start
trigger raises. This closes the concrete concurrent `ALTER FUNCTION`, `ALTER
TYPE`, local `COMMENT`, local `GRANT`/`REVOKE`, and similar tenant/client races
identified by the structural review. The trigger is durable across process and
host restarts, so a crash after the atomic guard commit leaves a recoverable
fail-closed tenant/client barrier.

It is not a literal fence around the managed provider plane:

- PostgreSQL event triggers do not cover shared-object DDL for databases,
  roles, or tablespaces, and do not cover commands targeting event triggers;
- Supautils privileged-role event triggers are skipped for superusers and
  reserved roles, and have documented privileged-operation exclusions;
- a tenant `postgres` role cannot terminate a `supabase_admin` superuser
  backend;
- background workers may be admitted independently of normal connection
  controls.

Read-only source probes confirmed that this project runs PostgreSQL 17.6, the
supplied `postgres` login is not a superuser, `supabase_admin` is a managed
superuser with active service sessions, seven existing Supabase-owned event
triggers must remain structurally identical, and the current Supautils
privileged/reserved-role configuration matches the documented model. No query
returned application rows, credentials, connection values, or catalog payload
contents.

The strongest in-scope W candidate is therefore:

1. one atomic mutation transaction creates the complete row/TRUNCATE guard,
   immutable run truth, cron/net barrier, and run-bound event trigger;
2. after event-trigger visibility, ordinary client backends are terminated and
   exact managed `supabase_admin` clients are accepted only when idle and
   transaction-free;
3. a second full-lock, full-hash verification closes pre-visibility tenant DDL;
4. an idempotent same-command resume proves exact stored/file-backed truth
   before any termination or setting mutation;
5. activation retains immutable run truth and the event trigger through the
   no-start handoff verification; cleanup or rollback removes it only under the
   same capability before writer resume and the full live observation.

## Owner decision

On 2026-07-13 the owner explicitly accepted the recommended first option in the
current task. The Q12 barrier is therefore complete for the tenant/client plane,
while the Supabase internal superuser, reserved-role, and background-worker
plane is an accepted trusted provider boundary that will not perform structural
DDL during the controlled Q12 window. Documentation and receipts must use this
precise wording and must not claim control of the provider superuser.

The normative record is
`docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md`
at SHA-256
`7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`.

The alternative `ALLOW_CONNECTIONS=false` plus a separate control database,
recovery login, ownership transfer, secret, and systemd recovery unit is not
recommended here. It materially expands the approved scope, creates a new
credential and full database/API outage, and still cannot exclude provider
superusers or bypass-capable background workers.

# Verification

- The Supabase Event Trigger guide explicitly documents automatic Supautils
  availability and `postgres` event-trigger management in hosted projects.
- Supautils v3.2.2 documents that privileged-role triggers execute for
  non-superusers but are skipped for superusers and reserved roles.
- PostgreSQL 17 documents both the local DDL firing matrix and the exclusions
  for shared objects and event-trigger DDL.
- PostgreSQL 17 documents that only a superuser can terminate another
  superuser backend.
- Read-only source probes proved the exact role/session/Supautils facts above
  and ended with `ROLLBACK`.
- The current shared structural query parsed on the source, returned exactly
  one row with a 64-hex digest, preserved all seven pre-existing event triggers,
  and produced the same digest under `search_path=pg_catalog` and
  `search_path=pg_catalog,q12_guard`.

# Risks / Follow-ups

The residual risk is a provider-controlled or deliberately bypassing
administrator changing shared or local structure during the migration window.
No tenant-side SQL mechanism can truthfully eliminate a provider superuser
boundary. The accepted option treats that plane as trusted and still requires
exact before/after structural hashes, idle managed-session proof, local
event-trigger enforcement, table locks, migration-history locks, and a hard
stop on any observed drift. Remote activation remains separately gated; this
decision permits safe local implementation but no partial live activation.
