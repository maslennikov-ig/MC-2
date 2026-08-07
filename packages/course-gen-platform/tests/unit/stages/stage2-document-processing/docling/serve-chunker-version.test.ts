/**
 * The Serve version that goes into the chunking profile identity.
 *
 * This is the field that makes a Serve or Docling upgrade produce a different
 * chunking profile id, which is how already-indexed chunks are recognised as
 * belonging to a superseded chunker. Reading it wrong does not fail anything —
 * it silently records `serve=unknown` forever and quietly removes the upgrade
 * from the identity, so it is worth a test that uses the real response bytes.
 *
 * The body below is exactly what `GET /version` returned from the pinned
 * production Serve on 2026-08-07. Note what is NOT in it: a `version` key.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DoclingServeChunker } from '@/stages/stage2-document-processing/docling/serve-chunker';

const REAL_VERSION_BODY = {
  'docling-serve': '1.29.0',
  'docling-jobkit': '3.2.0',
  docling: '2.118.0',
  'docling-core': '2.90.0',
  'docling-ibm-models': '3.13.3',
  'docling-parse': '7.8.1',
  python: 'cpython-312 (3.12.13)',
  plaform: 'Linux-6.8.0-generic-x86_64',
};

function mockVersionResponse(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DoclingServeChunker.serveVersion', () => {
  it('reads the version out of the shape Serve actually answers with', async () => {
    mockVersionResponse(REAL_VERSION_BODY);
    const chunker = new DoclingServeChunker({ baseUrl: 'http://docling-serve:5001' });

    expect(await chunker.serveVersion()).toBe('1.29.0/docling-2.118.0');
  });

  it('changes when Docling moves under a Serve that did not', async () => {
    // The chunkers live in `docling`, not in `docling-serve`. A Docling bump can
    // change chunk boundaries with the Serve version pinned, and a profile id
    // that ignored it would call the old and new chunks the same chunks.
    mockVersionResponse(REAL_VERSION_BODY);
    const before = await new DoclingServeChunker({ baseUrl: 'http://s:5001' }).serveVersion();

    mockVersionResponse({ ...REAL_VERSION_BODY, docling: '2.119.0' });
    const after = await new DoclingServeChunker({ baseUrl: 'http://s:5001' }).serveVersion();

    expect(after).not.toBe(before);
  });

  it('still accepts a plain `version` key if Serve ever grows one', async () => {
    mockVersionResponse({ version: '2.0.0' });
    const chunker = new DoclingServeChunker({ baseUrl: 'http://docling-serve:5001' });

    expect(await chunker.serveVersion()).toBe('2.0.0');
  });

  it('reports null rather than throwing when the endpoint is unusable', async () => {
    mockVersionResponse({ detail: 'Not Found' }, false);
    const chunker = new DoclingServeChunker({ baseUrl: 'http://docling-serve:5001' });

    expect(await chunker.serveVersion()).toBeNull();
  });

  it('asks Serve once and reuses the answer', async () => {
    const fetchMock = mockVersionResponse(REAL_VERSION_BODY);
    const chunker = new DoclingServeChunker({ baseUrl: 'http://docling-serve:5001' });

    await chunker.serveVersion();
    await chunker.serveVersion();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
