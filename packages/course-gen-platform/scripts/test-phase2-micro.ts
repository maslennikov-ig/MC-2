#!/usr/bin/env tsx
/**
 * Atomic Test: Phase 2 Scope with MICRO preset
 * Tests that Phase 2 respects course size constraints
 */

import { config } from 'dotenv';
import { randomUUID } from 'crypto';
config();

import { runPhase2Scope } from '../src/stages/stage4-analysis/phases/phase-2-scope';
import type { Phase2Input } from '@megacampus/shared-types/analysis-schemas';
import { getCourseSizePreset } from '@megacampus/shared-types';

const TEST_TOPIC = 'Основы тайм-менеджмента';

async function testPhase2Micro() {
  console.log('═'.repeat(60));
  console.log('  Atomic Test: Phase 2 Scope - MICRO preset');
  console.log('═'.repeat(60));

  const sizePreset = getCourseSizePreset('micro');
  console.log('\nExpected constraints:');
  console.log(`  Target lessons: ${sizePreset?.targetLessons}`);
  console.log(`  Target sections: ${sizePreset?.targetSections}`);
  console.log(`  Min lessons: ${sizePreset?.minLessons}`);
  console.log(`  Max lessons: ${sizePreset?.maxLessons}`);
  console.log(`  LLM Guidance: ${sizePreset?.llmGuidance?.substring(0, 80)}...`);

  // Valid Phase 1 output matching Phase2InputSchema
  const mockPhase1Output = {
    course_category: {
      primary: 'professional' as const,
      confidence: 0.95,
      reasoning:
        'Time management is a professional skill used in workplace productivity and career development.',
      secondary: null,
    },
    topic_analysis: {
      determined_topic: TEST_TOPIC,
      information_completeness: 80,
      complexity: 'narrow' as const,
      reasoning:
        'Time management basics is a focused topic covering core planning and prioritization skills suitable for beginners.',
      target_audience: 'beginner' as const,
      missing_elements: null,
      key_concepts: [
        'Планирование времени',
        'Приоритизация задач',
        'Управление отвлечениями',
        'Техники продуктивности',
        'Цели и дедлайны',
      ],
      domain_keywords: [
        'тайм-менеджмент',
        'планирование',
        'продуктивность',
        'приоритеты',
        'задачи',
        'время',
        'эффективность',
      ],
    },
    phase_metadata: {
      duration_ms: 1000,
      model_used: 'test-model',
      tokens: { input: 100, output: 200, total: 300 },
      quality_score: 0.9,
      retry_count: 0,
    },
  };

  const phase2Input: Phase2Input = {
    course_id: randomUUID(),
    language: 'ru',
    topic: TEST_TOPIC,
    document_summaries: null,
    phase1_output: mockPhase1Output,
    // MICRO preset fields
    course_size: sizePreset?.size,
    target_lessons: sizePreset?.targetLessons,
    target_sections: sizePreset?.targetSections,
    size_guidance: sizePreset?.llmGuidance,
    min_lessons: sizePreset?.minLessons,
    max_lessons: sizePreset?.maxLessons,
  };

  console.log('\n--- Running Phase 2 ---');
  const startTime = Date.now();

  try {
    const result = await runPhase2Scope(phase2Input);
    const duration = Date.now() - startTime;

    console.log('\n--- Results ---');
    console.log(`Duration: ${duration}ms`);
    console.log(`Total lessons: ${result.recommended_structure.total_lessons}`);
    console.log(`Total sections: ${result.recommended_structure.total_sections}`);
    console.log(`Estimated hours: ${result.recommended_structure.estimated_content_hours}`);
    console.log(`Lesson duration: ${result.recommended_structure.lesson_duration_minutes}min`);

    console.log('\nSections breakdown:');
    result.recommended_structure.sections_breakdown.forEach((section, idx) => {
      console.log(
        `  ${idx + 1}. ${section.area} (${section.estimated_lessons} lessons, ${section.difficulty})`
      );
    });

    // Validate against expected constraints
    const lessonsOk =
      result.recommended_structure.total_lessons >= (sizePreset?.minLessons || 1) &&
      result.recommended_structure.total_lessons <= (sizePreset?.maxLessons || 5);
    const sectionsOk = result.recommended_structure.total_sections <= 2; // Allow some tolerance

    console.log('\n--- Validation ---');
    console.log(
      `Lessons (${sizePreset?.minLessons}-${sizePreset?.maxLessons}): ${lessonsOk ? '✅ PASS' : '❌ FAIL'} (got ${result.recommended_structure.total_lessons})`
    );
    console.log(
      `Sections (≤${sizePreset?.targetSections}): ${sectionsOk ? '✅ PASS' : '❌ FAIL'} (got ${result.recommended_structure.total_sections})`
    );

    if (!lessonsOk || !sectionsOk) {
      console.log('\n❌ MICRO constraint validation FAILED');
      process.exit(1);
    } else {
      console.log('\n✅ MICRO constraint validation PASSED');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Phase 2 failed:', error);
    process.exit(1);
  }
}

testPhase2Micro();
