/**
 * Contract for the previous-context rules of the serial (per-section) generator prompt.
 *
 * This prompt is no longer used for whole-lesson generation, but it is still the prompt
 * behind single-section regeneration (`utils/section-regenerator.ts`). It injects the tail
 * of the already-assembled lesson into `<previous_context>`; without an explicit ban the
 * model rewrites that text instead of continuing from it.
 *
 * @module tests/unit/shared/prompts/stage6-serial-generator-prompt
 */

import { describe, it, expect } from 'vitest';
import { serialGeneratorPrompt } from '@/shared/prompts/stage6/serial-generator';

const template = serialGeneratorPrompt.promptTemplate;

const PROHIBITION_VERBS = [
  /retell/i,
  /rephras/i,
  /repeat/i,
  /restate/i,
  /reproduc/i,
  /summari[sz]/i,
  /rewrit/i,
  /paraphras/i,
];

/** The instruction block the model reads, without the context payload. */
function taskBlock(): string {
  const start = template.indexOf('<task>');
  const end = template.indexOf('</task>');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return template.slice(start, end);
}

/**
 * Every instruction in <task> that talks about the previous context, each one collected
 * together with its indented continuation lines so a multi-line rule stays intact.
 */
function previousContextInstructions(): string[] {
  const lines = taskBlock().split('\n');
  const instructions: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/previous[\s_]?context/i.test(lines[i])) continue;

    const collected = [lines[i]];
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) {
      collected.push(lines[j]);
    }
    instructions.push(collected.join('\n'));
  }

  return instructions;
}

describe('stage6_serial_generator prompt', () => {
  it('still injects the previous context for continuity', () => {
    expect(template).toMatch(
      /<previous_context>[\s\S]*\{\{previousContext\}\}[\s\S]*<\/previous_context>/
    );
    expect(serialGeneratorPrompt.variables.find(v => v.name === 'previousContext')?.required).toBe(
      true
    );
  });

  it('forbids retelling or rewriting the previous context', () => {
    const instructions = previousContextInstructions();
    expect(instructions.length).toBeGreaterThan(0);

    const prohibitions = instructions.filter(instruction => {
      const isNegated = /\b(never|do not|don't|must not)\b/i.test(instruction);
      const verbCount = PROHIBITION_VERBS.filter(verb => verb.test(instruction)).length;
      return isNegated && verbCount >= 2;
    });

    expect(
      prohibitions,
      'no <task> instruction bans retelling/rewriting/repeating <previous_context>'
    ).not.toHaveLength(0);
  });

  it('tells the model to write only its own section', () => {
    const scoped = previousContextInstructions().filter(instruction =>
      /\bonly\b[\s\S]{0,120}\bsection\b|\bsection\b[\s\S]{0,120}\bonly\b/i.test(instruction)
    );

    expect(
      scoped,
      'the previous-context rule does not restrict the model to its own section'
    ).not.toHaveLength(0);
  });
});
