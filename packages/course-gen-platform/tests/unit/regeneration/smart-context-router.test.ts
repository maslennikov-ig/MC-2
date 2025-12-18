/**
 * Unit tests for Smart Context Router tier detection
 */

import { describe, it, expect } from 'vitest';
import { detectContextTier, getTokenBudget, _TIER_PATTERNS } from '@/shared/regeneration/smart-context-router';

describe('detectContextTier', () => {
  describe('Atomic tier detection', () => {
    it('should detect typo fixes as atomic', () => {
      expect(detectContextTier('Fix typo in first sentence')).toBe('atomic');
      expect(detectContextTier('Correct spelling mistake')).toBe('atomic');
      expect(detectContextTier('Grammar correction needed')).toBe('atomic');
    });

    it('should detect Russian atomic patterns', () => {
      expect(detectContextTier('Исправь опечатку')).toBe('atomic');
      expect(detectContextTier('Исправить грамматику')).toBe('atomic');
    });

    it('should be case-insensitive', () => {
      expect(detectContextTier('FIX TYPO')).toBe('atomic');
      expect(detectContextTier('Correct SPELLING')).toBe('atomic');
    });
  });

  describe('Local tier detection', () => {
    it('should detect simplification/expansion as local', () => {
      expect(detectContextTier('Simplify this explanation')).toBe('local');
      expect(detectContextTier('Expand on this topic')).toBe('local');
      expect(detectContextTier('Shorten the description')).toBe('local');
    });

    it('should detect tone adjustments as local', () => {
      expect(detectContextTier('Make this more formal')).toBe('local');
      expect(detectContextTier('Change tone to be friendlier')).toBe('local');
      expect(detectContextTier('Make it more professional')).toBe('local');
    });

    it('should detect Russian local patterns', () => {
      expect(detectContextTier('Упрости объяснение')).toBe('local');
      expect(detectContextTier('Расширь эту тему')).toBe('local');
      expect(detectContextTier('Сократи описание')).toBe('local');
    });
  });

  describe('Structural tier detection', () => {
    it('should detect complexity changes as structural', () => {
      expect(detectContextTier('Adjust complexity for beginners')).toBe('structural');
      expect(detectContextTier('Make this easier to understand')).toBe('structural');
      expect(detectContextTier('Increase the level')).toBe('structural');
    });

    it('should detect audience targeting as structural', () => {
      expect(detectContextTier('Target this for students')).toBe('structural');
      expect(detectContextTier('Adapt for professionals')).toBe('structural');
      expect(detectContextTier('Make this for kids')).toBe('structural');
    });

    it('should detect reorganization as structural', () => {
      expect(detectContextTier('Reorganize this section')).toBe('structural');
      expect(detectContextTier('Restructure the content')).toBe('structural');
      expect(detectContextTier('Change the order')).toBe('structural');
    });

    it('should detect Russian structural patterns', () => {
      expect(detectContextTier('Изменить сложность')).toBe('structural');
      expect(detectContextTier('Для начинающих')).toBe('structural');
      expect(detectContextTier('Реорганизовать структуру')).toBe('structural');
    });
  });

  describe('Global tier detection', () => {
    it('should detect complete rewrites as global', () => {
      expect(detectContextTier('Completely rewrite this')).toBe('global');
      expect(detectContextTier('Start over from scratch')).toBe('global');
      expect(detectContextTier('Redesign the entire module')).toBe('global');
    });

    it('should detect style changes as global', () => {
      expect(detectContextTier('Change the style completely')).toBe('global');
      expect(detectContextTier('Use a different style')).toBe('global');
      expect(detectContextTier('New approach needed')).toBe('global');
    });

    it('should detect Russian global patterns', () => {
      expect(detectContextTier('Переписать полностью')).toBe('global');
      expect(detectContextTier('С нуля')).toBe('global');
      expect(detectContextTier('Полностью изменить стиль')).toBe('global');
    });
  });

  describe('Default fallback behavior', () => {
    it('should default to local tier when no patterns match', () => {
      expect(detectContextTier('Update this content')).toBe('local');
      expect(detectContextTier('Modify the text')).toBe('local');
      expect(detectContextTier('Change this')).toBe('local');
      expect(detectContextTier('Random instruction')).toBe('local');
    });

    it('should handle empty or whitespace-only instructions', () => {
      expect(detectContextTier('')).toBe('local');
      expect(detectContextTier('   ')).toBe('local');
      expect(detectContextTier('\n\t')).toBe('local');
    });
  });

  describe('Pattern priority', () => {
    it('should match atomic tier first when multiple patterns present', () => {
      // "fix" matches atomic, but if "expand" were checked first, it would be local
      expect(detectContextTier('Fix typo and expand explanation')).toBe('atomic');
    });

    it('should respect tier ordering (atomic > local > structural > global)', () => {
      // First matching tier wins
      expect(detectContextTier('correct grammar')).toBe('atomic'); // not local
      expect(detectContextTier('simplify for beginners')).toBe('local'); // not structural
      expect(detectContextTier('reorganize and rewrite')).toBe('structural'); // not global
    });
  });
});

describe('getTokenBudget', () => {
  it('should return correct budget for atomic tier', () => {
    const budget = getTokenBudget('atomic');
    expect(budget).toEqual({
      target: 200,
      context: 100,
      total: 300,
    });
  });

  it('should return correct budget for local tier', () => {
    const budget = getTokenBudget('local');
    expect(budget).toEqual({
      target: 500,
      context: 500,
      total: 1000,
    });
  });

  it('should return correct budget for structural tier', () => {
    const budget = getTokenBudget('structural');
    expect(budget).toEqual({
      target: 1000,
      context: 1500,
      total: 2500,
    });
  });

  it('should return correct budget for global tier', () => {
    const budget = getTokenBudget('global');
    expect(budget).toEqual({
      target: 2000,
      context: 3000,
      total: 5000,
    });
  });
});

describe('_TIER_PATTERNS (pattern validation)', () => {
  it('should have patterns for all four tiers', () => {
    expect(_TIER_PATTERNS).toHaveProperty('atomic');
    expect(_TIER_PATTERNS).toHaveProperty('local');
    expect(_TIER_PATTERNS).toHaveProperty('structural');
    expect(_TIER_PATTERNS).toHaveProperty('global');
  });

  it('should have multiple patterns per tier', () => {
    expect(_TIER_PATTERNS.atomic.length).toBeGreaterThan(5);
    expect(_TIER_PATTERNS.local.length).toBeGreaterThan(10);
    expect(_TIER_PATTERNS.structural.length).toBeGreaterThan(10);
    expect(_TIER_PATTERNS.global.length).toBeGreaterThan(5);
  });

  it('should have lowercase patterns only', () => {
    for (const tier of Object.keys(_TIER_PATTERNS)) {
      const patterns = _TIER_PATTERNS[tier as keyof typeof _TIER_PATTERNS];
      patterns.forEach((pattern) => {
        expect(pattern).toBe(pattern.toLowerCase());
      });
    }
  });

  it('should include both English and Russian patterns', () => {
    // Check for at least one Cyrillic pattern per tier
    const hasCyrillic = (patterns: string[]) =>
      patterns.some((p) => /[а-яА-Я]/.test(p));

    expect(hasCyrillic(_TIER_PATTERNS.atomic)).toBe(true);
    expect(hasCyrillic(_TIER_PATTERNS.local)).toBe(true);
    expect(hasCyrillic(_TIER_PATTERNS.structural)).toBe(true);
    expect(hasCyrillic(_TIER_PATTERNS.global)).toBe(true);
  });
});
