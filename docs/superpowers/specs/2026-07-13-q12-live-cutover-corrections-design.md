# Q12 Live Cutover Corrections Design

| Field  | Value                                                                     |
| ------ | ------------------------------------------------------------------------- |
| Date   | 2026-07-13                                                                |
| Beads  | `mc2-jz6y0.13.7.2`, `mc2-jz6y0.13.8`, `mc2-jz6y0.13.9`, `mc2-jz6y0.13.10` |
| Status | written specification awaiting owner review                               |
| Parent | `2026-07-10-self-hosted-qdrant-platform-design.md`                        |

## Purpose

Close the live-only gaps discovered before Q12 mutation without weakening
backup truth, restore fidelity, role/ACL semantics, writer isolation, release
identity, or rollback:

1. restore the real Supabase PostgreSQL 17.6 archive into an extension- and
   role-compatible isolated target;
2. replace prose-only live steps with an exact fail-closed executor;
3. publish the release-SHA Qdrant operator without implicitly deploying the
   application;
4. quiesce and resume the actual Docker Compose writers instead of nonexistent
   systemd units; and
5. hold one fail-closed write barrier across backup, restore drill, migrations,
   recovery, reindex, cutover, and observation.

On 2026-07-13, after being told that the Session pooler password had appeared in
chat, the owner explicitly authorized its temporary use for this staging task
and stated that it would be changed afterward. That risk decision does not
permit logging, committing, echoing, embedding in argv, or copying the password
into artifacts. Rotation is a mandatory terminal action for both success and
failure, requires separate current authorization, and is tracked by
`mc2-jz6y0.13.8`.

The audit source for that acceptance is the current owner conversation: after
the disclosure warning, the owner answered in Russian that the exposure was
acceptable, that the password would be corrected later, and explicitly directed
the task to use it. The credential itself is deliberately absent from this
document and every tracked artifact. The secret-free authorization record is
also durably published in Beads decision `mc2-jz6y0.13.8`; it explicitly keeps
password rotation as a separate, not-yet-authorized terminal mutation.

Production off-host S3 remains deferred under `mc2-jz6y0.13.6`. This design
uses persistent local-disk staging backups and disposable local restore
resources only.

## Accepted Evidence

### Source database

The password was ingested into an owner-only local file by hidden stdin. It was
not printed by any command and is not repeated in the repository. A PostgreSQL
17.6 client then passed `sslmode=verify-full` with the Supabase Root 2021 CA and
a read-only transaction:

| Fact               | Observed value                          |
| ------------------ | --------------------------------------- |
| Project            | `diqooqbuchsliypgwksu`                  |
| Database           | `postgres`                              |
| Server             | PostgreSQL `17.6`                       |
| Database size      | `262,212,755` bytes at observation time |
| Migration rows     | `317`                                   |
| Migration frontier | `20260704150249`                        |
| Non-system roles   | `22`, including four application roles  |
| Extensions         | `13`                                    |

The four application roles are `admin`, `instructor`, `student`, and
`superadmin`. The source also contains Supabase-owned roles and extension
owners that a single-database `pg_dump` does not recreate.

Source extension versions are:

| Extension                        | Version  | Schema       |
| -------------------------------- | -------- | ------------ |
| `basejump-supabase_test_helpers` | `0.0.6`  | `extensions` |
| `http`                           | `1.6`    | `extensions` |
| `pg_cron`                        | `1.6.4`  | `pg_catalog` |
| `pg_net`                         | `0.19.5` | `extensions` |
| `pg_stat_statements`             | `1.11`   | `extensions` |
| `pg_tle`                         | `1.4.0`  | `pgtle`      |
| `pg_trgm`                        | `1.6`    | `extensions` |
| `pgcrypto`                       | `1.3`    | `extensions` |
| `pgtap`                          | `1.2.0`  | `extensions` |
| `plpgsql`                        | `1.0`    | `pg_catalog` |
| `supabase-dbdev`                 | `0.0.5`  | `extensions` |
| `supabase_vault`                 | `0.3.1`  | `vault`      |
| `uuid-ossp`                      | `1.1`    | `extensions` |

### Diagnostic archive and restore

A read-only PostgreSQL 17.6 custom dump was created locally outside the repo:

| Artifact                | Evidence                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| Custom archive          | `66,706,978` bytes, mode `0600`                                    |
| Archive SHA-256         | `7aecb6fdc94f6a41decf036b1177f4638b6437798412bd510a8864b2f5ad347c` |
| TOC                     | `3,361` entries                                                    |
| Full offline traversal  | passed                                                             |
| Password-free roles SQL | `8,030` bytes, mode `0600`                                         |
| Roles SHA-256           | `e73fd8b1abd2cbe11ef11b345f9e8ab7af9ee0ad8623d40670de7deac5d4a44e` |

The archive is diagnostic local evidence, not the accepted server backup and
not a production restore source. It remains owner-only until the reviewed
executor reproduces the successful drill, then is securely removed during
stage cleanup.

The same real archive produced these deterministic results:

| Target                                                                   | Result                                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Docker Official PostgreSQL 17.10                                         | failed atomically: role `supabase_admin` absent                               |
| Supabase PostgreSQL `17.6.1.132`, restore as `postgres`                  | failed atomically: cannot set role `supabase_admin`                           |
| Supabase PostgreSQL `17.6.1.132`, restore as `supabase_admin`            | failed on `cron.database_name`, then missing role, then `pgtap` version drift |
| Supabase PostgreSQL `17.6.1.064`, exact role bootstrap and cron database | strict restore passed in 7 seconds                                            |

The successful run used `--exit-on-error --single-transaction` without
`--no-owner`, `--no-acl`, ignored errors, or schema exclusions. It restored 101
user tables and 585 indexes. Cleanup removed every diagnostic container and
volume.

### Restore image identity

The restore target is not a runtime service and is not selected for recency. It
is selected because it matches the source PostgreSQL and extension versions.

| Identity                | Accepted value                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| Tag, drift check only   | `public.ecr.aws/supabase/postgres:17.6.1.064`                             |
| OCI index               | `sha256:4c6d67181e482549bab276e8ae933f807be59ea1c371c225d85c189b0c14b9de` |
| Linux/amd64 runtime     | `sha256:d00c45c73f9c3d130ea4f379d8ae7748b0711d628eea690d27d03198ed609f2f` |
| PostgreSQL              | `17.6`                                                                    |
| Required exact defaults | `pg_net=0.19.5`, `pgtap=1.2.0`, `pg_cron=1.6.4`, `pg_tle=1.4.0`           |

The newer `17.6.1.132` and current self-hosted Compose image are useful runtime
updates but are not restore-compatible with this archive because their default
extension versions differ. Restore fidelity takes precedence over tag recency
inside the isolated, loopback-only drill.

### Writer runtime truth

All six assumed systemd units are `not-found`. The current writers are ten
Docker Compose containers:

| Class                 | Compose project/service                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| Active production API | exactly one of `megacampus-blue/api` or `megacampus-green/api`                          |
| Active production Web | exactly one of `megacampus-blue/web` or `megacampus-green/web`                          |
| Production workers    | `megacampus/worker`, `megacampus/worker-stage6`, `megacampus/worker-stage7`             |
| Development API       | `megacampus/api-dev`                                                                    |
| Development Web       | `megacampus/web-dev`                                                                    |
| Development workers   | `megacampus/worker-dev`, `megacampus/worker-stage6-dev`, `megacampus/worker-stage7-dev` |

The production and development writers share the source database/storage
boundary and must be treated as one quiesce set. The Web containers are writers:
their Server Actions and API routes update courses, generation state,
`file_catalog`, and lessons. Redis, NotebookLM, Docling, Qdrant, and unrelated
containers are not writers and must not be stopped.

The observed production identities are `megacampus-blue/api` and
`megacampus-blue/web`; the executor still models blue/green as alternatives and
does not hard-code blue as the active color. The observed development
identities are `megacampus/api-dev` and `megacampus/web-dev`.

### Additional read-only barrier/scheduler truth

A 2026-07-13 read-only source transaction established the exact pre-design
shape without returning commands, rows, credentials, or object names:

