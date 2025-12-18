/**
 * Prompt Templates for Stage 6 Lesson Content Generation
 * Uses Context-First XML strategy for structured LLM prompts
 * @module stages/stage6-lesson-content/utils/prompt-templates
 *
 * This module provides prompt builders for each node in the lesson generation pipeline:
 * - Planner: Generates lesson outline from specification
 * - Expander: Expands sections into full content
 * - Assembler: Combines sections into cohesive lesson
 * - Smoother: Refines transitions and polish
 *
 * All prompts follow the Context-First XML strategy:
 * <lesson_context>...</lesson_context>
 * <task>...</task>
 *
 * @see specs/010-stages-456-pipeline/data-model.md
 */

import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { logger } from '@/shared/logger';
import { getRagTokenBudget } from '../../../services/global-settings-service';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Characters per token estimate (conservative for mixed Russian/English)
 */
const CHARS_PER_TOKEN = 2.5;

/**
 * Hook strategy implementation guidance for LLM prompt injection.
 * Maps each hook strategy to specific implementation instructions.
 */
const HOOK_STRATEGY_GUIDANCE: Record<string, string> = {
  analogy:
    'Start with a relatable comparison that connects unfamiliar concepts to everyday experience. ' +
    "Use the format: 'Think of X like Y...' or 'Just as... so too...'",
  statistic:
    'Lead with a surprising or impactful number or data point that grabs attention. ' +
    "Use the format: 'Did you know that X% of...?' or 'Research shows that...' or 'According to studies...'",
  challenge:
    'Present a problem, puzzle, or scenario that the learner will be able to solve after completing the lesson. ' +
    "Use the format: 'Imagine you need to...' or 'How would you...?' or 'Consider this situation...'",
  question:
    'Open with a thought-provoking rhetorical or direct question that creates curiosity. ' +
    "Use the format: 'Have you ever wondered...?' or 'What if you could...?' or 'Why do...'",
};

/**
 * Get hook strategy guidance for a given strategy type.
 * Returns empty string if strategy is unknown.
 *
 * @param strategy - Hook strategy type (analogy, statistic, challenge, question)
 * @returns Implementation guidance string
 */
function getHookStrategyGuidance(strategy: string): string {
  return HOOK_STRATEGY_GUIDANCE[strategy] || '';
}

// ============================================================================
// RAG CONTEXT FORMATTING
// ============================================================================

/**
 * Escape XML special characters in text
 *
 * @param text - Text to escape
 * @returns XML-safe text
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estimate token count from text
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Format RAG chunks as XML for prompt injection
 *
 * Creates structured XML context from RAG chunks with token budget management.
 * Truncates if total exceeds maxTokens budget.
 *
 * @param chunks - RAG chunks to format
 * @param maxTokens - Maximum token budget (default: fetched from database, fallback to 20000)
 * @returns Formatted XML string
 *
 * @example
 * ```typescript
 * const ragXml = await formatRAGContextXML(chunks, 15000);
 * // Returns:
 * // <rag_context chunks="5">
 * //   <chunk document="file.pdf" section="Chapter 1" score="0.85">
 * //     Content here...
 * //   </chunk>
 * //   ...
 * // </rag_context>
 * ```
 */
