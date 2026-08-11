import type { HardcodedPrompt } from './types.js';
import { formatCareerPlaybookCanonicalLayoutForPrompt } from './career-playbook-block-topics.js';

const CAREER_PLAYBOOK_CANONICAL_LAYOUT = formatCareerPlaybookCanonicalLayoutForPrompt();

const specJsonVariable = {
  name: 'spec_json',
  description: 'Serialized RoleProfileSpec JSON',
  required: true,
};

const contentLanguageVariable = {
  name: 'content_language',
  description: 'Target content language code',
  required: true,
};

const contentLanguageNameVariable = {
  name: 'content_language_name',
  description: 'Target content language full English name for prompt clarity',
  required: true,
};

const groupHeadingVariables = [
  { name: 'heading_header', description: 'Localized Header heading', required: true },
  { name: 'heading_block_1', description: 'Localized Block 1 heading', required: true },
  { name: 'heading_block_2', description: 'Localized Block 2 heading', required: true },
  { name: 'heading_block_3', description: 'Localized Block 3 heading', required: true },
  { name: 'heading_block_4', description: 'Localized Block 4 heading', required: true },
  { name: 'heading_block_5', description: 'Localized Block 5 heading', required: true },
  { name: 'heading_block_6', description: 'Localized Block 6 heading', required: true },
  { name: 'heading_block_7', description: 'Localized Block 7 heading', required: true },
  { name: 'heading_block_8', description: 'Localized Block 8 heading', required: true },
  { name: 'heading_block_9', description: 'Localized Block 9 heading', required: true },
  { name: 'heading_block_10', description: 'Localized Block 10 heading', required: true },
  { name: 'heading_block_11', description: 'Localized Block 11 heading', required: true },
  { name: 'heading_block_12', description: 'Localized Block 12 heading', required: true },
  { name: 'heading_block_13', description: 'Localized Block 13 heading', required: true },
  { name: 'heading_block_14', description: 'Localized Block 14 heading', required: true },
  { name: 'heading_block_15', description: 'Localized Block 15 heading', required: true },
  { name: 'heading_block_16', description: 'Localized Block 16 heading', required: true },
  { name: 'heading_block_17', description: 'Localized Block 17 heading', required: true },
  { name: 'heading_block_18', description: 'Localized Block 18 heading', required: true },
  { name: 'heading_block_19', description: 'Localized Block 19 heading', required: true },
  { name: 'heading_block_20', description: 'Localized Block 20 heading', required: true },
  { name: 'heading_block_21', description: 'Localized Block 21 heading', required: true },
  { name: 'heading_block_22', description: 'Localized Block 22 heading', required: true },
  { name: 'heading_block_23', description: 'Localized Block 23 heading', required: true },
  { name: 'heading_block_24', description: 'Localized Block 24 heading', required: true },
  { name: 'heading_block_25', description: 'Localized Block 25 heading', required: true },
  { name: 'heading_block_26', description: 'Localized Block 26 heading', required: true },
];

function groupHeadingVariable(name: string) {
  const variable = groupHeadingVariables.find(item => item.name === name);
  if (!variable) {
    throw new Error(`Unknown Career Playbook heading variable: ${name}`);
  }

  return variable;
}

/**
 * Contract variables shared by every group prompt. Declared once so a rule can
 * never drift between the six groups — the previous per-prompt copies are how
 * the "invented example" instruction ended up in all six while the citation
 * requirement made it into none.
 */
const groupContractVariables = [
  {
    name: 'metric_ledger_md',
    description: 'Canonical metric ledger rendered as a markdown table',
    required: true,
  },
  {
    name: 'evidence_ledger_md',
    description: 'Citable sources rendered as a [Sn] list, or an explicit "none" notice',
    required: true,
  },
  {
    name: 'generated_on',
    description: 'Generation date (ISO), application-filled',
    required: true,
  },
  {
    name: 'prior_blocks_digest',
    description: 'Anti-goals, numeric commitments and cadences already published',
    required: true,
  },
];

