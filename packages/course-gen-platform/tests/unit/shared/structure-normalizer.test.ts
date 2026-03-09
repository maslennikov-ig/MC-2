/**
 * Tests for structure-normalizer.ts
 *
 * Covers normalizePhase1Output and quickValidatePhase1Structure.
 * These functions transform variable LLM outputs into expected schema shapes.
 */

import { describe, it, expect } from 'vitest';
import {
    normalizePhase1Output,
    quickValidatePhase1Structure,
} from '@/shared/utils/structure-normalizer';

// ─────────────────────────────────────────────────────────────────────────────
// normalizePhase1Output
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizePhase1Output', () => {
    it('throws for non-object input', () => {
        expect(() => normalizePhase1Output('string')).toThrow('Cannot normalize non-object data');
        expect(() => normalizePhase1Output(null)).toThrow();
        expect(() => normalizePhase1Output([1, 2, 3])).toThrow();
    });

    it('converts string category to object structure', () => {
        const raw = { category: 'professional' };
        const result = normalizePhase1Output(raw) as any;
        expect(result.course_category).toBeDefined();
        expect(result.course_category.primary).toBe('professional');
        expect(typeof result.course_category.confidence).toBe('number');
        expect(typeof result.course_category.reasoning).toBe('string');
    });

    it('normalizes category field variant → course_category', () => {
        const raw = { category: 'professional', topic: 'Machine Learning' };
        const result = normalizePhase1Output(raw) as any;
        expect(result.course_category.primary).toBe('professional');
        expect(result.topic_analysis.determined_topic).toBe('Machine Learning');
    });

    it('uses professional as default for invalid category', () => {
        const raw = { category: 'invalid_cat' };
        const result = normalizePhase1Output(raw) as any;
        expect(result.course_category.primary).toBe('professional');
    });

    it('handles pre-existing course_category object structure', () => {
        const raw = {
            course_category: {
                primary: 'personal',
                confidence: 0.9,
                reasoning: 'User expressed personal growth goals',
                secondary: null,
            },
        };
        const result = normalizePhase1Output(raw) as any;
        expect(result.course_category.primary).toBe('personal');
        expect(result.course_category.confidence).toBe(0.9);
    });

    it('adds defaults to partial course_category object', () => {
        const raw = { course_category: { primary: 'academic' } };
        const result = normalizePhase1Output(raw) as any;
        expect(result.course_category.confidence).toBe(0.8); // default
        expect(result.course_category.secondary).toBeNull();
    });

    it('creates default course_category when missing', () => {
        const raw = { topic: 'Some topic' };
        const result = normalizePhase1Output(raw) as any;
        expect(result.course_category).toBeDefined();
        expect(result.course_category.primary).toBe('professional'); // default
        expect(result.course_category.confidence).toBe(0.5); // reduced confidence for default
    });

    it('creates topic_analysis from context topic when topic_analysis missing', () => {
        const raw = { category: 'professional' };
        const result = normalizePhase1Output(raw, { topic: 'Python Programming' }) as any;
        expect(result.topic_analysis.determined_topic).toBe('Python Programming');
    });

    it('normalizes topic_analysis complexity to valid value', () => {
        const raw = {
            topic_analysis: {
                complexity: 'INVALID',
                determined_topic: 'Math',
                information_completeness: 80,
                reasoning: 'A valid reasoning text that is long enough to be valid',
                key_concepts: ['a', 'b', 'c'],
                domain_keywords: ['a', 'b', 'c', 'd', 'e'],
            },
        };
        const result = normalizePhase1Output(raw) as any;
        expect(result.topic_analysis.complexity).toBe('medium'); // default
    });

    it('normalizes target_audience to valid value', () => {
        const raw = {
            topic_analysis: {
                target_audience: 'expert', // not valid
                determined_topic: 'Topic',
                information_completeness: 80,
                complexity: 'medium',
                reasoning: 'Long enough reasoning text for validation purposes',
                key_concepts: ['a', 'b', 'c'],
                domain_keywords: ['a', 'b', 'c', 'd', 'e'],
            },
        };
        const result = normalizePhase1Output(raw) as any;
        expect(result.topic_analysis.target_audience).toBe('mixed'); // default
    });

    it('unwraps nested data wrapper', () => {
        const raw = {
            data: {
                course_category: { primary: 'professional', confidence: 0.8, reasoning: 'test', secondary: null },
                topic: 'Wrapped Data Topic',
            },
        };
        const result = normalizePhase1Output(raw) as any;
        expect(result.course_category.primary).toBe('professional');
    });

    it('handles why_matters field variant → why_matters_context', () => {
        const raw = {
            why_matters: 'This matters a lot for your career growth',
            category: 'professional',
        };
        const result = normalizePhase1Output(raw) as any;
        // Field should be renamed
        expect(result.why_matters).toBeUndefined();
    });

    it('removes invalid contextual_language that is not an object', () => {
        const raw = {
            category: 'professional',
            contextual_language: 'invalid string instead of object',
        };
        const result = normalizePhase1Output(raw) as any;
        expect(result.contextual_language).toBeUndefined();
    });

    it('preserves valid contextual_language with all required fields', () => {
        const validLang = {
            why_matters_context: 'This matters a lot for your career growth and development',
            motivators: 'Strong motivational factors driving you forward to success',
            experience_prompt: 'Share your experience with this topic in full detail please',
            problem_statement_context: 'The main problem we are addressing here is complex',
            knowledge_bridge: 'Building on what you already know to enhance understanding',
            practical_benefit_focus: 'Practical skills you will gain from this comprehensive course',
        };
        const raw = {
            category: 'professional',
            contextual_language: validLang,
        };
        const result = normalizePhase1Output(raw) as any;
        expect(result.contextual_language).toBeDefined();
        expect(result.contextual_language.why_matters_context).toBe(validLang.why_matters_context);
    });

    it('fills incomplete contextual_language fields with defaults', () => {
        const raw = {
            category: 'professional',
            contextual_language: {
                why_matters_context: 'short', // too short
                motivators: 'ok',
            },
        };
        const result = normalizePhase1Output(raw) as any;
        expect(result.contextual_language).toBeDefined();
        // Should fill missing fields with defaults
        expect(typeof result.contextual_language.experience_prompt).toBe('string');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// quickValidatePhase1Structure
// ─────────────────────────────────────────────────────────────────────────────

describe('quickValidatePhase1Structure', () => {
    it('returns no errors for valid structure', () => {
        const normalized = normalizePhase1Output({
            category: 'professional',
            topic: 'ML Basics',
        });
        const errors = quickValidatePhase1Structure(normalized);
        expect(errors).toHaveLength(0);
    });

    it('returns error when course_category is missing', () => {
        const data = { topic_analysis: { complexity: 'medium', determined_topic: 'Topic' } };
        const errors = quickValidatePhase1Structure(data);
        expect(errors.some((e) => e.includes('course_category'))).toBe(true);
    });

    it('returns error when topic_analysis is missing', () => {
        const data = {
            course_category: { primary: 'professional', confidence: 0.8 },
        };
        const errors = quickValidatePhase1Structure(data);
        expect(errors.some((e) => e.includes('topic_analysis'))).toBe(true);
    });

    it('returns error when course_category.primary is missing', () => {
        const data = {
            course_category: { confidence: 0.8 }, // missing primary
            topic_analysis: { complexity: 'medium', determined_topic: 'Topic' },
        };
        const errors = quickValidatePhase1Structure(data);
        expect(errors.some((e) => e.includes('primary'))).toBe(true);
    });

    it('returns error when course_category.confidence is not a number', () => {
        const data = {
            course_category: { primary: 'professional', confidence: 'high' }, // wrong type
            topic_analysis: { complexity: 'medium', determined_topic: 'Topic' },
        };
        const errors = quickValidatePhase1Structure(data);
        expect(errors.some((e) => e.includes('confidence'))).toBe(true);
    });

    it('returns multiple errors for multiple missing fields', () => {
        const errors = quickValidatePhase1Structure({});
        expect(errors.length).toBeGreaterThan(1);
    });
});
