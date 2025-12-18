/**
 * Context Assembler - Builds LLM context based on detected tier
 *
 * Implements tier-based context window optimization from research:
 * - "Lost in the Middle" phenomenon: 20% accuracy drop with excessive context
 * - Optimal context: 4K-8K tokens for most regeneration tasks
 * - Hierarchical context strategy: oldest = summary, recent = key points, immediate = full detail
 *
 * @module shared/regeneration/context-assembler
 * @see docs/research/Partial content regeneration in AI course builders A technical guide.md
 */

import type { ContextTier, TIER_TOKEN_BUDGETS } from '@megacampus/shared-types/regeneration-types';
import type { CourseStructure, Lesson } from '@megacampus/shared-types/generation-result';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import logger from '@/shared/logger';

// ============================================================================
// Interfaces
// ============================================================================

export interface AssemblerInput {
  courseId: string;
  stageId: 'stage_4' | 'stage_5';
  blockPath: string; // e.g., "topic_analysis.key_concepts" or "sections[0].lessons[1].lesson_title"
  tier: ContextTier;
  analysisResult?: AnalysisResult;
  courseStructure?: CourseStructure;
}

export interface AssembledContext {
  targetContent: unknown; // The field value being regenerated
  surroundingContext: string; // Context text for LLM
  tokenEstimate: number;
  metadata: {
    tier: ContextTier;
    blocksIncluded: string[];
    tokenBudget: number;
  };
}

/**
 * Static context (cacheable)
 */
export interface StaticContext {
  content: string; // Static context content (course metadata, style guide, etc.)
  tokenEstimate: number;
}

/**
 * Dynamic context (not cacheable)
 */
export interface DynamicContext {
  content: string; // Dynamic context content (target field, user instruction, adjacent lessons)
  tokenEstimate: number;
}

// ============================================================================
// Token Budgets (from shared-types)
// ============================================================================

// Re-import for runtime use
const TIER_BUDGETS: typeof TIER_TOKEN_BUDGETS = {
  atomic: { target: 200, context: 100, total: 300 },
  local: { target: 500, context: 500, total: 1000 },
  structural: { target: 1000, context: 1500, total: 2500 },
  global: { target: 2000, context: 3000, total: 5000 },
};

// ============================================================================
// Language Detection for Token Estimation
// ============================================================================

/**
 * Character→Token ratios by language
 * Based on OpenAI tokenizer benchmarks
 */
const TOKEN_RATIOS: Record<string, number> = {
  eng: 0.25, // English: 4 chars ≈ 1 token
  rus: 0.35, // Russian: 3 chars ≈ 1 token
  default: 0.30,
};

/**
 * Detect language from text (simple heuristic)
 */
function detectLanguage(text: string): 'eng' | 'rus' {
  // Simple heuristic: check for Cyrillic characters
  const cyrillicRegex = /[\u0400-\u04FF]/;
  return cyrillicRegex.test(text) ? 'rus' : 'eng';
}

/**
 * Estimate tokens from text using character count heuristic
 *
 * Based on research:
 * - English: 1 token ≈ 4 characters (0.25 ratio)
 * - Russian: 1 token ≈ 2-3 characters (0.35 ratio)
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  const language = detectLanguage(text);
  const ratio = TOKEN_RATIOS[language] || TOKEN_RATIOS.default;

  return Math.ceil(text.length * ratio);
}

// ============================================================================
// Field Value Extraction
// ============================================================================

/**
 * Safe nested path access (native implementation)
 *
 * Handles array indices in paths like "sections[0].lessons[1].lesson_title"
 *
 * @param data - Source data object
 * @param path - Dot-notation path (supports array indices)
 * @returns Field value or undefined
 */
export function getFieldValue(data: unknown, path: string): unknown {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  // Split path into parts, handling array indices
  // "sections[0].lessons[1].lesson_title" → ["sections", "0", "lessons", "1", "lesson_title"]
  const parts = path.replace(/\[/g, '.').replace(/\]/g, '').split('.');

  let current: any = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array indices (convert string to number)
    const index = parseInt(part, 10);
    if (!isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Extract parent object from path
 *
 * Example: "sections[0].lessons[1].lesson_title" → "sections[0].lessons[1]"
 */
function getParentPath(path: string): string {
  const lastDotIndex = path.lastIndexOf('.');
  return lastDotIndex > 0 ? path.substring(0, lastDotIndex) : '';
}

/**
 * Extract field name from path
 *
 * Example: "sections[0].lessons[1].lesson_title" → "lesson_title"
 */
function getFieldName(path: string): string {
  const lastDotIndex = path.lastIndexOf('.');
  return lastDotIndex > 0 ? path.substring(lastDotIndex + 1) : path;
}

// ============================================================================
// Context Building Helpers
// ============================================================================

/**
 * Get sibling fields from parent object (for local tier)
 *
 * Excludes the target field itself
 */
function getSiblingFields(data: unknown, parentPath: string, targetField: string): Record<string, unknown> {
  const parent = getFieldValue(data, parentPath);

  if (!parent || typeof parent !== 'object') {
    return {};
  }

  const siblings: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parent)) {
    if (key !== targetField) {
      siblings[key] = value;
    }
  }

  return siblings;
}

