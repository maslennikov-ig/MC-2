/**
 * Overlap Retry Flow — End-to-End Integration Test
 *
 * Tests the FULL overlap detection → feedback → regeneration → verification cycle
 * for both Stage 4 (sections_breakdown) and Stage 5 (generated sections).
 *
 * Uses JAM-6506 real-world scenario: course "Как стать счастливым" where
 * Module 2 (Хронотипы и биоритмы) and Module 7 (Нейро-лидерство: управление биоритмами)
 * are nearly identical.
 *
 * Flow tested (mirrors orchestrator.retryOverlappingSections):
 * 1. Sections with overlap → detectOverlap() finds duplicate
 * 2. buildSectionOverlapFeedback() generates per-section instructions
 * 3. regenerateSingleSection() → SectionBatchGenerator.generateBatch(overlapFeedback)
 * 4. Re-detect → overlap resolved
 *
 * @module tests/unit/stages/overlap-retry-flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Section, GenerationJobInput } from '@megacampus/shared-types';
import type { SectionBatchResult } from '@/stages/stage5-generation/utils/section-batch/types';

// ============================================================================
// MOCKS — must be before any imports that use these modules
// ============================================================================

vi.mock('@/shared/embeddings/jina-client', () => ({
  generateEmbedding: vi.fn(),
  generateEmbeddings: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn(),
  getEffectiveStageConfig: vi.fn(),
}));

vi.mock('@/stages/stage5-generation/phases/phase3-v2-spec-generator', () => ({
  V2LessonSpecGenerator: class {
    generateV2Specs() {
      return [];
    }
  },
}));

vi.mock('@/stages/stage5-generation/utils/analysis-formatters', () => ({
  formatPedagogicalStrategyForPrompt: vi.fn().mockReturnValue(''),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import * as jinaClient from '@/shared/embeddings/jina-client';
import { detectOverlap, buildSectionOverlapFeedback } from '@/stages/stage5-generation/orchestrator-helpers';
import type { CrossSectionOverlapResult } from '@/shared/validation/quality-validator';
import { OVERLAP_THRESHOLDS } from '@/shared/validation/quality-validator';
import {
  detectSectionBreakdownOverlap,
  buildOverlapFeedback,
  type SectionOverlapResult,
} from '@/stages/stage4-analysis/phases/phase-2-scope-helpers';
import { GenerationPhases } from '@/stages/stage5-generation/phases/generation-phases';
import { SectionBatchGenerator } from '@/stages/stage5-generation/utils/section-batch-generator';
import { MetadataGenerator } from '@/stages/stage5-generation/utils/metadata-generator';
import { QualityValidator } from '@/shared/validation/quality-validator';
import pino from 'pino';

// ============================================================================
// EMBEDDING HELPERS
// ============================================================================

/** Generate a deterministic 768D embedding from a seed */
function makeEmbedding(seed: number): number[] {
  return Array(768)
    .fill(0)
    .map((_, i) => Math.sin((i + seed * 100) / 100));
}

/** Generate embedding very similar to base (for overlap) */
function makeSimilarEmbedding(base: number[], noise: number = 0.01): number[] {
  // Use seeded random for reproducibility
  let rng = 12345;
  return base.map(v => {
    rng = (rng * 16807) % 2147483647;
    const r = (rng / 2147483647 - 0.5) * noise;
    return v + r;
  });
}

/** Generate orthogonal 768D embedding (no overlap) */
function makeOrthogonalEmbedding(index: number): number[] {
  const vec = Array(768).fill(0);
  // Set a few dimensions to create distinct directions
  for (let d = 0; d < 10; d++) {
    vec[(index * 10 + d) % 768] = 1;
  }
  return vec;
}

// ============================================================================
// TEST DATA FACTORIES — JAM-6506 "Как стать счастливым"
// ============================================================================

const testLogger = pino({ level: 'silent' });

