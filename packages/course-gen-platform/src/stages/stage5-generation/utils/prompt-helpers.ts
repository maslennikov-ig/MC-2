import type { FrontendParameters } from '@megacampus/shared-types';
import { getCourseSizePreset, type CourseSize } from '@megacampus/shared-types/course-size';

/**
 * Build user context section for LLM prompts (DRY utility)
 * Used by metadata-generator and section batch prompt-builder
 */
export function buildUserContextSection(params: FrontendParameters): string {
  let context = '';

  if (params.description) {
    context += `**User Requirements**: ${params.description}\n\n`;
  }

  if (params.target_audience) {
    context += `**Target Audience**: ${params.target_audience}\n\n`;
  }

  if (params.learning_outcomes?.length) {
    context += `**Required Learning Outcomes** (MUST be included in course):\n`;
    params.learning_outcomes.forEach((outcome, i) => {
      context += `${i + 1}. ${outcome}\n`;
    });
    context += '\n';
  }

  if (params.course_size && params.course_size !== 'auto') {
    const preset = getCourseSizePreset(params.course_size as CourseSize);
    if (preset?.llmGuidance) {
      context += `**Course Size Guidance**: ${preset.llmGuidance}\n\n`;
    }
  } else if (params.desired_lessons_count || params.desired_modules_count) {
    context += `**Structure Guidance**:\n`;
    if (params.desired_lessons_count) {
      context += `- Target: ~${params.desired_lessons_count} lessons\n`;
    }
    if (params.desired_modules_count) {
      context += `- Target: ~${params.desired_modules_count} sections\n`;
    }
    context += '\n';
  }

  return context;
}
