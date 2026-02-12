/**
 * Context Optimization Benchmark Test
 * @module tests/unit/context-optimization-benchmark
 *
 * Validates Phase 3 gate: >=60% token reduction when using
 * skeleton + targeted context vs full course_structure.
 *
 * Token estimation: ~4 chars per token (conservative for mixed content).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildCourseSkeleton,
  resolveTargetedContext,
} from '../../src/server/routers/generation/editing/chat-helpers.js';
import type { CourseStructure } from '@megacampus/shared-types';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../src/shared/logger/index.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// HELPERS
// ============================================================================

/** Estimate token count from string length (~4 chars/token) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Create a realistic course structure with specified dimensions.
 * Each lesson has full metadata (objectives, topics, duration).
 */
function createRealisticStructure(
  sectionCount: number,
  lessonsPerSection: number
): CourseStructure {
  const sections = [];
  for (let si = 0; si < sectionCount; si++) {
    const lessons = [];
    for (let li = 0; li < lessonsPerSection; li++) {
      lessons.push({
        id: `lsn_${si}_${li}`,
        lesson_title: `Lesson ${si + 1}.${li + 1}: Understanding ${['Machine Learning', 'Neural Networks', 'Data Science', 'Deep Learning', 'NLP', 'Computer Vision'][li % 6]} fundamentals and applications`,
        lesson_number: si + 1 + (li + 1) * 0.1,
        lesson_objectives: [
          `Understand the core principles of topic ${si}.${li}`,
          `Apply learned concepts to real-world scenarios in domain ${si}`,
          `Evaluate different approaches and their trade-offs`,
        ],
        key_topics: [
          `Theoretical foundations of topic ${si}.${li}`,
          `Practical implementation patterns`,
          `Common pitfalls and best practices`,
          `Industry applications and case studies`,
        ],
        estimated_duration_minutes: 20 + (li % 3) * 10,
      });
    }
    sections.push({
      id: `sec_${si}`,
      section_title: `Section ${si + 1}: ${['Introduction to AI', 'Core Algorithms', 'Practical Applications', 'Advanced Topics', 'Case Studies', 'Research Frontiers', 'Ethics and Society', 'Future Directions'][si % 8]}`,
      section_description: `This section covers comprehensive material about the fundamentals and advanced concepts in area ${si + 1}, including theoretical background, practical exercises, and real-world applications.`,
      section_number: si + 1,
      learning_objectives: [
        `Master the fundamental concepts of area ${si + 1}`,
        `Develop practical skills through hands-on exercises`,
        `Analyze and evaluate different approaches critically`,
      ],
      estimated_duration_minutes: lessons.reduce((sum, l) => sum + l.estimated_duration_minutes, 0),
      lessons,
    });
  }

  return {
    course_title: 'Comprehensive Machine Learning: From Theory to Production',
    course_description:
      'A comprehensive course covering machine learning from fundamentals to production deployment, including deep learning, NLP, computer vision, and ethical considerations.',
    target_audience: 'Software engineers with 2+ years experience',
    estimated_duration_hours: sections.reduce(
      (sum, s) => sum + s.estimated_duration_minutes / 60,
      0
    ),
    difficulty_level: 'intermediate',
    prerequisites: [
      'Basic Python programming',
      'Linear algebra fundamentals',
      'Statistics and probability',
    ],
    sections,
  };
}

// ============================================================================
// BENCHMARK TESTS
// ============================================================================

