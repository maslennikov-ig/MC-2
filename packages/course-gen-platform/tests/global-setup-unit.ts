/**
 * Lightweight globalSetup/teardown for unit tests
 *
 * The main fix is mocking Supabase in setup-unit.ts.
 * This globalSetup serves as a safety net — if any worker process
 * still hangs after tests complete, teardown forces process exit.
 */

export function setup() {
  console.log('[global-setup] setup() called');
}

export function teardown() {
  console.log('[global-setup] teardown() called — will force exit in 3s');
  setTimeout(() => {
    console.log('[global-setup] Forcing process.exit(0)');
    process.exit(0);
  }, 3000);
}