export async function formatRAGContextXML(
  chunks: RAGChunk[],
  maxTokens?: number
): Promise<string> {
  if (!chunks || chunks.length === 0) {
    const budget = maxTokens || await getRagTokenBudget();
    logger.debug({ maxTokens: budget }, 'formatRAGContextXML: No chunks provided');
    return '<rag_context chunks="0">\n  <!-- No RAG context available -->\n</rag_context>';
  }

  // Fetch dynamic token budget from database if not provided
  const effectiveMaxTokens = maxTokens !== undefined ? maxTokens : await getRagTokenBudget();

  const xmlParts: string[] = [];
  let currentTokens = 0;
  let truncated = false;

  // Reserve tokens for XML wrapper
  const wrapperOverhead = 100;
  const availableTokens = effectiveMaxTokens - wrapperOverhead;

  // Sort by relevance score (highest first)
  const sortedChunks = [...chunks].sort(
    (a, b) => b.relevance_score - a.relevance_score
  );

  for (const chunk of sortedChunks) {
    const escapedContent = escapeXml(chunk.content);
    const escapedDocument = escapeXml(chunk.document_name);
    const escapedSection = escapeXml(chunk.page_or_section || '');

    const chunkXml = `  <chunk document="${escapedDocument}" section="${escapedSection}" score="${chunk.relevance_score.toFixed(2)}">
${escapedContent}
  </chunk>`;

    const chunkTokens = estimateTokens(chunkXml);

    if (currentTokens + chunkTokens > availableTokens) {
      truncated = true;
      break;
    }

    xmlParts.push(chunkXml);
    currentTokens += chunkTokens;
  }

  const truncationNote = truncated
    ? `\n  <!-- Truncated: ${chunks.length - xmlParts.length} additional chunks omitted due to token budget -->`
    : '';

  logger.debug(
    {
      totalChunks: chunks.length,
      includedChunks: xmlParts.length,
      estimatedTokens: currentTokens,
      truncated,
    },
    'formatRAGContextXML: Formatted RAG context'
  );

  return `<rag_context chunks="${xmlParts.length}" total_available="${chunks.length}">${truncationNote}
${xmlParts.join('\n')}
</rag_context>`;
}

// ============================================================================
// PLANNER PROMPT
// ============================================================================

/**
 * Build planner prompt for outline generation
 *
 * Creates a Context-First XML prompt for generating lesson outlines.
 * Includes lesson specification, learning objectives, and RAG context.
 *
 * @param lessonSpec - Lesson specification from Stage 5
 * @param ragChunks - Retrieved RAG chunks for context
 * @returns Formatted prompt string for planner node
 *
 * @example
 * ```typescript
 * const prompt = await buildPlannerPrompt(lessonSpec, ragChunks);
 * const response = await llm.invoke(prompt);
 * ```
 */