/**
 * Parse section/lesson indices from path
 *
 * Example: "sections[0].lessons[1].lesson_title" → { sectionIdx: 0, lessonIdx: 1 }
 */
function parseIndices(path: string): { sectionIdx?: number; lessonIdx?: number } {
  const sectionMatch = path.match(/sections\[(\d+)\]/);
  const lessonMatch = path.match(/lessons\[(\d+)\]/);

  return {
    sectionIdx: sectionMatch ? parseInt(sectionMatch[1], 10) : undefined,
    lessonIdx: lessonMatch ? parseInt(lessonMatch[1], 10) : undefined,
  };
}

/**
 * Get adjacent lessons for structural context (Stage 5 only)
 */
function getAdjacentLessons(
  courseStructure: CourseStructure,
  sectionIdx: number,
  lessonIdx: number
): { previous?: Lesson; next?: Lesson } {
  const section = courseStructure.sections[sectionIdx];
  if (!section) return {};

  return {
    previous: section.lessons[lessonIdx - 1],
    next: section.lessons[lessonIdx + 1],
  };
}

/**
 * Format context string for LLM consumption
 *
 * Uses XML-style tags for clear delineation (from research best practices)
 */
export function buildContextString(tier: ContextTier, parts: string[]): string {
  const header = `<regeneration_context tier="${tier}">`;
  const footer = '</regeneration_context>';

  const body = parts.filter(Boolean).join('\n\n');

  return `${header}\n${body}\n${footer}`;
}

// ============================================================================
// Tier-Specific Context Assembly
// ============================================================================

/**
 * Atomic tier: Just the target field value (minimal context)
 */
function assembleAtomicContext(
  data: unknown,
  blockPath: string
): { targetContent: unknown; contextParts: string[]; blocksIncluded: string[] } {
  const targetContent = getFieldValue(data, blockPath);

  const contextParts = [
    `<target_field path="${blockPath}">`,
    JSON.stringify(targetContent, null, 2),
    '</target_field>',
  ];

  return {
    targetContent,
    contextParts,
    blocksIncluded: [blockPath],
  };
}

/**
 * Local tier: Target field + immediate siblings (surrounding context)
 */
function assembleLocalContext(
  data: unknown,
  blockPath: string
): { targetContent: unknown; contextParts: string[]; blocksIncluded: string[] } {
  const targetContent = getFieldValue(data, blockPath);
  const parentPath = getParentPath(blockPath);
  const fieldName = getFieldName(blockPath);

  const siblings = getSiblingFields(data, parentPath, fieldName);

  const contextParts = [
    `<parent_object path="${parentPath}">`,
    JSON.stringify(siblings, null, 2),
    '</parent_object>',
    '',
    `<target_field path="${blockPath}">`,
    JSON.stringify(targetContent, null, 2),
    '</target_field>',
  ];

  const blocksIncluded = [blockPath, parentPath];

  return {
    targetContent,
    contextParts,
    blocksIncluded,
  };
}

/**
 * Structural tier: Section-level context (learning objectives, key topics from section)
 *
 * For Stage 5 lessons, include:
 * - Section learning objectives
 * - Adjacent lessons (previous/next)
 * - Key topics from section
 */
