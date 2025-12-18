/**
 * Contract Tests: Refinement Types (T037-T039)
 *
 * Test Objective: Verify Zod schema validation for Stage 6 Targeted Refinement types
 *
 * Test Coverage:
 * - T037: Arbiter Schema Contract Tests (ArbiterInputSchema, ArbiterOutputSchema)
 * - T038: Patcher Schema Contract Tests (PatcherInputSchema, PatcherOutputSchema)
 * - T039: Streaming Events Contract Tests (RefinementStreamEventSchema)
 *
 * Prerequisites:
 * - None (pure Zod schema validation tests)
 *
 * Test execution: pnpm test tests/contract/refinement-types.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ArbiterInputSchema,
  ArbiterOutputSchema,
  PatcherInputSchema,
  PatcherOutputSchema,
  RefinementStreamEventSchema,
} from '../../../../specs/018-judge-targeted-refinement/contracts/refinement-api';
import {
  JudgeAggregatedResultSchema,
  TargetedIssueSchema,
  RefinementPlanSchema,
  JudgeIssueSchema,
  JudgeVerdictSchema,
  CriteriaScoresSchema,
} from '@megacampus/shared-types/judge-types';
import { LessonContentBodySchema } from '@megacampus/shared-types/lesson-content';

// ============================================================================
// Mock Data Helpers
// ============================================================================

/**
 * Create valid CriteriaScores mock
 */
function createMockCriteriaScores() {
  return {
    learning_objective_alignment: 0.85,
    pedagogical_structure: 0.80,
    factual_accuracy: 0.90,
    clarity_readability: 0.75,
    engagement_examples: 0.70,
    completeness: 0.80,
  };
}

/**
 * Create valid JudgeVerdict mock
 */
function createMockJudgeVerdict() {
  return {
    overallScore: 0.82,
    passed: true,
    confidence: 'high' as const,
    criteriaScores: createMockCriteriaScores(),
    issues: [],
    strengths: ['Clear explanations', 'Good examples'],
    recommendation: 'ACCEPT_WITH_MINOR_REVISION' as const,
    judgeModel: 'deepseek/deepseek-v3.1-terminus',
    temperature: 0.1,
    tokensUsed: 1500,
    durationMs: 3000,
  };
}

/**
 * Create valid JudgeAggregatedResult mock
 */
function createMockJudgeAggregatedResult() {
  return {
    verdicts: [createMockJudgeVerdict(), createMockJudgeVerdict()],
    aggregatedScore: 0.82,
    finalRecommendation: 'ACCEPT_WITH_MINOR_REVISION' as const,
    votingMethod: 'unanimous' as const,
    consensusReached: true,
  };
}

/**
 * Create valid LessonContentBody mock
 */
function createMockLessonContentBody() {
  return {
    intro: 'This is the introduction paragraph for the lesson. It provides an overview of what will be covered in this lesson and sets expectations for learning outcomes.',
    sections: [
      {
        id: 'sec_intro',
        title: 'Introduction',
        content: 'This is the introduction section content with enough characters to meet the 50-character minimum requirement for validation.',
        order: 0,
      },
      {
        id: 'sec_main',
        title: 'Main Content',
        content: 'This is the main content section with detailed information and examples that exceed the minimum character requirement.',
        order: 1,
      },
    ],
    examples: [],
    exercises: [],
  };
}

/**
 * Create valid TargetedIssue mock
 */
function createMockTargetedIssue() {
  return {
    id: 'issue_1',
    criterion: 'clarity_readability' as const,
    severity: 'major' as const,
    location: 'section 1, paragraph 2',
    description: 'Sentence structure is too complex',
    quotedText: 'This is a very long and complex sentence that should be simplified.',
    suggestedFix: 'Break into two shorter sentences',
    targetSectionId: 'sec_intro',
    fixAction: 'SURGICAL_EDIT' as const,
    contextWindow: {
      startQuote: 'This is a very long',
      endQuote: 'should be simplified.',
      scope: 'paragraph' as const,
    },
    fixInstructions: 'Simplify the sentence by breaking it into two shorter sentences.',
  };
}

/**
 * Create valid RefinementPlan mock
 */
