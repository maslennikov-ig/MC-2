/**
 * Stage 4 Analysis - Phase 4: Document Synthesis Service
 *
 * Synthesizes document summaries and analysis outputs into clear generation instructions
 * for Stage 5 (Course Structure Generation). Uses adaptive model selection based on
 * document count (<3 docs → 20B, ≥3 docs → 120B).
 *
 * @module phase-4-synthesis
 */

import type {
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
} from '@megacampus/shared-types/analysis-result';
import { Phase4OutputSchema } from '@megacampus/shared-types';
import { getModelForPhase } from '@/shared/llm/langchain-models';
import { trackPhaseExecution, storeTraceData } from '../utils/observability';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import { preprocessObject } from '@/shared/validation/preprocessing';

/**
 * Input data for Phase 4 Document Synthesis
 */
export interface Phase4Input {
  /** Course UUID */
  course_id: string;
  /** Target language for course generation */
  language: string;
  /** Course topic */
  topic: string;
  /** Optional user requirements */
  answers?: string | null;
  /** Optional document summaries from Stage 3 */
  document_summaries?: DocumentSummary[] | null;
  /** Phase 1 output (course categorization) */
  phase1_output: Phase1Output;
  /** Phase 2 output (scope analysis) */
  phase2_output: Phase2Output;
  /** Phase 3 output (expert analysis) */
  phase3_output: Phase3Output;
}

/**
 * Document summary structure from Stage 3
 */
export interface DocumentSummary {
  document_id: string;
  file_name: string;
  processed_content: string;
  processing_method: 'bypass' | 'detailed' | 'balanced' | 'aggressive';
  summary_metadata: {
    original_tokens: number;
    summary_tokens: number;
    compression_ratio: number;
    quality_score: number;
  };
}

interface RawPhase4Output {
  generation_guidance: unknown;
  content_strategy: unknown;
  generation_instructions?: unknown;
}

/**
 * Runs Phase 4: Document Synthesis
 *
 * Combines all analysis phases and document summaries into:
 * 1. scope_instructions (100-800 chars) - Clear instructions for Stage 5 Generation
 * 2. content_strategy - How to approach course creation
 *
 * Model selection is adaptive:
 * - <3 documents → 20B model (simple synthesis)
 * - ≥3 documents → 120B model (complex multi-source synthesis)
 *
 * @param input - Phase 4 input data
 * @returns Phase4Output with scope_instructions, content_strategy, and metadata
 * @throws Error if LLM call fails or validation fails
 *
 * @example
 * const phase4Output = await runPhase4Synthesis({
 *   course_id: '550e8400-e29b-41d4-a716-446655440000',
 *   language: 'ru',
 *   topic: 'React Hooks',
 *   document_summaries: [...],
 *   phase1_output: { ... },
 *   phase2_output: { ... },
 *   phase3_output: { ... },
 * });
 */
