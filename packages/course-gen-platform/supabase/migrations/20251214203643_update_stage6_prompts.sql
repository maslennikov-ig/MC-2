-- Migration: Update Stage 6 prompts with outputLanguage variable and language guidance
-- Purpose: Add missing outputLanguage variable to all Stage 6 prompts + userRefinementPrompt to planner
-- Date: 2025-12-14
-- Related: Stage 6 lesson content generation pipeline

-- ============================================================================
-- STAGE 6 PROMPT UPDATES (5 total)
-- ============================================================================

-- Stage 6 - Planner: Lesson Outline Generation (ADD outputLanguage + userRefinementPrompt)
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_planner',
  'Stage 6 - Planner: Lesson Outline Generation',
  'Generates detailed lesson outline from specification. Uses Context-First XML strategy with lesson context, learning objectives, and RAG context.',
  $prompt$<lesson_context>
  <metadata>
    <lesson_id>{{lessonId}}</lesson_id>
    <title>{{lessonTitle}}</title>
    <description>{{lessonDescription}}</description>
    <difficulty>{{difficulty}}</difficulty>
    <duration_minutes>{{durationMinutes}}</duration_minutes>
    <target_audience>{{targetAudience}}</target_audience>
    <tone>{{tone}}</tone>
    <content_archetype>{{contentArchetype}}</content_archetype>
  </metadata>

  <learning_objectives>
{{learningObjectives}}
  </learning_objectives>

  <introduction_blueprint>
    <hook_strategy>{{hookStrategy}}</hook_strategy>
    <hook_topic>{{hookTopic}}</hook_topic>
    <key_objectives>{{keyObjectives}}</key_objectives>
  </introduction_blueprint>

  <sections>
{{sections}}
  </sections>

  {{ragContext}}
</lesson_context>