export async function buildPlannerPrompt(
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[]
): Promise<string> {
  if (!lessonSpec) {
    logger.error({}, 'buildPlannerPrompt: lessonSpec is required');
    throw new Error('lessonSpec is required for planner prompt');
  }

  const learningObjectivesXml = lessonSpec.learning_objectives
    .map(
      (lo) =>
        `    <objective id="${escapeXml(lo.id)}" bloom_level="${lo.bloom_level}">${escapeXml(lo.objective)}</objective>`
    )
    .join('\n');

  const sectionsXml = lessonSpec.sections
    .map(
      (section, index) =>
        `    <section index="${index + 1}" archetype="${section.content_archetype}" depth="${section.constraints?.depth || 'detailed_analysis'}">
      <title>${escapeXml(section.title)}</title>
      <key_points>${(section.key_points_to_cover || []).map((p) => escapeXml(p)).join('; ')}</key_points>
    </section>`
    )
    .join('\n');

  const ragContextXml = await formatRAGContextXML(ragChunks, 15000);

  logger.debug(
    {
      lessonId: lessonSpec.lesson_id,
      objectivesCount: lessonSpec.learning_objectives.length,
      sectionsCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
    },
    'buildPlannerPrompt: Building planner prompt'
  );

  return `<lesson_context>
  <metadata>
    <lesson_id>${escapeXml(lessonSpec.lesson_id)}</lesson_id>
    <title>${escapeXml(lessonSpec.title)}</title>
    <description>${escapeXml(lessonSpec.description)}</description>
    <difficulty>${lessonSpec.difficulty_level}</difficulty>
    <duration_minutes>${lessonSpec.estimated_duration_minutes}</duration_minutes>
    <target_audience>${lessonSpec.metadata.target_audience}</target_audience>
    <tone>${lessonSpec.metadata.tone}</tone>
    <content_archetype>${lessonSpec.metadata.content_archetype}</content_archetype>
  </metadata>

  <learning_objectives>
${learningObjectivesXml}
  </learning_objectives>

  <introduction_blueprint>
    <hook_strategy>${lessonSpec.intro_blueprint.hook_strategy}</hook_strategy>
    <hook_topic>${escapeXml(lessonSpec.intro_blueprint.hook_topic)}</hook_topic>
    <key_objectives>${escapeXml(lessonSpec.intro_blueprint.key_learning_objectives)}</key_objectives>
  </introduction_blueprint>

  <sections>
${sectionsXml}
  </sections>

  ${ragContextXml}
</lesson_context>

<task>
Create a detailed lesson outline based on the specification above. The outline must:

1. **Introduction**: Plan the opening using the specified hook strategy (${lessonSpec.intro_blueprint.hook_strategy})
   - Hook Strategy Guidance: ${getHookStrategyGuidance(lessonSpec.intro_blueprint.hook_strategy)}
   - Design a ${lessonSpec.intro_blueprint.hook_strategy} hook about: ${lessonSpec.intro_blueprint.hook_topic}
   - Preview the key learning objectives

2. **Main Sections**: For each section listed above, create:
   - 3-5 key points to cover
   - Suggested examples or illustrations
   - Transition to next section

3. **Conclusion**: Plan a summary that:
   - Reinforces each learning objective
   - Provides actionable next steps

Format as markdown outline:
\`\`\`markdown
# ${lessonSpec.title}

## Introduction
- Hook: [${lessonSpec.intro_blueprint.hook_strategy}]
- Key objectives preview
- Transition

## Section 1: [Title]
### Key Points
- Point 1
- Point 2
- Point 3
### Examples
- [example]
### Transition
- [transition approach]

[Continue for all sections...]

## Conclusion
- Summary of objectives
- Call to action
\`\`\`

Target total reading time: ${lessonSpec.estimated_duration_minutes} minutes
</task>`;
}

// ============================================================================
// EXPANDER PROMPT
// ============================================================================

/**
 * Build expander prompt for section expansion
 *
 * Creates a Context-First XML prompt for expanding a single section
 * from the outline into full content.
 *
 * @param lessonSpec - Lesson specification for context
 * @param sectionTitle - Title of the section to expand
 * @param outline - Generated outline from planner
 * @param ragChunks - RAG chunks relevant to this section
 * @returns Formatted prompt string for expander node
 *
 * @example
 * ```typescript
 * const prompt = await buildExpanderPrompt(lessonSpec, 'Introduction to Types', outline, sectionChunks);
 * const content = await llm.invoke(prompt);
 * ```
 */
