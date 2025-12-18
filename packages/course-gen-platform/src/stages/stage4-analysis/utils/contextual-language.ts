/**
 * Contextual Language Generator Utility
 *
 * Category-specific motivational language templates.
 * Used by Phase 1 Classification.
 *
 * 6 categories: professional, personal, creative, hobby, spiritual, academic
 *
 * @module contextual-language
 */

import type { Phase1Output } from '@megacampus/shared-types/analysis-result';

/**
 * Course category type (6 categories)
 */
export type CourseCategory = Phase1Output['course_category']['primary'];

/**
 * Template structure for contextual language generation
 */
export interface CategoryTemplate {
  why_matters: string;
  motivators: string;
  experience_prompt: string;
  problem_statement: string;
  knowledge_bridge: string;
  practical_benefit: string;
}

/**
 * Category-specific template definitions
 *
 * These templates are embedded in the Phase 1 system prompt as reference patterns.
 * The LLM generates contextual language dynamically based on these templates,
 * adapting them to the specific course topic.
 */
export const CATEGORY_TEMPLATES: Record<CourseCategory, CategoryTemplate> = {
  professional: {
    why_matters: 'career advancement and professional competitiveness',
    motivators: 'increased earning potential, job security, industry recognition',
    experience_prompt: 'workplace challenges and professional growth opportunities',
    problem_statement: 'skills gap affecting career progression',
    knowledge_bridge: 'practical application in current or future professional roles',
    practical_benefit: 'immediate applicability to job responsibilities and career goals',
  },
  personal: {
    why_matters: 'personal growth and life improvement',
    motivators: 'self-improvement, life quality enhancement, personal satisfaction',
    experience_prompt: 'personal challenges and growth aspirations',
    problem_statement: 'personal development areas needing attention',
    knowledge_bridge: 'direct application to daily life and personal goals',
    practical_benefit: 'tangible improvements in personal life and well-being',
  },
  creative: {
    why_matters: 'artistic expression and creative fulfillment',
    motivators: 'creative outlets, artistic satisfaction, self-expression',
    experience_prompt: 'creative projects and artistic aspirations',
    problem_statement: 'creative skills development needs',
    knowledge_bridge: 'practical application in creative projects and artistic work',
    practical_benefit: 'enhanced creative capabilities and artistic output',
  },
  hobby: {
    why_matters: 'enjoyment and leisure enrichment',
    motivators: 'fun, relaxation, personal enjoyment, community engagement',
    experience_prompt: 'leisure activities and hobby interests',
    problem_statement: 'skill gaps in hobby pursuits',
    knowledge_bridge: 'practical application in hobby activities and leisure time',
    practical_benefit: 'increased enjoyment and mastery of hobby activities',
  },
  spiritual: {
    why_matters: 'spiritual growth and inner development',
    motivators: 'inner peace, spiritual fulfillment, personal transformation',
    experience_prompt: 'spiritual journey and inner development needs',
    problem_statement: 'spiritual development areas requiring attention',
    knowledge_bridge: 'practical application in spiritual practice and personal growth',
    practical_benefit: 'deeper spiritual understanding and personal transformation',
  },
  academic: {
    why_matters: 'educational achievement and knowledge mastery',
    motivators: 'academic success, intellectual growth, degree completion',
    experience_prompt: 'academic challenges and learning goals',
    problem_statement: 'knowledge gaps affecting academic performance',
    knowledge_bridge: 'application in academic studies and educational goals',
    practical_benefit: 'improved academic performance and knowledge mastery',
  },
};

/**
 * Generates category-adapted contextual language templates
 *
 * NOTE: This is a template reference. Actual contextual language generation happens
 * in the Phase 1 LLM call with these templates as guidance patterns.
 *
 * The LLM receives these templates in the system prompt and generates
 * course-specific contextual language that follows the template patterns
 * but is adapted to the actual course topic and context.
 *
 * @param category - Course category
 * @returns Template structure for LLM prompt reference
 */
export function getContextualLanguageTemplates(category: CourseCategory): CategoryTemplate {
  return CATEGORY_TEMPLATES[category];
}

/**
 * Builds the contextual language template section for Phase 1 system prompt
 *
 * This function generates a formatted string that documents all category templates
 * for inclusion in the Phase 1 system prompt. The LLM uses these templates as
 * reference patterns when generating category-specific contextual language.
 *
 * @returns Formatted template documentation for system prompt
 */
export function buildContextualLanguagePromptSection(): string {
  const sections: string[] = [
    'CONTEXTUAL LANGUAGE TEMPLATES (Reference Patterns):',
    '',
    'Use these templates to guide category-specific language generation:',
    '',
  ];

  for (const [category, template] of Object.entries(CATEGORY_TEMPLATES)) {
    sections.push(`${category.toUpperCase()}:`);
    sections.push(`- Why Matters: ${template.why_matters}`);
    sections.push(`- Motivators: ${template.motivators}`);
    sections.push(`- Experience Prompt: ${template.experience_prompt}`);
    sections.push(`- Problem Statement: ${template.problem_statement}`);
    sections.push(`- Knowledge Bridge: ${template.knowledge_bridge}`);
    sections.push(`- Practical Benefit: ${template.practical_benefit}`);
    sections.push('');
  }

  return sections.join('\n');
}
