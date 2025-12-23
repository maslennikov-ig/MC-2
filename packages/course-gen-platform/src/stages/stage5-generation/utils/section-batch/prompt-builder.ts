import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput } from '@megacampus/shared-types';
import { SectionWithoutInjectedFieldsSchema } from '@megacampus/shared-types/generation-result';
import { getStylePrompt } from '@megacampus/shared-types/style-prompts';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import {
  getDifficultyFromAnalysis,
  formatCourseCategoryForPrompt,
  formatPedagogicalStrategyForPrompt,
  formatPedagogicalPatternsForPrompt,
  formatGenerationGuidanceForPrompt,
} from '../analysis-formatters';
import { extractSection } from './utils';

/**
 * Build batch prompt with RT-002 prompt engineering (T021)
 */
export function buildBatchPrompt(
  input: GenerationJobInput,
  sectionIndex: number,
  qdrantClient: QdrantClient | undefined,
  attemptNumber: number
): string {
  const language = input.frontend_parameters.language || 'en';
  const style = input.frontend_parameters.style || 'conversational';
  const stylePrompt = getStylePrompt(style);

  const section = extractSection(input, sectionIndex);
  const sectionTitle = section.area || 'Untitled Section';
  const learningObjectives = section.learning_objectives || [];
  const keyTopics = section.key_topics || [];
  const estimatedLessons = section.estimated_lessons || 3;

  let prompt = `You are an expert course designer expanding section-level structure into detailed lessons.

**Course Context**:
- Course Title: ${input.frontend_parameters.course_title}
- Target Language: ${language}
- Content Style: ${stylePrompt}

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
    const patterns = formatPedagogicalPatternsForPrompt(input.analysis_result.pedagogical_patterns);
    const guidance = formatGenerationGuidanceForPrompt(input.analysis_result.generation_guidance);

    prompt += `**Analysis Context** (from Stage 4):
- Difficulty: ${difficulty}
- Category: ${category}
- Topic: ${input.analysis_result.topic_analysis.determined_topic}

**Pedagogical Strategy**:
${strategy}

**Pedagogical Patterns**:
${patterns}

**Generation Guidance**:
${guidance}

`;
  }

  const schemaDescription = zodToPromptSchema(SectionWithoutInjectedFieldsSchema);

  prompt += `**Your Task**: Expand this section into 3-5 detailed lessons.

**CRITICAL: You MUST respond with valid JSON matching this EXACT schema**:

${schemaDescription}

**Constraints**:
1. **Lesson Breakdown**: Generate ${estimatedLessons} lessons (can be 3-5 if pedagogically justified)
2. **Learning Objectives** (FR-011): Each lesson must have 1-5 SMART objectives using Bloom's taxonomy action verbs
   - FR-030: Apply ${style} style to objectives (e.g., storytelling: "explore", "discover"; academic: "analyze", "evaluate")
3. **Key Topics** (FR-011): Each lesson must have 2-10 specific key topics
   - FR-030: Frame topics in ${style} style (e.g., conversational: "Let's learn about...", professional: "Core competency:")
4. **Practical Exercises** (FR-010): Each lesson must have 3-5 exercises with descriptive exercise_type text
   - Use brief labels (10-30 chars) or detailed multi-step instructions (50-150+ chars)
   - Examples: "case study analysis", "role-play scenario", "hands-on lab", "group discussion with peer feedback"
5. **Coherence**: Lessons must follow logical progression, build on prerequisites
6. **Language**: All content in ${language}

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
: Must be array of STRINGS (NOT objects with id/text/language/cognitiveLevel)
- 
lesson_objectives
: Must be array of STRINGS (NOT objects)
- 
exercise_type
: Descriptive text (min 3 chars) explaining exercise format and activities. Be specific about interaction model and learning activities.
- 
section_number
: Integer (${sectionIndex + 1})
- 
section_title
: String ("${sectionTitle}")

**Quality Requirements**:
- Objectives: Measurable action verbs (analyze, create, implement, evaluate - NOT "understand", "know")
- Topics: Specific, concrete (NOT generic like "Introduction", "Overview")
- Exercises: Actionable with clear, detailed instructions

**Output**: Valid JSON only, no markdown, no code blocks, no explanations.
`;
  } else {
    prompt += `**CRITICAL - RETRY ATTEMPT ${attemptNumber}**: Previous attempt failed. Follow these strict rules:

1. **JSON ONLY**: No markdown, no code blocks, no explanations
2. **Valid Schema**: Match exact structure above
3. **Section/Lesson Numbers**: Use sequential integers starting from 1
4. **Enum Values**: Use exact cognitive levels (optional): remember, understand, apply, analyze, evaluate, create
5. **Array Lengths**: 1-5 learning_objectives per section, 3-5 lessons, 1-5 lesson_objectives per lesson, 3-5 practical_exercises per lesson
6. **String Lengths**: Respect min/max character limits

**Output Format**: Single JSON object starting with { and ending with }. No extra text.
`;
  }

  return prompt;
}