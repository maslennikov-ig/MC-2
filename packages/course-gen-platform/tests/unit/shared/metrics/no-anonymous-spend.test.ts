/**
 * Contract: a new paid call cannot ship without a course to charge.
 *
 * Three separate holes in the same accounting were found by three separate paid
 * runs, never by a test: Stage 6 lesson generation, Stage 6 review, and the card
 * image. Each was one forgotten argument at one new call site, and each looked
 * fine in review because nothing anywhere says the argument is required — the
 * cost context is optional by design, since chat and one-off maintenance calls
 * have no course.
 *
 * So the rule lives here, where all the call sites can be seen at once. A call
 * that cannot be attributed belongs in EXCEPTIONS with the reason and the issue
 * that will close it; that list may shrink, never grow silently.
 *
 * ## The fourth hole was a whole provider (mc2-d0e2n.4)
 *
 * Every detector above reads OpenRouter: `createOpenRouterModel*`, this
 * repository's two completion wrappers, and the SDK method underneath them. So
 * a guard that reported no anonymous spend was reporting on one provider, while
 * Jina was paid on two hot paths — one query embedding per retrieval query and
 * one reranker call per lesson — and recorded nowhere at all. Not underpriced:
 * absent. `generation_trace` held OpenRouter calls only, which is also why
 * `mc2-4clyr` could say "Stage 6 is 90% of cost" about a sum that had never
 * counted the retrieval it was describing.
 *
 * A guard that cannot see a provider is exactly as quiet as no guard, so the
 * Jina detectors below are the same rule applied to the same shape: the raw
 * HTTP call must price itself, and the two entry points that reach it must be
 * given a course.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';

const SRC = join(__dirname, '../../../../src');

/**
 * Paths whose spend is deliberately not charged to a course, each with the
 * issue that will settle it. This list may shrink; a new entry needs a reason
 * and an issue, not a shrug.
 */
const EXCEPTIONS: Record<string, string> = {
  'shared/llm/langchain-models.ts':
    'builds the models and attaches recording in getModelForPhase; the raw builder is the thing being wrapped',
  'shared/llm/client.ts': 'is the SDK client itself, where recordLlmCallCost is called',
  'stages/stage-career-playbook/nodes/runtime.ts':
    'a playbook is not a course, and generation_trace has no row to charge (mc2-b7olk.2)',
  'stages/stage-career-playbook/image-generation.ts':
    'a playbook is not a course, and generation_trace has no row to charge (mc2-b7olk.2)',
};

/** An inline opt-out for a call the surrounding code prices some other way. */
const EXEMPT_MARK = 'cost-exempt:';

/**
 * Retrieval whose Jina spend is deliberately not charged to a course.
 *
 * Both entries are measurement harnesses that query the live collection to
 * score retrieval itself. They run only when a person asks for them, and there
 * is no course whose ledger a benchmark's embeddings belong in — charging one
 * would put measurement cost into a customer's bill.
 */
const RETRIEVAL_EXCEPTIONS: Record<string, string> = {
  'shared/rag-eval/measure.ts':
    'the retrieval benchmark: it scores the entry points against the live collection and has no course to bill',
  'shared/embeddings/dense-retrieval-eval.ts':
    'the chunking A/B harness: it builds a throwaway collection and has no course to bill',
};

/**
 * Retrieval spend that HAS a course somewhere above it and does not yet carry
 * one down. Different from an exception in the only way that matters: these are
 * holes, they are named, and each names the issue that closes it.
 *
 * `QualityValidator` and `semanticMatch` embed text on Stage 3 and Stage 5
 * quality gates. Neither module mentions a course anywhere — the id would have
 * to be threaded from their callers through several public signatures, which is
 * a wider change than the epic that found this measured, so it is deferred
 * rather than half-done.
 */
const RETRIEVAL_DEFERRED: Record<string, { reason: string; issue: string }> = {
  'shared/validation/quality-validator.ts': {
    reason:
      'embeds section and metadata text for the quality gates; the class takes no course id and every caller would have to pass one',
    issue: 'mc2-sv89s',
  },
  'shared/validation/semantic-matching.ts': {
    reason: 'embeds candidate values for semantic matching; same missing course id as its caller',
    issue: 'mc2-sv89s',
  },
};

