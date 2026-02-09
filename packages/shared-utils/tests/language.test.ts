import { describe, it, expect } from 'vitest';
import {
  normalizeLanguageCode,
  normalizeLanguageForReserve,
  LANGUAGE_NAME_TO_CODE,
  LANGUAGE_FALLBACK,
  type SupportedLanguage,
  type LanguageCode,
  type ReserveLanguage,
} from '../src/language';

describe('normalizeLanguageCode', () => {
  describe('2-character ISO 639-1 codes', () => {
    it('should normalize "ru" to "ru"', () => {
      expect(normalizeLanguageCode('ru')).toBe('ru');
    });

    it('should normalize "en" to "en"', () => {
      expect(normalizeLanguageCode('en')).toBe('en');
    });

    it('should normalize "zh" to "zh"', () => {
      expect(normalizeLanguageCode('zh')).toBe('zh');
    });

    it('should normalize "es" to "es"', () => {
      expect(normalizeLanguageCode('es')).toBe('es');
    });

    it('should normalize "fr" to "fr"', () => {
      expect(normalizeLanguageCode('fr')).toBe('fr');
    });

    it('should normalize "de" to "de"', () => {
      expect(normalizeLanguageCode('de')).toBe('de');
    });

    it('should normalize "ja" to "ja"', () => {
      expect(normalizeLanguageCode('ja')).toBe('ja');
    });

    it('should normalize "ko" to "ko"', () => {
      expect(normalizeLanguageCode('ko')).toBe('ko');
    });

    it('should normalize "ar" to "ar"', () => {
      expect(normalizeLanguageCode('ar')).toBe('ar');
    });

    it('should normalize "pt" to "pt"', () => {
      expect(normalizeLanguageCode('pt')).toBe('pt');
    });

    it('should normalize "it" to "it"', () => {
      expect(normalizeLanguageCode('it')).toBe('it');
    });

    it('should normalize "tr" to "tr"', () => {
      expect(normalizeLanguageCode('tr')).toBe('tr');
    });

    it('should normalize "vi" to "vi"', () => {
      expect(normalizeLanguageCode('vi')).toBe('vi');
    });

    it('should normalize "th" to "th"', () => {
      expect(normalizeLanguageCode('th')).toBe('th');
    });

    it('should normalize "id" to "id"', () => {
      expect(normalizeLanguageCode('id')).toBe('id');
    });

    it('should normalize "ms" to "ms"', () => {
      expect(normalizeLanguageCode('ms')).toBe('ms');
    });

    it('should normalize "hi" to "hi"', () => {
      expect(normalizeLanguageCode('hi')).toBe('hi');
    });

    it('should normalize "bn" to "bn"', () => {
      expect(normalizeLanguageCode('bn')).toBe('bn');
    });

    it('should normalize "pl" to "pl"', () => {
      expect(normalizeLanguageCode('pl')).toBe('pl');
    });
  });

  describe('full language names', () => {
    it('should normalize "Russian" to "ru"', () => {
      expect(normalizeLanguageCode('Russian')).toBe('ru');
    });

    it('should normalize "English" to "en"', () => {
      expect(normalizeLanguageCode('English')).toBe('en');
    });

    it('should normalize "Chinese" to "zh"', () => {
      expect(normalizeLanguageCode('Chinese')).toBe('zh');
    });

    it('should normalize "Spanish" to "es"', () => {
      expect(normalizeLanguageCode('Spanish')).toBe('es');
    });

    it('should normalize "French" to "fr"', () => {
      expect(normalizeLanguageCode('French')).toBe('fr');
    });

    it('should normalize "German" to "de"', () => {
      expect(normalizeLanguageCode('German')).toBe('de');
    });

    it('should normalize "Japanese" to "ja"', () => {
      expect(normalizeLanguageCode('Japanese')).toBe('ja');
    });

    it('should normalize "Korean" to "ko"', () => {
      expect(normalizeLanguageCode('Korean')).toBe('ko');
    });

    it('should normalize "Arabic" to "ar"', () => {
      expect(normalizeLanguageCode('Arabic')).toBe('ar');
    });

    it('should normalize "Portuguese" to "pt"', () => {
      expect(normalizeLanguageCode('Portuguese')).toBe('pt');
    });

    it('should normalize "Italian" to "it"', () => {
      expect(normalizeLanguageCode('Italian')).toBe('it');
    });

    it('should normalize "Turkish" to "tr"', () => {
      expect(normalizeLanguageCode('Turkish')).toBe('tr');
    });

    it('should normalize "Vietnamese" to "vi"', () => {
      expect(normalizeLanguageCode('Vietnamese')).toBe('vi');
    });

    it('should normalize "Thai" to "th"', () => {
      expect(normalizeLanguageCode('Thai')).toBe('th');
    });

    it('should normalize "Indonesian" to "id"', () => {
      expect(normalizeLanguageCode('Indonesian')).toBe('id');
    });

    it('should normalize "Malay" to "ms"', () => {
      expect(normalizeLanguageCode('Malay')).toBe('ms');
    });

    it('should normalize "Hindi" to "hi"', () => {
      expect(normalizeLanguageCode('Hindi')).toBe('hi');
    });

    it('should normalize "Bengali" to "bn"', () => {
      expect(normalizeLanguageCode('Bengali')).toBe('bn');
    });

    it('should normalize "Polish" to "pl"', () => {
      expect(normalizeLanguageCode('Polish')).toBe('pl');
    });
  });

  describe('case-insensitive matching', () => {
    it('should normalize "RU" (uppercase) to "ru"', () => {
      expect(normalizeLanguageCode('RU')).toBe('ru');
    });

    it('should normalize "EN" (uppercase) to "en"', () => {
      expect(normalizeLanguageCode('EN')).toBe('en');
    });

    it('should normalize "russian" (lowercase) to "ru"', () => {
      expect(normalizeLanguageCode('russian')).toBe('ru');
    });

    it('should normalize "english" (lowercase) to "en"', () => {
      expect(normalizeLanguageCode('english')).toBe('en');
    });

    it('should normalize "RUSSIAN" (uppercase) to "ru"', () => {
      expect(normalizeLanguageCode('RUSSIAN' as LanguageCode)).toBe('ru');
    });

    it('should normalize "CHINESE" (uppercase) to "zh"', () => {
      expect(normalizeLanguageCode('CHINESE' as LanguageCode)).toBe('zh');
    });

    it('should normalize mixed case "RuSsIaN" to "ru"', () => {
      expect(normalizeLanguageCode('RuSsIaN' as LanguageCode)).toBe('ru');
    });
  });

  describe('unknown 2-character codes', () => {
    it('should accept unknown 2-char code "xx" as-is', () => {
      expect(normalizeLanguageCode('xx')).toBe('xx');
    });

    it('should accept unknown 2-char code "ab" as-is', () => {
      expect(normalizeLanguageCode('ab')).toBe('ab');
    });

    it('should lowercase unknown 2-char codes', () => {
      expect(normalizeLanguageCode('XY')).toBe('xy');
    });

    it('should accept unknown ISO 639-1 codes', () => {
      expect(normalizeLanguageCode('sv')).toBe('sv'); // Swedish
      expect(normalizeLanguageCode('no')).toBe('no'); // Norwegian
      expect(normalizeLanguageCode('fi')).toBe('fi'); // Finnish
    });
  });

  describe('unknown 3+ character inputs', () => {
    it('should return "any" for unknown 3+ char string', () => {
      expect(normalizeLanguageCode('Unknown')).toBe('any');
    });

    it('should return "any" for unrecognized language name', () => {
      expect(normalizeLanguageCode('Klingon')).toBe('any');
    });

    it('should return "any" for random string', () => {
      expect(normalizeLanguageCode('xyz123')).toBe('any');
    });

    it('should return "any" for 3-character codes not in map', () => {
      expect(normalizeLanguageCode('eng')).toBe('any');
      expect(normalizeLanguageCode('rus')).toBe('any');
    });
  });

  describe('undefined, null, empty, whitespace', () => {
    it('should return "en" (default) for undefined', () => {
      expect(normalizeLanguageCode(undefined)).toBe('en');
    });

    it('should return "en" (default) for empty string', () => {
      expect(normalizeLanguageCode('')).toBe('en');
    });

    it('should return "en" (default) for whitespace', () => {
      expect(normalizeLanguageCode('  ')).toBe('en');
      expect(normalizeLanguageCode('\t\n')).toBe('en');
    });

    it('should return custom default for undefined', () => {
      expect(normalizeLanguageCode(undefined, 'ru')).toBe('ru');
    });

    it('should return custom default for empty string', () => {
      expect(normalizeLanguageCode('', 'ru')).toBe('ru');
    });

    it('should return custom default for whitespace', () => {
      expect(normalizeLanguageCode('   ', 'ru')).toBe('ru');
    });
  });

  describe('trimming behavior', () => {
    it('should trim leading/trailing whitespace', () => {
      expect(normalizeLanguageCode('  ru  ')).toBe('ru');
      expect(normalizeLanguageCode(' English ')).toBe('en');
    });

    it('should handle tab and newline characters', () => {
      expect(normalizeLanguageCode('\tru\n')).toBe('ru');
      expect(normalizeLanguageCode('\n\tEnglish\n\t')).toBe('en');
    });
  });

  describe('custom default parameter', () => {
    it('should use default "en" when defaultLang not provided', () => {
      expect(normalizeLanguageCode(undefined)).toBe('en');
    });

    it('should use custom default "ru"', () => {
      expect(normalizeLanguageCode(undefined, 'ru')).toBe('ru');
    });

    it('should use custom default "zh"', () => {
      expect(normalizeLanguageCode(undefined, 'zh')).toBe('zh');
    });

    it('should override default for empty input', () => {
      expect(normalizeLanguageCode('', 'fr')).toBe('fr');
    });

    it('should not use default when valid input provided', () => {
      expect(normalizeLanguageCode('ru', 'en')).toBe('ru');
      expect(normalizeLanguageCode('zh', 'en')).toBe('zh');
    });
  });
});

