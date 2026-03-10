/**
 * Tests for stage5-generation/validators/placeholder-validator.ts
 *
 * Pure function tests:
 * - hasPlaceholders: legacy detection function
 * - validatePlaceholders: severity-based validation result
 * - scanForPlaceholders: recursive object scanning
 */

import { describe, it, expect } from 'vitest';
import {
    hasPlaceholders,
    validatePlaceholders,
    scanForPlaceholders,
} from '@/stages/stage5-generation/validators/placeholder-validator';
import { ValidationSeverity } from '@megacampus/shared-types';

// ─────────────────────────────────────────────────────────────────────────────
// hasPlaceholders
// ─────────────────────────────────────────────────────────────────────────────

describe('hasPlaceholders', () => {
    it('returns false for clean text', () => {
        expect(hasPlaceholders('Machine learning is a subfield of AI.')).toBe(false);
    });

    it('returns true for TODO marker (uppercase)', () => {
        expect(hasPlaceholders('Add more content here. TODO')).toBe(true);
    });

    it('returns false for lowercase todo (not a marker)', () => {
        expect(hasPlaceholders('Create a todo list for tracking tasks.')).toBe(false);
    });

    it('returns true for FIXME marker', () => {
        expect(hasPlaceholders('FIXME: improve this section')).toBe(true);
    });

    it('returns true for [insert ...] placeholder', () => {
        expect(hasPlaceholders('Add [insert specific example here] to explain.')).toBe(true);
    });

    it('returns true for Russian [название ...] placeholder', () => {
        expect(hasPlaceholders('[название модуля] — введите здесь')).toBe(true);
    });

    it('returns true for template variable {{variable}}', () => {
        expect(hasPlaceholders('Hello {{username}}, welcome!')).toBe(true);
    });

    it('returns true for ${variable} template', () => {
        expect(hasPlaceholders('Value is ${config.value}')).toBe(true);
    });

    it('returns true for empty string (whitespace-only)', () => {
        expect(hasPlaceholders('')).toBe(true);
        expect(hasPlaceholders('   ')).toBe(true);
    });

    it('returns false for Helm template syntax (whitelisted)', () => {
        // Helm: {{ .Values.image.tag }} is legitimate template content
        expect(hasPlaceholders('image: {{ .Values.image.tag }}')).toBe(false);
    });

    it('returns false for Go template field access (whitelisted)', () => {
        // Go: {{ .metadata.name }} is legitimate template content
        expect(hasPlaceholders('Name: {{ .metadata.name }}')).toBe(false);
    });

    it('returns true for ... at line start (isolated ellipsis)', () => {
        // Pattern: /^\.{3}$/ matches standalone "..."
        expect(hasPlaceholders('...')).toBe(true);
    });

    it('returns true for "example title" placeholder pattern', () => {
        expect(hasPlaceholders('example title for this section')).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// validatePlaceholders
// ─────────────────────────────────────────────────────────────────────────────

describe('validatePlaceholders', () => {
    it('returns passed=true and INFO for clean text', () => {
        const result = validatePlaceholders('Clean lesson content with no placeholders.');
        expect(result.passed).toBe(true);
        expect(result.severity).toBe(ValidationSeverity.INFO);
        expect(result.score).toBe(1.0);
    });

    it('returns passed=false and ERROR for TODO marker', () => {
        const result = validatePlaceholders('TODO: complete this section');
        expect(result.passed).toBe(false);
        expect(result.severity).toBe(ValidationSeverity.ERROR);
        expect(result.score).toBe(0.0);
    });

    it('returns ERROR for FIXME marker', () => {
        const result = validatePlaceholders('Introduction FIXME add content');
        expect(result.passed).toBe(false);
        expect(result.severity).toBe(ValidationSeverity.ERROR);
    });

    it('returns ERROR for [insert ...] placeholder', () => {
        const result = validatePlaceholders('[insert content here]');
        expect(result.passed).toBe(false);
        expect(result.severity).toBe(ValidationSeverity.ERROR);
    });

    it('returns WARNING for {{variable}} template variable', () => {
        const result = validatePlaceholders('Value: {{someVar}}');
        expect(result.passed).toBe(false);
        expect(result.severity).toBe(ValidationSeverity.WARNING);
        expect(result.score).toBe(0.8);
    });

    it('includes suggestion in error result', () => {
        const result = validatePlaceholders('TODO: fix this');
        expect(result.suggestion).toContain('Remove TODO/FIXME');
    });

    it('includes INFO message in passed result', () => {
        const result = validatePlaceholders('Clean content here.');
        expect(result.info).toBeDefined();
        expect(result.info![0]).toContain('No placeholders');
    });

    it('skips {{}} detection for whitelisted Helm templates', () => {
        // {{ .Values.replicas }} is whitelisted — should not trigger template placeholder
        const result = validatePlaceholders('replicas: {{ .Values.replicas }}');
        expect(result.passed).toBe(true);
    });

    it('includes metadata in result', () => {
        const result = validatePlaceholders('TODO: remove');
        expect(result.metadata).toBeDefined();
        expect(result.metadata).toHaveProperty('rule', 'placeholder_detection');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// scanForPlaceholders
// ─────────────────────────────────────────────────────────────────────────────

describe('scanForPlaceholders', () => {
    it('returns empty array for clean object', () => {
        const obj = { title: 'ML Course', description: 'A comprehensive course', count: 3 };
        expect(scanForPlaceholders(obj)).toHaveLength(0);
    });

    it('detects placeholder in top-level string field', () => {
        const obj = { title: 'TODO: set title', description: 'Clean description' };
        const issues = scanForPlaceholders(obj);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]).toContain('title');
    });

    it('detects placeholder in nested object field', () => {
        const obj = {
            course: {
                metadata: {
                    title: '[insert title here]',
                },
            },
        };
        const issues = scanForPlaceholders(obj);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]).toContain('course.metadata.title');
    });

    it('detects placeholder in array element', () => {
        const obj = {
            objectives: ['Learn TODO topic', 'Clean objective here'],
        };
        const issues = scanForPlaceholders(obj);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]).toContain('[0]');
    });

    it('returns empty array for primitive non-string values', () => {
        expect(scanForPlaceholders(42)).toHaveLength(0);
        expect(scanForPlaceholders(null)).toHaveLength(0);
        expect(scanForPlaceholders(undefined)).toHaveLength(0);
        expect(scanForPlaceholders(true)).toHaveLength(0);
    });

    it('returns path issues with correct dot notation', () => {
        const obj = {
            section: {
                lesson: {
                    title: 'FIXME incomplete title',
                },
            },
        };
        const issues = scanForPlaceholders(obj);
        expect(issues[0]).toContain('section.lesson.title');
    });

    it('detects multiple placeholders in object', () => {
        const obj = {
            title: 'TODO: set title',
            description: 'FIXME: set description',
            clean: 'This is fine',
        };
        const issues = scanForPlaceholders(obj);
        expect(issues.length).toBe(2);
    });

    it('uses custom starting path', () => {
        const issues = scanForPlaceholders({ t: 'TODO: fix' }, 'root');
        expect(issues[0]).toContain('root.t');
    });
});
