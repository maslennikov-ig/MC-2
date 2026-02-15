/**
 * Overlap Detection Unit Tests
 * @module tests/unit/shared/validation/overlap-detection
 *
 * Comprehensive unit tests for overlap detection system used in Stage 4 and Stage 5.
 * Tests QualityValidator.detectOverlapFromTexts() core method, Stage 4 wrapper,
 * and Stage 5 feedback builder.
 *
 * Framework: Vitest (NOT Jest)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  QualityValidator,
  OVERLAP_THRESHOLDS,
  type CrossSectionOverlapResult,
} from '@/shared/validation/quality-validator';
import type { Section } from '@megacampus/shared-types';
import * as jinaClient from '@/shared/embeddings/jina-client';
import {
  detectSectionBreakdownOverlap,
  buildOverlapFeedback,
  type SectionOverlapResult,
} from '@/stages/stage4-analysis/phases/phase-2-scope-helpers';
import { buildSectionOverlapFeedback } from '@/stages/stage5-generation/orchestrator-helpers';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/shared/embeddings/jina-client', () => ({
  generateEmbedding: vi.fn(),
  generateEmbeddings: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ============================================================================
// MOCK EMBEDDING HELPERS
// ============================================================================

/** Generate a deterministic 768D embedding based on a seed */
function makeEmbedding(seed: number): number[] {
  return Array(768)
    .fill(0)
    .map((_, i) => Math.sin((i + seed * 100) / 100));
}

/** Generate a 768D embedding very similar to another (for overlap testing) */
function makeSimilarEmbedding(base: number[], noise: number = 0.01): number[] {
  return base.map(v => v + (Math.random() - 0.5) * noise);
}

/** Generate a 768D embedding orthogonal to others (for no-overlap testing) */
function makeOrthogonalEmbedding(index: number): number[] {
  const vec = Array(768).fill(0);
  vec[index % 768] = 1;
  return vec;
}

// ============================================================================
// MOCK SECTION FACTORY (for Stage 5 tests)
// ============================================================================

function makeSection(number: number, title: string, lessonTitles: string[]): Section {
  return {
    section_number: number,
    section_title: title,
    section_description: `Description for ${title}`,
    learning_objectives: [`Understand ${title}`],
    lessons: lessonTitles.map((lt, i) => ({
      lesson_number: i + 1,
      lesson_title: lt,
      lesson_description: `Description for ${lt}`,
      lesson_objectives: [`Learn about ${lt}`],
      key_topics: [`Topic of ${lt}`],
      estimated_duration_minutes: 15,
    })),
  } as Section;
}

// ============================================================================
// TEST SUITE 1: QualityValidator.detectOverlapFromTexts() — CORE METHOD
// ============================================================================

