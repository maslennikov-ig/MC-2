/**
 * Unit Tests for Prompt Template Validation
 *
 * Tests validateGeneratedContent() and validateExpanderContent() — pure functions
 * that detect prompt template markers in LLM-generated content (hallucination detection).
 *
 * @module tests/unit/stage6/prompt-template-validation.test
 */

import { describe, it, expect } from 'vitest';
import {
  validateGeneratedContent,
  validateExpanderContent,
  SECTION_EXPANDER_MARKERS,
  ALL_PROMPT_MARKERS,
} from '@/stages/stage6-lesson-content/nodes/generator/generator-content';

// ============================================================================
// validateGeneratedContent — patcher markers
// ============================================================================

describe('validateGeneratedContent', () => {
  it('should pass valid lesson content', () => {
    const content = `## Introduction\n\nThis lesson covers the basics of TypeScript generics.\n\n## Key Concepts\n\nGenerics allow you to write reusable components.`;
    const result = validateGeneratedContent(content);
    expect(result.isValid).toBe(true);
    expect(result.detectedMarkers).toHaveLength(0);
  });

  it('should detect ## SECTION TITLE marker', () => {
    const content = `## SECTION TITLE\nSome content here\n## ORIGINAL CONTENT`;
    const result = validateGeneratedContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers).toContain('## SECTION TITLE');
  });

  it('should detect ## ORIGINAL CONTENT marker', () => {
    const content = `Here is the fix:\n## ORIGINAL CONTENT\nThe section text`;
    const result = validateGeneratedContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers).toContain('## ORIGINAL CONTENT');
  });

  it('should detect ## FIX INSTRUCTIONS marker', () => {
    const content = `## FIX INSTRUCTIONS\nPlease fix the following issues`;
    const result = validateGeneratedContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers).toContain('## FIX INSTRUCTIONS');
  });

  it('should detect COMPLETE CORRECTED SECTION: marker', () => {
    const content = `COMPLETE CORRECTED SECTION:\nHere is the corrected text`;
    const result = validateGeneratedContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers).toContain('COMPLETE CORRECTED SECTION:');
  });

  it('should detect markers case-insensitively', () => {
    const content = `## section title\nsome content\n## fix instructions`;
    const result = validateGeneratedContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers.length).toBeGreaterThanOrEqual(2);
  });

  it('should detect multiple markers at once', () => {
    const content = `## SECTION TITLE\n## ORIGINAL CONTENT\n## FIX INSTRUCTIONS\n## OUTPUT REQUIREMENTS`;
    const result = validateGeneratedContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers.length).toBe(4);
  });

  it('should not flag expander-specific markers', () => {
    // validateGeneratedContent only checks PROMPT_TEMPLATE_MARKERS (patcher)
    const content = `## SECTION INFORMATION\nSome section info\n## ISSUES TO ADDRESS`;
    const result = validateGeneratedContent(content);
    expect(result.isValid).toBe(true);
  });

  it('should handle empty content', () => {
    const result = validateGeneratedContent('');
    expect(result.isValid).toBe(true);
    expect(result.detectedMarkers).toHaveLength(0);
  });
});

// ============================================================================
// validateExpanderContent — section-expander markers
// ============================================================================

describe('validateExpanderContent', () => {
  it('should pass valid expanded content', () => {
    const content = `Genetic algorithms use evolutionary principles to solve optimization problems.\n\nThe key steps include selection, crossover, and mutation.`;
    const result = validateExpanderContent(content);
    expect(result.isValid).toBe(true);
    expect(result.detectedMarkers).toHaveLength(0);
  });

  it('should detect ## SECTION INFORMATION marker', () => {
    const content = `## SECTION INFORMATION\nSection about algorithms`;
    const result = validateExpanderContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers).toContain('## SECTION INFORMATION');
  });

  it('should detect ## ISSUES TO ADDRESS marker', () => {
    const content = `## ISSUES TO ADDRESS\n1. Content too short\n2. Missing examples`;
    const result = validateExpanderContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers).toContain('## ISSUES TO ADDRESS');
  });

  it('should detect REGENERATED SECTION: marker', () => {
    const content = `REGENERATED SECTION:\nHere is the new content`;
    const result = validateExpanderContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers).toContain('REGENERATED SECTION:');
  });

  it('should detect markers case-insensitively', () => {
    const content = `## section information\nsome content\n## issues to address`;
    const result = validateExpanderContent(content);
    expect(result.isValid).toBe(false);
    expect(result.detectedMarkers.length).toBeGreaterThanOrEqual(2);
  });

  it('should not flag patcher-specific markers', () => {
    // validateExpanderContent only checks SECTION_EXPANDER_MARKERS
    const content = `## SECTION TITLE\nSome title\n## FIX INSTRUCTIONS`;
    const result = validateExpanderContent(content);
    expect(result.isValid).toBe(true);
  });
});

// ============================================================================
// Marker constants
// ============================================================================

describe('Prompt marker constants', () => {
  it('SECTION_EXPANDER_MARKERS should have all expander markers', () => {
    expect(SECTION_EXPANDER_MARKERS).toContain('## SECTION INFORMATION');
    expect(SECTION_EXPANDER_MARKERS).toContain('## ISSUES TO ADDRESS');
    expect(SECTION_EXPANDER_MARKERS).toContain('REGENERATED SECTION:');
    expect(SECTION_EXPANDER_MARKERS.length).toBe(7);
  });

  it('ALL_PROMPT_MARKERS should combine patcher and expander markers', () => {
    // ALL_PROMPT_MARKERS = PROMPT_TEMPLATE_MARKERS (7, private) + SECTION_EXPANDER_MARKERS (7)
    expect(ALL_PROMPT_MARKERS.length).toBe(14);

    // Should contain expander markers
    for (const marker of SECTION_EXPANDER_MARKERS) {
      expect(ALL_PROMPT_MARKERS).toContain(marker);
    }

    // Should also contain patcher markers (not directly exported, but present in ALL)
    expect(ALL_PROMPT_MARKERS).toContain('## SECTION TITLE');
    expect(ALL_PROMPT_MARKERS).toContain('## ORIGINAL CONTENT');
    expect(ALL_PROMPT_MARKERS).toContain('## FIX INSTRUCTIONS');
    expect(ALL_PROMPT_MARKERS).toContain('COMPLETE CORRECTED SECTION:');
  });
});
