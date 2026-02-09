import { describe, it, expect } from 'vitest';
import {
  getDocumentDisplayName,
  hasHumanReadableName,
  truncateDisplayName,
  type DocumentNameFields,
} from '../src/document-display-name';

describe('getDocumentDisplayName', () => {
  describe('priority order: generated_title > original_name > filename', () => {
    it('should return generated_title when all fields present (snake_case)', () => {
      const doc: DocumentNameFields = {
        generated_title: 'AI Generated Title',
        original_name: 'original.pdf',
        filename: 'system-123.pdf',
      };

      expect(getDocumentDisplayName(doc)).toBe('AI Generated Title');
    });

    it('should return generated_title when all fields present (camelCase)', () => {
      const doc: DocumentNameFields = {
        generatedTitle: 'AI Generated Title',
        originalName: 'original.pdf',
        filename: 'system-123.pdf',
      };

      expect(getDocumentDisplayName(doc)).toBe('AI Generated Title');
    });

    it('should return original_name when generated_title missing (snake_case)', () => {
      const doc: DocumentNameFields = {
        original_name: 'user-file.pdf',
        filename: 'system-456.pdf',
      };

      expect(getDocumentDisplayName(doc)).toBe('user-file.pdf');
    });

    it('should return original_name when generated_title missing (camelCase)', () => {
      const doc: DocumentNameFields = {
        originalName: 'user-file.pdf',
        filename: 'system-456.pdf',
      };

      expect(getDocumentDisplayName(doc)).toBe('user-file.pdf');
    });

    it('should return filename when only filename present', () => {
      const doc: DocumentNameFields = {
        filename: 'final-fallback.pdf',
      };

      expect(getDocumentDisplayName(doc)).toBe('final-fallback.pdf');
    });

    it('should prefer snake_case over camelCase when both present', () => {
      const doc: DocumentNameFields = {
        generated_title: 'Snake Case Title',
        generatedTitle: 'Camel Case Title',
        original_name: 'Snake Original',
        originalName: 'Camel Original',
      };

      expect(getDocumentDisplayName(doc)).toBe('Snake Case Title');
    });

    it('should fall through to camelCase when snake_case is null', () => {
      const doc: DocumentNameFields = {
        generated_title: null,
        generatedTitle: 'Camel Title',
        original_name: null,
        originalName: 'Camel Original',
      };

      expect(getDocumentDisplayName(doc)).toBe('Camel Title');
    });

    it('should use camelCase original_name when snake_case titles are null', () => {
      const doc: DocumentNameFields = {
        generated_title: null,
        generatedTitle: null,
        original_name: null,
        originalName: 'Camel Original',
      };

      expect(getDocumentDisplayName(doc)).toBe('Camel Original');
    });
  });

  describe('whitespace handling', () => {
    it('should skip whitespace-only generated_title', () => {
      const doc: DocumentNameFields = {
        generated_title: '   ',
        original_name: 'original.pdf',
        filename: 'system.pdf',
      };

      expect(getDocumentDisplayName(doc)).toBe('original.pdf');
    });

    it('should skip whitespace-only original_name', () => {
      const doc: DocumentNameFields = {
        original_name: '\t\n  ',
        filename: 'system.pdf',
      };

      expect(getDocumentDisplayName(doc)).toBe('system.pdf');
    });

    it('should skip whitespace-only filename', () => {
      const doc: DocumentNameFields = {
        filename: '   ',
      };

      expect(getDocumentDisplayName(doc)).toBe('Документ');
    });

    it('should trim whitespace from returned value', () => {
      const doc: DocumentNameFields = {
        generated_title: '  Title with spaces  ',
      };

      expect(getDocumentDisplayName(doc)).toBe('Title with spaces');
    });
  });

  describe('null and undefined handling', () => {
    it('should return fallback for null doc', () => {
      expect(getDocumentDisplayName(null)).toBe('Документ');
    });

    it('should return fallback for undefined doc', () => {
      expect(getDocumentDisplayName(undefined)).toBe('Документ');
    });

    it('should return fallback for empty doc', () => {
      const doc: DocumentNameFields = {};
      expect(getDocumentDisplayName(doc)).toBe('Документ');
    });

    it('should skip null generated_title', () => {
      const doc: DocumentNameFields = {
        generated_title: null,
        original_name: 'original.pdf',
      };

      expect(getDocumentDisplayName(doc)).toBe('original.pdf');
    });

    it('should skip undefined generated_title', () => {
      const doc: DocumentNameFields = {
        generated_title: undefined,
        original_name: 'original.pdf',
      };

      expect(getDocumentDisplayName(doc)).toBe('original.pdf');
    });

    it('should handle all fields null', () => {
      const doc: DocumentNameFields = {
        generated_title: null,
        original_name: null,
        filename: null,
      };

      expect(getDocumentDisplayName(doc)).toBe('Документ');
    });
  });

  describe('fallback parameter', () => {
    it('should use default fallback "Документ"', () => {
      expect(getDocumentDisplayName(null)).toBe('Документ');
    });

    it('should use custom fallback when provided', () => {
      expect(getDocumentDisplayName(null, 'Custom Fallback')).toBe('Custom Fallback');
    });

    it('should use custom fallback for empty doc', () => {
      const doc: DocumentNameFields = {};
      expect(getDocumentDisplayName(doc, 'No Name')).toBe('No Name');
    });

    it('should use custom fallback for all-null doc', () => {
      const doc: DocumentNameFields = {
        generated_title: null,
        original_name: null,
        filename: null,
      };
      expect(getDocumentDisplayName(doc, 'Unnamed')).toBe('Unnamed');
    });
  });
});