| Boundary       | Observed truth                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public`       | 47 ordinary/partitioned tables; `postgres` has `TRIGGER` on all 47                                                                                |
| `auth`         | 23 tables owned by `supabase_auth_admin`; `postgres` has `TRIGGER` on 22, excluding internal `schema_migrations`                                  |
| `storage`      | 8 tables owned by `supabase_storage_admin`; `postgres` has `TRIGGER` on 5 browser-mutable tables, not 3 internal migration/vector-metadata tables |
| Supabase Cron  | 8 active jobs, all username `postgres`                                                                                                            |
| pg_net         | exact `net.http_request_queue` count `0`; 12 historical response rows                                                                             |
| Server clock   | systemd `255.4`, timezone `Europe/Amsterdam`                                                                                                      |
| Network-online | `networking.service` active/enabled and a dependency of `network-online.target`                                                                   |

These counts are preflight pins, not permission to assume future stability.
Any drift requires a new read-only inventory and reviewed manifest update before
live mutation.

## Architecture

### 1. Truthful backup set

One accepted backup generation consists of four owner-only files bound to one
exported PostgreSQL snapshot:

1. PostgreSQL 17 custom archive;
2. password-free roles export;
3. source verification manifest;
4. SHA-256 checksum manifest.

The source verification manifest contains no row values or credentials. It has
two explicit views: `baseline`, captured after the barrier transaction has
acquired its complete deterministic table-lock set but before it performs any
Q12 catalog/data mutation, and
`cutover_snapshot`, generated from the exported snapshot after the atomic
maintenance barrier is active. It records:

- source PostgreSQL version, database identity/size, and migration frontier;
- the database owner, canonical ACL (grantor, grantee, privilege, grant
  option), tablespace, connection limit, encoding, locale provider, collation,
  `ctype`, provider locale/`datlocale`, builtin locale, ICU locale/rules,
  `datcollversion`, `datallowconn`, `datistemplate`, database settings, comment,
  and security labels;
- extension name/version/schema/owner tuples;
- allowlisted non-ephemeral role attributes and settings. The canonical PG17
  attribute tuple is role name, `rolsuper`, `rolinherit`, `rolcreaterole`,
  `rolcreatedb`, `rolcanlogin`, `rolreplication`, `rolconnlimit`,
  `rolvaliduntil`, and `rolbypassrls`; OID and `rolpassword` are always excluded.
  Any true superuser/bypass-RLS/login/replication/create-role/create-database
  value outside the reviewed exact per-role allowlist aborts. Every membership
  tuple is canonicalized as member, role, grantor, `admin_option`,
  `inherit_option`, and `set_option`, with no option or grantor inferred during
  replay;
- sorted schemas and owners;
- exact row counts and an aggregate SHA-256 only for the declared authoritative
  data-equality relation set. That set is exactly every guarded
  `public`/Auth/Storage relation plus `cron.job` and
  `net.http_request_queue`, and must equal the barrier's deterministic relation
  lock set. Every other dumped relation is listed in an exact reviewed
  non-authoritative operational set and receives schema/owner/ACL checks but no
  logical-row equality claim; unknown, omitted, or multiply classified
  relations abort. In particular, volatile response/run-history and internal
  migration/vector-metadata relations can never make an undeclared data delta
  acceptable;
- deterministic hashes/counts for tables, indexes, constraints, functions,
  triggers, policies, object owners, object ACLs, comments, and security labels;
  canonical `pg_default_acl` tuples and, when nonempty, cluster-global
  `pg_parameter_acl` tuples, including grantor, grantee, privilege and grant
  option.

`baseline.database_settings` is always the captured pre-barrier
`pg_db_role_setting`/database-property truth. It is never regenerated from the
temporarily read-only connection. `cutover_snapshot` records the effective
barrier and must differ from `baseline` only by the complete allowlisted
`q12_guard` schema/function/table/trigger set, the exact captured `cron.job`
rows changing `active=true` to `false`, and
`default_transaction_read_only=on`. Their before/after hashes and catalog OIDs
are recorded separately. Any other delta is a hard stop. This makes the archive
a deliberately fail-closed recovery point while preserving the exact clean
state that activation must restore. “Any other delta” applies to every
authoritative/catalog field; row contents of the explicitly classified
non-authoritative operational relations were never claimed as logical equality
and cannot be used to pass an application-data check.

`cli_login_postgres` and every password hash are excluded from the canonical
role manifest and executable bootstrap. The raw password-free role export may
contain the ephemeral role as audit evidence because PostgreSQL 17 has no
`pg_dumpall --exclude-role`; no line-based SQL filtering is permitted. The
pre/post comparison uses the complete raw export, so even ephemeral-role drift
still aborts. A changed canonical source role, role setting, extension,
migration frontier, table set, or required manifest field is a hard stop.

After the atomic maintenance barrier has committed, the top-level executor
quiesces all ten application writers and keeps them stopped. It then opens a
PostgreSQL 17 `REPEATABLE READ, READ ONLY`
coordinator transaction, calls `pg_export_snapshot()`, and keeps that session
open until both consumers finish. The custom archive uses
`pg_dump --snapshot=<exported-id>` and the manifest generator opens its own
`REPEATABLE READ, READ ONLY` transaction followed by
`SET TRANSACTION SNAPSHOT <exported-id>`. The snapshot identifier and both
consumer statuses are recorded without connection data.

PostgreSQL roles are cluster-global and `pg_dumpall --roles-only
--no-role-passwords` cannot join the database snapshot. Therefore the executor
produces complete password-free raw role exports immediately before and
immediately after the snapshot-bound dump, requires byte-identical normalized
hashes, and publishes only the first copy as the canonical roles artifact. A
mismatch aborts the generation. The temporary second copy is destroyed after
the accepted checksum manifest is committed. Normalization may remove only the
PostgreSQL 17-generated `\restrict` and matching `\unrestrict` nonce lines plus
trailing blank lines; it must parse and require that pair before removal.
Comments, SQL statements, ordering, attributes, settings, memberships,
ephemeral roles, and ACL-relevant text are never normalized away.

`backup-supabase.sh` keeps the existing direct `pg_dump` status, minimum size,
TOC, full traversal, fsync, and no-replace publication gates. It builds all
four files in one unique same-filesystem
`.generation.<run-id>.<random>` directory, mode `0700`, with files mode `0600`.
It fsyncs each completed file and the temporary directory, then uses Linux
`renameat2(RENAME_NOREPLACE)` through the reviewed helper to atomically publish
that whole directory without replacement as immutable
`generation-<UTC>-<run-id>`. Only after the rename and parent-directory fsync
does it write/fsync a unique owner-only `latest.json.<run-id>.tmp`, atomically
rename it over `latest.json`, and fsync the parent. The pointer contains only
the generation basename and checksum-manifest hash; a symlink or
path-containing pointer is rejected. Readers accept only an immutable
generation referenced by a valid pointer whose four files all pass their
recorded sizes and hashes. There is no individually published archive and no
valid partial generation. Race tests create the destination and replace the
pointer between precheck and publication; neither race may overwrite a
generation or accept mixed files.

The implementation also makes these corrections:

- `pg_dump` stderr is captured in an owner-only temporary file and rejected
  unless it is empty. Any future allowed warning pattern requires its own
  reviewed, version-pinned test; the initial allowlist is empty;
- publication has an explicit committed state. A failure before the generation
  rename removes only the unique temporary directory. A failure after the
  generation rename retains that immutable generation for incident evidence;
  it does not update `latest.json`. An already committed generation is never
  silently removed by cleanup.

The raw password-free roles export is audit evidence, not executable restore
input. Both it and the generated bootstrap SQL pass a synthetic and pattern
secret scan before publication or execution.

All historical 20-byte files remain untouched.

Retention operates only on complete `generation-*` directories, never the old
file glob. After a new generation and pointer commit, it validates exact
owner/mode/non-symlink/hash completeness, never deletes the generation named by
`latest.json`, and removes only expired non-latest committed generations before
fsyncing the parent. Unpointed post-rename incident generations and any
generation with incomplete evidence are retained for explicit operator
disposition. Scheduled retention remains exactly 14 days and cannot grow
silently without an alert.

### 2. Supabase-compatible isolated restore

`deploy/postgres/restore-supabase-drill.sh` is the sole executable isolated
restore entrypoint beneath the top-level live supervisor. It accepts only
absolute canonical paths and exact expected hashes.

The executor:

1. verifies the archive, roles, source manifest, CA, operator, PG17 tools, OCI
   index, linux/amd64 child digest, database barrier capability inode/mode/hash,
   and free space;
2. creates one unique named volume mounted at exactly
   `/var/lib/postgresql/data`;
3. creates separate synthetic restore and cleanup passwords in mode-`0600`
   files: the image initialization credential is bound read-only through
   `POSTGRES_PASSWORD_FILE`, while bootstrap assigns the other only to the
   isolated `postgres` cleanup actor; neither value comes from the source;
4. starts only the accepted linux/amd64 Supabase image on one unique
   `--internal` Docker network and a kernel-selected `127.0.0.1` host port;
5. waits for stable initialization and applies the reviewed allowlisted role
   bootstrap before any database ACL, role-in-database setting, or extension
   restore;
6. creates `restore_test` manually with the source database's exact owner,
   encoding, locale provider, collation, `ctype`, provider/builtin/ICU locale,
   ICU rules, collation version, tablespace, connection limit,
   allow-connect/template flags, comment, and security labels; the target name
   is the sole intentional database-property difference;
7. replays database ACL entries only after every grantor/grantee exists, under
   the exact recorded grantor, applies role/database settings, and requires
   canonical `aclexplode` equality;
8. applies the cutover-snapshot database default
   `default_transaction_read_only=on` plus the isolated-drill overrides
   `cron.database_name=restore_test` and `cron.launch_active_jobs=off`, restarts
   or reloads the same container as required by each GUC, and proves all three
   settings; active cron catalog rows are therefore comparable without ever
   executing a restored job;
9. verifies every binary source extension version is available and the archive
   TOC contains the exact `pgtle` package/control entries for
   `basejump-supabase_test_helpers=0.0.6` and `supabase-dbdev=0.0.5` before
   database restore;
10. proves the restore connection has
    `session_user=current_user=supabase_admin`, authenticated directly through
    the unique owner-only synthetic restore credential; no implicit actor,
    `--role`, environment password, or source credential is accepted;
11. restores through the host's explicit
    `/usr/lib/postgresql/17/bin/pg_restore` with `--exit-on-error` and
    `--single-transaction`; the client starts with fixed
    `default_transaction_read_only=off` and proves
    `transaction_read_only=off` before restore;
12. creates the target verification manifest and first requires exact
    `cutover_snapshot` equality, including the restored fail-closed guard/cron
    state, `pg_database.datdba`/canonical ACL/settings and every
    `pg_extension.extowner`; it then opens a separate direct connection
    authenticated only by the synthetic cleanup credential with fixed startup
    option `-c default_transaction_read_only=off`, proves
    `session_user=current_user=postgres`, executes exactly
    `SELECT set_config('megacampus.q12_capability', $1, false)` with the
    verified database barrier capability, proves the setting hash through the
    guard's nonsecret verifier and `SHOW transaction_read_only=off` on that same
    connection, and only then applies the same reviewed
    activation-cleanup transaction. It requires exact `baseline`
    catalog/settings equality except target name and the two declared
    cluster-only cron overrides;
13. requires a nonzero restored database size between 25% and 200% of the
    source size after exact logical equality has passed, and records the exact
    ratio;
14. removes the container, network, volume, both synthetic secret files,
    temporary directory, loopback port, and every captured resource ID on
    success, failure, or signal.

Cleanup failure overrides restore success. The restore executor never names or
writes to the Supabase source after the archive has been produced.

Before any live mutation, `q12-live-cutover.sh --plan` also builds the migration
expectation independently. It takes a fresh read-only structural snapshot of
the source, restores that snapshot into the same pinned isolated image, proves
its canonical pre-migration structural catalog equals the read-only source
catalog, applies only the five release-SHA migration files inside the isolated
target, and emits owner-only
`expected-post-migration-catalog.json`. That manifest freezes table/index/
constraint/function/trigger/policy/owner/ACL shapes, exact migration-history
rows, the base structural hash, every migration file hash, release SHA, and
`expected_post_migration_catalog_sha256`; it contains no source row values or
credentials. The complete artifact hash is part of the accepted run input and
frozen command manifest before `live` can be confirmed. The later barrier
transaction must reproduce the same base structural hash before its first
mutation or roll back. Live migration output is compared to this artifact and
can never create, update, or bless it. This diagnostic expectation snapshot is
not the accepted recoverable backup generation. Its temporary archive,
container, network, and volume are removed only after the artifact hash is
durably bound to the run; the expected catalog JSON itself remains immutable at
the fixed path through `guard_cleanup_complete`.

### 3. Allowlisted role bootstrap

The pinned image supplies stable Supabase system roles. The reviewed bootstrap
creates only roles present in the source manifest but absent from the image:

- `admin`;
- `instructor`;
- `pgtle_admin`;
- `student`;
- `supabase_functions_admin`;
- `supabase_privileged_role`;
- `supabase_realtime_admin`;
- `superadmin`.

Attributes, role settings, and membership edges must match the source manifest.
No source password or `cli_login_postgres` role is restored. Login-capable
bootstrap roles receive no password and are reachable only inside the isolated
container. Any unexpected missing role, extra requested role, membership edge,
superuser grant, or login credential aborts before archive restore.

Membership replay runs only after every member, granted role, and grantor
exists, impersonates the exact grantor, and applies the recorded PG17
`admin_option`, `inherit_option`, and `set_option`; canonical tuple equality is
required afterward. Before archive restore, the bootstrap replays and compares
only cluster-global `pg_parameter_acl` entries under their exact grantor.
Schema-scoped `pg_default_acl` is deliberately not replayed in the fresh
database because its referenced namespaces do not yet exist. Instead, preflight
requires the archive TOC's exact `DEFAULT ACL` entry set/hash; strict
`pg_restore` creates schemas/owners and restores those entries, after which the
verification manifest compares canonical `pg_default_acl` tuples and expanded
grants exactly. A missing/extra TOC entry or image-supplied extra/default
membership/ACL is drift and fails rather than being silently accepted.

The restore never executes raw `pg_dumpall` output. It generates bootstrap SQL
from the verified manifest and permits only these observed role settings:

| Role                      | Exact setting                                   |
| ------------------------- | ----------------------------------------------- |
| `anon`                    | `statement_timeout=3s`                          |
| `authenticated`           | `statement_timeout=8s`                          |
| `authenticator`           | `lock_timeout=8s`                               |
| `authenticator`           | `session_preload_libraries=safeupdate`          |
| `authenticator`           | `statement_timeout=8s`                          |
| `postgres`                | `search_path="$user", public, extensions`       |
| `supabase_admin`          | `log_statement=none`                            |
| `supabase_admin`          | `search_path="$user", public, auth, extensions` |
| `supabase_auth_admin`     | `idle_in_transaction_session_timeout=60000`     |
| `supabase_auth_admin`     | `log_statement=none`                            |
| `supabase_auth_admin`     | `search_path=auth`                              |
| `supabase_read_only_user` | `default_transaction_read_only=on`              |
| `supabase_storage_admin`  | `log_statement=none`                            |
| `supabase_storage_admin`  | `search_path=storage`                           |

Every other role setting key or value is a hard stop. The SQL is applied with
`psql -X --set ON_ERROR_STOP=on` inside the isolated target only. Tests inject
URI-shaped, token-shaped, password-shaped, and unknown-GUC values and require
rejection before SQL execution.

### 4. Build-only Qdrant operator publication

Create `deploy/qdrant/publish-qdrant-operator.sh` as a reviewed local publisher
rather than adding a GitHub Actions workflow. GitHub requires a
`workflow_dispatch` workflow to exist on the default branch, while the current
deploy detector classifies any new `.github/workflows/*` file as deploy-relevant.
A local publisher avoids that unsafe bootstrap and does not change the coupled
CI/CD workflow.

The publisher:

- requires a full 40-hex accepted commit and an exact confirmation phrase;
- creates a clean detached worktree at that commit and refuses an unpushed or
  unreachable identity;
- accepts a registry token only through stdin, requires package-write access,
  and never stores it in argv, Git, metadata, or logs;
- creates a unique mode-`0700` `DOCKER_CONFIG`, refuses any inherited
  credential helper/store, requires the resulting `config.json` to be mode
  `0600`, and uses that directory for every login/build/inspect/logout command;
- invokes Docker Buildx for only the existing `qdrant-operator` target and
  linux/amd64 platform;
- pushes one immutable full-SHA tag with `--provenance=mode=max`, records the
  registry digest and local Buildx metadata, then independently inspects the
  remote digest;
- contains no SSH, application build matrix, deployment, service, migration,
  secret-copy, or runtime integration command.

The publisher consumes a GitHub personal access token (classic) with
`write:packages` through `docker login ghcr.io --password-stdin`; GitHub's
container registry does not accept the current ordinary GitHub CLI credential
as a substitute for this documented CLI contract. On success, failure, or
signal, the publisher runs logout against the temporary config, removes the
entire directory, and proves no config, helper, token, worktree, or metadata
residue remains. Cleanup failure overrides publication success.

The normal CI/CD deploy remains unchanged. Supplying the scoped token and
running the publisher with its confirmation is a separate observable GHCR
mutation after local implementation and review.

### 5. Compose-aware writer quiesce

`source-recovery-run.sh` gains an explicit local-Docker backend. It never uses
remote Docker contexts.

Preflight binds each expected writer to immutable observed data:

- container ID and name;
- Compose project, service, config file, and working directory labels;
- image ID/digest;
- prior running/stopped state; and
- the exact Docker restart policy, including retry count where applicable.

It requires exactly one active production API/Web color pair, all three
production workers, and all five development writers. The production Web and
API must have the same color. Missing, duplicated, restarting, unhealthy,
label-mismatched, or unexpected writer identities fail closed.

With `--stop-writers`, the wrapper:

1. requires the supervisor's atomic database maintenance barrier described
   below to be durably committed before the first Docker policy change;
2. changes the exact captured ten containers' restart policies to `no`, proves
   each change through Docker inspect, and journals both old and temporary
   values so a Docker daemon or host restart cannot restart them; a crash during
   this loop remains write-blocked by the database barrier;
3. stops the production/development Web and API containers first to close the
   inbound application write path;
4. probes `https://127.0.0.1` using exact TLS SNI/Host values
   `ai.megacampus.ru` and `dev.ai.megacampus.ru` and requires only `502` or
   `503`; any `2xx`, `3xx`, `401`, `403`, other status, TLS failure, or
   unexpected body is a hard stop;
5. gracefully stops the six worker containers with a bounded timeout;
6. verifies the same captured ten container IDs are stopped;
7. runs source recovery under the existing host `flock`;
8. in standalone mode only, starts containers that were previously running,
   workers first, then APIs, then Web, and verifies exact restored state.

Stopping Web closes new Server Actions and routes, but loaded browsers can call
Supabase PostgREST, Auth, and Storage directly. The top-level supervisor
therefore begins the cutover with one all-or-nothing database transaction that:

1. runs at `READ COMMITTED`, revalidates the preflight catalog/OID inventory,
   requires zero prepared transactions, and issues one generated, fully quoted
   `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` statement whose deterministic OID
   order contains every guarded `public`/Auth/Storage root and leaf plus
   `cron.job` and `net.http_request_queue`; only after that single statement
   returns does it capture the exact database properties/settings, all eight
   currently active `cron.job` rows including command hashes, the still-empty
   pg_net queue, guarded-table catalogs, existing trigger hashes, row counts,
   and other canonical `baseline` fields. All earlier writers have then drained,
   later writers are lock-blocked, and each later `READ COMMITTED` statement sees
   the same data truth because no writer can acquire a conflicting table lock;
   the canonical no-row-value baseline and its hash are inserted into
   `q12_guard` by this transaction and are exported only after commit;
2. creates `q12_guard` and every contained object owned by `postgres`, stores
   only the SHA-256 of the random run-bound database barrier capability, and
   creates its trigger function as `SECURITY DEFINER SET
search_path=pg_catalog,q12_guard` owned by `postgres`. Immediately after each
   schema/table/function creation it enumerates `aclexplode`, revokes `ALL` from
   `PUBLIC` and every explicit non-owner grantee introduced by existing default
   ACLs, and requires the canonical ACL to contain owner `postgres` only. The
   schema permits no sequences; an unexpected sequence/object kind or any
   inherited/default explicit grant is a hard stop. The exact owner-only ACL set
   is rechecked before commit, after restore, after each migration, and before
   cleanup; callers do not need function `EXECUTE` because enforcement occurs
   through the installed trigger;
3. makes the function allow only either (a) `session_user=postgres` with an
   in-memory `megacampus.q12_capability` whose hash matches the active run or
   (b) `session_user=authenticator`, JWT role exactly `service_role`, and an
   `x-q12-capability` value from `request.headers` with the same hash; all other
   direct logins, missing/malformed claims/headers, and nonmatching values raise
   an exception using fail-closed `IS DISTINCT FROM` logic;
4. sets the exact eight captured cron jobs inactive and requires the pg_net
   request queue to remain empty; and
5. installs the complete trigger set below and commits only after exact catalog
   equality. The already-held complete lock set, rather than a later sequence of
   per-table DDL locks, establishes the baseline/guard boundary. A process death
   leaves either the old writable state or the full durable guard—never a
   partially guarded catalog or a data commit between baseline capture and the
   guard commit. After commit, the controller re-reads the stored baseline/hash,
   atomically publishes its owner-only manifest copy, and aborts on any byte or
   hash mismatch before changing a Docker restart policy.

The guarded set is every ordinary/partitioned `public` table, every
browser-mutable Auth/Storage table on which the source `postgres` role has
`TRIGGER`, plus `cron.job` and `net.http_request_queue`: the currently observed
22 Auth tables except
`auth.schema_migrations`, and five Storage tables (`buckets`,
`buckets_analytics`, `objects`, `s3_multipart_uploads`, and
`s3_multipart_uploads_parts`). Preflight proves exact table/function privileges
and the ability to install/restore triggers on the two extension relations; any
ownership, privilege, table-set, or API drift is a hard stop. The same row and
TRUNCATE guards therefore reject uncapped PostgREST calls through
`cron.schedule`/related job functions and `net.http_*` before they can add a job,
queue a request, or cause an external effect, while a direct supervisor session
with the database barrier capability can perform the exact maintenance update.
Preflight also proves the excluded internal migration and vector-metadata tables
have no browser/application grants or supported write path. This source-derived
allowlist is recorded in the manifest, not silently widened.

For partition trees, the supervisor creates the root row trigger first, verifies
every PostgreSQL `tgparentid` clone on existing leaves, and never recreates a
clone. It then creates explicit `BEFORE TRUNCATE FOR EACH STATEMENT` triggers on
the root and every leaf because PostgreSQL does not clone statement triggers.
The row trigger is exactly `BEFORE INSERT OR UPDATE OR DELETE FOR EACH ROW` on
every root and standalone table, with PostgreSQL-generated clones verified on
every existing leaf; tests exercise all three events on root, leaf, and
standalone paths. Standalone tables also receive one truncate trigger. Exact
set/OID/hash verification closes the transaction.

After that atomic guard is committed, the supervisor uses the pre-barrier
database default already frozen in `baseline`, executes
`ALTER DATABASE postgres SET default_transaction_read_only=on`, terminates every
other client backend, and reconnects. Only database-barrier-capability-authenticated direct
supervisor clients may opt out with fixed
`default_transaction_read_only=off`; archive and manifest transactions remain
explicitly read-only. The canonical manifest keeps the captured pre-barrier
row as `baseline` and records this setting only in `cutover_snapshot`.

The guard probe table has a caller-supplied fixed primary key and no sequence,
default, or side effect. An anon/authenticated PostgREST write and service-role
write without the run header must fail. A service-key request with the correct
header and `Prefer: tx=rollback, return=representation` must succeed, return
`Preference-Applied: tx=rollback`, and leave zero rows. Unique Auth profile and
Storage object probes must be rejected and prove no Auth row, Storage metadata,
or object bytes persist. Uncapped service-role RPC probes for Cron and pg_net
must fail with the exact job set and request queue unchanged and zero external
request; the capability-bound direct supervisor probe must roll back cleanly.
If PostgREST does not expose the exact header or honor `db-tx-end`, or any
Auth/Storage/Cron/pg_net cleanup is not zero, the run stops before backup.

The source-recovery and reindex HTTP adapters gain file/FD-only access to the
same **run-bound database barrier capability** and send `x-q12-capability`;
ordinary service-role cron/pg_net/application calls do not possess it and
remain denied. This database capability is one mode-`0400` secret at
`/opt/megacampus/backups/q12/<run-id>/secrets/db-capability`, below a mode-`0700`
persistent run directory, reusable only by the manifest's allowlisted barrier,
migration, recovery, reindex, activation, and cleanup children until
`guard_cleanup_complete`. The file and parent are fsynced before the barrier
transaction, so a host reboot does not destroy the only recovery credential;
terminal cleanup unlinks it and fsyncs the parent only after zero guard residue.
It is not a host command capability.
Direct clients read it from the file/FD and execute exactly
`SELECT set_config('megacampus.q12_capability', $1, false)` on the same
connection before any privileged statement; `false` makes the setting persist
for that session across autocommit transaction boundaries. The raw capability
is stored only in the fixed persistent mode-`0400` run file, the narrowly staged
owner-only container tmpfs copy defined below, and authorized process memory;
it never appears in argv, environment, Git, artifacts, telemetry, or logs. Its
SHA-256 is permitted only in the owner-only `q12_guard` verifier row and
owner-only resource/command manifests; it is forbidden in
argv/environment/Git/shared logs and removed with those run-owned verifier
resources at terminal cleanup.

For Qdrant operator containers, the frozen host command bind-mounts the
mode-`0400` run file read-only at `/run/secrets/q12_db_capability` and passes
only the nonsecret path. The root entrypoint validates and copies it to the
container's existing owner-only tmpfs, changes ownership to UID/GID `1001:1001`,
then drops privileges; the TypeScript adapter reads and unlinks only the tmpfs
copy. Docker inspect/env/log scans must contain the path but never the value,
and container exit removes the tmpfs. A missing/changed bind inode or any
non-Q12 operator invocation causes the adapter to omit the header and therefore
remain write-denied.

Each transactional base migration and the transactional observability-totals
packet uses one database transaction for its DDL/data, grants, and guard
publication. Before any such transaction may commit, the same
database-barrier-capability-authenticated connection calls the reviewed
`q12_guard` extension routine, installs row/TRUNCATE guards on every newly
created document-evidence root/leaf in deterministic partition order, verifies
owner-only guard ACL plus exact expected set, and only then publishes any
application grants. Thus each new table and its protection become visible in
the same commit; there is no post-commit unguarded table window even when a
loaded browser continuously retries explicit READ WRITE PostgREST calls.

The observability CLI preserves its recoverable nontransactional state machine:
the exact-hash `20260711150000` packet may contain only the reviewed `CREATE` or
`DROP INDEX CONCURRENTLY` operation and its existing invalid-index/history
recovery against already guarded tables. A parsed-statement preflight rejects
every table/schema/function/trigger/ACL/grant statement in that concurrent
packet before execution. The `20260711151000` totals packet remains
transactional; because it creates
`document_evidence_observability_totals`, it installs/verifies that table's
guard before grants and commit as described above. Rollback removes the totals
guard/table in its accepted transaction before the separately recoverable
concurrent-index rollback. The expected catalog fixes both packet hashes and
their allowed statement classes.

After each commit, the supervisor claims the corresponding read-only
`barrier.verify-after-base` or `barrier.verify-after-observability` host command.
It can only re-read and compare the catalog; it cannot create/repair a trigger,
grant, or ACL. It records `base_migration_guarded` before starting the
observability migration and `observability_migration_guarded` before
`migrations_applied`; a missing phase forbids the next migration or restoration
of write defaults. It then restores the original database default, terminates
all barrier-era sessions, and runs recovery/reindex
only with the database barrier capability. At final activation it compares
against the independently generated, pre-live
`expected_post_migration_catalog_sha256` minus the exact guard/probe objects;
the live database is never used to learn or update expected catalog truth, and
the pre-guard catalog is not an impossible comparison target.

When called by the top-level live executor, the wrapper receives an
`--external-quiesce-manifest` and an inherited lock file descriptor. In that
mode it verifies the exact stopped IDs and lease but never stops or starts a
writer. The top-level executor alone owns the uninterrupted quiesce window and
the final resume/handoff decision.

It never calls `docker compose down`, removes a container/volume/network, stops
Redis/Qdrant/Docling/NotebookLM, or infers writers from name substrings alone.
The existing injectable systemd backend remains test-only compatibility until
explicitly needed by a real host.

### 6. Quiesce-aware blue/green handoff

`scripts/deploy_blue_green.sh` and `scripts/rollback_blue_green.sh` gain an
explicit Q12 mode that requires the same external quiesce manifest, inherited
lock descriptor, release SHA, and phase-journal identity. Normal deployment
behavior is unchanged when Q12 mode is absent.

Q12 deployment is split into three fail-closed calls:

1. `prepare-quiesced` omits `worker-stage7` from infrastructure `up`, uses
   `docker compose up --no-start` for only target Web/API, captures their exact
   IDs/labels/images/intended Compose restart policies, changes both to
   restart=`no`, fsyncs them into the recovery manifest, then starts them for
   direct-port read-only health. It records `prepared_quiesced` but cannot reload
   Nginx, update `active_color`, stop/remove captured old IDs, or start a worker;
2. `commit-quiesced` revalidates the lease and target, tests/reloads pinned
   Nginx and records the active color while the database guard still blocks all
   writes. It creates all three production worker containers with `--no-start`,
   captures them, changes them to restart=`no`, fsyncs the expanded recovery
   manifest, and records `activation_ready`; it cannot start them;
3. the supervisor executes one database activation transaction: records an
   `activation_committing` intent, removes every exact guard trigger/probe,
   restores the eight cron rows and original database default, inserts a
   run-bound `activated` receipt into the otherwise inert `q12_guard` schema,
   proves the expected post-migration catalog, and commits. That database commit
   is the irreversible activation point. `finalize-quiesced` then validates the
   receipt, starts production workers, resumes captured development writers,
   restores intended restart policies only for the new target production
   Web/API/workers and the exact previously-running development IDs, and records
   `handoff_complete`. Every captured old production Web/API/worker ID remains
   stopped with restart=`no`; it never regains an auto-restart policy after the
   activation receipt.

A crash before the activation transaction retains guards and restart=`no`. A
crash after its commit has target Nginx/active color and a durable database
receipt, so recovery treats the release as activated and finishes the prepared
workers; it never rolls back into an ambiguous writable state. The inert
receipt/schema remain through observation. Only after `observed` does one final
transaction remove them and prove zero Q12 residue. Post-observation container
cleanup may then remove only the exact captured old production IDs after logs,
labels, images, stopped state, restart=`no`, active routing, and rollback
evidence are durable; an identity mismatch is an incident stop. Thus no failure
window has both an uncommitted handoff and an unguarded writable database, and a
host reboot cannot resurrect the old production color during observation.

Q12 rollback mode cannot start a worker or switch Nginx before the supervisor
selects the accepted pre-/post-`reindex_started` rollback branch. A failure
after Nginx reload is an immutable blue/green incident rollback under the same
lease; ordinary deployment cleanup and Docker pruning are deferred until the
supervisor records successful handoff and observation.

### 7. Credential lifecycle

The current owner-approved password may be used for this staging window only:

- local and server secret files are owner-only `0600`;
- ingestion uses hidden stdin;
- connection uses a libpq service file plus `verify-full` and the accepted CA;
- argv, Docker configuration, Git, artifacts, logs, process listings, and
  command output contain no URI/password;
- application containers continue using Supabase HTTP/API credentials and do
  not receive the direct database URI.

Every terminal live-window result sets `rotation_required=true` in the phase
journal. After success, `mc2-jz6y0.13.8` must rotate the database password before
Q12 can close or the release can be considered production-ready. After failure
or abort, no retry is permitted until the password has been rotated. The
operator inventories and stops every direct database consumer, updates the
owner-only backup secret, verifies the new Session pooler URI, restarts
consumers, proves the old password is rejected, and observes Supavisor for
circuit-breaker errors.

Rotation is not bundled into worker implementation or silently performed by
the cutover executor because it is a separate live credential mutation. At the
terminal boundary, root must present the exact rotation effects and obtain
current authorization. If authorization is unavailable, Q12 stays open and
blocked with no retry or production-readiness claim.

### 8. File-only migration credential contract

Both approved migration CLIs gain
`--db-url-file /opt/megacampus/secrets/supabase_db_url` and
`--ca-file /opt/megacampus/secrets/prod-ca-2021.crt`, plus the supervisor-only
`--q12-db-capability-file`. In Q12 live mode they reject `SUPABASE_DB_URL` and
any URI argument. All files must be absolute,
canonical, non-symlink regular files owned by
`claude-deploy:claude-deploy`; the URI is mode `0400` or `0600` and the CA is
mode `0644`, while the run-bound database capability is mode `0400` at the fixed
active-run path. Every parent must be non-symlink and not group/world-writable.
The CLI opens without following links, verifies device/inode before and after
reading, accepts exactly one nonempty value where applicable, and keeps secrets
only in process memory.

The parsed URI must have exactly protocol `postgresql`, host
`aws-1-us-east-2.pooler.supabase.com`, port `5432`, database `postgres`, and
username `postgres.diqooqbuchsliypgwksu`, with no fragment and **zero query
parameters**. `host`, `options`, `sslcert`, `sslkey`, duplicate keys, and every
other parameter are rejected. The CA must have SHA-256
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.

The CLIs do not pass `connectionString` to `pg`. They build a `ClientConfig`
from the individually validated host/port/database/user/decoded in-memory
password, exact CA bytes with TLS verification, and fixed startup option
`-c default_transaction_read_only=off`; URL fields cannot override that config.
On the same client they prove `session_user=postgres`,
`current_database()=postgres`, expected server identity,
`SHOW transaction_read_only=off`, then execute exactly
`SELECT set_config('megacampus.q12_capability', $1, false)` with only the second
argument parameterized before any migration statement. They never copy a
secret to environment, argv, errors, telemetry, logs, or artifacts.
This contract applies to
`document-evidence-approved.ts` and
`document-evidence-observability-index.ts`; their ordinary non-Q12 programmatic
APIs may still accept an already in-memory URL.

### 9. Sole live cutover supervisor

`deploy/qdrant/q12-live-cutover.sh` is the only live Q12 entrypoint. Operators
must not run its backup, restore, migration, recovery, reindex, snapshot,
deployment, or activation subcommands manually. The script has a non-mutating
`--plan` mode and requires the exact release SHA, operator digest, secret path,
CA path, backup directory, expected migration frontier, expected source counts,
expected point count, writer inventory manifest, and confirmation phrase for
live mode.

The root invocation shape is fixed and does not carry a secret value:

```text
deploy/qdrant/q12-live-cutover.sh live \
  --host megacampus-prod \
  --release-sha "$RELEASE_SHA" \
  --operator-digest "$OPERATOR_DIGEST" \
  --credential-file "$CREDENTIAL_FILE" \
  --ca-file "$CA_FILE" \
  --backup-dir /opt/megacampus/backups/supabase \
  --migration-frontier 20260704150249 \
  --expected-post-migration-catalog "$EXPECTED_POST_MIGRATION_CATALOG" \
  --expected-post-migration-catalog-sha256 "$EXPECTED_POST_MIGRATION_CATALOG_SHA256" \
  --recoverable-documents 234 \
  --audited-failed-documents 6 \
  --expected-points 12114 \
  --confirm 'I AUTHORIZE MC2 Q12 LIVE CUTOVER'
```

The local supervisor transfers a release-SHA/hash-manifested public bundle,
executes one remote controller over one SSH session, and sends the credential
only through that controller's standard input. The remote controller installs
executables as `claude-deploy:claude-deploy` mode `0700` below
`/opt/megacampus/deploy/{postgres,qdrant}/`, the CA as
`claude-deploy:claude-deploy` mode `0644` at
`/opt/megacampus/secrets/prod-ca-2021.crt`, and the URI as
`claude-deploy:claude-deploy` mode `0600` at
`/opt/megacampus/secrets/supabase_db_url`. It requires
`/opt/megacampus/backups/supabase` to be an owner-only mode-`0700` regular
directory and rejects every symlink, hash, owner, group, mode, mount, or release
identity mismatch. Temporary upload names are unique to the run and removed on
every exit. `CA_FILE` must hash to
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`;
the implementation plan records the final release bundle hashes after the
scripts are accepted.

The supervisor accepts only the SSH alias `megacampus-prod`; direct IP/user
targets are rejected. Every SSH/SCP call uses `BatchMode=yes` and
`StrictHostKeyChecking=yes`, resolves the alias to
`claude-deploy@95.81.98.230:22`, requires the configured identity
`~/.ssh/megacampus/claude-deploy`, pins the ED25519 host-key fingerprint
`SHA256:SgI8FG94qscOaWh7l8wyqNbcGsoGRymyi1iUUl0hAMA`, and requires remote
hostname `info511.fvds.ru` plus UID/GID `1000:1000`. Alias, hostname, user, port,
identity, fingerprint, UID, or GID drift aborts before transfer or mutation.

The supervisor:

1. acquires one host `flock`, verifies all pinned file hashes/modes/owners, free
   space, release reachability, container identities, scheduler identity, and
   pre-cutover health without mutation;
2. requires exactly one `claude-deploy` crontab line equal to
   `30 0 * * * /opt/megacampus/scripts/backup_supabase.sh >> /opt/megacampus/logs/backup_supabase.log 2>&1`,
   saves the entire pre-change crontab at
   `/root/mc2-supabase-crontab-pre-q12-<run-id>` as `root:root` mode `0600`,
   removes only that exact line, and proves no MegaCampus/Supabase systemd timer
   exists;
3. captures all ten writer IDs/labels/images/states/restart policies, atomically
   installs the database/cron maintenance barrier, installs the database
   read-only default, then changes restart policies to `no` and stops Web/APIs
   followed by workers; it keeps the lock and quiesce manifest for the whole
   live window;
4. exports the shared database snapshot, produces and validates the backup set,
   then completes the strict isolated restore while writers remain stopped;
5. invokes the two reviewed migrations, extends the already-active guards to
   their new tables, restores the original database default while retaining
   the guards, then invokes database-barrier-capability-bound HTTP source recovery, reindex,
   Qdrant snapshot/restore, quiesce-aware deployment, atomic activation,
   smoke, and observation commands in fixed order;
6. records every accepted state and child-command result in the crash-durable
   journal described below, with no URI, password, row values, tokens, or
   secret environment;
7. either hands writer ownership atomically to the accepted new blue/green
   deployment or follows the rollback state machine below; and
8. never restores the broken legacy line automatically. After `observed` and
   zero guard residue it records `cutover_terminal`, releases the cutover lock,
   and starts a separate post-cutover scheduler session under the dedicated
   schedule lock; that session installs/enables the reviewed replacement only
   after its own operator run and restore drill pass.
   If replacement scheduling fails, the exact legacy line stays disabled and
   the saved crontab remains rollback evidence rather than permission to restore
   broken behavior.

### 10. Replacement PostgreSQL backup schedule

The replacement is systemd-only and uses these exact tracked units:

- `deploy/systemd/megacampus-supabase-backup.service`: `Type=oneshot`,
  `User=claude-deploy`, `Group=claude-deploy`, `UMask=0077`,
  `Wants=network-online.target`, `After=network-online.target`,
  `TimeoutStartSec=2h`,
  `WorkingDirectory=/opt/megacampus`, and
  `ExecStart=/opt/megacampus/deploy/postgres/scheduled-backup-run.sh`;
- `StandardOutput=append:/opt/megacampus/logs/backup-supabase.log` and
  `StandardError=append:/opt/megacampus/logs/backup-supabase.log`, with
  `NoNewPrivileges=true`,
  `PrivateTmp=true`, `ProtectSystem=strict`, a read-only secret/deploy path, and
  only the backup/log directories writable;
- `deploy/systemd/megacampus-supabase-backup.timer`:
  `OnCalendar=*-*-* 00:30:00 Europe/Amsterdam`, `Persistent=true`,
  `AccuracySec=1m`, `RandomizedDelaySec=0`,
  `Unit=megacampus-supabase-backup.service`, and
  `[Install] WantedBy=timers.target`.

`scheduled-backup-run.sh` is a separate scheduler-only entrypoint, not a Q12
child. It refuses an active Q12 host lock/journal, uses a distinct nonblocking
backup lock, generates its own UUID, invokes the same validated backup core
with fixed owner-only paths, and records a scheduler journal. It accepts no
lease/capability/URI arguments. The live supervisor never invokes this wrapper;
all live backups continue through the single-use `pg.backup` host command
capability.

The post-cutover supervisor invokes only
`/opt/megacampus/deploy/postgres/install-supabase-backup-schedule.sh --run-id
<run-id> --service-sha256 <sha> --timer-sha256 <sha> --confirm 'INSTALL MC2
SUPABASE BACKUP SCHEDULE'`. That installer acquires the dedicated schedule lock,
accepts no unit content or command override, validates the tracked hashes, and
records the new journal lease epoch before any unit mutation.

Root installs both units as `root:root` mode `0644` under `/etc/systemd/system`,
requires host timezone `Europe/Amsterdam`, and proves the active/enabled
`networking.service` dependency reaches `network-online.target`. It runs
`systemd-analyze verify` and `daemon-reload`, starts the still-disabled timer in
a controlled observation window, and watches for the possible immediate
`Persistent=true` catch-up. If catch-up runs, that exact generation becomes the
required scheduled proof; if not, root starts the service exactly once. Only
after the resulting generation and isolated restore drill pass does root run
`systemctl enable megacampus-supabase-backup.timer` while leaving the already
observed timer active. No unobserved `--now` duplicate is allowed. The old cron
line remains disabled and is never restored. Unit install, timezone, network
ordering, schedule, owner, next-elapse, log append, successful run, and
failure-state evidence are journaled. Any install/run/drill failure leaves the
timer disabled (or explicitly failed) with no silent cron fallback.

### 11. Crash-durable journal and recovery

The remote journal is
`/opt/megacampus/backups/q12/<run-id>/phase.jsonl`, owner
`claude-deploy:claude-deploy`, mode `0600`, schema
`megacampus.q12.cutover-journal/v1`. Each canonical JSON line contains exactly
`schema`, UUID `run_id`, monotonic `seq`, `phase`, `outcome`, UTC timestamp,
`release_sha`, `operator_digest`, `command_id`, `command_sha256`,
`lease_epoch` (`cutover`, `postcutover_schedule`, or the separately authorized
`credential_rotation`), `previous_hash`,
`entry_hash`, `rotation_required`, and hashes of the current
resource/quiesce/capability manifests. Raw argv, secrets, tokens, source rows,
and request bodies are forbidden.

The controller opens the file with `O_APPEND|O_DSYNC`, writes one canonical
newline-terminated record, fsyncs the descriptor and parent directory, and
verifies the full hash chain plus strict phase/sequence before and after every
mutation. A separate owner-only checkpoint is written to a unique file, fsynced,
renamed atomically, and parent-fsynced only after comparing its recorded
device/inode/previous hash with the live journal (CAS). A single inherited
cutover `flock` file descriptor is held from preflight through
`cutover_terminal`. Post-cutover scheduler verification starts only after that
descriptor is closed and uses its distinct schedule/backup locks; there is no
overlapping mutator or silent lease transfer.

Every mutating child command refuses direct execution unless it receives the
inherited lease descriptor, exact run ID, checkpoint hash, and a mode-`0400`
single-use **host command capability** file naming its command ID and canonical
argument hash. This per-command claim is distinct from, never mounted as, and
never substitutes for the run-bound database barrier capability.
The parent publishes it in `capabilities/issued/` and journals issuance. Before
mutation, the capability-validating host wrapper atomically moves it with
`renameat2(RENAME_NOREPLACE)` to `capabilities/claimed/`, fsyncs both
directories, appends/fsyncs a `claimed` journal entry, and only then invokes the
frozen command. A second claimant or replay fails before mutation. Completion
moves the claim to `completed/` only after command-specific evidence and result
hash are durable. A crash with a claimed capability never replays it; recovery
inspects idempotent resource/ledger/catalog evidence and may issue a new
recovery host command capability only for the one phase-proven continuation.

`SIGKILL`, a torn final line, SSH loss, controller death, Docker restart, and
host reboot never trigger automatic mutation, cleanup, resume, or writer start.
Before activation the application restart policies remain `no` and persisted
guard triggers remain fail-closed. After the atomic activation commit, the
database receipt plus prepared active-color/container manifest makes recovery
finish the already-live handoff rather than attempt a pre-activation rollback.
A torn/invalid tail is retained as incident evidence and never silently
truncated. Recovery is only:

```text
deploy/qdrant/q12-live-cutover.sh recover \
  --host megacampus-prod \
  --run-id <the-existing-UUID>
```

Without a second phase-specific confirmation this command is read-only: it
validates the chain/checkpoint, inspects live resources, database/guard state,
writers and restart policies, and prints the one permitted resume or rollback
command. A subsequent `recover --run-id ... --resume-from <phase> --confirm
'RESUME MC2 Q12 <run-id> FROM <phase>'` or `--rollback-from <phase> --confirm
'ROLL BACK MC2 Q12 <run-id> FROM <phase>'` must exactly match the durable state.
Ambiguous resources, a bad chain, missing guard/default, changed container ID,
or unknown child result permits no automated continuation.

### 12. Frozen child-command capabilities

The tracked `deploy/qdrant/q12-command-manifest.json` is installed by exact hash
at `/opt/megacampus/deploy/qdrant/q12-command-manifest.json`. The only generic
host launcher is:

```text
/opt/megacampus/deploy/qdrant/q12-capability-run.sh run \
  --run-id <run-id> --command-id <id> --lease-fd <fd> \
  --checkpoint <hash> --capability <absolute-file>
```

It accepts no `--`, shell text, extra argv, environment override, or remote
Docker context. It claims the capability first, loads the exact executable,
working directory, argv array and allowed file descriptors from the hashed JSON
manifest, substitutes only typed values from the already-hashed run input or a
prior fsynced resource manifest already bound to the checkpoint (for example an
accepted created container ID), recomputes the canonical command hash, and then
execs. It never substitutes a fresh live lookup. For Qdrant Compose calls the
host launcher owns the lease; the
container never receives a host FD or host-command capability path. The exact
immutable ephemeral operator prefix inside the JSON is:

```text
/opt/megacampus/deploy/qdrant/operator-compose.sh
--project-directory /opt/megacampus
-f /opt/megacampus/docker-compose.infra.yml
--env-file /opt/megacampus/.env.production
--profile operator run --rm --no-deps -T
```

The distinct long-running worker prefix is identical only through `run`, then
uses `--no-deps` without `--rm` or `-T`. Its container is retained for exact-ID
stop, evidence capture, and a separately capability-gated removal; the manifest
rejects `--rm` and every unlisted worker-create option.

The manifest has no prose entries and contains exactly these command IDs and
literal argv arrays. The table is compact design notation: `operator prefix`,
`worker prefix`, `SOURCE_RESUME`, `SOURCE_ROLLBACK`, `RECOVERY_BINDING`, and
`EXPECTED_CATALOG` refer to the literal arrays defined here, never to prose
stored in JSON:

- `SOURCE_RESUME` is
  `/opt/megacampus/deploy/qdrant/source-recovery-run.sh --operation forward
--run-id <recovery-run-id> --project-directory /opt/megacampus --env-file
/opt/megacampus/.env.production --manifest
/var/lib/megacampus-source-recovery/state/manifest.json --progress-directory
/var/lib/megacampus-source-recovery/state/progress --development-root
/opt/megacampus/data/uploads-dev --production-root
/opt/megacampus/data/uploads --q12-db-capability-file
/opt/megacampus/backups/q12/<run-id>/secrets/db-capability --external-quiesce-manifest
<quiesce-manifest>`;
- `SOURCE_ROLLBACK` is the same literal path array as `SOURCE_RESUME`, with
  `--operation rollback` and no `--resume-from`;
- `RECOVERY_BINDING` is
  `--recovery-manifest-path
/var/lib/megacampus-source-recovery/state/manifest.json
--recovery-journal-path
/var/lib/megacampus-source-recovery/state/progress/journal.json
--recovery-run-id <recovery-run-id> --recovery-manifest-sha256
<accepted-recovery-manifest-sha256> --accepted-coverage-fingerprint
<accepted-coverage-fingerprint>`, followed by one literal
  `--accepted-coverage-run <organization-uuid>:<course-uuid>:<coverage-run-uuid>`
  pair for every accepted course, sorted bytewise by that full value. The
  accepted run input freezes the complete nonempty list and its count/hash;
- the reindex artifact is always
  `/var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json` for plan, execute,
  and verify;
- `EXPECTED_CATALOG` is
  `--expected-post-migration-catalog
/opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json
--expected-post-migration-catalog-sha256
<expected-post-migration-catalog-sha256>`; the file embeds and binds the
  independently derived base structural hash used by `barrier.install`;
- the manifest-defined child environment is rebuilt from a minimal fixed base,
  not inherited. Snapshot freezes `QDRANT_SNAPSHOT_STORAGE_MODE=local` and an
  empty `QDRANT_SNAPSHOT_OBJECT_PREFIX`; restore freezes
  `QDRANT_SNAPSHOT_MANIFEST_FILE` to the exact just-created, hash-bound manifest
  and `QDRANT_RECOVERY_PROBE_FILE` to the exact accepted, hash-bound probe. Those
  two host paths select Compose secret sources; the container still receives
  only `/run/secrets/snapshot_manifest` and `/run/secrets/recovery_probe`.

Implementation expands every reference into separate argv/environment elements
before hashing, installation, or capability issuance; an unresolved reference,
placeholder, unsorted/repeated coverage entry, inherited environment key, or
path whose inode/hash differs from the run input fails manifest validation.

Every `reindex.*` operator entry prepends the fixed Compose-run options
`-v /opt/megacampus/backups/q12/<run-id>/secrets/db-capability:/run/secrets/q12_db_capability:ro
-e Q12_DB_CAPABILITY_FILE=/run/secrets/q12_db_capability`; the JSON stores them
as separate argv elements and verifies the host file inode/mode before Docker.

| Command IDs                          | Exact frozen operation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `barrier.install`                    | `/opt/megacampus/deploy/qdrant/q12-database-barrier.sh install --run-id <run-id> --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability EXPECTED_CATALOG`                                                                                                                                                                                                                                                                                                                                                                                                               |
| `barrier.activate`                   | `/opt/megacampus/deploy/qdrant/q12-database-barrier.sh activate --run-id <run-id> --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability EXPECTED_CATALOG`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `barrier.verify-after-base`          | `/opt/megacampus/deploy/qdrant/q12-database-barrier.sh verify-extended --after-migration 20260711140000 --run-id <run-id> --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability EXPECTED_CATALOG`                                                                                                                                                                                                                                                                                                                                                                      |
| `barrier.verify-after-observability` | `/opt/megacampus/deploy/qdrant/q12-database-barrier.sh verify-extended --after-migration 20260711151000 --run-id <run-id> --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability EXPECTED_CATALOG`                                                                                                                                                                                                                                                                                                                                                                      |
| `barrier.cleanup`                    | `/opt/megacampus/deploy/qdrant/q12-database-barrier.sh cleanup --run-id <run-id> --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability EXPECTED_CATALOG`                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pg.backup`                          | `/opt/megacampus/deploy/postgres/backup-supabase.sh --q12-run-id <run-id> --snapshot <exported-id>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pg.restore`                         | `/opt/megacampus/deploy/postgres/restore-supabase-drill.sh --generation <immutable-generation> --run-id <run-id> --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `migration.base.apply`               | `/usr/bin/pnpm --filter @megacampus/course-gen-platform migration:document-evidence-approved:apply -- --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability --allow-remote --confirm 'APPLY REMOTE DOCUMENT EVIDENCE BASE 20260711120000 20260711130000 20260711140000'`                                                                                                                                                                                                                                                                                               |
| `migration.observability.apply`      | `/usr/bin/pnpm --filter @megacampus/course-gen-platform migration:document-evidence-observability:apply -- --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability --allow-remote --confirm 'APPLY REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711150000 20260711151000'`                                                                                                                                                                                                                                                                                                |
| `source.forward`                     | `/opt/megacampus/deploy/qdrant/source-recovery-run.sh --operation forward --run-id <recovery-run-id> --project-directory /opt/megacampus --env-file /opt/megacampus/.env.production --plan-input /var/lib/megacampus-source-recovery/plan-input.json --manifest /var/lib/megacampus-source-recovery/state/manifest.json --progress-directory /var/lib/megacampus-source-recovery/state/progress --development-root /opt/megacampus/data/uploads-dev --production-root /opt/megacampus/data/uploads --capability-directory /opt/megacampus/data/source-recovery-capability --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability --external-quiesce-manifest <quiesce-manifest>` |
| `source.resume.execute`              | `SOURCE_RESUME --resume-from execute`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `source.resume.verify`               | `SOURCE_RESUME --resume-from verify`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `source.resume.apply-dispositions`   | `SOURCE_RESUME --resume-from apply-dispositions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `source.resume.verify-dispositions`  | `SOURCE_RESUME --resume-from verify-dispositions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `source.rollback`                    | `SOURCE_ROLLBACK`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `operator.self-check`                | operator prefix + `qdrant-operator self-check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `operator.metrics-check`             | operator prefix + `qdrant-recovery-operator metrics-check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `qdrant.bootstrap`                   | operator prefix + `qdrant-operator bootstrap --physical course_embeddings_v1 --alias course_embeddings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `qdrant.verify.initial`              | operator prefix + `qdrant-operator verify --physical course_embeddings_v1 --alias course_embeddings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `reindex.plan`                       | operator prefix + `qdrant-operator reindex plan --run-id <run-id> --artifact /var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json RECOVERY_BINDING`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `reindex.worker.create`              | worker prefix + `-d --name megacampus-qdrant-reindex-<run-id> -e BULLMQ_QUEUE_NAME=qdrant-reindex-<run-id> -e QDRANT_REINDEX_TARGET_COLLECTION=course_embeddings_v1 qdrant-operator reindex-worker`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `reindex.execute`                    | operator prefix + `-e BULLMQ_QUEUE_NAME=qdrant-reindex-<run-id> qdrant-operator reindex execute --target-collection course_embeddings_v1 --run-id <run-id> --artifact /var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json RECOVERY_BINDING`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `reindex.worker.stop`                | `/usr/bin/docker stop --time 30 <accepted-worker-container-id>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `reindex.worker.remove`              | `/usr/bin/docker rm <accepted-worker-container-id>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `reindex.verify`                     | operator prefix + `qdrant-operator reindex verify --target-collection course_embeddings_v1 --run-id <run-id> --artifact /var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json RECOVERY_BINDING`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `qdrant.snapshot`                    | operator prefix + `-e QDRANT_RECOVERY_LOCK_HELD=1 -e QDRANT_SNAPSHOT_STORAGE_MODE=local -e QDRANT_SNAPSHOT_OBJECT_PREFIX= qdrant-recovery-operator snapshot`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `qdrant.restore-drill`               | operator prefix + `-e QDRANT_RECOVERY_LOCK_HELD=1 qdrant-restore-operator restore-drill`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `deploy.prepare`                     | `/opt/megacampus/scripts/deploy_blue_green.sh --q12-mode prepare-quiesced --run-id <run-id> --release-sha <release-sha> --external-quiesce-manifest <quiesce-manifest>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `deploy.commit`                      | `/opt/megacampus/scripts/deploy_blue_green.sh --q12-mode commit-quiesced --run-id <run-id> --release-sha <release-sha> --external-quiesce-manifest <quiesce-manifest>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `deploy.finalize`                    | `/opt/megacampus/scripts/deploy_blue_green.sh --q12-mode finalize-quiesced --run-id <run-id> --release-sha <release-sha> --external-quiesce-manifest <quiesce-manifest>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `deploy.retire-old`                  | `/opt/megacampus/scripts/deploy_blue_green.sh --q12-mode retire-old-observed --run-id <run-id> --release-sha <release-sha> --external-quiesce-manifest <quiesce-manifest>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `activation.verify`                  | `/opt/megacampus/deploy/qdrant/q12-live-smoke.sh activation --run-id <run-id> --expect enabled=true --expect status=active --expect rollout_percentage=100`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `smoke.stage2`                       | `/opt/megacampus/deploy/qdrant/q12-live-smoke.sh stage2 --run-id <run-id> --fixture-manifest <fixture-manifest>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `smoke.stage4`                       | `/opt/megacampus/deploy/qdrant/q12-live-smoke.sh stage4 --run-id <run-id> --fixture-manifest <fixture-manifest>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `smoke.stage5`                       | `/opt/megacampus/deploy/qdrant/q12-live-smoke.sh stage5 --run-id <run-id> --fixture-manifest <fixture-manifest>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `smoke.stage6`                       | `/opt/megacampus/deploy/qdrant/q12-live-smoke.sh stage6 --run-id <run-id> --fixture-manifest <fixture-manifest>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `smoke.notification-cycle`           | `/opt/megacampus/deploy/qdrant/q12-live-smoke.sh notification-cycle --run-id <run-id> --require firing,resolved`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `smoke.cleanup`                      | `/opt/megacampus/deploy/qdrant/q12-live-smoke.sh cleanup --run-id <run-id> --fixture-manifest <fixture-manifest> --require-zero-residue`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `migration.observability.rollback`   | `/usr/bin/pnpm --filter @megacampus/course-gen-platform migration:document-evidence-observability:rollback -- --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability --allow-remote --confirm 'ROLL BACK REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711151000 20260711150000'`                                                                                                                                                                                                                                                                                         |
| `migration.base.rollback`            | `/usr/bin/pnpm --filter @megacampus/course-gen-platform migration:document-evidence-approved:rollback -- --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability --allow-remote --confirm 'ROLL BACK REMOTE DOCUMENT EVIDENCE BASE 20260711140000 20260711130000 20260711120000'`                                                                                                                                                                                                                                                                                        |
| `deploy.rollback`                    | `/opt/megacampus/scripts/rollback_blue_green.sh production <accepted-previous-release-sha> --q12-run-id <run-id> --external-quiesce-manifest <quiesce-manifest>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `evidence.contain`                   | `/opt/megacampus/deploy/qdrant/q12-live-smoke.sh contain --run-id <run-id> --cohort 0 --mode shadow`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

The JSON freezes the full repeated recovery/coverage arrays, working
directories, UID/GID and generated absolute paths; values are bound to
`run_id`, release SHA, operator digest, source-recovery input hash, and the
independent expected-post-migration catalog/path/hash, database barrier
capability inode/hash, and command hash before issuance. No child script is a
supported live entrypoint without this host capability contract. Every created
fixture has a mandatory `smoke.cleanup` claim even when an earlier smoke fails.
The supervisor cannot issue `reindex.worker.remove` until the stop result,
exact ID/label/image, logs, queue state, and durable execution artifact are
captured and checkpoint-bound. Restore receives only the exact hash-bound
Compose secret source paths from the manifest-defined child environment above.

Accepted phases are `preflight`, `maintenance_guarded`, `quiesced`,
`snapshot_exported`, `backup_committed`, `restore_verified`,
`base_migration_guarded`, `observability_migration_guarded`,
`migrations_applied`, `source_recovered`, `reindex_started`, `qdrant_verified`,
`prepared_quiesced`, `activation_ready`,
`activation_committing`, `activated`, `handoff_complete`, `observed`,
`old_generation_retired`, `guard_cleanup_complete`, `cutover_terminal`,
`schedule_verified`, `credential_rotation_verified`, and `q12_terminal`. The
credential phase may be appended only from the separately authorized `.13.8`
rotation artifact whose consumer inventory, old-password rejection, new
verify-full connection, service observation, rollback state, and hash all pass;
the Q12 supervisor cannot perform or synthesize that mutation. A missing,
repeated, skipped, or out-of-order phase fails closed. Fault-injection tests
cover every boundary, including signal handling, lease handoff, and cleanup
failure.

### 13. Activation observation gate

Observation lasts at least 60 continuous minutes **and** includes one complete
normal course cycle through the live Stage 2/4/5/6 path; satisfying only one
condition is insufficient. The cycle includes a course without documents,
manual conflict handling, automatic conflict resolution, a large-corpus batch,
resume, Stage 5 advisory enrichment, Stage 6 decision-aware retrieval, and
negative tenant/course isolation.

Acceptance requires all of the following for the full relevant window:

- document outcome coverage `100%`, baseline preservation `100%`, isolation
  violations `0`, unresolved P0/P1 incidents `0`;
- Qdrant REST error ratio at most `2%` over 10 minutes and hybrid fallback at
  most `5%` over 15 minutes;
- Qdrant memory at most `85%` of its 2 GiB limit and point-count drop at most
  `10%`, with the initial cutover requiring exactly `12,114` points;
- fewer than `3` degraded automatic decisions over 30 minutes;
- one test notification observed in both firing and resolved states; and
- every activation row remains exactly `enabled=true`, `status=active`,
  `rollout_percentage=100` with the accepted decision/evidence references.

Any threshold breach stops observation, keeps Q12 open, and selects the
phase-aware rollback/incident path; elapsed time does not turn a failed metric
into acceptance.

## Execution Order

1. Accept and integrate the five visible local correction streams in bounded
   parallel waves.
2. Run focused tests, full type-check/build, process verification, docs review,
   Graphify refresh, and independent final review.
3. Obtain narrow GHCR package-write authorization and publish the exact
   release-SHA Qdrant operator with the local build-only publisher.
4. Revalidate the server, current credential, writer container identities, and
   restore image digests.
5. Install the reviewed executor files, CA, and owner-only secret with exact
   hashes/modes/owners, then run only `q12-live-cutover.sh`.
6. Under its one held lock, suspend the broken scheduler, atomically install the
   maintenance guard/cron barrier, then quiesce all ten writers, create the
   shared-snapshot four-file fail-closed backup set, and complete the isolated
   restore drill.
7. Apply only the approved document-evidence migrations while the same writer
   barrier remains held.
8. Execute source recovery to `234 recoverable + 6 audited_failed` without
   writer auto-resume.
9. Reindex exactly 234 documents and verify 12,114 expected Qdrant points,
   tenant/course isolation, RU/EN BM25, RRF, Formula, grouping, and point IDs.
10. Complete the local Qdrant snapshot/restore drill, notifications, three-step
    blue/green handoff, atomic `true/active/100` activation, smoke tests, and
    observation.
11. Remove the inert activation receipt/guard schema with zero residue, install
    and prove the replacement PostgreSQL timer, then rotate the temporary
    database password before Q12 close. On any failure, rotate it before a retry.

No later step may compensate for a failed earlier step.

## Rollback

Before migrations, rollback removes only unaccepted new operators/secrets and
disposable restore resources, retains the successful immutable backup
generation and all historical backups, and leaves the known-broken cron
suspended. One database transaction removes the exact maintenance triggers,
restores captured `cron.job` rows/database settings, and proves baseline catalog
equality before any writer policy or state is restored.

Writer rollback restores only the exact captured prior container state. A
container ID/label change is an incident stop, not permission to start a
replacement. Workers start first, then APIs, then Web; health and Nginx routing
must pass before the next class starts. The captured database default and all
barrier-era database sessions must be restored/renewed, every recorded guard
object must be removed, and zero guard residue must be proven before the first
restart policy is restored or writer starts. Restart policies are restored to
their exact captured values only for the accepted container IDs at this safe
handoff; until then all ten remain `no`.

After `migrations_applied` but before `reindex_started`, the supervisor may run
only the separately accepted migration rollback and source-recovery rollback.
If either is not proven safe, it keeps writers stopped and enters incident mode.
After `reindex_started`, it never blindly resumes the old release or restores
source bytes; it keeps the affected generation stopped and uses the accepted
Qdrant/blue-green incident rollback. On successful handoff, it does not restart
the captured old writer IDs: the deployment command owns and verifies the new
service state. Qdrant Cloud is never a rollback target. External S3 is not
introduced by this design.

Before the atomic database activation commit, rollback keeps the maintenance
guard active until old Nginx/color and exact prior containers are durably ready,
then removes the guard in the same baseline-restoration transaction. At or after
the durable `activated` receipt, pre-activation rollback is forbidden: recovery
finishes the new release handoff and any later incident uses the accepted
blue/green/Qdrant containment path. This removes any interpretation of an
unguarded but uncommitted database state.

The legacy cron line is never a rollback target. If the replacement systemd
timer has not passed its own backup plus restore drill, it remains disabled and
the operator leaves an explicit scheduling incident rather than re-enabling the
known-broken command.

All rollback outcomes are terminal for the exposed database password and thus
require rotation before another live attempt.

## Verification

### Restore and backup TDD

- RED proves stock PostgreSQL fails on missing Supabase roles.
- RED proves extension-version drift fails on the real `pgtap` ACL boundary.
- GREEN fixture proves the exact linux/amd64 Supabase digest, role allowlist,
  direct `supabase_admin` restore actor, separate direct `postgres` cleanup
  actor with fixed read-only startup opt-out, proof, and database-barrier
  `set_config(..., false)`, plus negative missing/wrong opt-out fixtures;
  role-before-ACL ordering, locale and collation version, cron override, strict
  single transaction, exact
  database/extension owner-and-ACL manifest comparison, and zero residue;
- baseline/cutover manifests prove the only transient deltas are exact guards,
  eight disabled cron rows, and read-only default; restore first matches the
  fail-closed snapshot and then the clean baseline after isolated activation;
- concurrent-write fixtures prove archive and manifest consumers share one
  exported snapshot; before/after normalized role-export drift fails closed;
- fault injection covers every step before/after each of four files,
  `renameat2(RENAME_NOREPLACE)`, pointer replacement, retention,
  file/directory fsync, container create/restart, restore, manifest comparison,
  and cleanup; racing destinations/pointers never accept a partial set;
- Secret tests scan argv, Docker inspect output, logs, artifacts, and tracked
  files for synthetic credentials.

### Build-only publisher TDD

- dry-run and command-capture prove the publisher can build only the
  `qdrant-operator` target and cannot reach deploy jobs;
- invalid/unreachable SHA and confirmation fail;
- missing package-write authorization and token leakage fail;
- pushed tag/digest/provenance bind the requested commit exactly;
- each run uses a unique mode-`0700` `DOCKER_CONFIG`, mode-`0600` config,
  ignores inherited helpers, and leaves zero login/config/token residue after
  success, ordinary failure, or signal; cleanup failure overrides success.

### Writer backend TDD

- exact observed ten-writer fixture;
- blue/green alternatives, absent/duplicate/restarting/unhealthy containers;
- atomic guard installation drains writers before commit; ordinary/browser,
  uncapped service-role, SECURITY DEFINER, Auth and Storage writes fail, while
  database-barrier-capability-bound service-role rollback probes and direct supervisor
  migrations work; `Preference-Applied: tx=rollback`, no sequence, no Auth row,
  no Storage metadata/object bytes and empty pg_net queue are mandatory;
- partition-root row clones, explicit root/leaf truncate triggers, eight exact
  cron suspend/restore rows, fixed function owner/search path/privileges and
  post-migration guard coverage all have exact-set tests;
- unrelated services remain untouched;
- signal/crash/reboot before/during partial policy updates proves the durable
  guard blocks untouched auto-restarting writers; prepared Web/API/workers are
  created no-start, set to restart=`no`, and journaled before start;
- recreated container ID and changed Compose label fail closed;
- standalone exact prior state restoration;
- external-quiesce mode proves no automatic resume through recovery, reindex,
  cutover, and observation.

### Migration and blue/green TDD

- both migration CLIs reject environment/argv URLs in Q12 mode and accept only
  canonical owner/mode-checked DB/CA/capability files; wrong host/port/db/user,
  any URL query/fragment, `host`, `options`, TLS key/cert, duplicate parameter,
  symlink, inode swap, unsafe parent, multiline input, URI-shaped error, and
  secret-leak fixtures fail; tests prove no `connectionString` override path;
- `transaction_read_only=off` is proven before migration SQL, and every new
  document-evidence table receives and verifies its guard in the same
  transaction before grants and migration commit; a continuously retrying
  uncapped PostgREST writer proves zero new-table commits before the
  guard-visible commit, and both post-commit verify-only command IDs reject any
  missing/changed guard without repairing it; the concurrent-index packet keeps
  its invalid-index resume/rollback tests and hard-fails pre-execution if a
  table, schema, function, trigger, ACL, or grant statement is injected;
- normal blue/green behavior remains command-compatible; Q12 prepare, commit,
  database activation and finalize require the same durable lease, prepared
  target, expanded recovery manifest and claimed capabilities;
- Q12 rollback tests cover every handoff boundary and never prune or resume a
  writer outside supervisor ownership.

### Top-level supervisor TDD

- exact phase ordering and one held lock/quiesce lease;
- database-default capture, session termination, privileged opt-out, exact
  restoration, and failure-to-restore incident behavior;
- legacy cron capture/disable/no-restore plus exact systemd unit install,
  Europe/Amsterdam/network-online schedule, observed Persistent catch-up,
  scheduler-only wrapper, scheduled backup, isolated restore drill, enablement
  and failure-state checks;
- JSONL schema/hash-chain/sequence, `O_DSYNC`, fsync, checkpoint CAS,
  issued-to-claimed no-replace capabilities, claimed-command recovery, frozen
  JSON argv, torn tail, `SIGKILL`, SSH loss and reboot;
- `recover --run-id` is read-only without exact phase confirmation and refuses
  ambiguous resources or invalid journal state;
- no subcommand can be entered manually in live mode;
- pre-/post-migration and post-`reindex_started` rollback boundaries;
- every command ID, source resume/rollback, reindex `--run-id`, activation,
  Stage 2/4/5/6, notification, containment and mandatory fixture cleanup;
- atomic activation-receipt fault injection proves pre-commit remains guarded
  and post-commit recovery finishes the target handoff;
- successful deployment handoff never restarts captured old production writers;
- every success/failure/signal outcome records `rotation_required=true`;
- the observation gate proves 60 minutes plus one full course cycle and every
  exact threshold, including firing and resolved notification.

### Final gates

- focused backup/restore/operator/writer tests;
- source recovery and reindex tests;
- migrations/recovery/isolation tests;
- pinned Qdrant integration and Compose validation;
- `pnpm type-check`;
- `pnpm build`;
- `scripts/orchestration/run_process_verification.sh`;
- independent correctness and docs review with P0/P1 zero;
- local Graphify update/cluster-only with zero external model/API tokens and no
  Git hooks.

## Parallel Decomposition Matrix

| Stream | Goal                                                                        | Agent                                        | Write zone                                                                                                                                                                                                                                                                                                | Dependencies                               | Verification                                                                                            | Decision                |
| ------ | --------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------- |
| G7     | Shared-snapshot backup, exact restore, replacement backup timer             | DevOps worker + correctness reviewer         | `deploy/postgres/**`, `deploy/systemd/megacampus-supabase-backup.*`, backup/restore/schedule tests, Q12 backup docs                                                                                                                                                                                       | This approved spec                         | real-archive fixture, DB/extension owner equality, atomic generation faults, PG17 restore, timer drill  | Parallel wave 1         |
| M      | File-only credential and read-only opt-out for both approved migration CLIs | Database worker + security reviewer          | `packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts`, `document-evidence-observability-index.ts`, and their exact focused tests                                                                                                                                                | This approved spec                         | path/symlink/inode/mode/URL override tests, secret leak scan, capability/read-only opt-out fixtures     | Parallel wave 2         |
| P      | Local build-only exact-SHA operator publication                             | CI/DevOps worker + security reviewer         | `deploy/qdrant/publish-qdrant-operator.sh` and focused tests                                                                                                                                                                                                                                              | This approved spec                         | dry-run/TDD, isolated Docker config, credential leak scan, digest/provenance review                     | Parallel wave 1         |
| W      | Ten-writer quiesce, restart-policy persistence and database guard           | Runtime/database worker + correctness review | `deploy/qdrant/source-recovery-run.sh`, `deploy/qdrant/q12-database-barrier.sh`, `packages/course-gen-platform/tools/qdrant/source-recovery-{database,reindex-adapters}.ts`, `reindex-course-embeddings.ts`, `packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh`, and exact focused tests | Current host inventory, this approved spec | exact ten-writer fixture, cron/Auth/Storage/partition probes, capability header, crash/reboot recovery  | Parallel wave 1         |
| H      | Quiesce-aware blue/green prepare, commit and rollback handoff               | Deployment worker + correctness reviewer     | `scripts/deploy_blue_green.sh`, `scripts/rollback_blue_green.sh`, `scripts/ci/test_blue_green_fail_closed.sh`, focused Q12 handoff tests                                                                                                                                                                  | Frozen W lease/capability interface        | normal-mode compatibility; prepare/commit/rollback fail-closed fixtures                                 | Parallel wave 2 after W |
| Root   | Integrate supervisor, verify, docs/Graphify/Beads, execute authorized order | Root orchestrator                            | `deploy/qdrant/q12-live-cutover.sh`, `q12-capability-run.sh`, `q12-command-manifest.json`, `q12-live-smoke.sh`, integration docs/artifacts/tests                                                                                                                                                          | Accepted G7/M/P/W/H                        | hash-chain/capability/recovery fault injection, full local gates, independent review, live observations | Sequential join         |

No worker receives the live database credential. Only the root live executor
handles it after all local streams are accepted.

## Non-goals

- no production off-host S3 implementation;
- no PostgreSQL major upgrade;
- no suppression of owner, ACL, role, extension, trigger, policy, or restore
  errors;
- no full self-hosted Supabase application stack;
- no change to courses without documents or baseline-first Stage 5 behavior;
- no Qdrant Cloud recovery or mutation;
- no password rotation inside implementation streams;
- no deploy, registry push, migration, source copy, reindex, or cutover
  before local acceptance.

## Consulted primary sources

- PostgreSQL 17 `pg_dump` and global-object boundary:
  https://www.postgresql.org/docs/17/app-pgdump.html
- PostgreSQL 17 `pg_dumpall --roles-only` boundary:
  https://www.postgresql.org/docs/17/app-pg-dumpall.html
- PostgreSQL 17 `pg_restore` transaction/error semantics:
  https://www.postgresql.org/docs/17/app-pgrestore.html
- PostgreSQL 17 transaction snapshots:
  https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION
- PostgreSQL 17 database defaults and transaction read-only setting:
  https://www.postgresql.org/docs/17/sql-alterdatabase.html and
  https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-DEFAULT-TRANSACTION-READ-ONLY
- PostgreSQL 17 trigger and session-identity semantics:
  https://www.postgresql.org/docs/17/sql-createtrigger.html and
  https://www.postgresql.org/docs/17/functions-info.html
- PostgreSQL 17 database creation/locale/collation version:
  https://www.postgresql.org/docs/17/sql-createdatabase.html
- PostgREST 14 transaction-end preference (`db-tx-end`, `tx=rollback`):
  https://docs.postgrest.org/en/v14/references/api/preferences.html#transaction-end-preference
- PostgREST 14 request header and JWT transaction settings:
  https://docs.postgrest.org/en/v14/references/transactions.html#request-headers-cookies-and-jwt-claims
- Supabase official Docker Compose and PostgreSQL image family:
  https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml
- Supabase database connection guidance:
  https://supabase.com/docs/guides/database/connecting-to-postgres
- Supavisor password-rotation safety:
  https://supabase.com/docs/guides/troubleshooting/supavisor-error-circuit-breaker-open-after-password-rotation-0fdb72
- Supabase Cron/pg_cron and Storage architecture:
  https://supabase.com/docs/guides/cron and
  https://supabase.com/docs/guides/getting-started/architecture
- pg_cron `cron.launch_active_jobs` restore isolation:
  https://github.com/citusdata/pg_cron#extension-settings
- GitHub manual workflow default-branch requirement:
  https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow
- GitHub Container Registry CLI PAT/scopes:
  https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- GitHub container publication and provenance permissions:
  https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
- Docker CLI login/credential storage and restart policies:
  https://docs.docker.com/reference/cli/docker/login/ and
  https://docs.docker.com/engine/containers/start-containers-automatically/
- Docker Compose service/restart contract:
  https://docs.docker.com/reference/compose-file/services/
- Docker Compose create-without-start contract:
  https://docs.docker.com/reference/cli/docker/compose/up/
- Linux atomic `renameat2(RENAME_NOREPLACE)` contract:
  https://man7.org/linux/man-pages/man2/rename.2.html
- node-postgres connection configuration (repo uses `pg` 8.16.3):
  https://node-postgres.com/features/connecting
- systemd 255 service, execution sandbox, network-online, and calendar timer
  contracts:
  https://www.freedesktop.org/software/systemd/man/255/systemd.service.html,
  https://www.freedesktop.org/software/systemd/man/255/systemd.exec.html,
  https://systemd.io/NETWORK_ONLINE/, and
  https://www.freedesktop.org/software/systemd/man/255/systemd.timer.html