/**
 * Directories whose calls are spend on a course.
 *
 * `server/routers/generation/editing` joined the list once editing had a stage
 * to be charged to: until then its calls could not have been priced, and the
 * check would only have measured that (mc2-b7olk.5).
 */
const SCANNED = ['stages', 'shared', 'orchestrator', 'server/routers/generation/editing'];

function sources(): Array<{ path: string; text: string }> {
  const files: string[] = [];
  for (const dir of SCANNED) {
    files.push(...globSync(`${dir}/**/*.ts`, { cwd: SRC }));
  }
  return files
    .filter(file => !file.endsWith('.test.ts'))
    .map(file => ({ path: file, text: readFileSync(join(SRC, file), 'utf8') }));
}

/** Every position where a model is built directly rather than via a phase. */
function rawModelBuilds(text: string): number[] {
  const found: number[] = [];
  const pattern = /createOpenRouterModel(?:Async)?\(/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 400), match.index);
    // There used to be an allowance here for a build handed straight to
    // `attachCostRecording`. That shape is gone: recording has to be in the
    // constructor to survive `withStructuredOutput`, so a stage that needs it
    // calls `createCostRecordingModel` and never the raw builder (mc2-258fi).
    // A raw build in a stage is now always something to look at.
    // A call the surrounding code says it prices itself, with the reason, stays
    // allowed.
    if (before.slice(-400).includes(EXEMPT_MARK)) continue;
    // Declarations, imports and type positions are not calls.
    if (/(?:import|export|function|typeof)\s[^;]*$/u.test(before.split('\n').pop() ?? '')) continue;
    found.push(match.index);
  }
  return found;
}

/**
 * What each SDK completion call passes as options.
 *
 * The options are usually an inline object, and sometimes a variable - the
 * self-reviewer builds one because it retries with the same settings. Both have
 * to be read, or the check would push callers into inlining to please it.
 */
function completionOptions(text: string): string[] {
  const calls: string[] = [];
  const pattern = /generate(?:Chat)?Completion\(/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const end = text.indexOf('});', match.index);
    const inline = text.slice(match.index, end === -1 ? text.length : end);

    const named = /generate(?:Chat)?Completion\([^,)]+,\s*([A-Za-z_$][\w$]*)\s*\)/u.exec(inline);
    if (named) {
      const declaration = new RegExp(`const ${named[1]} = \\{[\\s\\S]*?\\n  \\};`, 'u').exec(text);
      calls.push(declaration ? declaration[0] : inline);
      continue;
    }
    calls.push(inline);
  }
  return calls;
}

/**
 * Every position where the provider SDK is called directly.
 *
 * The first two detectors read the two wrappers this repository built, and a
 * call that uses neither was invisible to both: `shared/intent/classifier.ts`
 * built its own `new OpenAI()` and called `chat.completions.create`, so every
 * chat turn that missed the intent cache spent money that left no row — while
 * the file sat inside a scanned directory and this guard stayed green
 * (mc2-b5a2r). A guard the whole cost epic leans on has to see the raw call.
 */
function rawSdkCompletions(text: string): number[] {
  const found: number[] = [];
  const pattern = /\.completions\.create\(/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 400), match.index);
    // A call the surrounding code says it prices itself, with the reason.
    if (before.includes(EXEMPT_MARK)) continue;
    // Prose about a call is not a call: the classifier's own comment explains
    // which SDK method it uses and why.
    if (/^\s*(?:\/\/|\*|\/\*)/u.test(before.split('\n').pop() ?? '')) continue;
    found.push(match.index);
  }
  return found;
}

/**
 * Every position where Jina's paid HTTP API is called.
 *
 * Read from the URL rather than from a wrapper name, for the reason the raw-SDK
 * detector exists: the two Jina clients are wrappers this repository wrote, and
 * a third one would be invisible to a check that only knew the first two.
 */