export async function runPhase4Synthesis(
  input: Phase4Input
): Promise<Phase4Output> {
  const startTime = Date.now();
  const documentCount = input.document_summaries?.length || 0;

  // Adaptive model selection based on document count
  // <3 docs → simple synthesis (20B)
  // ≥3 docs → complex synthesis (120B)
  const phaseName = documentCount < 3 ? 'stage_4_synthesis' : 'stage_4_expert';
  const model = await getModelForPhase(phaseName);
  const modelId =
    documentCount < 3 ? 'openai/gpt-oss-20b' : 'openai/gpt-oss-120b';

  // Build synthesis prompt
  const prompt = buildPhase4Prompt(input, documentCount);

  // Execute LLM call with observability tracking
  const result = await trackPhaseExecution(
    'stage_4_synthesis',
    input.course_id,
    modelId,
    async () => {
      const messages = [
        new SystemMessage(getPhase4SystemPrompt()),
        new HumanMessage(prompt),
      ];
      const response = await model.invoke(messages);

      const content = response.content as string;

      // Store trace data for orchestrator to log
      const promptText = messages.map(m => `${m._getType().toUpperCase()}:
${m.content}`).join('\n\n');
      storeTraceData(input.course_id, 'stage_4_synthesis', {
        promptText,
        completionText: content,
      });

      const usage = response.response_metadata?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;

      return {
        result: {
          content,
          usage: {
            input_tokens: usage?.prompt_tokens || 0,
            output_tokens: usage?.completion_tokens || 0,
          },
        },
        usage: {
          input_tokens: usage?.prompt_tokens || 0,
          output_tokens: usage?.completion_tokens || 0,
        },
      };
    }
  );

  // Parse and validate response with 5-layer repair cascade
  const rawOutput = result.content;
  let parsedOutput: RawPhase4Output | undefined;
  const repairMetadata: {
    layer_used?: string;
    repair_attempts?: number;
    models_tried: string[];
    successful_fields?: string[];
    regenerated_fields?: string[];
  } = {
    models_tried: [modelId],
  };

  // TIER 1: PREPROCESSING (before UnifiedRegenerator)
  let preprocessedOutput = rawOutput;
  try {
    const parsedRaw = JSON.parse(rawOutput) as RawPhase4Output;
    // Preprocess generation instructions enum fields
    if (parsedRaw.generation_instructions) {
      parsedRaw.generation_instructions = preprocessObject(parsedRaw.generation_instructions as Record<string, unknown>, {
        target_audience: 'enum',
        difficulty_level: 'enum',
        primary_strategy: 'enum',
      });
    }
    preprocessedOutput = JSON.stringify(parsedRaw);
  } catch (error) {
    // If preprocessing fails, continue with raw output
    console.warn('[Phase 4] Preprocessing failed, using raw output:', error);
  }

  try {
    // Attempt 0: Direct parse
    parsedOutput = JSON.parse(preprocessedOutput) as RawPhase4Output;
    console.log('[Phase 4] Direct parse SUCCESS');
  } catch (parseError: unknown) {
    console.log(`[Phase 4] Direct parse FAILED, using UnifiedRegenerator with all 5 layers`);

    // Use UnifiedRegenerator with all 5 layers + warning fallback (Stage 4)
    const regenerator = new UnifiedRegenerator<Phase4Output>({
      enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
      maxRetries: 2,
      schema: Phase4OutputSchema,
      model: model,
      metricsTracking: true,
      stage: 'analyze',
      courseId: input.course_id,
      phaseId: 'stage_4_synthesis',
      allowWarningFallback: true, // Stage 4 advisory fields
    });

    const regenerationResult = await regenerator.regenerate({
      rawOutput: preprocessedOutput,
      originalPrompt: buildPhase4Prompt(input, documentCount),
      parseError: parseError instanceof Error ? parseError.message : String(parseError),
    });

    if (regenerationResult.success && regenerationResult.data) {
      parsedOutput = regenerationResult.data as unknown as RawPhase4Output; // Phase4Output matches RawPhase4Output structurally but typed strictly

      // Map layer names for backward compatibility
      const layerMapping: Record<string, 'layer1_repair' | 'layer2_revise' | 'layer3_partial' | 'layer4_120b' | 'layer5_emergency' | 'warning_fallback' | 'none'> = {
        'auto-repair': 'layer1_repair',
        'critique-revise': 'layer2_revise',
        'partial-regen': 'layer3_partial',
        'model-escalation': 'layer4_120b',
        'emergency': 'layer5_emergency',
        'warning_fallback': 'warning_fallback',
        'failed': 'none',
      };

      repairMetadata.layer_used = layerMapping[regenerationResult.metadata.layerUsed] || 'none';
      repairMetadata.repair_attempts = regenerationResult.metadata.retryCount;
      repairMetadata.successful_fields = regenerationResult.metadata.successfulFields || [];
      repairMetadata.regenerated_fields = regenerationResult.metadata.regeneratedFields || [];
      repairMetadata.models_tried = [modelId, ...(regenerationResult.metadata.modelsUsed || [])];

      console.log(`[Phase 4] UnifiedRegenerator SUCCESS - layer: ${regenerationResult.metadata.layerUsed}`);
    } else {
      console.error('[Phase 4] ALL REPAIR LAYERS EXHAUSTED');
      throw new Error(`Failed to parse Phase 4 JSON after all 5 repair layers. Error: ${regenerationResult.error}`);
    }
  }

  if (!parsedOutput) {
    throw new Error('Failed to obtain parsed output');
  }

  // Validate with Zod schema
  const validated = Phase4OutputSchema.parse({
    generation_guidance: parsedOutput.generation_guidance,
    content_strategy: parsedOutput.content_strategy,
    phase_metadata: {
      duration_ms: Date.now() - startTime,
      model_used: modelId,
      tokens: {
        input: result.usage.input_tokens,
        output: result.usage.output_tokens,
        total: result.usage.input_tokens + result.usage.output_tokens,
      },
      quality_score: 0.0, // Will be updated after semantic validation
      retry_count: 0,
      document_count: documentCount,
    },
  });

  return validated;
}

