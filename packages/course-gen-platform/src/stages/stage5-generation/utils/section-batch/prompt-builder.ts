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
import { createPromptService } from '@/shared/prompts/prompt-service';

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
 * Uses PromptService for database-backed editable prompts
 *
 * @param input - Generation job input with course context and analysis
 * @param sectionIndex - Section index (0-based)
 * @param qdrantClient - Optional Qdrant client for RAG search
 * @param attemptNumber - Current attempt number (1-based, for retry prompts)
 * @param constraints - Optional course constraints from Stage 4 user edits
 * @returns Formatted prompt string for LLM section generation
 */
export async function buildBatchPrompt(
  input: GenerationJobInput,
  sectionIndex: number,
  qdrantClient: QdrantClient | undefined,
  attemptNumber: number,
  constraints?: CourseConstraints,
  overlapFeedback?: string,
  previousSectionsDigest?: string
): Promise<string> {
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

  // Pre-assemble all template variables
  const targetAudienceLine = safeAudience ? `- Target Audience: ${safeAudience}` : '';

  // Add user-provided context
  const userContext = buildUserContextSection(input.frontend_parameters) || '';

  // Add cross-section context map BEFORE "Section to Expand" for higher LLM attention weight
  const courseStructureMap = buildCourseStructureMap(input, sectionIndex);
  let courseStructureMapSection = '';
  if (courseStructureMap) {
    const antiOverlapLang =
      language !== 'en'
        ? `\nNote: Section titles and topics above are in ${language}. Apply these rules regardless of language.`
        : '';

    courseStructureMapSection = `
${courseStructureMap}

**SECTION FOCUS RULES**:
1. Generate lessons exclusively for Section ${sectionIndex + 1}. Each section in the course map owns its own unique topic area.
2. When a concept appears in multiple sections, focus on the specific angle defined by THIS section's key topics.
3. Before finalizing, verify each lesson belongs here and not in another section listed above.
${antiOverlapLang}`;

    // Inject overlap feedback from post-generation overlap detection retry
    if (overlapFeedback) {
      courseStructureMapSection += `\n${overlapFeedback}`;
    }

    // Add trailing newline for proper spacing
    courseStructureMapSection += '\n';
  }

  // Inject digest of previously generated sections for concrete-level anti-duplication
  let previousSectionsDigestSection = '';
  if (previousSectionsDigest) {
    previousSectionsDigestSection = `
**PREVIOUSLY GENERATED SECTIONS** (DO NOT repeat these lesson topics):
${previousSectionsDigest}
`;
  }

  // Build analysis context block
  let analysisContext = '';
  if (input.analysis_result) {
    const difficulty = getDifficultyFromAnalysis(input.analysis_result);
    const category = formatCourseCategoryForPrompt(input.analysis_result.course_category);
    const strategy = formatPedagogicalStrategyForPrompt(input.analysis_result.pedagogical_strategy);
    const guidance = formatGenerationGuidanceForPrompt(input.analysis_result.generation_guidance);

    analysisContext = `**Analysis Context** (from Stage 4):
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
  let constraintsSection = '';
  if (constraints) {
    constraintsSection = `**Course Structure** (from Stage 4):
- Course: ${constraints.totalSections} sections, ${constraints.totalLessons} total lessons
- This section: ${constraints.currentSectionIndex + 1} of ${constraints.totalSections}
- Target: ${constraints.lessonsPerSectionBudget} lessons for this section (±1 if pedagogically justified)

`;
  }

  const schemaDescription = zodToPromptSchema(SectionWithoutInjectedFieldsSchema);

  // Dynamic lesson guidance based on constraints
  const lessonGuidance = constraints
    ? `Generate ${constraints.lessonsPerSectionBudget} lessons (target from user settings; ±1 if content requires it)`
    : `Generate ${estimatedLessons} lessons (can be 3-5 if pedagogically justified)`;

  // RAG tool info
  let ragToolInfo = '';
  if (qdrantClient) {
    ragToolInfo = `**RAG Search Tool Available**: You have access to search uploaded documents.
- Use SPARINGLY - only for exact formulas, legal text, code examples, or domain-specific facts
- Do NOT query for generic concepts or creative elaboration
- Example queries: "Python asyncio syntax", "GDPR Article 6", "React useState hook"

`;
  }

  // Output format (attempt 1 vs retry)
  let outputFormat = '';
  if (attemptNumber === 1) {
    outputFormat = `**Output Format**: Valid JSON matching the schema above (1 section with 3-5 lessons).

**Field Type Requirements**:
- learning_objectives: array of STRINGS, 1-5 items (each string, not object with id/text/language)
- lesson_objectives: array of 1-5 STRINGS per lesson (each string 10-600 chars)
- section_number: Integer (${sectionIndex + 1})
- section_title: String ("${sectionTitle}")

**Output**: Valid JSON only, no markdown, no code blocks, no explanations.
`;
  } else {
    outputFormat = `**CRITICAL - RETRY ATTEMPT ${attemptNumber}**: Previous attempt failed. Follow these strict rules:

1. **JSON ONLY**: No markdown, no code blocks, no explanations
2. **Valid Schema**: Match exact structure above
3. **Section/Lesson Numbers**: Use sequential integers starting from 1
4. **Enum Values**: Use exact cognitive levels (optional): remember, understand, apply, analyze, evaluate, create
5. **Array Lengths**: 1-5 learning_objectives per section, 3-5 lessons, 1-5 lesson_objectives per lesson
6. **String Lengths**: Respect min/max character limits

**Output Format**: Single JSON object starting with { and ending with }. No extra text.
`;
  }

  // Render prompt using PromptService
  const promptService = createPromptService();
  return promptService.renderPrompt('stage5_batch_section_generator', {
    courseTitle: safeTitle,
    language,
    stylePrompt,
    style,
    targetAudienceLine,
    userContext,
    courseStructureMapSection,
    previousSectionsDigestSection,
    sectionNumber: String(sectionIndex + 1),
    sectionTitle,
    learningObjectives: learningObjectives.join('; '),
    keyTopics: keyTopics.join(', '),
    estimatedLessons: String(estimatedLessons),
    analysisContext,
    constraintsSection,
    schemaDescription,
    lessonGuidance,
    ragToolInfo,
    outputFormat,
  });
}
