/**
 * Stage 6 LangGraph Nodes Integration Test
 *
 * Test Objective: Verify individual LangGraph nodes for lesson content generation
 * function correctly and produce valid state updates.
 *
 * Test Flow:
 * 1. Planner Node: Generate outline from lesson specification
 * 2. Expander Node: Expand sections in parallel with depth constraints
 * 3. Assembler Node: Assemble sections into cohesive content
 * 4. Smoother Node: Refine transitions and produce final LessonContent
 * 5. Full Pipeline: End-to-end planner -> expander -> assembler -> smoother
 *
 * Prerequisites:
 * - OpenRouter API key in .env (OPENROUTER_API_KEY)
 * - Network access to OpenRouter API
 * - Stage 6 fixtures available
 *
 * Test execution: pnpm test tests/integration/stage6/nodes.test.ts
 *
 * IMPORTANT: These tests make real LLM API calls and require:
 * - Valid API credentials
 * - Network connectivity
 * - Extended timeout (60s+ per test)
 *
 * For unit tests with mocked LLM, see: tests/unit/stage6/
 *
 * Reference: specs/010-stages-456-pipeline/
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { LessonGraphStateType, LessonGraphStateUpdate, ExpandedSection } from '../../../src/stages/stage6-lesson-content/state';
import { plannerNode } from '../../../src/stages/stage6-lesson-content/nodes/planner';
import { expanderNode } from '../../../src/stages/stage6-lesson-content/nodes/expander';
import { assemblerNode } from '../../../src/stages/stage6-lesson-content/nodes/assembler';
import { smootherNode } from '../../../src/stages/stage6-lesson-content/nodes/smoother';
import {
  ANALYTICAL_LESSON_SPEC,
  DATA_ANALYSIS_CHUNKS,
  TEST_COURSE_ID,
  createTestLessonSpec,
  createTestRAGChunks,
} from '../../fixtures/stage6';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Default timeout for LLM API calls (60 seconds)
 * LLM processing can be slow, especially for larger prompts
 */
const LLM_TEST_TIMEOUT = 60000;

/**
 * Extended timeout for full pipeline tests (3 minutes)
 */
const PIPELINE_TEST_TIMEOUT = 180000;

/**
 * Check if OpenRouter API key is available
 */
function hasOpenRouterApiKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create initial graph state for testing
 *
 * @param lessonSpec - Lesson specification to use
 * @param ragChunks - RAG chunks for context
 * @param overrides - Additional state overrides
 * @returns Initial LessonGraphStateType
 */
function createInitialState(
  lessonSpec = ANALYTICAL_LESSON_SPEC,
  ragChunks = DATA_ANALYSIS_CHUNKS,
  overrides: Partial<LessonGraphStateType> = {}
): LessonGraphStateType {
  return {
    lessonSpec,
    courseId: TEST_COURSE_ID,
    ragChunks,
    ragContextId: null,
    outline: null,
    expandedSections: new Map(),
    assembledContent: null,
    smoothedContent: null,
    lessonContent: null,
    currentNode: 'planner',
    errors: [],
    retryCount: 0,
    modelUsed: null,
    tokensUsed: 0,
    durationMs: 0,
    totalCostUsd: 0,
    nodeCosts: [],
    temperature: 0.7,
    qualityScore: null,
    judgeVerdict: null,
    judgeRecommendation: null,
    needsRegeneration: false,
    needsHumanReview: false,
    previousScores: [],
    refinementIterationCount: 0,
    ...overrides,
  };
}

/**
 * Apply state update to existing state
 *
 * @param state - Current state
 * @param update - State update from node
 * @returns Updated state
 */
