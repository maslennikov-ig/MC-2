/**
 * Phase 6: RAG Planning Service
 *
 * Generates document-to-section relevance mapping for RAG-based lesson generation.
 * Uses database-configured model (lightweight mapping task) with English-only output.
 *
 * Core Tasks:
 * 1. Map documents to relevant sections (primary_documents per section)
 * 2. Generate key search terms for RAG queries (3-10 terms per section)
 * 3. Identify expected topics in each document (2-8 topics)
 * 4. Determine document processing method (full_text vs hierarchical)
 *
 * Critical Purpose: Enables T022 SMART mode (45x cost savings vs Planning LLM call)
 * - Pre-maps documents to sections during analysis (Stage 4)
 * - Generation (Stage 5) uses mapping to skip Planning LLM entirely
 * - Only queries relevant documents per section (targeted RAG)
 *
 * Model: Configured via database (llm_model_config table)
 * Output Language: Always English (regardless of input language)
 * Quality: Semantic similarity validation with 0.75 threshold
 *
 * @module phase-6-rag-planning
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
// JsonOutputParser removed - using manual parsing with auto-repair
import { getModelForPhase } from '@/shared/llm/langchain-models';
import { trackPhaseExecution, storeTraceData } from '../utils/observability';
import type { SectionBreakdown } from '@megacampus/shared-types/analysis-result';
import { safeJSONParse } from '@/shared/utils/json-repair';
import { fixFieldNames } from '../utils/field-name-fix';

/**
 * Input data for Phase 6 RAG Planning
 */
export interface Phase6Input {
  /** Course UUID */
  course_id: string;
  /** Input language (ISO 639-1) - for context only, output is always English */
  language: string;
  /** Sections breakdown from Phase 2 */
  sections_breakdown: SectionBreakdown[];
  /** Optional processed document summaries from Stage 3 */
  document_summaries: Array<{
    document_id: string;
    file_name: string;
    processed_content: string; // Summary or full text from Stage 3
    priority?: 'HIGH' | 'LOW'; // If available from document classification
    token_count?: number;
  }> | null;
}

/**
 * Section RAG Plan - per section mapping (v0.20.0+)
 *
 * Confidence Rules (from data-model.md):
 * - 'high': All primary_documents have processing_mode='full_text'
 * - 'medium': Any primary_document has processing_mode='summary'
 */
export interface SectionRAGPlan {
  primary_documents: string[]; // file_catalog IDs ranked by relevance
  search_queries: string[]; // 3-10 queries for RAG retrieval
  expected_topics: string[]; // 2-8 topics to find in chunks
  confidence: 'high' | 'medium'; // Based on processing_mode
  note?: string; // Guidance for Generation
  // Legacy fields for backward compatibility (deprecated)
  key_search_terms?: string[]; // Use search_queries instead
  document_processing_methods?: {
    [document_id: string]: 'full_text' | 'hierarchical';
  };
}

/**
 * Phase 6 output: Document relevance mapping for RAG
 */
export interface Phase6Output {
  document_relevance_mapping: {
    [section_id: string]: SectionRAGPlan;
  };
  phase_metadata: {
    duration_ms: number;
    model_used: string;
    tokens: { input: number; output: number; total: number };
    quality_score: number; // 0 initially, updated after semantic validation
    retry_count: number;
  };
}

/**
 * Builds the RAG planning prompt for Phase 6
 *
 * @param input - Phase 6 input data
 * @returns Formatted prompt messages for LLM
 */
