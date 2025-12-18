import { describe, it, expect } from 'vitest';
import { getStageFromStatus, isAwaitingApproval, buildStagesFromStatus, STAGE_CONFIG } from '@/components/generation-celestial/utils';
import { GenerationProgress } from '@/types/course-generation';

const mockProgress: GenerationProgress = {
  steps: [],
  message: '',
  percentage: 50,
  current_step: 3,
  total_steps: 6,
  has_documents: false,
  lessons_completed: 0,
  lessons_total: 5,
  started_at: new Date(),
  current_stage: null
};

describe('utils', () => {
  describe('getStageFromStatus', () => {
    it('returns 2 for processing_documents', () => {
      expect(getStageFromStatus('processing_documents')).toBe(2);
    });
    it('returns 4 for analyzing_task', () => {
      expect(getStageFromStatus('analyzing_task')).toBe(4);
    });
    it('returns 6 for completed', () => {
      expect(getStageFromStatus('completed')).toBe(6);
    });
    it('returns null for unknown status', () => {
      expect(getStageFromStatus('unknown_status')).toBeNull();
    });
  });

  describe('isAwaitingApproval', () => {
    it('returns stage number when awaiting', () => {
      expect(isAwaitingApproval('stage_4_awaiting_approval')).toBe(4);
    });
    it('returns null when not awaiting', () => {
      expect(isAwaitingApproval('processing_documents')).toBeNull();
    });
  });

  describe('buildStagesFromStatus', () => {
    it('marks all prior stages as completed when in stage 4', () => {
      const stages = buildStagesFromStatus('analyzing_task', mockProgress, []);
      expect(stages.find(s => s.id === 'stage_2')?.status).toBe('completed');
      expect(stages.find(s => s.id === 'stage_3')?.status).toBe('completed');
      expect(stages.find(s => s.id === 'stage_4')?.status).toBe('active');
      expect(stages.find(s => s.id === 'stage_5')?.status).toBe('pending');
    });

    it('handles awaiting approval state', () => {
      const stages = buildStagesFromStatus('stage_2_awaiting_approval', mockProgress, []);
      expect(stages.find(s => s.id === 'stage_2')?.status).toBe('awaiting');
      expect(stages.find(s => s.id === 'stage_3')?.status).toBe('pending');
    });
  });
});
