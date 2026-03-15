import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Phase1Output } from '@megacampus/shared-types/analysis-result';
import type { Stage4BudgetAllocation } from '../stage4-budget-allocator.js';
import { SYSTEM_PROMPT_RESERVE } from '../stage4-budget-allocator.js';
import type { Phase05Input } from './types.js';
import { truncateContent } from './utils.js';

export const SUFFICIENCY_SYSTEM_PROMPT = `You are an expert course designer evaluating whether enough information has been gathered to create a high-quality course.

Analyze the user's answers to clarifying questions and determine if the information is SUFFICIENT to proceed with course design.

CRITICAL RULES:
1. Respond with valid JSON matching this schema:
{
  "is_sufficient": boolean,
  "confidence": number (0-1),
  "gaps": ["string array of identified information gaps"],
  "follow_up_questions": [
    {
      "question_text": "string (10-500 chars)",
      "question_type": "open|single_choice|multi_choice",
      "question_priority": "critical|important|nice_to_have",
      "question_category": "company_context|audience|expected_outcomes|content_structure|focus_priorities|business_goals|practical_application|constraints",
      "suggested_answers": [{ "text": "string", "rationale": "string", "is_recommended": boolean }]
    }
  ]
}

2. Set is_sufficient=true if you have enough information to design a comprehensive course
3. Set is_sufficient=false if there are SIGNIFICANT gaps that would lead to poor course quality
4. If not sufficient, generate follow_up_questions targeting the specific gaps
5. Be pragmatic — minor gaps are OK. Focus on information that would MATERIALLY change the course design`;

/**
 * Build condensed context from budget allocation and document content.
 *
 * Creates a compact summary of document context for prompt injection.
 * Includes actual document text (already budget-resolved by allocator) with safety truncation
 * to prevent extreme cases from breaking the LLM context.
 *
 * @param budgetAllocation - Stage 4 budget allocation result (nullable when no documents)
 * @param documentSummaries - Document content from Stage 3 (reused from orchestrator)
 * @returns Condensed context string
 */
export function buildCondensedContext(
  budgetAllocation: Stage4BudgetAllocation | null,
  documentSummaries?: Array<{ file_name: string; processed_content: string }>
): string {
  // Handle case when no documents were uploaded
  if (!budgetAllocation) {
    return 'No documents provided. Course will be generated based on title and description only.';
  }

  const { documents, breakdown } = budgetAllocation;

  const contextParts: string[] = [];

  // Summary of document coverage
  contextParts.push(`Documents Available: ${documents.length} total`);
  contextParts.push(
    `- CORE: ${breakdown.core.count} document (${breakdown.core.tokens} tokens, full text)`
  );
  contextParts.push(
    `- IMPORTANT: ${breakdown.important.count} documents (${breakdown.important.fullTextCount} full text, ${breakdown.important.summaryCount} summaries)`
  );
  contextParts.push(`- SUPPLEMENTARY: ${breakdown.supplementary.count} documents (summaries only)`);

  // Actual document content (use per-document content as-is, already budget-resolved by allocator)
  // Safety truncation: derive limits from budget allocator's model context window
  if (documentSummaries && documentSummaries.length > 0) {
    // Reserve tokens for: system prompt (~2K) + human prompt template (~500) + expected output (~5K) + safety margin
    const PHASE_05_PROMPT_OUTPUT_RESERVE = SYSTEM_PROMPT_RESERVE + 5_000;
    const modelMaxContext = budgetAllocation?.modelSelection?.maxContext ?? 260_000;
    const SAFETY_MAX_TOTAL_TOKENS = Math.max(
      modelMaxContext - PHASE_05_PROMPT_OUTPUT_RESERVE,
      50_000
    );
    const SAFETY_MAX_TOKENS_PER_DOC = Math.min(100_000, SAFETY_MAX_TOTAL_TOKENS);
    let totalTokensUsed = 0;
    contextParts.push('\nDOCUMENT CONTENTS:');
    for (const doc of documentSummaries) {
      const availableTokens = Math.min(
        SAFETY_MAX_TOKENS_PER_DOC,
        SAFETY_MAX_TOTAL_TOKENS - totalTokensUsed
      );
      if (availableTokens <= 0) {
        contextParts.push(
          `\n[TRUNCATED] Remaining documents omitted — total context limit (${SAFETY_MAX_TOTAL_TOKENS} tokens) reached.`
        );
        break;
      }
      const truncated = truncateContent(doc.processed_content, availableTokens);
      contextParts.push(`\n[${doc.file_name}]\n${truncated}`);
      // Estimate tokens used (same heuristic as truncateContent: 1 token ≈ 4 chars)
      totalTokensUsed += Math.ceil(truncated.length / 4);
    }
  }

  return contextParts.join('\n');
}

