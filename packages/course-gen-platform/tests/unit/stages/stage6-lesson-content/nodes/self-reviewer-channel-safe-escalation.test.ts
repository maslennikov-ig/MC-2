/**
 * Regression tests for channel-safe escalation in self-reviewer node.
 *
 * These tests verify that applyChannelSafeEscalation correctly sets
 * regenerationMode, regenerateCount, needsHumanReview, reviewInfo,
 * and errors in the NODE's state update (which goes through LangGraph
 * channel/reducer system) rather than in conditional-edge mutations
 * (which are silently lost).
 *
 * Key regression: before this fix, truncation_continuation → full_regenerate
 * escalation was set in the conditional edge and lost in the final graph output.
 */
import { describe, expect, it, vi } from 'vitest';
import { HANDLER_CONFIG } from '@/stages/stage6-lesson-content/config';
import type { LessonGraphStateUpdate } from '@/stages/stage6-lesson-content/state';

// Mock heavy dependencies of self-reviewer-node so we can import the lightweight
// applyChannelSafeEscalation function without loading LLM/DB/logger.
vi.mock('@/shared/logger', () => {
  const logger = {
    child: vi.fn().mockReturnThis(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger, default: logger };
});
vi.mock('@/shared/trace-logger', () => ({ logTrace: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/shared/llm', () => ({
  LLMClient: class {
    generateCompletion = vi.fn();
  },
}));
vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn().mockReturnValue({
    getModelForPhase: vi
      .fn()
      .mockResolvedValue({ modelId: 'test', maxTokens: 8000, temperature: 0.7 }),
  }),
}));
vi.mock('@/stages/stage6-lesson-content/services/database-service', () => ({
  saveRejectedContent: vi.fn().mockResolvedValue(undefined),
}));

import { applyChannelSafeEscalation } from '@/stages/stage6-lesson-content/nodes/self-reviewer-node';

describe('applyChannelSafeEscalation', () => {
  describe('truncation_continuation escalation to full_regenerate', () => {
    it('escalates to full_regenerate when truncation cap exceeded and full regen budget remains', () => {
      const stateUpdate: LessonGraphStateUpdate = {
        regenerationMode: 'truncation_continuation',
        truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS + 1,
        regenerateCount: 0,
      };

      applyChannelSafeEscalation(stateUpdate, 3);

      expect(stateUpdate.regenerationMode).toBe('full_regenerate');
      expect(stateUpdate.regenerateCount).toBe(1);
      expect(stateUpdate.needsHumanReview).toBeUndefined();
      expect(stateUpdate.reviewInfo).toBeUndefined();
    });

    it('sets terminal review_required when both truncation AND full regen budgets exhausted', () => {
      const stateUpdate: LessonGraphStateUpdate = {
        regenerationMode: 'truncation_continuation',
        truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS + 1,
        regenerateCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES,
      };

      applyChannelSafeEscalation(stateUpdate, 5);

      expect(stateUpdate.needsHumanReview).toBe(true);
      expect(stateUpdate.needsRegeneration).toBe(false);
      expect(stateUpdate.reviewInfo?.needsReview).toBe(true);
      expect(stateUpdate.reviewInfo!.reasons[0]).toContain(
        'Truncation continuation attempts exceeded'
      );
      expect(stateUpdate.errors).toBeDefined();
      expect(stateUpdate.errors![0]).toContain('Truncation continuation attempts exceeded');
    });

    it('does not escalate when truncation count is at cap (not exceeded)', () => {
      const stateUpdate: LessonGraphStateUpdate = {
        regenerationMode: 'truncation_continuation',
        truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS,
        regenerateCount: 0,
      };

      applyChannelSafeEscalation(stateUpdate, 2);

      // Should remain truncation_continuation — cap not exceeded
      expect(stateUpdate.regenerationMode).toBe('truncation_continuation');
      expect(stateUpdate.needsHumanReview).toBeUndefined();
    });
  });

  describe('full_regenerate terminal', () => {
    it('sets terminal review_required when full regen retryCount reaches MAX', () => {
      const stateUpdate: LessonGraphStateUpdate = {
        regenerationMode: 'full_regenerate',
        regenerateCount: 1,
        truncationCount: 0,
      };

      applyChannelSafeEscalation(stateUpdate, HANDLER_CONFIG.MAX_REGENERATION_RETRIES);

      expect(stateUpdate.needsHumanReview).toBe(true);
      expect(stateUpdate.needsRegeneration).toBe(false);
      expect(stateUpdate.reviewInfo?.needsReview).toBe(true);
      expect(stateUpdate.reviewInfo!.reasons[0]).toContain(
        'Self-review regeneration retries exceeded'
      );
      expect(stateUpdate.errors![0]).toContain('Self-review regeneration retries exceeded');
    });

    it('does not set terminal when retryCount is below MAX', () => {
      const stateUpdate: LessonGraphStateUpdate = {
        regenerationMode: 'full_regenerate',
        regenerateCount: 1,
        truncationCount: 0,
      };

      applyChannelSafeEscalation(stateUpdate, HANDLER_CONFIG.MAX_REGENERATION_RETRIES - 1);

      expect(stateUpdate.needsHumanReview).toBeUndefined();
      expect(stateUpdate.reviewInfo).toBeUndefined();
    });
  });

  describe('no-op cases', () => {
    it('does nothing for truncation_continuation below cap', () => {
      const stateUpdate: LessonGraphStateUpdate = {
        regenerationMode: 'truncation_continuation',
        truncationCount: 1,
        regenerateCount: 0,
      };

      applyChannelSafeEscalation(stateUpdate, 1);

      expect(stateUpdate.regenerationMode).toBe('truncation_continuation');
      expect(stateUpdate.needsHumanReview).toBeUndefined();
    });

    it('does nothing for full_regenerate below cap', () => {
      const stateUpdate: LessonGraphStateUpdate = {
        regenerationMode: 'full_regenerate',
        regenerateCount: 1,
        truncationCount: 0,
      };

      applyChannelSafeEscalation(stateUpdate, 0);

      expect(stateUpdate.regenerationMode).toBe('full_regenerate');
      expect(stateUpdate.needsHumanReview).toBeUndefined();
    });
  });
});