function createMinimalInput(): GenerationJobInput {
  return {
    course_id: 'jam-6506-test',
    frontend_parameters: {
      course_title: 'Как стать счастливым',
      language: 'ru',
      course_size: 'auto',
    },
    analysis_result: {
      topic_analysis: {
        determined_topic: 'Когнитивная нейронаука счастья',
        key_concepts: ['биоритмы', 'память', 'эмоции', 'поток'],
        knowledge_areas: [],
        prerequisite_knowledge: [],
        complexity_level: 'intermediate',
        scope_assessment: 'broad',
      },
      recommended_structure: {
        total_sections: 10,
        total_lessons: 40,
        sections_breakdown: createJAM6506SectionsBreakdown(),
        lesson_duration_minutes: 15,
        estimated_content_hours: 10,
        calculation_explanation: 'Test calculation',
      },
      course_category: { primary: 'neuroscience' },
      pedagogical_strategy: {
        approach: 'blended',
        difficulty_progression: 'gradual',
        assessment_strategy: 'formative',
        engagement_hooks: [],
      },
      generation_guidance: {
        emphasis_areas: [],
        avoid_topics: [],
        special_instructions: '',
      },
    },
  } as unknown as GenerationJobInput;
}

function createJAM6506SectionsBreakdown() {
  return [
    { area: 'Введение в когнитивную нейронауку', key_topics: ['нейронаука', 'когнитивные функции'], estimated_lessons: 4 },
    { area: 'Хронотипы и биоритмы', key_topics: ['циркадные ритмы', 'сон', 'продуктивность', 'хронотипы'], estimated_lessons: 4 },
    { area: 'Наука о памяти и забывании', key_topics: ['кратковременная память', 'долговременная память', 'забывание'], estimated_lessons: 4 },
    { area: 'Потоковое состояние (Flow)', key_topics: ['поток', 'концентрация', 'вовлечённость'], estimated_lessons: 4 },
    { area: 'Эмоциональный интеллект', key_topics: ['эмоции', 'саморегуляция', 'эмпатия'], estimated_lessons: 4 },
    { area: 'Принятие решений', key_topics: ['когнитивные искажения', 'рациональность', 'интуиция'], estimated_lessons: 4 },
    { area: 'Нейро-лидерство: управление биоритмами', key_topics: ['циркадные ритмы', 'оптимизация сна', 'повышение продуктивности', 'нейро-лидерство'], estimated_lessons: 4 },
    { area: 'Когнитивная эргономика', key_topics: ['рабочее пространство', 'многозадачность', 'усталость'], estimated_lessons: 4 },
    { area: 'Мастерство концентрации и потока', key_topics: ['медитация', 'внимание', 'поток'], estimated_lessons: 4 },
    { area: 'Нейро-коучинг', key_topics: ['коучинг', 'нейропластичность', 'привычки'], estimated_lessons: 4 },
  ];
}

/** Create 10 Stage 5 sections matching JAM-6506 */
function createJAM6506Sections(): Section[] {
  return [
    makeSection(1, 'Введение в когнитивную нейронауку', [
      'Основы нейронауки',
      'Строение мозга',
      'Нейромедиаторы счастья',
      'Когнитивные функции',
    ]),
    makeSection(2, 'Хронотипы и биоритмы', [
      'Что такое хронотипы',
      'Циркадные ритмы',
      'Оптимизация режима сна',
      'Биоритмы и продуктивность',
    ]),
    makeSection(3, 'Наука о памяти и забывании', [
      'Кратковременная память',
      'Долговременная память',
      'Кривая забывания Эббингауза',
      'Мнемотехники',
    ]),
    makeSection(4, 'Потоковое состояние (Flow)', [
      'Теория потока Чиксентмихайи',
      'Условия входа в поток',
      'Поток и креативность',
      'Практика достижения потока',
    ]),
    makeSection(5, 'Эмоциональный интеллект', [
      'Модели эмоционального интеллекта',
      'Саморегуляция эмоций',
      'Эмпатия и социальные навыки',
      'Развитие эмоционального интеллекта',
    ]),
    makeSection(6, 'Принятие решений', [
      'Когнитивные искажения',
      'Система 1 и Система 2',
      'Рациональное мышление',
      'Интуиция в принятии решений',
    ]),
    // OVERLAPPING with Section 2 — nearly identical topics
    makeSection(7, 'Нейро-лидерство: управление биоритмами', [
      'Нейро-лидерство и биоритмы',
      'Управление циркадными ритмами команды',
      'Биологические часы в рабочем процессе',
      'Оптимизация продуктивности через сон',
    ]),
    makeSection(8, 'Когнитивная эргономика', [
      'Рабочее пространство для мозга',
      'Борьба с многозадачностью',
      'Профилактика когнитивной усталости',
      'Нейроэргономические стратегии',
    ]),
    makeSection(9, 'Мастерство концентрации', [
      'Нейронаука внимания',
      'Техники фокусировки',
      'Медитация и осознанность',
      'Цифровая гигиена',
    ]),
    makeSection(10, 'Нейро-коучинг', [
      'Основы нейро-коучинга',
      'Нейропластичность',
      'Формирование привычек',
      'Личная трансформация',
    ]),
  ];
}

