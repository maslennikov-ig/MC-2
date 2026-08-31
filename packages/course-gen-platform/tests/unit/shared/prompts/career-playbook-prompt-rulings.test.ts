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

  // Eight of the run's criticals attacked the marker an unverified company value
  // is required to carry. Two rules of one contract, pulling opposite ways.
  it('says the example marker is contracted output, never a placeholder', () => {
    expect(judge.promptTemplate).toContain(
      'The example marker "(пример — заменить)" / "(example — replace)" is NOT one'
    );
    expect(judge.promptTemplate).toContain("(example — replace with the company's actual CRM)");
    expect(judge.promptTemplate).toContain(
      'a missing marker is the defect, a present one never is'
    );
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

  // Run 88fc2368 shipped two "Calibrate before publishing" headings in a row —
  // the model's own list, then the table the application appends over it. The
  // application owns that table because only it sees every marked value and
  // every assumed threshold at once.
  it('leaves the calibration table to the application instead of writing a second one', () => {
    expect(wrap.promptTemplate).toContain(
      'Do NOT write a "calibrate before publishing" list of your own'
    );
    expect(wrap.promptTemplate).not.toContain('which must list every');
  });

  // Block 26 of run 88fc2368 told the reader that 'every number in this guide
  // comes from the published metric ledger and must not be changed during
  // calibration' — while block 1 of the same guide told them six of the seven
  // were assumptions to validate in the first quarter. Reproduce-verbatim is a
  // rule for this document, not a rule for the company.
  it('never lets the checklist forbid the company from changing an assumed target', () => {
    expect(wrap.promptTemplate).toContain(
      'Say nothing that forbids the company from changing a metric target'
    );
    expect(wrap.promptTemplate).toContain('must be confirmed against their own baseline data');
  });
});

describe('a summary block may not invent what it summarizes', () => {
  const wrap6 = prompt('career_playbook_group_6_wrap');
  const group4 = prompt('career_playbook_group_4_growth');

  // Run 88fc2368's Role Canvas — a block every reader receives — offered
  // "director of sales / head of revenue" against a ladder publishing Head of
  // Sales and VP of Sales, and a CRO-accepted forecast "within the first month"
  // against an onboarding plan putting the first forecast on Day 60.
  it('binds the canvas to published steps and milestones, not only to the ledger', () => {
    expect(wrap6.promptTemplate).toContain(
      'The same rule binds every name and every date it repeats'
    );
    expect(wrap6.promptTemplate).toContain('Career steps and ramp milestones already published');
  });

  // Block 11 is employee+HR; block 15 is manager+HR. The manager was told to run
  // a quarterly career conversation "against the published ladder criteria" and
  // never given the ladder.
  it('makes block 15 carry the criteria its reader was not given', () => {
    expect(group4.promptTemplate).toContain(
      'This block is read by the manager and HR; the career ladder is not'
    );
    expect(group4.promptTemplate).toContain('hands them the task without the material');
  });
});

describe('a disclosed chain is still a vendor page', () => {
  // Block 9 of run 88fc2368: "Gartner analysts cited in [S11] predict that by
  // 2026, 65% of B2B sales organizations will transition…" — S11 is janek.com.
  // Block 19 of the same guide handled the identical figure honestly, so the
  // model can do it; the rule did not cover the secondhand form.
  it('closes the secondhand form the attribution rule left open', () => {
    for (const entry of GROUP_PROMPTS) {
      expect(entry.promptTemplate).toContain('Disclosing the chain does not lift that rule');
      expect(entry.promptTemplate).toContain('drop the house name');
    }
  });
});

describe('block regenerator: one rewrite answers every finding', () => {
  // Block 26 of run 638ed691 shipped five criticals after spending both of its
  // attempts, because the regenerator was handed the first finding only.
  const regenerator = prompt('career_playbook_block_regenerator');

  it('asks for every finding to be fixed in the one rewrite', () => {
    expect(regenerator.promptTemplate).toContain('fix EVERY judge issue listed below');
    expect(regenerator.promptTemplate).toContain(
      'Issues from judge — fix all of them in this one rewrite'
    );
    expect(regenerator.promptTemplate).not.toContain('fix the judge issue without repeating');
  });

  it('says what an unfixed finding costs, since the attempt is spent either way', () => {
    expect(regenerator.promptTemplate).toContain(
      'Leaving one of several findings unfixed spends an attempt and ships the defect'
    );
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

describe('the milestone ledger reaches every prompt that can state a deadline', () => {
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
    expect(entry.promptTemplate).toContain('{{milestone_ledger_md}}');
    expect(entry.variables?.some(variable => variable.name === 'milestone_ledger_md')).toBe(true);
  });

  it('asks the spec builder to build it in the units the checker reads', () => {
    const specBuilder = prompt('career_playbook_spec_builder');
    expect(specBuilder.promptTemplate).toContain('Build milestone_ledger');
    expect(specBuilder.promptTemplate).toContain('"day 30", "week 2", "month 1", "quarter 2"');
    expect(specBuilder.promptTemplate).toContain(
      'a commitment may hold only one due date across the whole guide'
    );
  });

  // mc2-i6l0i: the Role Canvas is a summary block, and it restated the first
  // forecast at week 4 over an onboarding plan that set it at week 2.
  it('tells a summary block to carry a governed date across, not to set one', () => {
    for (const entry of GROUP_PROMPTS) {
      expect(entry.promptTemplate).toContain(
        'A summary block restates these dates rather than setting them'
      );
    }
  });
});

describe('the cadence ledger has to cover the rhythms of managing people', () => {
  // mc2-tub8q / mc2-r1qen: the model invented a quarterly career conversation
  // and a quarterly stay interview because the guide needs both and the ledger
  // carried neither. A ban would have contradicted the work; a ledger row does not.
  it('requires them for a role with reports', () => {
    const specBuilder = prompt('career_playbook_spec_builder');
    expect(specBuilder.promptTemplate).toContain('context.has_subordinates is true');
    expect(specBuilder.promptTemplate).toContain(
      'the career conversation, the retention (stay) interview, the performance review'
    );
  });
});
