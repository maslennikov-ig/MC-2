-- ===========================================================================
-- Q12 D6 activation-truth read-only SQL projection (FD 11).
--
-- Authority: docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md
-- section "Database transaction, lock and SQL allowlist". Every template below
-- is strictly READ ONLY. This bundle contains no arbitrary DDL/DML, no COPY, no
-- set_config capability installation, no repair, no termination, no advisory
-- unlock, no activation replay, and no untrusted identifiers. The mutation
-- verbs UPDATE/DELETE/TRUNCATE/MAINTAIN appear only as quoted privilege-name
-- literals inside has_table_privilege(...).
--
-- The full-catalog LOCK TABLE ... IN SHARE MODE lists the complete accepted
-- catalog in the accepted W byte order (W tuple field 9
-- activation_lock_order_sha256 = de79e836a943bf9d4003a963bf3515b9401d5322b59067c8a6688e6c95de62ae;
-- catalog set field 8 activation_lock_catalog_sha256 =
-- 05ee4e733ed59733d1effd20835089a2fa2996ba1a773b748ae515ba295dbf8f).
--
-- mc2-34eua: cron.job is NOT in either list. SHARE MODE is stronger than ACCESS SHARE, so it needs
-- UPDATE/DELETE/TRUNCATE/MAINTAIN, and production `postgres` holds only SELECT on the
-- supabase_admin-owned cron.job -- this probe would have raised 42501 exactly as barrier.install
-- did. The cron_jobs template below still READS cron.job; reads need no such privilege.
--
-- Templates are delimited by "--@template <name>" / "--@end <name>" markers so
-- the probe's allowlist guard can split and match them exactly (Task 5).
-- ===========================================================================

--@template transaction_begin
BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
SET LOCAL lock_timeout = '120s';
SET LOCAL statement_timeout = '180s';
SET LOCAL idle_in_transaction_session_timeout = '300s';
--@end transaction_begin

--@template clear_snapshot
SELECT pg_catalog.pg_stat_clear_snapshot();
--@end clear_snapshot

--@template connection_identity
SELECT
  session_user AS session_user,
  pg_catalog.current_database() AS current_database,
  pg_catalog.current_setting('server_version_num')::int AS server_version_num,
  pg_catalog.pg_backend_pid() AS backend_pid,
  pg_catalog.current_setting('transaction_isolation') AS transaction_isolation,
  pg_catalog.current_setting('transaction_read_only') AS transaction_read_only;
--@end connection_identity

--@template capability_lock_rows
WITH targets(qualified_name) AS (
  VALUES
    ('auth.auth_table_00'),
    ('auth.auth_table_01'),
    ('auth.auth_table_02'),
    ('auth.auth_table_03'),
    ('auth.auth_table_04'),
    ('auth.auth_table_05'),
    ('auth.auth_table_06'),
    ('auth.auth_table_07'),
    ('auth.auth_table_08'),
    ('auth.auth_table_09'),
    ('auth.auth_table_10'),
    ('auth.auth_table_11'),
    ('auth.auth_table_12'),
    ('auth.auth_table_13'),
    ('auth.auth_table_14'),
    ('auth.auth_table_15'),
    ('auth.auth_table_16'),
    ('auth.auth_table_17'),
    ('auth.auth_table_18'),
    ('auth.auth_table_19'),
    ('auth.auth_table_20'),
    ('auth.auth_table_21'),
    ('net.http_request_queue'),
    ('public.document_evidence_observability_totals'),
    ('public.document_evidence_runs'),
    ('public.public_table_00'),
    ('public.public_table_01'),
    ('public.public_table_02'),
    ('public.public_table_03'),
    ('public.public_table_04'),
    ('public.public_table_05'),
    ('public.public_table_06'),
    ('public.public_table_07'),
    ('public.public_table_08'),
    ('public.public_table_09'),
    ('public.public_table_10'),
    ('public.public_table_11'),
    ('public.public_table_12'),
    ('public.public_table_13'),
    ('public.public_table_14'),
    ('public.public_table_15'),
    ('public.public_table_16'),
    ('public.public_table_17'),
    ('public.public_table_18'),
    ('public.public_table_19'),
    ('public.public_table_20'),
    ('public.public_table_21'),
    ('public.public_table_22'),
    ('public.public_table_23'),
    ('public.public_table_24'),
    ('public.public_table_25'),
    ('public.public_table_26'),
    ('public.public_table_27'),
    ('public.public_table_28'),
    ('public.public_table_29'),
    ('public.public_table_30'),
    ('public.public_table_31'),
    ('public.public_table_32'),
    ('public.public_table_33'),
    ('public.public_table_34'),
    ('public.public_table_35'),
    ('public.public_table_36'),
    ('public.public_table_37'),
    ('public.public_table_38'),
    ('public.public_table_39'),
    ('public.public_table_40'),
    ('public.public_table_41'),
    ('public.public_table_42'),
    ('public.public_table_43'),
    ('public.public_table_44'),
    ('public.public_table_45'),
    ('public.public_table_46'),
    ('storage.buckets'),
    ('storage.buckets_analytics'),
    ('storage.objects'),
    ('storage.s3_multipart_uploads'),
    ('storage.s3_multipart_uploads_parts'),
    ('supabase_migrations.schema_migrations')
),
resolved AS (
  SELECT
    t.qualified_name,
    pg_catalog.to_regclass(t.qualified_name) AS oid
  FROM targets t
)
SELECT
  r.qualified_name AS qualified_name,
  r.oid::oid::int8 AS oid,
  pg_catalog.has_table_privilege(session_user, r.oid, 'MAINTAIN') AS priv_maintain,
  pg_catalog.has_table_privilege(session_user, r.oid, 'UPDATE') AS priv_update,
  pg_catalog.has_table_privilege(session_user, r.oid, 'DELETE') AS priv_delete,
  pg_catalog.has_table_privilege(session_user, r.oid, 'TRUNCATE') AS priv_truncate
