/**
 * Career Playbook — the six block-group generator prompts
 * @module shared/prompts/career-playbook-group-prompts
 *
 * One prompt per group of blocks, all sharing the output contract and the user
 * section in `career-playbook-prompt-parts`. Split out of
 * `career-playbook-prompts.ts` when that file crossed the 800-line lint budget.
 */

import type { HardcodedPrompt } from './types.js';
import {
  GROUP_OUTPUT_CONTRACT,
  GROUP_USER_SECTION,
  contentLanguageVariable,
  groupContractVariables,
  groupHeadingVariable,
  specJsonVariable,
} from './career-playbook-prompt-parts.js';

export const careerPlaybookGroupPrompts: HardcodedPrompt[] = [
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_group_1_foundation',
    promptName: 'Career Playbook - Group 1 Foundation',
    promptDescription: 'Generates Header, Mission/KR, Anti-goals, and Decision Authority Matrix.',
    promptTemplate: `SYSTEM:
Generate Role Guide group 1: Header + Block 1 (Mission/KR) + Block 2 (Anti-goals) + Block 5 (Decision Authority Matrix).

${GROUP_OUTPUT_CONTRACT}

Methodology:
- Block 1: Job Scorecard. Mission in 2-3 sentences + 3-5 measurable key results in a table.
- Block 2: Munger inversion. At least 4 anti-goals and the actual owner.
- Block 5: Decision authority. Classify every decision on FOUR independent axes instead of a single
  one-way/two-way door label:
  * Reversibility: reversible / reversible with cost / irreversible
  * Blast radius: team / function / company / customer
  * Contract commitment: none / has deadline / has penalty
  * Approval level: act alone / notify / align / manager decides
  Changing CRM stages, adjusting a process, and selecting a tool or vendor are "reversible with
  cost" — a migration or a contract with switching costs, not a one-way door. Hiring, termination,
  and anything with a customer-facing penalty stay high-consequence. At least 4 decisions spanning
  different approval levels.
- Deterministic format minimums (verified automatically, so meet them on the first draft): Block 2 lists at least 4 anti-goals; Block 5 lists at least 4 decision rows.
- Use exactly these top-level headings:
{{heading_header}}
{{heading_block_1}}
{{heading_block_2}}
{{heading_block_5}}

${GROUP_USER_SECTION}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
      ...groupContractVariables,
      groupHeadingVariable('heading_header'),
      groupHeadingVariable('heading_block_1'),
      groupHeadingVariable('heading_block_2'),
      groupHeadingVariable('heading_block_5'),
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_group_2_operations',
    promptName: 'Career Playbook - Group 2 Operations',
    promptDescription: 'Generates Responsibility zones, Duties, KPI/metrics, and Tools blocks.',
    promptTemplate: `SYSTEM:
Generate Role Guide group 2: Block 3 (Responsibility zones), Block 4 (Duties), Block 6 (KPI and metrics), Block 8 (Tools and technologies).

${GROUP_OUTPUT_CONTRACT}

Methodology:
- Block 3: 4-6 responsibility zones with weight percentages summing to 100 and Definition of Done.
- Block 4: Daily / weekly / monthly / quarterly duties with measurable result and Definition of Done.
- Block 6: Input/Output metrics, traffic-light actions, and anti-metrics warnings. Every metric in
  the ledger appears here with exactly the ledger's target and thresholds.
- Block 8: Tools table with purpose and required proficiency.

Forecast wording: describe forecast quality as absolute error ("forecast error above 20%"), never
as "accuracy above +/-20%" — accuracy and variance are opposite directions and mixing them makes
the threshold unreadable.
- Use exactly these top-level headings:
{{heading_block_3}}
{{heading_block_4}}
{{heading_block_6}}
{{heading_block_8}}

${GROUP_USER_SECTION}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
      ...groupContractVariables,
      groupHeadingVariable('heading_block_3'),
      groupHeadingVariable('heading_block_4'),
      groupHeadingVariable('heading_block_6'),
      groupHeadingVariable('heading_block_8'),
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_group_3_people',
    promptName: 'Career Playbook - Group 3 People',
    promptDescription:
      'Generates Competencies, Human-AI collaboration, Candidate Profile, and Typical Day blocks.',
    promptTemplate: `SYSTEM:
Generate Role Guide group 3: Block 7 (Competencies), Block 9 (Human-AI collaboration), Block 12 (Candidate Profile), Block 13 (Typical Working Day).

${GROUP_OUTPUT_CONTRACT}

Methodology:
- Block 7: superpower, hard skills, soft skills with why, and energy map for hiring fit.
- Block 9: Human Agency Scale and 3-bucket analysis: AI does, human checks, human-only work.
- Block 12: education, experience, personality profile, and GWC filter (Get it / Want it / Capacity).
- Block 13: hourly schedule plus cognitive load profile and focus-block recommendations.

Block 9 in particular attracts unsupported statistics about AI accuracy, adoption rates, and hours
saved. State those only with a [Sn] citation; otherwise describe the shift qualitatively.
- Use exactly these top-level headings:
{{heading_block_7}}
{{heading_block_9}}
{{heading_block_12}}
{{heading_block_13}}

${GROUP_USER_SECTION}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
      ...groupContractVariables,
      groupHeadingVariable('heading_block_7'),
      groupHeadingVariable('heading_block_9'),
      groupHeadingVariable('heading_block_12'),
      groupHeadingVariable('heading_block_13'),
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_group_4_growth',
    promptName: 'Career Playbook - Group 4 Growth',
    promptDescription:
      'Generates Career Growth, Onboarding, Motivation System, and Red Flags blocks.',
    promptTemplate: `SYSTEM:
Generate Role Guide group 4: Block 11 (Career Growth), Block 14 (Onboarding), Block 15 (Motivation System), Block 17 (Red Flags).

${GROUP_OUTPUT_CONTRACT}

Methodology:
- Block 11: dual IC/management tracks, promotion criteria, relative timelines, and Mermaid career
  diagram. Ladder rules:
  * Every step must differ in scope from the one before it. Never emit a step that renames the same
    level (for example "CRO -> Chief Revenue Officer / President of Revenue").
  * Never label a people-management position as "Senior <role> (IC)"; the IC track and the
    management track are separate branches.
  * Every transition carries a promotion criterion and a relative timeline ("after 4 quarters"),
    never a calendar date.
- Block 14: First 5 Wins, sprint-based 30-60-90 plan, graduation criteria, support triangle, and repeated self-assessment. Milestones use relative day and week labels only.
- Block 15: material motivation, AMP levers, career conversations, and job crafting boundaries. Any compensation figure is an unverified example and must carry the example marker.
  This block is read by the manager and HR; the career ladder is not. If you set a career-conversation cadence here, carry
  across the promotion criteria that conversation runs against, written for these readers. Sending them to a ladder they
  were never given hands them the task without the material.
- Block 17: role-specific red flags, five disengagement stages, stay interview prompts, review criteria, and skill sprints. The metric ledger owns every metric value and every warning threshold. It does not own how long a symptom has to persist before it counts as a flag — "three reviews running", "two weeks with no reply" reads a signal rather than setting a target, and no ledger carries such a window, so state it where a flag needs one.
- Include a Mermaid flowchart TB career diagram in Block 11 (verified automatically, so include it on the first draft).
- In every Mermaid diagram, wrap each node label in double quotes (for example A["Team Lead (Block 9)"]); never leave raw parentheses or a line break inside an unquoted label.
- Use exactly these top-level headings:
{{heading_block_11}}
{{heading_block_14}}
{{heading_block_15}}
{{heading_block_17}}

${GROUP_USER_SECTION}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
      ...groupContractVariables,
      groupHeadingVariable('heading_block_11'),
      groupHeadingVariable('heading_block_14'),
      groupHeadingVariable('heading_block_15'),
      groupHeadingVariable('heading_block_17'),
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_group_5_system',
    promptName: 'Career Playbook - Group 5 System',
    promptDescription:
      'Generates Dependencies, Processes, Industry Context, Business Goals, and Failure Modes blocks.',
    promptTemplate: `SYSTEM:
Generate Role Guide group 5: Block 10 (Dependencies), Block 16 (Processes), Block 19 (Industry Context), Block 20 (Business Goals), Block 21 (Failure Modes).

${GROUP_OUTPUT_CONTRACT}

Methodology:
- Block 10: role dependencies, blast radius, communication charter, and Mermaid dependency diagram.
- Block 16: primary business process, DO-CONFIRM / READ-DO checklists, SBAR, exception handling, and scripts only for communication roles.
- Block 19: 3-layer context, durable skills, AI impact, continuous learning, and skill stacking.
- Block 20: business goals, how this role impacts them, impact metrics, and Netflix Context Over Control paragraph.
- Block 21: FMEA-style pre-mortem with at least 3 failure modes, early signals, and prevention actions. Every threshold that names a ledger metric uses the ledger's value.

Block 19 attracts unsupported market statistics (adoption rates, growth rates, benchmark
multiples). State those only with a [Sn] citation; otherwise describe the trend qualitatively.
- Include Mermaid diagrams in Blocks 10 and 16, and keep at least 3 failure modes in Block 21 (all verified automatically, so satisfy them on the first draft).
- In every Mermaid diagram, wrap each node label in double quotes (for example A["Team Lead (Block 9)"]); never leave raw parentheses or a line break inside an unquoted label.
- Use exactly these top-level headings:
{{heading_block_10}}
{{heading_block_16}}
{{heading_block_19}}
{{heading_block_20}}
{{heading_block_21}}

${GROUP_USER_SECTION}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
      ...groupContractVariables,
      groupHeadingVariable('heading_block_10'),
      groupHeadingVariable('heading_block_16'),
      groupHeadingVariable('heading_block_19'),
      groupHeadingVariable('heading_block_20'),
      groupHeadingVariable('heading_block_21'),
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_group_6_wrap',
    promptName: 'Career Playbook - Group 6 Wrap',
    promptDescription:
      'Generates FAQ, Working With Me README, Continuity Protocol, Role Canvas, Footer, and Implementation Checklist blocks.',
    promptTemplate: `SYSTEM:
Generate Role Guide group 6: Block 18 (FAQ), Block 22 (Working with me README), Block 23 (Continuity Protocol), Block 24 (Role Canvas), Block 25 (Footer and revision cadence), Block 26 (Implementation checklist).

${GROUP_OUTPUT_CONTRACT}

Methodology:
- Block 18: 5-8 FAQ items mixing employee questions and questions about the role.
  You choose the questions, so choose ones this block can answer. A question that asks WHEN — "when
  do I start running this myself", "how soon am I expected to own X" — has the ramp as its only
  honest answer, and the ramp block publishes the ramp. Ask instead what the reader does, how far
  their authority runs, what to do when a number slips, what is theirs and what is not.
  Where an answer still touches the ramp, name the step and send the reader to the ramp block for
  the date. A date repeated here is a second copy of a fact that block publishes, and the copy is
  what drifts.
  Send the reader in the answer's own voice and stop there: "The full matrix, with every approval
  level, is in Block 5." The reader needs the pointer, not a note about which parts this section
  chose to carry.
- Block 22: template prompts the employee fills in during onboarding Week 2-3; do not pre-fill personal answers.
- Block 23: continuity checklist, critical knowledge, backups, and training status. Report each
  backup's training recency relatively ("refreshed within the last two quarters") rather than with a
  calendar year, which is stale the moment the year turns. That phrase reports the state of one
  record. It does not set how fresh training has to be: a company that has not told you its
  freshness rule does not have one here, so a sentence that makes a period the condition of being a
  valid backup is an unverified company value and carries the example marker.
- Block 24: one-page Role Canvas summarizing mission, metrics, superpower, anti-goals, decisions, dependencies, career path, and first win. Every metric it repeats must match the ledger exactly — this block is a summary, so a divergence here contradicts the whole document at once.
  The same rule binds every name and every date it repeats. A career step, a ramp milestone, a first win: name one the
  guide has already published, listed under "Career steps and ramp milestones already published", or describe the
  direction without naming a step at all. Every reader receives this block and most do not receive the blocks it
  summarizes, so a title or a deadline invented here is the only version those readers will ever see.
- Block 25: revision triggers, version metadata dated {{generated_on}}, and MegaCampus AI CTA. This is the only block allowed to print an absolute date.
- Block 26: implementation checklist for the two readers this block has — the manager and HR — to operationalize the guide.
  This checklist walks the whole guide, and most of what it walks sits in blocks its readers were not given, so name each
  step by the artefact it produces, never by the block that holds it: "confirm the continuity plan names a backup for every
  critical area", not "see Block 23".
  Do NOT write a "calibrate before publishing" list of your own. The application appends that table, built from the
  assembled document, because only it can see every marked value and every assumed threshold at once; a second list
  written here would contradict it.
  Say nothing that forbids the company from changing a metric target. Reproducing the ledger verbatim is a rule for THIS
  document, not a rule for the reader: a threshold whose provenance is an assumption or a benchmark is our guess at the
  company's number and must be confirmed against their own baseline data, exactly as the mission block already tells them.
  Only a target the company itself gave us stands as published.
- Use exactly these top-level headings:
{{heading_block_18}}
{{heading_block_22}}
{{heading_block_23}}
{{heading_block_24}}
{{heading_block_25}}
{{heading_block_26}}

${GROUP_USER_SECTION}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
      ...groupContractVariables,
      groupHeadingVariable('heading_block_18'),
      groupHeadingVariable('heading_block_22'),
      groupHeadingVariable('heading_block_23'),
      groupHeadingVariable('heading_block_24'),
      groupHeadingVariable('heading_block_25'),
      groupHeadingVariable('heading_block_26'),
    ],
  },
];
