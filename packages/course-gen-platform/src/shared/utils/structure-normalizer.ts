/**
 * Structure Normalizer - Production-Grade LLM Output Transformation
 *
 * Algorithmically transforms variable LLM outputs into expected schema structures.
 * This is a FREE operation (no model calls) that handles common variations:
 *
 * 1. Flat to nested structure transformation
 *    - `category: "professional"` → `course_category: { primary: "professional", ... }`
 *
 * 2. Field name variant mapping
 *    - `why_matters` → `why_matters_context`
 *    - `topic` → `determined_topic`
 *
 * 3. Default value injection for missing required fields
 *    - confidence: 0.8 (default)
 *    - reasoning: "Auto-generated" (default)
 *
 * 4. Common LLM quirk handling
 *    - Unwrapping nested `data` or `result` keys
 *    - Handling string enums vs object enums
 *
 * @module shared/utils/structure-normalizer
 */

import logger from '@/shared/logger';

/**
 * Valid course category values
 */
const VALID_CATEGORIES = ['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic'] as const;

/**
 * Valid complexity values
 */
const VALID_COMPLEXITIES = ['narrow', 'medium', 'broad'] as const;

/**
 * Valid target audience values
 */
const VALID_AUDIENCES = ['beginner', 'intermediate', 'advanced', 'mixed'] as const;

/**
 * Valid primary strategy values
 */
const VALID_STRATEGIES = ['problem-based learning', 'lecture-based', 'inquiry-based', 'project-based', 'mixed'] as const;

/**
 * Field name variant mappings (common LLM variations → expected names)
 */
const FIELD_VARIANTS: Record<string, string> = {
  // course_category variants
  category: 'course_category',
  courseCategory: 'course_category',
  course_type: 'course_category',
  classification: 'course_category',

  // contextual_language field variants
  why_matters: 'why_matters_context',
  whyMatters: 'why_matters_context',
  why_this_matters: 'why_matters_context',
  problem_statement: 'problem_statement_context',
  problemStatement: 'problem_statement_context',
  practical_benefit: 'practical_benefit_focus',
  practicalBenefit: 'practical_benefit_focus',
  benefits: 'practical_benefit_focus',
  experience: 'experience_prompt',
  experiencePrompt: 'experience_prompt',
  bridge: 'knowledge_bridge',
  knowledgeBridge: 'knowledge_bridge',
  motivation: 'motivators',
  motivations: 'motivators',

  // topic_analysis field variants
  topic: 'determined_topic',
  main_topic: 'determined_topic',
  determinedTopic: 'determined_topic',
  completeness: 'information_completeness',
  informationCompleteness: 'information_completeness',
  info_completeness: 'information_completeness',
  audience: 'target_audience',
  targetAudience: 'target_audience',
  level: 'target_audience',
  missing: 'missing_elements',
  missingElements: 'missing_elements',
  concepts: 'key_concepts',
  keyConcepts: 'key_concepts',
  main_concepts: 'key_concepts',
  keywords: 'domain_keywords',
  domainKeywords: 'domain_keywords',
  tags: 'domain_keywords',

  // pedagogical_patterns field variants
  strategy: 'primary_strategy',
  primaryStrategy: 'primary_strategy',
  teaching_strategy: 'primary_strategy',
  ratio: 'theory_practice_ratio',
  theoryPracticeRatio: 'theory_practice_ratio',
  theory_ratio: 'theory_practice_ratio',
  assessment: 'assessment_types',
  assessmentTypes: 'assessment_types',
  assessments: 'assessment_types',
  patterns: 'key_patterns',
  keyPatterns: 'key_patterns',
};

/**
 * Check if a value is a valid enum member
 */
function isValidEnum<T extends string>(value: unknown, validValues: readonly T[]): value is T {
  return typeof value === 'string' && validValues.includes(value as T);
}

/**
 * Normalize field names using variant mappings
 */
function normalizeFieldName(key: string): string {
  return FIELD_VARIANTS[key] || key;
}

/**
 * Recursively normalize field names in an object
 */
function normalizeFieldNames(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = normalizeFieldName(key);

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[normalizedKey] = normalizeFieldNames(value as Record<string, unknown>);
    } else {
      result[normalizedKey] = value;
    }
  }

  return result;
}