function assembleStructuralContext(
  data: unknown,
  blockPath: string,
  courseStructure?: CourseStructure
): { targetContent: unknown; contextParts: string[]; blocksIncluded: string[] } {
  const targetContent = getFieldValue(data, blockPath);
  const { sectionIdx, lessonIdx } = parseIndices(blockPath);

  const contextParts: string[] = [];
  const blocksIncluded: string[] = [blockPath];

  // Add section context if available
  if (courseStructure && sectionIdx !== undefined) {
    const section = courseStructure.sections[sectionIdx];

    if (section) {
      contextParts.push(
        `<section_context index="${sectionIdx}">`,
        `<section_title>${section.section_title}</section_title>`,
        `<learning_objectives>`,
        ...section.learning_objectives.map((obj, idx) => `  ${idx + 1}. ${obj}`),
        `</learning_objectives>`,
        `</section_context>`
      );

      blocksIncluded.push(`sections[${sectionIdx}].section_title`);
      blocksIncluded.push(`sections[${sectionIdx}].learning_objectives`);
    }

    // Add adjacent lessons if lesson-level regeneration
    if (lessonIdx !== undefined && section) {
      const { previous, next } = getAdjacentLessons(courseStructure, sectionIdx, lessonIdx);

      if (previous) {
        contextParts.push(
          '',
          `<previous_lesson>`,
          `<lesson_title>${previous.lesson_title}</lesson_title>`,
          `<key_topics>${previous.key_topics.join(', ')}</key_topics>`,
          `</previous_lesson>`
        );
        blocksIncluded.push(`sections[${sectionIdx}].lessons[${lessonIdx - 1}]`);
      }

      if (next) {
        contextParts.push(
          '',
          `<next_lesson>`,
          `<lesson_title>${next.lesson_title}</lesson_title>`,
          `<key_topics>${next.key_topics.join(', ')}</key_topics>`,
          `</next_lesson>`
        );
        blocksIncluded.push(`sections[${sectionIdx}].lessons[${lessonIdx + 1}]`);
      }
    }
  }

  // Add target field
  contextParts.push(
    '',
    `<target_field path="${blockPath}">`,
    JSON.stringify(targetContent, null, 2),
    `</target_field>`
  );

  return {
    targetContent,
    contextParts,
    blocksIncluded,
  };
}

/**
 * Global tier: Full course context (analysis result, structure overview)
 *
 * Includes:
 * - Course metadata (title, description, target audience)
 * - Relevant analysis_result sections (key concepts, pedagogical strategy)
 * - Course structure overview (section titles, lesson counts)
 */
function assembleGlobalContext(
  data: unknown,
  blockPath: string,
  analysisResult?: AnalysisResult,
  courseStructure?: CourseStructure
): { targetContent: unknown; contextParts: string[]; blocksIncluded: string[] } {
  const targetContent = getFieldValue(data, blockPath);

  const contextParts: string[] = [];
  const blocksIncluded: string[] = [blockPath];

  // Add analysis result sections (if Stage 4 or available)
  if (analysisResult) {
    contextParts.push(
      `<analysis_result>`,
      `<determined_topic>${analysisResult.topic_analysis.determined_topic}</determined_topic>`,
      `<key_concepts>${analysisResult.topic_analysis.key_concepts.join(', ')}</key_concepts>`,
      `<target_audience>${analysisResult.topic_analysis.target_audience}</target_audience>`,
      `<pedagogical_strategy>`,
      `  Teaching style: ${analysisResult.pedagogical_strategy.teaching_style}`,
      `  Practical focus: ${analysisResult.pedagogical_strategy.practical_focus}`,
      `</pedagogical_strategy>`,
      `</analysis_result>`
    );

    blocksIncluded.push('topic_analysis', 'pedagogical_strategy');
  }

  // Add course structure overview (if Stage 5)
  if (courseStructure) {
    contextParts.push(
      '',
      `<course_structure>`,
      `<course_title>${courseStructure.course_title}</course_title>`,
      `<target_audience>${courseStructure.target_audience}</target_audience>`,
      `<difficulty_level>${courseStructure.difficulty_level}</difficulty_level>`,
      `<sections_overview>`,
      ...courseStructure.sections.map(
        (section, idx) =>
          `  ${idx + 1}. ${section.section_title} (${section.lessons.length} lessons)`
      ),
      `</sections_overview>`,
      `</course_structure>`
    );

    blocksIncluded.push('course_title', 'target_audience', 'difficulty_level', 'sections');
  }

  // Add target field
  contextParts.push(
    '',
    `<target_field path="${blockPath}">`,
    JSON.stringify(targetContent, null, 2),
    `</target_field>`
  );

  return {
    targetContent,
    contextParts,
    blocksIncluded,
  };
}

// ============================================================================
// Main Assembler Function
// ============================================================================

