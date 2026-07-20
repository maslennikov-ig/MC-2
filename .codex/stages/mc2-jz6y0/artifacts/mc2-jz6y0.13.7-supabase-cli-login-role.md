---
schema_version: orchestration-artifact/v1
artifact_type: docs-research
task_id: mc2-jz6y0.13.7
stage_id: mc2-jz6y0
agent_type: docs_researcher
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 71a4b14d433e19729fdb1af646fecd88a80e7827
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-supabase-cli-login-role.md
selected_skills:
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - docs_researcher
  - deploy_specialist perspective
catalog_candidates:
  - none - installed DevOps and verification assets plus first-party sources cover the question
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: accepted research created no local runtime residue; the generated Supabase project-link directory was inspected and removed, while the requested user-scoped CLI login remains available
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: the existing runbooks remain correct to require a current owner-supplied Session pooler DSN for the accepted operator; document a JIT alternative only if separately designed and approved
verification:
  - installed Supabase CLI reported exact version 2.106.0 with telemetry disabled
  - installed db dump and login help were inspected without a network request
  - exact v2.106.0 tagged CLI source and generated OpenAPI contract were inspected from the official Supabase repository
  - PostgreSQL 17 pg_dump, pg_restore, backup, and libpq TLS documentation were checked against the remote PostgreSQL 17.6 target
  - deploy/postgres/backup-supabase.sh was inspected end to end without reading any credential value
  - no live dump, login-role creation, SQL, database connection, token read, password read, or remote mutation was performed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-supabase-cli-login-role.md
explicit_defers:
  - the accepted backup operator still requires a current owner-only Session pooler DSN; browser login alone does not satisfy the gate
  - a JIT login-role backup path would change accepted semantics and requires a separate threat model, TDD implementation, independent review, and explicit authorization for the remote login-role mutation
  - the server must prove that /usr/bin/pg_dump and /usr/bin/pg_restore are PostgreSQL 17 clients before the unchanged operator can run against PostgreSQL 17.6
---

# Summary

**Verdict: Supabase CLI browser authentication alone cannot satisfy the
accepted `.13.7` custom-format backup and isolated-restore gate without changing
the operator.** Browser login authenticates the CLI to the Management API; it
does not produce a reusable database password or Session pooler DSN. In the
passwordless linked-project path, CLI 2.106.0 instead asks a beta Management API
endpoint to create a temporary database login role. That endpoint is a remote
database mutation guarded by `database:write`, not a read-only consequence of
browser login.

The temporary-role contract returns `role`, `password`, and a dynamic
`ttl_seconds`. The CLI's tagged tests use `300` seconds, but neither the
OpenAPI contract nor CLI code promises a fixed five-minute production lifetime;
the returned TTL is authoritative. CLI 2.106.0 does not use that TTL to budget
or abort a dump. It requests `read_only: false`, retains the generated password
only in its in-memory connection configuration, and does not expose a supported
command that emits the credential for an external `pg_dump`.

The generated login role is privileged through role switching rather than
direct login as `postgres`. The CLI source recognizes `cli_login_` users and
runs `SET SESSION ROLE postgres` after connecting. Supabase's first-party
backup/restore guide records the corresponding `GRANT "postgres" TO
"cli_login_postgres" WITH INHERIT FALSE GRANTED BY "supabase_admin"` shape.
That is adequate for the CLI's own dump scripts when provisioning works, but it
is not a durable credential contract for the repo operator.

## Consulted first-party sources

Checked on 2026-07-13:

