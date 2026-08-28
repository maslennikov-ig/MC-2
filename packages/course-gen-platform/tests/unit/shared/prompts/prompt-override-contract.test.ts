/**
 * A database prompt row that outlived its caller must not be used.
 * @module tests/unit/shared/prompts/prompt-override-contract
 *
 * Both cases below are transcriptions of rows that were live on 2026-08-23, not
 * invented shapes. The first printed `Prompt has unresolved placeholders` on
 * every Stage 4 run for nine months (mc2-51epl). The second printed nothing at
 * all, which is why it went unnoticed longer.
 */

import { describe, it, expect } from 'vitest';
import {
  checkOverrideContract,
  extractPlaceholders,
} from '@/shared/prompts/prompt-override-contract';
import { PROMPT_REGISTRY } from '@/shared/prompts/prompt-registry';
import type { HardcodedPrompt } from '@/shared/prompts/types';

function registryEntry(promptKey: string): HardcodedPrompt {
  const prompt = PROMPT_REGISTRY.get(promptKey);
  if (!prompt) throw new Error(`Registry has no entry for ${promptKey}`);
  return prompt;
}

describe('extractPlaceholders', () => {
  it('returns each {{name}} once, trimmed', () => {
    expect(extractPlaceholders('{{a}} then {{ b }} then {{a}}')).toEqual(new Set(['a', 'b']));
  });

  it('returns nothing for a template without placeholders', () => {
    expect(extractPlaceholders('plain text')).toEqual(new Set());
  });
});

describe('checkOverrideContract', () => {
  it('accepts a row identical to the registry template', () => {
    const registry = registryEntry('stage4_phase3_expert');
    expect(checkOverrideContract(registry.promptTemplate, registry)).toBeNull();
  });

  it('accepts a row that rewords the text but keeps every variable', () => {
    const registry = registryEntry('stage4_phase3_expert');
    const reworded = registry.promptTemplate.replace(
      'You are a senior curriculum architect',
      'You are an experienced curriculum architect'
    );
    expect(reworded).not.toBe(registry.promptTemplate);
    expect(checkOverrideContract(reworded, registry)).toBeNull();
  });

  it('accepts a row that drops an OPTIONAL variable', () => {
    const registry = registryEntry('stage4_phase3_expert');
    const optional = registry.variables.find(variable => !variable.required);
    expect(optional).toBeDefined();
    const withoutOptional = registry.promptTemplate.replaceAll(`{{${optional!.name}}}`, '');
    expect(checkOverrideContract(withoutOptional, registry)).toBeNull();
  });

  it('rejects the live stage4_phase3_expert row: a placeholder no caller fills', () => {
    // The 2025-12-04 row, shortened to the two lines that matter. `topic` and
    // `documentContext` are real variables; `userRequirements` never was.
    const staleRow = [
      'TOPIC: {{topic}}',
      'TARGET LANGUAGE: {{outputLanguage}}',
      '',
      '{{userRequirements}}{{documentContext}}',
    ].join('\n');

    const violation = checkOverrideContract(staleRow, registryEntry('stage4_phase3_expert'));

    expect(violation).not.toBeNull();
    expect(violation!.unknownPlaceholders).toEqual(['userRequirements']);
    // The same row also drops the schema the model is asked to match.
    expect(violation!.droppedRequiredVariables).toContain('schemaDescription');
    expect(violation!.droppedRequiredVariables).toContain('outputLanguageUpper');
  });

  it('rejects the live stage7_cover_user row: the whole visual style is dropped', () => {
    // This row raised no warning of any kind. An ignored variable leaves no
    // unresolved placeholder behind, so nothing in the log said the covers were
    // being drawn without their art direction.
    const staleRow = [
      'Generate an image prompt for a lesson cover:',
      '',
      'Lesson Title: {{lessonTitle}}',
      'Course Subject: {{courseSubject}}',
      'Key Topics: {{keywords}}',
      'Language Context: {{languageContext}}',
      '{{styleHint}}',
    ].join('\n');

    const violation = checkOverrideContract(staleRow, registryEntry('stage7_cover_user'));

    expect(violation).not.toBeNull();
    expect(violation!.unknownPlaceholders).toEqual([]);
    expect(violation!.droppedRequiredVariables.sort()).toEqual(
      ['aesthetic', 'colorScheme', 'mood', 'visualElements'].sort()
    );
  });

  it('accepts a row carrying the Mustache sections the registry itself carries', () => {
    // Transcribed from `stage6_planner`, which carried a real
    // `{{#userRefinementPrompt}}` / `{{/...}}` pair. Judged against the variable
    // list alone those read as two placeholders no caller fills, and the guard
    // rejected a row that WAS the registry text — caught by re-running the sync
    // script against a row it had just written. Sections are not the only case:
    // Helm and Jinja fragments arrive inside RAG context, and the fix is to judge
    // against the maintained template rather than to keep a list of every
    // templating language.
    //
    // The section pair is written out here rather than read from the registry
    // because `stage6_planner` was deleted with the other four prompts nothing
    // rendered (mc2-53h8i). The guarantee outlived the prompt that demonstrated it.
    const registry: HardcodedPrompt = {
      ...registryEntry('stage4_phase3_expert'),
      promptTemplate: [
        'Topic: {{topic}}',
        '{{#userRefinementPrompt}}',
        'User instructions: {{userRefinementPrompt}}',
        '{{/userRefinementPrompt}}',
      ].join('\n'),
      variables: [{ name: 'topic', description: '', required: true, example: 'x' }],
    };

    expect(checkOverrideContract(registry.promptTemplate, registry)).toBeNull();
  });

  it('ignores a required variable the registry itself does not render', () => {
    const registry: HardcodedPrompt = {
      ...registryEntry('stage4_phase3_expert'),
      promptTemplate: 'Topic: {{topic}}',
      variables: [
        { name: 'topic', description: '', required: true, example: 'x' },
        { name: 'bookkeepingOnly', description: '', required: true, example: 'x' },
      ],
    };

    expect(checkOverrideContract('Topic: {{topic}}', registry)).toBeNull();
  });
});