export async function buildExpanderPrompt(
  lessonSpec: LessonSpecificationV2,
  sectionTitle: string,
  outline: string,
  ragChunks: RAGChunk[]
): Promise<string> {
  if (!lessonSpec || !sectionTitle) {
    logger.error(
      { hasLessonSpec: !!lessonSpec, sectionTitle },
      'buildExpanderPrompt: lessonSpec and sectionTitle are required'
    );
    throw new Error('lessonSpec and sectionTitle are required for expander prompt');
  }

  // Find the section specification
  const section = lessonSpec.sections.find(
    (s: LessonSpecificationV2['sections'][0]) => s.title === sectionTitle
  );

  if (!section) {
    logger.warn(
      {
        sectionTitle,
        availableSections: lessonSpec.sections.map(
          (s: LessonSpecificationV2['sections'][0]) => s.title
        ),
      },
      'buildExpanderPrompt: Section not found in specification'
    );
  }

  const archetype = section?.content_archetype || lessonSpec.metadata.content_archetype;
  const depth = section?.constraints?.depth || 'detailed_analysis';
  const keyPoints = section?.key_points_to_cover || [];
  const requiredKeywords = section?.constraints?.required_keywords || [];
  const prohibitedTerms = section?.constraints?.prohibited_terms || [];
  const analogies = section?.analogies_to_use || '';

  const depthGuidance = {
    summary: '200-400 words - Brief overview with key concepts',
    detailed_analysis: '500-1000 words - In-depth coverage with examples',
    comprehensive: '1000+ words - Exhaustive treatment with multiple examples',
  };

  const ragContextXml = await formatRAGContextXML(ragChunks, 10000);

  logger.debug(
    {
      lessonId: lessonSpec.lesson_id,
      sectionTitle,
      archetype,
      depth,
      keyPointsCount: keyPoints.length,
      ragChunksCount: ragChunks.length,
    },
    'buildExpanderPrompt: Building expander prompt'
  );

  return `<lesson_context>
  <metadata>
    <lesson_title>${escapeXml(lessonSpec.title)}</lesson_title>
    <target_audience>${lessonSpec.metadata.target_audience}</target_audience>
    <tone>${lessonSpec.metadata.tone}</tone>
    <difficulty>${lessonSpec.difficulty_level}</difficulty>
  </metadata>

  <section_spec>
    <title>${escapeXml(sectionTitle)}</title>
    <content_archetype>${archetype}</content_archetype>
    <depth>${depth}</depth>
    <depth_guidance>${depthGuidance[depth as keyof typeof depthGuidance]}</depth_guidance>
    <key_points>
${keyPoints.map((p: string) => `      <point>${escapeXml(p)}</point>`).join('\n')}
    </key_points>
    <required_keywords>${requiredKeywords.map((k: string) => escapeXml(k)).join(', ') || 'None'}</required_keywords>
    <prohibited_terms>${prohibitedTerms.map((t: string) => escapeXml(t)).join(', ') || 'None'}</prohibited_terms>
    ${analogies ? `<analogies_to_use>${escapeXml(analogies)}</analogies_to_use>` : ''}
  </section_spec>

  <lesson_outline>
${escapeXml(outline)}
  </lesson_outline>

  ${ragContextXml}
</lesson_context>

<task>
Write the full content for the "${sectionTitle}" section. Requirements:

1. **Cover All Key Points**: Address each point from the specification
2. **Match Depth**: ${depthGuidance[depth as keyof typeof depthGuidance]}
3. **Content Style** (${archetype}):
${archetype === 'code_tutorial' ? '   - Include code examples with clear explanations\n   - Use step-by-step instructions' : ''}
${archetype === 'concept_explainer' ? '   - Focus on clear explanations\n   - Use analogies and real-world connections' : ''}
${archetype === 'case_study' ? '   - Use narrative style\n   - Include real-world scenarios and outcomes' : ''}
${archetype === 'legal_warning' ? '   - Be precise and formal\n   - Use authoritative language' : ''}
4. **Include Keywords**: Naturally incorporate: ${requiredKeywords.join(', ') || 'N/A'}
5. **Avoid Terms**: Do not use: ${prohibitedTerms.join(', ') || 'N/A'}
6. **Tone**: Maintain ${lessonSpec.metadata.tone} tone
7. **Audience**: Write for ${lessonSpec.metadata.target_audience} level

Output as markdown. Do NOT include the section title as a header.
</task>`;
}

// ============================================================================
// ASSEMBLER PROMPT
// ============================================================================

/**
 * Build assembler prompt for content assembly
 *
 * Creates a Context-First XML prompt for combining expanded sections
 * into a cohesive lesson with introduction, transitions, and exercises.
 *
 * @param lessonSpec - Lesson specification for structure
 * @param expandedSections - Map of section title to expanded content
 * @returns Formatted prompt string for assembler node
 *
 * @example
 * ```typescript
 * const prompt = buildAssemblerPrompt(lessonSpec, expandedSections);
 * const assembledContent = await llm.invoke(prompt);
 * ```
 */
