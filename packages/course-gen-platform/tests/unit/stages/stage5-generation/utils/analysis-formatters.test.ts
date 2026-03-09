/**
 * Tests for stage5-generation/utils/analysis-formatters.ts
 *
 * Pure formatting functions — no external deps.
 */

import { describe, it, expect } from 'vitest';
import {
    formatCourseCategoryForPrompt,
    formatContextualLanguageForPrompt,
    formatPedagogicalStrategyForPrompt,
    formatGenerationGuidanceForPrompt,
    getDifficultyFromAnalysis,
    getCategoryFromAnalysis,
} from '@/stages/stage5-generation/utils/analysis-formatters';


// ─────────────────────────────────────────────────────────────────────────────
// formatCourseCategoryForPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('formatCourseCategoryForPrompt', () => {
    it('formats primary category with confidence', () => {
        const category = { primary: 'professional', confidence: 0.95, reasoning: 'Business course', secondary: null };
        const result = formatCourseCategoryForPrompt(category as any);
        expect(result).toContain('Professional');
        expect(result).toContain('95% confidence');
        expect(result).toContain('Reasoning: Business course');
    });

    it('includes secondary category when present', () => {
        const category = {
            primary: 'professional',
            confidence: 0.8,
            reasoning: 'Mixed focus',
            secondary: 'personal',
        };
        const result = formatCourseCategoryForPrompt(category as any);
        expect(result).toContain('Secondary category: Personal');
    });

    it('omits secondary category line when null', () => {
        const category = { primary: 'personal', confidence: 0.7, reasoning: 'Self-growth', secondary: null };
        const result = formatCourseCategoryForPrompt(category as any);
        expect(result).not.toContain('Secondary category');
    });

    it('capitalizes primary and secondary', () => {
        const category = { primary: 'academic', confidence: 0.6, reasoning: 'r', secondary: 'hobby' };
        const result = formatCourseCategoryForPrompt(category as any);
        expect(result).toContain('Academic');
        expect(result).toContain('Hobby');
    });

    it('rounds confidence to nearest percent', () => {
        const category = { primary: 'creative', confidence: 0.856, reasoning: 'r', secondary: null };
        const result = formatCourseCategoryForPrompt(category as any);
        expect(result).toContain('86% confidence');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatContextualLanguageForPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('formatContextualLanguageForPrompt', () => {
    const contextual = {
        why_matters_context: 'Why this matters deeply',
        motivators: 'Strong motivation drivers',
        experience_prompt: 'Share your experience here',
        problem_statement_context: 'The core problem we solve',
        knowledge_bridge: 'Bridging existing knowledge',
        practical_benefit_focus: 'Practical skills gained',
    };

    it('returns empty string when contextual is undefined', () => {
        expect(formatContextualLanguageForPrompt(undefined)).toBe('');
        expect(formatContextualLanguageForPrompt(null)).toBe('');
    });

    it('returns full format by default', () => {
        const result = formatContextualLanguageForPrompt(contextual as any);
        expect(result).toContain('Why This Matters');
        expect(result).toContain('Motivators');
        expect(result).toContain('Experience Prompt');
        expect(result).toContain('Knowledge Bridge');
    });

    it('returns summary format (single paragraph)', () => {
        const result = formatContextualLanguageForPrompt(contextual as any, 'summary');
        expect(result).toContain('Why this matters deeply');
        expect(result).toContain('Strong motivation drivers');
        // No headers
        expect(result).not.toContain('Why This Matters:');
    });

    it('returns specific fields format', () => {
        const result = formatContextualLanguageForPrompt(
            contextual as any,
            'specific',
            ['why_matters_context', 'motivators']
        );
        expect(result).toContain('Why Matters Context');
        expect(result).toContain('Why this matters deeply');
        expect(result).toContain('Motivators');
        expect(result).not.toContain('Experience Prompt');
    });

    it('falls back to full format when specificFields is empty', () => {
        const result = formatContextualLanguageForPrompt(contextual as any, 'specific', []);
        expect(result).toContain('Why This Matters');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatPedagogicalStrategyForPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('formatPedagogicalStrategyForPrompt', () => {
    it('formats assessment_approach and progression_logic', () => {
        const strategy = {
            assessment_approach: 'Project-based learning',
            progression_logic: 'From simple to complex',
        };
        const result = formatPedagogicalStrategyForPrompt(strategy as any);
        expect(result).toContain('Assessment Approach: Project-based learning');
        expect(result).toContain('Progression Logic: From simple to complex');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatGenerationGuidanceForPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('formatGenerationGuidanceForPrompt', () => {
    const guidance = {
        tone: 'conversational but precise',
        use_analogies: true,
        specific_analogies: ['cooking as data processing', 'bridges as API endpoints'],
        avoid_jargon: ['OOP', 'SOLID'],
        include_visuals: ['diagrams', 'code examples'],
        exercise_types: ['quizzes', 'projects'],
        contextual_language_hints: 'Use practical examples',
        real_world_examples: ['Netflix recommendation engine', 'Google search ranking'],
    };

    it('formats tone and use_analogies', () => {
        const result = formatGenerationGuidanceForPrompt(guidance as any);
        expect(result).toContain('Tone: conversational but precise');
        expect(result).toContain('Use Analogies: Yes');
    });

    it('lists specific_analogies', () => {
        const result = formatGenerationGuidanceForPrompt(guidance as any);
        expect(result).toContain('cooking as data processing');
        expect(result).toContain('bridges as API endpoints');
    });

    it('shows "None provided" when specific_analogies is empty', () => {
        const g = { ...guidance, specific_analogies: [] };
        const result = formatGenerationGuidanceForPrompt(g as any);
        expect(result).toContain('Specific Analogies: None provided');
    });

    it('lists real_world_examples', () => {
        const result = formatGenerationGuidanceForPrompt(guidance as any);
        expect(result).toContain('Netflix recommendation engine');
        expect(result).toContain('Google search ranking');
    });

    it('shows "None provided" when real_world_examples is empty', () => {
        const g = { ...guidance, real_world_examples: [] };
        const result = formatGenerationGuidanceForPrompt(g as any);
        expect(result).toContain('Real World Examples: None provided');
    });

    it('includes avoid_jargon as comma list', () => {
        const result = formatGenerationGuidanceForPrompt(guidance as any);
        expect(result).toContain('Avoid Jargon: OOP, SOLID');
    });

    it('uses "No" for use_analogies=false', () => {
        const g = { ...guidance, use_analogies: false };
        const result = formatGenerationGuidanceForPrompt(g as any);
        expect(result).toContain('Use Analogies: No');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDifficultyFromAnalysis
// ─────────────────────────────────────────────────────────────────────────────

describe('getDifficultyFromAnalysis', () => {
    it('returns beginner for null analysis', () => {
        expect(getDifficultyFromAnalysis(null)).toBe('beginner');
    });

    it('returns beginner for analysis without topic_analysis', () => {
        expect(getDifficultyFromAnalysis({} as any)).toBe('beginner');
    });

    it('returns beginner for mixed audience', () => {
        const analysis = { topic_analysis: { target_audience: 'mixed' } };
        expect(getDifficultyFromAnalysis(analysis as any)).toBe('beginner');
    });

    it('returns beginner for beginner audience', () => {
        const analysis = { topic_analysis: { target_audience: 'beginner' } };
        expect(getDifficultyFromAnalysis(analysis as any)).toBe('beginner');
    });

    it('returns intermediate for intermediate audience', () => {
        const analysis = { topic_analysis: { target_audience: 'intermediate' } };
        expect(getDifficultyFromAnalysis(analysis as any)).toBe('intermediate');
    });

    it('returns advanced for advanced audience', () => {
        const analysis = { topic_analysis: { target_audience: 'advanced' } };
        expect(getDifficultyFromAnalysis(analysis as any)).toBe('advanced');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCategoryFromAnalysis
// ─────────────────────────────────────────────────────────────────────────────

describe('getCategoryFromAnalysis', () => {
    it('returns primary category string', () => {
        const analysis = { course_category: { primary: 'professional' } };
        expect(getCategoryFromAnalysis(analysis as any)).toBe('professional');
    });

    it('returns personal category', () => {
        const analysis = { course_category: { primary: 'personal' } };
        expect(getCategoryFromAnalysis(analysis as any)).toBe('personal');
    });
});