function buildPhase6Prompt(input: Phase6Input): [SystemMessage, HumanMessage] {
  // Determine output language based on course language
  const outputLanguage = input.language === 'en' ? 'English' : input.language === 'ru' ? 'Russian' : input.language;

  const systemMessage = new SystemMessage(`You are an expert curriculum architect specializing in RAG (Retrieval-Augmented Generation) optimization.

Your task is to analyze course sections and available documents to create an optimal document-to-section mapping for efficient content generation.

CRITICAL RULES:
1. ALL output MUST be in ${outputLanguage.toUpperCase()} (the course target language is ${outputLanguage})
2. Respond ONLY with valid JSON (no markdown, no explanations)
3. Map documents to sections based on topic relevance
4. Generate 3-10 search queries per section for RAG retrieval
5. Identify 2-8 expected topics covered in relevant documents
6. Determine confidence level based on document processing mode:
   - 'high': All primary_documents are small (<5K tokens) and will use full_text mode
   - 'medium': Any primary_document is large (>5K tokens) and will use summary/hierarchical mode
7. Optionally add a note with specific guidance for the Generation phase

PURPOSE OF THIS MAPPING:
- Enables SMART mode in Generation (Stage 5) - saves 45x cost vs Planning LLM
- Pre-maps documents during Analysis (no runtime LLM cost)
- Generation queries only relevant documents per section (targeted RAG)
- Search queries optimize vector similarity matching
- Confidence level helps Generation decide retrieval strategy

OUTPUT FORMAT (JSON):
{
  "document_relevance_mapping": {
    "1": {
      "primary_documents": ["file_uuid_1", "file_uuid_2"],
      "search_queries": ["what is concept1", "how to apply concept2", "concept3 examples"],
      "expected_topics": ["topic1", "topic2"],
      "confidence": "high",
      "note": "Focus on practical examples from document 1"
    },
    "2": {
      "primary_documents": ["file_uuid_1"],
      "search_queries": ["advanced technique1", "implementing advanced_concept1"],
      "expected_topics": ["topic3"],
      "confidence": "medium",
      "note": "Large document - may need chunked retrieval"
    }
  }
}`);

  /**
   * Truncates document content to stay within token budget
   *
   * @param content - Document processed_content string
   * @param maxTokens - Maximum tokens to allow
   * @returns Truncated content with note if truncated
   */
  function truncateContent(content: string, maxTokens: number): string {
    const estimatedTokens = Math.ceil(content.length / 4);

    if (estimatedTokens <= maxTokens) {
      return content;
    }

    const maxChars = maxTokens * 4;
    const truncated = content.substring(0, maxChars);

    return `${truncated}\n[... Truncated from ${estimatedTokens} to ${maxTokens} tokens ...]`;
  }

  // Build document summaries context
  let documentContext = '';
  if (input.document_summaries && input.document_summaries.length > 0) {
    const documentCount = input.document_summaries.length;
    const tokensPerDocument = Math.floor(25000 / documentCount); // ~25K tokens total budget

    documentContext = '\n\nAVAILABLE DOCUMENTS:\n';
    documentContext += input.document_summaries
      .map((doc) => {
        const priorityLabel = doc.priority ? ` [Priority: ${doc.priority}]` : '';
        const tokenLabel = doc.token_count ? ` [~${doc.token_count} tokens]` : '';
        return `- Document ID: ${doc.document_id}
  Filename: ${doc.file_name}${priorityLabel}${tokenLabel}
  Content Preview: ${truncateContent(doc.processed_content, tokensPerDocument)}`;
      })
      .join('\n\n');
  }

  // Build sections context and collect valid section IDs
  const validSectionIds: string[] = [];
  const sectionsContext = input.sections_breakdown
    .map((section, index) => {
      const sectionId = section.section_id || String(index + 1);
      validSectionIds.push(sectionId);
      return `- Section ${sectionId}: ${section.area}
  Key Topics: ${section.key_topics.join(', ')}
  Learning Objectives: ${section.learning_objectives.join('; ')}`;
    })
    .join('\n\n');

  const humanMessage = new HumanMessage(`COURSE SECTIONS:
${sectionsContext}${documentContext}

VALID SECTION IDS: [${validSectionIds.map(id => `"${id}"`).join(', ')}]
CRITICAL: You MUST use ONLY these section IDs as keys in document_relevance_mapping.
Do NOT create mappings for section IDs that are not in this list.
Total sections: ${validSectionIds.length}

TASK:
1. For each section, identify which documents are most relevant (primary_documents), ranked by relevance
2. Generate 3-10 search queries for RAG retrieval (queries that will find relevant content chunks)
3. Identify 2-8 expected topics to find in the chunks
4. Determine confidence level:
   - 'high': All primary_documents are small (<5K tokens) and can use full_text mode
   - 'medium': Any primary_document is large (≥5K tokens) and requires summary/chunked mode
5. Optionally add a note with specific guidance for content generation

GUIDANCE:
- If a document is relevant to multiple sections, include it in all relevant mappings
- Search queries should be semantic questions or phrases that match learning objectives
- Expected topics help validate document relevance during generation
- Confidence 'high' means Generation can trust all retrieved content is complete
- Confidence 'medium' means Generation should verify context is sufficient
- Use 'note' field to provide specific guidance (e.g., "Focus on examples", "Requires latest data")

LANGUAGE REQUIREMENT:
- ALL text content (search_queries, expected_topics, note) MUST be in ${outputLanguage.toUpperCase()}
- Output MUST be valid JSON with all text fields in ${outputLanguage}
If no documents available, return empty mapping: {"document_relevance_mapping": {}}`);

  return [systemMessage, humanMessage];
}

/**
 * Parses and validates LLM response against Phase6Output schema
 *
 * @param rawResponse - Raw text response from LLM
 * @param input - Original input for validation context
 * @returns Validated Phase6Output (without metadata)
 * @throws Error if validation fails
 */