/**
 * Build preliminary analysis context from Phase 1 output
 * Provides data-driven context for smarter question generation
 */
export function buildPhase1Context(phase1Output: Phase1Output): string {
  const { course_category, topic_analysis } = phase1Output;

  const parts: string[] = [];
  parts.push('PRELIMINARY ANALYSIS (from Phase 1 Classification):');
  parts.push(
    `- Course Category: ${course_category.primary} (confidence: ${(course_category.confidence * 100).toFixed(0)}%)`
  );
  parts.push(`- Topic Complexity: ${topic_analysis.complexity}`);
  parts.push(`- Information Completeness: ${topic_analysis.information_completeness}%`);

  if (topic_analysis.key_concepts.length > 0) {
    parts.push(`- Key Concepts Already Identified: ${topic_analysis.key_concepts.join(', ')}`);
  }

  if (
    Array.isArray(topic_analysis.missing_elements) &&
    topic_analysis.missing_elements.length > 0
  ) {
    parts.push(
      `- MISSING ELEMENTS (prioritize questions about these): ${topic_analysis.missing_elements.join(', ')}`
    );
  }

  // Priority guidance based on completeness
  const completeness = topic_analysis.information_completeness;
  if (completeness < 50) {
    parts.push(
      '\nPRIORITY GUIDANCE: Information completeness is LOW (<50%). Focus on CRITICAL questions that fill major knowledge gaps. Be thorough — cover all 8 category blocks with detailed questions.'
    );
  } else if (completeness < 80) {
    parts.push(
      '\nPRIORITY GUIDANCE: Information completeness is MODERATE (50-80%). Balance IMPORTANT questions across all category blocks. Ask targeted follow-ups where gaps exist.'
    );
  } else {
    parts.push(
      '\nPRIORITY GUIDANCE: Information completeness is HIGH (>80%). Focus on NICE_TO_HAVE refinement questions. Still ensure each category block has at least one question.'
    );
  }

  return parts.join('\n');
}

/**
 * Build prompt for clarifying questions generation
 *
 * Uses prompt template from database (prompt_templates table, key: stage_4/clarifying_questions)
 * Implements variable substitution with Handlebars-style syntax.
 *
 * @param input - Phase 0.5 input data
 * @returns Prompt messages for LLM
 */
