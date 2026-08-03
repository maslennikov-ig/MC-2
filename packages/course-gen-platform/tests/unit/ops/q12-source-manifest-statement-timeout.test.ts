import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// mc2-0rj7i. The source carries statement_timeout=120000 in its configuration file and the backup
// connects as `postgres`, which has no per-role override — both measured 2026-08-03 from pg_settings
// and pg_db_role_setting. Every relation hash serializes a whole table to JSON, sorts by that full
// text and concatenates it before hashing, so cost tracks table BYTES, not row count:
//
//   file_catalog       261 rows / 129MB   34.5s   external merge, 276MB to disk
//   lesson_contents   4140 rows /  63MB   20.4s   external merge, 202MB to disk
//   generation_trace 36824 rows /  40MB    5.5s   external merge, ~100MB to disk
//
// One relation was already spending 29% of the budget, and it grows with every upload. A cancelled
// manifest query costs a whole night of backup coverage, so every transaction the tool opens raises
// the ceiling for its own duration. This guard exists because the next transaction added to the
// tool would otherwise inherit the two-minute cap silently.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const TOOL = resolve(REPO_ROOT, 'deploy/postgres/q12-source-manifest.ts');
const OPENER = /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;[^`\n]*/g;

describe('Supabase source manifest statement timeout', () => {
  it('raises the ceiling on every transaction it opens, with none left behind', () => {
    const tool = readFileSync(TOOL, 'utf8');
    const openers = tool.match(OPENER) ?? [];

    // Four today: the catalog capture, the per-relation hash, the barrier probe and the inventory.
    expect(openers.length).toBeGreaterThanOrEqual(4);
    for (const opener of openers) {
      expect(opener, opener).toContain('STATEMENT_TIMEOUT');
    }
  });

  it('keeps the ceiling bounded rather than removing it', () => {
    const tool = readFileSync(TOOL, 'utf8');

    expect(tool).toContain("SET LOCAL statement_timeout = '10min';");
    // SET LOCAL, so it reverts at COMMIT and cannot leak into another statement on the connection.
    expect(tool).not.toContain('SET statement_timeout');
    // 0 disables the timeout entirely, which would leave TimeoutStartSec=2h as the only thing
    // bounding a session that holds an exported snapshot. That is the trade this deliberately
    // refuses: the ceiling is raised, never removed.
    expect(tool).not.toMatch(/statement_timeout\s*=\s*'?0/u);
  });
});