/**
 * The output contract every group shares.
 *
 * Each rule here answers a measured defect from the 2026-08-11 review rather
 * than a style preference: conflicting thresholds across blocks, precise market
 * statistics with no source, invented company values presented as truth, a
 * Gantt chart pinned to 2025 in a document generated in 2026, and duties that
 * contradicted the guide's own anti-goals.
 */
const GROUP_OUTPUT_CONTRACT = `Output rules:
- Markdown only, no HTML.
- Write all prose in {{content_language}}.
- For Russian output, translate user-facing framework labels and table labels; do not output raw English phrases such as "Decision Authority", "Definition of Done", "Traffic-light actions", "Role Canvas", "Implementation checklist", "Red Flags", or "Hit by a Bus". Common KPI acronyms from user context may remain unchanged.
- Keep each block within its own subject: when RoleProfileSpec.block_boundaries lists a topic under do_not_repeat for a block, define that topic only in the block that owns it and cross-reference it elsewhere instead of restating the full model.

NUMBERS — the metric ledger is the only source of numeric truth:
- Reproduce every value and traffic-light threshold from the metric ledger VERBATIM, including its review period.
- Never state a different number for a metric that appears in the ledger, in any block, table, or checklist.
- A metric that is not in the ledger is described qualitatively, without a precise target.

EXTERNAL CLAIMS — no precise statistic without a source:
- A precise statistic about the market, the industry, competitors, or AI impact is allowed ONLY with a [Sn] reference to an entry in the evidence ledger below.
- If the evidence ledger has no entry supporting the claim, rewrite it without the number, as an explicit hypothesis to validate.
- Never write "research shows", "studies indicate", or a dated study reference unless it carries a [Sn] reference.

EXAMPLES — mark every unverified company-specific value:
- A company-specific value that is not backed by the business context or the user's answers (salary, bonus, ARR, budget, headcount cost, a person's name, an internal tool name) stays concrete, but MUST carry the marker "(пример — заменить)" in Russian or "(example — replace)" in English, immediately after the value in the same sentence or table cell.
- Do not leave raw template placeholders in square or curly brackets (for example [Name] or {value}). Reserve an explicit "field to fill" label for a genuine blank template field the reader completes later, such as an onboarding form or a backup-contact table.

DATES — today is {{generated_on}}:
- Plans, schedules, ramp charts, and Gantt-style tables use relative labels only: "Day 1-30", "Week 2", "Month 3", "Quarter 1".
- Never write an absolute calendar year in a plan, a training record, or a milestone.

CONSISTENCY — do not contradict what is already published:
- The digest below lists anti-goals, numeric commitments, and cadences that earlier blocks already state.
- Never contradict them. If a duty you are about to write would violate a published anti-goal, restate the duty so both hold — for example, review a sample on a cadence rather than every person every day.`;

/** The USER section every group prompt shares. */
const GROUP_USER_SECTION = `USER:
RoleProfileSpec:
{{spec_json}}

Metric ledger (single source of numeric truth):
{{metric_ledger_md}}

Evidence ledger (the only citable sources):
{{evidence_ledger_md}}

Already published content (do not contradict):
{{prior_blocks_digest}}`;