- Supabase CLI `2.106.0` tagged source:
  [browser login](https://github.com/supabase/cli/blob/v2.106.0/apps/cli-go/internal/login/login.go),
  [linked DB/JIT role flow](https://github.com/supabase/cli/blob/v2.106.0/apps/cli-go/internal/utils/flags/db_url.go),
  [session role switching](https://github.com/supabase/cli/blob/v2.106.0/apps/cli-go/internal/utils/connect.go),
  [dump runner](https://github.com/supabase/cli/blob/v2.106.0/apps/cli-go/internal/db/dump/dump.go),
  [dump environment](https://github.com/supabase/cli/blob/v2.106.0/apps/cli-go/pkg/migration/dump.go), and
  [generated Management API contract](https://github.com/supabase/cli/blob/v2.106.0/packages/api/src/generated/openapi.json).
- Supabase current
  [CLI reference](https://supabase.com/docs/reference/cli/supabase-orgs-list),
  [Management API authentication](https://supabase.com/docs/reference/api/getting-started),
  [create-login-role endpoint](https://supabase.com/docs/reference/api/v1-create-login-role),
  [backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and
  [passwordless-role troubleshooting](https://supabase.com/docs/guides/troubleshooting/supabase-cli-failed-sasl-auth-or-invalid-scram-server-final-message).
- PostgreSQL 17
  [`pg_dump`](https://www.postgresql.org/docs/17/app-pgdump.html),
  [`pg_restore`](https://www.postgresql.org/docs/17/app-pgrestore.html),
  [logical backup/restore](https://www.postgresql.org/docs/17/backup-dump.html), and
  [libpq TLS parameters](https://www.postgresql.org/docs/17/libpq-connect.html).

## Why the stock CLI dump is not the accepted backup

`supabase db dump --linked` runs PostgreSQL tooling in the CLI-configured Docker
image. Its normal modes produce separate, filtered, plain SQL artifacts:

- default: schema-only, excludes Supabase-managed/internal schemas;
- `--data-only`: separately filtered data SQL;
- `--role-only`: separately filtered roles SQL.

It has no `-Fc`/custom-archive option. Therefore, even if the temporary role is
successfully provisioned, stock `supabase db dump` does not produce the one
full custom archive required by `.13.7`, nor does it perform the accepted
nontrivial-size, TOC, full offline traversal, fsync, atomic publication, and
isolated transactional restore gates.

## Compatibility with `deploy/postgres/backup-supabase.sh`

The operator does **not** work unchanged with the CLI temporary role. It
requires an owner-only one-line URL file containing the database credential,
exact `sslmode=verify-full`, and the approved `sslrootcert` path. It then calls
fixed `/usr/bin/pg_dump` and `/usr/bin/pg_restore`. The CLI keeps the JIT
password in its own process and offers no supported secret hand-off to that
file contract.

With a normal current Session pooler DSN, the script can remain unchanged only
after the server proves both fixed binaries are PostgreSQL **17.x** clients.
PostgreSQL documents that `pg_dump` refuses a server newer than its own major
version. A PostgreSQL 16 client is therefore invalid for the PostgreSQL 17.6
source. PostgreSQL 18 can read a PostgreSQL 17 source, but output is not
guaranteed to load into the older PostgreSQL 17 restore target. Use a current
patched PostgreSQL 17 client pair; exact 17.6 is compatible, and a later 17.x
minor is preferable when operationally available. Use the same major for
`pg_dump`, archive validation, and the isolated `pg_restore` drill.

# Verification

Local read-only evidence:

```text
Supabase CLI: 2.106.0
db dump flags: linked/local/db-url, schema/data/role modes; no custom-format flag
login flags: browser flow, no-browser, or supplied Management API token
```

The installed CLI help matched the `v2.106.0` source. The generated OpenAPI
contract describes `POST /v1/projects/{ref}/cli/login-role` as beta, requires
`database:write`, accepts `read_only`, and returns a required positive
`ttl_seconds`. `initLoginRole` sends `read_only: false`; the pooler flow retries
authentication, while the general connection path changes the session to role
`postgres` for `cli_login_` users.

The accepted operator was inspected end to end. Its credential is passed to
`pg_dump` through `PGDATABASE`, never argv; its CA is bound through a stable
inherited file descriptor; `pg_restore --list` and the offline full traversal
receive no database credential. No secret value, access-token file, generated
password, DSN content, or child diagnostic was read or printed during this
research.

## Secret-safe command design for the accepted path

For the current accepted design, keep connection material out of argv and let
the reviewed operator own dump creation:

```bash
sudo -u claude-deploy env \
  SUPABASE_BACKUP_URL_FILE=/opt/megacampus/secrets/supabase_db_url \
  SUPABASE_BACKUP_CA_FILE=/opt/megacampus/secrets/prod-ca-2021.crt \
  SUPABASE_BACKUP_DIR=/opt/megacampus/backups/supabase \
  /opt/megacampus/scripts/backup-supabase.sh
```

The URL file must be owner-only and contain exactly one percent-encoded Session
pooler URI with `sslmode=verify-full` and the exact CA path. For the separately
approved disposable PostgreSQL 17 restore target, use an owner-only libpq
service file rather than a password-bearing URI in argv:

```bash
PGSERVICEFILE=/opt/megacampus/secrets/pg_service.conf \
PGSSLMODE=verify-full \
PGSSLROOTCERT=/opt/megacampus/secrets/prod-ca-2021.crt \
/usr/bin/pg_restore \
  --exit-on-error \
  --single-transaction \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname='service=megacampus_restore' \
  /opt/megacampus/backups/supabase/supabase-YYYYMMDDTHHMMSSZ-PID.dump
```

`verify-full` verifies both the CA chain and requested hostname; `sslrootcert`
names the trusted CA file. The restore target must be isolated and disposable,
created from `template0`, and must never be the source/staging database.

# Risks / Follow-ups

The exact blocker is unchanged: a current owner-supplied Session pooler DSN is
still required for the reviewed operator. Successful browser login only
unlocks Management API calls. It does not turn the temporary CLI role into a
durable, supported secret input for `.13.7`.

A JIT-aware alternative is technically designable, but it is new behavior, not
an operational shortcut. It would need to call the beta create-login-role API,
honor the returned TTL, keep the generated password in an anonymous FD or
equivalent memory-only channel, run PostgreSQL 17 `pg_dump -Fc --role=postgres`
within a conservative TTL budget, fail closed if the budget is insufficient,
delete/revoke login roles, and retain every current archive/publication/restore
check. The API call itself mutates remote database authentication state and
requires `database:write`; this research neither authorizes nor performs it.

Promote this result to the existing `.13.7` Beads notes. Do not change the
current runbooks. If the product owner chooses JIT credentials instead of a
normal DSN, create a separate Beads implementation/review stream and update the
runbooks only after TDD, privilege/TTL failure testing, independent security
review, and an explicitly authorized live proof.
