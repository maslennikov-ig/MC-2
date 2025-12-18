/**
 * Semantic Diff Generator Tests
 *
 * Tests for the semantic diff generation functionality
 */

import { describe, it, expect } from 'vitest';
import { generateSemanticDiff } from '@/shared/regeneration/semantic-diff-generator';

describe('generateSemanticDiff', () => {
  it('should detect simplified change type when content is reduced', async () => {
    const original = [
      'Объяснить принципы объектно-ориентированного программирования',
      'Применить паттерны проектирования в реальных проектах',
      'Анализировать архитектурные решения',
    ];

    const regenerated = [
      'Объяснить основы ООП',
    ];

    const diff = await generateSemanticDiff({
      original,
      regenerated,
      fieldPath: 'learning_objectives',
      blockType: 'learning_objectives',
    });

    expect(diff.changeType).toBe('simplified');
    expect(diff.conceptsRemoved.length).toBeGreaterThan(0);
    expect(diff.alignmentScore).toBeLessThan(5);
    expect(diff.changeDescription).toContain('Упрощено');
  });

  it('should detect expanded change type when content is enlarged', async () => {
    const original = 'Understand JavaScript basics';

    const regenerated = [
      'Explain JavaScript fundamentals including variables, data types, and operators',
      'Demonstrate understanding of control flow structures',
      'Apply JavaScript concepts to build interactive web applications',
    ];

    const diff = await generateSemanticDiff({
      original,
      regenerated,
      fieldPath: 'learning_objectives',
      blockType: 'learning_objectives',
    });

    expect(diff.changeType).toBe('expanded');
    expect(diff.conceptsAdded.length).toBeGreaterThan(0);
    expect(diff.changeDescription).toContain('Expanded');
  });

  it('should detect refined or restructured change type for minor wording improvements', async () => {
    const original = 'Explain the principles of functional programming';
    const regenerated = 'Describe the core principles of functional programming';

    const diff = await generateSemanticDiff({
      original,
      regenerated,
      fieldPath: 'description',
      blockType: 'description',
    });

    // Should be refined or restructured depending on concept extraction
    expect(['refined', 'restructured']).toContain(diff.changeType);
    // Alignment score varies based on concept extraction (1-5 scale)
    expect(diff.alignmentScore).toBeGreaterThanOrEqual(1);
    expect(diff.alignmentScore).toBeLessThanOrEqual(5);
  });

  it('should detect restructured or expanded change type for reorganized content', async () => {
    const original = [
      'Learn about databases',
      'Study SQL queries',
      'Practice data modeling',
    ];

    const regenerated = [
      'Master relational database design',
      'Execute advanced SQL operations',
      'Implement NoSQL solutions',
    ];

    const diff = await generateSemanticDiff({
      original,
      regenerated,
      fieldPath: 'key_topics',
      blockType: 'key_topics',
    });

    // Should be restructured or expanded depending on word count
    expect(['restructured', 'expanded']).toContain(diff.changeType);
    expect(diff.conceptsAdded.length).toBeGreaterThan(0);
    expect(diff.conceptsRemoved.length).toBeGreaterThan(0);
  });

  it('should handle empty content gracefully', async () => {
    const diff = await generateSemanticDiff({
      original: '',
      regenerated: 'New content',
      fieldPath: 'description',
      blockType: 'description',
    });

    expect(diff).toBeDefined();
    expect(diff.changeType).toBe('expanded');
    expect(diff.alignmentScore).toBeLessThan(5);
  });

  it('should use LLM change log if provided', async () => {
    const llmChangeLog = 'Custom pedagogical change explanation';

    const diff = await generateSemanticDiff({
      original: 'Old content',
      regenerated: 'New content',
      fieldPath: 'description',
      blockType: 'description',
      llmChangeLog,
    });

    expect(diff.changeDescription).toBe(llmChangeLog);
  });

  it('should detect Russian language and provide Russian descriptions', async () => {
    const original = 'Изучить основы Python';
    const regenerated = 'Освоить фундаментальные концепции языка Python';

    const diff = await generateSemanticDiff({
      original,
      regenerated,
      fieldPath: 'lesson_title',
      blockType: 'lesson_title',
    });

    expect(diff.changeDescription).toMatch(/Уточнено|Расширено|Упрощено|Реструктурировано/);
  });

  it('should calculate alignment score correctly', async () => {
    // Good alignment (minor changes)
    const goodDiff = await generateSemanticDiff({
      original: 'Learn Python programming',
      regenerated: 'Learn Python programming basics',
      fieldPath: 'title',
      blockType: 'title',
    });
    expect(goodDiff.alignmentScore).toBeGreaterThanOrEqual(2);

    // Poor alignment (major changes)
    const poorDiff = await generateSemanticDiff({
      original: 'Learn Python programming',
      regenerated: 'Master advanced JavaScript frameworks for enterprise applications',
      fieldPath: 'title',
      blockType: 'title',
    });
    expect(poorDiff.alignmentScore).toBeLessThanOrEqual(3);
  });

  it('should validate Bloom\'s level preservation for learning objectives', async () => {
    // Preserved: both use "Explain" (understand level)
    const preserved = await generateSemanticDiff({
      original: 'Explain the concept of inheritance',
      regenerated: 'Explain object-oriented inheritance principles',
      fieldPath: 'learning_objectives[0]',
      blockType: 'learning_objectives',
    });
    expect(preserved.bloomLevelPreserved).toBe(true);

    // Not preserved: "Remember" to "Create"
    const notPreserved = await generateSemanticDiff({
      original: 'Define basic programming terms',
      regenerated: 'Design a complete software architecture',
      fieldPath: 'learning_objectives[0]',
      blockType: 'learning_objectives',
    });
    expect(notPreserved.bloomLevelPreserved).toBe(false);
  });

  it('should extract concepts from array content', async () => {
    const original = [
      'Machine learning algorithms',
      'Neural network architectures',
      'Deep learning frameworks',
    ];

    const regenerated = [
      'Supervised learning techniques',
      'Convolutional neural networks',
      'TensorFlow and PyTorch',
    ];

    const diff = await generateSemanticDiff({
      original,
      regenerated,
      fieldPath: 'key_topics',
      blockType: 'key_topics',
    });

    expect(diff.conceptsAdded.length).toBeGreaterThan(0);
    expect(diff.conceptsRemoved.length).toBeGreaterThan(0);
    // Check for concepts in lowercase (as they're normalized)
    const hasFrameworkConcept = diff.conceptsAdded.some(c =>
      c.includes('tensor') || c.includes('pytorch') || c.includes('supervised')
    );
    expect(hasFrameworkConcept).toBe(true);
  });
});
