/**
 * Contract: the model is shown the values it is required to produce, and one
 * phase does not kill a course over the previous phase's advisory fields.
 *
 * All three assertions below come from one course that died on 2026-08-25
 * (mc2-4m29k). Stage 4 Phase 1 returned `complexity: "beginner"` — a difficulty,
 * for an enum that measures breadth — and a paragraph of Russian prose where
 * `target_audience` wanted one word. That reads like a careless model. It was
 * not: the prompt told it those fields were `unknown`.
 *
 * Every LLM-tolerant enum in this repo is `z.string().transform().pipe(z.enum())`,
 * which is a `ZodPipeline`, and `zodToPromptSchema` had no branch for one — so
 * eight fields across Phases 1, 2 and 4 rendered as the word "unknown" and the
 * model was left to answer the field *names*. That also explains the Chinese
 * course of 2026-08-22 that answered `专业`: correct category, correct output
 * language, unmappable by a Latin-only synonym list, never shown the list.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { zodToPromptSchema } from '@megacampus/shared-utils';
import {
  Phase1OutputSchema,
  Phase2OutputSchema,
  Phase4OutputSchema,
  Phase2InputSchema,
  type Phase2Input,
} from '@megacampus/shared-types/analysis-schemas';
import { reconcileUpstreamPhase1Output } from '@/stages/stage4-analysis/phases/phase-2-scope-helpers';

const PROMPT_FACING_STAGE4_SCHEMAS = {
  Phase1OutputSchema,
  Phase2OutputSchema,
  Phase4OutputSchema,
} as const;

function validPhase1Output(): Phase2Input['phase1_output'] {
  return {
    course_category: {
      primary: 'professional',
      confidence: 0.9,
      reasoning: 'The topic is squarely occupational and maps onto workplace practice.',
      secondary: null,
    },
    topic_analysis: {
      determined_topic: 'Основы тайм-менеджмента',
      information_completeness: 80,
      complexity: 'medium',
      reasoning:
        'The topic has a well-defined core with a moderate amount of surrounding practice.',
      target_audience: 'beginner',
      missing_elements: null,
      key_concepts: ['prioritisation', 'planning', 'focus'],
      domain_keywords: ['time', 'tasks', 'calendar', 'habits', 'productivity'],
    },
    phase_metadata: {
      duration_ms: 1200,
      model_used: 'openai/gpt-5.6-luna',
      tokens: { input: 100, output: 200, total: 300 },
      quality_score: 0.8,
      retry_count: 0,
    },
  };
}

function validPhase2Input(): Phase2Input {
  return {
    course_id: '00000000-0000-4000-8000-000000000001',
    language: 'ru',
    topic: 'Основы тайм-менеджмента',
    phase1_output: validPhase1Output(),
  };
}

describe('the schema description that becomes the prompt', () => {
  it.each(Object.entries(PROMPT_FACING_STAGE4_SCHEMAS))(
    'describes every field of %s, leaving none as "unknown"',
    (_name, schema) => {
      const rendered = zodToPromptSchema(schema);
      const invisible = rendered.split('\n').filter(line => /:\s*unknown/.test(line));

      // The guard for the whole class, not just the enums: any Zod wrapper this
      // converter does not recognise degrades to "unknown", which the model
      // reads as "put anything here".
      expect(invisible).toEqual([]);
    }
  );

  it('renders the allowed values of an LLM-tolerant enum, not the shape that wraps them', () => {
    const rendered = zodToPromptSchema(Phase1OutputSchema);

    expect(rendered).toContain('enum: narrow | medium | broad');
    expect(rendered).toContain('enum: beginner | intermediate | advanced | mixed');
    expect(rendered).toContain('professional | personal | creative | hobby | spiritual | academic');
  });

  it('carries the description that the field name contradicts', () => {
    // `complexity` reads as difficulty; its values measure breadth. Showing the
    // values alone still leaves the model guessing which question it answers.
    expect(zodToPromptSchema(Phase1OutputSchema)).toContain('NOT how hard it is for the learner');
  });

  it('unwraps a pipeline to its output side, because that is what the model must produce', () => {
    const tolerant = z
      .string()
      .transform(value => value.toLowerCase())
      .pipe(z.enum(['red', 'green']));

    expect(zodToPromptSchema(z.object({ colour: tolerant }))).toContain('enum: red | green');
  });
});

describe('Phase 2 accepting what Phase 1 handed down', () => {
  it('leaves a valid upstream output exactly as it was', () => {
    const input = validPhase2Input();

    expect(reconcileUpstreamPhase1Output(input)).toBe(input);
  });

  it('substitutes the advisory fields it only ever uses as prompt text', () => {
    const input = validPhase2Input();
    // The 2026-08-25 output, verbatim in shape: a difficulty in the breadth
    // field, a description of the audience in the level field.
    input.phase1_output.topic_analysis.complexity = 'beginner' as never;
    input.phase1_output.topic_analysis.target_audience =
      'Взрослые люди (18+), испытывающие трудности с организацией своего времени' as never;

    const reconciled = reconcileUpstreamPhase1Output(input);

    expect(reconciled.phase1_output.topic_analysis.complexity).toBe('medium');
    expect(reconciled.phase1_output.topic_analysis.target_audience).toBe('mixed');
    // And the whole input now passes the door it used to die at.
    expect(() => Phase2InputSchema.parse(reconciled)).not.toThrow();
  });

  it('does not mutate the caller’s object while substituting', () => {
    const input = validPhase2Input();
    input.phase1_output.topic_analysis.complexity = 'beginner' as never;

    reconcileUpstreamPhase1Output(input);

    expect(input.phase1_output.topic_analysis.complexity).toBe('beginner');
  });

  it('drops a malformed contextual_language rather than failing on a field it never reads', () => {
    const input = validPhase2Input();
    input.phase1_output.contextual_language = {
      why_matters_context: 'too short',
      motivators: 'too short',
      experience_prompt: 'too short',
      problem_statement_context: 'too short',
      knowledge_bridge: 'too short',
      practical_benefit_focus: 'too short',
    };

    const reconciled = reconcileUpstreamPhase1Output(input);

    expect(reconciled.phase1_output.contextual_language).toBeUndefined();
    expect(() => Phase2InputSchema.parse(reconciled)).not.toThrow();
  });

  it('keeps a well-formed contextual_language', () => {
    const input = validPhase2Input();
    input.phase1_output.topic_analysis.complexity = 'beginner' as never;
    const contextual = {
      why_matters_context: 'a'.repeat(60),
      motivators: 'b'.repeat(60),
      experience_prompt: 'c'.repeat(120),
      problem_statement_context: 'd'.repeat(60),
      knowledge_bridge: 'e'.repeat(120),
      practical_benefit_focus: 'f'.repeat(120),
    };
    input.phase1_output.contextual_language = contextual;

    expect(reconcileUpstreamPhase1Output(input).phase1_output.contextual_language).toEqual(
      contextual
    );
  });

  it('still refuses an upstream output that is missing real content', () => {
    // The line has to sit somewhere. Too few key concepts is not a wording
    // problem — Phase 2 builds its prompt out of them — so it still throws.
    const input = validPhase2Input();
    input.phase1_output.topic_analysis.key_concepts = ['only one'];

    expect(() => Phase2InputSchema.parse(reconcileUpstreamPhase1Output(input))).toThrow();
  });
});

describe('the schema Phase 2 judges its input by', () => {
  it('is the one Phase 1 was validated against, not a second copy of it', () => {
    // These were field-for-field duplicates until 2026-08-25. Two hand-written
    // statements of one contract drift, and this one drifts on the boundary
    // where disagreement kills the course.
    const phase1Shape = Phase2InputSchema.shape.phase1_output;

    expect(phase1Shape).toBe(Phase1OutputSchema);
  });
});