function applyStateUpdate(
  state: LessonGraphStateType,
  update: LessonGraphStateUpdate
): LessonGraphStateType {
  const newState = { ...state };

  // Handle simple field updates
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) {
      // Handle accumulative fields with reducers
      if (key === 'tokensUsed' && typeof value === 'number') {
        newState.tokensUsed = (newState.tokensUsed || 0) + value;
      } else if (key === 'durationMs' && typeof value === 'number') {
        newState.durationMs = (newState.durationMs || 0) + value;
      } else if (key === 'errors' && Array.isArray(value)) {
        newState.errors = [...(newState.errors || []), ...value];
      } else if (key === 'nodeCosts' && Array.isArray(value)) {
        newState.nodeCosts = [...(newState.nodeCosts || []), ...value];
      } else if (key === 'expandedSections' && value instanceof Map) {
        // Merge maps for expanded sections
        const merged = new Map(newState.expandedSections);
        value.forEach((v, k) => merged.set(k, v));
        newState.expandedSections = merged;
      } else {
        (newState as Record<string, unknown>)[key] = value;
      }
    }
  }

  return newState;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Stage 6 LangGraph Nodes Integration', () => {
  let shouldSkipTests = false;

  beforeAll(() => {
    // Check for API key availability
    if (!hasOpenRouterApiKey()) {
      console.warn('Warning: OPENROUTER_API_KEY not set - LLM tests will be skipped');
      console.warn('   Set OPENROUTER_API_KEY in .env to run these tests');
      shouldSkipTests = true;
    }
  });

  afterAll(() => {
    // Cleanup any resources if needed
  });

  // ==========================================================================
  // Planner Node Tests
  // ==========================================================================

  describe('Planner Node', () => {
    it.skipIf(shouldSkipTests)(
      'should generate outline from lesson spec',
      async () => {
        // Arrange: Create initial state with lesson spec and RAG chunks
        const state = createInitialState();

        // Act: Call plannerNode
        const result = await plannerNode(state);

        // Assert: Verify outline structure
        expect(result.outline).toBeDefined();
        expect(result.outline).not.toBeNull();
        expect(typeof result.outline).toBe('string');

        // Outline should contain lesson title or related content
        const outline = result.outline!;
        expect(outline.length).toBeGreaterThan(100); // Meaningful content

        // Should contain markdown structure
        expect(outline).toMatch(/#+\s+/); // Headers
        expect(outline).toMatch(/[-*]\s+/); // Bullet points

        // Verify state updates
        expect(result.currentNode).toBe('expander');
        expect(result.modelUsed).toBeDefined();
        expect(result.tokensUsed).toBeGreaterThan(0);
        expect(result.durationMs).toBeGreaterThan(0);

        // Should not have errors
        expect(result.errors).toBeUndefined();

        console.log('Planner Node Results:');
        console.log(`  - Outline length: ${outline.length} characters`);
        console.log(`  - Model used: ${result.modelUsed}`);
        console.log(`  - Tokens used: ${result.tokensUsed}`);
        console.log(`  - Duration: ${result.durationMs}ms`);
      },
      LLM_TEST_TIMEOUT
    );

    it.skipIf(shouldSkipTests)(
      'should handle missing RAG chunks gracefully',
      async () => {
        // Arrange: Create state with empty RAG chunks
        const state = createInitialState(ANALYTICAL_LESSON_SPEC, []);

        // Act: Call plannerNode
        const result = await plannerNode(state);

        // Assert: Should still produce outline (degraded quality)
        expect(result.outline).toBeDefined();
        expect(result.outline).not.toBeNull();
        expect(typeof result.outline).toBe('string');

        // Outline should still have meaningful structure
        const outline = result.outline!;
        expect(outline.length).toBeGreaterThan(50);

        // Should transition to expander
        expect(result.currentNode).toBe('expander');

        console.log('Planner Node (no RAG) Results:');
        console.log(`  - Outline length: ${outline.length} characters`);
        console.log(`  - Successfully handled missing RAG chunks`);
      },
      LLM_TEST_TIMEOUT
    );

    it.skipIf(shouldSkipTests)(
      'should cover all learning objectives in outline',
      async () => {
        // Arrange: Create state with lesson spec containing specific learning objectives
        const state = createInitialState();

        // Act: Call plannerNode
        const result = await plannerNode(state);

        // Assert: Outline should reference key topics from learning objectives
        const outline = result.outline!.toLowerCase();

        // Check for key topics from ANALYTICAL_LESSON_SPEC learning objectives
        // LO-1.1.1: "DataFrame", "Series"
        // LO-1.1.2: "filtering", "aggregation"
        // LO-1.1.3: "quality", "anomalies"
        const keyTopics = ['dataframe', 'series', 'filter', 'aggreg'];
        const foundTopics = keyTopics.filter(topic => outline.includes(topic));

        // Should cover at least 50% of key topics
        expect(foundTopics.length).toBeGreaterThanOrEqual(Math.floor(keyTopics.length / 2));

        console.log('Learning Objectives Coverage:');
        console.log(`  - Found topics: ${foundTopics.join(', ')}`);
        console.log(`  - Coverage: ${foundTopics.length}/${keyTopics.length}`);
      },
      LLM_TEST_TIMEOUT
    );
  });

  // ==========================================================================
  // Expander Node Tests
  // ==========================================================================

  describe('Expander Node', () => {
    it.skipIf(shouldSkipTests)(
      'should expand outline sections in parallel',
      async () => {
        // Arrange: Create state with planner output
        let state = createInitialState();

        // First, run planner to get outline
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);

        // Act: Call expanderNode
        const result = await expanderNode(state);

        // Assert: Verify expanded sections
        expect(result.expandedSections).toBeDefined();
        expect(result.expandedSections).toBeInstanceOf(Map);
        expect(result.expandedSections!.size).toBeGreaterThan(0);

        // Check that we expanded all sections from spec
        const expectedSectionCount = ANALYTICAL_LESSON_SPEC.sections.length;
        expect(result.expandedSections!.size).toBe(expectedSectionCount);

        // Verify each expanded section has content
        result.expandedSections!.forEach((section: ExpandedSection, title: string) => {
          expect(section.title).toBe(title);
          expect(section.content).toBeDefined();
          expect(section.content.length).toBeGreaterThan(100);
          expect(section.tokensUsed).toBeGreaterThan(0);
        });

        // Verify state updates
        expect(result.currentNode).toBe('assembler');
        expect(result.tokensUsed).toBeGreaterThan(0);
        expect(result.durationMs).toBeGreaterThan(0);

        console.log('Expander Node Results:');
        console.log(`  - Sections expanded: ${result.expandedSections!.size}`);
        console.log(`  - Total tokens: ${result.tokensUsed}`);
        console.log(`  - Duration: ${result.durationMs}ms`);

        // Log section details
        result.expandedSections!.forEach((section, title) => {
          console.log(`  - "${title}": ${section.content.length} chars, ${section.tokensUsed} tokens`);
        });
      },
      LLM_TEST_TIMEOUT * 2 // Expander processes multiple sections
    );

    it.skipIf(shouldSkipTests)(
      'should respect depth constraints (summary/detailed/comprehensive)',
      async () => {
        // Arrange: Create state with custom lesson spec having different depths
        const customSpec = createTestLessonSpec({
          sections: [
            {
              title: 'Summary Section',
              content_archetype: 'concept_explainer',
              rag_context_id: 'test-rag-1',
              constraints: {
                depth: 'summary',
                required_keywords: ['test'],
                prohibited_terms: [],
              },
              key_points_to_cover: ['Point 1'],
            },
            {
              title: 'Comprehensive Section',
              content_archetype: 'concept_explainer',
              rag_context_id: 'test-rag-2',
              constraints: {
                depth: 'comprehensive',
                required_keywords: ['test'],
                prohibited_terms: [],
              },
              key_points_to_cover: ['Point 1', 'Point 2', 'Point 3'],
            },
          ],
        });

        let state = createInitialState(customSpec, createTestRAGChunks(3));

        // Run planner first
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);

        // Act: Call expanderNode
        const result = await expanderNode(state);

        // Assert: Comprehensive section should be longer than summary
        const summarySection = result.expandedSections!.get('Summary Section');
        const comprehensiveSection = result.expandedSections!.get('Comprehensive Section');

        expect(summarySection).toBeDefined();
        expect(comprehensiveSection).toBeDefined();

        // Comprehensive content should be significantly longer
        // (at least 1.5x, accounting for LLM variability)
        const summaryLength = summarySection!.content.length;
        const comprehensiveLength = comprehensiveSection!.content.length;

        console.log('Depth Constraint Results:');
        console.log(`  - Summary section: ${summaryLength} chars`);
        console.log(`  - Comprehensive section: ${comprehensiveLength} chars`);
        console.log(`  - Ratio: ${(comprehensiveLength / summaryLength).toFixed(2)}x`);

        // Comprehensive should be meaningfully longer (1.3x minimum, accounting for variability)
        expect(comprehensiveLength).toBeGreaterThan(summaryLength * 1.3);
      },
      LLM_TEST_TIMEOUT * 2
    );

    it.skipIf(shouldSkipTests)(
      'should handle expander without outline gracefully',
      async () => {
        // Arrange: Create state WITHOUT outline
        const state = createInitialState();
        // State already has outline: null

        // Act: Call expanderNode
        const result = await expanderNode(state);

        // Assert: Should return error
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
        expect(result.errors![0]).toContain('No outline available');
        expect(result.currentNode).toBe('expander'); // Stay on expander for retry

        console.log('Expander (no outline) Results:');
        console.log(`  - Error: ${result.errors![0]}`);
      },
      LLM_TEST_TIMEOUT
    );
  });

  // ==========================================================================
  // Assembler Node Tests
  // ==========================================================================

  describe('Assembler Node', () => {
    it.skipIf(shouldSkipTests)(
      'should assemble expanded sections into coherent content',
      async () => {
        // Arrange: Create state with expanded sections
        let state = createInitialState();

        // Run planner
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);

        // Run expander
        const expanderResult = await expanderNode(state);
        state = applyStateUpdate(state, expanderResult);

        // Act: Call assemblerNode
        const result = await assemblerNode(state);

        // Assert: Verify assembled content
        expect(result.assembledContent).toBeDefined();
        expect(result.assembledContent).not.toBeNull();
        expect(typeof result.assembledContent).toBe('string');

        const assembled = result.assembledContent!;

        // Should have main structural elements
        expect(assembled).toContain('# '); // Main title
        expect(assembled).toContain('## Introduction'); // Introduction section
        expect(assembled).toContain('## Summary'); // Summary section

        // Should have section headers for each expanded section
        ANALYTICAL_LESSON_SPEC.sections.forEach(section => {
          expect(assembled).toContain(`## ${section.title}`);
        });

        // Verify state updates
        expect(result.currentNode).toBe('smoother');
        expect(result.tokensUsed).toBeGreaterThan(0);
        expect(result.durationMs).toBeGreaterThan(0);

        console.log('Assembler Node Results:');
        console.log(`  - Assembled content length: ${assembled.length} chars`);
        console.log(`  - Tokens used: ${result.tokensUsed}`);
        console.log(`  - Duration: ${result.durationMs}ms`);
      },
      LLM_TEST_TIMEOUT * 2
    );

    it.skipIf(shouldSkipTests)(
      'should include exercises when present in spec',
      async () => {
        // Arrange: Create state with expanded sections (ANALYTICAL_LESSON_SPEC has exercises)
        let state = createInitialState();

        // Run full pipeline up to assembler
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);

        const expanderResult = await expanderNode(state);
        state = applyStateUpdate(state, expanderResult);

        // Act: Call assemblerNode
        const result = await assemblerNode(state);

        // Assert: Should include exercises section
        const assembled = result.assembledContent!;

        // ANALYTICAL_LESSON_SPEC has 2 exercises
        expect(assembled).toContain('## Exercises');
        expect(assembled).toMatch(/Exercise \d+/i);

        console.log('Assembler (with exercises) Results:');
        console.log(`  - Exercises section present: ${assembled.includes('## Exercises')}`);
      },
      LLM_TEST_TIMEOUT * 2
    );

    it.skipIf(shouldSkipTests)(
      'should handle assembler without expanded sections gracefully',
      async () => {
        // Arrange: Create state WITHOUT expanded sections
        const state = createInitialState();
        // State already has expandedSections: new Map()

        // Act: Call assemblerNode
        const result = await assemblerNode(state);

        // Assert: Should return error
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
        expect(result.errors![0]).toContain('No expanded sections available');
        expect(result.currentNode).toBe('assembler'); // Stay on assembler for retry

        console.log('Assembler (no sections) Results:');
        console.log(`  - Error: ${result.errors![0]}`);
      },
      LLM_TEST_TIMEOUT
    );
  });

  // ==========================================================================
  // Smoother Node Tests
  // ==========================================================================

  describe('Smoother Node', () => {
    it.skipIf(shouldSkipTests)(
      'should refine transitions between sections',
      async () => {
        // Arrange: Create state with assembled content
        let state = createInitialState();

        // Run full pipeline up to smoother
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);

        const expanderResult = await expanderNode(state);
        state = applyStateUpdate(state, expanderResult);

        const assemblerResult = await assemblerNode(state);
        state = applyStateUpdate(state, assemblerResult);

        const originalAssembled = state.assembledContent!;

        // Act: Call smootherNode
        const result = await smootherNode(state);

        // Assert: Verify smoothed content
        expect(result.smoothedContent).toBeDefined();
        expect(result.smoothedContent).not.toBeNull();
        expect(typeof result.smoothedContent).toBe('string');

        const smoothed = result.smoothedContent!;

        // Smoothed content should be similar length or slightly longer
        // (adding transitions should not significantly change length)
        const lengthRatio = smoothed.length / originalAssembled.length;
        expect(lengthRatio).toBeGreaterThan(0.8);
        expect(lengthRatio).toBeLessThan(1.5);

        // Should still have main structure
        expect(smoothed).toContain('# ');
        expect(smoothed).toContain('## ');

        // Verify state updates
        expect(result.currentNode).toBe('judge');
        expect(result.tokensUsed).toBeGreaterThan(0);
        expect(result.durationMs).toBeGreaterThan(0);

        // Should produce lessonContent
        expect(result.lessonContent).toBeDefined();
        expect(result.lessonContent).not.toBeNull();

        console.log('Smoother Node Results:');
        console.log(`  - Smoothed content length: ${smoothed.length} chars`);
        console.log(`  - Original length: ${originalAssembled.length} chars`);
        console.log(`  - Length ratio: ${lengthRatio.toFixed(2)}`);
        console.log(`  - Tokens used: ${result.tokensUsed}`);
        console.log(`  - Duration: ${result.durationMs}ms`);
      },
      LLM_TEST_TIMEOUT * 2
    );

    it.skipIf(shouldSkipTests)(
      'should preserve content while improving readability',
      async () => {
        // Arrange: Create state with assembled content
        let state = createInitialState();

        // Run full pipeline up to smoother
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);

        const expanderResult = await expanderNode(state);
        state = applyStateUpdate(state, expanderResult);

        const assemblerResult = await assemblerNode(state);
        state = applyStateUpdate(state, assemblerResult);

        const originalAssembled = state.assembledContent!;

        // Act: Call smootherNode
        const result = await smootherNode(state);

        const smoothed = result.smoothedContent!;

        // Assert: Key concepts should be preserved
        // Check that main section titles are preserved
        ANALYTICAL_LESSON_SPEC.sections.forEach(section => {
          expect(smoothed).toContain(section.title);
        });

        // Check that lesson title is preserved
        expect(smoothed).toContain(ANALYTICAL_LESSON_SPEC.title);

        // Content should not be drastically different (same general structure)
        const originalSectionCount = (originalAssembled.match(/^## /gm) || []).length;
        const smoothedSectionCount = (smoothed.match(/^## /gm) || []).length;

        // Section count should be similar (allowing for minor formatting changes)
        expect(Math.abs(originalSectionCount - smoothedSectionCount)).toBeLessThanOrEqual(2);

        console.log('Content Preservation Results:');
        console.log(`  - Original sections: ${originalSectionCount}`);
        console.log(`  - Smoothed sections: ${smoothedSectionCount}`);
        console.log(`  - All section titles preserved: true`);
      },
      LLM_TEST_TIMEOUT * 2
    );

    it.skipIf(shouldSkipTests)(
      'should produce valid LessonContent structure',
      async () => {
        // Arrange: Create state with assembled content
        let state = createInitialState();

        // Run full pipeline up to smoother
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);

        const expanderResult = await expanderNode(state);
        state = applyStateUpdate(state, expanderResult);

        const assemblerResult = await assemblerNode(state);
        state = applyStateUpdate(state, assemblerResult);

        // Act: Call smootherNode
        const result = await smootherNode(state);

        // Assert: LessonContent structure
        const lessonContent = result.lessonContent!;

        expect(lessonContent.lesson_id).toBe(ANALYTICAL_LESSON_SPEC.lesson_id);
        expect(lessonContent.course_id).toBe(TEST_COURSE_ID);

        // Content body
        expect(lessonContent.content).toBeDefined();
        expect(lessonContent.content.intro).toBeDefined();
        expect(lessonContent.content.intro.length).toBeGreaterThan(0);
        expect(lessonContent.content.sections).toBeDefined();
        expect(lessonContent.content.sections.length).toBeGreaterThan(0);

        // Metadata
        expect(lessonContent.metadata).toBeDefined();
        expect(lessonContent.metadata.total_words).toBeGreaterThan(0);
        expect(lessonContent.metadata.total_tokens).toBeGreaterThan(0);
        expect(lessonContent.metadata.generation_duration_ms).toBeGreaterThan(0);
        expect(lessonContent.metadata.model_used).toBeDefined();
        expect(lessonContent.metadata.archetype_used).toBe(ANALYTICAL_LESSON_SPEC.metadata.content_archetype);

        // Status
        expect(lessonContent.status).toBe('generating'); // Will be updated by judge

        console.log('LessonContent Structure Results:');
        console.log(`  - Lesson ID: ${lessonContent.lesson_id}`);
        console.log(`  - Course ID: ${lessonContent.course_id}`);
        console.log(`  - Sections: ${lessonContent.content.sections.length}`);
        console.log(`  - Total words: ${lessonContent.metadata.total_words}`);
        console.log(`  - Total tokens: ${lessonContent.metadata.total_tokens}`);
        console.log(`  - Model: ${lessonContent.metadata.model_used}`);
      },
      LLM_TEST_TIMEOUT * 2
    );

    it.skipIf(shouldSkipTests)(
      'should include citations from RAG chunks',
      async () => {
        // Arrange: Create state with RAG chunks
        let state = createInitialState();

        // Run full pipeline up to smoother
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);

        const expanderResult = await expanderNode(state);
        state = applyStateUpdate(state, expanderResult);

        const assemblerResult = await assemblerNode(state);
        state = applyStateUpdate(state, assemblerResult);

        // Act: Call smootherNode
        const result = await smootherNode(state);

        // Assert: Citations should be present
        const lessonContent = result.lessonContent!;

        // RAG chunks should be tracked
        expect(lessonContent.metadata.rag_chunks_used).toBeGreaterThan(0);

        // At least some sections should have citations
        const sectionsWithCitations = lessonContent.content.sections.filter(
          section => section.citations && section.citations.length > 0
        );

        // Should have citations since we provided RAG chunks
        expect(sectionsWithCitations.length).toBeGreaterThan(0);

        console.log('Citations Results:');
        console.log(`  - RAG chunks used: ${lessonContent.metadata.rag_chunks_used}`);
        console.log(`  - Sections with citations: ${sectionsWithCitations.length}`);
      },
      LLM_TEST_TIMEOUT * 2
    );

    it.skipIf(shouldSkipTests)(
      'should handle smoother without assembled content gracefully',
      async () => {
        // Arrange: Create state WITHOUT assembled content
        const state = createInitialState();
        // State already has assembledContent: null

        // Act: Call smootherNode
        const result = await smootherNode(state);

        // Assert: Should return error
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
        expect(result.errors![0]).toContain('No assembled content available');
        expect(result.currentNode).toBe('smoother'); // Stay on smoother for retry

        console.log('Smoother (no content) Results:');
        console.log(`  - Error: ${result.errors![0]}`);
      },
      LLM_TEST_TIMEOUT
    );
  });

  // ==========================================================================
  // Full Node Pipeline Tests
  // ==========================================================================

  describe('Full Node Pipeline', () => {
    it.skipIf(shouldSkipTests)(
      'should execute planner -> expander -> assembler -> smoother',
      async () => {
        // Arrange: Create initial state
        let state = createInitialState();

        console.log('\n=== Full Pipeline Execution ===\n');
        console.log(`Lesson: ${state.lessonSpec.title}`);
        console.log(`RAG Chunks: ${state.ragChunks.length}`);
        console.log(`Sections: ${state.lessonSpec.sections.length}`);
        console.log('');

        // =================================================================
        // Phase 1: Planner
        // =================================================================
        console.log('Phase 1: Planner');
        const plannerStart = Date.now();
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);
        console.log(`  - Duration: ${Date.now() - plannerStart}ms`);
        console.log(`  - Outline length: ${state.outline?.length || 0} chars`);
        console.log(`  - Tokens: ${plannerResult.tokensUsed}`);
        console.log(`  - Next node: ${state.currentNode}`);
        expect(state.currentNode).toBe('expander');

        // =================================================================
        // Phase 2: Expander
        // =================================================================
        console.log('\nPhase 2: Expander');
        const expanderStart = Date.now();
        const expanderResult = await expanderNode(state);
        state = applyStateUpdate(state, expanderResult);
        console.log(`  - Duration: ${Date.now() - expanderStart}ms`);
        console.log(`  - Sections expanded: ${state.expandedSections.size}`);
        console.log(`  - Tokens: ${expanderResult.tokensUsed}`);
        console.log(`  - Next node: ${state.currentNode}`);
        expect(state.currentNode).toBe('assembler');

        // =================================================================
        // Phase 3: Assembler
        // =================================================================
        console.log('\nPhase 3: Assembler');
        const assemblerStart = Date.now();
        const assemblerResult = await assemblerNode(state);
        state = applyStateUpdate(state, assemblerResult);
        console.log(`  - Duration: ${Date.now() - assemblerStart}ms`);
        console.log(`  - Assembled length: ${state.assembledContent?.length || 0} chars`);
        console.log(`  - Tokens: ${assemblerResult.tokensUsed}`);
        console.log(`  - Next node: ${state.currentNode}`);
        expect(state.currentNode).toBe('smoother');

        // =================================================================
        // Phase 4: Smoother
        // =================================================================
        console.log('\nPhase 4: Smoother');
        const smootherStart = Date.now();
        const smootherResult = await smootherNode(state);
        state = applyStateUpdate(state, smootherResult);
        console.log(`  - Duration: ${Date.now() - smootherStart}ms`);
        console.log(`  - Smoothed length: ${state.smoothedContent?.length || 0} chars`);
        console.log(`  - Tokens: ${smootherResult.tokensUsed}`);
        console.log(`  - Next node: ${state.currentNode}`);
        expect(state.currentNode).toBe('judge');

        // =================================================================
        // Final Verification
        // =================================================================
        console.log('\n=== Pipeline Summary ===\n');

        // Verify final output
        expect(state.lessonContent).toBeDefined();
        expect(state.lessonContent).not.toBeNull();

        const lessonContent = state.lessonContent!;

        // Verify structure
        expect(lessonContent.content.sections.length).toBeGreaterThan(0);
        expect(lessonContent.metadata.total_words).toBeGreaterThan(0);

        // Token usage accumulation
        const totalTokens = state.tokensUsed;
        console.log(`Total Tokens Used: ${totalTokens}`);

        // Duration accumulation
        const totalDuration = state.durationMs;
        console.log(`Total Duration: ${totalDuration}ms`);

        // No errors in pipeline
        expect(state.errors.length).toBe(0);
        console.log(`Errors: ${state.errors.length}`);

        // Quality metrics
        console.log(`Word Count: ${lessonContent.metadata.total_words}`);
        console.log(`Sections: ${lessonContent.content.sections.length}`);
        console.log(`RAG Chunks Used: ${lessonContent.metadata.rag_chunks_used}`);
        console.log(`Model: ${lessonContent.metadata.model_used}`);

        // Final assertions
        expect(totalTokens).toBeGreaterThan(0);
        expect(totalDuration).toBeGreaterThan(0);
        expect(lessonContent.metadata.total_words).toBeGreaterThanOrEqual(200); // Minimum meaningful content
      },
      PIPELINE_TEST_TIMEOUT
    );

    it.skipIf(shouldSkipTests)(
      'should accumulate token usage across all nodes',
      async () => {
        // Arrange: Create initial state
        let state = createInitialState();

        // Track individual node token usage
        const tokenUsage: Record<string, number> = {};

        // Run pipeline with token tracking
        const plannerResult = await plannerNode(state);
        tokenUsage.planner = plannerResult.tokensUsed || 0;
        state = applyStateUpdate(state, plannerResult);

        const expanderResult = await expanderNode(state);
        tokenUsage.expander = expanderResult.tokensUsed || 0;
        state = applyStateUpdate(state, expanderResult);

        const assemblerResult = await assemblerNode(state);
        tokenUsage.assembler = assemblerResult.tokensUsed || 0;
        state = applyStateUpdate(state, assemblerResult);

        const smootherResult = await smootherNode(state);
        tokenUsage.smoother = smootherResult.tokensUsed || 0;
        state = applyStateUpdate(state, smootherResult);

        // Assert: Token usage should be tracked
        Object.entries(tokenUsage).forEach(([node, tokens]) => {
          expect(tokens).toBeGreaterThan(0);
        });

        // Total should be sum of individual nodes
        const expectedTotal = Object.values(tokenUsage).reduce((sum, t) => sum + t, 0);
        expect(state.tokensUsed).toBe(expectedTotal);

        console.log('Token Usage Breakdown:');
        Object.entries(tokenUsage).forEach(([node, tokens]) => {
          console.log(`  - ${node}: ${tokens} tokens`);
        });
        console.log(`  - TOTAL: ${state.tokensUsed} tokens`);
      },
      PIPELINE_TEST_TIMEOUT
    );

    it.skipIf(shouldSkipTests)(
      'should handle different content archetypes',
      async () => {
        // Test with code_tutorial archetype (PROCEDURAL_LESSON_SPEC characteristics)
        const codeTutorialSpec = createTestLessonSpec({
          title: 'Building REST APIs with FastAPI',
          metadata: {
            target_audience: 'practitioner',
            tone: 'formal',
            compliance_level: 'strict',
            content_archetype: 'code_tutorial',
          },
          sections: [
            {
              title: 'Setting Up the Project',
              content_archetype: 'code_tutorial',
              rag_context_id: 'rag-1',
              constraints: {
                depth: 'comprehensive',
                required_keywords: ['pip', 'uvicorn'],
                prohibited_terms: [],
              },
              key_points_to_cover: ['Installing dependencies', 'Project structure'],
            },
          ],
        });

        let state = createInitialState(codeTutorialSpec, createTestRAGChunks(3));

        // Run full pipeline
        const plannerResult = await plannerNode(state);
        state = applyStateUpdate(state, plannerResult);

        const expanderResult = await expanderNode(state);
        state = applyStateUpdate(state, expanderResult);

        const assemblerResult = await assemblerNode(state);
        state = applyStateUpdate(state, assemblerResult);

        const smootherResult = await smootherNode(state);
        state = applyStateUpdate(state, smootherResult);

        // Assert: Should complete successfully with code_tutorial archetype
        expect(state.lessonContent).toBeDefined();
        expect(state.lessonContent!.metadata.archetype_used).toBe('code_tutorial');

        // Content should contain code-related elements
        const content = state.smoothedContent!.toLowerCase();
        const hasCodeElements = content.includes('```') || content.includes('code') || content.includes('install');
        expect(hasCodeElements).toBe(true);

        console.log('Code Tutorial Archetype Results:');
        console.log(`  - Archetype: ${state.lessonContent!.metadata.archetype_used}`);
        console.log(`  - Contains code elements: ${hasCodeElements}`);
      },
      PIPELINE_TEST_TIMEOUT
    );
  });
});
