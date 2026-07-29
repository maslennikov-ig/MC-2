import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// mc2-1cxna — the C3 blocker of window attempts #13 and #14 (2026-07-29), and the fifteenth
// instance of the environment-substitution class.
//
// The FROZEN pg.backup manifest env pins HOME=/root while the command runs as the deploy operator.
// libpq resolves its default client certificate at $HOME/.postgresql/postgresql.crt, and /root is
// 0700 root-owned — so the lookup fails with EACCES rather than "absent" and libpq refuses the
// connection outright:
//
//   pg_dumpall: error: connection to server ... failed: could not open certificate file
//   "/root/.postgresql/postgresql.crt": Permission denied
//
// Proven on production read-only afterwards: the identical command exits 1 with exactly that
// message under HOME=/root and exits 0 with 7943 bytes and empty stderr under a run-private HOME.
// It killed C3 twice, AFTER the writers were already stopped, because the failure text was
// discarded (fixed in the same pass — see the fail_command assertions below).
//
// The manifest env cannot move (it is inside the frozen W-tuple command manifest), so the fix is
// the script handing its libpq children a HOME they can stat. These are drift guards: if either
// side moves, C3 breaks in the window rather than here.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const SCRIPT = resolve(REPO_ROOT, 'deploy/postgres/backup-supabase.sh');
const COMMAND_MANIFEST = resolve(REPO_ROOT, 'deploy/qdrant/q12-command-manifest.json');

describe('Q12 C3: libpq children get a HOME they can stat (mc2-1cxna)', () => {
  it('still runs under the frozen HOME=/root that caused the failure', () => {
    const manifest = JSON.parse(readFileSync(COMMAND_MANIFEST, 'utf8')) as {
      commands: Record<string, { env: Record<string, string> }>;
    };

    // If this ever stops being true the override below is dead weight — but it is frozen, so the
    // assertion documents WHY the override exists rather than gating it.
    expect(manifest.commands['pg.backup'].env.HOME).toBe('/root');
  });

  it('overrides HOME to the run-private generation directory on every libpq invocation', () => {
    const script = readFileSync(SCRIPT, 'utf8');

    const invocations = script.match(
      /PGSERVICE=mc2_supabase_backup PGSERVICEFILE="\$service_file"[^\n]*/gu
    );
    expect(invocations, 'the libpq invocations are no longer recognisable').not.toBeNull();
    // pg_dumpall before/after the snapshot, pg_dump, both manifest-generator branches, and the
    // scheduled snapshot coordinator — every child that can reach libpq's default lookup.
    expect(invocations).toHaveLength(6);
    for (const invocation of invocations as string[]) {
      expect(invocation).toContain('HOME="$TEMP_GENERATION"');
    }
    // TEMP_GENERATION is this run's own adopted directory, so the default client-certificate
    // lookup lands somewhere that exists and holds no .postgresql.
    expect(script).toContain(
      'create_adopted_temp directory ".generation.$RUN_ID." TEMP_GENERATION'
    );
  });

  it('fails the capture steps WITH their captured diagnostics', () => {
    const script = readFileSync(SCRIPT, 'utf8');

    // Every step that routes stderr into $command_stderr must report it before failing; a bare
    // status is what made the first C3 failure undiagnosable.
    const discarded = script.match(/\|\| fail "(?:pg_dumpall|pg_restore|source manifest)[^"]*"/gu);
    expect(discarded, 'a capture step still fails without surfacing its stderr').toBeNull();
    expect(script.match(/\|\| fail_command "/gu)).toHaveLength(5);
    expect(script).toContain('REDACTED:REDACTED@');
  });
});
