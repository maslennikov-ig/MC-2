/**
 * The dry fixture the reindex CLI advertises has to be loadable.
 *
 * `qdrant:reindex --help` offers `--fixture <path>` as the way to exercise the
 * recovery plan with no live adapters, and this repository ships exactly one
 * fixture for it. Nothing referenced that file — not a test, not a script, not
 * a runbook — so nothing noticed when the schema moved past it.
 *
 * Checked 2026-08-26: `qdrant:reindex plan --fixture <the shipped file>` exits
 * with `REINDEX_ERROR code=fixture_invalid`, missing `sources[].hash`,
 * `sources[].errorMessage` and the whole `recoveryBinding`. The plan path
 * itself was fine — the same command against a fixture generated from the test
 * builders answered `PLAN status=ok eligible=7 recoverable=1 audited_failed=6`
 * — so the only broken thing was the artifact kept to prove it works.
 *
 * That is the failure this file prevents: an unused artifact that looks like
 * evidence. This test was run against the stale fixture and failed with the
 * same Zod complaint the CLI gives.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { loadReindexFixtureDependencies } from '../../../../tools/qdrant/reindex-course-embeddings';

const FIXTURE = join(__dirname, 'fixtures', 'reindex-dry-fixture.json');

describe('the shipped reindex dry fixture', () => {
  it('satisfies the schema the CLI parses it with', async () => {
    await expect(loadReindexFixtureDependencies(FIXTURE)).resolves.toBeDefined();
  });
});
