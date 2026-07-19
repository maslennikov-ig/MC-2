#!/usr/bin/env python3
"""Q12 R8 rehearsal — VENDORED, server-self-contained seed + REAL-catalog machinery.

Deploy-side vendoring of the MINIMAL seed and REAL expected-post-migration-catalog
machinery the rehearsal driver (rehearsal-setup.py) needs, so the driver depends ONLY
on the deployed ``deploy/qdrant/`` subset present on megacampus-prod: NO ``packages/``
test tree, NO ``node_modules``/``tsx``, NO ``cwd=REPO``.

Every constant/function below is copied VERBATIM from the fusion-harness fixtures
(provenance cited per block); the ONLY intentional deviation is ``STRUCTURAL_CATALOG``,
which is repointed to the deploy-side sibling ``deploy/qdrant/q12-structural-catalog.sql``
(server-present) instead of the fixtures' repo-root path into the (undeployed)
``packages/`` tree.

The REAL expected-post-migration catalog is computed from the seeded+migrated disposable
container via ``docker exec … psql`` against ``deploy/qdrant/q12-structural-catalog.sql``
— NEVER synthesized, and NEVER via ``tsx`` / ``q12-source-manifest.ts``. That TS tool is
used by the fixtures ONLY for a separate ``validateTransition`` assertion the rehearsal
does not perform, so the REAL catalog leg needs no TS toolchain.

Provenance:
  * IMAGE / PW / POOLER_HOST / POOLER_USER, the seed inventory constants, SEED_SQL,
    canonical, sha256_hex, _generate_self_signed
      <- q12-live-real-barrier-cutover-runner.py  (r4c)
  * BASE/OBS migration constants, _dexec_scalar, _dexec_json, _build_expected_catalog
      <- q12-live-real-full-window-runner.py       (fw)
"""
from __future__ import annotations

import json
import os
import pathlib
import subprocess

# --- deploy-side rebind (the ONLY intentional deviation from the fixture originals) ---
# The fixtures resolve this from the repo root (REPO / "deploy/qdrant/..."); on the deploy
# subset the file is a sibling of this rehearsal dir, so read it via the deploy tree.
# parents[1] == deploy/qdrant  ->  deploy/qdrant/q12-structural-catalog.sql (server-present).
STRUCTURAL_CATALOG = pathlib.Path(__file__).resolve().parents[1] / "q12-structural-catalog.sql"

# DOCKER identity vendored verbatim from r4c (fw's ``DOCKER = r4c.DOCKER``) so the REAL
# catalog computation behaves identically to the fusion harness the barrier was proven against.
DOCKER = os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker")


# ============================================================================ #
# VENDORED VERBATIM  <-  q12-live-real-barrier-cutover-runner.py (r4c)          #
# ============================================================================ #

# r4c:51-54 — image / password / frozen pooler identity
IMAGE = "postgres:17.10-bookworm"
PW = "q12-r4c-real-barrier-pw"
POOLER_HOST = "aws-1-us-east-2.pooler.supabase.com"
POOLER_USER = "postgres.diqooqbuchsliypgwksu"

# r4c:62-71 — seed inventory counts + storage table names
PUBLIC_COUNT = 47
AUTH_COUNT = 22
STORAGE_NAMES = [
    "buckets",
    "buckets_analytics",
    "objects",
    "s3_multipart_uploads",
    "s3_multipart_uploads_parts",
]
CRON_COUNT = 8

