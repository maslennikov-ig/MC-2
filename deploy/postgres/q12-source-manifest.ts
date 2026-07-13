#!/usr/bin/env -S pnpm exec tsx
import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

type JsonObject = Record<string, unknown>;

const PSQL = '/usr/lib/postgresql/17/bin/psql';
const SCHEMA = 'megacampus.supabase-source-manifest/v1';
const SNAPSHOT_PATTERN = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$/;

function fail(message: string): never {
  throw new Error(message);
}

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an object`);
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const item = value as JsonObject;
    return `{${Object.keys(item)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(item[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function parseFlags(args: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined)
      fail(`invalid argument near ${key ?? '<end>'}`);
    if (result.has(key)) fail(`duplicate argument ${key}`);
    result.set(key, value);
  }
  return result;
}

function required(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (!value) fail(`${name} is required`);
  return value;
}

function quoteLiteral(value: string): string {
  if (value.includes('\0') || value.includes('\n') || value.includes('\r'))
    fail('SQL literal contains a control character');
  return `'${value.replaceAll("'", "''")}'`;
}

function runPsql(sql: string): string {
  const result = spawnSync(
    PSQL,
    [
      '-X',
      '--no-psqlrc',
      '--no-password',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '--set',
      'ON_ERROR_STOP=on',
      '--command',
      sql,
    ],
    {
      encoding: 'utf8',
      env: {
        PATH: '/usr/bin:/bin',
        LC_ALL: 'C',
        PGSERVICE: process.env.PGSERVICE,
        PGSERVICEFILE: process.env.PGSERVICEFILE,
        PGSSLMODE: process.env.PGSSLMODE,
        PGSSLROOTCERT: process.env.PGSSLROOTCERT,
        PGHOST: process.env.PGHOST,
        PGPORT: process.env.PGPORT,
        PGUSER: process.env.PGUSER,
        PGPASSFILE: process.env.PGPASSFILE,
        PGOPTIONS: process.env.PGOPTIONS,
      },
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (result.status !== 0)
    fail(`PostgreSQL 17 manifest query failed with status ${result.status ?? 'signal'}`);
  if (result.stderr.trim() !== '') fail('PostgreSQL 17 manifest query emitted stderr');
  return result.stdout.trim();
}

function catalogSql(snapshot: string | null): string {
  const begin = snapshot
    ? `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT ${quoteLiteral(snapshot)};`
    : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;';
  return `${begin}
COPY (
WITH database_row AS (
  SELECT jsonb_build_object(
    'name', d.datname,
    'owner', pg_get_userbyid(d.datdba),
    'encoding', pg_encoding_to_char(d.encoding),
    'locale_provider', d.datlocprovider::text,
    'collate', d.datcollate,
    'ctype', d.datctype,
    'provider_locale', to_jsonb(d)->>'datlocale',
    'builtin_locale', to_jsonb(d)->>'datbuiltinlocale',
    'icu_locale', d.daticulocale,
    'icu_rules', d.daticurules,
    'collation_version', d.datcollversion,
    'tablespace', t.spcname,
    'connection_limit', d.datconnlimit,
    'allow_connections', d.datallowconn,
    'is_template', d.datistemplate,
    'size_bytes', pg_database_size(d.datname),
    'acl', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'grantor', pg_get_userbyid(a.grantor), 'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
        'privilege', a.privilege_type, 'grantable', a.is_grantable
      ) ORDER BY pg_get_userbyid(a.grantor), a.grantee, a.privilege_type, a.is_grantable)
      FROM aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) a
    ), '[]'::jsonb),
    'settings', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(split_part(setting, '=', 1), substring(setting from position('=' in setting) + 1)) ORDER BY setting)
      FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) setting
      WHERE s.setdatabase = d.oid AND s.setrole = 0
    ), '[]'::jsonb),
    'comment', obj_description(d.oid, 'pg_database'),
    'security_labels', COALESCE((SELECT jsonb_agg(jsonb_build_object('provider', provider, 'label', label) ORDER BY provider, label) FROM pg_seclabel l WHERE l.objoid=d.oid AND l.classoid='pg_database'::regclass), '[]'::jsonb)
  ) value
  FROM pg_database d JOIN pg_tablespace t ON t.oid=d.dattablespace WHERE d.datname=current_database()
), roles AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', rolname, 'rolsuper', rolsuper, 'rolinherit', rolinherit, 'rolcreaterole', rolcreaterole,
    'rolcreatedb', rolcreatedb, 'rolcanlogin', rolcanlogin, 'rolreplication', rolreplication,
    'rolconnlimit', rolconnlimit, 'rolvaliduntil', rolvaliduntil::text, 'rolbypassrls', rolbypassrls
  ) ORDER BY rolname), '[]'::jsonb) value
  FROM pg_roles WHERE rolname !~ '^pg_' AND rolname <> 'cli_login_postgres'
), memberships AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'member', member.rolname, 'role', granted.rolname, 'grantor', grantor.rolname,
    'admin_option', m.admin_option, 'inherit_option', m.inherit_option, 'set_option', m.set_option
  ) ORDER BY member.rolname, granted.rolname, grantor.rolname, m.admin_option, m.inherit_option, m.set_option), '[]'::jsonb) value
  FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles grantor ON grantor.oid=m.grantor
  WHERE (member.rolname !~ '^pg_' OR granted.rolname !~ '^pg_') AND member.rolname <> 'cli_login_postgres' AND granted.rolname <> 'cli_login_postgres'
), pg_participants AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', r.rolname, 'rolsuper', r.rolsuper, 'rolinherit', r.rolinherit, 'rolcreaterole', r.rolcreaterole,
    'rolcreatedb', r.rolcreatedb, 'rolcanlogin', r.rolcanlogin, 'rolreplication', r.rolreplication,
    'rolconnlimit', r.rolconnlimit, 'rolvaliduntil', r.rolvaliduntil::text, 'rolbypassrls', r.rolbypassrls
  ) ORDER BY r.rolname), '[]'::jsonb) value
  FROM pg_roles r WHERE r.rolname ~ '^pg_' AND r.rolname IN (
    SELECT member.rolname FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid WHERE granted.rolname !~ '^pg_'
    UNION SELECT granted.rolname FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid WHERE member.rolname !~ '^pg_'
    UNION SELECT grantor.rolname FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles grantor ON grantor.oid=m.grantor WHERE member.rolname !~ '^pg_' OR granted.rolname !~ '^pg_'
    UNION SELECT pg_get_userbyid(a.grantor) FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a
    UNION SELECT pg_get_userbyid(a.grantee) FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a WHERE a.grantee<>0
  )
), role_settings AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'role', r.rolname, 'database', d.datname, 'name', split_part(setting, '=', 1),
    'value', substring(setting from position('=' in setting) + 1)
  ) ORDER BY r.rolname, d.datname NULLS FIRST, setting), '[]'::jsonb) value
  FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole LEFT JOIN pg_database d ON d.oid=NULLIF(s.setdatabase,0)
  CROSS JOIN LATERAL unnest(s.setconfig) setting WHERE r.rolname !~ '^pg_' AND r.rolname <> 'cli_login_postgres'
), parameter_acls AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'parameter', p.parname, 'grantor', pg_get_userbyid(a.grantor),
    'grantee', CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'privilege', a.privilege_type, 'grantable', a.is_grantable
  ) ORDER BY p.parname, a.grantor, a.grantee, a.privilege_type, a.is_grantable), '[]'::jsonb) value
  FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a
), extensions AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', e.extname, 'version', e.extversion, 'schema', n.nspname, 'owner', pg_get_userbyid(e.extowner)
  ) ORDER BY e.extname), '[]'::jsonb) value FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
), schemas AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', nspname, 'owner', pg_get_userbyid(nspowner)) ORDER BY nspname), '[]'::jsonb) value
  FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
), relations AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'name', c.relname, 'oid', c.oid::bigint, 'kind', c.relkind::text,
    'parent_oid', (SELECT i.inhparent::bigint FROM pg_inherits i WHERE i.inhrelid=c.oid),
    'owner', pg_get_userbyid(c.relowner),
    'classification', CASE
      WHEN (n.nspname='public' OR (n.nspname IN ('auth','storage') AND has_table_privilege('postgres', c.oid, 'TRIGGER')) OR (n.nspname='cron' AND c.relname='job') OR (n.nspname='net' AND c.relname='http_request_queue')) THEN 'authoritative'
      ELSE 'non_authoritative_operational' END,
    'acl', COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a), '[]'::jsonb)
  ) ORDER BY n.nspname,c.relname,c.relkind), '[]'::jsonb) value
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
), catalog AS (
  SELECT jsonb_build_object(
    'indexes', COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'name',indexname,'table',tablename,'definition',indexdef) ORDER BY schemaname,indexname) FROM pg_indexes WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema'),'[]'::jsonb),
    'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',x.conname,'type',x.contype::text,'definition',pg_get_constraintdef(x.oid,true)) ORDER BY n.nspname,c.relname,x.conname) FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_'),'[]'::jsonb),
    'functions', COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'identity',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')','owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),'[]'::jsonb),
    'triggers', COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid,true)) ORDER BY n.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_'),'[]'::jsonb),
    'policies', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p),'[]'::jsonb),
    'default_acls', COALESCE((SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'object_type',d.defaclobjtype::text,'grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY d.defaclrole,n.nspname,d.defaclobjtype,a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a),'[]'::jsonb),
    'object_owners', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY object_type,schema,identity) FROM (
      SELECT 'schema' object_type, NULL::text schema, n.nspname identity, pg_get_userbyid(n.nspowner) owner FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'relation',n.nspname,c.relname,pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','S','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'index' object_type,n.nspname,c.relname,pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('i','I') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'column' object_type,n.nspname,c.relname||'.'||att.attname,pg_get_userbyid(c.relowner) FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE att.attnum>0 AND NOT att.attisdropped AND c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'function',n.nspname,p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'type',n.nspname,t.typname,pg_get_userbyid(t.typowner) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'extension' object_type,NULL::text,e.extname,pg_get_userbyid(e.extowner) FROM pg_extension e
      UNION ALL SELECT 'constraint' object_type,n.nspname,c.relname||'.'||x.conname,pg_get_userbyid(c.relowner) FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'trigger' object_type,n.nspname,c.relname||'.'||t.tgname,pg_get_userbyid(c.relowner) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'policy' object_type,n.nspname,c.relname||'.'||p.polname,pg_get_userbyid(c.relowner) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
    ) item),'[]'::jsonb),
    'object_acls', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY object_type,schema,identity,grantor,grantee,privilege,grantable) FROM (
      SELECT 'schema' object_type,NULL::text schema,n.nspname identity,pg_get_userbyid(a.grantor) grantor,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,a.privilege_type privilege,a.is_grantable grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'relation',n.nspname,c.relname,pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE c.relkind IN ('r','p','S','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'column' object_type,n.nspname,c.relname||'.'||att.attname,pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE att.attnum>0 AND NOT att.attisdropped AND att.attacl IS NOT NULL AND c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'function',n.nspname,p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'type',n.nspname,t.typname,pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace CROSS JOIN LATERAL aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) a WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
    ) item),'[]'::jsonb),
    'comments', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY object_type,schema,identity) FROM (
      SELECT 'schema' object_type,NULL::text schema,n.nspname identity,obj_description(n.oid,'pg_namespace') comment FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT CASE WHEN c.relkind IN ('i','I') THEN 'index' ELSE 'relation' END,n.nspname,c.relname,obj_description(c.oid,'pg_class') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','S','v','m','f','i','I') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'column' object_type,n.nspname,c.relname||'.'||att.attname,col_description(c.oid,att.attnum) FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE att.attnum>0 AND NOT att.attisdropped AND c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'function',n.nspname,p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',obj_description(p.oid,'pg_proc') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'type',n.nspname,t.typname,obj_description(t.oid,'pg_type') FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'extension' object_type,NULL::text,e.extname,obj_description(e.oid,'pg_extension') FROM pg_extension e
      UNION ALL SELECT 'constraint' object_type,n.nspname,c.relname||'.'||x.conname,obj_description(x.oid,'pg_constraint') FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'trigger' object_type,n.nspname,c.relname||'.'||t.tgname,obj_description(t.oid,'pg_trigger') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'policy' object_type,n.nspname,c.relname||'.'||p.polname,obj_description(p.oid,'pg_policy') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
    ) item WHERE comment IS NOT NULL),'[]'::jsonb),
    'security_labels', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY object_type,schema,identity,provider,label) FROM (
      SELECT 'schema' object_type,NULL::text schema,n.nspname identity,l.provider,l.label FROM pg_seclabel l JOIN pg_namespace n ON l.classoid='pg_namespace'::regclass AND l.objoid=n.oid WHERE l.objsubid=0 AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT CASE WHEN c.relkind IN ('i','I') THEN 'index' ELSE 'relation' END,n.nspname,c.relname,l.provider,l.label FROM pg_seclabel l JOIN pg_class c ON l.classoid='pg_class'::regclass AND l.objoid=c.oid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE l.objsubid=0 AND c.relkind IN ('r','p','S','v','m','f','i','I') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'column' object_type,n.nspname,c.relname||'.'||att.attname,l.provider,l.label FROM pg_seclabel l JOIN pg_class c ON l.classoid='pg_class'::regclass AND l.objoid=c.oid JOIN pg_attribute att ON att.attrelid=c.oid AND att.attnum=l.objsubid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE l.objsubid>0 AND NOT att.attisdropped AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'function',n.nspname,p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',l.provider,l.label FROM pg_seclabel l JOIN pg_proc p ON l.classoid='pg_proc'::regclass AND l.objoid=p.oid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE l.objsubid=0 AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'type',n.nspname,t.typname,l.provider,l.label FROM pg_seclabel l JOIN pg_type t ON l.classoid='pg_type'::regclass AND l.objoid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE l.objsubid=0 AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'extension' object_type,NULL::text,e.extname,l.provider,l.label FROM pg_seclabel l JOIN pg_extension e ON l.classoid='pg_extension'::regclass AND l.objoid=e.oid WHERE l.objsubid=0
      UNION ALL SELECT 'constraint' object_type,n.nspname,c.relname||'.'||x.conname,l.provider,l.label FROM pg_seclabel l JOIN pg_constraint x ON l.classoid='pg_constraint'::regclass AND l.objoid=x.oid JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE l.objsubid=0 AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'trigger' object_type,n.nspname,c.relname||'.'||t.tgname,l.provider,l.label FROM pg_seclabel l JOIN pg_trigger t ON l.classoid='pg_trigger'::regclass AND l.objoid=t.oid JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE l.objsubid=0 AND NOT t.tgisinternal AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 'policy' object_type,n.nspname,c.relname||'.'||p.polname,l.provider,l.label FROM pg_seclabel l JOIN pg_policy p ON l.classoid='pg_policy'::regclass AND l.objoid=p.oid JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE l.objsubid=0 AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
    ) item),'[]'::jsonb)
  ) value
)
SELECT jsonb_build_object(
  'database',(SELECT value FROM database_row), 'roles',(SELECT value FROM roles),
  'pg_participants',(SELECT value FROM pg_participants),
  'memberships',(SELECT value FROM memberships), 'role_settings',(SELECT value FROM role_settings),
  'parameter_acls',(SELECT value FROM parameter_acls), 'extensions',(SELECT value FROM extensions),
  'schemas',(SELECT value FROM schemas), 'relations',(SELECT value FROM relations), 'catalog',(SELECT value FROM catalog),
  'cron_jobs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'jobid', jobid, 'schedule', schedule, 'command_sha256', encode(extensions.digest(convert_to(command, 'UTF8'), 'sha256'), 'hex'),
    'nodename', nodename, 'nodeport', nodeport, 'database', database, 'username', username, 'active', active
  ) ORDER BY jobid) FROM cron.job), '[]'::jsonb),
  'pg_net_queue_count', (SELECT count(*)::text FROM net.http_request_queue),
  'server_version', current_setting('server_version'), 'migration_frontier', COALESCE((SELECT max(version)::text FROM supabase_migrations.schema_migrations),'')
);
) TO STDOUT;
COMMIT;`;
}

function relationHash(
  schema: string,
  relation: string,
  snapshot: string | null
): { row_count: string; row_sha256: string } {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema) || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(relation)) {
    fail('relation identity cannot be safely quoted');
  }
  const begin = snapshot
    ? `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT ${quoteLiteral(snapshot)};`
    : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;';
  const qualified = `"${schema.replaceAll('"', '""')}"."${relation.replaceAll('"', '""')}"`;
  const sql = `${begin}
COPY (
  SELECT jsonb_build_object(
    'row_count', count(*)::text,
    'row_sha256', encode(extensions.digest(convert_to(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), ''), 'UTF8'), 'sha256'), 'hex')
  ) FROM ${qualified} t
) TO STDOUT;
COMMIT;`;
  const value = JSON.parse(runPsql(sql)) as { row_count: string; row_sha256: string };
  if (!/^\d+$/.test(value.row_count) || !/^[0-9a-f]{64}$/.test(value.row_sha256))
    fail('invalid relation equality result');
  return value;
}

function capture(snapshot: string | null): JsonObject {
  const raw = runPsql(catalogSql(snapshot));
  const view = object(JSON.parse(raw), 'captured manifest view');
  const relations = view.relations;
  if (!Array.isArray(relations)) fail('captured relations must be an array');
  for (const value of relations) {
    const relation = object(value, 'relation');
    if (relation.classification === 'authoritative') {
      Object.assign(
        relation,
        relationHash(String(relation.schema), String(relation.name), snapshot)
      );
    }
  }
  const catalog = object(view.catalog, 'catalog');
  for (const [key, value] of Object.entries(catalog)) {
    catalog[`${key}_sha256`] = sha256(value);
  }
  view.relations_sha256 = sha256(relations);
  view.schemas_sha256 = sha256(view.schemas);
  view.extensions_sha256 = sha256(view.extensions);
  return view;
}

function exactFieldSet(value: JsonObject, fields: string[], label: string): void {
  if (canonical(Object.keys(value).sort()) !== canonical([...fields].sort())) {
    fail(`${label} field set mismatch`);
  }
}

function validateExpectedCatalog(
  flags: Map<string, string>,
  snapshot: string,
  cutover: JsonObject
): { baseline_structural_sha256: string; file_sha256: string; guarded_relations: JsonObject[] } {
  const path = required(flags, '--expected-catalog');
  const expectedFileHash = required(flags, '--expected-catalog-sha256');
  const runId = required(flags, '--q12-run-id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId))
    fail('Q12 run id is invalid');
  if (!/^[0-9a-f]{64}$/.test(expectedFileHash)) fail('expected catalog file SHA-256 is invalid');
  const bytes = readFileSync(path);
  if (createHash('sha256').update(bytes).digest('hex') !== expectedFileHash)
    fail('expected catalog opened-FD SHA-256 mismatch');
  const expected = object(JSON.parse(bytes.toString('utf8')), 'expected catalog');
  exactFieldSet(
    expected,
    [
      'schema_version',
      'database',
      'database_owner',
      'release_sha',
      'migration_frontier',
      'baseline_structural_sha256',
      'expected_post_migration_catalog_sha256',
      'inventory_counts',
      'guarded_relations',
      'cron_jobs',
      'migrations',
    ],
    'expected catalog'
  );
  if (
    expected.schema_version !== 'megacampus.q12.expected-post-migration-catalog/v1' ||
    expected.database !== 'postgres' ||
    expected.database_owner !== 'postgres' ||
    typeof expected.release_sha !== 'string' ||
    !/^[0-9a-f]{40}$/.test(expected.release_sha) ||
    expected.migration_frontier !== '20260704150249' ||
    typeof expected.baseline_structural_sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(expected.baseline_structural_sha256) ||
    typeof expected.expected_post_migration_catalog_sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(expected.expected_post_migration_catalog_sha256) ||
    expected.inventory_counts === null ||
    typeof expected.inventory_counts !== 'object' ||
    Array.isArray(expected.inventory_counts) ||
    !Array.isArray(expected.cron_jobs) ||
    expected.migrations === null ||
    typeof expected.migrations !== 'object' ||
    Array.isArray(expected.migrations)
  )
    fail('expected catalog top-level contract mismatch');
  const inventoryCounts = object(expected.inventory_counts, 'expected catalog inventory_counts');
  exactFieldSet(
    inventoryCounts,
    ['public', 'auth', 'storage', 'cron_jobs', 'pg_net_queue'],
    'expected catalog inventory_counts'
  );
  if (
    inventoryCounts.public !== 47 ||
    inventoryCounts.auth !== 22 ||
    inventoryCounts.storage !== 5 ||
    inventoryCounts.cron_jobs !== 8 ||
    inventoryCounts.pg_net_queue !== 0
  )
    fail('expected catalog inventory counts mismatch');
  const expectedCronJobs = array(expected.cron_jobs, 'expected catalog cron_jobs');
  if (expectedCronJobs.length !== 8) fail('expected catalog cron cardinality mismatch');
  const cronIds = new Set<number>();
  for (const [index, raw] of expectedCronJobs.entries()) {
    const job = object(raw, `expected cron_jobs[${index}]`);
    exactFieldSet(job, ['jobid', 'username', 'command_sha256'], `expected cron_jobs[${index}]`);
    if (
      typeof job.jobid !== 'number' ||
      !Number.isSafeInteger(job.jobid) ||
      job.username !== 'postgres' ||
      typeof job.command_sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(job.command_sha256)
    )
      fail('expected catalog cron job shape mismatch');
    cronIds.add(job.jobid);
  }
  if (cronIds.size !== expectedCronJobs.length)
    fail('expected catalog cron jobs contain duplicates');
  const migrations = object(expected.migrations, 'expected catalog migrations');
  exactFieldSet(migrations, ['20260711140000', '20260711151000'], 'expected catalog migrations');
  const futureIdentities = new Set<string>();
  for (const migrationId of ['20260711140000', '20260711151000']) {
    const migration = object(migrations[migrationId], `expected migration ${migrationId}`);
    exactFieldSet(
      migration,
      ['catalog_sha256', 'migration_file_sha256', 'relations'],
      `expected migration ${migrationId}`
    );
    if (
      typeof migration.catalog_sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(migration.catalog_sha256) ||
      typeof migration.migration_file_sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(migration.migration_file_sha256)
    )
      fail('expected migration hash shape mismatch');
    const relations = array(migration.relations, `expected migration ${migrationId} relations`);
    if (relations.length === 0) fail('expected migration relation set is empty');
    let previousIdentity = '';
    for (const [index, raw] of relations.entries()) {
      const relation = object(raw, `expected migration ${migrationId} relations[${index}]`);
      exactFieldSet(
        relation,
        ['schema', 'name', 'relkind', 'parent_schema', 'parent_name', 'owner'],
        `expected migration ${migrationId} relations[${index}]`
      );
      if (
        typeof relation.schema !== 'string' ||
        typeof relation.name !== 'string' ||
        typeof relation.owner !== 'string' ||
        (relation.parent_schema !== null && typeof relation.parent_schema !== 'string') ||
        (relation.parent_name !== null && typeof relation.parent_name !== 'string')
      )
        fail('expected migration relation shape/order/uniqueness mismatch');
      const identity = `${relation.schema}.${relation.name}`;
      if (
        !/^(public|auth|storage|cron|net)$/.test(relation.schema) ||
        !/^[a-z_][a-z0-9_]*$/.test(relation.name) ||
        !/^[a-z_][a-z0-9_]*$/.test(relation.owner) ||
        (relation.relkind !== 'r' && relation.relkind !== 'p') ||
        (relation.parent_schema === null) !== (relation.parent_name === null) ||
        (relation.parent_schema !== null &&
          relation.parent_name !== null &&
          (!/^(public|auth|storage|cron|net)$/.test(relation.parent_schema) ||
            !/^[a-z_][a-z0-9_]*$/.test(relation.parent_name))) ||
        identity.localeCompare(previousIdentity) < 0 ||
        futureIdentities.has(identity)
      )
        fail('expected migration relation shape/order/uniqueness mismatch');
      previousIdentity = identity;
      futureIdentities.add(identity);
    }
  }

  const expectedRelations = array(
    expected.guarded_relations,
    'expected catalog guarded_relations'
  ).map((raw, index) => {
    const relation = object(raw, `expected guarded_relations[${index}]`);
    exactFieldSet(
      relation,
      ['schema', 'name', 'oid', 'relkind', 'parent_oid', 'owner'],
      `expected guarded_relations[${index}]`
    );
    if (
      typeof relation.schema !== 'string' ||
      typeof relation.name !== 'string' ||
      typeof relation.oid !== 'number' ||
      !Number.isSafeInteger(relation.oid) ||
      relation.oid <= 0 ||
      (relation.relkind !== 'r' && relation.relkind !== 'p') ||
      (relation.parent_oid !== null &&
        (typeof relation.parent_oid !== 'number' || !Number.isSafeInteger(relation.parent_oid))) ||
      typeof relation.owner !== 'string'
    )
      fail('expected guarded relation shape mismatch');
    return {
      schema: relation.schema,
      name: relation.name,
      oid: relation.oid,
      relkind: relation.relkind,
      parent_oid: relation.parent_oid,
      owner: relation.owner,
    };
  });
  if (
    new Set(expectedRelations.map(relation => relation.oid)).size !== expectedRelations.length ||
    new Set(expectedRelations.map(relation => `${relation.schema}.${relation.name}`)).size !==
      expectedRelations.length
  )
    fail('expected guarded relation duplicates');
  const actualRelations = array(cutover.relations, 'cutover.relations')
    .map(raw => object(raw, 'cutover relation'))
    .filter(relation => relation.classification === 'authoritative')
    .map(relation => ({
      schema: relation.schema,
      name: relation.name,
      oid: relation.oid,
      relkind: relation.kind,
      parent_oid: relation.parent_oid,
      owner: relation.owner,
    }));
  const sortRelations = (values: JsonObject[]) =>
    values.sort((left, right) => Number(left.oid) - Number(right.oid));
  if (canonical(sortRelations(expectedRelations)) !== canonical(sortRelations(actualRelations))) {
    fail('authoritative guarded relation set differs from frozen expected catalog');
  }

  const begin = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT ${quoteLiteral(snapshot)};`;
  const barrier = object(
    JSON.parse(
      runPsql(
        `${begin}\nCOPY (SELECT jsonb_build_object('run_id',run_id::text,'expected_catalog_sha256',expected_catalog_sha256,'activated',activated) FROM q12_guard.active_run) TO STDOUT;\nCOMMIT;`
      )
    ),
    'database barrier identity'
  );
  if (
    barrier.run_id !== runId ||
    barrier.expected_catalog_sha256 !== expectedFileHash ||
    barrier.activated !== false
  ) {
    fail('database barrier expected catalog identity mismatch');
  }
  return {
    baseline_structural_sha256: expected.baseline_structural_sha256,
    file_sha256: expectedFileHash,
    guarded_relations: expectedRelations,
  };
}

function rejectSecretShape(value: unknown): void {
  const text = canonical(value);
  if (/rolpassword|password_hash|encrypted_password/i.test(text))
    fail('password field is forbidden in manifest');
  if (/postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/i.test(text))
    fail('credential URI is forbidden in manifest');
  if (/eyJ[A-Za-z0-9_-]{20,}\.|sbp_[A-Za-z0-9_-]{16,}/.test(text))
    fail('token-shaped value is forbidden in manifest');
}

function writeOwnerOnly(path: string, value: unknown): void {
  rejectSecretShape(value);
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, `${canonical(value)}\n`, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const parent = openSync(dirname(path), 'r');
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}

function normalizeForTarget(value: JsonObject, targetDatabase: string): JsonObject {
  const normalized = structuredClone(value);
  const database = object(normalized.database, 'database');
  if (database.name !== targetDatabase) fail(`target database must be ${targetDatabase}`);
  database.name = 'postgres';
  delete database.size_bytes;
  const settings = database.settings;
  if (Array.isArray(settings)) {
    database.settings = settings.filter(item => {
      if (!Array.isArray(item) || item.length !== 2) return true;
      return item[0] !== 'cron.database_name' && item[0] !== 'cron.launch_active_jobs';
    });
  }
  return normalized;
}

function normalizeSource(value: JsonObject): JsonObject {
  const normalized = structuredClone(value);
  const database = object(normalized.database, 'database');
  delete database.size_bytes;
  return normalized;
}

function captureInventory(): JsonObject {
  const sql = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
COPY (
WITH roles AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', rolname, 'rolsuper', rolsuper, 'rolinherit', rolinherit, 'rolcreaterole', rolcreaterole,
    'rolcreatedb', rolcreatedb, 'rolcanlogin', rolcanlogin, 'rolreplication', rolreplication,
    'rolconnlimit', rolconnlimit, 'rolvaliduntil', rolvaliduntil::text, 'rolbypassrls', rolbypassrls
  ) ORDER BY rolname), '[]'::jsonb) value
  FROM pg_roles WHERE rolname !~ '^pg_' AND rolname <> 'cli_login_postgres'
), memberships AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'member', member.rolname, 'role', granted.rolname, 'grantor', grantor.rolname,
    'admin_option', m.admin_option, 'inherit_option', m.inherit_option, 'set_option', m.set_option
  ) ORDER BY member.rolname, granted.rolname, grantor.rolname, m.admin_option, m.inherit_option, m.set_option), '[]'::jsonb) value
  FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles grantor ON grantor.oid=m.grantor
  WHERE (member.rolname !~ '^pg_' OR granted.rolname !~ '^pg_') AND member.rolname <> 'cli_login_postgres' AND granted.rolname <> 'cli_login_postgres'
), pg_participants AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', r.rolname, 'rolsuper', r.rolsuper, 'rolinherit', r.rolinherit, 'rolcreaterole', r.rolcreaterole,
    'rolcreatedb', r.rolcreatedb, 'rolcanlogin', r.rolcanlogin, 'rolreplication', r.rolreplication,
    'rolconnlimit', r.rolconnlimit, 'rolvaliduntil', r.rolvaliduntil::text, 'rolbypassrls', r.rolbypassrls
  ) ORDER BY r.rolname), '[]'::jsonb) value
  FROM pg_roles r WHERE r.rolname ~ '^pg_' AND r.rolname IN (
    SELECT member.rolname FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid WHERE granted.rolname !~ '^pg_'
    UNION SELECT granted.rolname FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid WHERE member.rolname !~ '^pg_'
    UNION SELECT grantor.rolname FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles grantor ON grantor.oid=m.grantor WHERE member.rolname !~ '^pg_' OR granted.rolname !~ '^pg_'
    UNION SELECT pg_get_userbyid(a.grantor) FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a
    UNION SELECT pg_get_userbyid(a.grantee) FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a WHERE a.grantee<>0
  )
), role_settings AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'role', r.rolname, 'database', NULL, 'name', split_part(setting, '=', 1),
    'value', substring(setting from position('=' in setting) + 1)
  ) ORDER BY r.rolname, setting), '[]'::jsonb) value
  FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
  CROSS JOIN LATERAL unnest(s.setconfig) setting
  WHERE s.setdatabase=0 AND r.rolname !~ '^pg_' AND r.rolname <> 'cli_login_postgres'
), parameter_acls AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'parameter', p.parname, 'grantor', pg_get_userbyid(a.grantor),
    'grantee', CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'privilege', a.privilege_type, 'grantable', a.is_grantable
  ) ORDER BY p.parname, a.grantor, a.grantee, a.privilege_type, a.is_grantable), '[]'::jsonb) value
  FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a
)
SELECT jsonb_build_object(
  'roles',(SELECT value FROM roles),
  'pg_participants',(SELECT value FROM pg_participants),
  'memberships',(SELECT value FROM memberships),
  'role_settings',(SELECT value FROM role_settings),
  'parameter_acls',(SELECT value FROM parameter_acls)
)
) TO STDOUT;
COMMIT;`;
  return object(JSON.parse(runPsql(sql)), 'image inventory');
}

function sortedArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return structuredClone(value).sort((left, right) =>
    canonical(left).localeCompare(canonical(right))
  );
}

function verifyInventory(flags: Map<string, string>): void {
  const source = JSON.parse(readFileSync(required(flags, '--source'), 'utf8')) as JsonObject;
  const inventory = object(
    JSON.parse(readFileSync(required(flags, '--inventory'), 'utf8')),
    'inventory'
  );
  if (source.schema !== SCHEMA) fail('source manifest schema mismatch');
  const inventoryKeys = Object.keys(inventory).sort();
  const expectedKeys = [
    'memberships',
    'parameter_acls',
    'pg_participants',
    'role_settings',
    'roles',
  ];
  if (canonical(inventoryKeys) !== canonical(expectedKeys)) fail('inventory field set mismatch');
  const cutover = object(source.cutover_snapshot, 'source.cutover_snapshot');
  const sourceSettings = sortedArray(
    cutover.role_settings,
    'source.cutover_snapshot.role_settings'
  ).filter(value => object(value, 'role setting').database === null);
  const expected = {
    memberships: sortedArray(cutover.memberships, 'source.cutover_snapshot.memberships'),
    parameter_acls: sortedArray(cutover.parameter_acls, 'source.cutover_snapshot.parameter_acls'),
    pg_participants: sortedArray(
      cutover.pg_participants,
      'source.cutover_snapshot.pg_participants'
    ),
    role_settings: sourceSettings,
    roles: sortedArray(cutover.roles, 'source.cutover_snapshot.roles'),
  };
  const actual = {
    memberships: sortedArray(inventory.memberships, 'inventory.memberships'),
    parameter_acls: sortedArray(inventory.parameter_acls, 'inventory.parameter_acls'),
    pg_participants: sortedArray(inventory.pg_participants, 'inventory.pg_participants'),
    role_settings: sortedArray(inventory.role_settings, 'inventory.role_settings'),
    roles: sortedArray(inventory.roles, 'inventory.roles'),
  };
  if (canonical(expected) !== canonical(actual)) fail('cluster-global inventory mismatch');
  process.stdout.write('cluster-global inventory equality passed\n');
}

function settingsWithoutReadOnly(value: unknown, label: string): unknown[] {
  const settings = sortedArray(value, label);
  return settings.filter(item => {
    if (!Array.isArray(item) || item.length !== 2) fail(`${label} contains an invalid setting`);
    return item[0] !== 'default_transaction_read_only';
  });
}

function refreshDerivedHashes(view: JsonObject): void {
  if (Array.isArray(view.schemas)) view.schemas_sha256 = sha256(view.schemas);
  if (Array.isArray(view.relations)) view.relations_sha256 = sha256(view.relations);
  const catalog = object(view.catalog, 'transition.catalog');
  for (const [key, value] of Object.entries(catalog)) {
    if (!key.endsWith('_sha256') && Array.isArray(value)) catalog[`${key}_sha256`] = sha256(value);
  }
}

const GUARD_TABLES = new Set(['active_run', 'baseline', 'migration_guards', 'probe']);
const GUARD_FUNCTIONS = new Set([
  'assert_capability()',
  'enforce_write_barrier()',
  'extend_guard(p_migration text, p_expected_relations jsonb, p_migration_file_sha256 text, p_expected_catalog_sha256 text)',
  'verify_capability()',
  'verify_expected_guards(p_after_migration text)',
]);
const GUARD_INDEXES = new Set([...GUARD_TABLES].map(name => `${name}_pkey`));
const GUARD_COLUMNS = new Set([
  'active_run.singleton',
  'active_run.run_id',
  'active_run.capability_sha256',
  'active_run.expected_catalog_sha256',
  'active_run.expected_catalog',
  'active_run.activated',
  'baseline.singleton',
  'baseline.baseline',
  'baseline.baseline_sha256',
  'migration_guards.migration',
  'migration_guards.catalog_sha256',
  'migration_guards.migration_file_sha256',
  'migration_guards.stable_expected',
  'migration_guards.relation_set',
  'probe.probe_id',
  'probe.touched_at',
]);
const GUARD_CONSTRAINTS = new Set([
  'active_run.active_run_pkey',
  'active_run.active_run_singleton_check',
  'active_run.active_run_capability_sha256_check',
  'active_run.active_run_expected_catalog_sha256_check',
  'baseline.baseline_pkey',
  'baseline.baseline_singleton_check',
  'baseline.baseline_baseline_sha256_check',
  'migration_guards.migration_guards_pkey',
  'migration_guards.migration_guards_catalog_sha256_check',
  'migration_guards.migration_guards_migration_file_sha256_check',
  'probe.probe_pkey',
]);

function approvedGuardIdentity(objectType: unknown, identity: unknown): boolean {
  if (typeof objectType !== 'string' || typeof identity !== 'string') return false;
  if (objectType === 'schema') return identity === 'q12_guard';
  if (objectType === 'relation') return GUARD_TABLES.has(identity);
  if (objectType === 'type')
    return (
      GUARD_TABLES.has(identity) ||
      (identity.startsWith('_') && GUARD_TABLES.has(identity.slice(1)))
    );
  if (objectType === 'index') return GUARD_INDEXES.has(identity);
  if (objectType === 'column') return GUARD_COLUMNS.has(identity);
  if (objectType === 'constraint') return GUARD_CONSTRAINTS.has(identity);
  if (objectType === 'function')
    return (
      GUARD_FUNCTIONS.has(identity) ||
      GUARD_FUNCTIONS.has(`${identity.slice(0, identity.indexOf('('))}()`)
    );
  if (objectType === 'trigger') {
    return identity === 'probe.q12_guard_row' || identity === 'probe.q12_guard_truncate';
  }
  return false;
}

function isExternalGuardTrigger(item: JsonObject): boolean {
  return (
    item.schema !== 'q12_guard' &&
    (item.name === 'q12_guard_row' || item.name === 'q12_guard_truncate') &&
    typeof item.definition === 'string' &&
    item.definition.includes('q12_guard.enforce_write_barrier()')
  );
}

function filterApprovedGuardCatalog(key: string, value: unknown[]): unknown[] {
  return value.filter(raw => {
    const item = object(raw, `catalog.${key} item`);
    if (key === 'triggers' && isExternalGuardTrigger(item)) return false;
    if (
      key === 'object_owners' &&
      item.object_type === 'trigger' &&
      item.schema !== 'q12_guard' &&
      typeof item.identity === 'string' &&
      /\.q12_guard_(?:row|truncate)$/.test(item.identity)
    ) {
      return false;
    }
    if (
      item.schema !== 'q12_guard' &&
      !(
        (key === 'object_owners' || key === 'object_acls') &&
        item.object_type === 'schema' &&
        item.identity === 'q12_guard'
      )
    ) {
      return true;
    }
    let approved = false;
    if (key === 'indexes') approved = GUARD_INDEXES.has(String(item.name));
    else if (key === 'constraints')
      approved = GUARD_CONSTRAINTS.has(`${String(item.table)}.${String(item.name)}`);
    else if (key === 'functions') {
      approved =
        GUARD_FUNCTIONS.has(String(item.identity)) &&
        item.owner === 'postgres' &&
        typeof item.definition === 'string' &&
        item.definition.includes('SECURITY DEFINER');
    } else if (key === 'triggers') {
      approved =
        item.table === 'probe' && isExternalGuardTrigger({ ...item, schema: 'guard-probe' });
    } else if (key === 'object_owners' || key === 'object_acls') {
      approved =
        approvedGuardIdentity(item.object_type, item.identity) &&
        (key !== 'object_owners' || item.owner === 'postgres') &&
        (key !== 'object_acls' || (item.grantor === 'postgres' && item.grantee === 'postgres'));
    }
    if (!approved) fail(`unexpected baseline-to-cutover delta: extra q12_guard ${key} object`);
    return false;
  });
}

function assertExactSet(actual: string[], expected: string[], label: string): void {
  if (canonical([...actual].sort()) !== canonical([...expected].sort()))
    fail(`unexpected baseline-to-cutover delta: ${label}`);
}

function functionName(identity: unknown): string {
  if (typeof identity !== 'string' || !identity.includes('('))
    fail('guard function identity is invalid');
  return identity.slice(0, identity.indexOf('('));
}

function validateExactGuardDelta(cutover: JsonObject, guardedRelations: JsonObject[]): void {
  const catalog = object(cutover.catalog, 'cutover.catalog');
  const indexes = array(catalog.indexes, 'cutover.catalog.indexes').map(raw =>
    object(raw, 'guard index')
  );
  assertExactSet(
    indexes.filter(item => item.schema === 'q12_guard').map(item => String(item.name)),
    [...GUARD_INDEXES],
    'q12_guard index set'
  );
  const constraints = array(catalog.constraints, 'cutover.catalog.constraints').map(raw =>
    object(raw, 'guard constraint')
  );
  assertExactSet(
    constraints
      .filter(item => item.schema === 'q12_guard')
      .map(item => `${String(item.table)}.${String(item.name)}`),
    [...GUARD_CONSTRAINTS],
    'q12_guard constraint set'
  );
  const functions = array(catalog.functions, 'cutover.catalog.functions').map(raw =>
    object(raw, 'guard function')
  );
  assertExactSet(
    functions.filter(item => item.schema === 'q12_guard').map(item => functionName(item.identity)),
    [
      'assert_capability',
      'enforce_write_barrier',
      'extend_guard',
      'verify_capability',
      'verify_expected_guards',
    ],
    'q12_guard function set'
  );

  const triggerExpected = [
    ...guardedRelations.flatMap(relation => [
      `${String(relation.schema)}.${String(relation.name)}.q12_guard_row`,
      `${String(relation.schema)}.${String(relation.name)}.q12_guard_truncate`,
    ]),
    'q12_guard.probe.q12_guard_row',
    'q12_guard.probe.q12_guard_truncate',
  ];
  const triggers = array(catalog.triggers, 'cutover.catalog.triggers').map(raw =>
    object(raw, 'guard trigger')
  );
  const guardTriggers = triggers.filter(
    item =>
      item.name === 'q12_guard_row' ||
      item.name === 'q12_guard_truncate' ||
      item.schema === 'q12_guard'
  );
  for (const trigger of guardTriggers) {
    if (
      !isExternalGuardTrigger({
        ...trigger,
        schema: trigger.schema === 'q12_guard' ? 'guard-probe' : trigger.schema,
      })
    ) {
      fail('unexpected baseline-to-cutover delta: guard trigger definition');
    }
  }
  assertExactSet(
    guardTriggers.map(item => `${String(item.schema)}.${String(item.table)}.${String(item.name)}`),
    triggerExpected,
    'exact guarded trigger tuples'
  );

  const expectedOwnerIdentities = [
    'schema::q12_guard',
    ...[...GUARD_TABLES].map(identity => `relation:q12_guard:${identity}`),
    ...[...GUARD_INDEXES].map(identity => `index:q12_guard:${identity}`),
    ...[...GUARD_COLUMNS].map(identity => `column:q12_guard:${identity}`),
    ...[
      'assert_capability',
      'enforce_write_barrier',
      'extend_guard',
      'verify_capability',
      'verify_expected_guards',
    ].map(identity => `function:q12_guard:${identity}`),
    ...[...GUARD_TABLES, ...[...GUARD_TABLES].map(name => `_${name}`)].map(
      identity => `type:q12_guard:${identity}`
    ),
    ...[...GUARD_CONSTRAINTS].map(identity => `constraint:q12_guard:${identity}`),
    'trigger:q12_guard:probe.q12_guard_row',
    'trigger:q12_guard:probe.q12_guard_truncate',
    ...guardedRelations.flatMap(relation => [
      `trigger:${String(relation.schema)}:${String(relation.name)}.q12_guard_row`,
      `trigger:${String(relation.schema)}:${String(relation.name)}.q12_guard_truncate`,
    ]),
  ];
  const owners = array(catalog.object_owners, 'cutover.catalog.object_owners').map(raw =>
    object(raw, 'guard owner')
  );
  const guardOwners = owners.filter(
    item =>
      item.schema === 'q12_guard' ||
      item.identity === 'q12_guard' ||
      (item.object_type === 'trigger' &&
        typeof item.identity === 'string' &&
        /\.q12_guard_(?:row|truncate)$/.test(item.identity))
  );
  for (const owner of guardOwners)
    if (owner.owner !== 'postgres' && owner.schema === 'q12_guard')
      fail('q12_guard object owner drift');
  assertExactSet(
    guardOwners.map(item => {
      if (
        typeof item.object_type !== 'string' ||
        (item.schema !== null && item.schema !== undefined && typeof item.schema !== 'string') ||
        typeof item.identity !== 'string'
      )
        fail('q12_guard owner shape mismatch');
      const schema = typeof item.schema === 'string' ? item.schema : '';
      const identity =
        item.object_type === 'function' ? functionName(item.identity) : item.identity;
      return `${item.object_type}:${schema}:${identity}`;
    }),
    expectedOwnerIdentities,
    'q12_guard complete owner set'
  );

  const aclPrivileges = new Map<string, string[]>([
    ['schema:q12_guard', ['CREATE', 'USAGE']],
    ...[...GUARD_TABLES].map(
      name =>
        [
          `relation:${name}`,
          ['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
        ] as [string, string[]]
    ),
    ...[
      'assert_capability',
      'enforce_write_barrier',
      'extend_guard',
      'verify_capability',
      'verify_expected_guards',
    ].map(name => [`function:${name}`, ['EXECUTE']] as [string, string[]]),
    ...[...GUARD_TABLES, ...[...GUARD_TABLES].map(name => `_${name}`)].map(
      name => [`type:${name}`, ['USAGE']] as [string, string[]]
    ),
  ]);
  const expectedAcls = [...aclPrivileges].flatMap(([identity, privileges]) =>
    privileges.map(privilege => `${identity}:postgres:postgres:${privilege}:true`)
  );
  const acls = array(catalog.object_acls, 'cutover.catalog.object_acls').map(raw =>
    object(raw, 'guard ACL')
  );
  const guardAcls = acls.filter(
    item =>
      item.schema === 'q12_guard' ||
      (item.object_type === 'schema' && item.identity === 'q12_guard')
  );
  assertExactSet(
    guardAcls.map(item => {
      if (item.grantor !== 'postgres' || item.grantee !== 'postgres')
        fail('q12_guard ACL is not owner-only');
      const identity =
        item.object_type === 'schema'
          ? 'q12_guard'
          : item.object_type === 'function'
            ? functionName(item.identity)
            : String(item.identity);
      return `${String(item.object_type)}:${identity}:${String(item.grantor)}:${String(item.grantee)}:${String(item.privilege)}:${String(item.grantable)}`;
    }),
    expectedAcls,
    'q12_guard complete owner ACL set'
  );
}

function validateTransition(
  baselineValue: JsonObject,
  cutoverValue: JsonObject,
  expectedGuardedRelations?: JsonObject[]
): void {
  const baseline = structuredClone(baselineValue);
  const cutover = structuredClone(cutoverValue);
  const baselineJobs = sortedArray(baseline.cron_jobs, 'baseline.cron_jobs');
  const cutoverJobs = sortedArray(cutover.cron_jobs, 'cutover.cron_jobs');
  if (baselineJobs.length !== 8 || cutoverJobs.length !== 8)
    fail('unexpected baseline-to-cutover delta: cron cardinality');
  const normalizedCutoverJobs = cutoverJobs.map((value, index) => {
    const before = object(baselineJobs[index], 'baseline cron job');
    const after = object(value, 'cutover cron job');
    if (before.active !== true || after.active !== false)
      fail('unexpected baseline-to-cutover delta: cron activity');
    const normalized = { ...after, active: true };
    if (canonical(before) !== canonical(normalized))
      fail('unexpected baseline-to-cutover delta: cron job shape');
    return normalized;
  });
  cutover.cron_jobs = normalizedCutoverJobs;

  const baselineDatabase = object(baseline.database, 'baseline.database');
  const cutoverDatabase = object(cutover.database, 'cutover.database');
  const cutoverSettings = sortedArray(cutoverDatabase.settings, 'cutover.database.settings');
  const readOnly = cutoverSettings.filter(
    item => Array.isArray(item) && item[0] === 'default_transaction_read_only'
  );
  if (readOnly.length !== 1 || !Array.isArray(readOnly[0]) || readOnly[0][1] !== 'on') {
    fail('unexpected baseline-to-cutover delta: read-only setting');
  }
  if (
    canonical(settingsWithoutReadOnly(baselineDatabase.settings, 'baseline.database.settings')) !==
    canonical(settingsWithoutReadOnly(cutoverDatabase.settings, 'cutover.database.settings'))
  ) {
    fail('unexpected baseline-to-cutover delta: database settings');
  }
  cutoverDatabase.settings = structuredClone(baselineDatabase.settings);
  cutoverDatabase.size_bytes = baselineDatabase.size_bytes;

  const cutoverSchemas = sortedArray(cutover.schemas, 'cutover.schemas');
  const guardSchemas = cutoverSchemas.filter(value => object(value, 'schema').name === 'q12_guard');
  if (
    guardSchemas.length !== 1 ||
    canonical(guardSchemas[0]) !== canonical({ name: 'q12_guard', owner: 'postgres' })
  )
    fail('unexpected baseline-to-cutover delta: q12_guard schema');
  cutover.schemas = cutoverSchemas.filter(value => object(value, 'schema').name !== 'q12_guard');
  const cutoverRelations = sortedArray(cutover.relations, 'cutover.relations');
  const guardRelations = cutoverRelations.filter(
    value => object(value, 'relation').schema === 'q12_guard'
  );
  if (
    canonical(
      guardRelations
        .map(value => {
          const relation = object(value, 'q12_guard relation');
          if (
            relation.owner !== 'postgres' ||
            relation.kind !== 'r' ||
            !Array.isArray(relation.acl) ||
            relation.acl.some(raw => {
              const acl = object(raw, 'q12_guard relation ACL');
              return acl.grantor !== 'postgres' || acl.grantee !== 'postgres';
            })
          )
            fail('unexpected baseline-to-cutover delta: q12_guard relation shape');
          return relation.name;
        })
        .sort()
    ) !== canonical([...GUARD_TABLES].sort())
  )
    fail('unexpected baseline-to-cutover delta: q12_guard relation set');
  cutover.relations = cutoverRelations.filter(
    value => object(value, 'relation').schema !== 'q12_guard'
  );

  const guardedRelations =
    expectedGuardedRelations ??
    cutoverRelations
      .map(value => object(value, 'relation'))
      .filter(
        relation => relation.classification === 'authoritative' && relation.schema !== 'q12_guard'
      );
  validateExactGuardDelta(cutover, guardedRelations);

  const cutoverCatalog = object(cutover.catalog, 'cutover.catalog');
  for (const [key, value] of Object.entries(cutoverCatalog)) {
    if (!key.endsWith('_sha256') && Array.isArray(value)) {
      cutoverCatalog[key] = filterApprovedGuardCatalog(key, value);
    }
  }
  refreshDerivedHashes(cutover);
  refreshDerivedHashes(baseline);
  if (canonical(baseline) !== canonical(cutover)) fail('unexpected baseline-to-cutover delta');
}

function verifyTransition(flags: Map<string, string>): void {
  const manifest = JSON.parse(readFileSync(required(flags, '--manifest'), 'utf8')) as JsonObject;
  if (manifest.schema !== SCHEMA) fail('source manifest schema mismatch');
  validateTransition(
    object(manifest.baseline, 'manifest.baseline'),
    object(manifest.cutover_snapshot, 'manifest.cutover_snapshot')
  );
  process.stdout.write('baseline-to-cutover transition equality passed\n');
}

function compare(flags: Map<string, string>): void {
  const source = JSON.parse(readFileSync(required(flags, '--source'), 'utf8')) as JsonObject;
  const target = JSON.parse(readFileSync(required(flags, '--target'), 'utf8')) as JsonObject;
  const viewName = required(flags, '--view');
  if (viewName !== 'baseline' && viewName !== 'cutover_snapshot')
    fail('view must be baseline or cutover_snapshot');
  const targetDatabase = required(flags, '--target-database');
  if (source.schema !== SCHEMA || target.schema !== SCHEMA) fail('manifest schema mismatch');
  const expected = normalizeSource(object(source[viewName], `source.${viewName}`));
  const actual = normalizeForTarget(object(target[viewName], `target.${viewName}`), targetDatabase);
  if (canonical(expected) !== canonical(actual)) fail(`manifest mismatch for ${viewName}`);
  process.stdout.write(`${viewName} manifest equality passed\n`);
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (command === 'compare') {
    compare(flags);
    return;
  }
  if (command === 'verify-inventory') {
    verifyInventory(flags);
    return;
  }
  if (command === 'verify-transition') {
    verifyTransition(flags);
    return;
  }
  if (command === 'capture' || command === 'capture-target') {
    const output = required(flags, '--output');
    const snapshot = flags.get('--snapshot') ?? null;
    if (command === 'capture' && (!snapshot || !SNAPSHOT_PATTERN.test(snapshot)))
      fail('capture requires a valid exported snapshot');
    if (command === 'capture-target' && snapshot !== null)
      fail('target capture cannot accept an external snapshot');
    const cutover = capture(snapshot);
    const expectedCatalogEvidence =
      command === 'capture' && flags.has('--expected-catalog')
        ? validateExpectedCatalog(flags, snapshot!, cutover)
        : null;
    let baseline = cutover;
    const baselinePath = flags.get('--baseline');
    if (baselinePath) {
      const supplied = JSON.parse(readFileSync(baselinePath, 'utf8')) as JsonObject;
      baseline = object(supplied.baseline ?? supplied, 'baseline');
      validateTransition(baseline, cutover, expectedCatalogEvidence?.guarded_relations);
    }
    const manifest = {
      schema: SCHEMA,
      snapshot_id: snapshot ?? 'isolated-target',
      ...(expectedCatalogEvidence === null
        ? {}
        : {
            expected_catalog_file_sha256: expectedCatalogEvidence.file_sha256,
            expected_baseline_structural_sha256: expectedCatalogEvidence.baseline_structural_sha256,
          }),
      baseline,
      cutover_snapshot: cutover,
    };
    writeOwnerOnly(output, manifest);
    return;
  }
  if (command === 'inventory') {
    const output = required(flags, '--output');
    writeOwnerOnly(output, captureInventory());
    return;
  }
  fail(
    'command must be capture, capture-target, compare, inventory, verify-inventory, or verify-transition'
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`source manifest failed: ${message}\n`);
  process.exitCode = 1;
}
