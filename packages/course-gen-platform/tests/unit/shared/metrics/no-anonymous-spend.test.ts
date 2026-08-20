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
    // A build that is immediately handed to the recorder is accounted for.
    if (/attachCostRecording\(\s*$/u.test(before)) continue;
    // ...as is one the surrounding code says it prices itself, and why.
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