# r4c:73-123 — SEED_SQL: full Supabase inventory (47 public / 22 auth / 5 storage /
#              8 cron + net + supabase_migrations)
SEED_SQL = f"""
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;

CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigint PRIMARY KEY,
  schedule text NOT NULL,
  command text NOT NULL,
  nodename text NOT NULL DEFAULT 'localhost',
  nodeport int NOT NULL DEFAULT 5432,
  database text NOT NULL DEFAULT 'postgres',
  username text NOT NULL DEFAULT 'postgres',
  active boolean NOT NULL DEFAULT true,
  jobname text UNIQUE
);
INSERT INTO cron.job (jobid, schedule, command)
  SELECT g, '*/5 * * * *', 'select ' || g FROM generate_series(1,{CRON_COUNT}) g;

CREATE SCHEMA net;
CREATE TABLE net.http_request_queue (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, url text);

CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260101000000', ARRAY['SELECT 1'], 'seed');

CREATE SCHEMA auth;
DO $do$
DECLARE i int;
BEGIN
  FOR i IN 0..{AUTH_COUNT - 1} LOOP
    EXECUTE format('CREATE TABLE auth.auth_table_%s (id bigint PRIMARY KEY)', lpad(i::text, 2, '0'));
  END LOOP;
END $do$;

CREATE SCHEMA storage;
{chr(10).join(f"CREATE TABLE storage.{name} (id text PRIMARY KEY);" for name in STORAGE_NAMES)}

DO $do$
DECLARE i int;
BEGIN
  FOR i IN 0..{PUBLIC_COUNT - 1} LOOP
    EXECUTE format('CREATE TABLE public.public_table_%s (id bigint PRIMARY KEY)', lpad(i::text, 2, '0'));
  END LOOP;
END $do$;
"""


# r4c:126-127 — canonical
def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


# r4c:130-133 — sha256_hex
def sha256_hex(data: bytes) -> str:
    import hashlib

    return hashlib.sha256(data).hexdigest()


# r4c:676-702 — _generate_self_signed (pooler-identity proxy cert/key)
def _generate_self_signed(cert_path: pathlib.Path, key_path: pathlib.Path, hostname: str) -> None:
    result = subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(key_path),
            "-out",
            str(cert_path),
            "-days",
            "2",
            "-subj",
            f"/CN={hostname}",
            "-addext",
            f"subjectAltName=DNS:{hostname}",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"self-signed certificate generation failed: {result.stderr.strip()}")
    key_path.chmod(0o600)
    cert_path.chmod(0o644)


# ============================================================================ #
# VENDORED VERBATIM  <-  q12-live-real-full-window-runner.py (fw)               #
# ============================================================================ #

# fw:94-107 — base/observability migration constants consumed by _build_expected_catalog
BASE_MIGRATION = "20260711140000"
OBS_MIGRATION = "20260711151000"
BASE_DDL = "CREATE TABLE public.document_evidence_runs (id bigint PRIMARY KEY);"
OBS_DDL = "CREATE TABLE public.document_evidence_observability_totals (id bigint PRIMARY KEY);"
BASE_RELATIONS = [
    {"schema": "public", "name": "document_evidence_runs", "relkind": "r",
     "parent_schema": None, "parent_name": None, "owner": "postgres"}
]
OBS_RELATIONS = [
    {"schema": "public", "name": "document_evidence_observability_totals", "relkind": "r",
     "parent_schema": None, "parent_name": None, "owner": "postgres"}
]
BASE_FILE_SHA = sha256_hex(BASE_DDL.encode("utf-8"))
OBS_FILE_SHA = sha256_hex(OBS_DDL.encode("utf-8"))