function parseAndValidateResponse(
  rawResponse: string,
  input: Phase6Input
): Omit<Phase6Output, 'phase_metadata'> {
  // Remove markdown code blocks if present
  let cleanedResponse = rawResponse.trim();
  if (cleanedResponse.startsWith('```json')) {
    cleanedResponse = cleanedResponse.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse.replace(/^```\n/, '').replace(/\n```$/, '');
  }

  // Parse JSON with auto-repair fallback
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedResponse);
  } catch (parseError) {
    console.log('[Phase 6] Direct parse FAILED, using auto-repair');

    // Use Layer 1 auto-repair (synchronous, no LLM required)
    // Static imports at top of file for ESM compatibility
    const repaired = safeJSONParse(cleanedResponse);
    if (repaired === null) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(`Phase 6 parse failed: ${errorMessage}`);
    }

    parsed = fixFieldNames(repaired);
    console.log('[Phase 6] Auto-repair SUCCESS');
  }

  // Validate structure
  const parsedData = parsed as Record<string, unknown>;
  if (!parsedData.document_relevance_mapping || typeof parsedData.document_relevance_mapping !== 'object') {
    throw new Error('Missing or invalid document_relevance_mapping in LLM response');
  }

  const mapping = parsedData.document_relevance_mapping as Record<string, unknown>;

  // Build valid section IDs set
  const validSectionIds = new Set<string>(
    input.sections_breakdown.map((section, index) => section.section_id || String(index + 1))
  );

  // Build valid document IDs set
  const validDocumentIds = new Set<string>(
    input.document_summaries?.map((doc) => doc.document_id) || []
  );

  // Validate each section mapping
  for (const [sectionId, sectionMapping] of Object.entries(mapping)) {
    validateSectionMapping(sectionId, sectionMapping as Record<string, unknown>, validSectionIds, validDocumentIds);
  }

  // The validated object matches Phase6Output structure (minus metadata)
  // We can safely cast it now that we've validated deep properties
  return parsedData as unknown as Omit<Phase6Output, 'phase_metadata'>;
}

/**
 * Helper: Validate a single section mapping
 */
function validateSectionMapping(
  sectionId: string,
  sm: Record<string, unknown>,
  validSectionIds: Set<string>,
  validDocumentIds: Set<string>
): void {
  // Validate section_id exists
  if (!validSectionIds.has(sectionId)) {
    const validIds = Array.from(validSectionIds).join(', ');
    throw new Error(`Invalid section_id in mapping: "${sectionId}". Valid IDs are: [${validIds}]`);
  }

  // Validate structure
  if (!Array.isArray(sm.primary_documents)) {
    throw new Error(`Section ${sectionId}: primary_documents must be an array`);
  }

  // Support both new 'search_queries' and legacy 'key_search_terms'
  const searchQueries = sm.search_queries || sm.key_search_terms;
  if (!Array.isArray(searchQueries)) {
    throw new Error(`Section ${sectionId}: search_queries must be an array`);
  }

  if (!Array.isArray(sm.expected_topics)) {
    throw new Error(`Section ${sectionId}: expected_topics must be an array`);
  }

  // Validate confidence (required in v0.20.0+)
  if (!sm.confidence || !['high', 'medium'].includes(sm.confidence as string)) {
    throw new Error(`Section ${sectionId}: confidence must be 'high' or 'medium'`);
  }

  // Validate note if present (optional)
  if (sm.note !== undefined && typeof sm.note !== 'string') {
    throw new Error(`Section ${sectionId}: note must be a string`);
  }

  // Validate array lengths for search queries
  if (searchQueries.length < 3 || searchQueries.length > 10) {
    throw new Error(`Section ${sectionId}: search_queries must have 3-10 items`);
  }
  if (sm.expected_topics.length < 2 || sm.expected_topics.length > 8) {
    throw new Error(`Section ${sectionId}: expected_topics must have 2-8 items`);
  }

  // Validate document IDs
  const primaryDocs = sm.primary_documents as string[];
  for (const docId of primaryDocs) {
    if (!validDocumentIds.has(docId)) {
      throw new Error(`Section ${sectionId}: invalid document_id ${docId}`);
    }
  }

  // Normalize the mapping to use new field names
  // Migrate key_search_terms -> search_queries for backward compatibility
  if (!sm.search_queries && sm.key_search_terms) {
    sm.search_queries = sm.key_search_terms;
  }

  // Legacy validation: document_processing_methods (optional in v0.20.0+)
  if (sm.document_processing_methods && typeof sm.document_processing_methods === 'object') {
    for (const [docId, method] of Object.entries(sm.document_processing_methods as Record<string, unknown>)) {
      if (!validDocumentIds.has(docId)) {
        throw new Error(`Section ${sectionId}: invalid document_id ${docId} in processing methods`);
      }
      if (method !== 'full_text' && method !== 'hierarchical') {
        throw new Error(`Section ${sectionId}: invalid processing method ${method} for document ${docId}`);
      }
    }
  }
}