export function buildClarifyingPrompt(input: Phase05Input): [SystemMessage, HumanMessage] {
  const { courseContext, language, budgetAllocation, document_summaries, phase1_output } = input;

  // Build condensed context from budget allocation + document content
  const condensedContext = buildCondensedContext(budgetAllocation, document_summaries);

  // System message with role and constraints
  const systemMessage = new SystemMessage(
    `You are an expert course designer helping to create a tailored learning experience.

Your task is to generate clarifying questions that will help improve the course design based on the provided context.

PLATFORM: MegaCampus is an online course platform. Courses are always text-based lessons with optional enrichments (quiz, audio, video, presentation). The delivery format is fixed — do not ask about it.

CRITICAL RULES:
1. ALL output MUST be in ${language.toUpperCase()} (the course target language)
2. You MUST respond with valid JSON matching this EXACT schema:

{
  "questions": [
    {
      "question_text": "string (10-500 chars)",
      "question_type": "open|single_choice|multi_choice",
      "question_priority": "critical|important|nice_to_have",
      "question_category": "company_context|audience|expected_outcomes|content_structure|focus_priorities|business_goals|practical_application|constraints",
      "suggested_answers": [
        { "text": "string (5-500 chars)", "rationale": "string (10-300 chars)", "is_recommended": boolean }
      ]
    }
  ]
}

3. Generate as many questions as needed for complete understanding of the course requirements. Minimum 1 question per category block. No artificial upper limits — thoroughness is more important than brevity
4. QUESTION TYPES - choose the optimal type for each question:
   - "open": When answer requires free-form text (e.g., specific goals, unique requirements)
     * MUST mark exactly ONE answer as "is_recommended": true
     * 2-3 suggested answers as starting points
   - "single_choice": When user must choose ONE option (e.g., difficulty level, format preference)
     * First answer = recommended option
     * 2-4 mutually exclusive options
   - "multi_choice": When user can select MULTIPLE options (e.g., topics to cover, features to include)
     * Mark recommended options with "is_recommended": true
     * 3-6 options that can be combined

   QUESTION TYPE SELECTION RULES:
   - Use "single_choice" when options are MUTUALLY EXCLUSIVE:
     * "What difficulty level?" (only one level possible)
     * "What format is preferred?" (one format)
     * "What language for the course?" (one language)
   - Use "multi_choice" when user can SELECT MULTIPLE:
     * "What topics to include?" (multiple topics)
     * "What metrics are important?" (multiple metrics)
     * "What tools to use?" (multiple tools)
     * HINT: If question uses plural form ("какие", "which ones", "welche") → multi_choice
   - Use "open" when answer requires FREE TEXT:
     * "Describe the target audience"
     * "What are the specific learning goals?"
5. Prioritize questions as:
   - critical: Must be answered for quality course (e.g., target skill level, key outcomes)
   - important: Will significantly improve course (e.g., preferred learning style, time constraints)
   - nice_to_have: Optional enhancements (e.g., specific tools/technologies preferences)
6. Focus on questions that cannot be inferred from the provided context
7. Avoid generic questions - be specific to this course topic
8. **MANDATORY COVERAGE**: Generate at least 1 question for EACH of the 8 category blocks:
   - company_context: Company description, industry, size, culture, existing training programs
   - audience: Target audience, roles, experience level, pain points, learning preferences
   - expected_outcomes: Measurable skills, competencies, certifications after course completion
   - content_structure: Required topics, modules, theses, case studies, depth of coverage
   - focus_priorities: Key competencies, emphasis areas, critical skills to develop
   - business_goals: ROI expectations, performance metrics, business objectives alignment
   - practical_application: Exercises, projects, real-world scenarios, hands-on activities
   - constraints: Time limits, budget, compliance requirements, technical limitations
9. Adjust question depth based on information completeness — ask more detailed questions where information gaps exist
10. Ensure questions from different categories get diverse priorities (not all critical)`
  );

  // Build Phase 1 context if available
  const phase1Context = phase1_output ? buildPhase1Context(phase1_output) : '';

  // Human message with course context
  const humanMessage = new HumanMessage(
    `COURSE CONTEXT:
Title: ${courseContext.title}
${courseContext.description ? `Description: ${courseContext.description}` : ''}
Target Audience: ${courseContext.target_audience || 'mixed'}
Language: ${language.toUpperCase()}
${phase1Context ? `\n${phase1Context}\n` : ''}
DOCUMENT CONTEXT (condensed):
${condensedContext}

TASK:
Generate comprehensive clarifying questions covering ALL 8 category blocks to fully understand the course requirements.
${phase1_output ? 'Use the PRELIMINARY ANALYSIS above to ask targeted questions about identified gaps and missing elements.' : ''}
Each category block (company_context, audience, expected_outcomes, content_structure, focus_priorities, business_goals, practical_application, constraints) MUST have at least 1 question.
Output MUST be valid JSON with all text fields in ${language.toUpperCase()}.`
  );

  return [systemMessage, humanMessage];
}