export const careerPlaybookPrompts: HardcodedPrompt[] = [
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_department_classifier',
    promptName: 'Career Playbook - Department Classifier',
    promptDescription:
      'Classifies ambiguous role titles into a short list of Career Playbook functional areas.',
    promptTemplate: `SYSTEM:
You classify a role title into Career Playbook functional areas.
Return only valid JSON.

Rules:
- Use only values from allowed_departments_json.
- Return 2-5 candidates unless one department is extremely obvious.
- Do not return the full generic list.
- Labels must be written in the UI language.
- Use "other" only when none of the concrete departments fits.

JSON shape:
{
  "candidates": [
    { "value": "sales", "label": "...", "confidence": 0.0, "rationale": "..." }
  ]
}

USER:
Role title: {{title}}
UI language: {{ui_language}}
Allowed departments:
{{allowed_departments_json}}`,
    variables: [
      { name: 'title', description: 'Role title entered by the user', required: true },
      { name: 'ui_language', description: 'UI language for candidate labels', required: true },
      {
        name: 'allowed_departments_json',
        description: 'Allowed department values for the classifier',
        required: true,
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_followup_generator',
    promptName: 'Career Playbook - Follow-up Question Generator',
    promptDescription:
      'Generates adaptive follow-up questions from fixed Career Playbook wizard answers.',
    promptTemplate: `SYSTEM:
You are an HR expert helping create an operational Role Guide.
Generate 3-7 additional questions that collect critical data for a high-quality Role Guide based on Netflix, Amazon, Toyota, Spotify, and Bridgewater practices.

Rules:
- Each question focuses on one concrete aspect.
- If business_context_mode is "company_specific", ask 2-5 targeted questions only for missing or weak business signals.
- If business_context_mode is "universal", ask role-specific benchmark questions and do not invent company-specific product, customer, sales, process, or metric facts.
- Prefer single_choice or multi_choice when sensible options exist.
- Use "ready_to_generate" only when completeness_score is at least 0.75 and no critical gaps remain; otherwise use "ask_more".
- Write every user-facing string in questions[].question_text, questions[].options[].label, and questions[].rationale in {{content_language_name}}.
- Do not write user-facing strings in English unless content_language_name is English. Product names, acronyms, role titles, and technical terms supplied by the user may remain unchanged.
- Keep options[].value as stable machine-readable snake_case identifiers; do not localize options[].value.
- Return only valid JSON matching this shape:
{
  "questions": [
    {
      "question_id": "uuid_v4_string",
      "question_text": "...",
      "question_type": "open" | "single_choice" | "multi_choice",
      "options": [{"value": "...", "label": "..."}] | null,
      "rationale": "..."
    }
  ],
  "completeness_score": 0.0,
  "stop_recommendation": "ask_more" | "ready_to_generate"
}

USER:
Position: {{position}}
Department: {{department}}
Level: {{level}}
Team size: {{team_size}}
Company stage: {{company_stage}}
Reports to / subordinates: {{reporting}}
Content language code: {{content_language}}
Content language name: {{content_language_name}}
Free-form context: {{freeform_text}}
Business context mode: {{business_context_mode}}
Business context digest:
{{business_context_digest}}
Business context source evidence pack:
{{business_context_source_excerpts}}
Business context missing signals:
{{business_context_missing_signals}}
Previous follow-ups answered: {{previous_followups_json}}`,
    variables: [
      { name: 'position', description: 'Position title', required: true },
      { name: 'department', description: 'Department or function', required: true },
      { name: 'level', description: 'Role level', required: true },
      { name: 'team_size', description: 'Company or team size', required: true },
      { name: 'company_stage', description: 'Company stage', required: true },
      { name: 'reporting', description: 'Reporting line and subordinates', required: true },
      contentLanguageVariable,
      contentLanguageNameVariable,
      { name: 'freeform_text', description: 'Optional free-form context', required: true },
      {
        name: 'business_context_mode',
        description: 'Business context mode: company_specific or universal',
        required: true,
      },
      {
        name: 'business_context_digest',
        description: 'Structured business context digest or universal mode warning',
        required: true,
      },
      {
        name: 'business_context_source_excerpts',
        description:
          'Career Playbook source evidence pack from first-party files. Prefer authoritative Docling markdown; summaries are overview only.',
        required: true,
      },
      {
        name: 'business_context_missing_signals',
        description: 'Missing business signals to drive targeted follow-up questions',
        required: true,
      },
      {
        name: 'previous_followups_json',
        description: 'Serialized previous follow-up answers',
        required: true,
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_spec_builder',
    promptName: 'Career Playbook - Spec Builder',
    promptDescription:
      'Builds the RoleProfileSpec contract from Q&A data and web research insights.',
    promptTemplate: `SYSTEM:
Build a RoleProfileSpec JSON object from the user Q&A and web research.
This spec is the contract for generating 26 Role Guide blocks.

The Role Guide has a FIXED 26-block layout. Each block id owns one fixed topic.
Canonical block topics (block id: topic):
${CAREER_PLAYBOOK_CANONICAL_LAYOUT}

Critical requirements:
- Fill block_boundaries for every content block block_1 through block_26.
- block_boundaries[block_id].primary_topics MUST use the canonical topic for that
  exact block id above. You may refine the wording or add role-specific emphasis,
  but you MUST NOT move a topic to a different block id or rename a block's subject
  (e.g. block_11 is always career growth, block_23 is always continuity protocol,
  block_25 is always footer + revision cadence + MegaCampus CTA).
- Route role-specific emphasis into the canonical block that already owns it:
  recurring metrics or forecasting go into block_6 KPI and metrics and block_4
  duties; ownership areas go into block_3 responsibility zones; strategic ties go
  into block_20 business goals. Never invent a new block or repurpose a block id
  for a role emphasis such as forecasting, compliance, or career pathing.
- Put each topic in do_not_repeat only when another block id owns it; never list a
  block's own canonical topic in its own do_not_repeat.
- Extract anti_goals and failure_patterns explicitly.
- Build metric_ledger: exactly one entry per metric in focus_areas.primary_kpis, each with a
  concrete target and green/yellow/red thresholds plus a review period. This ledger becomes the
  single source of numeric truth for all 26 blocks, so the values must be internally coherent —
  a metric may hold only one target across the whole guide.
- Set provenance on every metric entry:
  * company_source — supported by the business context digest or source evidence pack
  * user_answer   — stated by the user in the Q&A
  * benchmark     — supported by a web research source
  * assumption    — not supported by anything; the guide will present it as a hypothesis to agree
  Research availability for this run: {{research_availability}}. When research is unavailable, no
  entry may use provenance "benchmark".
- Do NOT populate evidence_ledger or generated_on. The application fills both deterministically
  from the real research result and the system clock; anything you emit in those fields is
  discarded.
- Today is {{generated_on}}. Do not put absolute calendar dates into the spec.
- Keep client business_context separate from web research. Business context is first-party user/company data; web research is external benchmark data.
- If business_context_mode is "universal", do not invent product, customer, sales, process, or metric facts. Build a benchmark Role Guide and mark company-specific details as adaptation points.
- Keep content_language equal to {{content_language}}.
- Return only valid JSON matching the RoleProfileSpec schema.

USER:
Q&A answers:
{{qa_data_json}}

Business context mode:
{{business_context_mode}}

Business context digest:
{{business_context_digest}}

Business context source evidence pack:
{{business_context_source_excerpts}}

Business context missing signals:
{{business_context_missing_signals}}

Web research KPI insights:
{{kpi_insights}}

Web research trends:
{{trends_insights}}

Web research onboarding:
{{onboarding_insights}}

Source URLs:
{{source_urls}}`,
    variables: [
      { name: 'qa_data_json', description: 'Serialized Q&A data', required: true },
      {
        name: 'business_context_mode',
        description: 'Business context mode: company_specific or universal',
        required: true,
      },
      {
        name: 'business_context_digest',
        description: 'Structured first-party business context digest',
        required: true,
      },
      {
        name: 'business_context_source_excerpts',
        description:
          'Career Playbook source evidence pack from first-party files. Prefer authoritative Docling markdown; summaries are overview only.',
        required: true,
      },
      {
        name: 'business_context_missing_signals',
        description: 'Missing first-party business context signals',
        required: true,
      },
      { name: 'kpi_insights', description: 'KPI research insights', required: true },
      { name: 'trends_insights', description: 'Trends research insights', required: true },
      {
        name: 'onboarding_insights',
        description: 'Onboarding research insights',
        required: true,
      },
      { name: 'source_urls', description: 'Research source URLs', required: true },
      {
        name: 'research_availability',
        description: 'Whether external research produced usable sources for this run',
        required: true,
      },
      {
        name: 'generated_on',
        description: 'Generation date (ISO), application-filled',
        required: true,
      },
      contentLanguageVariable,
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_group_1_foundation',
    promptName: 'Career Playbook - Group 1 Foundation',
    promptDescription: 'Generates Header, Mission/KR, Anti-goals, and Decision Authority Matrix.',
    promptTemplate: `SYSTEM:
Generate Role Guide group 1: Header + Block 1 (Mission/KR) + Block 2 (Anti-goals) + Block 5 (Decision Authority Matrix).

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

${GROUP_OUTPUT_CONTRACT}
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

Methodology:
- Block 3: 4-6 responsibility zones with weight percentages summing to 100 and Definition of Done.
- Block 4: Daily / weekly / monthly / quarterly duties with measurable result and Definition of Done.
- Block 6: Input/Output metrics, traffic-light actions, and anti-metrics warnings. Every metric in
  the ledger appears here with exactly the ledger's target and thresholds.
- Block 8: Tools table with purpose and required proficiency.

Forecast wording: describe forecast quality as absolute error ("forecast error above 20%"), never
as "accuracy above +/-20%" — accuracy and variance are opposite directions and mixing them makes
the threshold unreadable.

${GROUP_OUTPUT_CONTRACT}
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

Methodology:
- Block 7: superpower, hard skills, soft skills with why, and energy map for hiring fit.
- Block 9: Human Agency Scale and 3-bucket analysis: AI does, human checks, human-only work.
- Block 12: education, experience, personality profile, and GWC filter (Get it / Want it / Capacity).
- Block 13: hourly schedule plus cognitive load profile and focus-block recommendations.

Block 9 in particular attracts unsupported statistics about AI accuracy, adoption rates, and hours
saved. State those only with a [Sn] citation; otherwise describe the shift qualitatively.

${GROUP_OUTPUT_CONTRACT}
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
- Block 17: role-specific red flags, five disengagement stages, stay interview prompts, review criteria, and skill sprints. Warning thresholds come from the metric ledger, not from new numbers.

${GROUP_OUTPUT_CONTRACT}
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

Methodology:
- Block 10: role dependencies, blast radius, communication charter, and Mermaid dependency diagram.
- Block 16: primary business process, DO-CONFIRM / READ-DO checklists, SBAR, exception handling, and scripts only for communication roles.
- Block 19: 3-layer context, durable skills, AI impact, continuous learning, and skill stacking.
- Block 20: business goals, how this role impacts them, impact metrics, and Netflix Context Over Control paragraph.
- Block 21: FMEA-style pre-mortem with at least 3 failure modes, early signals, and prevention actions. Every threshold that names a ledger metric uses the ledger's value.

Block 19 attracts unsupported market statistics (adoption rates, growth rates, benchmark
multiples). State those only with a [Sn] citation; otherwise describe the trend qualitatively.

${GROUP_OUTPUT_CONTRACT}
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

Methodology:
- Block 18: 5-8 FAQ items mixing employee questions and questions about the role.
- Block 22: template prompts the employee fills in during onboarding Week 2-3; do not pre-fill personal answers.
- Block 23: continuity checklist, critical knowledge, backups, and training status. Describe training recency relatively ("refreshed within the last two quarters"), never with a calendar year.
- Block 24: one-page Role Canvas summarizing mission, metrics, superpower, anti-goals, decisions, dependencies, career path, and first win. Every metric it repeats must match the ledger exactly — this block is a summary, so a divergence here contradicts the whole document at once.
- Block 25: revision triggers, version metadata dated {{generated_on}}, and MegaCampus AI CTA. This is the only block allowed to print an absolute date.
- Block 26: implementation checklist for manager, HR, and employee to operationalize the guide. It must include a "calibrate before publishing" section listing every value elsewhere in the guide that carries the example marker, so the reader knows exactly what to replace.

${GROUP_OUTPUT_CONTRACT}
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
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_cross_block_judge',
    promptName: 'Career Playbook - Cross-block Judge',
    promptDescription:
      'Checks consistency, cross-references, minimum item counts, Mermaid coverage, and regeneration needs across generated Role Guide blocks.',
    promptTemplate: `SYSTEM:
Review generated Career Playbook blocks for consistency against RoleProfileSpec and previous groups.

Assign severity by CATEGORY, not by taste. An issue is "critical" (regeneration-worthy) ONLY when it belongs to one of these categories:
- "contradiction": the block contradicts RoleProfileSpec, OR contradicts another block, or repeats a topic that RoleProfileSpec.block_boundaries assigns to a different block. A duty that violates a stated anti-goal is a contradiction — for example an anti-goal against micromanaging individual activity next to a duty requiring a per-person daily review.
- "format_minimum": a hard format minimum is missing — anti-goals < 4, decision matrix < 4 rows, failure modes < 3, or a block that must contain a Mermaid diagram has none. The deterministic layer already enforces which blocks require a diagram, so only flag an entirely absent one; never ask for an extra, renamed, or duplicate diagram when the block already has one.
- "wrong_language": user-facing text is not in the target content language.
- "unresolved_placeholder": raw template placeholders remain (e.g. [дата], {fill}).
- "invented_number": a company-specific number, quota, budget, or deadline is stated as fact with no support from RoleProfileSpec, Q&A, business context, or source evidence.
- "metric_conflict": a metric that appears in the metric ledger is stated with a different value or threshold. The ledger wins; the block is wrong.
- "unsourced_claim": a precise external statistic (market, industry, competitor, AI impact) is stated without a [Sn] reference to the evidence ledger, or with a [Sn] that is not in the ledger.
- "stale_date": an absolute calendar year appears outside block 25, or block 25's date is not the generation date.
- "unmarked_example": an unverified company-specific value (salary, bonus, ARR, budget, person name, internal tool) appears without the example marker.

Everything else — tone, "too generic", "not actionable enough", "reads like HR jargon", phrasing, style preferences — is at most "warning" (or "info"), and is NEVER grounds for regeneration. Reason: the deterministic layer already blocks the hard failures reliably, so routing style opinions into regeneration only burns cycles without improving correctness; prefer author freedom over rigid style rules.

Rules:
- Every issue MUST include a "category" field. Use "style" for any non-critical stylistic or tone finding.
- Use severity "critical" ONLY for issues in the critical categories above; use "warning" or "info" for everything else.
- List a block id in "needs_regeneration" only when it has a critical issue in one of the critical categories.
- The deterministic layer already scans for metric conflicts, unsourced statistics, absolute dates, and unmarked examples by pattern. Spend your attention on what a pattern cannot see: a claim that contradicts another block in meaning rather than in digits, a duty that undermines a stated anti-goal, a threshold that is internally incoherent.

Return only valid JSON:
{
  "pass": true,
  "score": 100,
  "issues": [
    {
      "block_id": "block_5",
      "severity": "critical" | "warning" | "info",
      "category": "contradiction" | "format_minimum" | "wrong_language" | "unresolved_placeholder" | "invented_number" | "metric_conflict" | "unsourced_claim" | "stale_date" | "unmarked_example" | "style",
      "description": "...",
      "suggestion": "..."
    }
  ],
  "needs_regeneration": ["block_5"]
}

USER:
Group id: {{group_id}}
Today is {{generated_on}}.
RoleProfileSpec:
{{spec_json}}

Metric ledger (single source of numeric truth):
{{metric_ledger_md}}

Evidence ledger (the only citable sources):
{{evidence_ledger_md}}

Previous groups output:
{{prev_groups_content}}

Current group output:
{{current_group_content}}`,
    variables: [
      { name: 'group_id', description: 'Current group or block ids under review', required: true },
      specJsonVariable,
      {
        name: 'metric_ledger_md',
        description: 'Canonical metric ledger rendered as a markdown table',
        required: true,
      },
      {
        name: 'evidence_ledger_md',
        description: 'Citable sources rendered as a [Sn] list',
        required: true,
      },
      {
        name: 'generated_on',
        description: 'Generation date (ISO), application-filled',
        required: true,
      },
      {
        name: 'prev_groups_content',
        description: 'Previously generated group markdown for cross-reference checks',
        required: true,
      },
      {
        name: 'current_group_content',
        description: 'Current generated group markdown under review',
        required: true,
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_block_regenerator',
    promptName: 'Career Playbook - Block Regenerator',
    promptDescription:
      'Regenerates a single Career Playbook block from judge feedback and optional user instructions.',
    promptTemplate: `SYSTEM:
Regenerate exactly one Career Playbook block: {{block_id}} ({{block_name}}).
Preserve the block format contract and fix the judge issue without repeating unrelated blocks.
- If the block already contains a Mermaid diagram, improve that existing diagram instead of appending a new one; add a diagram only when the block has none and its contract requires one.
- In every Mermaid diagram, wrap each node label in double quotes (for example A["Team Lead (Block 9)"]); never leave raw parentheses or a line break inside an unquoted label.
- For an illustrative name or value in narrative prose, use a realistic invented example and mark it as an example; do not leave raw bracket placeholders like [Name] or {value}, and never rewrite a narrative name into a "field to fill" phrase inside a sentence. Reserve "field to fill" wording for genuine blank template fields the reader completes later.

Original block content:
{{original_content}}

Issue from judge:
{{issue_description}}

Suggestion:
{{suggestion}}

User edit instruction:
{{user_instruction}}

Return only markdown for this one block.

- Numbers: reproduce every value from the metric ledger VERBATIM. If the issue is a metric conflict,
  align the block to the ledger — never invent a third value to split the difference.
- External statistics: allowed only with a [Sn] reference to the evidence ledger. Without a matching
  entry, rewrite without the precise number.
- Unverified company-specific values (salary, bonus, ARR, budget, person name, internal tool) keep
  the marker "(пример — заменить)" in Russian or "(example — replace)" in English.
- Today is {{generated_on}}. Use relative labels ("Day 1-30", "Week 2") in plans; an absolute
  calendar year is allowed only in block 25.

USER:
RoleProfileSpec:
{{spec_json}}

Metric ledger (single source of numeric truth):
{{metric_ledger_md}}

Evidence ledger (the only citable sources):
{{evidence_ledger_md}}

Other blocks summary:
{{other_blocks_brief}}

Content language: {{content_language}}`,
    variables: [
      { name: 'block_id', description: 'Target block id', required: true },
      { name: 'block_name', description: 'Human-readable block name', required: true },
      { name: 'original_content', description: 'Original block markdown', required: true },
      { name: 'issue_description', description: 'Judge issue description', required: true },
      { name: 'suggestion', description: 'Judge suggestion or none', required: true },
      {
        name: 'user_instruction',
        description: 'Optional user instruction or none',
        required: true,
      },
      specJsonVariable,
      {
        name: 'metric_ledger_md',
        description: 'Canonical metric ledger rendered as a markdown table',
        required: true,
      },
      {
        name: 'evidence_ledger_md',
        description: 'Citable sources rendered as a [Sn] list',
        required: true,
      },
      {
        name: 'generated_on',
        description: 'Generation date (ISO), application-filled',
        required: true,
      },
      {
        name: 'other_blocks_brief',
        description: 'Compact summary of other generated blocks',
        required: true,
      },
      contentLanguageVariable,
    ],
  },
];