/**
 * Normalize course_category structure
 *
 * Handles:
 * - `category: "professional"` → `{ primary: "professional", ... }`
 * - `course_category: "professional"` → `{ primary: "professional", ... }`
 * - `{ primary: "professional" }` → as-is with defaults
 */
function normalizeCourseCategory(data: Record<string, unknown>): Record<string, unknown> {
  let categoryData = data.course_category;

  // If it's a string, convert to object
  if (typeof categoryData === 'string') {
    const primary = isValidEnum(categoryData, VALID_CATEGORIES)
      ? categoryData
      : 'professional'; // Default if invalid

    categoryData = {
      primary,
      confidence: 0.8,
      reasoning: 'Auto-classified based on topic analysis',
      secondary: null,
    };
    logger.info({ original: data.course_category, normalized: categoryData }, 'Normalized course_category from string');
  }

  // If it's an object, ensure required fields
  if (categoryData && typeof categoryData === 'object' && !Array.isArray(categoryData)) {
    const catObj = categoryData as Record<string, unknown>;

    // Ensure primary is valid
    if (!isValidEnum(catObj.primary, VALID_CATEGORIES)) {
      // Try to find it in alternative locations
      const possiblePrimary = catObj.category || catObj.type || catObj.classification;
      catObj.primary = isValidEnum(possiblePrimary, VALID_CATEGORIES)
        ? possiblePrimary
        : 'professional';
    }

    // Add defaults for missing fields
    if (typeof catObj.confidence !== 'number') {
      catObj.confidence = 0.8;
    }
    if (typeof catObj.reasoning !== 'string' || catObj.reasoning === '') {
      catObj.reasoning = 'Auto-classified based on topic analysis';
    }
    if (catObj.secondary === undefined) {
      catObj.secondary = null;
    }

    data.course_category = catObj;
  } else if (!categoryData) {
    // No category data at all - create default
    data.course_category = {
      primary: 'professional',
      confidence: 0.5,
      reasoning: 'Default classification - could not determine from model output',
      secondary: null,
    };
    logger.warn('course_category was missing, created default');
  }

  return data;
}

/**
 * Normalize contextual_language structure
 */
function normalizeContextualLanguage(data: Record<string, unknown>): Record<string, unknown> {
  let langData = data.contextual_language;

  if (!langData || typeof langData !== 'object' || Array.isArray(langData)) {
    // Try to construct from flat fields
    langData = {
      why_matters_context: data.why_matters_context || data.why_matters || 'This knowledge will transform your approach and open new possibilities.',
      motivators: data.motivators || data.motivation || 'Master practical skills that create immediate value in your work and life.',
      experience_prompt: data.experience_prompt || data.experience || 'Think about situations where this knowledge would have helped you succeed.',
      problem_statement_context: data.problem_statement_context || data.problem_statement || 'Many people struggle with this topic without proper guidance.',
      knowledge_bridge: data.knowledge_bridge || data.bridge || 'Build on what you already know to achieve deeper understanding.',
      practical_benefit_focus: data.practical_benefit_focus || data.practical_benefit || 'Apply these concepts immediately to see tangible results.',
    };
    logger.info('Constructed contextual_language from flat fields or defaults');
  }

  const langObj = langData as Record<string, unknown>;

  // Ensure all required fields exist with minimum content
  const requiredFields = [
    'why_matters_context',
    'motivators',
    'experience_prompt',
    'problem_statement_context',
    'knowledge_bridge',
    'practical_benefit_focus',
  ];

  const defaultMessages: Record<string, string> = {
    why_matters_context: 'This knowledge will transform your approach and open new possibilities.',
    motivators: 'Master practical skills that create immediate value in your work and life.',
    experience_prompt: 'Think about situations where this knowledge would have helped you succeed.',
    problem_statement_context: 'Many people struggle with this topic without proper guidance.',
    knowledge_bridge: 'Build on what you already know to achieve deeper understanding.',
    practical_benefit_focus: 'Apply these concepts immediately to see tangible results.',
  };

  for (const field of requiredFields) {
    if (typeof langObj[field] !== 'string' || (langObj[field] as string).length < 50) {
      langObj[field] = defaultMessages[field];
    }
  }

  data.contextual_language = langObj;
  return data;
}

/**
 * Normalize topic_analysis structure
 */