function createMockRefinementPlan() {
  return {
    issues: [createMockTargetedIssue()],
    sectionsToPreserve: ['sec_main'],
    sectionsToModify: ['sec_intro'],
    preserveTerminology: ['LLM', 'Judge'],
    iterationHistory: [],
    status: 'PENDING' as const,
    tasks: [],
    estimatedCost: 1200,
    agreementScore: 0.85,
    conflictResolutions: [],
    executionBatches: [],
  };
}

// ============================================================================
// T037: Arbiter Schema Contract Tests
// ============================================================================

describe('T037 - Arbiter Schema Contract Tests', () => {
  describe('ArbiterInputSchema', () => {
    it('should accept valid input with all required fields', () => {
      const validInput = {
        clevResult: createMockJudgeAggregatedResult(),
        lessonContent: createMockLessonContentBody(),
        operationMode: 'full-auto' as const,
      };

      const result = ArbiterInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operationMode).toBe('full-auto');
        expect(result.data.clevResult.aggregatedScore).toBe(0.82);
      }
    });

    it('should accept semi-auto operation mode', () => {
      const validInput = {
        clevResult: createMockJudgeAggregatedResult(),
        lessonContent: createMockLessonContentBody(),
        operationMode: 'semi-auto' as const,
      };

      const result = ArbiterInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operationMode).toBe('semi-auto');
      }
    });

    it('should reject missing clevResult field', () => {
      const invalidInput = {
        lessonContent: createMockLessonContentBody(),
        operationMode: 'full-auto' as const,
      };

      const result = ArbiterInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const clevResultIssue = result.error.issues.find(
          issue => issue.path[0] === 'clevResult'
        );
        expect(clevResultIssue).toBeDefined();
      }
    });

    it('should reject missing lessonContent field', () => {
      const invalidInput = {
        clevResult: createMockJudgeAggregatedResult(),
        operationMode: 'full-auto' as const,
      };

      const result = ArbiterInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['lessonContent']);
      }
    });

    it('should reject missing operationMode field', () => {
      const invalidInput = {
        clevResult: createMockJudgeAggregatedResult(),
        lessonContent: createMockLessonContentBody(),
      };

      const result = ArbiterInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const operationModeIssue = result.error.issues.find(
          issue => issue.path[0] === 'operationMode'
        );
        expect(operationModeIssue).toBeDefined();
      }
    });

    it('should reject invalid operationMode enum value', () => {
      const invalidInput = {
        clevResult: createMockJudgeAggregatedResult(),
        lessonContent: createMockLessonContentBody(),
        operationMode: 'invalid-mode' as any,
      };

      const result = ArbiterInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const operationModeIssue = result.error.issues.find(
          issue => issue.path[0] === 'operationMode'
        );
        expect(operationModeIssue).toBeDefined();
      }
    });

    it('should reject invalid clevResult structure', () => {
      const invalidInput = {
        clevResult: {
          verdicts: [], // Empty verdicts array (min 1 required)
          aggregatedScore: 0.5,
          finalRecommendation: 'ACCEPT',
          votingMethod: 'unanimous',
          consensusReached: true,
        },
        lessonContent: createMockLessonContentBody(),
        operationMode: 'full-auto' as const,
      };

      const result = ArbiterInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('ArbiterOutputSchema', () => {
    it('should accept valid output with all required fields', () => {
      const validOutput = {
        plan: createMockRefinementPlan(),
        agreementScore: 0.85,
        agreementLevel: 'high' as const,
        acceptedIssues: [createMockTargetedIssue()],
        rejectedIssues: [],
        tokensUsed: 500,
        durationMs: 2000,
      };

      const result = ArbiterOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agreementScore).toBe(0.85);
        expect(result.data.agreementLevel).toBe('high');
        expect(result.data.acceptedIssues).toHaveLength(1);
      }
    });

    it('should accept agreementScore boundary values: 0', () => {
      const validOutput = {
        plan: createMockRefinementPlan(),
        agreementScore: 0,
        agreementLevel: 'low' as const,
        acceptedIssues: [],
        rejectedIssues: [],
        tokensUsed: 0,
        durationMs: 0,
      };

      const result = ArbiterOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agreementScore).toBe(0);
      }
    });

    it('should accept agreementScore boundary values: 1', () => {
      const validOutput = {
        plan: createMockRefinementPlan(),
        agreementScore: 1,
        agreementLevel: 'high' as const,
        acceptedIssues: [],
        rejectedIssues: [],
        tokensUsed: 100,
        durationMs: 1000,
      };

      const result = ArbiterOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agreementScore).toBe(1);
      }
    });

    it('should reject agreementScore below 0', () => {
      const invalidOutput = {
        plan: createMockRefinementPlan(),
        agreementScore: -0.1,
        agreementLevel: 'low' as const,
        acceptedIssues: [],
        rejectedIssues: [],
        tokensUsed: 100,
        durationMs: 1000,
      };

      const result = ArbiterOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const scoreIssue = result.error.issues.find(
          issue => issue.path[0] === 'agreementScore'
        );
        expect(scoreIssue).toBeDefined();
      }
    });

    it('should reject agreementScore above 1', () => {
      const invalidOutput = {
        plan: createMockRefinementPlan(),
        agreementScore: 1.1,
        agreementLevel: 'high' as const,
        acceptedIssues: [],
        rejectedIssues: [],
        tokensUsed: 100,
        durationMs: 1000,
      };

      const result = ArbiterOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const scoreIssue = result.error.issues.find(
          issue => issue.path[0] === 'agreementScore'
        );
        expect(scoreIssue).toBeDefined();
      }
    });

    it('should reject invalid agreementLevel enum', () => {
      const invalidOutput = {
        plan: createMockRefinementPlan(),
        agreementScore: 0.5,
        agreementLevel: 'invalid' as any,
        acceptedIssues: [],
        rejectedIssues: [],
        tokensUsed: 100,
        durationMs: 1000,
      };

      const result = ArbiterOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    it('should accept all valid agreementLevel values', () => {
      const levels: Array<'high' | 'moderate' | 'low'> = ['high', 'moderate', 'low'];

      for (const level of levels) {
        const validOutput = {
          plan: createMockRefinementPlan(),
          agreementScore: 0.5,
          agreementLevel: level,
          acceptedIssues: [],
          rejectedIssues: [],
          tokensUsed: 100,
          durationMs: 1000,
        };

        const result = ArbiterOutputSchema.safeParse(validOutput);
        expect(result.success).toBe(true);
      }
    });

    it('should reject negative tokensUsed', () => {
      const invalidOutput = {
        plan: createMockRefinementPlan(),
        agreementScore: 0.5,
        agreementLevel: 'moderate' as const,
        acceptedIssues: [],
        rejectedIssues: [],
        tokensUsed: -10,
        durationMs: 1000,
      };

      const result = ArbiterOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    it('should reject negative durationMs', () => {
      const invalidOutput = {
        plan: createMockRefinementPlan(),
        agreementScore: 0.5,
        agreementLevel: 'moderate' as const,
        acceptedIssues: [],
        rejectedIssues: [],
        tokensUsed: 100,
        durationMs: -500,
      };

      const result = ArbiterOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    it('should accept empty acceptedIssues and rejectedIssues arrays', () => {
      const validOutput = {
        plan: createMockRefinementPlan(),
        agreementScore: 0.5,
        agreementLevel: 'moderate' as const,
        acceptedIssues: [],
        rejectedIssues: [],
        tokensUsed: 100,
        durationMs: 1000,
      };

      const result = ArbiterOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// T038: Patcher Schema Contract Tests
// ============================================================================

describe('T038 - Patcher Schema Contract Tests', () => {
  describe('PatcherInputSchema', () => {
    it('should accept valid PatcherInput with all required fields', () => {
      const validInput = {
        originalContent: 'This is the original section content.',
        sectionId: 'sec_intro',
        sectionTitle: 'Introduction',
        instructions: 'Simplify the language and break complex sentences.',
        contextAnchors: {
          prevSectionEnd: 'End of previous section.',
          nextSectionStart: 'Start of next section.',
        },
        contextWindow: {
          startQuote: 'This is the',
          endQuote: 'section content.',
          scope: 'paragraph' as const,
        },
      };

      const result = PatcherInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sectionId).toBe('sec_intro');
        expect(result.data.contextWindow.scope).toBe('paragraph');
      }
    });

    it('should accept all valid scope enum values', () => {
      const scopes: Array<'paragraph' | 'section' | 'global'> = [
        'paragraph',
        'section',
        'global',
      ];

      for (const scope of scopes) {
        const validInput = {
          originalContent: 'Content',
          sectionId: 'sec_1',
          sectionTitle: 'Title',
          instructions: 'Fix this',
          contextAnchors: {},
          contextWindow: {
            scope,
          },
        };

        const result = PatcherInputSchema.safeParse(validInput);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.contextWindow.scope).toBe(scope);
        }
      }
    });

    it('should reject missing contextWindow.scope', () => {
      const invalidInput = {
        originalContent: 'Content',
        sectionId: 'sec_1',
        sectionTitle: 'Title',
        instructions: 'Fix this',
        contextAnchors: {},
        contextWindow: {
          startQuote: 'Some text',
          endQuote: 'More text',
          // Missing scope
        },
      };

      const result = PatcherInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const scopeIssue = result.error.issues.find(
          issue =>
            issue.path.length === 2 &&
            issue.path[0] === 'contextWindow' &&
            issue.path[1] === 'scope'
        );
        expect(scopeIssue).toBeDefined();
      }
    });

    it('should reject invalid scope enum value', () => {
      const invalidInput = {
        originalContent: 'Content',
        sectionId: 'sec_1',
        sectionTitle: 'Title',
        instructions: 'Fix this',
        contextAnchors: {},
        contextWindow: {
          scope: 'invalid-scope' as any,
        },
      };

      const result = PatcherInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should accept optional contextAnchors fields', () => {
      const validInput = {
        originalContent: 'Content',
        sectionId: 'sec_1',
        sectionTitle: 'Title',
        instructions: 'Fix this',
        contextAnchors: {}, // Empty object (both fields optional)
        contextWindow: {
          scope: 'section' as const,
        },
      };

      const result = PatcherInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept optional contextWindow quotes', () => {
      const validInput = {
        originalContent: 'Content',
        sectionId: 'sec_1',
        sectionTitle: 'Title',
        instructions: 'Fix this',
        contextAnchors: {},
        contextWindow: {
          scope: 'global' as const,
          // startQuote and endQuote are optional
        },
      };

      const result = PatcherInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing required originalContent field', () => {
      const invalidInput = {
        sectionId: 'sec_1',
        sectionTitle: 'Title',
        instructions: 'Fix this',
        contextAnchors: {},
        contextWindow: { scope: 'section' as const },
      };

      const result = PatcherInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const contentIssue = result.error.issues.find(
          issue => issue.path[0] === 'originalContent'
        );
        expect(contentIssue).toBeDefined();
      }
    });

    it('should reject missing required sectionId field', () => {
      const invalidInput = {
        originalContent: 'Content',
        sectionTitle: 'Title',
        instructions: 'Fix this',
        contextAnchors: {},
        contextWindow: { scope: 'section' as const },
      };

      const result = PatcherInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject missing required instructions field', () => {
      const invalidInput = {
        originalContent: 'Content',
        sectionId: 'sec_1',
        sectionTitle: 'Title',
        contextAnchors: {},
        contextWindow: { scope: 'section' as const },
      };

      const result = PatcherInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('PatcherOutputSchema', () => {
    it('should accept valid PatcherOutput with success=true', () => {
      const validOutput = {
        patchedContent: 'This is the patched content.',
        success: true,
        diffSummary: 'Simplified 2 sentences, fixed 1 typo',
        tokensUsed: 800,
        durationMs: 1500,
      };

      const result = PatcherOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.errorMessage).toBeUndefined();
      }
    });

    it('should accept valid PatcherOutput with success=false and errorMessage', () => {
      const validOutput = {
        patchedContent: '',
        success: false,
        diffSummary: 'Patch failed',
        tokensUsed: 400,
        durationMs: 1000,
        errorMessage: 'Failed to apply patch: context window not found',
      };

      const result = PatcherOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(false);
        expect(result.data.errorMessage).toBe(
          'Failed to apply patch: context window not found'
        );
      }
    });

    it('should accept boolean values for success field', () => {
      const trueOutput = {
        patchedContent: 'Content',
        success: true,
        diffSummary: 'Fixed',
        tokensUsed: 100,
        durationMs: 500,
      };

      const falseOutput = {
        patchedContent: '',
        success: false,
        diffSummary: 'Failed',
        tokensUsed: 50,
        durationMs: 300,
      };

      expect(PatcherOutputSchema.safeParse(trueOutput).success).toBe(true);
      expect(PatcherOutputSchema.safeParse(falseOutput).success).toBe(true);
    });

    it('should reject string value for success field', () => {
      const invalidOutput = {
        patchedContent: 'Content',
        success: 'true' as any, // String instead of boolean
        diffSummary: 'Fixed',
        tokensUsed: 100,
        durationMs: 500,
      };

      const result = PatcherOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    it('should reject negative tokensUsed', () => {
      const invalidOutput = {
        patchedContent: 'Content',
        success: true,
        diffSummary: 'Fixed',
        tokensUsed: -100,
        durationMs: 500,
      };

      const result = PatcherOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    it('should reject negative durationMs', () => {
      const invalidOutput = {
        patchedContent: 'Content',
        success: true,
        diffSummary: 'Fixed',
        tokensUsed: 100,
        durationMs: -500,
      };

      const result = PatcherOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    it('should accept optional errorMessage field', () => {
      const withError = {
        patchedContent: '',
        success: false,
        diffSummary: 'Failed',
        tokensUsed: 50,
        durationMs: 300,
        errorMessage: 'Some error occurred',
      };

      const withoutError = {
        patchedContent: 'Content',
        success: true,
        diffSummary: 'Fixed',
        tokensUsed: 100,
        durationMs: 500,
      };

      expect(PatcherOutputSchema.safeParse(withError).success).toBe(true);
      expect(PatcherOutputSchema.safeParse(withoutError).success).toBe(true);
    });
  });
});

// ============================================================================
// T039: Streaming Events Contract Tests
// ============================================================================

describe('T039 - Streaming Events Contract Tests', () => {
  describe('RefinementStreamEventSchema - Discriminated Union', () => {
    it('should accept refinement_start event type', () => {
      const validEvent = {
        type: 'refinement_start' as const,
        targetSections: ['sec_intro', 'sec_main'],
        mode: 'full-auto' as const,
        totalTasks: 3,
        estimatedTokens: 2000,
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('refinement_start');
        expect(result.data.targetSections).toHaveLength(2);
      }
    });

    it('should accept arbiter_complete event type', () => {
      const validEvent = {
        type: 'arbiter_complete' as const,
        agreementScore: 0.85,
        agreementLevel: 'high' as const,
        acceptedIssueCount: 5,
        rejectedIssueCount: 2,
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('arbiter_complete');
        expect(result.data.agreementScore).toBe(0.85);
      }
    });

    it('should accept batch_started event type', () => {
      const validEvent = {
        type: 'batch_started' as const,
        batchIndex: 0,
        sections: ['sec_intro'],
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('batch_started');
        expect(result.data.batchIndex).toBe(0);
      }
    });

    it('should accept task_started event type', () => {
      const validEvent = {
        type: 'task_started' as const,
        sectionId: 'sec_intro',
        taskType: 'SURGICAL_EDIT' as const,
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('task_started');
        expect(result.data.taskType).toBe('SURGICAL_EDIT');
      }
    });

    it('should accept patch_applied event type', () => {
      const validEvent = {
        type: 'patch_applied' as const,
        sectionId: 'sec_intro',
        success: true,
        diffSummary: 'Simplified 2 sentences',
        tokensUsed: 800,
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('patch_applied');
        expect(result.data.success).toBe(true);
      }
    });

    it('should accept verification_result event type', () => {
      const validEvent = {
        type: 'verification_result' as const,
        sectionId: 'sec_intro',
        passed: true,
        newIssueCount: 0,
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('verification_result');
        expect(result.data.passed).toBe(true);
      }
    });

    it('should accept section_locked event type', () => {
      const validEvent = {
        type: 'section_locked' as const,
        sectionId: 'sec_intro',
        reason: 'max_edits' as const,
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('section_locked');
        expect(result.data.reason).toBe('max_edits');
      }
    });

    it('should accept batch_complete event type', () => {
      const validEvent = {
        type: 'batch_complete' as const,
        batchIndex: 0,
        successCount: 2,
        failedCount: 1,
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('batch_complete');
        expect(result.data.successCount).toBe(2);
      }
    });

    it('should accept iteration_complete event type', () => {
      const validEvent = {
        type: 'iteration_complete' as const,
        iteration: 1,
        score: 0.88,
        improvement: 0.06,
        sectionsLocked: ['sec_intro'],
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('iteration_complete');
        expect(result.data.iteration).toBe(1);
      }
    });

    it('should accept refinement_complete event type', () => {
      const validEvent = {
        type: 'refinement_complete' as const,
        finalScore: 0.92,
        status: 'accepted' as const,
        totalIterations: 2,
        totalTokensUsed: 5000,
        totalDurationMs: 15000,
      };

      const result = RefinementStreamEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('refinement_complete');
        expect(result.data.finalScore).toBe(0.92);
        expect(result.data.status).toBe('accepted');
      }
    });

    it('should reject invalid event type discriminator', () => {
      const invalidEvent = {
        type: 'invalid_event_type' as any,
        someField: 'value',
      };

      const result = RefinementStreamEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Discriminated union validation error should mention 'type'
        expect(result.error.issues[0].message).toMatch(/type|discriminator/i);
      }
    });

    it('should reject event with missing required fields for its type', () => {
      const invalidEvent = {
        type: 'refinement_start' as const,
        targetSections: ['sec_intro'],
        // Missing: mode, totalTasks, estimatedTokens
      };

      const result = RefinementStreamEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should accept event even with extra fields (Zod behavior)', () => {
      // Note: Zod by default allows additional fields unless using .strict()
      const eventWithExtraFields = {
        type: 'batch_started' as const,
        batchIndex: 0,
        sections: ['sec_intro'],
        finalScore: 0.92, // Extra field - Zod allows this by default
      };

      const result = RefinementStreamEventSchema.safeParse(eventWithExtraFields);
      // Zod's discriminatedUnion allows extra fields by default
      expect(result.success).toBe(true);
    });

    it('should accept all valid section_locked reason enum values', () => {
      const reasons: Array<'max_edits' | 'regression' | 'oscillation'> = [
        'max_edits',
        'regression',
        'oscillation',
      ];

      for (const reason of reasons) {
        const validEvent = {
          type: 'section_locked' as const,
          sectionId: 'sec_intro',
          reason,
        };

        const result = RefinementStreamEventSchema.safeParse(validEvent);
        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid refinement status enum values', () => {
      const statuses: Array<'accepted' | 'accepted_warning' | 'best_effort' | 'escalated'> = [
        'accepted',
        'accepted_warning',
        'best_effort',
        'escalated',
      ];

      for (const status of statuses) {
        const validEvent = {
          type: 'refinement_complete' as const,
          finalScore: 0.85,
          status,
          totalIterations: 2,
          totalTokensUsed: 5000,
          totalDurationMs: 15000,
        };

        const result = RefinementStreamEventSchema.safeParse(validEvent);
        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid task type enum values in task_started', () => {
      const taskTypes: Array<'SURGICAL_EDIT' | 'REGENERATE_SECTION'> = [
        'SURGICAL_EDIT',
        'REGENERATE_SECTION',
      ];

      for (const taskType of taskTypes) {
        const validEvent = {
          type: 'task_started' as const,
          sectionId: 'sec_intro',
          taskType,
        };

        const result = RefinementStreamEventSchema.safeParse(validEvent);
        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid agreement level enum values', () => {
      const levels: Array<'high' | 'moderate' | 'low'> = ['high', 'moderate', 'low'];

      for (const agreementLevel of levels) {
        const validEvent = {
          type: 'arbiter_complete' as const,
          agreementScore: 0.75,
          agreementLevel,
          acceptedIssueCount: 3,
          rejectedIssueCount: 1,
        };

        const result = RefinementStreamEventSchema.safeParse(validEvent);
        expect(result.success).toBe(true);
      }
    });

    it('should validate integer constraints on event fields', () => {
      // Valid: integer values
      const validEvent = {
        type: 'refinement_complete' as const,
        finalScore: 0.92,
        status: 'accepted' as const,
        totalIterations: 2,
        totalTokensUsed: 5000,
        totalDurationMs: 15000,
      };

      expect(RefinementStreamEventSchema.safeParse(validEvent).success).toBe(true);

      // Invalid: float values for integer fields
      const invalidEvent = {
        type: 'refinement_complete' as const,
        finalScore: 0.92,
        status: 'accepted' as const,
        totalIterations: 2.5, // Should be integer
        totalTokensUsed: 5000,
        totalDurationMs: 15000,
      };

      expect(RefinementStreamEventSchema.safeParse(invalidEvent).success).toBe(false);
    });
  });
});
