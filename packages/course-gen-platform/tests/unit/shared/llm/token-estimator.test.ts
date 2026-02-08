/**
 * Unit tests for Token Estimator Service
 * @module tests/unit/token-estimator
 *
 * Tests cover:
 * - Language detection (Russian, English, mixed content)
 * - Token estimation accuracy (±10% variance target)
 * - Edge cases (empty string, emojis, special characters)
 * - Default fallback for unknown languages
 * - Consistency (same input → same output)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenEstimator } from '@/orchestrator/services/token-estimator';

describe('TokenEstimator', () => {
  let estimator: TokenEstimator;

  beforeEach(() => {
    estimator = new TokenEstimator();
  });

  describe('Language Detection', () => {
    it('should detect English correctly', () => {
      const text =
        'The quick brown fox jumps over the lazy dog. This is a longer English text to ensure accurate language detection.';
      const language = estimator.detectLanguage(text);

      expect(language).toBe('eng');
    });

    it('should detect Russian correctly', () => {
      const text =
        'Быстрая коричневая лиса прыгает через ленивую собаку. Это более длинный русский текст для точного определения языка.';
      const language = estimator.detectLanguage(text);

      expect(language).toBe('rus');
    });

    it('should detect German correctly', () => {
      const text =
        'Der schnelle braune Fuchs springt über den faulen Hund. Dies ist ein längerer deutscher Text zur genauen Spracherkennung.';
      const language = estimator.detectLanguage(text);

      expect(language).toBe('deu');
    });

    it('should detect French correctly', () => {
      const text =
        'Le renard brun rapide saute par-dessus le chien paresseux. Ceci est un texte français plus long pour une détection de langue précise.';
      const language = estimator.detectLanguage(text);

      expect(language).toBe('fra');
    });

    it('should detect Spanish correctly', () => {
      const text =
        'El rápido zorro marrón salta sobre el perro perezoso. Este es un texto español más largo para una detección de idioma precisa.';
      const language = estimator.detectLanguage(text);

      expect(language).toBe('spa');
    });

    it('should return "und" for empty string', () => {
      const language = estimator.detectLanguage('');

      expect(language).toBe('und');
    });

    it('should return "und" for very short text (below threshold)', () => {
      const language = estimator.detectLanguage('Hi');

      expect(language).toBe('und');
    });

    it('should handle mixed English and Russian text', () => {
      // Mixed text may detect as either language depending on predominance
      const text =
        'Hello Привет World Мир. This is mixed content with both English and Russian words for testing language detection.';
      const language = estimator.detectLanguage(text);

      // Should detect as one of the two languages (franc picks most prevalent)
      expect(['eng', 'rus']).toContain(language);
    });

    it('should handle text with emojis and special characters', () => {
      const text =
        'Hello world! 😊 This is a test with emojis 🎉 and special characters: @#$%^&*()';
      const language = estimator.detectLanguage(text);

      expect(language).toBe('eng');
    });

    it('should handle Chinese text', () => {
      const text = '快速的棕色狐狸跳过懒狗。这是一段更长的中文文本，以确保准确的语言检测。';
      const language = estimator.detectLanguage(text);

      expect(language).toBe('cmn'); // Chinese Mandarin
    });
  });

  describe('Language Ratio Retrieval', () => {
    it('should return correct ratio for Russian', () => {
      const ratio = estimator.getLanguageRatio('rus');
      expect(ratio).toBe(3.2);
    });

    it('should return correct ratio for English', () => {
      const ratio = estimator.getLanguageRatio('eng');
      expect(ratio).toBe(4.0);
    });

    it('should return correct ratio for German', () => {
      const ratio = estimator.getLanguageRatio('deu');
      expect(ratio).toBe(4.5);
    });

    it('should return correct ratio for French', () => {
      const ratio = estimator.getLanguageRatio('fra');
      expect(ratio).toBe(4.2);
    });

    it('should return correct ratio for Spanish', () => {
      const ratio = estimator.getLanguageRatio('spa');
      expect(ratio).toBe(4.3);
    });

    it('should return correct ratio for Chinese', () => {
      const ratio = estimator.getLanguageRatio('cmn');
      expect(ratio).toBe(2.0);
    });

    it('should return default ratio for unknown language', () => {
      const ratio = estimator.getLanguageRatio('xyz');
      expect(ratio).toBe(4.0);
    });

    it('should return default ratio for "und" (undetermined)', () => {
      const ratio = estimator.getLanguageRatio('und');
      expect(ratio).toBe(4.0);
    });
  });

  describe('Token Estimation', () => {
    describe('Basic Estimation', () => {
      it('should estimate tokens for English text', () => {
        // "Hello world" = 11 chars / 4.0 = ~3 tokens
        const text = 'Hello world';
        const tokens = estimator.estimateTokens(text);

        expect(tokens).toBeGreaterThanOrEqual(2);
        expect(tokens).toBeLessThanOrEqual(4);
      });

      it('should estimate tokens for Russian text', () => {
        // "Привет мир" = 10 chars / 3.2 = ~4 tokens (rounded up)
        const text = 'Привет мир';
        const tokens = estimator.estimateTokens(text);

        expect(tokens).toBeGreaterThanOrEqual(3);
        expect(tokens).toBeLessThanOrEqual(5);
      });

      it('should return 0 tokens for empty string', () => {
        const tokens = estimator.estimateTokens('');
        expect(tokens).toBe(0);
      });

      it('should return 0 tokens for whitespace-only string', () => {
        const tokens = estimator.estimateTokens('   ');
        expect(tokens).toBe(0);
      });
    });

    describe('Accuracy Tests (±10% target)', () => {
      it('should estimate English tokens within ±10% of expected', () => {
        // Sample English technical text (approximate known token count)
        const text =
          'The Token Estimator Service provides language detection and token count estimation based on character-to-token ratios. It supports automatic language detection using franc library.';
        // 182 chars / 4.0 = 45.5 tokens (rounded up to 46)
        const tokens = estimator.estimateTokens(text);

        // Expected: ~46 tokens (±10% = 41-51)
        expect(tokens).toBeGreaterThanOrEqual(41);
        expect(tokens).toBeLessThanOrEqual(51);
      });

      it('should estimate Russian tokens within ±10% of expected', () => {
        // Sample Russian text
        const text =
          'Служба оценки токенов обеспечивает обнаружение языка и оценку количества токенов на основе соотношения символов к токенам.';
        // 124 chars / 3.2 = 38.75 tokens (rounded up to 39)
        const tokens = estimator.estimateTokens(text);

        // Expected: ~39 tokens (±10% = 35-43)
        expect(tokens).toBeGreaterThanOrEqual(35);
        expect(tokens).toBeLessThanOrEqual(43);
      });

      it('should estimate German tokens within ±10% of expected', () => {
        // Sample German text with compound words
        const text =
          'Der Token-Schätzdienst bietet Spracherkennung und Token-Zählschätzung basierend auf Zeichen-zu-Token-Verhältnissen.';
        // 117 chars / 4.5 = 26 tokens
        const tokens = estimator.estimateTokens(text);

        // Expected: ~26 tokens (±10% = 23-29)
        expect(tokens).toBeGreaterThanOrEqual(23);
        expect(tokens).toBeLessThanOrEqual(29);
      });
    });

    describe('Explicit Language Parameter', () => {
      it('should use explicit language when provided', () => {
        const text = 'Some text here';
        const tokensRussian = estimator.estimateTokens(text, 'rus');
        const tokensEnglish = estimator.estimateTokens(text, 'eng');

        // Russian ratio is lower (3.2 vs 4.0), so more tokens
        expect(tokensRussian).toBeGreaterThan(tokensEnglish);
      });

      it('should override auto-detection with explicit language', () => {
        const text = 'Hello world'; // English text
        const tokensAsRussian = estimator.estimateTokens(text, 'rus');

        // 11 chars / 3.2 = 3.4375 → 4 tokens (treating as Russian)
        expect(tokensAsRussian).toBe(4);
      });
    });

    describe('Edge Cases', () => {
      it('should handle text with emojis', () => {
        const text = 'Hello 😊 World 🎉';
        const tokens = estimator.estimateTokens(text);

        expect(tokens).toBeGreaterThan(0);
      });

      it('should handle text with special characters', () => {
        const text = '@#$%^&*() Special characters test!';
        const tokens = estimator.estimateTokens(text);

        expect(tokens).toBeGreaterThan(0);
      });

      it('should handle very long text', () => {
        const longText = 'a'.repeat(100000);
        const tokens = estimator.estimateTokens(longText);

        // 100,000 chars / 4.0 = 25,000 tokens
        expect(tokens).toBeGreaterThanOrEqual(20000);
        expect(tokens).toBeLessThanOrEqual(30000);
      });

      it('should handle text with newlines and tabs', () => {
        const text = 'Line 1\nLine 2\tTabbed\nLine 3';
        const tokens = estimator.estimateTokens(text);

        expect(tokens).toBeGreaterThan(0);
      });

      it('should handle numbers and digits', () => {
        const text = '1234567890 0987654321';
        const tokens = estimator.estimateTokens(text);

        expect(tokens).toBeGreaterThan(0);
      });

      it('should handle Chinese characters (high density)', () => {
        // Longer Chinese text to ensure detection
        const text = '你好世界，这是一个测试文本，用于验证中文字符的处理'; // ~21 chars
        const tokens = estimator.estimateTokens(text);

        // 21 chars / 2.0 (Chinese ratio) = ~11 tokens
        expect(tokens).toBeGreaterThanOrEqual(9);
        expect(tokens).toBeLessThanOrEqual(13);
      });

      it('should handle Arabic text (RTL)', () => {
        const text = 'مرحبا بالعالم هذا نص عربي للاختبار';
        const tokens = estimator.estimateTokens(text);

        expect(tokens).toBeGreaterThan(0);
      });
    });

    describe('Consistency', () => {
      it('should return same result for same input (English)', () => {
        const text = 'Consistent estimation test';
        const tokens1 = estimator.estimateTokens(text);
        const tokens2 = estimator.estimateTokens(text);
        const tokens3 = estimator.estimateTokens(text);

        expect(tokens1).toBe(tokens2);
        expect(tokens2).toBe(tokens3);
      });

      it('should return same result for same input (Russian)', () => {
        const text = 'Тест постоянной оценки';
        const tokens1 = estimator.estimateTokens(text);
        const tokens2 = estimator.estimateTokens(text);
        const tokens3 = estimator.estimateTokens(text);

        expect(tokens1).toBe(tokens2);
        expect(tokens2).toBe(tokens3);
      });
    });
  });

  describe('Batch Estimation', () => {
    it('should estimate tokens for multiple texts', () => {
      const texts = ['Hello world', 'Привет мир', 'Bonjour le monde'];

      const counts = estimator.batchEstimateTokens(texts);

      expect(counts).toHaveLength(3);
      expect(counts[0]).toBeGreaterThan(0);
      expect(counts[1]).toBeGreaterThan(0);
      expect(counts[2]).toBeGreaterThan(0);
    });

    it('should handle empty array', () => {
      const counts = estimator.batchEstimateTokens([]);
      expect(counts).toHaveLength(0);
    });

    it('should handle array with empty strings', () => {
      const texts = ['', '  ', 'Valid text'];
      const counts = estimator.batchEstimateTokens(texts);

      expect(counts).toHaveLength(3);
      expect(counts[0]).toBe(0);
      expect(counts[1]).toBe(0);
      expect(counts[2]).toBeGreaterThan(0);
    });
  });

  describe('Metadata Estimation', () => {
    it('should return detailed metadata for English text', () => {
      const text = 'Hello world! This is a longer English text for proper language detection.';
      const result = estimator.estimateTokensWithMetadata(text);

      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('language');
      expect(result).toHaveProperty('ratio');
      expect(result).toHaveProperty('characterCount');

      expect(result.language).toBe('eng');
      expect(result.ratio).toBe(4.0);
      expect(result.characterCount).toBe(text.length);
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should return detailed metadata for Russian text', () => {
      const text = 'Привет мир! Это более длинный русский текст для правильного определения языка.';
      const result = estimator.estimateTokensWithMetadata(text);

      expect(result.language).toBe('rus');
      expect(result.ratio).toBe(3.2);
      expect(result.characterCount).toBe(text.length);
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should return metadata for undetermined short text', () => {
      const text = 'Hi';
      const result = estimator.estimateTokensWithMetadata(text);

      expect(result.language).toBe('und');
      expect(result.ratio).toBe(4.0); // Default ratio
      expect(result.characterCount).toBe(2);
    });
  });

  describe('Custom Language Ratios', () => {
    it('should allow setting custom language ratio', () => {
      estimator.setLanguageRatio('custom', 3.5);
      const ratio = estimator.getLanguageRatio('custom');

      expect(ratio).toBe(3.5);
    });

    it('should update existing language ratio', () => {
      estimator.setLanguageRatio('eng', 4.2); // Update English ratio
      const ratio = estimator.getLanguageRatio('eng');

      expect(ratio).toBe(4.2);
    });

    it('should throw error for zero or negative ratio', () => {
      expect(() => {
        estimator.setLanguageRatio('invalid', 0);
      }).toThrow('Ratio must be positive');

      expect(() => {
        estimator.setLanguageRatio('invalid', -1);
      }).toThrow('Ratio must be positive');
    });

    it('should use custom ratio in token estimation', () => {
      estimator.setLanguageRatio('custom', 2.0);
      const text = 'Test text'; // 9 chars / 2.0 = 4.5 → 5 tokens
      const tokens = estimator.estimateTokens(text, 'custom');

      expect(tokens).toBe(5);
    });
  });

  describe('Singleton Instance', () => {
    it('should export singleton instance', async () => {
      // Dynamic import for ESM module
      const module = await import('../../src/orchestrator/services/token-estimator');

      expect(module.tokenEstimator).toBeDefined();
      expect(module.tokenEstimator).toBeInstanceOf(TokenEstimator);
    });
  });
});