export function buildAssemblerPrompt(
  lessonSpec: LessonSpecificationV2,
  expandedSections: Map<string, string>
): string {
  if (!lessonSpec) {
    logger.error({}, 'buildAssemblerPrompt: lessonSpec is required');
    throw new Error('lessonSpec is required for assembler prompt');
  }

  if (!expandedSections || expandedSections.size === 0) {
    logger.error({}, 'buildAssemblerPrompt: expandedSections is required');
    throw new Error('expandedSections is required for assembler prompt');
  }

  const sectionsXml = lessonSpec.sections
    .map((section: LessonSpecificationV2['sections'][0]) => {
      const content = expandedSections.get(section.title) || '<!-- Section content missing -->';
      return `  <section title="${escapeXml(section.title)}">
${escapeXml(content)}
  </section>`;
    })
    .join('\n\n');

  const exercisesXml =
    lessonSpec.exercises.length > 0
      ? lessonSpec.exercises
          .map(
            (ex: LessonSpecificationV2['exercises'][0], index: number) =>
              `    <exercise index="${index + 1}" type="${ex.type}" difficulty="${ex.difficulty}">
      <structure_template>${escapeXml(ex.structure_template)}</structure_template>
      <learning_objective_id>${escapeXml(ex.learning_objective_id)}</learning_objective_id>
    </exercise>`
          )
          .join('\n')
      : '    <!-- No exercises specified -->';

  logger.debug(
    {
      lessonId: lessonSpec.lesson_id,
      sectionsCount: expandedSections.size,
      exercisesCount: lessonSpec.exercises.length,
    },
    'buildAssemblerPrompt: Building assembler prompt'
  );

  return `<lesson_context>
  <metadata>
    <title>${escapeXml(lessonSpec.title)}</title>
    <description>${escapeXml(lessonSpec.description)}</description>
    <difficulty>${lessonSpec.difficulty_level}</difficulty>
    <duration_minutes>${lessonSpec.estimated_duration_minutes}</duration_minutes>
    <target_audience>${lessonSpec.metadata.target_audience}</target_audience>
    <tone>${lessonSpec.metadata.tone}</tone>
  </metadata>

  <introduction_blueprint>
    <hook_strategy>${lessonSpec.intro_blueprint.hook_strategy}</hook_strategy>
    <hook_topic>${escapeXml(lessonSpec.intro_blueprint.hook_topic)}</hook_topic>
    <key_objectives>${escapeXml(lessonSpec.intro_blueprint.key_learning_objectives)}</key_objectives>
  </introduction_blueprint>

  <expanded_sections>
${sectionsXml}
  </expanded_sections>

  <exercise_specs>
${exercisesXml}
  </exercise_specs>
</lesson_context>

<task>
Assemble a complete lesson from the expanded sections above. You must:

1. **Write Introduction**:
   - Create a ${lessonSpec.intro_blueprint.hook_strategy} hook about: ${lessonSpec.intro_blueprint.hook_topic}
   - Hook Strategy Guidance: ${getHookStrategyGuidance(lessonSpec.intro_blueprint.hook_strategy)}
   - Preview the key learning objectives: ${lessonSpec.intro_blueprint.key_learning_objectives}
   - Transition smoothly into the first section

2. **Assemble Sections**:
   - Include each expanded section with its title as a heading
   - Add smooth transitions between sections
   - Maintain consistent tone throughout

3. **Create Exercises** (${lessonSpec.exercises.length} total):
   - Follow the structure templates provided
   - Include hints and solutions
   - Match difficulty levels specified

4. **Write Conclusion**:
   - Summarize key takeaways
   - Reinforce learning objectives
   - Provide next steps or call to action

Output format:
\`\`\`markdown
# ${lessonSpec.title}

## Introduction
[Hook and objectives preview]

## [Section 1 Title]
[Section 1 content]

## [Section 2 Title]
[Section 2 content]

[Continue for all sections...]

## Exercises
[Exercises with hints and solutions]

## Summary
[Key takeaways and next steps]
\`\`\`
</task>`;
}