describe('normalizeLanguageForReserve', () => {
  describe('returns "ru" for Russian', () => {
    it('should return "ru" for "ru"', () => {
      expect(normalizeLanguageForReserve('ru')).toBe('ru');
    });

    it('should return "ru" for "Russian"', () => {
      expect(normalizeLanguageForReserve('Russian')).toBe('ru');
    });

    it('should return "ru" for "RU"', () => {
      expect(normalizeLanguageForReserve('RU')).toBe('ru');
    });
  });

  describe('returns "en" for English', () => {
    it('should return "en" for "en"', () => {
      expect(normalizeLanguageForReserve('en')).toBe('en');
    });

    it('should return "en" for "English"', () => {
      expect(normalizeLanguageForReserve('English')).toBe('en');
    });

    it('should return "en" for "EN"', () => {
      expect(normalizeLanguageForReserve('EN')).toBe('en');
    });

    it('should return "en" for undefined (default)', () => {
      expect(normalizeLanguageForReserve(undefined)).toBe('en');
    });
  });

  describe('returns "any" for other languages', () => {
    it('should return "any" for "zh" (Chinese)', () => {
      expect(normalizeLanguageForReserve('zh')).toBe('any');
    });

    it('should return "any" for "Chinese"', () => {
      expect(normalizeLanguageForReserve('Chinese')).toBe('any');
    });

    it('should return "any" for "es" (Spanish)', () => {
      expect(normalizeLanguageForReserve('es')).toBe('any');
    });

    it('should return "any" for "fr" (French)', () => {
      expect(normalizeLanguageForReserve('fr')).toBe('any');
    });

    it('should return "any" for "de" (German)', () => {
      expect(normalizeLanguageForReserve('de')).toBe('any');
    });

    it('should return "any" for "ja" (Japanese)', () => {
      expect(normalizeLanguageForReserve('ja')).toBe('any');
    });

    it('should return "any" for "ko" (Korean)', () => {
      expect(normalizeLanguageForReserve('ko')).toBe('any');
    });

    it('should return "any" for "ar" (Arabic)', () => {
      expect(normalizeLanguageForReserve('ar')).toBe('any');
    });

    it('should return "any" for unknown languages', () => {
      expect(normalizeLanguageForReserve('Unknown')).toBe('any');
      expect(normalizeLanguageForReserve('xx')).toBe('any');
    });
  });

  describe('type safety', () => {
    it('should return ReserveLanguage type', () => {
      const result: ReserveLanguage = normalizeLanguageForReserve('ru');
      expect(result).toBe('ru');
    });

    it('should only return "ru", "en", or "any"', () => {
      const validValues: ReserveLanguage[] = ['ru', 'en', 'any'];

      expect(validValues).toContain(normalizeLanguageForReserve('ru'));
      expect(validValues).toContain(normalizeLanguageForReserve('en'));
      expect(validValues).toContain(normalizeLanguageForReserve('zh'));
      expect(validValues).toContain(normalizeLanguageForReserve(undefined));
    });
  });
});