/** Create a FIXED section 7 — completely different from original */
function createFixedSection7(): Section {
  return makeSection(7, 'Нейро-лидерство: стратегии влияния', [
    'Нейронаучные основы лидерства',
    'Когнитивные искажения в управлении командой',
    'Эмоциональная регуляция лидера',
    'Мотивация и нейромедиаторы вознаграждения',
  ]);
}

/** Create a FIXED section 2 — retains core topic but differentiates */
function createFixedSection2(): Section {
  return makeSection(2, 'Хронотипы: индивидуальный подход', [
    'Генетика хронотипов (PER, CRY гены)',
    'Определение вашего хронотипа',
    'Адаптация расписания под хронотип',
    'Социальный джетлаг',
  ]);
}

function makeSection(number: number, title: string, lessonTitles: string[]): Section {
  return {
    section_number: number,
    section_title: title,
    section_description: `Подробное изучение: ${title}`,
    learning_objectives: [`Понять основы: ${title}`],
    lessons: lessonTitles.map((lt, i) => ({
      lesson_number: i + 1,
      lesson_title: lt,
      lesson_description: `Урок: ${lt}`,
      lesson_objectives: [`Изучить: ${lt}`],
      key_topics: [`Тема: ${lt}`],
      estimated_duration_minutes: 15,
    })),
  } as Section;
}

// ============================================================================
// SUITE 1: STAGE 4 — Full Overlap Detection → Feedback → Fix Flow
// ============================================================================

