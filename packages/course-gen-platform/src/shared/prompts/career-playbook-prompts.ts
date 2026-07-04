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
- Block 5: Management 3.0 + Amazon one-way/two-way door. At least 4 decisions across autonomy levels.

Output rules:
- Markdown only, no HTML.
- Write all prose in {{content_language}}.
- For Russian output, translate user-facing framework labels and table labels; do not output raw English phrases such as "Decision Authority", "Definition of Done", "Traffic-light actions", "Role Canvas", "Implementation checklist", "Red Flags", or "Hit by a Bus". Common KPI acronyms from user context may remain unchanged.
- Do not output raw template placeholders in square or curly brackets. If a value must be filled later, write it as an explicit field to fill.
- Exact company-specific numbers, quotas, KPI targets, budgets, and deadlines must come from RoleProfileSpec, user Q&A, business context, or source evidence. If no source supports a precise value, write it as a recommendation/benchmark or say it must be agreed.
- Use exactly these top-level headings:
{{heading_header}}
{{heading_block_1}}
{{heading_block_2}}
{{heading_block_5}}

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
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
- Block 6: Input/Output metrics, traffic-light actions, and anti-metrics warnings.
- Block 8: Tools table with purpose and required proficiency.

Output rules:
- Markdown only, no HTML.
- Write all prose in {{content_language}}.
- For Russian output, translate user-facing framework labels and table labels; do not output raw English phrases such as "Decision Authority", "Definition of Done", "Traffic-light actions", "Role Canvas", "Implementation checklist", "Red Flags", or "Hit by a Bus". Common KPI acronyms from user context may remain unchanged.
- Do not output raw template placeholders in square or curly brackets. If a value must be filled later, write it as an explicit field to fill.
- Exact company-specific numbers, quotas, KPI targets, budgets, and deadlines must come from RoleProfileSpec, user Q&A, business context, or source evidence. If no source supports a precise value, write it as a recommendation/benchmark or say it must be agreed.
- Use exactly these top-level headings:
{{heading_block_3}}
{{heading_block_4}}
{{heading_block_6}}
{{heading_block_8}}

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
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

Output rules:
- Markdown only, no HTML.
- Write all prose in {{content_language}}.
- For Russian output, translate user-facing framework labels and table labels; do not output raw English phrases such as "Decision Authority", "Definition of Done", "Traffic-light actions", "Role Canvas", "Implementation checklist", "Red Flags", or "Hit by a Bus". Common KPI acronyms from user context may remain unchanged.
- Do not output raw template placeholders in square or curly brackets. If a value must be filled later, write it as an explicit field to fill.
- Exact company-specific numbers, quotas, KPI targets, budgets, and deadlines must come from RoleProfileSpec, user Q&A, business context, or source evidence. If no source supports a precise value, write it as a recommendation/benchmark or say it must be agreed.
- Use exactly these top-level headings:
{{heading_block_7}}
{{heading_block_9}}
{{heading_block_12}}
{{heading_block_13}}

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
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
- Block 11: dual IC/management tracks, promotion criteria, timelines, and Mermaid career diagram.
- Block 14: First 5 Wins, sprint-based 30-60-90 plan, graduation criteria, support triangle, and repeated self-assessment.
- Block 15: material motivation, AMP levers, career conversations, and job crafting boundaries.
- Block 17: role-specific red flags, five disengagement stages, stay interview prompts, review criteria, and skill sprints.

Output rules:
- Markdown only, no HTML.
- Write all prose in {{content_language}}.
- For Russian output, translate user-facing framework labels and table labels; do not output raw English phrases such as "Decision Authority", "Definition of Done", "Traffic-light actions", "Role Canvas", "Implementation checklist", "Red Flags", or "Hit by a Bus". Common KPI acronyms from user context may remain unchanged.
- Do not output raw template placeholders in square or curly brackets. If a value must be filled later, write it as an explicit field to fill.
- Exact company-specific numbers, quotas, KPI targets, budgets, and deadlines must come from RoleProfileSpec, user Q&A, business context, or source evidence. If no source supports a precise value, write it as a recommendation/benchmark or say it must be agreed.
- Include a Mermaid flowchart TB career diagram in Block 11.
- Use exactly these top-level headings:
{{heading_block_11}}
{{heading_block_14}}
{{heading_block_15}}
{{heading_block_17}}

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
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
- Block 21: FMEA-style pre-mortem with at least 3 failure modes, early signals, and prevention actions.

