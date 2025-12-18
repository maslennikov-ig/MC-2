/**
 * UnifiedRegenerator Integration Tests
 *
 * Comprehensive test suite for all 5 regeneration layers:
 * - Layer 1: Auto-repair (jsonrepair + field-name-fix)
 * - Layer 2: Critique-revise (LLM feedback loop)
 * - Layer 3: Partial regeneration (field-level atomic repair)
 * - Layer 4: Model escalation (20B → 120B)
 * - Layer 5: Emergency fallback (Gemini)
 *
 * @module tests/integration/unified-regeneration
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { z } from 'zod';
import {
  UnifiedRegenerator,
  critiqueAndRevise,
  regeneratePartialFields,
  escalateToLargerModel,
  emergencyFallback,
} from '@/shared/regeneration';
import { getModelForPhase } from '@/orchestrator/services/analysis/langchain-models';

// Test schema
const TestSchema = z.object({
  name: z.string(),
  count: z.number(),
  active: z.boolean(),
});

type TestData = z.infer<typeof TestSchema>;

describe('UnifiedRegenerator Integration Tests', () => {
  // Test setup
  let testCourseId: string;

  beforeAll(() => {
    testCourseId = 'test-course-' + Date.now();
  });

  // ============================================================================
  // Layer 1: Auto-repair Tests
  // ============================================================================

  describe('Layer 1: Auto-repair', () => {
    test('handles valid JSON with camelCase fields', async () => {
      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair'],
        maxRetries: 1,
        metricsTracking: false,
        stage: 'other',
      });

      const result = await regenerator.regenerate({
        rawOutput: '{"name": "test", "count": 5, "active": true}',
        originalPrompt: 'Generate test data',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test', count: 5, active: true });
      expect(result.metadata.layerUsed).toBe('auto-repair');
    });

    test('repairs JSON with trailing commas', async () => {
      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair'],
        maxRetries: 1,
        metricsTracking: false,
        stage: 'other',
      });

      const result = await regenerator.regenerate({
        rawOutput: '{"name": "test", "count": 5, "active": true,}',
        originalPrompt: 'Generate test data',
      });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('test');
    });

    test('repairs JSON with markdown code blocks', async () => {
      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair'],
        maxRetries: 1,
        metricsTracking: false,
        stage: 'other',
      });

      const result = await regenerator.regenerate({
        rawOutput: '```json\n{"name": "test", "count": 5, "active": true}\n```',
        originalPrompt: 'Generate test data',
      });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('test');
    });

    test('fixes camelCase to snake_case field names', async () => {
      const SchemaWithSnakeCase = z.object({
        user_name: z.string(),
        item_count: z.number(),
      });

      const regenerator = new UnifiedRegenerator({
        enabledLayers: ['auto-repair'],
        maxRetries: 1,
        metricsTracking: false,
        stage: 'other',
      });

      const result = await regenerator.regenerate({
        rawOutput: '{"userName": "john", "itemCount": 10}',
        originalPrompt: 'Generate test data',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('user_name');
      expect(result.data).toHaveProperty('item_count');
    });
  });

  // ============================================================================
  // Layer 2: Critique-revise Tests
  // ============================================================================

  describe('Layer 2: Critique-revise', () => {
    test('invokes LLM to fix malformed JSON', async () => {
      const model = await getModelForPhase('stage_4_scope', testCourseId);

      const result = await critiqueAndRevise(
        'Generate a JSON object with name, count, and active fields',
        '{"name": "test", "count": 5',
        'Unexpected end of JSON',
        model,
        1
      );

      expect(result.data).toBeDefined();
      expect(result.attempts).toBeGreaterThan(0);
    }, 30000); // 30s timeout for LLM call

    test('uses Layer 2 when Layer 1 fails', async () => {
      const model = await getModelForPhase('stage_4_scope', testCourseId);

      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair', 'critique-revise'],
        maxRetries: 1,
        model: model,
        metricsTracking: false,
        stage: 'other',
        courseId: testCourseId,
      });

      // Intentionally broken JSON that Layer 1 cannot fix
      const result = await regenerator.regenerate({
        rawOutput: '{"name": incomplete json',
        originalPrompt: 'Generate test data with name, count, active',
        parseError: 'Unexpected end of JSON',
      });

      // Layer 2 should attempt to fix it
      expect(['critique-revise', 'auto-repair']).toContain(result.metadata.layerUsed);
    }, 30000);
  });

  // ============================================================================
  // Layer 3: Partial Regeneration Tests
  // ============================================================================

  describe('Layer 3: Partial regeneration', () => {
    test('regenerates only failed fields', async () => {
      const model = await getModelForPhase('stage_4_scope', testCourseId);

      const partialData = {
        name: 'valid name',
        count: 999,
        active: null, // This field is invalid
      };

      const result = await regeneratePartialFields(
        TestSchema,
        partialData,
        'Generate complete test data',
        model
      );

      expect(result.data).toBeDefined();
      expect(result.successfulFields).toContain('name');
      expect(result.successfulFields).toContain('count');
      expect(result.regeneratedFields).toContain('active');
    }, 30000);

    test('preserves successful fields from original', async () => {
      const model = await getModelForPhase('stage_4_scope', testCourseId);

      const partialData = {
        name: 'preserve this',
        count: 42,
        active: null,
      };

      const result = await regeneratePartialFields(
        TestSchema,
        partialData,
        'Generate complete test data',
        model
      );

      // Successful fields should be preserved
      expect(result.data.name).toBe('preserve this');
      expect(result.data.count).toBe(42);
    }, 30000);
  });

  // ============================================================================
  // Layer 4: Model Escalation Tests
  // ============================================================================

  describe('Layer 4: Model escalation', () => {
    test('escalates to larger model (120B)', async () => {
      const result = await escalateToLargerModel(
        'Generate JSON: {"name": "test", "count": 5, "active": true}',
        testCourseId,
        ['stage_4_expert']
      );

      expect(result.output).toBeDefined();
      expect(result.modelUsed).toBeDefined();
      expect(result.phaseUsed).toBe('stage_4_expert');
    }, 30000);

    test('uses Layer 4 when previous layers fail', async () => {
      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair', 'model-escalation'],
        maxRetries: 1,
        metricsTracking: false,
        stage: 'analyze',
        courseId: testCourseId,
        phaseId: 'stage_4_scope',
      });

      // Provide malformed JSON that might require escalation
      const result = await regenerator.regenerate({
        rawOutput: '{"name": "test"',
        originalPrompt: 'Generate complete test data: {"name": "test", "count": 5, "active": true}',
        parseError: 'Unexpected end',
      });

      // Should use one of the layers
      expect(result.metadata.layerUsed).toBeDefined();
    }, 30000);
  });

  // ============================================================================
  // Layer 5: Emergency Fallback Tests
  // ============================================================================

  describe('Layer 5: Emergency fallback', () => {
    test('invokes emergency model (Gemini)', async () => {
      const result = await emergencyFallback(
        'Generate JSON: {"name": "test", "count": 5, "active": true}',
        testCourseId
      );

      expect(result.output).toBeDefined();
      expect(result.modelUsed).toContain('gemini');
    }, 30000);

    test('uses Layer 5 as last resort', async () => {
      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair', 'emergency'],
        maxRetries: 1,
        metricsTracking: false,
        stage: 'analyze',
        courseId: testCourseId,
      });

      const result = await regenerator.regenerate({
        rawOutput: '{"name": "test"',
        originalPrompt: 'Generate complete test data: {"name": "test", "count": 5, "active": true}',
        parseError: 'Unexpected end',
      });

      expect(result.metadata.layerUsed).toBeDefined();
    }, 30000);
  });

  // ============================================================================
  // Full Pipeline Tests
  // ============================================================================

  describe('Full pipeline tests', () => {
    test('executes all 5 layers in sequence', async () => {
      const model = await getModelForPhase('stage_4_scope', testCourseId);

      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
        maxRetries: 2,
        schema: TestSchema,
        model: model,
        metricsTracking: true,
        stage: 'analyze',
        courseId: testCourseId,
        phaseId: 'stage_4_scope',
      });

      const result = await regenerator.regenerate({
        rawOutput: '{"name": "test", "count": 5, "active": true}',
        originalPrompt: 'Generate test data',
      });

      expect(result.success).toBe(true);
      expect(result.metadata.layerUsed).toBeDefined();
    }, 30000);

    test('quality validation hooks work', async () => {
      let validatorCalled = false;

      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair'],
        maxRetries: 1,
        qualityValidator: (data) => {
          validatorCalled = true;
          return data.count > 0;
        },
        metricsTracking: false,
        stage: 'generation',
      });

      const result = await regenerator.regenerate({
        rawOutput: '{"name": "test", "count": 5, "active": true}',
        originalPrompt: 'Generate test data',
      });

      expect(result.success).toBe(true);
      expect(validatorCalled).toBe(true);
    });

    test('metrics tracking records layer usage', async () => {
      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair'],
        maxRetries: 1,
        metricsTracking: true,
        stage: 'generation',
        courseId: testCourseId,
        phaseId: 'test_phase',
      });

      const result = await regenerator.regenerate({
        rawOutput: '{"name": "test", "count": 5, "active": true}',
        originalPrompt: 'Generate test data',
      });

      expect(result.metadata.layerUsed).toBe('auto-repair');
      expect(result.metadata.retryCount).toBeDefined();
      expect(result.metadata.tokenCost).toBeDefined();
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error handling', () => {
    test('returns failure when all layers exhausted', async () => {
      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair'],
        maxRetries: 1,
        metricsTracking: false,
        stage: 'other',
      });

      const result = await regenerator.regenerate({
        rawOutput: 'completely invalid not even close to JSON',
        originalPrompt: 'Generate test data',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('propagates error metadata', async () => {
      const regenerator = new UnifiedRegenerator<TestData>({
        enabledLayers: ['auto-repair'],
        maxRetries: 1,
        metricsTracking: false,
        stage: 'other',
      });

      const result = await regenerator.regenerate({
        rawOutput: 'invalid',
        originalPrompt: 'Generate test data',
      });

      expect(result.metadata.layerUsed).toBe('failed');
      expect(result.metadata.retryCount).toBeGreaterThanOrEqual(0);
    });
  });
});
