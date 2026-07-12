---
schema_version: orchestration-artifact/v1
artifact_type: credential-discovery
task_id: mc2-jz6y0.13.7
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: mc2
branch: codex/q12-db-credential-discovery
base_branch: codex/self-hosted-qdrant-platform
base_commit: a65935ff77dd6c80fb695c7ed438c42685e6654f
worktree: /home/me/code/mc2/.worktrees/q12-db-credential-discovery
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-credential-discovery.md
selected_skills:
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none - the installed DevOps and verification assets cover this read-only audit
status: blocked
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: dedicated worktree remains for orchestrator inspection and integration; all audit containers used --rm and zero remained afterward
risk_level: high
verification:
  - exhaustive server search completed over the authorized source classes without remote writes
  - 16 unique candidates were deduplicated locally by full SHA-256; only 12-character non-secret identifiers are recorded
  - six syntactically complete external candidates were tested with verify-full, the supplied CA, a seven-second timeout, default_transaction_read_only=on, and SELECT 1 only
  - the only runtime-file candidate was rejected as a stale credential; zero candidates worked
  - no PostgreSQL URI was present in 36 relevant process environments or 12 relevant container environments
  - pre-existing postgres:16.14-alpine was used with pull disabled and automatic removal; zero audit containers remained
  - no raw connection string, password, token, candidate value, or child stderr was printed or persisted
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-credential-discovery.md
explicit_defers:
  - a new current Supabase Session pooler DSN must be supplied or rotated by an authorized owner before backup, restore, migrations, or Q12 activation
  - GitHub Actions secret values remain intentionally non-extractable and were not requested, changed, or copied
  - no backup run, restore, database write, secret update, file install, chmod, service restart, deploy, source recovery, or Qdrant action was performed
---

# Summary

The read-only search did not recover a working Supabase Session pooler
credential. The sole plausible credential in current server files is the old
`/opt/megacampus/.env.backup` value. Its locally calculated identifier is
`e1e8079edbcd`; both the Node TLS cross-check and the strict libpq check reject
it as `stale-credential`. No candidate returned `SELECT 1`, so this audit does
not unblock the backup/restore gate or any Q12 database migration.

Observation finished at `2026-07-12T23:03:19Z` from `megacampus-prod` over the
existing SSH target. Remote access was read-only. `sudo -n` was available, but
it was used only to read metadata/content and container/process configuration.

## Search coverage

The following classes were inspected. Only paths, metadata, variable names,
counts, redacted endpoint shapes, and non-secret fingerprints were retained.

| Source class | Read-only coverage | Result |
| --- | --- | --- |
| Runtime env/secrets | All `/opt/megacampus/.env*`, `/opt/megacampus/secrets`, backup inputs, release/deploy files and bounded repo tree | One old DB URI in `.env.backup`; active envs contain Supabase HTTP/API variables only |
| Services | Systemd unit/drop-in files plus every `EnvironmentFile=` reference | Only OS `/etc/default/ssh` and `/etc/default/networking`; no application DB environment file |
| Scheduled work | User/root cron files, `/etc/cron.d`, referenced backup/cleanup scripts and backup log | Daily legacy backup script references `.env.backup`; no second credential source |
| Runtime processes | All readable `/proc/*/environ`; names only retained | 36 processes had Supabase/API-named variables; zero PostgreSQL URI values |
| Containers | `docker inspect` for all 16 running/stopped containers; names only retained | 12 containers had Supabase/API-named variables; zero PostgreSQL URI values |
| Supabase CLI | `/root`, `/home`, `.supabase`, `.config/supabase`, `.pgpass` and service-file candidates | No Supabase CLI cache/config directory and no libpq credential file |
| Shell/profile | Root/user histories, profiles, bashrc and `/etc/environment` | One root history file existed; no DB URI or pooler match |
| Root filesystem | Bounded filename search for env/libpq/DB credential files, including Docker layers | No new value; one image-layer `.env.example` duplicates repo fingerprint `0b88701a0d53` |
| Repo/history | Current `/opt/megacampus/repo` plus all 6,290 Git commits | Only examples, local test URLs, historical pooler strings and historical direct-host strings |

