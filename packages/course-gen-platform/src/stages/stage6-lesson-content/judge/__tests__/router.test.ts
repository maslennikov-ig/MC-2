/**
 * Unit Tests for Router Module (route-task.ts)
 *
 * Tests T033 and T034 requirements:
 * T033 - routeTask() decision logic:
 *   - Critical structural issue → FULL_REGENERATE (planner)
 *   - Critical factual error → REGENERATE_SECTION (section_expander)
 *   - Major with 3+ issues → REGENERATE_SECTION
 *   - Minor clarity issue → SURGICAL_EDIT (patcher)
 *   - Token estimation is calculated correctly
 *
 * T034 - createExecutionBatches() parallel batching:
 *   - Non-adjacent sections can run in parallel
 *   - Adjacent sections run sequentially (in different batches)
 *   - Max 3 concurrent tasks per batch
 *   - Empty input returns empty batches
 *   - Priority ordering (critical > major > minor)
 *
 * @module tests/unit/judge/router.test
 */

import { describe, it, expect } from 'vitest';
import {
  routeTask,
  createExecutionBatches,
  parseSectionIndex,
} from '../../../src/stages/stage6-lesson-content/judge/router/route-task';
import type {
  SectionRefinementTask,
  TargetedIssue,
  RouterDecision,
  RoutingConfig,
  TaskPriority,
} from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';

// ============================================================================
// HELPER FUNCTIONS - Mock Data Generators
// ============================================================================

/**
 * Create a mock TargetedIssue for testing
 */
function createMockIssue(
  criterion: 'pedagogical_structure' | 'factual_accuracy' | 'clarity_readability' | 'completeness' | 'learning_objective_alignment' | 'engagement_examples',
  severity: 'critical' | 'major' | 'minor',
  sectionId: string = 'sec_001'
): TargetedIssue {
  return {
    id: `issue_${criterion}_${severity}`,
    criterion,
    severity,
    location: 'Section 1, paragraph 2',
    description: `Test issue for ${criterion} with ${severity} severity`,
    suggestedFix: 'Suggested fix for this issue',
    targetSectionId: sectionId,
    fixAction: 'SURGICAL_EDIT',
    contextWindow: {
      scope: 'paragraph',
      startQuote: 'Start of problematic text',
      endQuote: 'End of problematic text',
    },
    fixInstructions: 'Instructions for fixing this issue',
  };
}

/**
 * Create a mock SectionRefinementTask for testing
 */
function createMockTask(
  sectionId: string,
  priority: TaskPriority,
  issues: TargetedIssue[]
): SectionRefinementTask {
  return {
    sectionId,
    sectionTitle: `Section ${sectionId}`,
    actionType: 'SURGICAL_EDIT',
    synthesizedInstructions: 'Synthesized fix instructions',
    contextAnchors: {
      prevSectionEnd: 'End of previous section...',
      nextSectionStart: 'Start of next section...',
    },
    priority,
    sourceIssues: issues,
  };
}

/**
 * Create default routing config
 */
function createDefaultRoutingConfig(): RoutingConfig {
  return {
    tokenBudget: 10000,
    maxPatcherCalls: 3,
    preferSurgical: true,
  };
}

// ============================================================================
// T033 - routeTask() DECISION LOGIC TESTS
// ============================================================================

