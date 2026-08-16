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
  'stages/stage4-analysis/evidence/card-generator.ts':
    'document evidence prices itself into its own coverage ledger; folding it into the course total is mc2-b7olk.4',
  'stages/stage4-analysis/evidence/conflict-detector.ts':
    'document evidence prices itself into its own coverage ledger; folding it into the course total is mc2-b7olk.4',
  'orchestrator/handlers/block-regeneration-handler.ts':
    'editing a course has no stage in generation_trace to charge; giving it one is mc2-b7olk.5',
};

/** An inline opt-out for a call the surrounding code prices some other way. */
const EXEMPT_MARK = 'cost-exempt:';

/** Directories that are pipeline code: everything a course generation runs. */
const SCANNED = ['stages', 'shared', 'orchestrator'];

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