Current runtime env metadata:

| Path | Owner | Mode | mtime UTC | DB result |
| --- | --- | --- | --- | --- |
| `/opt/megacampus/.env.backup` | `claude-deploy:claude-deploy` | `0600` | `2026-01-23T08:11:37Z` | fingerprint `e1e8079edbcd`, stale |
| `/opt/megacampus/.env.blue` | `claude-deploy:claude-deploy` | `0600` | `2026-07-04T17:05:02Z` | no PostgreSQL URI |
| `/opt/megacampus/.env.dev` | `claude-deploy:claude-deploy` | `0600` | `2026-07-04T15:16:07Z` | no PostgreSQL URI |
| `/opt/megacampus/.env.dev.qdrantfix.20260412131020.bak` | `claude-deploy:claude-deploy` | `0600` | `2026-04-12T11:10:20Z` | no PostgreSQL URI |
| `/opt/megacampus/.env.green` | `claude-deploy:claude-deploy` | `0600` | `2026-06-28T14:49:03Z` | no PostgreSQL URI |
| `/opt/megacampus/.env.production` | `claude-deploy:claude-deploy` | `0600` | `2026-07-04T17:05:00Z` | no PostgreSQL URI |
| `/opt/megacampus/scripts/backup_supabase.sh` | `claude-deploy:claude-deploy` | `0775` | `2026-01-23T08:05:21Z` | reads the old backup env |
| `/var/spool/cron/crontabs/claude-deploy` | `claude-deploy:crontab` | `0600` | `2026-01-25T10:09:55Z` | invokes legacy backup daily |
| `/root/.bash_history` | `root:root` | `0600` | `2025-12-16T18:11:44Z` | no credential match |

Candidate-bearing non-runtime files were examples or documentation:

| Path | Owner | Mode | mtime UTC | Class |
| --- | --- | --- | --- | --- |
| `/opt/megacampus/repo/packages/course-gen-platform/.env.example` | `claude-deploy:claude-deploy` | `0664` | `2026-03-20T17:43:12Z` | template |
| `/opt/megacampus/repo/packages/course-gen-platform/supabase/tests/SETUP_GUIDE.md` | `claude-deploy:claude-deploy` | `0664` | `2025-12-18T10:01:21Z` | local/test documentation |
| `/opt/megacampus/repo/packages/course-gen-platform/tests/README.md` | `claude-deploy:claude-deploy` | `0664` | `2025-12-18T10:01:21Z` | local/test documentation |
| `/opt/megacampus/repo/docs/archive/T044.11-FIX-REMAINING-TEST-ISSUES.md` | `claude-deploy:claude-deploy` | `0664` | `2026-03-20T17:43:11Z` | historical documentation |
| `/opt/megacampus/repo/docs/articles/ARTICLE-PROMPTS-FOR-DEVELOPERS.md` | `claude-deploy:claude-deploy` | `0664` | `2026-03-20T17:43:11Z` | malformed example |
| `/opt/megacampus/repo/docs/deployment/CLEANUP-JOB-DEPLOYMENT.md` | `claude-deploy:claude-deploy` | `0664` | `2026-03-20T17:43:11Z` | historical documentation |
| `/opt/megacampus/repo/specs/002-main-entry-orchestrator/T032-CLOUD-SUPABASE-MIGRATION.md` | `claude-deploy:claude-deploy` | `0664` | `2026-03-20T17:43:12Z` | template |
| `/opt/megacampus/repo/specs/005-stage-3-create/quickstart.md` | `claude-deploy:claude-deploy` | `0664` | `2026-03-20T17:43:12Z` | malformed example |
| `/var/lib/docker/overlay2/<layer>/diff/app/packages/course-gen-platform/.env.example` | `root:root` | `0664` | `2026-05-26T11:57:13Z` | duplicate template |

## Candidate disposition

