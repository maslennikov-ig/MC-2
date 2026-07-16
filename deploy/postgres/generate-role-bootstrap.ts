#!/usr/bin/env -S pnpm exec tsx
import { closeSync, fsyncSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type JsonObject = Record<string, unknown>;

interface Role {
  name: string;
  rolsuper: boolean;
  rolinherit: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolcanlogin: boolean;
  rolreplication: boolean;
  rolconnlimit: number;
  rolvaliduntil: string | null;
  rolbypassrls: boolean;
}

interface Membership {
  member: string;
  role: string;
  grantor: string;
  admin_option: boolean;
  inherit_option: boolean;
  set_option: boolean;
}

interface RoleSetting {
  role: string;
  database: string | null;
  name: string;
  value: string;
}

interface ParameterAcl {
  parameter: string;
  grantor: string;
  grantee: string;
  privilege: 'SET' | 'ALTER SYSTEM';
  grantable: boolean;
}

const MISSING_ROLE_ALLOWLIST = new Set([
  'admin',
  'instructor',
  'pgtle_admin',
  'student',
  'supabase_functions_admin',
  'supabase_privileged_role',
  'supabase_realtime_admin',
  'superadmin',
]);

// Aligned with the observed managed Supabase role plane (decision .13.14
// trusted residual boundary): the live source and the pinned fresh image
// carry identical elevated attributes for every shared platform role.
const ROLE_PRIVILEGE_ALLOWLIST = {
  rolbypassrls: new Set([
    'postgres',
    'service_role',
    'supabase_admin',
    'supabase_etl_admin',
    'supabase_read_only_user',
  ]),
  rolcanlogin: new Set([
    'admin',
    'authenticator',
    'dashboard_user',
    'instructor',
    'pgbouncer',
    'pgtle_admin',
    'postgres',
    'student',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_etl_admin',
    'supabase_functions_admin',
    'supabase_privileged_role',
    'supabase_read_only_user',
    'supabase_realtime_admin',
    'supabase_replication_admin',
    'supabase_storage_admin',
    'superadmin',
  ]),
  rolcreatedb: new Set(['dashboard_user', 'postgres', 'supabase_admin']),
  rolcreaterole: new Set([
    'dashboard_user',
    'postgres',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_functions_admin',
    'supabase_storage_admin',
  ]),
  rolreplication: new Set([
    'dashboard_user',
    'postgres',
    'supabase_admin',
    'supabase_etl_admin',
    'supabase_replication_admin',
  ]),
  rolsuper: new Set(['postgres', 'supabase_admin']),
} satisfies Record<string, Set<string>>;

const ROLE_SETTING_ALLOWLIST = new Map<string, Set<string>>([
  ['anon', new Set(['statement_timeout=3s'])],
  ['authenticated', new Set(['statement_timeout=8s'])],
  [
    'authenticator',
    new Set(['lock_timeout=8s', 'session_preload_libraries=safeupdate', 'statement_timeout=8s']),
  ],
  [
    'postgres',
    new Set([
      'search_path="$user", public, extensions',
      // The live managed role literally stores a backslash-escaped
      // search_path (an old migration escaping artifact); the restore must
      // reproduce the source byte-for-byte, so both renderings are allowed.
      'search_path="\\$user", public, extensions',
    ]),
  ],
  [
    'supabase_admin',
    new Set(['log_statement=none', 'search_path="$user", public, auth, extensions']),
  ],
  [
    'supabase_auth_admin',
    new Set([
      'idle_in_transaction_session_timeout=60000',
      'log_statement=none',
      'search_path=auth',
    ]),
  ],
  ['supabase_read_only_user', new Set(['default_transaction_read_only=on'])],
  ['supabase_storage_admin', new Set(['log_statement=none', 'search_path=storage'])],
]);

const ROLE_KEYS = [
  'name',
  'rolsuper',
  'rolinherit',
  'rolcreaterole',
  'rolcreatedb',
  'rolcanlogin',
  'rolreplication',
  'rolconnlimit',
  'rolvaliduntil',
  'rolbypassrls',
] as const;

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

function exactKeys(value: JsonObject, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted))
    fail(`${label} has an unexpected field set`);
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean`);
  return value;
}

function parseRoleRecord(value: unknown, label: string): Role {
  const item = object(value, label);
  exactKeys(item, ROLE_KEYS, label);
  const role: Role = {
    name: string(item.name, `${label}.name`),
    rolsuper: boolean(item.rolsuper, `${label}.rolsuper`),
    rolinherit: boolean(item.rolinherit, `${label}.rolinherit`),
    rolcreaterole: boolean(item.rolcreaterole, `${label}.rolcreaterole`),
    rolcreatedb: boolean(item.rolcreatedb, `${label}.rolcreatedb`),
    rolcanlogin: boolean(item.rolcanlogin, `${label}.rolcanlogin`),
    rolreplication: boolean(item.rolreplication, `${label}.rolreplication`),
    rolconnlimit: Number(item.rolconnlimit),
    rolvaliduntil:
      item.rolvaliduntil === null ? null : string(item.rolvaliduntil, `${label}.rolvaliduntil`),
    rolbypassrls: boolean(item.rolbypassrls, `${label}.rolbypassrls`),
  };
  if (!Number.isSafeInteger(role.rolconnlimit) || role.rolconnlimit < -1)
    fail(`${label}.rolconnlimit is invalid`);
  return role;
}

function parseRole(value: unknown, label: string): Role {
  const role = parseRoleRecord(value, label);
  if (role.name === 'cli_login_postgres' || role.name.startsWith('pg_'))
    fail(`${label} contains an excluded role`);
  return role;
}

function parsePgParticipant(value: unknown, label: string): Role {
  const role = parseRoleRecord(value, label);
  if (!role.name.startsWith('pg_')) fail(`${label} must be an exact pg_* role participant`);
  return role;
}

function parseMembership(value: unknown, label: string): Membership {
  const item = object(value, label);
  exactKeys(
    item,
    ['member', 'role', 'grantor', 'admin_option', 'inherit_option', 'set_option'],
    label
  );
  return {
    member: string(item.member, `${label}.member`),
    role: string(item.role, `${label}.role`),
    grantor: string(item.grantor, `${label}.grantor`),
    admin_option: boolean(item.admin_option, `${label}.admin_option`),
    inherit_option: boolean(item.inherit_option, `${label}.inherit_option`),
    set_option: boolean(item.set_option, `${label}.set_option`),
  };
}

function parseSetting(value: unknown, label: string): RoleSetting {
  const item = object(value, label);
  exactKeys(item, ['role', 'database', 'name', 'value'], label);
  return {
    role: string(item.role, `${label}.role`),
    database: item.database === null ? null : string(item.database, `${label}.database`),
    name: string(item.name, `${label}.name`),
    value: string(item.value, `${label}.value`),
  };
}

function parseParameterAcl(value: unknown, label: string): ParameterAcl {
  const item = object(value, label);
  exactKeys(item, ['parameter', 'grantor', 'grantee', 'privilege', 'grantable'], label);
  const privilege = string(item.privilege, `${label}.privilege`);
  if (privilege !== 'SET' && privilege !== 'ALTER SYSTEM') fail(`${label}.privilege is invalid`);
  return {
    parameter: string(item.parameter, `${label}.parameter`),
    grantor: string(item.grantor, `${label}.grantor`),
    grantee: string(item.grantee, `${label}.grantee`),
    privilege,
    grantable: boolean(item.grantable, `${label}.grantable`),
  };
}

function identifier(value: string): string {
  if (value.includes('\0')) fail('identifier contains NUL');
  return `"${value.replaceAll('"', '""')}"`;
}