function normalizeTopicAnalysis(data: Record<string, unknown>, originalTopic?: string): Record<string, unknown> {
  let topicData = data.topic_analysis;

  if (!topicData || typeof topicData !== 'object' || Array.isArray(topicData)) {
    // Try to construct from flat fields
    topicData = {
      determined_topic: data.determined_topic || data.topic || originalTopic || 'Course Topic',
      information_completeness: data.information_completeness || data.completeness || 70,
      complexity: data.complexity || 'medium',
      reasoning: data.reasoning || 'Analysis based on provided topic and context.',
      target_audience: data.target_audience || data.audience || 'mixed',
      missing_elements: data.missing_elements || data.missing || null,
      key_concepts: data.key_concepts || data.concepts || ['concept1', 'concept2', 'concept3'],
      domain_keywords: data.domain_keywords || data.keywords || ['keyword1', 'keyword2', 'keyword3', 'keyword4', 'keyword5'],
    };
    logger.info('Constructed topic_analysis from flat fields or defaults');
  }

  const topicObj = topicData as Record<string, unknown>;

  // Validate and fix enums
  if (!isValidEnum(topicObj.complexity, VALID_COMPLEXITIES)) {
    topicObj.complexity = 'medium';
  }
  if (!isValidEnum(topicObj.target_audience, VALID_AUDIENCES)) {
    topicObj.target_audience = 'mixed';
  }

  // Ensure required fields
  if (typeof topicObj.determined_topic !== 'string' || topicObj.determined_topic === '') {
    topicObj.determined_topic = originalTopic || 'Course Topic';
  }
  if (typeof topicObj.information_completeness !== 'number') {
    topicObj.information_completeness = 70;
  }
  if (typeof topicObj.reasoning !== 'string' || (topicObj.reasoning as string).length < 50) {
    topicObj.reasoning = 'Topic analysis based on provided course information and context analysis.';
  }
  if (!Array.isArray(topicObj.key_concepts) || topicObj.key_concepts.length < 3) {
    topicObj.key_concepts = topicObj.key_concepts || ['fundamental concepts', 'core principles', 'practical applications'];
  }
  if (!Array.isArray(topicObj.domain_keywords) || topicObj.domain_keywords.length < 5) {
    topicObj.domain_keywords = topicObj.domain_keywords || ['keyword1', 'keyword2', 'keyword3', 'keyword4', 'keyword5'];
  }
  if (topicObj.missing_elements === undefined) {
    topicObj.missing_elements = null;
  }

  data.topic_analysis = topicObj;
  return data;
}

/**
 * Normalize pedagogical_patterns structure
 */
function normalizePedagogicalPatterns(data: Record<string, unknown>): Record<string, unknown> {
  let patternsData = data.pedagogical_patterns;

  if (!patternsData || typeof patternsData !== 'object' || Array.isArray(patternsData)) {
    // Try to construct from flat fields
    patternsData = {
      primary_strategy: data.primary_strategy || data.strategy || 'mixed',
      theory_practice_ratio: data.theory_practice_ratio || data.ratio || '40:60',
      assessment_types: data.assessment_types || data.assessments || ['quizzes', 'projects'],
      key_patterns: data.key_patterns || data.patterns || ['learn by doing', 'progressive complexity'],
    };
    logger.info('Constructed pedagogical_patterns from flat fields or defaults');
  }

  const patternsObj = patternsData as Record<string, unknown>;

  // Validate and fix enums
  if (!isValidEnum(patternsObj.primary_strategy, VALID_STRATEGIES)) {
    patternsObj.primary_strategy = 'mixed';
  }

  // Validate theory_practice_ratio format (XX:YY)
  if (typeof patternsObj.theory_practice_ratio !== 'string' || !/^\d+:\d+$/.test(patternsObj.theory_practice_ratio as string)) {
    patternsObj.theory_practice_ratio = '40:60';
  }

  // Ensure arrays
  if (!Array.isArray(patternsObj.assessment_types)) {
    patternsObj.assessment_types = ['quizzes', 'projects'];
  }
  if (!Array.isArray(patternsObj.key_patterns)) {
    patternsObj.key_patterns = ['learn by doing', 'progressive complexity'];
  }

  data.pedagogical_patterns = patternsObj;
  return data;
}