FROM resolved r
ORDER BY r.qualified_name;
--@end capability_lock_rows

--@template activity_visibility
SELECT
  pg_catalog.pg_has_role(session_user, 'pg_read_all_stats', 'MEMBER') AS pg_read_all_stats_member;
--@end activity_visibility

--@template full_catalog_share_lock
LOCK TABLE
  auth.auth_table_00,
  auth.auth_table_01,
  auth.auth_table_02,
  auth.auth_table_03,
  auth.auth_table_04,
  auth.auth_table_05,
  auth.auth_table_06,
  auth.auth_table_07,
  auth.auth_table_08,
  auth.auth_table_09,
  auth.auth_table_10,
  auth.auth_table_11,
  auth.auth_table_12,
  auth.auth_table_13,
  auth.auth_table_14,
  auth.auth_table_15,
  auth.auth_table_16,
  auth.auth_table_17,
  auth.auth_table_18,
  auth.auth_table_19,
  auth.auth_table_20,
  auth.auth_table_21,
  net.http_request_queue,
  public.document_evidence_observability_totals,
  public.document_evidence_runs,
  public.public_table_00,
  public.public_table_01,
  public.public_table_02,
  public.public_table_03,
  public.public_table_04,
  public.public_table_05,
  public.public_table_06,
  public.public_table_07,
  public.public_table_08,
  public.public_table_09,
  public.public_table_10,
  public.public_table_11,
  public.public_table_12,
  public.public_table_13,
  public.public_table_14,
  public.public_table_15,
  public.public_table_16,
  public.public_table_17,
  public.public_table_18,
  public.public_table_19,
  public.public_table_20,
  public.public_table_21,
  public.public_table_22,
  public.public_table_23,
  public.public_table_24,
  public.public_table_25,
  public.public_table_26,
  public.public_table_27,
  public.public_table_28,
  public.public_table_29,
  public.public_table_30,
  public.public_table_31,
  public.public_table_32,
  public.public_table_33,
  public.public_table_34,
  public.public_table_35,
  public.public_table_36,
  public.public_table_37,
  public.public_table_38,
  public.public_table_39,
  public.public_table_40,
  public.public_table_41,
  public.public_table_42,
  public.public_table_43,
  public.public_table_44,
  public.public_table_45,
  public.public_table_46,
  storage.buckets,
  storage.buckets_analytics,
  storage.objects,
  storage.s3_multipart_uploads,
  storage.s3_multipart_uploads_parts,
  supabase_migrations.schema_migrations
IN SHARE MODE;
--@end full_catalog_share_lock

--@template lock_projection
SELECT
  (n.nspname || '.' || c.relname) AS qualified_name,
  c.oid::oid::int8 AS oid,
  l.mode AS lock_mode,
  l.granted AS granted
FROM pg_catalog.pg_locks l
JOIN pg_catalog.pg_class c ON c.oid = l.relation
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE l.locktype = 'relation'
  AND l.pid = pg_catalog.pg_backend_pid()
  AND l.mode = 'ShareLock'
ORDER BY qualified_name;
--@end lock_projection

--@template active_run_singleton
SELECT pg_catalog.to_jsonb(active_run) AS active_run
FROM q12_guard.active_run AS active_run;
--@end active_run_singleton