function literal(value: string): string {
  if (value.includes('\0') || value.includes('\n') || value.includes('\r'))
    fail('SQL literal contains a control character');
  return `'${value.replaceAll("'", "''")}'`;
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

function scanSecretShape(value: unknown): void {
  const text = canonical(value);
  if (/postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/i.test(text)) fail('URI-shaped secret is forbidden');
  if (/eyJ[A-Za-z0-9_-]{20,}\.|sbp_[A-Za-z0-9_-]{16,}/.test(text))
    fail('token-shaped secret is forbidden');
  if (/rolpassword|password_hash|encrypted_password/i.test(text))
    fail('password field is forbidden');
}

function roleSql(role: Role): string {
  // A missing role may carry an elevated attribute only when the exact
  // per-role privilege allowlist permits that pair: the managed
  // supabase_functions_admin ships CREATEROLE yet is absent from the fresh
  // image, so the blanket rejection contradicted the observed role plane.
  for (const [attribute, allowlist] of Object.entries(ROLE_PRIVILEGE_ALLOWLIST)) {
    if (attribute === 'rolcanlogin') continue;
    if (role[attribute as keyof Role] === true && !allowlist.has(role.name)) {
      fail(`missing role ${role.name} requests a forbidden elevated attribute`);
    }
  }
  const attributes = [
    role.rolsuper ? 'SUPERUSER' : 'NOSUPERUSER',
    role.rolinherit ? 'INHERIT' : 'NOINHERIT',
    role.rolcreaterole ? 'CREATEROLE' : 'NOCREATEROLE',
    role.rolcreatedb ? 'CREATEDB' : 'NOCREATEDB',
    role.rolcanlogin ? 'LOGIN' : 'NOLOGIN',
    role.rolreplication ? 'REPLICATION' : 'NOREPLICATION',
    role.rolbypassrls ? 'BYPASSRLS' : 'NOBYPASSRLS',
    `CONNECTION LIMIT ${role.rolconnlimit}`,
  ];
  if (role.rolvaliduntil !== null) attributes.push(`VALID UNTIL ${literal(role.rolvaliduntil)}`);
  return `CREATE ROLE ${identifier(role.name)} WITH ${attributes.join(' ')};`;
}

function validateRolePrivileges(role: Role): void {
  for (const [attribute, allowlist] of Object.entries(ROLE_PRIVILEGE_ALLOWLIST)) {
    if (role[attribute as keyof Role] === true && !allowlist.has(role.name)) {
      fail(`role privilege allowlist rejects ${role.name}.${attribute}`);
    }
  }
}

function isAvailableParticipant(
  name: string,
  targetRoles: Set<string>,
  pgParticipants: Set<string>
): boolean {
  return targetRoles.has(name) || pgParticipants.has(name);
}

function parseArgs(args: string[]): {
  manifest: string;
  image: string;
  output: string;
  targetDatabase: string;
} {
  const result: Partial<{
    manifest: string;
    image: string;
    output: string;
    targetDatabase: string;
  }> = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) fail(`missing value for ${flag ?? 'argument'}`);
    if (flag === '--manifest') result.manifest = value;
    else if (flag === '--image-inventory') result.image = value;
    else if (flag === '--output') result.output = value;
    else if (flag === '--target-database') result.targetDatabase = value;
    else fail(`unsupported argument ${flag}`);
  }
  if (!result.manifest || !result.image || !result.output)
    fail('manifest, image inventory, and output are required');
  return { ...result, targetDatabase: result.targetDatabase ?? 'restore_test' } as {
    manifest: string;
    image: string;
    output: string;
    targetDatabase: string;
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8')) as JsonObject;
  const image = JSON.parse(readFileSync(args.image, 'utf8')) as JsonObject;
  scanSecretShape(image);
  if (manifest.schema !== 'megacampus.supabase-source-manifest/v1')
    fail('source manifest schema mismatch');
  const source = object(manifest.cutover_snapshot, 'cutover_snapshot');
  // The bootstrap renders SQL only from the role plane; manifest catalog
  // definition bodies legitimately embed public tokens such as the published
  // supabase-dbdev anon JWT and never reach the generated bootstrap.
  scanSecretShape({
    roles: source.roles,
    pg_participants: source.pg_participants,
    memberships: source.memberships,
    role_settings: source.role_settings,
    parameter_acls: source.parameter_acls,
  });
  const roles = array(source.roles, 'cutover_snapshot.roles').map((value, index) =>
    parseRole(value, `cutover_snapshot.roles[${index}]`)
  );
  for (const role of roles) validateRolePrivileges(role);
  const duplicateRoles = roles
    .map(item => item.name)
    .filter((name, index, all) => all.indexOf(name) !== index);
  if (duplicateRoles.length > 0) fail('source roles contain duplicates');

  const imageRoleValues = array(image.roles, 'image.roles');
  const imageRoles = new Map<string, Role>();
  for (const [index, value] of imageRoleValues.entries()) {
    const parsed = parseRole(value, `image.roles[${index}]`);
    if (imageRoles.has(parsed.name)) fail('image roles contain duplicates');
    imageRoles.set(parsed.name, parsed);
  }
  const sourceNames = new Set(roles.map(item => item.name));
  for (const name of imageRoles.keys()) {
    if (!sourceNames.has(name)) fail(`unexpected image role ${name}`);
  }

  const sql: string[] = [
    '-- Generated from megacampus.supabase-source-manifest/v1; raw pg_dumpall SQL is never executed.',
    '\\set ON_ERROR_STOP on',
  ];
  for (const role of roles.sort((left, right) => left.name.localeCompare(right.name))) {
    const imageRole = imageRoles.get(role.name);
    if (imageRoles.has(role.name)) {
      if (canonical(imageRole) !== canonical(role))
        fail(`image role attribute drift for ${role.name}`);
      continue;
    }
    if (!MISSING_ROLE_ALLOWLIST.has(role.name)) fail(`unexpected missing source role ${role.name}`);
    sql.push(roleSql(role));
  }

  const targetRoles = new Set([...sourceNames]);
  const sourcePgParticipants = array(source.pg_participants, 'source.pg_participants').map(
    (value, index) => parsePgParticipant(value, `source.pg_participants[${index}]`)
  );
  const imagePgParticipants = array(image.pg_participants, 'image.pg_participants').map(
    (value, index) => parsePgParticipant(value, `image.pg_participants[${index}]`)
  );
  const sourcePgMap = new Map(sourcePgParticipants.map(role => [role.name, role]));
  const imagePgMap = new Map(imagePgParticipants.map(role => [role.name, role]));
  if (
    sourcePgMap.size !== sourcePgParticipants.length ||
    imagePgMap.size !== imagePgParticipants.length
  ) {
    fail('pg participant inventory contains duplicates');
  }
  if (
    canonical([...sourcePgMap.entries()].sort()) !== canonical([...imagePgMap.entries()].sort())
  ) {
    fail('pg participant inventory drift');
  }
  const availablePgParticipants = new Set(sourcePgMap.keys());
  const imageMemberships = array(image.memberships, 'image.memberships').map((value, index) =>
    parseMembership(value, `image.memberships[${index}]`)
  );
  const sourceMemberships = array(source.memberships, 'source.memberships').map((value, index) =>
    parseMembership(value, `source.memberships[${index}]`)
  );
  const sourceMembershipKeys = new Set(sourceMemberships.map(canonical));
  for (const membership of imageMemberships) {
    if (!sourceMembershipKeys.has(canonical(membership))) fail('image membership drift');
  }
  const imageMembershipKeys = new Set(imageMemberships.map(canonical));
  // PostgreSQL 16+ verifies the named grantor's ADMIN OPTION at grant time,
  // and on the live plane postgres receives ADMIN on the custom roles from
  // supabase_admin before acting as a grantor itself, so superuser-granted
  // memberships must replay first.
  const grantorPhase = (membership: Membership): number =>
    membership.grantor === 'supabase_admin' ? 0 : 1;
  for (const membership of sourceMemberships.sort(
    (left, right) =>
      grantorPhase(left) - grantorPhase(right) || canonical(left).localeCompare(canonical(right))
  )) {
    for (const participant of [membership.member, membership.role, membership.grantor]) {
      if (!isAvailableParticipant(participant, targetRoles, availablePgParticipants))
        fail(`membership references unavailable role ${participant}`);
    }
    if (imageMembershipKeys.has(canonical(membership))) continue;
    sql.push(`SET ROLE ${identifier(membership.grantor)};`);
    sql.push(
      `GRANT ${identifier(membership.role)} TO ${identifier(membership.member)} WITH ADMIN ${membership.admin_option ? 'TRUE' : 'FALSE'}, INHERIT ${membership.inherit_option ? 'TRUE' : 'FALSE'}, SET ${membership.set_option ? 'TRUE' : 'FALSE'};`
    );
    sql.push('RESET ROLE;');
  }

  const settings = array(source.role_settings, 'source.role_settings').map((value, index) =>
    parseSetting(value, `source.role_settings[${index}]`)
  );
  for (const setting of settings.sort((left, right) =>
    canonical(left).localeCompare(canonical(right))
  )) {
    const permitted = ROLE_SETTING_ALLOWLIST.get(setting.role);
    if (!permitted?.has(`${setting.name}=${setting.value}`))
      fail(`role setting is not allowlisted for ${setting.role}`);
    if (!targetRoles.has(setting.role))
      fail(`role setting references unavailable role ${setting.role}`);
    if (setting.database !== null) continue;
    sql.push(
      `ALTER ROLE ${identifier(setting.role)} SET ${identifier(setting.name)} TO ${literal(setting.value)};`
    );
  }

  const imageParameterAcls = array(image.parameter_acls, 'image.parameter_acls').map(
    (value, index) => parseParameterAcl(value, `image.parameter_acls[${index}]`)
  );
  const sourceParameterAcls = array(source.parameter_acls, 'source.parameter_acls').map(
    (value, index) => parseParameterAcl(value, `source.parameter_acls[${index}]`)
  );
  const sourceAclKeys = new Set(sourceParameterAcls.map(canonical));
  for (const acl of imageParameterAcls) {
    if (!sourceAclKeys.has(canonical(acl))) fail('image parameter ACL drift');
  }
  const imageAclKeys = new Set(imageParameterAcls.map(canonical));
  for (const acl of sourceParameterAcls.sort((left, right) =>
    canonical(left).localeCompare(canonical(right))
  )) {
    if (imageAclKeys.has(canonical(acl))) continue;
    if (!isAvailableParticipant(acl.grantor, targetRoles, availablePgParticipants))
      fail('parameter ACL references unavailable grantor');
    if (
      acl.grantee !== 'PUBLIC' &&
      !isAvailableParticipant(acl.grantee, targetRoles, availablePgParticipants)
    ) {
      fail('parameter ACL references unavailable grantee');
    }
    const grantee = acl.grantee === 'PUBLIC' ? 'PUBLIC' : identifier(acl.grantee);
    sql.push(`SET ROLE ${identifier(acl.grantor)};`);
    sql.push(
      `GRANT ${acl.privilege} ON PARAMETER ${identifier(acl.parameter)} TO ${grantee}${acl.grantable ? ' WITH GRANT OPTION' : ''};`
    );
    sql.push('RESET ROLE;');
  }

  const contents = `${sql.join('\n')}\n`;
  scanSecretShape(contents);
  const fd = openSync(args.output, 'wx', 0o600);
  try {
    writeFileSync(fd, contents, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const parent = openSync(dirname(args.output), 'r');
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`role bootstrap failed: ${message}\n`);
  process.exitCode = 1;
}
