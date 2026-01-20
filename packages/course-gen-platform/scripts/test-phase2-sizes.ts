#!/usr/bin/env tsx
/**
 * Atomic Test: Phase 2 Scope with different course sizes
 * Tests that Phase 2 respects course size constraints for MICRO, MINI, COMPACT
 */

import { config } from 'dotenv';
import { randomUUID } from 'crypto';
config();

import { runPhase2Scope } from '../src/stages/stage4-analysis/phases/phase-2-scope';
import type { Phase2Input } from '@megacampus/shared-types/analysis-schemas';
import { getCourseSizePreset, type PresetCourseSize } from '@megacampus/shared-types';

const TEST_TOPIC = 'Основы цифрового маркетинга';

// Expected styles for each size
const SIZE_STYLES: Record<PresetCourseSize, string> = {
  micro: 'storytelling',
  mini: 'academic',
  compact: 'business',
  standard: 'practical',
  comprehensive: 'practical',
};

async function testPhase2Size(size: PresetCourseSize): Promise<boolean> {
  console.log('\n' + '═'.repeat(60));
  console.log(`  Atomic Test: Phase 2 Scope - ${size.toUpperCase()} preset`);
  console.log('═'.repeat(60));

  const sizePreset = getCourseSizePreset(size);
  if (!sizePreset) {
    console.error(`No preset found for size: ${size}`);
    return false;
  }

  console.log('\nExpected constraints:');
  console.log(`  Target lessons: ${sizePreset.targetLessons}`);
  console.log(`  Target sections: ${sizePreset.targetSections}`);
  console.log(`  Min lessons: ${sizePreset.minLessons}`);
  console.log(`  Max lessons: ${sizePreset.maxLessons}`);
  console.log(`  Style: ${SIZE_STYLES[size]}`);

  // Valid Phase 1 output matching Phase2InputSchema
  const mockPhase1Output = {
    course_category: {
      primary: 'professional' as const,
      confidence: 0.95,
      reasoning: 'Digital marketing is a professional skill essential for modern business.',
      secondary: null,
    },
    topic_analysis: {
      determined_topic: TEST_TOPIC,
      information_completeness: 80,
      complexity: size === 'micro' ? ('narrow' as const) : ('medium' as const),
      reasoning: 'Digital marketing basics covers core online promotion strategies and tools.',
      target_audience: 'beginner' as const,
      missing_elements: null,
      key_concepts: [
        'SEO оптимизация',
        'Контент-маркетинг',
        'Социальные сети',
        'Email-маркетинг',
        'Аналитика',
      ],
      domain_keywords: [
        'маркетинг',
        'digital',
        'seo',
        'контент',
        'соцсети',
        'реклама',
        'аналитика',
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
    // Size preset fields
    course_size: sizePreset.size,
    target_lessons: sizePreset.targetLessons,
    target_sections: sizePreset.targetSections,
    size_guidance: sizePreset.llmGuidance,
    min_lessons: sizePreset.minLessons,
    max_lessons: sizePreset.maxLessons,
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
      result.recommended_structure.total_lessons >= sizePreset.minLessons &&
      result.recommended_structure.total_lessons <= sizePreset.maxLessons;

    // For sections, allow 50% tolerance
    const maxSectionsAllowed = Math.ceil(sizePreset.targetSections * 1.5);
    const sectionsOk = result.recommended_structure.total_sections <= maxSectionsAllowed;

    console.log('\n--- Validation ---');
    console.log(
      `Lessons (${sizePreset.minLessons}-${sizePreset.maxLessons}): ${lessonsOk ? '✅ PASS' : '❌ FAIL'} (got ${result.recommended_structure.total_lessons})`
    );
    console.log(
      `Sections (≤${maxSectionsAllowed}): ${sectionsOk ? '✅ PASS' : '❌ FAIL'} (got ${result.recommended_structure.total_sections})`
    );

    return lessonsOk && sectionsOk;
  } catch (error) {
    console.error('\n❌ Phase 2 failed:', error);
    return false;
  }
}

async function main() {
  const sizesToTest: PresetCourseSize[] = ['micro', 'mini', 'compact'];
  const results: Record<string, boolean> = {};

  for (const size of sizesToTest) {
    results[size] = await testPhase2Size(size);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));

  let allPassed = true;
  for (const [size, passed] of Object.entries(results)) {
    console.log(`${size.toUpperCase()}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) allPassed = false;
  }

  if (allPassed) {
    console.log('\n✅ All size constraint tests PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ Some size constraint tests FAILED');
    process.exit(1);
  }
}

main();