describe('QualityValidator.detectOverlapFromTexts() - core unified method', () => {
  let validator: QualityValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    validator = new QualityValidator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect NO overlap when sections have orthogonal embeddings', async () => {
    const texts = ['Section 1 text', 'Section 2 text', 'Section 3 text'];
    const labels = ['Section 1', 'Section 2', 'Section 3'];

    // Generate orthogonal embeddings (no similarity)
    const embeddings = [
      makeOrthogonalEmbedding(0),
      makeOrthogonalEmbedding(200),
      makeOrthogonalEmbedding(400),
    ];

    vi.mocked(jinaClient.generateEmbeddings).mockResolvedValueOnce(embeddings);

    const result = await validator.detectOverlapFromTexts(texts, labels, 'en', 0.8);

    expect(result.hasOverlap).toBe(false);
    expect(result.overlapCount).toBe(0);
    expect(result.overlappingPairs).toHaveLength(0);
    expect(result.overlapThreshold).toBe(0.8);
  });

  it('should detect overlap when sections have nearly identical embeddings', async () => {
    const texts = ['Section 1 text', 'Section 2 text'];
    const labels = ['Section 1', 'Section 2'];

    // Generate nearly identical embeddings (high similarity)
    const baseEmbedding = makeEmbedding(42);
    const similarEmbedding = makeSimilarEmbedding(baseEmbedding, 0.001); // Very low noise

    const embeddings = [baseEmbedding, similarEmbedding];

    vi.mocked(jinaClient.generateEmbeddings).mockResolvedValueOnce(embeddings);

    const result = await validator.detectOverlapFromTexts(texts, labels, 'en', 0.8);

    expect(result.hasOverlap).toBe(true);
    expect(result.overlapCount).toBeGreaterThan(0);
    expect(result.overlappingPairs).toHaveLength(1);
    expect(result.overlappingPairs[0].sectionA).toBe(1);
    expect(result.overlappingPairs[0].sectionB).toBe(2);
    expect(result.overlappingPairs[0].similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('should NOT detect overlap at exact threshold boundary (>= not >)', async () => {
    const texts = ['Section 1 text', 'Section 2 text'];
    const labels = ['Section 1', 'Section 2'];

    // Mock cosine similarity to return exactly 0.80 (at threshold)
    const baseEmbedding = makeEmbedding(42);
    // Adjust noise to get similarity just below threshold
    const embeddings = [baseEmbedding, makeOrthogonalEmbedding(100)];

    vi.mocked(jinaClient.generateEmbeddings).mockResolvedValueOnce(embeddings);

    const result = await validator.detectOverlapFromTexts(texts, labels, 'en', 0.8);

    // Orthogonal embeddings should have ~0 similarity, not at threshold
    expect(result.hasOverlap).toBe(false);
    expect(result.overlappingPairs).toHaveLength(0);
  });

  it('should apply language adjustment for Russian (-0.05)', async () => {
    const texts = ['Раздел 1', 'Раздел 2'];
    const labels = ['Раздел 1', 'Раздел 2'];

    // Generate embeddings with similarity 0.76 (below 0.80, but above 0.75)
    const baseEmbedding = makeEmbedding(42);
    const embeddings = [baseEmbedding, makeOrthogonalEmbedding(100)];

    vi.mocked(jinaClient.generateEmbeddings).mockResolvedValueOnce(embeddings);

    const result = await validator.detectOverlapFromTexts(texts, labels, 'ru', 0.8);

    // Effective threshold: 0.80 + (-0.05) = 0.75 for Russian
    expect(result.overlapThreshold).toBe(0.75);
  });

  it('should return empty result for single section (need 2+ for comparison)', async () => {
    const texts = ['Section 1 text'];
    const labels = ['Section 1'];

    const result = await validator.detectOverlapFromTexts(texts, labels, 'en', 0.8);

    expect(result.hasOverlap).toBe(false);
    expect(result.overlapCount).toBe(0);
    expect(result.overlappingPairs).toHaveLength(0);
    expect(jinaClient.generateEmbeddings).not.toHaveBeenCalled();
  });

  it('should return no overlap on API failure (non-blocking)', async () => {
    const texts = ['Section 1 text', 'Section 2 text'];
    const labels = ['Section 1', 'Section 2'];

    // Mock API failure
    vi.mocked(jinaClient.generateEmbeddings).mockRejectedValueOnce(
      new Error('Jina API failed')
    );

    const result = await validator.detectOverlapFromTexts(texts, labels, 'en', 0.8);

    expect(result.hasOverlap).toBe(false);
    expect(result.overlapCount).toBe(0);
    expect(result.overlappingPairs).toHaveLength(0);
  });

  it('should use correct thresholds: stage4=0.80, stage5=0.75', () => {
    expect(OVERLAP_THRESHOLDS.stage4).toBe(0.8);
    expect(OVERLAP_THRESHOLDS.stage5).toBe(0.75);
  });

  it('should detect overlap in JAM-6506 real-world scenario (Russian bioritmy modules)', async () => {
    // Simulate the real case: modules about "биоритмы" with high semantic similarity
    const texts = [
      'Модуль 1: Введение в когнитивную нейронауку',
      'Модуль 2: Хронотипы и биоритмы',
      'Модуль 3: Память и забывание',
      'Модуль 4: Внимание и концентрация',
      'Модуль 5: Эмоциональный интеллект',
      'Модуль 6: Принятие решений',
      'Модуль 7: Нейро-лидерство: управление биоритмами',
      'Модуль 8: Когнитивная эргономика',
    ];

    const labels = texts;

    // Create embeddings where Module 2 and Module 7 are highly similar
    const biorhythmsEmbedding = makeEmbedding(42);
    const neuroLeadershipEmbedding = makeSimilarEmbedding(biorhythmsEmbedding, 0.05);

    const embeddings = [
      makeOrthogonalEmbedding(0), // Module 1
      biorhythmsEmbedding, // Module 2 (биоритмы)
      makeOrthogonalEmbedding(200), // Module 3
      makeOrthogonalEmbedding(300), // Module 4
      makeOrthogonalEmbedding(400), // Module 5
      makeOrthogonalEmbedding(500), // Module 6
      neuroLeadershipEmbedding, // Module 7 (управление биоритмами)
      makeOrthogonalEmbedding(700), // Module 8
    ];

    vi.mocked(jinaClient.generateEmbeddings).mockResolvedValueOnce(embeddings);

    const result = await validator.detectOverlapFromTexts(texts, labels, 'ru', 0.75);

    expect(result.hasOverlap).toBe(true);
    expect(result.overlappingPairs.length).toBeGreaterThan(0);

    // Module 2 and Module 7 should be in overlappingPairs
    const hasModule2And7Overlap = result.overlappingPairs.some(
      pair =>
        (pair.sectionA === 2 && pair.sectionB === 7) ||
        (pair.sectionA === 7 && pair.sectionB === 2)
    );
    expect(hasModule2And7Overlap).toBe(true);
  });
});

// ============================================================================
// TEST SUITE 2: detectSectionBreakdownOverlap() — STAGE 4 WRAPPER
// ============================================================================

describe('detectSectionBreakdownOverlap() - Stage 4 wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect duplicate modules with similar area + key_topics', async () => {
    const sections = [
      {
        area: 'Биоритмы и хронотипы',
        key_topics: ['циркадные ритмы', 'сон', 'продуктивность'],
        learning_objectives: ['Понять влияние биоритмов'],
      },
      {
        area: 'Управление биоритмами',
        key_topics: ['циркадные ритмы', 'оптимизация сна', 'повышение продуктивности'],
        learning_objectives: ['Научиться управлять биоритмами'],
      },
    ];

    // Generate highly similar embeddings
    const baseEmbedding = makeEmbedding(42);
    const similarEmbedding = makeSimilarEmbedding(baseEmbedding, 0.01);

    vi.mocked(jinaClient.generateEmbeddings).mockResolvedValueOnce([
      baseEmbedding,
      similarEmbedding,
    ]);

    const result = await detectSectionBreakdownOverlap(sections, 'ru');

    expect(result.hasOverlap).toBe(true);
    expect(result.overlappingPairs.length).toBe(1);
    expect(result.overlappingPairs[0].areaA).toBe('Биоритмы и хронотипы');
    expect(result.overlappingPairs[0].areaB).toBe('Управление биоритмами');
    expect(result.overlappingPairs[0].similarity).toBeGreaterThanOrEqual(0.75);
  });

  it('should NOT detect overlap for distinct modules', async () => {
    const sections = [
      {
        area: 'Introduction to Programming',
        key_topics: ['variables', 'data types', 'control flow'],
        learning_objectives: ['Understand basic programming'],
      },
      {
        area: 'Database Design',
        key_topics: ['normalization', 'SQL', 'relationships'],
        learning_objectives: ['Master database fundamentals'],
      },
    ];

    // Generate orthogonal embeddings
    const embeddings = [makeOrthogonalEmbedding(0), makeOrthogonalEmbedding(400)];

    vi.mocked(jinaClient.generateEmbeddings).mockResolvedValueOnce(embeddings);

    const result = await detectSectionBreakdownOverlap(sections, 'en');

    expect(result.hasOverlap).toBe(false);
    expect(result.overlappingPairs).toHaveLength(0);
  });

  it('should return empty result for single section', async () => {
    const sections = [
      {
        area: 'Single Module',
        key_topics: ['topic1'],
        learning_objectives: ['objective1'],
      },
    ];

    const result = await detectSectionBreakdownOverlap(sections, 'en');

    expect(result.hasOverlap).toBe(false);
    expect(result.overlappingPairs).toHaveLength(0);
    expect(result.threshold).toBe(OVERLAP_THRESHOLDS.stage4);
  });
});