/**
 * Truncates document content to stay within token budget
 *
 * Estimates tokens (~4 chars per token for English/Russian mix) and truncates
 * content to prevent LLM context overflow.
 *
 * @param content - Document processed_content string
 * @param maxTokens - Maximum tokens to allow (default: 10000)
 * @returns Truncated content with truncation note if needed
 */
function truncateDocumentContent(content: string, maxTokens: number = 10000): string {
  // Rough token estimation: ~4 characters per token (conservative for multilingual)
  const estimatedTokens = Math.ceil(content.length / 4);

  if (estimatedTokens <= maxTokens) {
    return content;
  }

  // Truncate to max tokens (4 chars per token)
  const maxChars = maxTokens * 4;
  const truncated = content.substring(0, maxChars);

  return `${truncated}\n\n[... Content truncated from ${estimatedTokens} to ${maxTokens} tokens to fit context window ...]`;
}

/**
 * Builds the Phase 4 synthesis prompt
 *
 * @param input - Phase 4 input data
 * @param documentCount - Number of documents to synthesize
 * @returns Formatted prompt string with token-aware truncation
 */
function buildPhase4Prompt(input: Phase4Input, documentCount: number): string {
  const { phase1_output, phase2_output, phase3_output, language } = input;

  // Determine output language based on course language
  const outputLanguage = language === 'en' ? 'English' : language === 'ru' ? 'Russian' : language;

  // Extract key data from previous phases
  const category = phase1_output.course_category.primary;
  const totalLessons = phase2_output.recommended_structure.total_lessons;
  const totalSections = phase2_output.recommended_structure.total_sections;
  const teachingStyle = phase3_output.pedagogical_strategy.teaching_style;
  const practicalFocus = phase3_output.pedagogical_strategy.practical_focus;
  const researchFlagsCount = phase3_output.research_flags.length;

  // Build document summaries section with token-aware truncation
  // Target: ~25K tokens total for documents (to leave room for prompt structure)
  // With 3 docs: ~8K tokens per document
  const tokensPerDocument = documentCount > 0 ? Math.floor(25000 / documentCount) : 0;

  const documentSummariesSection =
    documentCount > 0
      ? `\n\nDOCUMENT SUMMARIES (${documentCount} documents):\n${input.document_summaries?.map((doc, idx) => `\n[Document ${idx + 1}: ${doc.file_name}]\n${truncateDocumentContent(doc.processed_content, tokensPerDocument)}`).join('\n')}`
      : '\n\n(No documents provided - course will be created from LLM knowledge)';

  // Build research flags section
  const researchFlagsSection =
    researchFlagsCount > 0
      ? `\n\nRESEARCH FLAGS (${researchFlagsCount} topics requiring up-to-date information):\n${phase3_output.research_flags.map((flag) => `- ${flag.topic}: ${flag.context} [${flag.reason}]`).join('\n')}`
      : '';

  // Generate Zod schema description for LLM
  const schemaDescription = zodToPromptSchema(Phase4OutputSchema);

  return `You are synthesizing course analysis into clear generation instructions for Stage 5 Course Generation.

CRITICAL RULES:
1. ALL your response MUST be in ${outputLanguage.toUpperCase()} (the course target language is ${outputLanguage})
2. You MUST respond with valid JSON matching this EXACT schema:

${schemaDescription}

---

ANALYSIS SUMMARY:

Course Topic: ${input.topic}
Target Language: ${input.language} (for final course output)
Category: ${category}
Scope: ${totalLessons} lessons, ${totalSections} sections
Pedagogy: ${teachingStyle}, ${practicalFocus} practical focus
Document Count: ${documentCount}
${researchFlagsSection}

---

PREVIOUS PHASE OUTPUTS:

Phase 1 - Key Concepts:
${phase1_output.topic_analysis.key_concepts.join(', ')}

Phase 2 - Sections Breakdown:
${phase2_output.recommended_structure.sections_breakdown.map((section) => `- ${section.area}: ${section.estimated_lessons} lessons (${section.importance})`).join('\n')}

Phase 3 - Pedagogical Approach:
${phase3_output.pedagogical_strategy.progression_logic}
${documentSummariesSection}

---

TASK: Generate synthesis output

1. **generation_guidance** (structured object):
   - **tone**: Select based on course category and target_audience
     * "conversational but precise": Most programming/technical courses
     * "formal academic": Academic subjects, research-based courses
     * "casual friendly": Personal development, hobbies
     * "technical professional": Professional certifications, business

   - **use_analogies**: true if topic benefits from comparisons (abstract concepts, technical topics)

   - **specific_analogies** (optional): List 1-3 specific analogies that fit this topic
     * Example for programming: ["functions like recipes", "variables like labeled boxes"]
     * Example for networking: ["packets like letters", "router like post office"]

   - **avoid_jargon**: List technical terms that should be avoided or explained
     * Based on target_audience level (beginners need more avoidance)
     * Example: ["polymorphism", "encapsulation"] for beginner OOP course

   - **include_visuals**: Recommend visual aids based on topic nature
     * "diagrams": For system architecture, workflows, relationships
     * "flowcharts": For processes, algorithms, decision trees
     * "code examples": For programming courses
     * "screenshots": For software tutorials
     * "animations": For dynamic processes
     * "plots": For data science, statistics

   - **exercise_types**: Select appropriate assessment methods
     * "coding": Programming, scripting courses
     * "derivation": Math, physics, theoretical subjects
     * "interpretation": Literature, philosophy, analysis
     * "debugging": Software development
     * "refactoring": Advanced programming
     * "analysis": Critical thinking, research-based

   - **contextual_language_hints**: Describe audience level and communication style
     * Example: "Assume no prior programming experience, use simple metaphors"
     * Example: "Target experienced developers, use industry terminology"
     * If research flags exist, mention them briefly here

   - **real_world_examples** (optional): List 1-3 practical applications to reference
     * Example for web dev: ["e-commerce checkout", "social media feed", "real-time chat"]

2. **content_strategy**:
   - Determine strategy based on document coverage:
     * "create_from_scratch": No documents or <3 documents with minimal coverage
     * "expand_and_enhance": 3-10 documents with partial coverage
     * "optimize_existing": 10+ documents with comprehensive coverage
   - Current document count: ${documentCount}
   - Recommendation: ${documentCount < 3 ? 'create_from_scratch' : documentCount <= 10 ? 'expand_and_enhance' : 'optimize_existing'}

---

OUTPUT FORMAT (JSON only, no markdown):

{
  "generation_guidance": {
    "tone": "conversational but precise" | "formal academic" | "casual friendly" | "technical professional",
    "use_analogies": true | false,
    "specific_analogies": ["analogy1", "analogy2"],
    "avoid_jargon": ["term1", "term2"],
    "include_visuals": ["diagrams", "code examples"],
    "exercise_types": ["coding", "debugging"],
    "contextual_language_hints": "Audience assumptions and communication style",
    "real_world_examples": ["example1", "example2"]
  },
  "content_strategy": "create_from_scratch" | "expand_and_enhance" | "optimize_existing"
}

IMPORTANT:
- generation_guidance fields MUST all be populated (only specific_analogies and real_world_examples are optional)
- ALL text content (avoid_jargon, contextual_language_hints, specific_analogies, real_world_examples) MUST be in ${outputLanguage.toUpperCase()}
- If research flags exist, mention them briefly in contextual_language_hints`;
}

/**
 * System prompt for Phase 4 Document Synthesis
 *
 * @returns System prompt string
 */
function getPhase4SystemPrompt(): string {
  return `You are an expert curriculum architect specializing in synthesizing diverse information sources into structured course generation guidance.

Your role:
1. Analyze outputs from previous analysis phases (categorization, scope, expert analysis)
2. Synthesize document summaries (if provided) into key insights
3. Generate structured generation_guidance that specifies tone, pedagogy, and content approach
4. Determine appropriate content_strategy based on available materials

Quality standards:
- generation_guidance must be complete and well-reasoned based on course category and target audience
- All output in English (internal processing language)
- Preserve all critical insights from previous phases
- Balance structured guidance with practical applicability

You have 15+ years experience in curriculum design and instructional synthesis.`;
}

/**
 * Helper: Determine content strategy based on document count and coverage
 *
 * @param documentCount - Number of documents
 * @returns Content strategy recommendation
 */
export function determineContentStrategy(
  documentCount: number
): 'create_from_scratch' | 'expand_and_enhance' | 'optimize_existing' {
  if (documentCount < 3) {
    return 'create_from_scratch';
  } else if (documentCount <= 10) {
    return 'expand_and_enhance';
  } else {
    return 'optimize_existing';
  }
}