Full candidate values were deduplicated on the local host with SHA-256. The
table exposes only the first 12 hexadecimal characters of each digest. Six of
16 unique strings were syntactically complete external PostgreSQL URIs; the
remaining ten were malformed, explicit templates, localhost URLs, or an
internal Compose service URL and were not possible current Session pooler
credentials.

| Fingerprint | Redacted endpoint | Source class | Result |
| --- | --- | --- | --- |
| `e1e8079edbcd` | `aws-1-us-east-2.pooler.supabase.com:5432/postgres` | current backup env | `stale-credential` |
| `2c74e219e9d4` | same pooler shape | Git history only | `stale-credential` |
| `7cf6add60e23` | same pooler shape | Git history only | `stale-credential` |
| `0b88701a0d53` | same pooler shape | current example plus Git history | template; endpoint rejected it, not a credential |
| `f3a1ca3e355b` | `db.<project-ref>.supabase.co:5432/postgres` | documentation plus Git history | direct endpoint unavailable from local host; not a Session pooler credential |
| `f7e0e95a63a6` | `db.<project-ref>.supabase.co:5432/postgres` | documentation plus Git history | direct endpoint unavailable from local host; not a Session pooler credential |
| ten other digests | malformed/local/internal | examples and Git history | `malformed-or-template` |

Totals: `working=0`, `stale-credential=3`, `template/other endpoint rejection=1`,
`network/direct-endpoint unavailable=2`, `tls-or-hostname=0`, and
`malformed/local/internal=10`.

# Verification

The supplied CA at
`/mnt/c/Users/masle/Downloads/prod-ca-2021.crt` parsed successfully as the
Supabase Root 2021 CA. Its SHA-256 certificate fingerprint is
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`;
the validity window is `2021-04-28T10:56:53Z` through
`2031-04-26T10:56:53Z`. This public certificate was read locally and never
copied to the server.

The authoritative validation used the already-present
`postgres:16.14-alpine` image with `--pull=never`, `--rm`, host networking and a
read-only CA mount. Candidate host, port, role, password and database were
decoded locally, base64-framed only for transport over container stdin, and
placed into libpq environment variables inside the transient process. No
candidate appeared in Docker configuration or command arguments.

Every complete external candidate used:

- `PGCONNECT_TIMEOUT=7`;
- `PGSSLMODE=verify-full`;
- `PGSSLROOTCERT=/ca/prod-ca-2021.crt`;
- `PGOPTIONS=-c default_transaction_read_only=on`;
- `psql -XAtq -v ON_ERROR_STOP=1` with exactly `SELECT 1`.

Raw stdout was accepted only when it was exactly `1`; raw stderr was captured
for classification and never printed. A separate local `pg` 8.16.3 TLS check
used the same CA, hostname verification, seven-second timeout, read-only startup
option and exact query. It agreed that the three pooler-shaped non-template
credentials are stale and classified the two historical direct-host candidates
as network-unavailable. After libpq validation, the count of remaining audit
containers was zero.

No candidate value was written to disk. The remote generator streamed values
directly to the local validator; only local digest IDs, redacted endpoints,
source metadata and status classes reached this artifact.

# Risks / Follow-ups

The database gate remains blocked for one concrete reason: there is no current
working Session pooler credential on the server, in its process/container
configuration, in Supabase CLI caches, in shell history, or in the checked repo
history. The active application can still use Supabase HTTP APIs because those
keys are a different credential class; they cannot authenticate `pg_dump`,
`pg_restore`, migrations or direct SQL.

An authorized Supabase owner must provide or rotate a current Session pooler
DSN through the approved owner-only secret channel. Once available, repeat this
same read-only verify-full `SELECT 1` check, then satisfy the already accepted
backup gate: safe backup-directory ownership/mode, reviewed operator install,
fresh custom-format dump, archive validation and isolated restore drill. Until
all of those pass, do not partially activate migrations, source recovery,
reindex, Qdrant cutover, services or secrets.

No server file, cron entry, secret, service, container, database row, backup,
source file, Qdrant object or external S3 resource was created, modified, moved
or deleted by this audit.