// ============================================================================
// TEST SUITE 3: buildOverlapFeedback() — STAGE 4 FEEDBACK BUILDER
// ============================================================================

describe('buildOverlapFeedback() - Stage 4 feedback builder', () => {
  it('should build feedback for overlapping pair with section names and instructions', () => {
    const overlapResult: SectionOverlapResult = {
      hasOverlap: true,
      overlappingPairs: [
        {
          sectionIndexA: 1,
          sectionIndexB: 7,
          areaA: 'Хронотипы и биоритмы',
          areaB: 'Нейро-лидерство: управление биоритмами',
          similarity: 0.82,
        },
      ],
      threshold: 0.75,
    };

    const feedback = buildOverlapFeedback(overlapResult);

    expect(feedback).toContain('CRITICAL');
    expect(feedback).toContain('Section 1');
    expect(feedback).toContain('Section 7');
    expect(feedback).toContain('Хронотипы и биоритмы');
    expect(feedback).toContain('Нейро-лидерство: управление биоритмами');
    expect(feedback).toContain('82% content overlap');
    expect(feedback).toContain('MERGE');
    expect(feedback).toContain('CLEARLY DIFFERENTIATE');
    expect(feedback).toContain('UNIQUE aspect');
  });

  it('should return empty string when no overlap detected', () => {
    const overlapResult: SectionOverlapResult = {
      hasOverlap: false,
      overlappingPairs: [],
      threshold: 0.75,
    };

    const feedback = buildOverlapFeedback(overlapResult);

    expect(feedback).toBe('');
  });

  it('should handle multiple overlapping pairs', () => {
    const overlapResult: SectionOverlapResult = {
      hasOverlap: true,
      overlappingPairs: [
        {
          sectionIndexA: 1,
          sectionIndexB: 3,
          areaA: 'Module A',
          areaB: 'Module C',
          similarity: 0.85,
        },
        {
          sectionIndexA: 2,
          sectionIndexB: 4,
          areaA: 'Module B',
          areaB: 'Module D',
          similarity: 0.78,
        },
      ],
      threshold: 0.75,
    };

    const feedback = buildOverlapFeedback(overlapResult);

    expect(feedback).toContain('Section 1');
    expect(feedback).toContain('Section 3');
    expect(feedback).toContain('Section 2');
    expect(feedback).toContain('Section 4');
    expect(feedback).toContain('85% content overlap');
    expect(feedback).toContain('78% content overlap');
  });
});

