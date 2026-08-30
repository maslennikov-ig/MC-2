/**
 * Prompt wording that answers a measured defect, pinned so it cannot drift back.
 *
 * Every assertion here comes from the 2026-08-30 paid run (playbook d5137bc5):
 * a judge that filed non-issues, an implementation checklist that pointed at
 * pages its readers were never given, and a rule about writing that reached the
 * reader as content. None of these is a style preference — each one cost
 * regeneration calls or shipped a defect.
 */

import { describe, expect, it } from 'vitest';
import { careerPlaybookPrompts } from '@/shared/prompts/career-playbook-prompts';

function prompt(promptKey: string) {
  const found = careerPlaybookPrompts.find(entry => entry.promptKey === promptKey);
  if (!found) throw new Error(`Unknown prompt key: ${promptKey}`);
  return found;
}

const GROUP_PROMPTS = careerPlaybookPrompts.filter(entry =>
  entry.promptKey.startsWith('career_playbook_group_')
);

describe('cross-block judge: a category is a description, not a checklist row', () => {
  // The final verdict held 25 issues, of which three said in their own
  // description that the check had passed — "NO ISSUE FOUND", "this is NOT a
  // language error", "They ARE marked as examples". Four categories produced
  // exactly one issue each, which is the shape of a model walking the list.
  const judge = prompt('career_playbook_cross_block_judge');

  it('no longer demands a field on every issue in a way that reads as one issue per category', () => {
    expect(judge.promptTemplate).not.toContain('Every issue MUST include a "category" field');
  });

  it('says an empty issue list is the right answer for a clean group', () => {
    expect(judge.promptTemplate).toContain('Report what you found, not what you checked');
    expect(judge.promptTemplate).toContain(
      'empty "issues" list is the correct and expected answer'
    );
  });

  it('forbids an issue whose own description concludes the check passed', () => {
    expect(judge.promptTemplate).toContain(
      'Never file an issue whose own description concludes that the check passed'
    );
    expect(judge.promptTemplate).toContain('no issue found');
  });

  it('routes a cadence disagreement to the one block that can repair it', () => {
    expect(judge.promptTemplate).toContain('A cadence disagreement is repaired in ONE place');
    expect(judge.promptTemplate).toContain('{{cadence_ledger_md}}');
  });
});

describe('block 26: an implementation checklist names artefacts, not blocks', () => {
  // 14 of the run's 15 remaining dangling references came from this one block:
  // 4x -> block_8, 9x -> block_23, 1x -> block_16, each held by only one of its
  // two readers. The checklist walks the whole guide by nature; its reader holds
  // half of it. Naming the artefact keeps the step followable either way.
  const wrap = prompt('career_playbook_group_6_wrap');

  it('states the two readers the block actually has', () => {
    expect(wrap.promptTemplate).toContain(
      'implementation checklist for the two readers this block has — the manager and HR'
    );
    expect(wrap.promptTemplate).not.toContain(
      'implementation checklist for manager, HR, and employee'
    );
  });

  it('tells it to name the artefact a step produces rather than the block holding it', () => {
    expect(wrap.promptTemplate).toContain('name each\n  step by the artefact it produces');
    expect(wrap.promptTemplate).toContain('not "see Block 23"');
  });

  it('applies the same rule to the calibrate-before-publishing list', () => {
    expect(wrap.promptTemplate).toContain('identified by what the value is');
  });
});

describe('the writing rules never reach the reader', () => {
  // Three blocks explained the document's own construction to a person trying
  // to do a job. The prompt had phrased a rule through its consequence, and the
  // model reproduced the consequence as content.
  it('no longer explains a rule through the failure it prevents', () => {
    for (const entry of GROUP_PROMPTS) {
      expect(entry.promptTemplate).not.toContain(
        'a second wording is how one decision came to have three different approval levels'
      );
      expect(entry.promptTemplate).not.toContain(
        'do not restate its approval level in your own words'
      );
    }
  });

  it('gives the writer a test to apply per sentence instead of a phrase to quote', () => {
    for (const entry of GROUP_PROMPTS) {
      expect(entry.promptTemplate).toContain('Before each sentence ships, ask who it is for');
      expect(entry.promptTemplate).toContain('Delete it; do not soften it');
      expect(entry.promptTemplate).toContain('written as if these instructions had never existed');
    }
  });
});

describe('the cadence ledger reaches every prompt that can state a rhythm', () => {
  it.each([
    'career_playbook_group_1_foundation',
    'career_playbook_group_2_operations',
    'career_playbook_group_3_people',
    'career_playbook_group_4_growth',
    'career_playbook_group_5_system',
    'career_playbook_group_6_wrap',
    'career_playbook_cross_block_judge',
    'career_playbook_final_proofreader',
    'career_playbook_block_regenerator',
  ])('%s carries the ledger and declares the variable', promptKey => {
    const entry = prompt(promptKey);
    expect(entry.promptTemplate).toContain('{{cadence_ledger_md}}');
    expect(entry.variables?.some(variable => variable.name === 'cadence_ledger_md')).toBe(true);
  });

  it('asks the spec builder to build it with a vocabulary the checker also reads', () => {
    const specBuilder = prompt('career_playbook_spec_builder');
    expect(specBuilder.promptTemplate).toContain('Build cadence_ledger');
    expect(specBuilder.promptTemplate).toContain(
      'daily, weekly,\n  biweekly, monthly, quarterly, annual'
    );
    expect(specBuilder.promptTemplate).toContain(
      'a\n  commitment may hold only one cadence across the whole guide'
    );
  });
});
