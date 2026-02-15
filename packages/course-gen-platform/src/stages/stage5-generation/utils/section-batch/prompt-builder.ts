import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput } from '@megacampus/shared-types';
import { SectionWithoutInjectedFieldsSchema } from '@megacampus/shared-types/generation-result';
import { getStylePrompt, DEFAULT_COURSE_STYLE } from '@megacampus/shared-types/style-prompts';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import {
  getDifficultyFromAnalysis,
  formatCourseCategoryForPrompt,
  formatPedagogicalStrategyForPrompt,
  formatGenerationGuidanceForPrompt,
} from '../analysis-formatters';
import { extractSection } from './utils';
import { buildUserContextSection } from '../prompt-helpers';

/**
 * Course constraints from Stage 4 user edits
 * These represent the user's explicit configuration for course structure
 */
export interface CourseConstraints {
  /** Total number of sections in the course (user-specified) */
  totalSections: number;
  /** Total number of lessons in the course (user-specified) */
  totalLessons: number;
  /** Current section index (0-based) */
  currentSectionIndex: number;
  /** Calculated lessons budget for this section */
  lessonsPerSectionBudget: number;
}

/**
 * Build a course structure map showing all sections and their topics.
 * Used to give each section generator awareness of the full course structure,
 * preventing content overlap between sections.
 *
 * @param input - Generation job input with analysis_result
 * @param currentSectionIndex - Index of the section being generated (0-based)
 * @returns Formatted course map string, empty if no analysis_result
 */
function buildCourseStructureMap(input: GenerationJobInput, currentSectionIndex: number): string {
  const sections = input.analysis_result?.recommended_structure?.sections_breakdown || [];
  if (sections.length === 0) return '';

  const map = sections
    .map((s, i) => {
      const marker = i === currentSectionIndex ? ' [CURRENT]' : '';
      const topics = (s.key_topics || []).join('; ') || 'None specified';
      return `  ${i + 1}. ${s.area || 'Untitled'}${marker}\n     Topics: ${topics}`;
    })
    .join('\n');

  return `**FULL COURSE STRUCTURE MAP** (${sections.length} sections total):\n${map}`;
}

/**
 * Build batch prompt with RT-002 prompt engineering (T021)
 *
 * @param input - Generation job input with course context and analysis
 * @param sectionIndex - Section index (0-based)
 * @param qdrantClient - Optional Qdrant client for RAG search
 * @param attemptNumber - Current attempt number (1-based, for retry prompts)
 * @param constraints - Optional course constraints from Stage 4 user edits
 * @returns Formatted prompt string for LLM section generation
 */