// ============================================================================
// SMOOTHER PROMPT
// ============================================================================

/**
 * Build smoother prompt for transition refinement
 *
 * Creates a Context-First XML prompt for polishing assembled content
 * with improved transitions, consistent tone, and refined prose.
 *
 * @param assembledContent - Assembled lesson content from assembler
 * @param lessonSpec - Lesson specification for style guidance
 * @returns Formatted prompt string for smoother node
 *
 * @example
 * ```typescript
 * const prompt = buildSmootherPrompt(assembledContent, lessonSpec);
 * const polishedContent = await llm.invoke(prompt);
 * ```
 */
export function buildSmootherPrompt(
  assembledContent: string,
  lessonSpec: LessonSpecificationV2
): string {
  if (!assembledContent) {
    logger.error({}, 'buildSmootherPrompt: assembledContent is required');
    throw new Error('assembledContent is required for smoother prompt');
  }

  if (!lessonSpec) {
    logger.error({}, 'buildSmootherPrompt: lessonSpec is required');
    throw new Error('lessonSpec is required for smoother prompt');
  }

  logger.debug(
    {
      lessonId: lessonSpec.lesson_id,
      contentLength: assembledContent.length,
      tone: lessonSpec.metadata.tone,
      audience: lessonSpec.metadata.target_audience,
    },
    'buildSmootherPrompt: Building smoother prompt'
  );

  return `<lesson_context>
  <metadata>
    <title>${escapeXml(lessonSpec.title)}</title>
    <target_audience>${lessonSpec.metadata.target_audience}</target_audience>
    <tone>${lessonSpec.metadata.tone}</tone>
    <difficulty>${lessonSpec.difficulty_level}</difficulty>
  </metadata>

  <style_requirements>
    <tone_guidance>
${lessonSpec.metadata.tone === 'formal' ? '      - Use third-person perspective\n      - Academic, structured language\n      - Avoid contractions' : '      - Use second-person perspective (you/your)\n      - Engaging, professional language\n      - Contractions are acceptable'}
    </tone_guidance>
    <audience_level>
${lessonSpec.metadata.target_audience === 'executive' ? '      - High-level, strategic focus\n      - Minimal technical jargon\n      - Business impact emphasis' : lessonSpec.metadata.target_audience === 'practitioner' ? '      - Technical, hands-on focus\n      - Industry terminology acceptable\n      - Implementation details valued' : '      - Foundational explanations\n      - Define all terminology\n      - Step-by-step guidance'}
    </audience_level>
  </style_requirements>

  <assembled_content>
${escapeXml(assembledContent)}
  </assembled_content>
</lesson_context>

<task>
Polish and refine the lesson content above. Focus on:

1. **Transitions**: Ensure smooth flow between sections
   - Add transitional phrases where abrupt
   - Connect ideas across paragraphs
   - Maintain narrative momentum

2. **Tone Consistency**: Apply ${lessonSpec.metadata.tone} tone throughout
   - Fix any tone inconsistencies
   - Adjust formality level as needed
   - Ensure audience-appropriate language

3. **Clarity**: Improve readability
   - Simplify complex sentences
   - Break up long paragraphs
   - Ensure logical flow of ideas

4. **Engagement**: Enhance learner engagement
   - Add rhetorical questions where appropriate
   - Include motivational elements
   - Strengthen conclusion impact

5. **Preserve**: Do NOT change:
   - Section structure and headings
   - Code examples and their explanations
   - Exercise content and solutions
   - Key technical information

Output the polished lesson content in full, maintaining all markdown formatting.
</task>`;
}