Output rules:
- Markdown only, no HTML.
- Write all prose in {{content_language}}.
- For Russian output, translate user-facing framework labels and table labels; do not output raw English phrases such as "Decision Authority", "Definition of Done", "Traffic-light actions", "Role Canvas", "Implementation checklist", "Red Flags", or "Hit by a Bus". Common KPI acronyms from user context may remain unchanged.
- Do not output raw template placeholders in square or curly brackets. If a value must be filled later, write it as an explicit field to fill.
- Exact company-specific numbers, quotas, KPI targets, budgets, and deadlines must come from RoleProfileSpec, user Q&A, business context, or source evidence. If no source supports a precise value, write it as a recommendation/benchmark or say it must be agreed.
- Include Mermaid diagrams in Blocks 10 and 16.
- Use exactly these top-level headings:
{{heading_block_10}}
{{heading_block_16}}
{{heading_block_19}}
{{heading_block_20}}
{{heading_block_21}}

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
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
- Block 23: continuity checklist, critical knowledge, backups, and last-training dates.
- Block 24: one-page Role Canvas summarizing mission, metrics, superpower, anti-goals, decisions, dependencies, career path, and first win.
- Block 25: revision triggers, version/date metadata, and MegaCampus AI CTA.
- Block 26: implementation checklist for manager, HR, and employee to operationalize the guide.

Output rules:
- Markdown only, no HTML.
- Write all prose in {{content_language}}.
- For Russian output, translate user-facing framework labels and table labels; do not output raw English phrases such as "Decision Authority", "Definition of Done", "Traffic-light actions", "Role Canvas", "Implementation checklist", "Red Flags", or "Hit by a Bus". Common KPI acronyms from user context may remain unchanged.
- Do not output raw template placeholders in square or curly brackets. If a value must be filled later, write it as an explicit field to fill.
- Exact company-specific numbers, quotas, KPI targets, budgets, and deadlines must come from RoleProfileSpec, user Q&A, business context, or source evidence. If no source supports a precise value, write it as a recommendation/benchmark or say it must be agreed.
- Use exactly these top-level headings:
{{heading_block_18}}
{{heading_block_22}}
{{heading_block_23}}
{{heading_block_24}}
{{heading_block_25}}
{{heading_block_26}}

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [
      specJsonVariable,
      contentLanguageVariable,
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

Assign severity by CATEGORY, not by taste. An issue is "critical" (regeneration-worthy) ONLY when it belongs to one of these five categories:
- "contradiction": the block contradicts RoleProfileSpec, or repeats a topic that RoleProfileSpec.block_boundaries assigns to a different block.
- "format_minimum": a hard format minimum is missing — anti-goals < 4, decision matrix < 4 rows, failure modes < 3, or a required Mermaid diagram (career path, dependencies, or main process) is absent.
- "wrong_language": user-facing text is not in the target content language.
- "unresolved_placeholder": raw template placeholders remain (e.g. [дата], {fill}).
- "invented_number": a company-specific number, quota, budget, or deadline is stated as fact with no support from RoleProfileSpec, Q&A, business context, or source evidence.

Everything else — tone, "too generic", "not actionable enough", "reads like HR jargon", phrasing, style preferences — is at most "warning" (or "info"), and is NEVER grounds for regeneration. Reason: the deterministic layer already blocks the hard failures reliably, so routing style opinions into regeneration only burns cycles without improving correctness; prefer author freedom over rigid style rules.

Rules:
- Every issue MUST include a "category" field. Use "style" for any non-critical stylistic or tone finding.
- Use severity "critical" ONLY for issues in the five critical categories above; use "warning" or "info" for everything else.
- List a block id in "needs_regeneration" only when it has a critical issue in one of the five critical categories.

Return only valid JSON:
{
  "pass": true,
  "score": 100,
  "issues": [
    {
      "block_id": "block_5",
      "severity": "critical" | "warning" | "info",
      "category": "contradiction" | "format_minimum" | "wrong_language" | "unresolved_placeholder" | "invented_number" | "style",
      "description": "...",
      "suggestion": "..."
    }
  ],
  "needs_regeneration": ["block_5"]
}

USER:
Group id: {{group_id}}
RoleProfileSpec:
{{spec_json}}

Previous groups output:
{{prev_groups_content}}

Current group output:
{{current_group_content}}`,
    variables: [
      { name: 'group_id', description: 'Current group or block ids under review', required: true },
      specJsonVariable,
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

Original block content:
{{original_content}}

Issue from judge:
{{issue_description}}

Suggestion:
{{suggestion}}

User edit instruction:
{{user_instruction}}

Return only markdown for this one block.
Exact company-specific numbers, quotas, KPI targets, budgets, and deadlines must come from RoleProfileSpec, user Q&A, business context, or source evidence. If no source supports a precise value, write it as a recommendation/benchmark or say it must be agreed.

USER:
RoleProfileSpec:
{{spec_json}}

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
        name: 'other_blocks_brief',
        description: 'Compact summary of other generated blocks',
        required: true,
      },
      contentLanguageVariable,
    ],
  },
];
