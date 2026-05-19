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
];