function rawJinaRequests(text: string): number[] {
  const found: number[] = [];
  const pattern = /['"`]https:\/\/api\.jina\.ai\//gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 400), match.index);
    if (before.includes(EXEMPT_MARK)) continue;
    // Prose about the endpoint is not a call to it.
    if (/^\s*(?:\/\/|\*|\/\*)/u.test(before.split('\n').pop() ?? '')) continue;
    found.push(match.index);
  }
  return found;
}

/**
 * What each call to a Jina entry point passes.
 *
 * `searchChunks` is here because its options are where the query embedding's
 * course lives: one search that misses the cache is one paid vector, and the
 * caller is the only thing that knows which course asked for it. Both the
 * inline-object and the named-variable shapes are read, for the same reason
 * `completionOptions` reads both.
 */
function retrievalCallArguments(text: string): Array<{ entry: string; text: string }> {
  const calls: Array<{ entry: string; text: string }> = [];
  const pattern = /\b(searchChunks|rerankDocuments|generateQueryEmbedding|generateEmbeddings?)\(/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 400), match.index);
    if (before.includes(EXEMPT_MARK)) continue;
    // Declarations, imports, type positions and prose are not calls.
    const line = before.split('\n').pop() ?? '';
    if (/(?:import|export|function|typeof)\s[^;]*$/u.test(line)) continue;
    if (/^\s*(?:\/\/|\*|\/\*)/u.test(line)) continue;

    const end = text.indexOf(');', match.index);
    const inline = text.slice(match.index, end === -1 ? text.length : end + 1);

    // The options are often a variable, and often a spread of one — Stage 6
    // builds its request shape once and reuses it for Tier 1, Tier 2 and the
    // shadow cohort. Follow the name to its declaration, or the check would
    // push every caller into inlining an options object to please it.
    const referenced =
      /\(\s*[^,()]+,\s*([A-Za-z_$][\w$]*)\s*\)/u.exec(inline)?.[1] ??
      /\.\.\.([A-Za-z_$][\w$]*)/u.exec(inline)?.[1];
    if (referenced) {
      const declaration = new RegExp(`const ${referenced}(?::[^=]+)? = [\\s\\S]*?;\\n`, 'u').exec(
        text
      );
      calls.push({ entry: match[1], text: inline + (declaration ? declaration[0] : '') });
      continue;
    }
    calls.push({ entry: match[1], text: inline });
  }
  return calls;
}

