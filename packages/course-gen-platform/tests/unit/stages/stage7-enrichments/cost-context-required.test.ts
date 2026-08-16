/**
 * Contract: no Stage 7 call spends money anonymously.
 *
 * An LLM call is priced only if it carries a `costContext`; without one
 * `recordLlmCallCost` logs at debug and returns, so the call leaves no trace
 * row and never reaches `courses.estimated_cost_usd`. Every Stage 7 handler
 * omitted it, so enrichment spend was invisible — and it was missed once
 * already, in a fix that widened `stageOfPhase` to `stage_7` without noticing
 * that Stage 7 does not use that path at all (mc2-gmab0, 2026-08-16).
 *
 * This reads the sources because that is where the defect lives: the mistake is
 * forgetting an argument at a new call site, and only a check that sees all the
 * call sites can catch the next one.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HANDLERS = join(__dirname, '../../../../src/stages/stage7-enrichments/handlers');

function sourcesUnder(dir: string): Array<{ file: string; text: string }> {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => ({
      file: entry.name,
      text: readFileSync(join(dir, entry.name), 'utf8'),
    }));
}

/** The options object of each `generateCompletion` call, roughly delimited. */
function callOptions(text: string): string[] {
  const calls: string[] = [];
  const marker = 'llmClient.generateCompletion(';
  let at = text.indexOf(marker);
  while (at !== -1) {
    const end = text.indexOf('});', at);
    calls.push(text.slice(at, end === -1 ? text.length : end));
    at = text.indexOf(marker, at + marker.length);
  }
  return calls;
}

describe('Stage 7 cost attribution', () => {
  const sources = sourcesUnder(HANDLERS);

  it('finds the handlers it is meant to be checking', () => {
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.some(s => callOptions(s.text).length > 0)).toBe(true);
  });

  it('gives every LLM call a course to charge', () => {
    const anonymous: string[] = [];
    for (const { file, text } of sources) {
      for (const [index, options] of callOptions(text).entries()) {
        if (!options.includes('costContext')) anonymous.push(`${file} call #${index + 1}`);
      }
    }

    expect(anonymous).toEqual([]);
  });

  it('charges them to Stage 7, so the trace groups them with the stage', () => {
    for (const { text } of sources) {
      for (const options of callOptions(text)) {
        if (!options.includes('costContext')) continue;
        expect(options).toContain("stage: 'stage_7'");
      }
    }
  });
});