export function buildBatchPrompt(
  input: GenerationJobInput,
  sectionIndex: number,
  qdrantClient: QdrantClient | undefined,
  attemptNumber: number,
  constraints?: CourseConstraints,
  overlapFeedback?: string
): string {
  const language = input.frontend_parameters.language || 'en';
  const style = input.frontend_parameters.style || DEFAULT_COURSE_STYLE;
  const stylePrompt = getStylePrompt(style);

  const section = extractSection(input, sectionIndex);
  const sectionTitle = section.area || 'Untitled Section';
  const learningObjectives = section.learning_objectives || [];
  const keyTopics = section.key_topics || [];
  const estimatedLessons = section.estimated_lessons || 3;

  // Sanitize user-provided fields to prevent prompt injection
  const sanitize = (s: string) => s.replace(/[\n\r]+/g, ' ').trim();
  const safeTitle = sanitize(input.frontend_parameters.course_title || '');
  const safeAudience = input.frontend_parameters.target_audience
    ? sanitize(input.frontend_parameters.target_audience)
    : '';

  let prompt = `You are an expert course designer expanding section-level structure into detailed lessons.

**Course Context**:
- Course Title: ${safeTitle}
- Target Language: ${language}
- Content Style: ${stylePrompt}
${safeAudience ? `- Target Audience: ${safeAudience}` : ''}
`;

  // Add user-provided context
  const userContext = buildUserContextSection(input.frontend_parameters);
  if (userContext) {
    prompt += `\n${userContext}`;
  }

  // Add cross-section context map BEFORE "Section to Expand" for higher LLM attention weight
  const courseStructureMap = buildCourseStructureMap(input, sectionIndex);
  if (courseStructureMap) {
    const antiOverlapLang =
      language !== 'en'
        ? `\nNote: Section titles and topics above are in ${language}. Apply these rules regardless of language.`
        : '';

    prompt += `
${courseStructureMap}

**ANTI-OVERLAP RULES** (CRITICAL — failure to follow will cause rejection):
1. YOU are generating Section ${sectionIndex + 1} ONLY. Each section above has its OWN unique topic area.
2. DO NOT create lessons that cover topics assigned to OTHER sections in the course map above.
3. If a concept (e.g., KPI, dashboards) appears in YOUR section AND other sections, focus EXCLUSIVELY on the unique angle defined by YOUR section's key topics.
4. Before finalizing each lesson, verify: "Would this lesson fit better in another section?" If yes — do NOT include it here.
5. Lessons MUST be DISTINCT from all other sections' topics listed in the course map.
6. SELF-CHECK BEFORE OUTPUT: For EACH lesson you generate, verify its title and content do NOT match topics from other sections. If they do — REJECT and create a different lesson.
${antiOverlapLang}
`;

    // Inject overlap feedback from post-generation overlap detection retry
    if (overlapFeedback) {
      prompt += `\n${overlapFeedback}\n`;
    }
  }

  prompt += `
**Section to Expand** (Section ${sectionIndex + 1}):
- Section Title: ${sectionTitle}
- Learning Objectives (section-level): ${learningObjectives.join('; ')}
- Key Topics: ${keyTopics.join(', ')}
- Estimated Lessons: ${estimatedLessons}

`;

  if (input.analysis_result) {
    const difficulty = getDifficultyFromAnalysis(input.analysis_result);
    const category = formatCourseCategoryForPrompt(input.analysis_result.course_category);
    const strategy = formatPedagogicalStrategyForPrompt(input.analysis_result.pedagogical_strategy);
    const guidance = formatGenerationGuidanceForPrompt(input.analysis_result.generation_guidance);

    prompt += `**Analysis Context** (from Stage 4):
- Difficulty: ${difficulty}
- Category: ${category}
- Topic: ${input.analysis_result.topic_analysis.determined_topic}

**Pedagogical Strategy**:
${strategy}

**Generation Guidance**:
${guidance}

`;
  }

  // Add user-edited course constraints from Stage 4 (if provided)
  if (constraints) {
    prompt += `**CRITICAL COURSE CONSTRAINTS** (from Stage 4 user settings):
- Total sections: ${constraints.totalSections} (user-specified)
- Total lessons: ${constraints.totalLessons} (user-specified)
- Current section: ${constraints.currentSectionIndex + 1} of ${constraints.totalSections}
- **Target lesson count for THIS section**: ${constraints.lessonsPerSectionBudget}

**IMPORTANT**: The user explicitly configured these limits. You MUST:
1. Generate ${constraints.lessonsPerSectionBudget} lessons for this section (±1 if pedagogically justified)
2. Respect the total ${constraints.totalLessons} lessons budget across all ${constraints.totalSections} sections
3. Distribute lessons evenly unless content complexity requires adjustment

`;
  }

  const schemaDescription = zodToPromptSchema(SectionWithoutInjectedFieldsSchema);

  // Dynamic lesson guidance based on constraints
  const lessonGuidance = constraints
    ? `Generate ${constraints.lessonsPerSectionBudget} lessons (target from user settings; ±1 if content requires it)`
    : `Generate ${estimatedLessons} lessons (can be 3-5 if pedagogically justified)`;

  prompt += `**Your Task**: Expand this section into 3-5 detailed lessons.

**CRITICAL: You MUST respond with valid JSON matching this EXACT schema**:

${schemaDescription}

**Constraints**:
1. **Lesson Breakdown**: ${lessonGuidance}
2. **Learning Objectives** (FR-011): Each lesson must have 1-5 SMART objectives using Bloom's taxonomy action verbs
   - FR-030: Apply ${style} style to objectives (e.g., storytelling: "explore", "discover"; academic: "analyze", "evaluate")
3. **Key Topics** (FR-011): Each lesson must have 2-10 specific key topics
   - FR-030: Frame topics in ${style} style (e.g., conversational: "Let's learn about...", professional: "Core competency:")
4. **Coherence**: Lessons must follow logical progression, build on prerequisites
6. **Language**: All content in ${language}

**CRITICAL - FORBIDDEN PATTERNS** (will cause automatic rejection):
- NO placeholders like [название], [описание], [текст], [insert X here], [TBD]
- NO incomplete text or TODO markers
- ALL fields must contain REAL, COMPLETE content in ${language}

**NOTE**: Duration fields are managed by the system and not part of the schema you need to generate.

`;

  if (qdrantClient) {
    prompt += `**RAG Search Tool Available**: You have access to search uploaded documents.
- Use SPARINGLY - only for exact formulas, legal text, code examples, or domain-specific facts
- Do NOT query for generic concepts or creative elaboration
- Example queries: "Python asyncio syntax", "GDPR Article 6", "React useState hook"

`;
  }

  if (attemptNumber === 1) {
    prompt += `**Output Format**: Valid JSON matching the schema above (1 section with 3-5 lessons).

**CRITICAL Field Type Requirements** (common mistakes to avoid):
-
learning_objectives
: REQUIRED, array of STRINGS (NOT objects with id/text/language)
-
lesson_objectives
: REQUIRED for EVERY lesson, array of 1-5 STRINGS (NOT objects). Each string 10-600 chars.
-
section_number
: Integer (${sectionIndex + 1})
-
section_title
: String ("${sectionTitle}")

**Quality Requirements**:
- Objectives: Measurable action verbs (analyze, create, implement, evaluate - NOT "understand", "know")
- Topics: Specific, concrete (NOT generic like "Introduction", "Overview")

**Output**: Valid JSON only, no markdown, no code blocks, no explanations.
`;
  } else {
    prompt += `**CRITICAL - RETRY ATTEMPT ${attemptNumber}**: Previous attempt failed. Follow these strict rules:

1. **JSON ONLY**: No markdown, no code blocks, no explanations
2. **Valid Schema**: Match exact structure above
3. **Section/Lesson Numbers**: Use sequential integers starting from 1
4. **Enum Values**: Use exact cognitive levels (optional): remember, understand, apply, analyze, evaluate, create
5. **Array Lengths**: 1-5 learning_objectives per section, 3-5 lessons, 1-5 lesson_objectives per lesson
6. **String Lengths**: Respect min/max character limits

**Output Format**: Single JSON object starting with { and ending with }. No extra text.
`;
  }

  return prompt;
}
