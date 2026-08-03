import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// mc2-0rj7i. relationHash used to sort a whole table by its full row JSON and concatenate it into
// one text value before hashing. That is O(table bytes) twice over: measured warm against the live
// source, file_catalog (261 rows, 129MB) took 37.2s and spilled 276MB of sort to disk, and the
// aggregate it built was a single 129MB text against a 1GB hard limit that no error message would
// have explained.
//
// The digest is now taken over the SORTED PER-ROW DIGESTS. It binds exactly the same bytes and is
// equally order-independent, but the sort key is 64 hex bytes, so every sort fits in work_mem and
// the aggregate is 65 bytes per row: 8.9s / 5.8s / 4.3s and no spill on the three largest
// relations.
//
// The behavioural proof that this still detects tampering runs against a real PostgreSQL 17.10 in
// q12-cron-row-hash-normalization.test.ts (MC2_Q12_REAL_PG17=1, docker). These are the cheap
// regression fences that run everywhere, including CI, where no PG17 exists.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const TOOL = resolve(REPO_ROOT, 'deploy/postgres/q12-source-manifest.ts');

function relationHashSql(): string {
  const tool = readFileSync(TOOL, 'utf8');
  const start = tool.indexOf('function relationHash(');
  expect(start, 'relationHash must still exist').toBeGreaterThan(-1);
  const end = tool.indexOf('\nfunction ', start + 1);
  return tool.slice(start, end === -1 ? undefined : end);
}

describe('Supabase source manifest relation row hash', () => {
  it('hashes each row first and sorts the digests, never the row text', () => {
    const sql = relationHashSql();

    expect(sql).toContain('AS row_digest');
    expect(sql).toContain("string_agg(row_digest, E'\\\\n' ORDER BY row_digest");
    // The regression: a sort key that carries the whole row. Both spellings of the row expression
    // (plain and the cron.job `active` normalization) are built from ${rowExpression}, so it is
    // enough to require that no ORDER BY mentions it.
    expect(sql).not.toMatch(/ORDER BY \$\{rowExpression\}/u);
  });

  it('keeps the optimization fence that makes the cheap sort actually happen', () => {
    const sql = relationHashSql();

    // Without AS MATERIALIZED the planner inlines the CTE and sorts the underlying rows anyway —
    // measured, that still spilled 122MB and cost 13.4s against 8.9s with the fence. This looks
    // like a stylistic keyword and is not one.
    expect(sql).toContain('WITH hashed AS MATERIALIZED');
  });

  it('orders the digests by byte value so a restored target cannot disagree', () => {
    const sql = relationHashSql();

    // The source and the restored target are compared digest-for-digest. Ordering hex text under
    // the database collation would make that comparison depend on a locale rather than on content.
    expect(sql).toContain('ORDER BY row_digest COLLATE "C"');
  });

  it('declares the manifest schema version that these digests belong to', () => {
    const tool = readFileSync(TOOL, 'utf8');

    // A v1 generation and a v2 tool describe the same database with different digests. The version
    // is what turns that into "schema mismatch" instead of "every relation drifted".
    expect(tool).toContain("const SCHEMA = 'megacampus.supabase-source-manifest/v2';");
  });
});