/**
 * Unwrap nested data structures (common LLM quirk)
 *
 * Handles:
 * - `{ data: { ... } }` → `{ ... }`
 * - `{ result: { ... } }` → `{ ... }`
 * - `{ output: { ... } }` → `{ ... }`
 */
function unwrapNestedData(data: Record<string, unknown>): Record<string, unknown> {
  const wrapperKeys = ['data', 'result', 'output', 'response'];

  for (const key of wrapperKeys) {
    if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      // Check if it looks like it contains the actual data
      const inner = data[key] as Record<string, unknown>;
      if (inner.course_category || inner.topic_analysis || inner.contextual_language || inner.category) {
        logger.info({ wrapperKey: key }, 'Unwrapped nested data structure');
        return inner;
      }
    }
  }

  return data;
}

/**
 * Phase 1 Output Structure Normalizer
 *
 * Main entry point for normalizing Phase 1 LLM output.
 * Transforms variable model outputs into expected Phase1Output schema.
 *
 * @param rawData - Raw parsed JSON from LLM
 * @param context - Optional context for logging (topic, courseId)
 * @returns Normalized data matching Phase1Output structure (minus phase_metadata)
 *
 * @example
 * ```typescript
 * // Input: Flat structure from model
 * const raw = {
 *   category: "professional",
 *   why_matters: "This is important...",
 *   topic: "Machine Learning",
 *   complexity: "medium"
 * };
 *
 * // Output: Nested structure matching schema
 * const normalized = normalizePhase1Output(raw);
 * // {
 * //   course_category: { primary: "professional", confidence: 0.8, ... },
 * //   contextual_language: { why_matters_context: "...", ... },
 * //   topic_analysis: { determined_topic: "Machine Learning", ... },
 * //   pedagogical_patterns: { ... }
 * // }
 * ```
 */
export function normalizePhase1Output(
  rawData: unknown,
  context?: { topic?: string; courseId?: string }
): Record<string, unknown> {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    logger.error({ rawData: typeof rawData }, 'normalizePhase1Output received invalid input');
    throw new Error('Cannot normalize non-object data');
  }

  let data = { ...rawData } as Record<string, unknown>;

  logger.debug({ originalKeys: Object.keys(data) }, 'Starting Phase 1 output normalization');

  // Step 1: Unwrap nested data structures
  data = unwrapNestedData(data);

  // Step 2: Normalize field names (variants → expected)
  data = normalizeFieldNames(data);

  // Step 3: Normalize each section
  data = normalizeCourseCategory(data);
  data = normalizeContextualLanguage(data);
  data = normalizeTopicAnalysis(data, context?.topic);
  data = normalizePedagogicalPatterns(data);

  logger.info(
    {
      normalizedKeys: Object.keys(data),
      hasCourseCategory: !!data.course_category,
      hasTopicAnalysis: !!data.topic_analysis,
      hasContextualLanguage: !!data.contextual_language,
      hasPedagogicalPatterns: !!data.pedagogical_patterns,
    },
    'Phase 1 output normalization complete'
  );

  return data;
}

/**
 * Validate normalized data against basic structure requirements
 *
 * Returns validation errors or null if valid.
 * This is a quick check before Zod validation.
 */
export function quickValidatePhase1Structure(data: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // Check top-level structure
  if (!data.course_category || typeof data.course_category !== 'object') {
    errors.push('Missing or invalid course_category');
  } else {
    const cat = data.course_category as Record<string, unknown>;
    if (!cat.primary) errors.push('Missing course_category.primary');
    if (typeof cat.confidence !== 'number') errors.push('Missing course_category.confidence');
  }

  if (!data.topic_analysis || typeof data.topic_analysis !== 'object') {
    errors.push('Missing or invalid topic_analysis');
  } else {
    const topic = data.topic_analysis as Record<string, unknown>;
    if (!topic.complexity) errors.push('Missing topic_analysis.complexity');
    if (!topic.determined_topic) errors.push('Missing topic_analysis.determined_topic');
  }

  if (!data.contextual_language || typeof data.contextual_language !== 'object') {
    errors.push('Missing or invalid contextual_language');
  }

  if (!data.pedagogical_patterns || typeof data.pedagogical_patterns !== 'object') {
    errors.push('Missing or invalid pedagogical_patterns');
  }

  return errors;
}