describe('no paid call spends anonymously', () => {
  const files = sources();

  it('is looking at the pipeline it means to be looking at', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(f => f.path.includes('stage6-lesson-content'))).toBe(true);
    expect(files.some(f => f.path.includes('stage7-enrichments'))).toBe(true);
  });

  it('routes every directly built model through cost recording', () => {
    const anonymous: string[] = [];
    for (const { path, text } of files) {
      if (EXCEPTIONS[path]) continue;
      for (const at of rawModelBuilds(text)) {
        const line = text.slice(0, at).split('\n').length;
        anonymous.push(`${path}:${line}`);
      }
    }

    expect(anonymous).toEqual([]);
  });

  it('gives every SDK completion a course to charge', () => {
    const anonymous: string[] = [];
    for (const { path, text } of files) {
      if (EXCEPTIONS[path]) continue;
      for (const [index, options] of completionOptions(text).entries()) {
        // A call that forwards a caller-supplied context is attributed by whoever
        // has the course; the caller is checked in its own file.
        if (options.includes('costContext')) continue;
        anonymous.push(`${path} call #${index + 1}`);
      }
    }

    expect(anonymous).toEqual([]);
  });

  it('sees a raw SDK completion, which neither wrapper would report', () => {
    const anonymous: string[] = [];
    for (const { path, text } of files) {
      if (EXCEPTIONS[path]) continue;
      for (const at of rawSdkCompletions(text)) {
        const line = text.slice(0, at).split('\n').length;
        anonymous.push(`${path}:${line}`);
      }
    }

    expect(anonymous).toEqual([]);
  });

  it('would have caught the classifier, which both older detectors missed', () => {
    // The shape that was invisible: its own client, the SDK method called
    // directly, nothing recorded. It sat in a scanned directory for the whole
    // cost epic while this file reported no anonymous spend.
    const raw = `
      const openai = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1' });
      const response = await openai.chat.completions.create({ model, messages });
    `;

    expect(rawModelBuilds(raw)).toEqual([]);
    expect(completionOptions(raw)).toEqual([]);
    expect(rawSdkCompletions(raw)).toHaveLength(1);
  });

  it('lets a call that prices itself say so, with the reason', () => {
    const marked = `
      // ${EXEMPT_MARK} an image is billed per picture, so it is priced by
      // recordImageCallCost from the provider's own figure.
      const response = await client.chat.completions.create(requestOptions);
    `;

    expect(rawSdkCompletions(marked)).toEqual([]);
  });

  it('makes every Jina HTTP call price itself', () => {
    const anonymous: string[] = [];
    for (const { path, text } of files) {
      if (rawJinaRequests(text).length === 0) continue;
      if (text.includes('recordJinaCallCost(')) continue;
      anonymous.push(path);
    }

    expect(anonymous).toEqual([]);
  });

  it('gives every retrieval entry point a course to charge', () => {
    const anonymous: string[] = [];
    for (const { path, text } of files) {
      if (RETRIEVAL_EXCEPTIONS[path] || RETRIEVAL_DEFERRED[path]) continue;
      for (const [index, call] of retrievalCallArguments(text).entries()) {
        // Either the call carries a course — inline, under a named field, or
        // forwarded from a caller that is checked in its own file — or it does
        // not. A context literal always names the stage it belongs to, which is
        // what makes an inline one recognisable.
        if (/cost_context|costContext|stage:\s*'stage_/u.test(call.text)) continue;
        anonymous.push(`${path} ${call.entry} #${index + 1}`);
      }
    }

    expect(anonymous).toEqual([]);
  });

  it('would have caught Jina, which every OpenRouter detector missed', () => {
    // The shape that was invisible for the whole cost epic: a paid provider
    // called over plain fetch, its `usage` thrown away, nothing recorded — and
    // this file green the entire time.
    const raw = `
      const response = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    `;

    expect(rawModelBuilds(raw)).toEqual([]);
    expect(completionOptions(raw)).toEqual([]);
    expect(rawSdkCompletions(raw)).toEqual([]);
    expect(rawJinaRequests(raw)).toHaveLength(1);
  });

  it('sees a retrieval call that names no course, and one that does', () => {
    const anonymous = `
      const response = await searchChunks(query, {
        limit: 3,
        filters: { course_id: courseId },
      });
    `;
    const attributed = `
      const response = await searchChunks(query, {
        limit: 3,
        filters: { course_id: courseId },
        cost_context: { courseId, stage: 'stage_6', phase: 'rag_retrieval' },
      });
    `;

    expect(retrievalCallArguments(anonymous)).toHaveLength(1);
    expect(/cost_context/u.test(retrievalCallArguments(anonymous)[0].text)).toBe(false);
    expect(/cost_context/u.test(retrievalCallArguments(attributed)[0].text)).toBe(true);
  });

  it('keeps the retrieval exception list to harnesses that genuinely have no course', () => {
    for (const [path, reason] of Object.entries(RETRIEVAL_EXCEPTIONS)) {
      expect(
        files.some(file => file.path === path),
        `${path} no longer exists`
      ).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('makes every deferred retrieval hole name the issue that closes it', () => {
    for (const [path, defer] of Object.entries(RETRIEVAL_DEFERRED)) {
      expect(
        files.some(file => file.path === path),
        `${path} no longer exists`
      ).toBe(true);
      expect(defer.reason.length).toBeGreaterThan(20);
      expect(defer.issue).toMatch(/^mc2-[\w.]+$/u);
    }
  });

  it('keeps the exception list to calls that genuinely have no course', () => {
    for (const [path, reason] of Object.entries(EXCEPTIONS)) {
      expect(
        files.some(file => file.path === path),
        `${path} no longer exists`
      ).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});
