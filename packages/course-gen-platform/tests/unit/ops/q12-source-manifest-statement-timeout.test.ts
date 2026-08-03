import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// mc2-0rj7i. The source carries statement_timeout=120000 in its configuration file and the backup
// connects as `postgres`, which has no per-role override — both measured 2026-08-03 from pg_settings
// and pg_db_role_setting. Every relation hash reads a whole table, and a cancelled manifest query
// costs a whole night of backup coverage, so every transaction the tool opens raises the ceiling
// for its own duration. The hash itself was made ~4x cheaper afterwards (see
// q12-source-manifest-row-hash.test.ts); the ceiling stays, because cost still tracks table size
// and the headroom is what keeps a slow night from becoming an uncovered one.
//
// This guard exists because the next transaction added to the tool would otherwise inherit the
// two-minute cap silently.
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
