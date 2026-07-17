import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertPgcryptoDigestDependency } from '../../../scripts/migrations/document-evidence-approved';

// Round-18: assertPgcryptoDigestDependency must be search_path-INDEPENDENT. The §3
// allowlisted postgres role carries search_path="$user", public, extensions in both the
// cloud and the drill-replayed isolate, and the earlier to_regprocedure(...)::text clause
// rendered the digest name WITHOUT its schema when `extensions` is on the path, so the check
// failed against every real environment. This runs the REAL check in BOTH search_path shapes.
const url = process.env.DOCUMENT_EVIDENCE_PGCRYPTO_DB;
const maybe = url ? describe : describe.skip;

maybe('pgcrypto digest dependency is search_path-independent (round-18)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query(`
      DROP SCHEMA IF EXISTS extensions CASCADE;
      CREATE SCHEMA extensions;
      CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    `);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  it('passes with `extensions` on the session search_path (the real §3 postgres role shape)', async () => {
    await client.query(`SET search_path TO "$user", public, extensions`);
    await expect(assertPgcryptoDigestDependency(client)).resolves.toBeUndefined();
  });

  it('passes WITHOUT `extensions` on the session search_path', async () => {
    await client.query(`SET search_path TO "$user", public`);
    await expect(assertPgcryptoDigestDependency(client)).resolves.toBeUndefined();
  });

  it('still fails closed when pgcrypto is the wrong version', async () => {
    // A different extension schema/version must still be rejected — the catalog facts hold.
    await client.query(`SET search_path TO "$user", public, extensions`);
    await client.query(`ALTER EXTENSION pgcrypto SET SCHEMA public`);
    try {
      await expect(assertPgcryptoDigestDependency(client)).rejects.toThrow(
        /pgcrypto digest dependency does not match/u
      );
    } finally {
      await client.query(`ALTER EXTENSION pgcrypto SET SCHEMA extensions`);
    }
  });
});
