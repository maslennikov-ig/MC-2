import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const REAL_PG17 = process.env.MC2_HELIXA_REAL_PG17 === '1';
const CONTAINER = `mc2-helixa-auth-repair-${process.pid}-${Date.now()}`;
const PASSWORD = 'local-auth-repair-fixture';
const MIGRATIONS_DIR = join(__dirname, '../../../supabase/migrations');
const REPAIR_MIGRATION = join(
  MIGRATIONS_DIR,
  '20260905170000_repair_auth_users_email_change.sql'
);

function docker(args: string[], timeout = 120_000): string {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return (result.stdout ?? '').trim();
}

let pool: Pool;
let functionAclBeforeRepair: string;

describe.runIf(REAL_PG17)('Helixa Auth email_change repair on disposable PostgreSQL 17', () => {
  beforeAll(async () => {
    docker([
      'run',
      '--rm',
      '-d',
      '--name',
      CONTAINER,
      '-e',
      `POSTGRES_PASSWORD=${PASSWORD}`,
      '-p',
      '127.0.0.1::5432',
      'postgres:17.10-bookworm',
    ]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres'], {
        encoding: 'utf8',
      });
      if (ready.status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const port = docker(['port', CONTAINER, '5432/tcp']).split(':').at(-1)!;
    pool = new Pool({
      connectionString: `postgresql://postgres:${PASSWORD}@127.0.0.1:${port}/postgres`,
    });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    await pool.query(`
      CREATE EXTENSION pgcrypto;
      CREATE SCHEMA auth;
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE auth.users(
        id uuid PRIMARY KEY,
        instance_id uuid,
        email text,
        encrypted_password text,
        email_confirmed_at timestamptz,
        created_at timestamptz,
        updated_at timestamptz,
        aud text,
        role text,
        raw_app_meta_data jsonb,
        raw_user_meta_data jsonb,
        confirmation_token text,
        email_change_token_new text,
        email_change text,
        recovery_token text
      );
    `);
    await pool.query(
      readFileSync(
        join(MIGRATIONS_DIR, '20251111000001_remove_test_env_check.sql'),
        'utf8'
      )
    );
    await pool.query(`
      GRANT EXECUTE ON FUNCTION public.create_test_auth_user(UUID, TEXT, TEXT, TEXT, BOOLEAN)
        TO service_role;
    `);
    functionAclBeforeRepair = (
      await pool.query(`
        SELECT proacl::text AS acl
        FROM pg_proc
        WHERE oid = 'public.create_test_auth_user(uuid,text,text,text,boolean)'::regprocedure
      `)
    ).rows[0].acl;
    await pool.query(`
      INSERT INTO auth.users(
        id, email, confirmation_token, email_change_token_new, email_change, recovery_token
      ) VALUES
        ('11111111-1111-4111-8111-111111111111', 'affected@example.test', '', '', NULL, ''),
        ('22222222-2222-4222-8222-222222222222', 'preserved@example.test', '', '', 'pending@example.test', '');
    `);
    if (existsSync(REPAIR_MIGRATION)) {
      await pool.query(readFileSync(REPAIR_MIGRATION, 'utf8'));
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    docker(['rm', '-f', CONTAINER]);
  });

  it('repairs only NULL email_change values without changing the Auth column contract', async () => {
    const rows = await pool.query(
      'SELECT email, email_change FROM auth.users ORDER BY email'
    );
    expect(rows.rows).toEqual([
      { email: 'affected@example.test', email_change: '' },
      { email: 'preserved@example.test', email_change: 'pending@example.test' },
    ]);
    const column = (
      await pool.query(`
        SELECT is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema='auth' AND table_name='users' AND column_name='email_change'
      `)
    ).rows[0];
    expect(column).toEqual({ is_nullable: 'YES', column_default: null });
  });

  it('makes create_test_auth_user write the Auth-compatible empty value', async () => {
    const result = (
      await pool.query(
        `SELECT create_test_auth_user(
          '33333333-3333-4333-8333-333333333333'::uuid,
          'new-fixture@example.test',
          crypt('fixture-password', gen_salt('bf')),
          'instructor',
          true
        ) value`
      )
    ).rows[0].value;
    expect(result.success).toBe(true);
    expect(
      (
        await pool.query(
          `SELECT email_change FROM auth.users
           WHERE id='33333333-3333-4333-8333-333333333333'::uuid`
        )
      ).rows[0].email_change
    ).toBe('');
  });

  it('preserves the existing function ACL exactly', async () => {
    const acl = (
      await pool.query(`
        SELECT proacl::text AS acl
        FROM pg_proc
        WHERE oid = 'public.create_test_auth_user(uuid,text,text,text,boolean)'::regprocedure
      `)
    ).rows[0].acl;
    expect(acl).toBe(functionAclBeforeRepair);
    expect(
      (
        await pool.query(`
          SELECT
            has_function_privilege(
              'service_role',
              'public.create_test_auth_user(uuid,text,text,text,boolean)',
              'EXECUTE'
            ) AS service_role_execute,
            has_function_privilege(
              'authenticated',
              'public.create_test_auth_user(uuid,text,text,text,boolean)',
              'EXECUTE'
            ) AS authenticated_execute,
            has_function_privilege(
              'anon',
              'public.create_test_auth_user(uuid,text,text,text,boolean)',
              'EXECUTE'
            ) AS anon_execute
        `)
      ).rows[0]
    ).toEqual({
      service_role_execute: true,
      authenticated_execute: false,
      anon_execute: false,
    });
  });
});