/**
 * Assemble context for LLM based on detected tier
 *
 * Implements hierarchical context strategy from research:
 * - Atomic: Just the target field value (minimal context)
 * - Local: Target field + immediate siblings (surrounding context)
 * - Structural: Section-level context (learning objectives, key topics from section)
 * - Global: Full course context (analysis result, structure overview)
 *
 * @param input - Assembler input configuration
 * @returns Assembled context with target content, surrounding context, and metadata
 *
 * @example
 * ```typescript
 * const context = await assembleContext({
 *   courseId: 'uuid',
 *   stageId: 'stage_5',
 *   blockPath: 'sections[0].lessons[1].lesson_title',
 *   tier: 'structural',
 *   courseStructure: structure,
 * });
 *
 * console.log(context.tokenEstimate); // 1500
 * console.log(context.metadata.blocksIncluded); // ['sections[0].section_title', ...]
 * ```
 */
export async function assembleContext(input: AssemblerInput): Promise<AssembledContext> {
  const { courseId, stageId, blockPath, tier, analysisResult, courseStructure } = input;

  logger.info(
    { courseId, stageId, blockPath, tier },
    'ContextAssembler: Starting context assembly'
  );

  // Select source data based on stageId
  const sourceData = stageId === 'stage_4' ? analysisResult : courseStructure;

  if (!sourceData) {
    throw new Error(`ContextAssembler: No source data available for ${stageId}`);
  }

  // Assemble context based on tier
  let targetContent: unknown;
  let contextParts: string[];
  let blocksIncluded: string[];

  switch (tier) {
    case 'atomic':
      ({ targetContent, contextParts, blocksIncluded } = assembleAtomicContext(
        sourceData,
        blockPath
      ));
      break;

    case 'local':
      ({ targetContent, contextParts, blocksIncluded } = assembleLocalContext(
        sourceData,
        blockPath
      ));
      break;

    case 'structural':
      ({ targetContent, contextParts, blocksIncluded } = assembleStructuralContext(
        sourceData,
        blockPath,
        courseStructure
      ));
      break;

    case 'global':
      ({ targetContent, contextParts, blocksIncluded } = assembleGlobalContext(
        sourceData,
        blockPath,
        analysisResult,
        courseStructure
      ));
      break;

    default:
      throw new Error(`ContextAssembler: Unknown tier: ${tier}`);
  }

  // Build final context string
  const surroundingContext = buildContextString(tier, contextParts);

  // Estimate tokens
  const tokenEstimate = estimateTokens(surroundingContext);

  // Get token budget for tier
  const tokenBudget = TIER_BUDGETS[tier].total;

  // Validate token budget
  if (tokenEstimate > tokenBudget) {
    logger.warn(
      {
        tier,
        tokenEstimate,
        tokenBudget,
        blockPath,
      },
      'ContextAssembler: Token estimate exceeds budget'
    );
  }

  logger.info(
    {
      tier,
      tokenEstimate,
      tokenBudget,
      blocksIncluded: blocksIncluded.length,
    },
    'ContextAssembler: Context assembly complete'
  );

  return {
    targetContent,
    surroundingContext,
    tokenEstimate,
    metadata: {
      tier,
      blocksIncluded,
      tokenBudget,
    },
  };
}

// ============================================================================
// Static/Dynamic Context Split (for caching)
// ============================================================================

/**
 * Assemble static context (cacheable)
 *
 * Static context includes:
 * - Course metadata (title, description, target_audience)
 * - Learning Objectives list
 * - Section structure overview
 * - Pedagogical strategy
 *
 * This context doesn't change during a session and can be cached.
 *
 * @param input - Assembler input configuration
 * @returns Static context with token estimate
 */
export async function assembleStaticContext(input: AssemblerInput): Promise<StaticContext> {
  const { tier, analysisResult, courseStructure } = input;

  const contextParts: string[] = [];

  // Add analysis result sections (if available)
  if (analysisResult) {
    contextParts.push(
      `<course_metadata>`,
      `<determined_topic>${analysisResult.topic_analysis.determined_topic}</determined_topic>`,
      `<key_concepts>${analysisResult.topic_analysis.key_concepts.join(', ')}</key_concepts>`,
      `<target_audience>${analysisResult.topic_analysis.target_audience}</target_audience>`,
      `<pedagogical_strategy>`,
      `  Teaching style: ${analysisResult.pedagogical_strategy.teaching_style}`,
      `  Practical focus: ${analysisResult.pedagogical_strategy.practical_focus}`,
      `</pedagogical_strategy>`,
      `</course_metadata>`
    );
  }

  // Add course structure metadata (if available)
  if (courseStructure) {
    contextParts.push(
      '',
      `<course_structure>`,
      `<course_title>${courseStructure.course_title}</course_title>`,
      `<target_audience>${courseStructure.target_audience}</target_audience>`,
      `<difficulty_level>${courseStructure.difficulty_level}</difficulty_level>`,
      `<sections_overview>`,
      ...courseStructure.sections.map(
        (section, idx) =>
          `  ${idx + 1}. ${section.section_title} (${section.lessons.length} lessons)`
      ),
      `</sections_overview>`,
      `</course_structure>`
    );
  }

  const content = contextParts.join('\n');
  const tokenEstimate = estimateTokens(content);

  logger.debug(
    {
      tier,
      tokenEstimate,
      hasAnalysisResult: !!analysisResult,
      hasCourseStructure: !!courseStructure,
    },
    'ContextAssembler: Static context assembled'
  );

  return {
    content,
    tokenEstimate,
  };
}