describe('Stage 4: Full Overlap Detection → Feedback → Fix Flow (JAM-6506)', () => {
  let embedCallCount: number;

  beforeEach(() => {
    vi.clearAllMocks();
    embedCallCount = 0;

    // Mock generateEmbeddings:
    // Call 1: sections 2 and 7 (indices 1,6) have similar embeddings
    // Call 2: after fix, all sections have distinct embeddings
    vi.mocked(jinaClient.generateEmbeddings).mockImplementation(async (texts: string[]) => {
      embedCallCount++;
      if (embedCallCount === 1) {
        // BEFORE fix: sections_breakdown[1] and [6] are similar (биоритмы overlap)
        const biorhythmsEmbed = makeEmbedding(42);
        return texts.map((_, i) => {
          if (i === 1) return biorhythmsEmbed;
          if (i === 6) return makeSimilarEmbedding(biorhythmsEmbed, 0.02);
          return makeOrthogonalEmbedding(i * 50);
        });
      }
      // AFTER fix: all distinct
      return texts.map((_, i) => makeOrthogonalEmbedding(i * 50));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects overlapping modules, builds actionable feedback, verifies fix after regeneration', async () => {
    const sectionsBreakdown = createJAM6506SectionsBreakdown();

    // ─── STEP 1: Detect overlap ───
    const overlapResult = await detectSectionBreakdownOverlap(sectionsBreakdown, 'ru');

    // ASSERT: overlap detected between sections 2 and 7
    expect(overlapResult.hasOverlap).toBe(true);
    expect(overlapResult.overlappingPairs.length).toBeGreaterThanOrEqual(1);

    const pair = overlapResult.overlappingPairs.find(
      p =>
        (p.sectionIndexA === 2 && p.sectionIndexB === 7) ||
        (p.sectionIndexA === 7 && p.sectionIndexB === 2)
    );
    expect(pair).toBeDefined();
    expect(pair!.areaA).toMatch(/биоритм/i);
    expect(pair!.similarity).toBeGreaterThanOrEqual(0.7); // Above Russian-adjusted threshold

    console.log('\n=== Stage 4: BEFORE FIX ===');
    console.log(`Overlap detected: ${overlapResult.overlappingPairs.length} pair(s)`);
    for (const p of overlapResult.overlappingPairs) {
      console.log(`  S${p.sectionIndexA} "${p.areaA}" <> S${p.sectionIndexB} "${p.areaB}": ${(p.similarity * 100).toFixed(1)}%`);
    }

    // ─── STEP 2: Build feedback for LLM ───
    const feedback = buildOverlapFeedback(overlapResult);

    // ASSERT: feedback is actionable
    expect(feedback).toContain('CRITICAL');
    expect(feedback).toContain('MERGE');
    expect(feedback).toContain('CLEARLY DIFFERENTIATE');
    expect(feedback).toContain('UNIQUE aspect');
    expect(feedback).toContain(`${Math.round(pair!.similarity * 100)}% content overlap`);

    console.log('\n=== Stage 4: FEEDBACK PROMPT ===');
    console.log(feedback);

    // ─── STEP 3: Simulate fix — replace overlapping sections with differentiated ones ───
    const fixedBreakdown = [...sectionsBreakdown];
    fixedBreakdown[1] = {
      area: 'Хронотипы: генетика и индивидуальный подход',
      key_topics: ['PER/CRY гены', 'определение хронотипа', 'социальный джетлаг', 'адаптация расписания'],
      estimated_lessons: 4,
    };
    fixedBreakdown[6] = {
      area: 'Нейро-лидерство: стратегии влияния и мотивации',
      key_topics: ['нейронаука лидерства', 'когнитивные искажения руководителя', 'мотивация команды', 'эмоциональная регуляция'],
      estimated_lessons: 4,
    };

    // ─── STEP 4: Re-detect — verify overlap resolved ───
    const fixedResult = await detectSectionBreakdownOverlap(fixedBreakdown, 'ru');

    expect(fixedResult.hasOverlap).toBe(false);
    expect(fixedResult.overlappingPairs).toHaveLength(0);

    console.log('\n=== Stage 4: AFTER FIX ===');
    console.log(`Overlap resolved: ${fixedResult.overlappingPairs.length} pair(s) remaining`);
    console.log('RESULT: Stage 4 overlap detection + fix PASSED');
  });
});

// ============================================================================
// SUITE 2: STAGE 5 — Full Overlap Retry Flow via GenerationPhases
// ============================================================================

describe('Stage 5: Full Overlap Retry Flow via GenerationPhases (JAM-6506)', () => {
  let embedCallCount: number;
  let capturedOverlapFeedback: Map<number, string>;
  let mockSBG: SectionBatchGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    embedCallCount = 0;
    capturedOverlapFeedback = new Map();

    // Mock SectionBatchGenerator.generateBatch — captures overlapFeedback
    mockSBG = {
      generateBatch: vi.fn().mockImplementation(
        async (
          batchNum: number,
          startSection: number,
          _endSection: number,
          _input: GenerationJobInput,
          _qdrantClient: unknown,
          overlapFeedback?: string
        ): Promise<SectionBatchResult> => {
          if (overlapFeedback) {
            capturedOverlapFeedback.set(startSection, overlapFeedback);
          }

          // Return FIXED section based on which one is being regenerated
          const fixedSection = startSection === 1 ? createFixedSection2() : createFixedSection7();

          return {
            sections: [fixedSection],
            modelUsed: 'test-model/overlap-retry',
            tier: 'normal',
            tokensUsed: 500,
            retryCount: 0,
          };
        }
      ),
      generateBatchV2: vi.fn(),
    } as unknown as SectionBatchGenerator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('full cycle: detect overlap → build feedback with lesson titles → regenerate → verify resolution', async () => {
    const sections = createJAM6506Sections();
    const input = createMinimalInput();

    // Mock embeddings — call 1: overlap between sections 2,7; calls 2+: no overlap
    vi.mocked(jinaClient.generateEmbeddings).mockImplementation(async (texts: string[]) => {
      embedCallCount++;
      if (embedCallCount === 1) {
        // Initial detection: sections at index 1 and 6 are similar
        const bioEmbed = makeEmbedding(42);
        return texts.map((_, i) => {
          if (i === 1) return bioEmbed;
          if (i === 6) return makeSimilarEmbedding(bioEmbed, 0.02);
          return makeOrthogonalEmbedding(i * 50);
        });
      }
      // After regeneration: all sections are distinct
      return texts.map((_, i) => makeOrthogonalEmbedding(i * 50));
    });

    // ─── STEP 1: Initial overlap detection ───
    console.log('\n=== Stage 5: STEP 1 — Initial Overlap Detection ===');
    const overlapResult = await detectOverlap(sections, input, testLogger);

    expect(overlapResult).not.toBeNull();
    expect(overlapResult!.hasOverlap).toBe(true);
    expect(overlapResult!.overlappingPairs.length).toBeGreaterThanOrEqual(1);

    // Find the S2↔S7 pair
    const pair27 = overlapResult!.overlappingPairs.find(
      p => (p.sectionA === 2 && p.sectionB === 7) || (p.sectionA === 7 && p.sectionB === 2)
    );
    expect(pair27).toBeDefined();
    expect(pair27!.similarity).toBeGreaterThanOrEqual(OVERLAP_THRESHOLDS.stage5 - 0.05); // adjusted for ru

    console.log(`Overlap found: S${pair27!.sectionA} "${pair27!.sectionATitle}" <> S${pair27!.sectionB} "${pair27!.sectionBTitle}"`);
    console.log(`Similarity: ${(pair27!.similarity * 100).toFixed(1)}% (threshold: ${(overlapResult!.overlapThreshold * 100).toFixed(0)}%)`);

    // ─── STEP 2: Build per-section feedback ───
    console.log('\n=== Stage 5: STEP 2 — Build Per-Section Feedback ===');
    const feedbackMap = buildSectionOverlapFeedback(overlapResult!, sections);

    expect(feedbackMap.size).toBe(2); // Both sections 2 and 7 get feedback

    // Section 2 (index 1) gets feedback about Section 7's lessons
    const feedback2 = feedbackMap.get(1)!;
    expect(feedback2).toBeDefined();
    expect(feedback2).toContain('OVERLAP CORRECTION');
    expect(feedback2).toContain('REJECTED');
    expect(feedback2).toContain('Section 7');
    expect(feedback2).toContain('Нейро-лидерство и биоритмы'); // Section 7 lesson title
    expect(feedback2).toContain('Управление циркадными ритмами команды');
    expect(feedback2).toContain('MUST NOT duplicate');
    expect(feedback2).toContain('COMPLETELY DIFFERENT');

    // Section 7 (index 6) gets feedback about Section 2's lessons
    const feedback7 = feedbackMap.get(6)!;
    expect(feedback7).toBeDefined();
    expect(feedback7).toContain('Section 2');
    expect(feedback7).toContain('Что такое хронотипы'); // Section 2 lesson title
    expect(feedback7).toContain('Циркадные ритмы');
    expect(feedback7).toContain('Оптимизация режима сна');
    expect(feedback7).toContain('Биоритмы и продуктивность');

    console.log('Feedback for Section 2 (index 1):');
    console.log(feedback2.substring(0, 200) + '...');
    console.log('\nFeedback for Section 7 (index 6):');
    console.log(feedback7.substring(0, 200) + '...');

    // ─── STEP 3: Regenerate via GenerationPhases.regenerateSingleSection ───
    console.log('\n=== Stage 5: STEP 3 — Regeneration via GenerationPhases ===');

    const mockMG = {} as unknown as MetadataGenerator;
    const mockQV = new QualityValidator(testLogger);
    const phases = new GenerationPhases(mockMG, mockSBG, mockQV);

    const updatedSections = [...sections];

    // Simulate orchestrator's sequential regeneration loop
    for (const [sectionIdx, feedback] of feedbackMap) {
      const regenerated = await phases.regenerateSingleSection(sectionIdx, input, feedback);
      expect(regenerated.length).toBeGreaterThan(0);
      updatedSections[sectionIdx] = regenerated[0];

      console.log(`Regenerated section ${sectionIdx + 1}: "${regenerated[0].section_title}"`);
      console.log(`  New lessons: ${regenerated[0].lessons?.map(l => l.lesson_title).join(', ')}`);
    }

    // ─── STEP 4: Verify overlapFeedback was passed to SectionBatchGenerator ───
    console.log('\n=== Stage 5: STEP 4 — Verify overlapFeedback Reached Generator ===');

    expect(capturedOverlapFeedback.size).toBe(2);

    // Section 2 (index 1) — feedback about Section 7
    const capturedFeedback2 = capturedOverlapFeedback.get(1)!;
    expect(capturedFeedback2).toContain('OVERLAP CORRECTION');
    expect(capturedFeedback2).toContain('Section 7');

    // Section 7 (index 6) — feedback about Section 2
    const capturedFeedback7 = capturedOverlapFeedback.get(6)!;
    expect(capturedFeedback7).toContain('OVERLAP CORRECTION');
    expect(capturedFeedback7).toContain('Section 2');

    // Verify SectionBatchGenerator.generateBatch was called with correct args
    const generateBatchMock = mockSBG.generateBatch as ReturnType<typeof vi.fn>;
    expect(generateBatchMock).toHaveBeenCalledTimes(2);

    // Call 1: section index 1 (section 2) with overlapFeedback
    expect(generateBatchMock).toHaveBeenNthCalledWith(
      1,
      2, // batchNum (1-indexed)
      1, // startSection (0-indexed)
      2, // endSection
      expect.anything(), // input
      undefined, // qdrantClient
      expect.stringContaining('OVERLAP CORRECTION')
    );

    // Call 2: section index 6 (section 7) with overlapFeedback
    expect(generateBatchMock).toHaveBeenNthCalledWith(
      2,
      7, // batchNum
      6, // startSection
      7, // endSection
      expect.anything(),
      undefined,
      expect.stringContaining('OVERLAP CORRECTION')
    );

    console.log('overlapFeedback correctly passed to SectionBatchGenerator.generateBatch()');

    // ─── STEP 5: Re-detect overlap on updated sections ───
    console.log('\n=== Stage 5: STEP 5 — Re-Detect Overlap After Regeneration ===');

    const redetectResult = await detectOverlap(updatedSections, input, testLogger);

    expect(redetectResult).not.toBeNull();
    expect(redetectResult!.hasOverlap).toBe(false);
    expect(redetectResult!.overlappingPairs).toHaveLength(0);

    console.log(`Overlap after regeneration: ${redetectResult!.hasOverlap ? 'STILL PRESENT' : 'RESOLVED'}`);

    // ─── ANALYSIS: Compare before/after ───
    console.log('\n=== ANALYSIS: Before vs After ===');
    console.log('BEFORE:');
    console.log(`  Section 2: "${sections[1].section_title}" → lessons: ${sections[1].lessons?.map(l => l.lesson_title).join(', ')}`);
    console.log(`  Section 7: "${sections[6].section_title}" → lessons: ${sections[6].lessons?.map(l => l.lesson_title).join(', ')}`);
    console.log(`  Overlap: ${(pair27!.similarity * 100).toFixed(1)}%`);
    console.log('AFTER:');
    console.log(`  Section 2: "${updatedSections[1].section_title}" → lessons: ${updatedSections[1].lessons?.map(l => l.lesson_title).join(', ')}`);
    console.log(`  Section 7: "${updatedSections[6].section_title}" → lessons: ${updatedSections[6].lessons?.map(l => l.lesson_title).join(', ')}`);
    console.log(`  Overlap: NONE`);
    console.log('\nRESULT: Stage 5 full overlap retry flow PASSED');
  });

  it('overlap persists after max retries — proceeds with warning (non-blocking)', async () => {
    const sections = createJAM6506Sections();
    const input = createMinimalInput();

    // Mock: overlap ALWAYS detected (even after regeneration)
    vi.mocked(jinaClient.generateEmbeddings).mockImplementation(async (texts: string[]) => {
      const bioEmbed = makeEmbedding(42);
      return texts.map((_, i) => {
        if (i === 1) return bioEmbed;
        if (i === 6) return makeSimilarEmbedding(bioEmbed, 0.02);
        return makeOrthogonalEmbedding(i * 50);
      });
    });

    // Simulate orchestrator's MAX_OVERLAP_RETRIES = 2 retry loop
    const MAX_OVERLAP_RETRIES = 2;
    let updatedSections = [...sections];
    let currentOverlapResult = await detectOverlap(updatedSections, input, testLogger);
    let attempt = 0;

    while (attempt < MAX_OVERLAP_RETRIES && currentOverlapResult?.hasOverlap) {
      attempt++;
      const feedbackMap = buildSectionOverlapFeedback(currentOverlapResult!, updatedSections);

      // Simulate regeneration (content changes but embeddings stay similar)
      const phases = new GenerationPhases(
        {} as MetadataGenerator,
        mockSBG,
        new QualityValidator(testLogger)
      );

      for (const [sectionIdx, feedback] of feedbackMap) {
        try {
          const regenerated = await phases.regenerateSingleSection(sectionIdx, input, feedback);
          if (regenerated.length > 0) updatedSections[sectionIdx] = regenerated[0];
        } catch {
          // Non-blocking
        }
      }

      currentOverlapResult = await detectOverlap(updatedSections, input, testLogger);
    }

    // ASSERT: overlap persists (because mock always returns similar embeddings)
    expect(attempt).toBe(MAX_OVERLAP_RETRIES);
    expect(currentOverlapResult?.hasOverlap).toBe(true);

    // BUT: no error thrown — the system proceeds with a warning
    console.log('\n=== Stage 5: Max Retries Exhausted ===');
    console.log(`Retries used: ${attempt}/${MAX_OVERLAP_RETRIES}`);
    console.log(`Overlap still present: YES — system proceeds with warning (non-blocking)`);
    console.log('RESULT: Non-blocking behavior verified');
  });

  it('verifies feedback includes exact similarity percentage from detection', async () => {
    const sections = createJAM6506Sections();
    const input = createMinimalInput();

    // Mock: specific similarity value
    vi.mocked(jinaClient.generateEmbeddings).mockImplementation(async (texts: string[]) => {
      const bioEmbed = makeEmbedding(42);
      return texts.map((_, i) => {
        if (i === 1) return bioEmbed;
        if (i === 6) return makeSimilarEmbedding(bioEmbed, 0.02);
        return makeOrthogonalEmbedding(i * 50);
      });
    });

    const overlapResult = await detectOverlap(sections, input, testLogger);
    expect(overlapResult).not.toBeNull();

    const pair = overlapResult!.overlappingPairs[0];
    const expectedPercentage = Math.round(pair.similarity * 100);

    const feedbackMap = buildSectionOverlapFeedback(overlapResult!, sections);

    // Both feedback entries should include the actual similarity percentage
    for (const [, feedback] of feedbackMap) {
      expect(feedback).toContain(`${expectedPercentage}% content overlap`);
    }

    console.log(`\nSimilarity: ${(pair.similarity * 100).toFixed(1)}% → Feedback shows: "${expectedPercentage}% content overlap"`);
  });
});

// ============================================================================
// SUITE 3: Cross-Stage Consistency
// ============================================================================

describe('Cross-Stage: Stage 4 and Stage 5 detect same overlap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Stage 4 (abstract) and Stage 5 (detailed) both detect biorhythms overlap', async () => {
    // Same embeddings mock for both stages — simulates that the same content
    // triggers overlap detection at both abstract and detailed levels
    const bioEmbed = makeEmbedding(42);
    vi.mocked(jinaClient.generateEmbeddings).mockImplementation(async (texts: string[]) => {
      return texts.map((_, i) => {
        if (i === 1) return bioEmbed;
        if (i === 6) return makeSimilarEmbedding(bioEmbed, 0.02);
        return makeOrthogonalEmbedding(i * 50);
      });
    });

    // Stage 4 detection (sections_breakdown)
    const stage4Result = await detectSectionBreakdownOverlap(
      createJAM6506SectionsBreakdown(),
      'ru'
    );

    // Stage 5 detection (generated sections)
    const input = createMinimalInput();
    const stage5Result = await detectOverlap(createJAM6506Sections(), input, testLogger);

    // Both should detect overlap
    expect(stage4Result.hasOverlap).toBe(true);
    expect(stage5Result?.hasOverlap).toBe(true);

    // Both should find the same pair (indices 2↔7 / sectionNumbers 2↔7)
    const stage4Pair = stage4Result.overlappingPairs.find(
      p => (p.sectionIndexA === 2 && p.sectionIndexB === 7)
    );
    const stage5Pair = stage5Result!.overlappingPairs.find(
      p => (p.sectionA === 2 && p.sectionB === 7)
    );

    expect(stage4Pair).toBeDefined();
    expect(stage5Pair).toBeDefined();

    // Both similarities should be above their respective thresholds
    // Stage 4 threshold: 0.80 - 0.05 (ru) = 0.75
    // Stage 5 threshold: 0.75 - 0.05 (ru) = 0.70
    expect(stage4Pair!.similarity).toBeGreaterThanOrEqual(0.70);
    expect(stage5Pair!.similarity).toBeGreaterThanOrEqual(0.70);

    console.log('\n=== Cross-Stage Consistency ===');
    console.log(`Stage 4 (abstract): S2↔S7 similarity = ${(stage4Pair!.similarity * 100).toFixed(1)}% (threshold: ${(stage4Result.threshold * 100).toFixed(0)}%)`);
    console.log(`Stage 5 (detailed): S2↔S7 similarity = ${(stage5Pair!.similarity * 100).toFixed(1)}% (threshold: ${(stage5Result!.overlapThreshold * 100).toFixed(0)}%)`);
    console.log('RESULT: Both stages consistently detect the same overlap');
  });
});