# fw:543-551 — _dexec_scalar
def _dexec_scalar(container: str, sql: str) -> str:
    result = subprocess.run(
        [DOCKER, "exec", "-i", container, "psql", "-X", "-q", "-t", "-A",
         "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        input=sql, text=True, capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"scalar query failed: {result.stderr.strip()}")
    return result.stdout.strip()


# fw:554-563 — _dexec_json
def _dexec_json(container: str, sql: str):
    wrapped = f"SELECT coalesce(json_agg(row_data), '[]'::json) FROM ({sql}) row_data;"
    result = subprocess.run(
        [DOCKER, "exec", "-i", container, "psql", "-X", "-t", "-A",
         "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        input=wrapped, text=True, capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"catalog query failed: {result.stderr.strip()}")
    return json.loads(result.stdout.strip())


# fw:566-644 — _build_expected_catalog (REAL catalog from the seeded+migrated container)
def _build_expected_catalog(container: str) -> tuple[dict, str, str, str, str]:
    """Build the REAL expected-post-migration catalog from the seeded+migrated container, exactly
    as the R8-B-2-iii verify-chain runner does (real structural hashes baked in)."""
    structural_query = STRUCTURAL_CATALOG.read_text(encoding="utf-8")

    def structural_after(*ddls: str) -> str:
        body = "BEGIN;\n" + "".join(f"{d}\n" for d in ddls)
        body += f"SELECT structural_sha256 FROM (\n{structural_query}\n) canonical;\n"
        body += "ROLLBACK;\n"
        return _dexec_scalar(container, body)

    baseline = structural_after()
    after_base = structural_after(BASE_DDL)
    after_obs = structural_after(BASE_DDL, OBS_DDL)

    def rows(schema: str):
        return _dexec_json(
            container,
            "SELECT c.relname AS name, c.oid::bigint AS oid, r.rolname AS owner "
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "JOIN pg_roles r ON r.oid=c.relowner "
            f"WHERE n.nspname='{schema}' AND c.relkind IN ('r','p') ORDER BY c.relname",
        )

    public_rows = rows("public")
    auth_rows = rows("auth")
    storage_rows = rows("storage")
    cron_row = _dexec_json(
        container,
        "SELECT c.oid::bigint AS oid, r.rolname AS owner FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner "
        "WHERE n.nspname='cron' AND c.relname='job'",
    )[0]
    net_row = _dexec_json(
        container,
        "SELECT c.oid::bigint AS oid, r.rolname AS owner FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner "
        "WHERE n.nspname='net' AND c.relname='http_request_queue'",
    )[0]
    cron_jobs_real = _dexec_json(container, "SELECT jobid, command FROM cron.job ORDER BY jobid")

    def guarded(schema, name, oid, owner):
        return {"schema": schema, "name": name, "oid": oid, "relkind": "r",
                "parent_oid": None, "owner": owner}

    guarded_relations = (
        [guarded("public", r["name"], r["oid"], r["owner"]) for r in public_rows]
        + [guarded("auth", r["name"], r["oid"], r["owner"]) for r in auth_rows]
        + [guarded("storage", r["name"], r["oid"], r["owner"]) for r in storage_rows]
        + [guarded("cron", "job", cron_row["oid"], cron_row["owner"]),
           guarded("net", "http_request_queue", net_row["oid"], net_row["owner"])]
    )
    if len(guarded_relations) != 76:
        raise RuntimeError(f"guarded_relations count drifted: {len(guarded_relations)}")
    cron_jobs_catalog = [
        {"jobid": r["jobid"], "username": "postgres",
         "command_sha256": sha256_hex(r["command"].encode("utf-8"))}
        for r in cron_jobs_real
    ]
    catalog = {
        "schema_version": "megacampus.q12.expected-post-migration-catalog/v1",
        "database": "postgres", "database_owner": "postgres",
        "release_sha": "1" * 40, "migration_frontier": "20260704150249",
        "baseline_structural_sha256": baseline,
        "expected_post_migration_catalog_sha256": after_obs,
        "inventory_counts": {"public": PUBLIC_COUNT, "auth": AUTH_COUNT, "storage": 5,
                             "cron_jobs": CRON_COUNT, "pg_net_queue": 0},
        "guarded_relations": guarded_relations,
        "cron_jobs": cron_jobs_catalog,
        "migrations": {
            BASE_MIGRATION: {"catalog_sha256": after_base, "migration_file_sha256": BASE_FILE_SHA,
                             "relations": BASE_RELATIONS},
            OBS_MIGRATION: {"catalog_sha256": after_obs, "migration_file_sha256": OBS_FILE_SHA,
                            "relations": OBS_RELATIONS},
        },
    }
    seed_counts = {"public": len(public_rows), "auth": len(auth_rows),
                   "storage": len(storage_rows), "cron": CRON_COUNT, "net": 0}
    return catalog, baseline, after_base, after_obs, seed_counts