describe('Context optimization benchmark (Phase 3 gate)', () => {
  it('should achieve >=60% token reduction for typical course (8 sections, 3 lessons each)', () => {
    const structure = createRealisticStructure(8, 3);

    // Full course_structure as JSON (what was sent before Phase 3)
    const fullContextStr = JSON.stringify(structure, null, 2);
    const fullTokens = estimateTokens(fullContextStr);

    // Targeted context: skeleton + single element (what is sent now)
    const result = resolveTargetedContext({
      classifiedIntent: {
        intent: 'REWRITE_CONTENT',
        confidence: 0.9,
        target: { identifier: null, path: 'sections[2].lessons[1]' },
      },
      courseStructure: structure,
    });

    const skeletonTokens = estimateTokens(result.courseSkeleton);
    const targetedContextStr = JSON.stringify(result.targetedContext, null, 2);
    const targetedContextTokens = estimateTokens(targetedContextStr);
    const optimizedTokens = skeletonTokens + targetedContextTokens;

    const reductionPercent = ((fullTokens - optimizedTokens) / fullTokens) * 100;

    expect(reductionPercent).toBeGreaterThanOrEqual(60);
    expect(fullTokens).toBeGreaterThan(3000); // Ensure the test is meaningful
    expect(optimizedTokens).toBeLessThan(fullTokens * 0.4); // <40% of original
  });

  it('should achieve >=60% token reduction for large course (12 sections, 5 lessons each)', () => {
    const structure = createRealisticStructure(12, 5);

    const fullContextStr = JSON.stringify(structure, null, 2);
    const fullTokens = estimateTokens(fullContextStr);

    const result = resolveTargetedContext({
      classifiedIntent: {
        intent: 'EXPAND_CONTENT',
        confidence: 0.85,
        target: { identifier: null, path: 'sections[5].lessons[3]' },
      },
      courseStructure: structure,
    });

    const skeletonTokens = estimateTokens(result.courseSkeleton);
    const targetedContextStr = JSON.stringify(result.targetedContext, null, 2);
    const targetedContextTokens = estimateTokens(targetedContextStr);
    const optimizedTokens = skeletonTokens + targetedContextTokens;

    const reductionPercent = ((fullTokens - optimizedTokens) / fullTokens) * 100;

    expect(reductionPercent).toBeGreaterThanOrEqual(60);
    expect(fullTokens).toBeGreaterThan(10000); // Large course
  });

  it('should keep skeleton compact (~300-500 tokens for 8 sections)', () => {
    const structure = createRealisticStructure(8, 3);
    const skeleton = buildCourseSkeleton(structure, 'lsn_2_1');
    const skeletonTokens = estimateTokens(skeleton);

    // Skeleton should be in the 200-800 token range
    expect(skeletonTokens).toBeLessThan(800);
    expect(skeletonTokens).toBeGreaterThan(100);
  });

  it('should expand only target section in skeleton, collapse others', () => {
    const structure = createRealisticStructure(8, 3);
    const skeleton = buildCourseSkeleton(structure, 'lsn_3_1');

    // Target section (index 3) should show individual lessons
    expect(skeleton).toContain('lsn_3_1');

    // Other sections should be collapsed
    expect(skeleton).toContain('collapsed');
  });

  it('should return full outline when no specific target is resolved', () => {
    const structure = createRealisticStructure(8, 3);

    const result = resolveTargetedContext({
      classifiedIntent: {
        intent: 'REWRITE_CONTENT',
        confidence: 0.8,
        target: undefined,
      },
      courseStructure: structure,
    });

    // Without a target, returns course outline (not full structure)
    expect(result.targetPath).toBeNull();
    // Still provides skeleton
    expect(result.courseSkeleton).toBeDefined();
    expect(result.courseSkeleton.length).toBeGreaterThan(0);
  });

  it('should show quantified before/after metrics', () => {
    const structure = createRealisticStructure(8, 3);
    const fullContextStr = JSON.stringify(structure, null, 2);
    const fullTokens = estimateTokens(fullContextStr);

    const result = resolveTargetedContext({
      classifiedIntent: {
        intent: 'SIMPLIFY_CONTENT',
        confidence: 0.9,
        target: { identifier: null, path: 'sections[0].lessons[0]' },
      },
      courseStructure: structure,
    });

    const skeletonTokens = estimateTokens(result.courseSkeleton);
    const targetedTokens = estimateTokens(JSON.stringify(result.targetedContext, null, 2));
    const totalOptimized = skeletonTokens + targetedTokens;
    const reductionPercent = ((fullTokens - totalOptimized) / fullTokens) * 100;

    // Log metrics for visibility (not assertions)
    console.log('=== Phase 3 Context Optimization Metrics ===');
    console.log(`Full structure: ~${fullTokens} tokens`);
    console.log(`Skeleton: ~${skeletonTokens} tokens`);
    console.log(`Targeted context: ~${targetedTokens} tokens`);
    console.log(`Total optimized: ~${totalOptimized} tokens`);
    console.log(`Reduction: ${reductionPercent.toFixed(1)}%`);
    console.log('=============================================');

    // The gate: >=60% reduction
    expect(reductionPercent).toBeGreaterThanOrEqual(60);
  });
});
