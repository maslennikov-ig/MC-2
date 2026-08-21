/**
 * Contract: an OpenRouter transport is built in one place, or it is listed here.
 *
 * A client assembled anywhere else does not carry
 * `instrumentFetchWithGenerationId`, so `x-generation-id` never arrives, so
 * `GET /api/v1/generation` can never be asked what the call cost, so the price
 * stays an estimate forever. Two of the four clients this repository was known
 * to have were in exactly that state, and nothing noticed until an invoice did:
 * one 1024x1024 card image booked at $0.007 against a real $0.045080 was the
 * entire residual of the 2026-08-21 reconciliation (mc2-z7ryi).
 *
 * The check found a fifth and a sixth while it was being written — both
 * `ChatOpenAI` builders inside Stage 5, both reading the env key directly. They
 * are grandfathered below rather than fixed here, because instrumenting them
 * usefully means wrapping their call sites in `withGenerationIdCapture` and that
 * is a change to Stage 5, not to accounting (mc2-me7nx).
 *
 * Form follows the other gates in this repository: what exists is listed, and
 * the list may shrink but never grow silently.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../../../src');

/** The one module allowed to build an OpenRouter chat client. */
const FACTORY = 'shared/llm/openrouter-client.ts';

/**
 * Transports that are deliberately not the shared factory, each with why.
 *
 * A new entry needs a reason and an issue. Shrinking this list is the point of
 * it existing.
 */
const TRANSPORT_EXCEPTIONS: Record<string, string> = {
  'stages/stage7-enrichments/handlers/audio-handler.ts':
    'Stage 7 audio is OpenAI TTS on a direct OpenAI account, not OpenRouter: no baseURL, no generation record, and the /api/v1/credits delta cannot see it. The boundary is named in docs/runbooks/cost-ledger-paid-run.md (mc2-dgw4u)',
  'stages/stage5-generation/utils/metadata-generator.ts':
    'builds its own ChatOpenAI on the hardcoded-fallback path and reads OPENROUTER_API_KEY directly; instrumenting it means wrapping its call sites in withGenerationIdCapture (mc2-me7nx)',
  'stages/stage5-generation/utils/section-batch/constants.ts':
    'exports the base URL for the section-batch ChatOpenAI builder, which is uninstrumented for the same reason as metadata-generator (mc2-me7nx)',
};

/**
 * Files that name the OpenRouter API without being a chat transport.
 *
 * Reading `/api/v1/models`, `/api/v1/generation` or `/api/v1/providers` is not
 * building a client and has no generation id to capture. They are listed rather
 * than pattern-matched so a chat client cannot hide behind a plausible filename.
 */
const NON_TRANSPORT_ENDPOINTS: Record<string, string> = {
  'shared/llm/openrouter-generation.ts':
    'reads GET /api/v1/generation and /api/v1/providers — the receipt, not a call',
  'shared/llm/openrouter-batch-eligibility.ts': 'reads GET /api/v1/models to check batch support',
  'services/openrouter-models.ts': 'reads GET /api/v1/models for the admin model list',
  'server/routers/pipeline-admin/api-keys.ts':
    'calls GET /api/v1/models to validate a key an admin just pasted',
  'shared/services/api-key-service.ts': 'names the base URL in a usage example in its doc comment',
  'shared/llm/langchain-models.ts':
    'builds the instrumented ChatOpenAI transport; it already wraps fetch with instrumentFetchWithGenerationId',
};

function sources(): Array<{ path: string; text: string }> {
  return globSync('**/*.ts', { cwd: SRC })
    .filter(file => !file.endsWith('.test.ts'))
    .map(file => ({ path: file, text: readFileSync(join(SRC, file), 'utf8') }));
}

/** Whether the line this offset sits on is a comment. Prose is not a client. */
function isInComment(text: string, at: number): boolean {
  const line = text.slice(text.lastIndexOf('\n', at) + 1, at);
  return /^\s*(?:\/\/|\*|\/\*)/u.test(line);
}

/** Every position where the provider SDK client is constructed. */
function sdkClientBuilds(text: string): number[] {
  const found: number[] = [];
  const pattern = /new OpenAI\(/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (isInComment(text, match.index)) continue;
    found.push(match.index);
  }
  return found;
}

/** Every position where the OpenRouter base URL is written out by hand. */
function baseUrlLiterals(text: string): number[] {
  const found: number[] = [];
  const pattern = /openrouter\.ai\/api\/v1/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (isInComment(text, match.index)) continue;
    found.push(match.index);
  }
  return found;
}

function lineOf(text: string, at: number): number {
  return text.slice(0, at).split('\n').length;
}

describe('one instrumented transport for every OpenRouter call', () => {
  const files = sources();

  it('is looking at the source tree it means to be looking at', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some(f => f.path === FACTORY)).toBe(true);
    expect(files.some(f => f.path.includes('stage7-enrichments'))).toBe(true);
  });

  it('builds the provider SDK client only in the shared factory', () => {
    const rogue: string[] = [];
    for (const { path, text } of files) {
      if (path === FACTORY || TRANSPORT_EXCEPTIONS[path]) continue;
      for (const at of sdkClientBuilds(text)) rogue.push(`${path}:${lineOf(text, at)}`);
    }

    expect(rogue).toEqual([]);
  });

  it('writes the OpenRouter base URL only in the shared factory', () => {
    const rogue: string[] = [];
    for (const { path, text } of files) {
      if (path === FACTORY || TRANSPORT_EXCEPTIONS[path] || NON_TRANSPORT_ENDPOINTS[path]) continue;
      for (const at of baseUrlLiterals(text)) rogue.push(`${path}:${lineOf(text, at)}`);
    }

    expect(rogue).toEqual([]);
  });

  it('keeps the factory itself instrumented', () => {
    const factory = files.find(f => f.path === FACTORY);
    expect(factory).toBeDefined();
    // Without this line the factory is just a tidier version of the bug.
    expect(factory?.text).toContain('fetch: instrumentFetchWithGenerationId()');
    expect(factory?.text).toContain('getOpenRouterApiKey()');
  });

  it('would have caught the image service as it stood before the factory', () => {
    const raw = `
      const client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey,
      });
    `;

    expect(sdkClientBuilds(raw)).toHaveLength(1);
    expect(baseUrlLiterals(raw)).toHaveLength(1);
  });

  it('does not mistake prose about a client for a client', () => {
    const prose = `
      // const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1' });
       * Example: new OpenAI({ baseURL: 'https://openrouter.ai/api/v1' })
    `;

    expect(sdkClientBuilds(prose)).toEqual([]);
    expect(baseUrlLiterals(prose)).toEqual([]);
  });

  it('keeps every listed exception pointing at a file that still exists', () => {
    for (const [path, reason] of Object.entries({
      ...TRANSPORT_EXCEPTIONS,
      ...NON_TRANSPORT_ENDPOINTS,
    })) {
      expect(
        files.some(file => file.path === path),
        `${path} no longer exists; drop it from the list`
      ).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});
