import type { Client } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  assertRepositoryMigrationFrontier,
  loadDocumentEvidenceApprovedMigrations,
} from '../../../scripts/migrations/document-evidence-approved';

// Round-16: the approved-migration frontier assertion must NOT assume "every history
// version is a repository filename". In this project production history is applied via the
// Supabase MCP, which stamps apply-time version timestamps with no same-named repo file.
// The pinned frontier 20260704150249 is the anti-drift anchor: no unknown history NEWER
// than it may precede the chain.
const FRONTIER = '20260704150249';

interface HistoryRow {
  version: string;
  name: string;
  statements: string[];
}

function mockClient(rows: HistoryRow[]): Client {
  return { query: () => Promise.resolve({ rows }) } as unknown as Client;
}

describe('document-evidence approved migration frontier (round-16)', () => {
  it('tolerates MCP-style history (versions absent from repo files, max == frontier)', async () => {
    const approved = await loadDocumentEvidenceApprovedMigrations();
    const history: HistoryRow[] = [
      { version: '20260101093012', name: 'mcp_apply_alpha', statements: [] },
      { version: '20260515164533', name: 'mcp_apply_beta', statements: [] },
      { version: FRONTIER, name: 'mcp_apply_frontier', statements: [] },
    ];
    // None of the chain is applied yet -> prefix length 0, no throw.
    await expect(assertRepositoryMigrationFrontier(mockClient(history), approved)).resolves.toBe(0);
  });

  it('refuses unknown history strictly NEWER than the frontier', async () => {
    const approved = await loadDocumentEvidenceApprovedMigrations();
    const history: HistoryRow[] = [
      { version: FRONTIER, name: 'mcp_apply_frontier', statements: [] },
      { version: '20260711160000', name: 'unexpected_later_tail', statements: [] },
    ];
    await expect(assertRepositoryMigrationFrontier(mockClient(history), approved)).rejects.toThrow(
      /repository migration frontier contains unknown history/u
    );
  });

  it('refuses a version strictly BETWEEN the frontier and the first chain version', async () => {
    const approved = await loadDocumentEvidenceApprovedMigrations();
    const history: HistoryRow[] = [
      { version: FRONTIER, name: 'mcp_apply_frontier', statements: [] },
      { version: '20260706000000', name: 'between_frontier_and_chain', statements: [] },
    ];
    await expect(assertRepositoryMigrationFrontier(mockClient(history), approved)).rejects.toThrow(
      /repository migration frontier contains unknown history/u
    );
  });

  it('refuses a gapped chain prefix (second chain version present without the first)', async () => {
    const approved = await loadDocumentEvidenceApprovedMigrations();
    const history: HistoryRow[] = [
      { version: FRONTIER, name: 'mcp_apply_frontier', statements: [] },
      { version: approved[1].version, name: approved[1].name, statements: [] },
    ];
    await expect(assertRepositoryMigrationFrontier(mockClient(history), approved)).rejects.toThrow(
      /is not a supported prefix/u
    );
  });

  it('refuses a duplicate history version', async () => {
    const approved = await loadDocumentEvidenceApprovedMigrations();
    const history: HistoryRow[] = [
      { version: '20260101093012', name: 'dup', statements: [] },
      { version: '20260101093012', name: 'dup', statements: [] },
    ];
    await expect(assertRepositoryMigrationFrontier(mockClient(history), approved)).rejects.toThrow(
      /duplicate version/u
    );
  });
});