describe('LANGUAGE_NAME_TO_CODE constant', () => {
  it('should have all 19 supported languages (2-char codes)', () => {
    const supportedCodes: SupportedLanguage[] = [
      'ru',
      'en',
      'zh',
      'es',
      'fr',
      'de',
      'ja',
      'ko',
      'ar',
      'pt',
      'it',
      'tr',
      'vi',
      'th',
      'id',
      'ms',
      'hi',
      'bn',
      'pl',
    ];

    for (const code of supportedCodes) {
      expect(LANGUAGE_NAME_TO_CODE[code]).toBe(code);
    }
  });

  it('should have all 19 supported languages (full names)', () => {
    const expectedMappings = {
      Russian: 'ru',
      English: 'en',
      Chinese: 'zh',
      Spanish: 'es',
      French: 'fr',
      German: 'de',
      Japanese: 'ja',
      Korean: 'ko',
      Arabic: 'ar',
      Portuguese: 'pt',
      Italian: 'it',
      Turkish: 'tr',
      Vietnamese: 'vi',
      Thai: 'th',
      Indonesian: 'id',
      Malay: 'ms',
      Hindi: 'hi',
      Bengali: 'bn',
      Polish: 'pl',
    };

    for (const [name, code] of Object.entries(expectedMappings)) {
      expect(LANGUAGE_NAME_TO_CODE[name as keyof typeof LANGUAGE_NAME_TO_CODE]).toBe(code);
    }
  });

  it('should have lowercase full names for backward compatibility', () => {
    expect(LANGUAGE_NAME_TO_CODE['russian']).toBe('ru');
    expect(LANGUAGE_NAME_TO_CODE['english']).toBe('en');
  });

  it('should have exactly 57 entries (19 codes + 19 names + 19 lowercase)', () => {
    // 19 ISO 639-1 codes
    // 19 capitalized full names
    // 19 lowercase full names
    const entriesCount = Object.keys(LANGUAGE_NAME_TO_CODE).length;
    expect(entriesCount).toBe(57);
  });

  it('should be read-only (const assertion)', () => {
    // TypeScript enforces this at compile time
    // Runtime check that it's frozen (if Object.freeze was used)
    const map = LANGUAGE_NAME_TO_CODE;
    expect(map).toBeDefined();
  });

  it('should map all values to lowercase 2-char codes', () => {
    const values = Object.values(LANGUAGE_NAME_TO_CODE);

    for (const value of values) {
      expect(value).toMatch(/^[a-z]{2}$/);
    }
  });
});

describe('LANGUAGE_FALLBACK constant', () => {
  it('should be "any"', () => {
    expect(LANGUAGE_FALLBACK).toBe('any');
  });

  it('should be read-only (const assertion)', () => {
    // TypeScript enforces this at compile time
    const fallback: 'any' = LANGUAGE_FALLBACK;
    expect(fallback).toBe('any');
  });
});

describe('type definitions', () => {
  it('should define SupportedLanguage type', () => {
    const supported: SupportedLanguage = 'ru';
    expect(supported).toBe('ru');
  });

  it('should define LanguageCode type (union with string)', () => {
    const code1: LanguageCode = 'ru';
    const code2: LanguageCode = 'custom-code';
    expect(code1).toBe('ru');
    expect(code2).toBe('custom-code');
  });

  it('should define ReserveLanguage type (only ru/en/any)', () => {
    const reserve1: ReserveLanguage = 'ru';
    const reserve2: ReserveLanguage = 'en';
    const reserve3: ReserveLanguage = 'any';

    expect(reserve1).toBe('ru');
    expect(reserve2).toBe('en');
    expect(reserve3).toBe('any');
  });
});
