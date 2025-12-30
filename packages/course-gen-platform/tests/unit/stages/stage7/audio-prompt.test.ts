/**
 * Audio TTS Preprocessing Module Tests
 * @module tests/unit/stages/stage7/audio-prompt
 *
 * Tests for markdown to TTS text conversion utilities.
 */

import {
  prepareAudioScript,
  chunkAudioScript,
  getDefaultVoice,
  estimateAudioDuration,
  validateTTSSettings,
  type AudioScriptParams,
} from '../../../../src/stages/stage7-enrichments/prompts/audio-prompt';

describe('Audio TTS Preprocessing Module', () => {
  describe('prepareAudioScript', () => {
    it('should convert markdown headers to plain text with periods', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Introduction to TypeScript',
        lessonContent: '# Main Topic\n\nThis is content.',
        language: 'en',
      };

      const result = prepareAudioScript(params);

      expect(result.script).toContain('Main Topic.');
      expect(result.script).not.toContain('#');
    });

    it('should remove code blocks and add descriptive text (English)', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Test',
        lessonContent: '```typescript\nconst x = 1;\n```',
        language: 'en',
      };

      const result = prepareAudioScript(params);

      expect(result.script).toContain('written in typescript');
      expect(result.script).not.toContain('```');
    });

    it('should remove code blocks and add descriptive text (Russian)', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Тест',
        lessonContent: '```javascript\nconst x = 1;\n```',
        language: 'ru',
      };

      const result = prepareAudioScript(params);

      expect(result.script).toContain('javascript');
      expect(result.script).toContain('пример кода');
      expect(result.script).not.toContain('```');
    });

    it('should remove bold and italic formatting', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Test',
        lessonContent: '**Bold text** and *italic text*',
        language: 'en',
      };

      const result = prepareAudioScript(params);

      expect(result.script).toContain('Bold text');
      expect(result.script).toContain('italic text');
      expect(result.script).not.toContain('**');
      expect(result.script).not.toContain('*italic');
    });

    it('should remove links but keep link text', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Test',
        lessonContent: 'Check [this link](https://example.com) for more.',
        language: 'en',
      };

      const result = prepareAudioScript(params);

      expect(result.script).toContain('this link');
      expect(result.script).not.toContain('](');
      expect(result.script).not.toContain('https://');
    });

    it('should convert unordered lists to sentences with transitions (English)', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Test',
        lessonContent: '- First item\n- Second item\n- Third item',
        language: 'en',
      };

      const result = prepareAudioScript(params);

      expect(result.script).toContain('First,');
      expect(result.script).toContain('first item');
      expect(result.script).not.toContain('- ');
    });

    it('should convert unordered lists to sentences with transitions (Russian)', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Тест',
        lessonContent: '- Первый пункт\n- Второй пункт',
        language: 'ru',
      };

      const result = prepareAudioScript(params);

      expect(result.script).toContain('Во-первых');
      expect(result.script).not.toContain('- ');
    });

    it('should calculate word count correctly', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Test Title',
        lessonContent: 'This is a simple test with ten words here.',
        language: 'en',
      };

      const result = prepareAudioScript(params);

      // "Test Title" (2) + content (10) = 12 words
      expect(result.wordCount).toBeGreaterThan(10);
    });

    it('should estimate duration based on word count', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Test',
        lessonContent: 'Word '.repeat(150), // 150 words
        language: 'en',
        settings: { speed: 1.0 },
      };

      const result = prepareAudioScript(params);

      // 150 words at 150 wpm = ~1 minute = 60 seconds
      expect(result.estimatedDurationSeconds).toBeGreaterThan(50);
      expect(result.estimatedDurationSeconds).toBeLessThan(80);
    });

    it('should handle image references (English)', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Test',
        lessonContent: '![Diagram of React](diagram.png)',
        language: 'en',
      };

      const result = prepareAudioScript(params);

      expect(result.script).toContain('Image: Diagram of React');
      expect(result.script).not.toContain('![');
    });

    it('should handle tables', () => {
      const params: AudioScriptParams = {
        lessonTitle: 'Test',
        lessonContent: '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1 | Cell 2 |',
        language: 'en',
      };

      const result = prepareAudioScript(params);

      expect(result.script).toContain('table');
      expect(result.script).not.toContain('|');
    });

    it('should indicate chunks if content exceeds 4096 chars', () => {
      const longContent = 'Word '.repeat(1500); // ~7500 chars
      const params: AudioScriptParams = {
        lessonTitle: 'Test',
        lessonContent: longContent,
        language: 'en',
      };

      const result = prepareAudioScript(params);

      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
    });
  });

  describe('chunkAudioScript', () => {
    it('should not chunk short text', () => {
      const script = 'Short text that fits in one chunk.';
      const chunks = chunkAudioScript(script);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(script);
    });

    it('should chunk long text at sentence boundaries', () => {
      // Create text with multiple sentences that exceeds 4000 chars
      const sentence = 'This is a sentence. ';
      const longText = sentence.repeat(300); // ~6000 chars

      const chunks = chunkAudioScript(longText);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should be under limit
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(4000);
      });
    });

    it('should handle very long single sentences', () => {
      // Create a single very long sentence without periods
      const longSentence = 'word '.repeat(1500); // ~7500 chars, no periods

      const chunks = chunkAudioScript(longSentence);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(4000);
      });
    });

    it('should respect custom chunk size', () => {
      const text = 'Word. '.repeat(500); // ~3000 chars
      const chunks = chunkAudioScript(text, 1000);

      expect(chunks.length).toBeGreaterThan(2);
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(1000);
      });
    });
  });

  describe('getDefaultVoice', () => {
    it('should return nova for English', () => {
      const voice = getDefaultVoice('en');
      expect(voice).toBe('nova');
    });

    it('should return nova for Russian', () => {
      const voice = getDefaultVoice('ru');
      expect(voice).toBe('nova');
    });
  });

  describe('estimateAudioDuration', () => {
    it('should estimate duration at normal speed', () => {
      const text = 'word '.repeat(150); // 150 words
      const duration = estimateAudioDuration(text, 1.0);

      // 150 words / (2.5 words/sec) = 60 seconds
      expect(duration).toBeGreaterThanOrEqual(58);
      expect(duration).toBeLessThanOrEqual(62);
    });

    it('should estimate duration at 2x speed', () => {
      const text = 'word '.repeat(150); // 150 words
      const duration = estimateAudioDuration(text, 2.0);

      // 150 words / (5 words/sec) = 30 seconds
      expect(duration).toBeGreaterThanOrEqual(28);
      expect(duration).toBeLessThanOrEqual(32);
    });

    it('should estimate duration at 0.5x speed', () => {
      const text = 'word '.repeat(150); // 150 words
      const duration = estimateAudioDuration(text, 0.5);

      // 150 words / (1.25 words/sec) = 120 seconds
      expect(duration).toBeGreaterThanOrEqual(118);
      expect(duration).toBeLessThanOrEqual(122);
    });
  });

  describe('validateTTSSettings', () => {
    it('should use defaults for empty settings', () => {
      const validated = validateTTSSettings({});

      expect(validated.voice).toBe('nova');
      expect(validated.format).toBe('mp3');
      expect(validated.speed).toBe(1.0);
    });

    it('should accept valid voice', () => {
      const validated = validateTTSSettings({ voice: 'alloy' });

      expect(validated.voice).toBe('alloy');
    });

    it('should reject invalid voice and use default', () => {
      const validated = validateTTSSettings({ voice: 'invalid' as any });

      expect(validated.voice).toBe('nova');
    });

    it('should accept valid format', () => {
      const validated = validateTTSSettings({ format: 'opus' });

      expect(validated.format).toBe('opus');
    });

    it('should reject invalid format and use default', () => {
      const validated = validateTTSSettings({ format: 'invalid' as any });

      expect(validated.format).toBe('mp3');
    });

    it('should clamp speed to minimum 0.25', () => {
      const validated = validateTTSSettings({ speed: 0.1 });

      expect(validated.speed).toBe(0.25);
    });

    it('should clamp speed to maximum 4.0', () => {
      const validated = validateTTSSettings({ speed: 5.0 });

      expect(validated.speed).toBe(4.0);
    });

    it('should accept valid speed', () => {
      const validated = validateTTSSettings({ speed: 1.5 });

      expect(validated.speed).toBe(1.5);
    });
  });
});