describe('hasHumanReadableName', () => {
  describe('returns true for human-readable names', () => {
    it('should return true for generated_title (snake_case)', () => {
      const doc: DocumentNameFields = {
        generated_title: 'AI Title',
        filename: 'system.pdf',
      };

      expect(hasHumanReadableName(doc)).toBe(true);
    });

    it('should return true for generatedTitle (camelCase)', () => {
      const doc: DocumentNameFields = {
        generatedTitle: 'AI Title',
        filename: 'system.pdf',
      };

      expect(hasHumanReadableName(doc)).toBe(true);
    });

    it('should return true for original_name (snake_case)', () => {
      const doc: DocumentNameFields = {
        original_name: 'user-upload.pdf',
        filename: 'system.pdf',
      };

      expect(hasHumanReadableName(doc)).toBe(true);
    });

    it('should return true for originalName (camelCase)', () => {
      const doc: DocumentNameFields = {
        originalName: 'user-upload.pdf',
        filename: 'system.pdf',
      };

      expect(hasHumanReadableName(doc)).toBe(true);
    });

    it('should prefer snake_case when both present', () => {
      const doc: DocumentNameFields = {
        generated_title: 'Snake Title',
        generatedTitle: null,
      };

      expect(hasHumanReadableName(doc)).toBe(true);
    });
  });

  describe('returns false for filename-only or null/undefined', () => {
    it('should return false for filename-only', () => {
      const doc: DocumentNameFields = {
        filename: 'system-123.pdf',
      };

      expect(hasHumanReadableName(doc)).toBe(false);
    });

    it('should return false for null doc', () => {
      expect(hasHumanReadableName(null)).toBe(false);
    });

    it('should return false for undefined doc', () => {
      expect(hasHumanReadableName(undefined)).toBe(false);
    });

    it('should return false for empty doc', () => {
      const doc: DocumentNameFields = {};
      expect(hasHumanReadableName(doc)).toBe(false);
    });

    it('should return false for whitespace-only generated_title', () => {
      const doc: DocumentNameFields = {
        generated_title: '   ',
        filename: 'system.pdf',
      };

      expect(hasHumanReadableName(doc)).toBe(false);
    });

    it('should return false for null generated_title and original_name', () => {
      const doc: DocumentNameFields = {
        generated_title: null,
        original_name: null,
        filename: 'system.pdf',
      };

      expect(hasHumanReadableName(doc)).toBe(false);
    });
  });

  describe('both snake_case and camelCase support', () => {
    it('should handle mix of snake_case and camelCase', () => {
      const doc: DocumentNameFields = {
        generated_title: null,
        generatedTitle: null,
        original_name: 'Original File',
        originalName: null,
      };

      expect(hasHumanReadableName(doc)).toBe(true);
    });

    it('should prioritize snake_case generated_title over camelCase', () => {
      const doc: DocumentNameFields = {
        generated_title: 'Valid Title',
        generatedTitle: null,
      };

      expect(hasHumanReadableName(doc)).toBe(true);
    });
  });
});

describe('truncateDisplayName', () => {
  describe('default maxLength=50', () => {
    it('should return unchanged for short string', () => {
      const short = 'Short name';
      expect(truncateDisplayName(short)).toBe('Short name');
    });

    it('should return unchanged for string exactly at maxLength', () => {
      const exact = 'A'.repeat(50);
      expect(truncateDisplayName(exact)).toBe(exact);
    });

    it('should truncate long string with "..."', () => {
      const long = 'A'.repeat(100);
      const result = truncateDisplayName(long);

      expect(result).toHaveLength(50);
      expect(result).toBe('A'.repeat(47) + '...');
    });

    it('should truncate at 51 characters', () => {
      const name = 'A'.repeat(51);
      const result = truncateDisplayName(name);

      expect(result).toHaveLength(50);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('custom maxLength', () => {
    it('should use custom maxLength=20', () => {
      const name = 'A'.repeat(30);
      const result = truncateDisplayName(name, 20);

      expect(result).toHaveLength(20);
      expect(result).toBe('A'.repeat(17) + '...');
    });

    it('should use custom maxLength=10', () => {
      const name = 'This is a very long name';
      const result = truncateDisplayName(name, 10);

      expect(result).toHaveLength(10);
      expect(result).toBe('This is...');
    });

    it('should return unchanged if shorter than custom maxLength', () => {
      const name = 'Short';
      expect(truncateDisplayName(name, 100)).toBe('Short');
    });

    it('should handle maxLength=3 (edge case)', () => {
      const name = 'Long name';
      const result = truncateDisplayName(name, 3);

      expect(result).toBe('...');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(truncateDisplayName('')).toBe('');
    });

    it('should return unchanged for string at boundary (maxLength - 1)', () => {
      const name = 'A'.repeat(49);
      expect(truncateDisplayName(name, 50)).toBe(name);
    });

    it('should handle unicode characters', () => {
      const name = '🔥'.repeat(60);
      const result = truncateDisplayName(name, 50);

      expect(result.length).toBeLessThanOrEqual(50);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle whitespace-only string', () => {
      const name = '   ';
      expect(truncateDisplayName(name)).toBe('   ');
    });
  });
});
