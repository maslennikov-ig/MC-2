import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  resolve(
    fileURLToPath(new URL('../../../', import.meta.url)),
    'scripts/migrations/document-evidence-approved.ts'
  ),
  'utf8'
);

function extractMap(name: string): Record<string, string[]> {
  const start = SOURCE.indexOf(`const ${name} = {`);
  expect(start).toBeGreaterThan(0);
  const end = SOURCE.indexOf('} as const;', start);
  const body = SOURCE.slice(start, end);
  const map: Record<string, string[]> = {};
  for (const versionMatch of body.matchAll(/'(\d{14})':\s*\[([^\]]*)\]/g)) {
    map[versionMatch[1]] = [...versionMatch[2].matchAll(/'([0-9a-f]+)'/g)].map(m => m[1]);
  }
  return map;
}

describe('document evidence digest allowlists', () => {
  const security = extractMap('DOCUMENT_EVIDENCE_SECURITY_MANIFEST_SHA256');
  const absent = extractMap('DOCUMENT_EVIDENCE_ABSENT_SECURITY_MANIFEST_SHA256');

  it('covers the three guarded versions in both maps', () => {
    const versions = ['20260711120000', '20260711130000', '20260711140000'];
    expect(Object.keys(security).sort()).toEqual(versions);
    expect(Object.keys(absent).sort()).toEqual(versions);
  });

  it('contains only 64-character lowercase hex digests without duplicates', () => {
    for (const map of [security, absent]) {
      for (const values of Object.values(map)) {
        for (const value of values) expect(value).toMatch(/^[0-9a-f]{64}$/);
        expect(new Set(values).size).toBe(values.length);
      }
    }
  });

  it('keeps SECURITY and ABSENT digests disjoint per version', () => {
    // A digest accepted both as "version applied" and "version absent"
    // would make the live gate fail-open.
    for (const version of Object.keys(security)) {
      const applied = new Set(security[version]);
      for (const value of absent[version]) expect(applied.has(value)).toBe(false);
    }
  });
});