/**
 * Assemble dynamic context (not cacheable)
 *
 * Dynamic context includes:
 * - Target field value being regenerated
 * - Adjacent lessons (may change)
 * - Section-specific details
 *
 * This context changes between regeneration requests and should NOT be cached.
 *
 * @param input - Assembler input configuration
 * @returns Dynamic context with token estimate
 */
export async function assembleDynamicContext(input: AssemblerInput): Promise<DynamicContext> {
  const { tier, blockPath, analysisResult, courseStructure } = input;

  // Select source data based on stageId
  const sourceData = input.stageId === 'stage_4' ? analysisResult : courseStructure;

  if (!sourceData) {
    throw new Error(`ContextAssembler: No source data available for ${input.stageId}`);
  }

  const contextParts: string[] = [];

  // Add tier-specific dynamic context
  switch (tier) {
    case 'atomic':
      // Just target field
      {
        const targetContent = getFieldValue(sourceData, blockPath);
        contextParts.push(
          `<target_field path="${blockPath}">`,
          JSON.stringify(targetContent, null, 2),
          '</target_field>'
        );
      }
      break;

    case 'local':
      // Target field + immediate siblings
      {
        const targetContent = getFieldValue(sourceData, blockPath);
        const parentPath = getParentPath(blockPath);
        const fieldName = getFieldName(blockPath);
        const siblings = getSiblingFields(sourceData, parentPath, fieldName);

        contextParts.push(
          `<parent_object path="${parentPath}">`,
          JSON.stringify(siblings, null, 2),
          '</parent_object>',
          '',
          `<target_field path="${blockPath}">`,
          JSON.stringify(targetContent, null, 2),
          '</target_field>'
        );
      }
      break;

    case 'structural':
      // Section context + adjacent lessons
      {
        const targetContent = getFieldValue(sourceData, blockPath);
        const { sectionIdx, lessonIdx } = parseIndices(blockPath);

        if (courseStructure && sectionIdx !== undefined) {
          const section = courseStructure.sections[sectionIdx];

          if (section) {
            contextParts.push(
              `<section_context index="${sectionIdx}">`,
              `<section_title>${section.section_title}</section_title>`,
              `<learning_objectives>`,
              ...section.learning_objectives.map((obj, idx) => `  ${idx + 1}. ${obj}`),
              `</learning_objectives>`,
              `</section_context>`
            );

            // Add adjacent lessons
            if (lessonIdx !== undefined) {
              const { previous, next } = getAdjacentLessons(courseStructure, sectionIdx, lessonIdx);

              if (previous) {
                contextParts.push(
                  '',
                  `<previous_lesson>`,
                  `<lesson_title>${previous.lesson_title}</lesson_title>`,
                  `<key_topics>${previous.key_topics.join(', ')}</key_topics>`,
                  `</previous_lesson>`
                );
              }

              if (next) {
                contextParts.push(
                  '',
                  `<next_lesson>`,
                  `<lesson_title>${next.lesson_title}</lesson_title>`,
                  `<key_topics>${next.key_topics.join(', ')}</key_topics>`,
                  `</next_lesson>`
                );
              }
            }
          }
        }

        contextParts.push(
          '',
          `<target_field path="${blockPath}">`,
          JSON.stringify(targetContent, null, 2),
          `</target_field>`
        );
      }
      break;

    case 'global':
      // Full context (target field)
      {
        const targetContent = getFieldValue(sourceData, blockPath);
        contextParts.push(
          `<target_field path="${blockPath}">`,
          JSON.stringify(targetContent, null, 2),
          `</target_field>`
        );
      }
      break;

    default:
      throw new Error(`ContextAssembler: Unknown tier: ${tier}`);
  }

  const content = contextParts.join('\n');
  const tokenEstimate = estimateTokens(content);

  logger.debug(
    {
      tier,
      blockPath,
      tokenEstimate,
    },
    'ContextAssembler: Dynamic context assembled'
  );

  return {
    content,
    tokenEstimate,
  };
}
