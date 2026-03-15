import type { HardcodedPrompt } from '../types.js';

export const expanderPrompt: HardcodedPrompt = {
  stage: 'stage_6',
  promptKey: 'stage6_expander',
  promptName: 'Stage 6 - Expander: Section Content Expansion [DEPRECATED]',
  promptDescription:
    '[DEPRECATED - Stage 6 refactored from 6-node to 3-node pipeline] Expands a single section from outline into full content. Uses content archetype, depth guidance, RAG context, and visual toolkit for engaging content.',
  promptTemplate: `<lesson_context>
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

  <reference_material>
  {{ragContext}}
  </reference_material>
</lesson_context>

<visual_toolkit>
**VISUAL ELEMENTS** — Use actively to create engaging, professional content:

1. **Mermaid Diagrams** — For processes, flows, relationships:
   \`\`\`mermaid
   flowchart TD
     A[Input] --> B{Decision}
     B -->|Yes| C[Result]
     B -->|No| D[Alternative]
   \`\`\`
   Types: flowchart TD/LR, sequenceDiagram, mindmap, pie, timeline

   CRITICAL MERMAID RULES:
   - NEVER use escaped quotes inside node labels: BAD: A[Text \\"quote\\" here]
   - Keep node labels simple and quote-free: GOOD: A[Простой текст]
   - For special characters use entity codes: A[Text #quot;quote#quot; here]

2. **Math Formulas** (LaTeX):
   - Inline: \`$E=mc^2$\` within text
   - Block: \`$$\\sum_{i=1}^{n} x_i$$\` centered on own line
   - Use \\boxed{} for key formulas: \`$$\\boxed{F = ma}$$\`

3. **Callouts** — For tips, warnings, key insights:
   > [!TIP]
   > Best practice or recommendation

   > [!WARNING]
   > Important caution

   > [!NOTE]
   > Key concept to remember

   Types: NOTE, TIP, WARNING, DANGER, INFO
   CRITICAL: Callout marker must start immediately after >. NEVER wrap in quotes.
   WRONG: > "[!TIP] text"    CORRECT: > [!TIP]

4. **Rich Code Blocks**:
   \`\`\`typescript filename="example.ts" {2,4-6}
   // Line highlighting draws attention
   \`\`\`

5. **Tables** — For comparisons, structured data
   Tables must be standalone blocks — NEVER place markdown tables inside numbered or bulleted lists.

*Syntax keywords (mermaid, filename, [!TIP]) stay in English regardless of output language.*
</visual_toolkit>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages (except code/syntax keywords).
</output_language>

<task>
Write the full content for the "{{sectionTitle}}" section. Requirements:

1. **Cover All Key Points**: Address each point from the specification
2. **Match Depth**: {{depthGuidance}}

3. **Content & Visual Style** ({{contentArchetype}}):
   - *code_tutorial*: Step-by-step with Rich Code blocks (filename REQUIRED). Use flowchart for architecture overview.
   - *concept_explainer*: Clear analogies. USE Mermaid for processes/relationships, Math for formulas, [!TIP] for insights.
   - *case_study*: Narrative with Tables for comparisons, [!INFO] for key takeaways, timeline diagrams if applicable.
   - *legal_warning*: Precise, authoritative. USE [!WARNING]/[!DANGER] for critical points. Minimal decorative visuals.

4. **REQUIRED: Visual Enhancement** — Each section SHOULD include at least one:
   - Diagram (flowchart, sequence, or mindmap) for processes/flows
   - Table for comparisons or structured data
   - Callout for key insight or warning
   - Code block with filename for technical content

5. **REQUIRED: Practical Example** — Use callout format:
   > [!INFO]
   > **Example: [Situation Name]**
   > [Specific situation with concrete details, numbers, or names (2-4 sentences)]

6. **Include Keywords**: Naturally incorporate: {{requiredKeywords}}
7. **Avoid Terms**: Do not use: {{prohibitedTerms}}
8. **Tone**: Maintain {{tone}} tone
9. **Audience**: Write for {{targetAudience}} level

Output as markdown. Do NOT include the section title as a header.
</task>`,
  variables: [
    {
      name: 'lessonTitle',
      description: 'Lesson title',
      required: true,
    },
    {
      name: 'targetAudience',
      description: 'Target audience',
      required: true,
    },
    {
      name: 'tone',
      description: 'Content tone',
      required: true,
    },
    {
      name: 'difficulty',
      description: 'Difficulty level',
      required: true,
    },
    {
      name: 'sectionTitle',
      description: 'Section title to expand',
      required: true,
    },
    {
      name: 'contentArchetype',
      description: 'Content archetype',
      required: true,
    },
    {
      name: 'depth',
      description: 'Content depth (summary, detailed_analysis, comprehensive)',
      required: true,
    },
    {
      name: 'depthGuidance',
      description: 'Human-readable depth guidance',
      required: true,
    },
    {
      name: 'keyPoints',
      description: 'XML-formatted key points',
      required: true,
    },
    {
      name: 'requiredKeywords',
      description: 'Comma-separated required keywords',
      required: false,
    },
    {
      name: 'prohibitedTerms',
      description: 'Comma-separated prohibited terms',
      required: false,
    },
    {
      name: 'lessonOutline',
      description: 'Full lesson outline from planner',
      required: true,
    },
    {
      name: 'ragContext',
      description: 'XML-formatted RAG context',
      required: false,
    },
    {
      name: 'outputLanguage',
      description: 'Target language for all output content (e.g., "English", "Russian")',
      required: true,
      example: 'English',
    },
  ],
};