describe('T033 - routeTask() decision logic', () => {
  describe('Critical structural issues → FULL_REGENERATE', () => {
    it('should route to planner for critical pedagogical_structure issue', () => {
      const task = createMockTask(
        'sec_001',
        'critical',
        [createMockIssue('pedagogical_structure', 'critical')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.action).toBe('FULL_REGENERATE');
      expect(decision.executor).toBe('planner');
      expect(decision.estimatedTokens).toBe(REFINEMENT_CONFIG.tokenCosts.fullRegenerate.max);
      expect(decision.reason).toContain('Critical structural issue');
      expect(decision.task).toBe(task);
    });

    it('should route to planner for critical learning_objective_alignment issue', () => {
      const task = createMockTask(
        'sec_002',
        'critical',
        [createMockIssue('learning_objective_alignment', 'critical')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.action).toBe('FULL_REGENERATE');
      expect(decision.executor).toBe('planner');
      expect(decision.estimatedTokens).toBe(REFINEMENT_CONFIG.tokenCosts.fullRegenerate.max);
    });

    it('should prioritize critical structural over other issues', () => {
      const task = createMockTask(
        'sec_003',
        'critical',
        [
          createMockIssue('pedagogical_structure', 'critical'),
          createMockIssue('clarity_readability', 'minor'),
          createMockIssue('engagement_examples', 'major'),
        ]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      // Should still route to FULL_REGENERATE due to critical structural issue
      expect(decision.action).toBe('FULL_REGENERATE');
      expect(decision.executor).toBe('planner');
    });
  });

  describe('Critical factual errors → REGENERATE_SECTION', () => {
    it('should route to section-expander for critical factual_accuracy issue', () => {
      const task = createMockTask(
        'sec_001',
        'critical',
        [createMockIssue('factual_accuracy', 'critical')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.action).toBe('REGENERATE_SECTION');
      expect(decision.executor).toBe('section-expander');
      expect(decision.estimatedTokens).toBe(REFINEMENT_CONFIG.tokenCosts.sectionExpander.max);
      expect(decision.reason).toContain('Factual error requires section regeneration');
    });

    it('should route to section-expander for major factual_accuracy issue', () => {
      const task = createMockTask(
        'sec_002',
        'major',
        [createMockIssue('factual_accuracy', 'major')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.action).toBe('REGENERATE_SECTION');
      expect(decision.executor).toBe('section-expander');
    });

    it('should route to section-expander even for minor factual_accuracy issue', () => {
      const task = createMockTask(
        'sec_003',
        'minor',
        [createMockIssue('factual_accuracy', 'minor')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      // Factual errors always require section regeneration with RAG
      expect(decision.action).toBe('REGENERATE_SECTION');
      expect(decision.executor).toBe('section-expander');
    });
  });

  describe('Multiple issues (3+) → REGENERATE_SECTION', () => {
    it('should route to section-expander when task has 3 issues', () => {
      const task = createMockTask(
        'sec_001',
        'major',
        [
          createMockIssue('clarity_readability', 'major'),
          createMockIssue('engagement_examples', 'major'),
          createMockIssue('completeness', 'minor'),
        ]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.action).toBe('REGENERATE_SECTION');
      expect(decision.executor).toBe('section-expander');
      expect(decision.reason).toContain('Multiple issues');
    });

    it('should route to section-expander when task has 4+ issues', () => {
      const task = createMockTask(
        'sec_002',
        'major',
        [
          createMockIssue('clarity_readability', 'minor'),
          createMockIssue('engagement_examples', 'minor'),
          createMockIssue('completeness', 'minor'),
          createMockIssue('pedagogical_structure', 'minor'),
        ]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.action).toBe('REGENERATE_SECTION');
      expect(decision.executor).toBe('section-expander');
      expect(decision.estimatedTokens).toBe(REFINEMENT_CONFIG.tokenCosts.sectionExpander.max);
    });

    it('should not route to section-expander when task has only 2 issues', () => {
      const task = createMockTask(
        'sec_003',
        'minor',
        [
          createMockIssue('clarity_readability', 'minor'),
          createMockIssue('engagement_examples', 'minor'),
        ]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      // Should use patcher for clarity-only issues
      expect(decision.action).toBe('SURGICAL_EDIT');
      expect(decision.executor).toBe('patcher');
    });
  });

  describe('Minor/clarity issues → SURGICAL_EDIT', () => {
    it('should route to patcher for single clarity_readability issue', () => {
      const task = createMockTask(
        'sec_001',
        'minor',
        [createMockIssue('clarity_readability', 'minor')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.action).toBe('SURGICAL_EDIT');
      expect(decision.executor).toBe('patcher');
      expect(decision.estimatedTokens).toBe(REFINEMENT_CONFIG.tokenCosts.patcher.max);
      expect(decision.reason).toContain('Minor/clarity issue suitable for surgical edit');
    });

    it('should route to patcher for single engagement_examples issue', () => {
      const task = createMockTask(
        'sec_002',
        'minor',
        [createMockIssue('engagement_examples', 'minor')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.action).toBe('SURGICAL_EDIT');
      expect(decision.executor).toBe('patcher');
    });

    it('should route to patcher for multiple clarity-only issues', () => {
      const task = createMockTask(
        'sec_003',
        'minor',
        [
          createMockIssue('clarity_readability', 'minor'),
          createMockIssue('engagement_examples', 'minor'),
        ]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      // Clarity-only issues use patcher even if multiple (but < 3)
      expect(decision.action).toBe('SURGICAL_EDIT');
      expect(decision.executor).toBe('patcher');
    });

    it('should route to patcher when priority is minor (regardless of issue type)', () => {
      const task = createMockTask(
        'sec_004',
        'minor',
        [createMockIssue('completeness', 'minor')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.action).toBe('SURGICAL_EDIT');
      expect(decision.executor).toBe('patcher');
    });
  });

  describe('Configuration preference handling', () => {
    it('should use patcher when preferSurgical=true for non-critical issues', () => {
      const task = createMockTask(
        'sec_001',
        'major',
        [createMockIssue('completeness', 'major')]
      );
      const config: RoutingConfig = {
        tokenBudget: 10000,
        maxPatcherCalls: 3,
        preferSurgical: true,
      };

      const decision = routeTask(task, config);

      expect(decision.action).toBe('SURGICAL_EDIT');
      expect(decision.executor).toBe('patcher');
      expect(decision.reason).toContain('Default routing based on configuration preference');
    });

    it('should use section-expander when preferSurgical=false for non-critical issues', () => {
      const task = createMockTask(
        'sec_002',
        'major',
        [createMockIssue('completeness', 'major')]
      );
      const config: RoutingConfig = {
        tokenBudget: 10000,
        maxPatcherCalls: 3,
        preferSurgical: false,
      };

      const decision = routeTask(task, config);

      expect(decision.action).toBe('REGENERATE_SECTION');
      expect(decision.executor).toBe('section-expander');
      expect(decision.reason).toContain('Default routing based on configuration preference');
    });

    it('should override preferSurgical for critical structural issues', () => {
      const task = createMockTask(
        'sec_003',
        'critical',
        [createMockIssue('pedagogical_structure', 'critical')]
      );
      const config: RoutingConfig = {
        tokenBudget: 10000,
        maxPatcherCalls: 3,
        preferSurgical: true,
      };

      const decision = routeTask(task, config);

      // Critical structural always goes to planner regardless of preferSurgical
      expect(decision.action).toBe('FULL_REGENERATE');
      expect(decision.executor).toBe('planner');
    });

    it('should override preferSurgical for factual errors', () => {
      const task = createMockTask(
        'sec_004',
        'major',
        [createMockIssue('factual_accuracy', 'major')]
      );
      const config: RoutingConfig = {
        tokenBudget: 10000,
        maxPatcherCalls: 3,
        preferSurgical: true,
      };

      const decision = routeTask(task, config);

      // Factual errors always go to section-expander regardless of preferSurgical
      expect(decision.action).toBe('REGENERATE_SECTION');
      expect(decision.executor).toBe('section-expander');
    });
  });

  describe('Token estimation', () => {
    it('should estimate patcher tokens correctly', () => {
      const task = createMockTask(
        'sec_001',
        'minor',
        [createMockIssue('clarity_readability', 'minor')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.estimatedTokens).toBe(REFINEMENT_CONFIG.tokenCosts.patcher.max);
    });

    it('should estimate section-expander tokens correctly', () => {
      const task = createMockTask(
        'sec_002',
        'major',
        [createMockIssue('factual_accuracy', 'major')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.estimatedTokens).toBe(REFINEMENT_CONFIG.tokenCosts.sectionExpander.max);
    });

    it('should estimate full regenerate tokens correctly', () => {
      const task = createMockTask(
        'sec_003',
        'critical',
        [createMockIssue('pedagogical_structure', 'critical')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.estimatedTokens).toBe(REFINEMENT_CONFIG.tokenCosts.fullRegenerate.max);
    });
  });

  describe('RouterDecision structure', () => {
    it('should return complete RouterDecision object', () => {
      const task = createMockTask(
        'sec_001',
        'minor',
        [createMockIssue('clarity_readability', 'minor')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision).toHaveProperty('task');
      expect(decision).toHaveProperty('action');
      expect(decision).toHaveProperty('executor');
      expect(decision).toHaveProperty('estimatedTokens');
      expect(decision).toHaveProperty('reason');

      expect(decision.task).toBe(task);
      expect(typeof decision.action).toBe('string');
      expect(typeof decision.executor).toBe('string');
      expect(typeof decision.estimatedTokens).toBe('number');
      expect(typeof decision.reason).toBe('string');
    });

    it('should have positive token estimate', () => {
      const task = createMockTask(
        'sec_001',
        'minor',
        [createMockIssue('clarity_readability', 'minor')]
      );
      const config = createDefaultRoutingConfig();

      const decision = routeTask(task, config);

      expect(decision.estimatedTokens).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// T034 - createExecutionBatches() PARALLEL BATCHING TESTS
// ============================================================================

describe('T034 - createExecutionBatches() parallel batching', () => {
  describe('Empty and single task inputs', () => {
    it('should return empty array for empty task list', () => {
      const batches = createExecutionBatches([]);

      expect(batches).toEqual([]);
      expect(batches.length).toBe(0);
    });

    it('should return single batch for single task', () => {
      const tasks = [
        createMockTask('sec_001', 'major', [createMockIssue('clarity_readability', 'major')]),
      ];

      const batches = createExecutionBatches(tasks);

      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(1);
      expect(batches[0][0]).toBe(tasks[0]);
    });
  });

  describe('Non-adjacent sections can run in parallel', () => {
    it('should batch non-adjacent sections (gap > 1) together', () => {
      const tasks = [
        createMockTask('sec_0', 'major', [createMockIssue('clarity_readability', 'major', 'sec_0')]),
        createMockTask('sec_2', 'major', [createMockIssue('clarity_readability', 'major', 'sec_2')]),
        createMockTask('sec_4', 'major', [createMockIssue('clarity_readability', 'major', 'sec_4')]),
      ];

      const batches = createExecutionBatches(tasks);

      // All three sections (0, 2, 4) have gap > 1 between them
      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(3);
    });

    it('should batch sections with gap of 2', () => {
      const tasks = [
        createMockTask('sec_1', 'major', [createMockIssue('clarity_readability', 'major', 'sec_1')]),
        createMockTask('sec_3', 'major', [createMockIssue('clarity_readability', 'major', 'sec_3')]),
      ];

      const batches = createExecutionBatches(tasks);

      // Sections 1 and 3 have gap of 2 (adjacentSectionGap = 1)
      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(2);
    });

    it('should batch sections with large gap (e.g., sec_0 and sec_10)', () => {
      const tasks = [
        createMockTask('sec_0', 'major', [createMockIssue('clarity_readability', 'major', 'sec_0')]),
        createMockTask('sec_10', 'major', [createMockIssue('clarity_readability', 'major', 'sec_10')]),
      ];

      const batches = createExecutionBatches(tasks);

      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(2);
    });
  });

  describe('Adjacent sections run sequentially', () => {
    it('should separate adjacent sections (gap = 1) into different batches', () => {
      const tasks = [
        createMockTask('sec_0', 'major', [createMockIssue('clarity_readability', 'major', 'sec_0')]),
        createMockTask('sec_1', 'major', [createMockIssue('clarity_readability', 'major', 'sec_1')]),
      ];

      const batches = createExecutionBatches(tasks);

      // Sections 0 and 1 are adjacent (gap = 1), must be in different batches
      expect(batches.length).toBe(2);
      expect(batches[0].length).toBe(1);
      expect(batches[1].length).toBe(1);
    });

    it('should separate consecutive sections into different batches', () => {
      const tasks = [
        createMockTask('sec_1', 'major', [createMockIssue('clarity_readability', 'major', 'sec_1')]),
        createMockTask('sec_2', 'major', [createMockIssue('clarity_readability', 'major', 'sec_2')]),
        createMockTask('sec_3', 'major', [createMockIssue('clarity_readability', 'major', 'sec_3')]),
      ];

      const batches = createExecutionBatches(tasks);

      // Greedy algorithm will batch as: [sec_1, sec_3], [sec_2]
      // - sec_1 → batch 0
      // - sec_2 → adjacent to sec_1 (gap=1), creates batch 1
      // - sec_3 → tries batch 0 first, NOT adjacent to sec_1 (gap=2 > 1), joins batch 0
      expect(batches.length).toBe(2);
      expect(batches[0].length).toBe(2);
      expect(batches[0].map(t => t.sectionId).sort()).toEqual(['sec_1', 'sec_3']);
      expect(batches[1].length).toBe(1);
      expect(batches[1][0].sectionId).toBe('sec_2');

      // Verify adjacency constraint is still met (no two tasks in same batch with gap <= 1)
      for (const batch of batches) {
        const sectionIndices = batch.map(t => parseSectionIndex(t.sectionId));
        for (let i = 0; i < sectionIndices.length - 1; i++) {
          for (let j = i + 1; j < sectionIndices.length; j++) {
            const gap = Math.abs(sectionIndices[i] - sectionIndices[j]);
            expect(gap).toBeGreaterThan(REFINEMENT_CONFIG.parallel.adjacentSectionGap);
          }
        }
      }
    });

    it('should handle mix of adjacent and non-adjacent sections', () => {
      const tasks = [
        createMockTask('sec_0', 'major', [createMockIssue('clarity_readability', 'major', 'sec_0')]),
        createMockTask('sec_1', 'major', [createMockIssue('clarity_readability', 'major', 'sec_1')]),
        createMockTask('sec_3', 'major', [createMockIssue('clarity_readability', 'major', 'sec_3')]),
        createMockTask('sec_5', 'major', [createMockIssue('clarity_readability', 'major', 'sec_5')]),
      ];

      const batches = createExecutionBatches(tasks);

      // Batch 1: sec_0, sec_3, sec_5 (all non-adjacent)
      // Batch 2: sec_1
      expect(batches.length).toBe(2);

      // First batch should have non-adjacent sections
      const batch1SectionIds = batches[0].map(t => t.sectionId).sort();
      expect(batch1SectionIds).toContain('sec_0');
      expect(batch1SectionIds).toContain('sec_3');
      expect(batch1SectionIds).toContain('sec_5');

      // Second batch should have sec_1 (adjacent to sec_0)
      expect(batches[1][0].sectionId).toBe('sec_1');
    });
  });

  describe('Max concurrent tasks per batch (maxConcurrent = 3)', () => {
    it('should respect maxConcurrent limit of 3', () => {
      const tasks = [
        createMockTask('sec_0', 'major', [createMockIssue('clarity_readability', 'major', 'sec_0')]),
        createMockTask('sec_2', 'major', [createMockIssue('clarity_readability', 'major', 'sec_2')]),
        createMockTask('sec_4', 'major', [createMockIssue('clarity_readability', 'major', 'sec_4')]),
        createMockTask('sec_6', 'major', [createMockIssue('clarity_readability', 'major', 'sec_6')]),
      ];

      const batches = createExecutionBatches(tasks);

      // Should create 2 batches: [sec_0, sec_2, sec_4] and [sec_6]
      expect(batches.length).toBe(2);
      expect(batches[0].length).toBe(3); // Max concurrent
      expect(batches[1].length).toBe(1);
    });

    it('should split 6 non-adjacent tasks into 2 batches of 3', () => {
      const tasks = [
        createMockTask('sec_0', 'major', [createMockIssue('clarity_readability', 'major', 'sec_0')]),
        createMockTask('sec_2', 'major', [createMockIssue('clarity_readability', 'major', 'sec_2')]),
        createMockTask('sec_4', 'major', [createMockIssue('clarity_readability', 'major', 'sec_4')]),
        createMockTask('sec_6', 'major', [createMockIssue('clarity_readability', 'major', 'sec_6')]),
        createMockTask('sec_8', 'major', [createMockIssue('clarity_readability', 'major', 'sec_8')]),
        createMockTask('sec_10', 'major', [createMockIssue('clarity_readability', 'major', 'sec_10')]),
      ];

      const batches = createExecutionBatches(tasks);

      expect(batches.length).toBe(2);
      expect(batches[0].length).toBe(3);
      expect(batches[1].length).toBe(3);
    });

    it('should handle custom maxConcurrent parameter', () => {
      const tasks = [
        createMockTask('sec_0', 'major', [createMockIssue('clarity_readability', 'major', 'sec_0')]),
        createMockTask('sec_2', 'major', [createMockIssue('clarity_readability', 'major', 'sec_2')]),
        createMockTask('sec_4', 'major', [createMockIssue('clarity_readability', 'major', 'sec_4')]),
      ];

      const batches = createExecutionBatches(tasks, 2); // Max 2 concurrent

      // Should create 2 batches: [sec_0, sec_2] and [sec_4]
      expect(batches.length).toBe(2);
      expect(batches[0].length).toBe(2);
      expect(batches[1].length).toBe(1);
    });
  });

  describe('Priority ordering (critical > major > minor)', () => {
    it('should sort tasks by priority before batching', () => {
      const tasks = [
        createMockTask('sec_0', 'minor', [createMockIssue('clarity_readability', 'minor', 'sec_0')]),
        createMockTask('sec_2', 'critical', [createMockIssue('pedagogical_structure', 'critical', 'sec_2')]),
        createMockTask('sec_4', 'major', [createMockIssue('completeness', 'major', 'sec_4')]),
      ];

      const batches = createExecutionBatches(tasks);

      // All should be in one batch (non-adjacent)
      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(3);

      // First task should be critical priority
      expect(batches[0][0].priority).toBe('critical');
      expect(batches[0][0].sectionId).toBe('sec_2');

      // Second should be major
      expect(batches[0][1].priority).toBe('major');
      expect(batches[0][1].sectionId).toBe('sec_4');

      // Third should be minor
      expect(batches[0][2].priority).toBe('minor');
      expect(batches[0][2].sectionId).toBe('sec_0');
    });

    it('should prioritize critical tasks in first batch when limited by maxConcurrent', () => {
      const tasks = [
        createMockTask('sec_0', 'minor', [createMockIssue('clarity_readability', 'minor', 'sec_0')]),
        createMockTask('sec_2', 'minor', [createMockIssue('clarity_readability', 'minor', 'sec_2')]),
        createMockTask('sec_4', 'critical', [createMockIssue('pedagogical_structure', 'critical', 'sec_4')]),
        createMockTask('sec_6', 'major', [createMockIssue('completeness', 'major', 'sec_6')]),
      ];

      const batches = createExecutionBatches(tasks);

      // First batch should have critical and major tasks
      expect(batches[0][0].priority).toBe('critical');
      expect(batches[0][1].priority).toBe('major');
      expect(batches[0][2].priority).toBe('minor');

      // Second batch should have remaining minor task
      expect(batches[1][0].priority).toBe('minor');
    });

    it('should maintain priority order within same priority level', () => {
      const tasks = [
        createMockTask('sec_0', 'major', [createMockIssue('clarity_readability', 'major', 'sec_0')]),
        createMockTask('sec_2', 'major', [createMockIssue('completeness', 'major', 'sec_2')]),
        createMockTask('sec_4', 'major', [createMockIssue('engagement_examples', 'major', 'sec_4')]),
      ];

      const batches = createExecutionBatches(tasks);

      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(3);

      // All should be major priority
      expect(batches[0][0].priority).toBe('major');
      expect(batches[0][1].priority).toBe('major');
      expect(batches[0][2].priority).toBe('major');
    });
  });

  describe('Complex batching scenarios', () => {
    it('should handle complex mix of adjacent, non-adjacent, and priority', () => {
      const tasks = [
        createMockTask('sec_0', 'minor', [createMockIssue('clarity_readability', 'minor', 'sec_0')]),
        createMockTask('sec_1', 'critical', [createMockIssue('pedagogical_structure', 'critical', 'sec_1')]),
        createMockTask('sec_3', 'major', [createMockIssue('completeness', 'major', 'sec_3')]),
        createMockTask('sec_5', 'minor', [createMockIssue('engagement_examples', 'minor', 'sec_5')]),
        createMockTask('sec_6', 'major', [createMockIssue('clarity_readability', 'major', 'sec_6')]),
      ];

      const batches = createExecutionBatches(tasks);

      // After sorting: critical (sec_1), major (sec_3, sec_6), minor (sec_0, sec_5)
      // Batch 1: sec_1 (critical), sec_3 (major, non-adjacent to sec_1), sec_5 (minor, non-adjacent to sec_3)
      // Batch 2: sec_6 (major, adjacent to sec_5), sec_0 (minor)

      expect(batches.length).toBeGreaterThan(0);

      // First task in first batch should be critical
      expect(batches[0][0].priority).toBe('critical');

      // Verify no two adjacent sections in same batch
      for (const batch of batches) {
        const sectionIndices = batch.map(t => parseSectionIndex(t.sectionId));
        for (let i = 0; i < sectionIndices.length - 1; i++) {
          for (let j = i + 1; j < sectionIndices.length; j++) {
            const gap = Math.abs(sectionIndices[i] - sectionIndices[j]);
            expect(gap).toBeGreaterThan(REFINEMENT_CONFIG.parallel.adjacentSectionGap);
          }
        }
      }
    });

    it('should not exceed maxConcurrent in any batch', () => {
      const tasks = [];
      for (let i = 0; i < 10; i += 2) {
        tasks.push(
          createMockTask(`sec_${i}`, 'major', [createMockIssue('clarity_readability', 'major', `sec_${i}`)])
        );
      }

      const batches = createExecutionBatches(tasks);

      // Verify no batch exceeds maxConcurrent
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(REFINEMENT_CONFIG.parallel.maxConcurrentPatchers);
      }
    });
  });

  describe('Named section handling', () => {
    it('should handle named sections (e.g., sec_introduction)', () => {
      const tasks = [
        createMockTask('sec_introduction', 'major', [createMockIssue('clarity_readability', 'major', 'sec_introduction')]),
        createMockTask('sec_content', 'major', [createMockIssue('completeness', 'major', 'sec_content')]),
      ];

      const batches = createExecutionBatches(tasks);

      // Named sections should be processed
      expect(batches.length).toBeGreaterThan(0);
      expect(batches[0].length).toBeGreaterThan(0);
    });

    it('should handle mix of numeric and named sections', () => {
      const tasks = [
        createMockTask('sec_0', 'major', [createMockIssue('clarity_readability', 'major', 'sec_0')]),
        createMockTask('sec_introduction', 'major', [createMockIssue('completeness', 'major', 'sec_introduction')]),
        createMockTask('sec_2', 'major', [createMockIssue('engagement_examples', 'major', 'sec_2')]),
      ];

      const batches = createExecutionBatches(tasks);

      expect(batches.length).toBeGreaterThan(0);

      // All tasks should be included
      const allTasks = batches.flat();
      expect(allTasks.length).toBe(3);
    });
  });
});

// ============================================================================
// HELPER FUNCTION TESTS - parseSectionIndex()
// ============================================================================

describe('parseSectionIndex() helper', () => {
  it('should parse numeric section IDs', () => {
    expect(parseSectionIndex('sec_0')).toBe(0);
    expect(parseSectionIndex('sec_1')).toBe(1);
    expect(parseSectionIndex('sec_10')).toBe(10);
    expect(parseSectionIndex('sec_999')).toBe(999);
  });

  it('should parse named section IDs to hash values', () => {
    const introIdx = parseSectionIndex('sec_introduction');
    const contentIdx = parseSectionIndex('sec_content');

    // Named sections should return non-negative numbers
    expect(introIdx).toBeGreaterThanOrEqual(0);
    expect(contentIdx).toBeGreaterThanOrEqual(0);

    // Different named sections should have different indices
    expect(introIdx).not.toBe(contentIdx);
  });

  it('should handle unknown section names with character code fallback', () => {
    const unknownIdx = parseSectionIndex('sec_unknown_section');

    expect(unknownIdx).toBeGreaterThanOrEqual(0);
    expect(typeof unknownIdx).toBe('number');
  });

  it('should return consistent values for same input', () => {
    const idx1 = parseSectionIndex('sec_5');
    const idx2 = parseSectionIndex('sec_5');

    expect(idx1).toBe(idx2);
  });
});
