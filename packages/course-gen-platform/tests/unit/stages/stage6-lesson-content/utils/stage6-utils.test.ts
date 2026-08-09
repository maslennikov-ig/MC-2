/**
 * Tests for stage6-lesson-content/utils — pure utility functions
 *
 * Covers:
 * - sanity-check.ts: quickSanityCheck
 * - mermaid-fallback-marker.ts: countMermaidFallbackComments
 */

import { describe, it, expect } from 'vitest';
import { quickSanityCheck } from '@/stages/stage6-lesson-content/utils/sanity-check';
import {
  countMermaidFallbackComments,
  MERMAID_FALLBACK_COMMENT_REGEX,
} from '@/stages/stage6-lesson-content/utils/mermaid-fallback-marker';

// ─────────────────────────────────────────────────────────────────────────────
// quickSanityCheck
// ─────────────────────────────────────────────────────────────────────────────

// Helper to build content >100 chars, >200 words, with heading
const VALID_CONTENT = `# Introduction to Machine Learning

Machine learning is a subfield of artificial intelligence that enables computers to learn and make decisions without being explicitly programmed. It works by training algorithms on large datasets to identify patterns and make predictions about new data.

There are three main types of machine learning: supervised learning uses labeled training data; unsupervised learning finds hidden patterns in unlabeled data; and reinforcement learning trains agents through reward signals and environmental feedback over time.

The most common supervised learning algorithms include linear regression for continuous outputs, logistic regression for classification tasks, decision trees, random forests, gradient boosting methods, and neural networks for complex non-linear relationships in high-dimensional data.

Feature engineering is crucial to machine learning success in practice. Good features capture the underlying patterns in data effectively. Common techniques include normalization, standardization, one-hot encoding for categorical variables, principal component analysis for dimensionality reduction, and polynomial feature creation for capturing interactions between variables.

Model evaluation uses metrics like accuracy, precision, recall, and F1-score for classification tasks, and RMSE or MAE for regression problems. Cross-validation helps avoid overfitting by testing model performance on held-out validation data during the training process.

Deep learning represents a powerful subset of machine learning that uses neural networks with many layers to automatically learn hierarchical feature representations from raw data inputs like images text and audio. Convolutional neural networks excel at image recognition while recurrent networks and transformers handle sequential data including natural language processing tasks.`;

describe('quickSanityCheck', () => {
  it('returns ok=true for valid content with heading and sufficient words', () => {
    const result = quickSanityCheck(VALID_CONTENT);
    expect(result.ok).toBe(true);
    expect(result.metrics?.hasHeadings).toBe(true);
    expect(result.metrics?.wordCount).toBeGreaterThanOrEqual(200);
  });

  it('returns EMPTY_OR_NEAR_EMPTY for empty string', () => {
    const result = quickSanityCheck('');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('EMPTY_OR_NEAR_EMPTY');
  });

  it('returns EMPTY_OR_NEAR_EMPTY for very short content (< 100 chars)', () => {
    const result = quickSanityCheck('# Title\n\nShort.');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('EMPTY_OR_NEAR_EMPTY');
  });

  it('returns NO_HEADINGS when content has no markdown headings', () => {
    // >100 chars but no headings
    const content = 'word '.repeat(100);
    const result = quickSanityCheck(content);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('NO_HEADINGS');
  });

  it('returns TOO_SHORT when content has headings but < 200 words', () => {
    // Has a heading, >100 chars, but <200 words
    const content = '# Title\n\n' + 'word '.repeat(150);
    const result = quickSanityCheck(content);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('TOO_SHORT');
  });

  it('excludes code blocks from word count', () => {
    // Content with heading and lots of code — non-code words < 200
    const heading = '# Lesson';
    const codeBlock = '\n```javascript\n' + 'const x = 1; '.repeat(500) + '\n```\n';
    const fewWords = ' word '.repeat(50); // 50 non-code words
    const content = heading + codeBlock + fewWords;
    const result = quickSanityCheck(content);
    // Should fail TOO_SHORT since real word count (excluding code) is < 200
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('TOO_SHORT');
  });

  it('accepts h2, h3, h4 headings', () => {
    const content = '## Section Heading\n\n' + 'word '.repeat(200);
    const result = quickSanityCheck(content);
    expect(result.ok).toBe(true);
  });

  it('returns metrics in result', () => {
    const result = quickSanityCheck(VALID_CONTENT);
    expect(result.metrics).toBeDefined();
    expect(typeof result.metrics?.charCount).toBe('number');
    expect(typeof result.metrics?.wordCount).toBe('number');
    expect(result.metrics?.hasHeadings).toBe(true);
  });

  it('handles null/undefined gracefully via string coercion', () => {
    // The function uses (markdown || '') so passing undefined-like
    const result = quickSanityCheck(null as any);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('EMPTY_OR_NEAR_EMPTY');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// countMermaidFallbackComments
// ─────────────────────────────────────────────────────────────────────────────

describe('countMermaidFallbackComments', () => {
  it('returns 0 for content with no fallback comments', () => {
    expect(countMermaidFallbackComments('# Normal content\n\nSome text')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(countMermaidFallbackComments('')).toBe(0);
  });

  it('counts a single fallback comment', () => {
    const content = `# Title\n<!-- Mermaid diagram could not be rendered. Please review manually. -->\nOther content`;
    expect(countMermaidFallbackComments(content)).toBe(1);
  });

  it('counts multiple fallback comments', () => {
    const comment = '<!-- Mermaid diagram could not be rendered. Please review manually. -->';
    const content = `# Title\n${comment}\nSection A\n${comment}\nSection B\n${comment}`;
    expect(countMermaidFallbackComments(content)).toBe(3);
  });

  it('is case-insensitive for Mermaid keyword', () => {
    const content = '<!-- MERMAID diagram could not be rendered. Please review manually. -->';
    expect(countMermaidFallbackComments(content)).toBe(1);
  });

  it('matches with extra whitespace in comment', () => {
    const content = '<!--  Mermaid  something could not be rendered.  Please review manually.  -->';
    expect(countMermaidFallbackComments(content)).toBe(1);
  });

  it('MERMAID_FALLBACK_COMMENT_REGEX is a global RegExp', () => {
    expect(MERMAID_FALLBACK_COMMENT_REGEX.flags).toContain('g');
  });
});