// ============================================================================
// TEST SUITE 4: buildSectionOverlapFeedback() — STAGE 5 FEEDBACK BUILDER
// ============================================================================

describe('buildSectionOverlapFeedback() - Stage 5 feedback builder (PURE FUNCTION)', () => {
  it('should build feedback map for overlapping pair with lesson titles', () => {
    const sections: Section[] = [
      makeSection(1, 'Sleep Science', ['Circadian Rhythms', 'Sleep Cycles', 'REM Sleep']),
      makeSection(2, 'Memory Formation', ['Short-term Memory', 'Long-term Memory', 'Encoding']),
      makeSection(3, 'Biorhythm Management', [
        'Sleep Optimization',
        'Circadian Clock',
        'Productivity Peaks',
      ]),
    ];

    const overlapResult: CrossSectionOverlapResult = {
      hasOverlap: true,
      overlapCount: 1,
      overlapThreshold: 0.75,
      overlappingPairs: [
        {
          sectionA: 1,
          sectionB: 3,
          similarity: 0.82,
          sectionATitle: 'Sleep Science',
          sectionBTitle: 'Biorhythm Management',
        },
      ],
    };

    const feedbackMap = buildSectionOverlapFeedback(overlapResult, sections);

    expect(feedbackMap.size).toBe(2);

    // Section 1 should reference Section 3's lessons
    const section1Feedback = feedbackMap.get(0); // 0-based index
    expect(section1Feedback).toContain('Section 3');
    expect(section1Feedback).toContain('Biorhythm Management');
    expect(section1Feedback).toContain('Sleep Optimization');
    expect(section1Feedback).toContain('Circadian Clock');
    expect(section1Feedback).toContain('Productivity Peaks');
    expect(section1Feedback).toContain('MUST NOT duplicate');

    // Section 3 should reference Section 1's lessons
    const section3Feedback = feedbackMap.get(2); // 0-based index
    expect(section3Feedback).toContain('Section 1');
    expect(section3Feedback).toContain('Sleep Science');
    expect(section3Feedback).toContain('Circadian Rhythms');
    expect(section3Feedback).toContain('Sleep Cycles');
    expect(section3Feedback).toContain('REM Sleep');
  });

  it('should include similarity percentage in feedback', () => {
    const sections: Section[] = [
      makeSection(1, 'Section A', ['Lesson A1']),
      makeSection(2, 'Section B', ['Lesson B1']),
    ];

    const overlapResult: CrossSectionOverlapResult = {
      hasOverlap: true,
      overlapCount: 1,
      overlapThreshold: 0.75,
      overlappingPairs: [
        {
          sectionA: 1,
          sectionB: 2,
          similarity: 0.87,
          sectionATitle: 'Section A',
          sectionBTitle: 'Section B',
        },
      ],
    };

    const feedbackMap = buildSectionOverlapFeedback(overlapResult, sections);

    const feedback = feedbackMap.get(0);
    expect(feedback).toContain('87%'); // 0.87 * 100 = 87%
    expect(feedback).toContain('OVERLAP CORRECTION');
    expect(feedback).toContain('REJECTED');
  });

  it('should handle section involved in multiple overlapping pairs (combined feedback)', () => {
    const sections: Section[] = [
      makeSection(1, 'Section A', ['Lesson A1']),
      makeSection(2, 'Section B', ['Lesson B1']),
      makeSection(3, 'Section C', ['Lesson C1']),
    ];

    const overlapResult: CrossSectionOverlapResult = {
      hasOverlap: true,
      overlapCount: 2,
      overlapThreshold: 0.75,
      overlappingPairs: [
        {
          sectionA: 1,
          sectionB: 2,
          similarity: 0.8,
          sectionATitle: 'Section A',
          sectionBTitle: 'Section B',
        },
        {
          sectionA: 1,
          sectionB: 3,
          similarity: 0.78,
          sectionATitle: 'Section A',
          sectionBTitle: 'Section C',
        },
      ],
    };

    const feedbackMap = buildSectionOverlapFeedback(overlapResult, sections);

    // Section 1 (index 0) should have combined feedback for both pairs
    const section1Feedback = feedbackMap.get(0);
    expect(section1Feedback).toContain('Section 2');
    expect(section1Feedback).toContain('Section 3');
    expect(section1Feedback).toContain('Lesson B1');
    expect(section1Feedback).toContain('Lesson C1');
  });

  it('should return empty map when no overlap detected', () => {
    const sections: Section[] = [
      makeSection(1, 'Section A', ['Lesson A1']),
      makeSection(2, 'Section B', ['Lesson B1']),
    ];

    const overlapResult: CrossSectionOverlapResult = {
      hasOverlap: false,
      overlapCount: 0,
      overlapThreshold: 0.75,
      overlappingPairs: [],
    };

    const feedbackMap = buildSectionOverlapFeedback(overlapResult, sections);

    expect(feedbackMap.size).toBe(0);
  });
});