{{#userRefinementPrompt}}
<user_refinement_instructions>
{{userRefinementPrompt}}
</user_refinement_instructions>
{{/userRefinementPrompt}}

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages.
</output_language>

<task>
Create a detailed lesson outline based on the specification above. The outline must:

1. **Introduction**: Plan the opening using the specified hook strategy ({{hookStrategy}})
   - Design a {{hookStrategy}} hook about: {{hookTopic}}
   - Preview the key learning objectives

2. **Main Sections**: For each section listed above, create:
   - 3-5 key points to cover
   - Suggested examples or illustrations
   - Include at least 1 practical example in format:
     📌 **Example: [Situation Name]**
     [Specific situation with details, numbers or names (2-4 sentences)]
     Example types: case study | specific numbers/data | analogy | application scenario | success/failure story
   - Transition to next section

3. **Conclusion**: Plan a summary that:
   - Reinforces each learning objective
   - Provides actionable next steps

{{#userRefinementPrompt}}
IMPORTANT: You MUST incorporate the user refinement instructions provided above into the outline structure.
{{/userRefinementPrompt}}

Format as markdown outline. Target total reading time: {{durationMinutes}} minutes
</task>$prompt$,
  '[{"name":"lessonId","description":"Lesson UUID","required":true},{"name":"lessonTitle","description":"Lesson title","required":true},{"name":"lessonDescription","description":"Lesson description","required":true},{"name":"difficulty","description":"Difficulty level","required":true},{"name":"durationMinutes","description":"Estimated duration in minutes","required":true},{"name":"targetAudience","description":"Target audience level","required":true},{"name":"tone","description":"Content tone (formal, conversational, etc.)","required":true},{"name":"contentArchetype","description":"Content archetype (code_tutorial, concept_explainer, etc.)","required":true},{"name":"learningObjectives","description":"XML-formatted learning objectives","required":true},{"name":"hookStrategy","description":"Hook strategy (analogy, statistic, challenge, question)","required":true},{"name":"hookTopic","description":"Topic for the hook","required":true},{"name":"keyObjectives","description":"Key learning objectives summary","required":true},{"name":"sections","description":"XML-formatted sections breakdown","required":true},{"name":"ragContext","description":"XML-formatted RAG context chunks","required":false},{"name":"outputLanguage","description":"Target language for all output content (e.g., \"English\", \"Russian\")","required":true,"example":"English"},{"name":"userRefinementPrompt","description":"Optional user feedback for content regeneration","required":false,"example":"Add more practical examples to section 2"}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key) WHERE (is_active = true)
DO UPDATE SET
  prompt_name = EXCLUDED.prompt_name,
  prompt_description = EXCLUDED.prompt_description,
  prompt_template = EXCLUDED.prompt_template,
  variables = EXCLUDED.variables,
  updated_at = now();

-- Stage 6 - Expander: Section Content Expansion (ADD outputLanguage)
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_expander',
  'Stage 6 - Expander: Section Content Expansion',
  'Expands a single section from outline into full content. Uses content archetype, depth guidance, and RAG context.',
  $prompt$<lesson_context>
  <metadata>
    <lesson_title>{{lessonTitle}}</lesson_title>
    <target_audience>{{targetAudience}}</target_audience>
    <tone>{{tone}}</tone>
    <difficulty>{{difficulty}}</difficulty>
  </metadata>

  <section_spec>
    <title>{{sectionTitle}}</title>
    <content_archetype>{{contentArchetype}}</content_archetype>
    <depth>{{depth}}</depth>
    <depth_guidance>{{depthGuidance}}</depth_guidance>
    <key_points>
{{keyPoints}}
    </key_points>
    <required_keywords>{{requiredKeywords}}</required_keywords>
    <prohibited_terms>{{prohibitedTerms}}</prohibited_terms>
  </section_spec>

  <lesson_outline>
{{lessonOutline}}
  </lesson_outline>

  {{ragContext}}
</lesson_context>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages.
</output_language>

<task>
Write the full content for the "{{sectionTitle}}" section. Requirements:

1. **Cover All Key Points**: Address each point from the specification
2. **Match Depth**: {{depthGuidance}}
3. **Content Style** ({{contentArchetype}}): Follow archetype-specific guidelines
   - code_tutorial: Include code examples with explanations
   - concept_explainer: Focus on clear explanations with analogies
   - case_study: Use narrative style with real-world scenarios
   - legal_warning: Be precise, formal, and authoritative
4. **REQUIRED: Practical Example** - Include at least 1 example in format:
   📌 **Example: [Situation Name]**
   [Specific situation with details, numbers or names (2-4 sentences)]
   Example types: case study | specific numbers/data | real-world analogy | application scenario | success/failure story
5. **Include Keywords**: Naturally incorporate: {{requiredKeywords}}
6. **Avoid Terms**: Do not use: {{prohibitedTerms}}
7. **Tone**: Maintain {{tone}} tone
8. **Audience**: Write for {{targetAudience}} level

Output as markdown. Do NOT include the section title as a header.
</task>$prompt$,
  '[{"name":"lessonTitle","description":"Lesson title","required":true},{"name":"targetAudience","description":"Target audience","required":true},{"name":"tone","description":"Content tone","required":true},{"name":"difficulty","description":"Difficulty level","required":true},{"name":"sectionTitle","description":"Section title to expand","required":true},{"name":"contentArchetype","description":"Content archetype","required":true},{"name":"depth","description":"Content depth (summary, detailed_analysis, comprehensive)","required":true},{"name":"depthGuidance","description":"Human-readable depth guidance","required":true},{"name":"keyPoints","description":"XML-formatted key points","required":true},{"name":"requiredKeywords","description":"Comma-separated required keywords","required":false},{"name":"prohibitedTerms","description":"Comma-separated prohibited terms","required":false},{"name":"lessonOutline","description":"Full lesson outline from planner","required":true},{"name":"ragContext","description":"XML-formatted RAG context","required":false},{"name":"outputLanguage","description":"Target language for all output content (e.g., \"English\", \"Russian\")","required":true,"example":"English"}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key) WHERE (is_active = true)
DO UPDATE SET
  prompt_name = EXCLUDED.prompt_name,
  prompt_description = EXCLUDED.prompt_description,
  prompt_template = EXCLUDED.prompt_template,
  variables = EXCLUDED.variables,
  updated_at = now();

-- Stage 6 - Assembler: Content Assembly (ADD outputLanguage)
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_assembler',
  'Stage 6 - Assembler: Content Assembly',
  'Assembles expanded sections into cohesive lesson with introduction, transitions, exercises, and conclusion.',
  $prompt$<lesson_context>
  <metadata>
    <title>{{lessonTitle}}</title>
    <description>{{lessonDescription}}</description>
    <difficulty>{{difficulty}}</difficulty>
    <duration_minutes>{{durationMinutes}}</duration_minutes>
    <target_audience>{{targetAudience}}</target_audience>
    <tone>{{tone}}</tone>
  </metadata>

  <introduction_blueprint>
    <hook_strategy>{{hookStrategy}}</hook_strategy>
    <hook_topic>{{hookTopic}}</hook_topic>
    <key_objectives>{{keyObjectives}}</key_objectives>
  </introduction_blueprint>

  <expanded_sections>
{{expandedSections}}
  </expanded_sections>

  <exercise_specs>
{{exerciseSpecs}}
  </exercise_specs>
</lesson_context>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages.
</output_language>

<task>
Assemble a complete lesson from the expanded sections above. You must:

1. **Write Introduction**:
   - Create a {{hookStrategy}} hook about: {{hookTopic}}
   - Preview the key learning objectives
   - Transition smoothly into the first section

2. **Assemble Sections**:
   - Include each expanded section with its title as a heading
   - Add smooth transitions between sections
   - Maintain consistent tone throughout

3. **Create Exercises**: Follow the structure templates provided

4. **Write Conclusion**:
   - Summarize key takeaways
   - Reinforce learning objectives
   - Provide next steps

Output as complete markdown lesson.
</task>$prompt$,
  '[{"name":"lessonTitle","description":"Lesson title","required":true},{"name":"lessonDescription","description":"Lesson description","required":true},{"name":"difficulty","description":"Difficulty level","required":true},{"name":"durationMinutes","description":"Duration in minutes","required":true},{"name":"targetAudience","description":"Target audience","required":true},{"name":"tone","description":"Content tone","required":true},{"name":"hookStrategy","description":"Hook strategy","required":true},{"name":"hookTopic","description":"Hook topic","required":true},{"name":"keyObjectives","description":"Key objectives summary","required":true},{"name":"expandedSections","description":"XML-formatted expanded sections","required":true},{"name":"exerciseSpecs","description":"XML-formatted exercise specifications","required":false},{"name":"outputLanguage","description":"Target language for all output content (e.g., \"English\", \"Russian\")","required":true,"example":"English"}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key) WHERE (is_active = true)
DO UPDATE SET
  prompt_name = EXCLUDED.prompt_name,
  prompt_description = EXCLUDED.prompt_description,
  prompt_template = EXCLUDED.prompt_template,
  variables = EXCLUDED.variables,
  updated_at = now();

-- Stage 6 - Smoother: Transition Refinement (ADD outputLanguage)
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_smoother',
  'Stage 6 - Smoother: Transition Refinement',
  'Polishes assembled content with improved transitions, consistent tone, and refined prose. Does NOT change structure or technical content.',
  $prompt$<lesson_context>
  <metadata>
    <title>{{lessonTitle}}</title>
    <target_audience>{{targetAudience}}</target_audience>
    <tone>{{tone}}</tone>
    <difficulty>{{difficulty}}</difficulty>
  </metadata>

  <style_requirements>
    <tone_guidance>
{{toneGuidance}}
    </tone_guidance>
    <audience_level>
{{audienceLevel}}
    </audience_level>
  </style_requirements>

  <assembled_content>
{{assembledContent}}
  </assembled_content>
</lesson_context>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages.
</output_language>

<task>
Polish and refine the lesson content above. Focus on:

1. **Transitions**: Ensure smooth flow between sections
2. **Tone Consistency**: Apply {{tone}} tone throughout
3. **Clarity**: Improve readability
4. **Engagement**: Enhance learner engagement

5. **Preserve**: Do NOT change:
   - Section structure and headings
   - Code examples and their explanations
   - Exercise content and solutions
   - Key technical information

Output the polished lesson content in full, maintaining all markdown formatting.
</task>$prompt$,
  '[{"name":"lessonTitle","description":"Lesson title","required":true},{"name":"targetAudience","description":"Target audience","required":true},{"name":"tone","description":"Content tone","required":true},{"name":"difficulty","description":"Difficulty level","required":true},{"name":"toneGuidance","description":"Specific tone guidance based on tone type","required":true},{"name":"audienceLevel","description":"Audience-level specific guidance","required":true},{"name":"assembledContent","description":"Assembled lesson content from assembler","required":true},{"name":"outputLanguage","description":"Target language for all output content (e.g., \"English\", \"Russian\")","required":true,"example":"English"}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key) WHERE (is_active = true)
DO UPDATE SET
  prompt_name = EXCLUDED.prompt_name,
  prompt_description = EXCLUDED.prompt_description,
  prompt_template = EXCLUDED.prompt_template,
  variables = EXCLUDED.variables,
  updated_at = now();

-- Stage 6 - Judge: Quality Validation (ADD outputLanguage)
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_judge',
  'Stage 6 - Judge: Quality Validation',
  'Validates lesson quality against specification. Checks completeness, accuracy, and adherence to constraints.',
  $prompt$You are a curriculum quality validator. Evaluate the lesson against its specification.

LESSON SPECIFICATION:
{{lessonSpec}}

GENERATED LESSON:
{{generatedLesson}}

<output_language>
The validation feedback (issues, strengths, suggestions) should be written in {{outputLanguage}}.
</output_language>

VALIDATION CRITERIA:
1. **Completeness**: All learning objectives covered
2. **Accuracy**: Content matches specification requirements
3. **Structure**: Follows required structure (intro, sections, exercises, conclusion)
4. **Constraints**: Adheres to required keywords, prohibited terms, depth
5. **Quality**: Clear, engaging, appropriate for target audience
6. **Language Consistency**: All content is in the specified output language ({{outputLanguage}})

OUTPUT FORMAT (JSON):
{
  "isValid": boolean,
  "overallScore": number (0.0-1.0),
  "issues": [
    {
      "severity": "critical" | "warning" | "suggestion",
      "category": string,
      "description": string
    }
  ],
  "strengths": [string],
  "suggestions": [string]
}

Be objective and constructive. Focus on specification adherence.$prompt$,
  '[{"name":"lessonSpec","description":"JSON-formatted lesson specification","required":true},{"name":"generatedLesson","description":"Generated lesson content to validate","required":true},{"name":"outputLanguage","description":"Target language for validation feedback (e.g., \"English\", \"Russian\")","required":true,"example":"English"}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key) WHERE (is_active = true)
DO UPDATE SET
  prompt_name = EXCLUDED.prompt_name,
  prompt_description = EXCLUDED.prompt_description,
  prompt_template = EXCLUDED.prompt_template,
  variables = EXCLUDED.variables,
  updated_at = now();

-- ============================================================================
-- Migration Complete
-- ============================================================================

COMMENT ON TABLE prompt_templates IS 'Contains all 18 pipeline prompts seeded from prompt-registry.ts. Stage 3: 2, Stage 4: 4, Stage 5: 2, Stage 6: 5 (updated with outputLanguage variable)';
