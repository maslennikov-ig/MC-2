import type { HardcodedPrompt } from './types.js';

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

const groupHeadingVariables = [
  { name: 'heading_header', description: 'Localized Header heading', required: true },
  { name: 'heading_block_1', description: 'Localized Block 1 heading', required: true },
  { name: 'heading_block_2', description: 'Localized Block 2 heading', required: true },
  { name: 'heading_block_3', description: 'Localized Block 3 heading', required: true },
  { name: 'heading_block_4', description: 'Localized Block 4 heading', required: true },
  { name: 'heading_block_5', description: 'Localized Block 5 heading', required: true },
  { name: 'heading_block_6', description: 'Localized Block 6 heading', required: true },
  { name: 'heading_block_8', description: 'Localized Block 8 heading', required: true },
];

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
- Prefer single_choice or multi_choice when sensible options exist.
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
Content language: {{content_language}}
Free-form context: {{freeform_text}}
Previous follow-ups answered: {{previous_followups_json}}`,
    variables: [
      { name: 'position', description: 'Position title', required: true },
      { name: 'department', description: 'Department or function', required: true },
      { name: 'level', description: 'Role level', required: true },
      { name: 'team_size', description: 'Company or team size', required: true },
      { name: 'company_stage', description: 'Company stage', required: true },
      { name: 'reporting', description: 'Reporting line and subordinates', required: true },
      contentLanguageVariable,
      { name: 'freeform_text', description: 'Optional free-form context', required: true },
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

Critical requirements:
- Fill block_boundaries to prevent repetition between blocks.
- Extract anti_goals and failure_patterns explicitly.
- Keep content_language equal to {{content_language}}.
- Return only valid JSON matching the RoleProfileSpec schema.

USER:
Q&A answers:
{{qa_data_json}}

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
      groupHeadingVariables[0],
      groupHeadingVariables[1],
      groupHeadingVariables[2],
      groupHeadingVariables[5],
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
      groupHeadingVariables[3],
      groupHeadingVariables[4],
      groupHeadingVariables[6],
      groupHeadingVariables[7],
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
- Use exactly these top-level headings:
## 7. Необходимые компетенции
## 9. Как AI меняет эту роль
## 12. Профиль кандидата
## 13. Типичный рабочий день

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [specJsonVariable, contentLanguageVariable],
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
- Include a Mermaid flowchart TB career diagram in Block 11.
- Use exactly these top-level headings:
## 11. Карьерный рост
## 14. Онбординг: First 5 Wins + План 30-60-90
## 15. Система мотивации
## 17. Red Flags и система раннего предупреждения

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [specJsonVariable, contentLanguageVariable],
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
- Include Mermaid diagrams in Blocks 10 and 16.
- Use exactly these top-level headings:
## 10. Взаимодействие и зависимости
## 16. Регламенты и процессы
## 19. Отраслевой контекст
## 20. Связь с бизнес-целями
## 21. Как люди обычно проваливаются на этой роли

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [specJsonVariable, contentLanguageVariable],
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
- Use exactly these top-level headings:
## 18. FAQ
## 22. "Как со мной работать" (заполняется сотрудником)
## 23. Протокол непрерывности ("Hit by a Bus")
## 24. Role Canvas
## 25. Когда пересматривать эту инструкцию
## 26. Implementation checklist

USER:
RoleProfileSpec:
{{spec_json}}`,
    variables: [specJsonVariable, contentLanguageVariable],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_cross_block_judge',
    promptName: 'Career Playbook - Cross-block Judge',
    promptDescription:
      'Checks consistency, cross-references, minimum item counts, Mermaid coverage, and regeneration needs across generated Role Guide blocks.',
    promptTemplate: `SYSTEM:
Review generated Career Playbook blocks for consistency against RoleProfileSpec and previous groups.

Checks:
- No repetition against RoleProfileSpec.block_boundaries.
- Cross-references are coherent: competencies with tools, KPIs with responsibilities, anti-goals with duties.
- Format requirements are satisfied: anti-goals >= 4, decision matrix >= 4, failure modes >= 3, and Mermaid coverage for career path, dependencies, and main process.
- Output is actionable business-owner language, not generic HR jargon.

Return only valid JSON:
{
  "pass": true,
  "score": 100,
  "issues": [
    {
      "block_id": "block_5",
      "severity": "critical" | "warning" | "info",
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