/**
 * Runs Phase 6 RAG Planning with retry logic and model escalation
 *
 * IMPORTANT: Only runs if documents exist. Returns empty mapping otherwise.
 *
 * @param input - Phase 6 input data
 * @returns Complete Phase6Output with metadata
 * @throws Error if all retry attempts fail
 */
export async function runPhase6RagPlanning(input: Phase6Input): Promise<Phase6Output> {
  const courseId = input.course_id;

  // CRITICAL: If no documents, return empty mapping (no LLM call needed)
  if (!input.document_summaries || input.document_summaries.length === 0) {
    console.log('[Phase 6] No documents available, returning empty mapping');
    return {
      document_relevance_mapping: {},
      phase_metadata: {
        duration_ms: 0,
        model_used: 'none',
        tokens: { input: 0, output: 0, total: 0 },
        quality_score: 0.0,
        retry_count: 0,
      },
    };
  }

  const maxRetries = 2; // 2 attempts, then escalate to emergency model
  let retryCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Get appropriate model from database (escalate to emergency if needed)
      const phaseName = attempt < maxRetries ? 'stage_6_rag_planning' : 'emergency';
      const model = await getModelForPhase(phaseName);
      const modelId = model.model || 'unknown';

      // Track execution with observability
      const result = await trackPhaseExecution(
        'stage_6_rag_planning',
        courseId,
        modelId,
        async () => {
          const startTime = Date.now();

          // Build prompt
          const [systemMsg, humanMsg] = buildPhase6Prompt(input);
          const messages = [systemMsg, humanMsg];

          // Invoke LLM directly (get RAW text, not parsed JSON)
          const llmResponse = await model.invoke(messages);
          const rawText = typeof llmResponse.content === 'string'
            ? llmResponse.content
            : JSON.stringify(llmResponse.content);
          const endTime = Date.now();

          // Store trace data for orchestrator to log
          const promptText = messages.map(m => {
            const content = typeof m.content === 'string'
              ? m.content
              : Array.isArray(m.content)
                ? m.content.map(c => (typeof c === 'string' ? c : (c as { text?: string }).text || '')).join('')
                : '';
            return `${m._getType().toUpperCase()}:\n${content}`;
          }).join('\n\n');
          storeTraceData(courseId, 'stage_6_rag_planning', {
            promptText,
            completionText: rawText,
          });

          // Parse and validate response (with auto-repair)
          const validated = parseAndValidateResponse(rawText, input);

          // Extract token usage from LLM response metadata (if available)
          const responseWithUsage = llmResponse as unknown as {
            usage_metadata?: { input_tokens?: number; output_tokens?: number };
            response_metadata?: { tokenUsage?: { promptTokens?: number; completionTokens?: number } };
          };

          const usage = {
            input_tokens: responseWithUsage.usage_metadata?.input_tokens ||
                          responseWithUsage.response_metadata?.tokenUsage?.promptTokens || 0,
            output_tokens: responseWithUsage.usage_metadata?.output_tokens ||
                           responseWithUsage.response_metadata?.tokenUsage?.completionTokens || 0,
          };

          // Construct complete output with metadata
          const output: Phase6Output = {
            ...validated,
            phase_metadata: {
              duration_ms: endTime - startTime,
              model_used: modelId,
              tokens: {
                input: usage.input_tokens,
                output: usage.output_tokens,
                total: usage.input_tokens + usage.output_tokens,
              },
              quality_score: 0.0, // Will be updated by semantic validation later
              retry_count: retryCount,
            },
          };

          return {
            result: output,
            usage: {
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
            },
          };
        }
      );

      // Success - return result
      return result;
    } catch (error) {
      retryCount++;

      // If this was the last attempt, throw error
      if (attempt === maxRetries) {
        throw new Error(
          `Phase 6 RAG Planning failed after ${maxRetries + 1} attempts: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // Log retry attempt
      console.warn(
        `Phase 6 RAG Planning attempt ${attempt + 1} failed, retrying...`,
        error instanceof Error ? error.message : String(error)
      );

      // Wait before retry (exponential backoff)
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  // Should never reach here due to throw in last attempt
  throw new Error('Phase 6 RAG Planning failed: unexpected error');
}

/**
 * Updates quality score for Phase 6 output after semantic validation
 *
 * @param output - Phase 6 output to update
 * @param qualityScore - Semantic similarity score (0-1)
 * @returns Updated Phase6Output with quality score
 */
export function updatePhase6QualityScore(output: Phase6Output, qualityScore: number): Phase6Output {
  return {
    ...output,
    phase_metadata: {
      ...output.phase_metadata,
      quality_score: qualityScore,
    },
  };
}