--@template structural_catalog
WITH namespaces AS (
  SELECT n.oid, n.nspname, owner.rolname AS owner, n.nspacl
  FROM pg_catalog.pg_namespace n
  JOIN pg_catalog.pg_roles owner ON owner.oid = n.nspowner
  WHERE n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
),
relations AS (
  SELECT c.oid, ns.nspname, c.relname, c.relkind, owner.rolname AS owner, c.relacl
  FROM pg_catalog.pg_class c
  JOIN namespaces ns ON ns.oid = c.relnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = c.relowner
),
columns AS (
  SELECT a.attrelid, a.attnum, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type
  FROM pg_catalog.pg_attribute a
  JOIN relations r ON r.oid = a.attrelid
  WHERE a.attnum > 0 AND NOT a.attisdropped
),
constraints AS (
  SELECT con.conrelid, con.conname, con.contype
  FROM pg_catalog.pg_constraint con
  JOIN relations r ON r.oid = con.conrelid
),
indexes AS (
  SELECT i.indrelid, ic.relname AS indexname, i.indisunique, i.indisprimary
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
  JOIN relations r ON r.oid = i.indrelid
),
functions AS (
  SELECT p.oid, ns.nspname, p.proname, owner.rolname AS owner, p.proacl
  FROM pg_catalog.pg_proc p
  JOIN namespaces ns ON ns.oid = p.pronamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = p.proowner
),
types AS (
  SELECT t.oid, ns.nspname, t.typname, t.typtype
  FROM pg_catalog.pg_type t
  JOIN namespaces ns ON ns.oid = t.typnamespace
),
triggers AS (
  SELECT tg.tgrelid, tg.tgname
  FROM pg_catalog.pg_trigger tg
  JOIN relations r ON r.oid = tg.tgrelid
  WHERE NOT tg.tgisinternal
),
event_triggers AS (
  SELECT et.evtname, et.evtevent, et.evtenabled
  FROM pg_catalog.pg_event_trigger et
),
default_acls AS (
  SELECT d.defaclobjtype, ns.nspname, d.defaclacl
  FROM pg_catalog.pg_default_acl d
  LEFT JOIN namespaces ns ON ns.oid = d.defaclnamespace
)
SELECT pg_catalog.encode(
  pg_catalog.sha256(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'schema_version', 'megacampus.q12.structural-catalog/v1',
        'namespaces', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.nspname), '[]'::jsonb) FROM namespaces x),
        'relations', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.nspname, x.relname), '[]'::jsonb) FROM relations x),
        'columns', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.attrelid, x.attnum), '[]'::jsonb) FROM columns x),
        'constraints', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.conrelid, x.conname), '[]'::jsonb) FROM constraints x),
        'indexes', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.indrelid, x.indexname), '[]'::jsonb) FROM indexes x),
        'functions', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.nspname, x.proname), '[]'::jsonb) FROM functions x),
        'types', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.nspname, x.typname), '[]'::jsonb) FROM types x),
        'triggers', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.tgrelid, x.tgname), '[]'::jsonb) FROM triggers x),
        'event_triggers', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.evtname), '[]'::jsonb) FROM event_triggers x),
        'default_acls', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.defaclobjtype, x.nspname), '[]'::jsonb) FROM default_acls x)
      )::text,
      'UTF8'
    )
  ),
  'hex'
) AS structural_catalog_sha256;
--@end structural_catalog

--@template database_default
SELECT pg_catalog.jsonb_build_object(
  'datname', d.datname,
  'settings', COALESCE(s.setconfig, ARRAY[]::text[])
) AS database_default
FROM pg_catalog.pg_database d
LEFT JOIN pg_catalog.pg_db_role_setting s
  ON s.setdatabase = d.oid AND s.setrole = 0
WHERE d.datname = pg_catalog.current_database();
--@end database_default

--@template cron_jobs
SELECT
  j.jobid AS jobid,
  j.schedule AS schedule,
  j.jobname AS jobname,
  j.active AS active
FROM cron.job j
ORDER BY j.jobid;
--@end cron_jobs

--@template global_pg_net_queue
SELECT pg_catalog.count(*)::int8 AS global_pg_net_queue_count
FROM net.http_request_queue;
--@end global_pg_net_queue

--@template prepared_xacts
SELECT
  px.gid AS gid,
  px."database" AS database,
  px."owner" AS owner
FROM pg_catalog.pg_prepared_xacts px
ORDER BY px.gid;
--@end prepared_xacts

--@template session_activity
-- Provider-plane backends (autovacuum launcher, background writer, etc.) report
-- NULL usename/datname/application_name/state; coalesce them to the exact
-- inventory sentinels ('' and 'none') so background rows match their managed
-- identities instead of tripping the security-restricted-null gate.
SELECT
  sa.pid AS pid,
  COALESCE(sa.usename::text, '') AS role,
  COALESCE(sa.datname::text, '') AS database,
  sa.backend_type AS backend_type,
  COALESCE(sa.application_name, '') AS application_identity,
  COALESCE(sa.state, 'none') AS state,
  (sa.xact_start IS NULL) AS xact_start_is_null,
  (sa.backend_xid IS NULL) AS backend_xid_is_null,
  (sa.backend_xmin IS NULL) AS backend_xmin_is_null,
  pg_catalog.to_char(sa.backend_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS backend_start_utc
FROM pg_catalog.pg_stat_activity sa
ORDER BY sa.pid;
--@end session_activity

--@template transaction_commit
COMMIT;
--@end transaction_commit

--@template transaction_rollback
ROLLBACK;
--@end transaction_rollback
