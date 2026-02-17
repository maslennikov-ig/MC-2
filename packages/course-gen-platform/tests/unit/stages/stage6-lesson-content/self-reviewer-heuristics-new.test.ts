import { describe, it, expect } from 'vitest';
import {
  extractForeignCharFragments,
  stripForeignScriptCharacters,
} from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics';

describe('extractForeignCharFragments', () => {
  describe('basic fragment extraction', () => {
    it('should extract individual CJK characters with surrounding Russian text', () => {
      const content = 'Текст с публичным обучением公司的 примером и продолжением.';
      const scriptsFound = ['CJK'];

      const result = extractForeignCharFragments(content, scriptsFound);

      // Each CJK character is extracted separately
      expect(result).toHaveLength(3);
      // All fragments should contain the CJK characters
      expect(result.some(r => r.fragment.includes('公'))).toBe(true);
      expect(result.some(r => r.fragment.includes('司'))).toBe(true);
      expect(result.some(r => r.fragment.includes('的'))).toBe(true);
      // Each should have surrounding context
      expect(result[0].fragment).toContain('обучением');
      expect(result[0].context).toContain('Текст с');
      expect(result[0].scriptTypes).toEqual(['CJK']);
    });

    it('should extract multiple CJK character groups from different places', () => {
      const content =
        'Первая часть с公司 текстом. Вторая часть содержит汉字 символы. Третья часть чистая.';
      const scriptsFound = ['CJK'];

      const result = extractForeignCharFragments(content, scriptsFound);

      // 公司 = 2 chars, 汉字 = 2 chars = 4 total
      expect(result).toHaveLength(4);
      expect(result.some(r => r.fragment.includes('公'))).toBe(true);
      expect(result.some(r => r.fragment.includes('司'))).toBe(true);
      expect(result.some(r => r.fragment.includes('汉'))).toBe(true);
      expect(result.some(r => r.fragment.includes('字'))).toBe(true);
      expect(result[0].scriptTypes).toEqual(['CJK']);
      expect(result[3].scriptTypes).toEqual(['CJK']);
    });

    it('should handle multiple script types in same content', () => {
      const content = 'Текст с公司的 CJK и العربية ARABIC символами.';
      const scriptsFound = ['CJK', 'ARABIC'];

      const result = extractForeignCharFragments(content, scriptsFound);

      // 公司的 = 3 CJK, العربية = 7 ARABIC chars = 10 total
      expect(result.length).toBeGreaterThanOrEqual(10);

      // Check we have both script types
      const cjkFragments = result.filter(r => r.scriptTypes.includes('CJK'));
      const arabicFragments = result.filter(r => r.scriptTypes.includes('ARABIC'));

      expect(cjkFragments.length).toBeGreaterThan(0);
      expect(arabicFragments.length).toBeGreaterThan(0);

      expect(cjkFragments.some(r => r.fragment.includes('公'))).toBe(true);
      expect(arabicFragments.some(r => r.fragment.includes('ا'))).toBe(true);
    });
  });

  describe('code block exclusion', () => {
    it('should exclude CJK inside code blocks from extraction', () => {
      const content = `
Текст перед кодом.

\`\`\`python
# Comment with 公司的 CJK chars
print("公司")
\`\`\`

Текст после кода.
      `.trim();
      const scriptsFound = ['CJK'];

      const result = extractForeignCharFragments(content, scriptsFound);

      expect(result).toHaveLength(0);
    });

    it('should exclude CJK inside inline code', () => {
      const content = 'Текст с инлайн кодом `公司的` без обнаружения.';
      const scriptsFound = ['CJK'];

      const result = extractForeignCharFragments(content, scriptsFound);

      expect(result).toHaveLength(0);
    });

    it('should extract CJK from prose but skip code blocks', () => {
      const content = `
Текст с公司 в прозе.

\`\`\`js
const code = "公司的";
\`\`\`

Еще текст без проблем.
      `.trim();
      const scriptsFound = ['CJK'];

      const result = extractForeignCharFragments(content, scriptsFound);

      // 公司 = 2 CJK characters in prose (code block excluded)
      expect(result).toHaveLength(2);
      expect(result.some(r => r.fragment.includes('公'))).toBe(true);
      expect(result.some(r => r.fragment.includes('司'))).toBe(true);
      expect(result[0].fragment).not.toContain('const code');
    });
  });

  describe('edge cases', () => {
    it('should return empty array when scriptsFound is empty', () => {
      const content = 'Текст с公司的 примером.';
      const scriptsFound: string[] = [];

      const result = extractForeignCharFragments(content, scriptsFound);

      expect(result).toEqual([]);
    });

    it('should return empty array for unknown script key', () => {
      const content = 'Текст с公司的 примером.';
      const scriptsFound = ['UNKNOWN_SCRIPT'];

      const result = extractForeignCharFragments(content, scriptsFound);

      expect(result).toEqual([]);
    });

    it('should return empty array when no foreign chars found', () => {
      const content = 'Чистый русский текст без иностранных символов.';
      const scriptsFound = ['CJK', 'ARABIC'];

      const result = extractForeignCharFragments(content, scriptsFound);

      expect(result).toEqual([]);
    });

    it('should handle fragment near start of content', () => {
      const content = '公司的 начало текста с продолжением далее.';
      const scriptsFound = ['CJK'];

      const result = extractForeignCharFragments(content, scriptsFound);

      // 公司的 = 3 CJK characters
      expect(result).toHaveLength(3);
      expect(result.some(r => r.fragment.includes('公'))).toBe(true);
      expect(result[0].fragment).toContain('начало');
    });

    it('should handle fragment near end of content', () => {
      const content = 'Длинный текст который заканчивается на公司的';
      const scriptsFound = ['CJK'];

      const result = extractForeignCharFragments(content, scriptsFound);

      // 公司的 = 3 CJK characters
      expect(result).toHaveLength(3);
      expect(result.some(r => r.fragment.includes('公'))).toBe(true);
      expect(result[0].fragment).toContain('заканчивается');
    });
  });

  describe('fragment and context boundaries', () => {
    it('should extract fragment with max 20 chars before and after', () => {
      const longPrefix = 'А'.repeat(50);
      const longSuffix = 'Б'.repeat(50);
      const content = `${longPrefix}公司${longSuffix}`;
      const scriptsFound = ['CJK'];

      const result = extractForeignCharFragments(content, scriptsFound);

      // 公司 = 2 CJK characters
      expect(result).toHaveLength(2);
      // Fragment should be trimmed to ~40 chars + foreign char
      expect(result[0].fragment.length).toBeLessThan(50);
      expect(result.some(r => r.fragment.includes('公'))).toBe(true);
    });

    it('should extract context with max 75 chars before and after', () => {
      const longPrefix = 'А'.repeat(100);
      const longSuffix = 'Б'.repeat(100);
      const content = `${longPrefix}公司${longSuffix}`;
      const scriptsFound = ['CJK'];

      const result = extractForeignCharFragments(content, scriptsFound);

      // 公司 = 2 CJK characters
      expect(result).toHaveLength(2);
      // Context should be broader than fragment but still limited
      expect(result[0].context.length).toBeGreaterThan(result[0].fragment.length);
      expect(result[0].context.length).toBeLessThan(200);
      expect(result.some(r => r.context.includes('公'))).toBe(true);
    });
  });
});

describe('stripForeignScriptCharacters', () => {
  describe('basic CJK removal', () => {
    it('should remove CJK from Russian text', () => {
      const content = 'Текст с公司的 примером';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe('Текст с примером');
      expect(result.fixCount).toBe(1);
    });

    it('should remove multiple CJK fragments with correct fixCount', () => {
      const content = 'Первая公司 часть и вторая汉字 часть текста';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe('Первая часть и вторая часть текста');
      expect(result.fixCount).toBe(2);
    });

    it('should remove consecutive CJK characters as single fragment', () => {
      const content = 'Текст с公司的企业 длинным фрагментом';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe('Текст с длинным фрагментом');
      expect(result.fixCount).toBe(1);
    });
  });

  describe('ARABIC removal', () => {
    it('should remove ARABIC from Russian text', () => {
      const content = 'Текст сالعربية арабскими символами';
      const scriptsToStrip = ['ARABIC'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe('Текст с арабскими символами');
      expect(result.fixCount).toBe(1);
    });

    it('should handle mixed CJK and ARABIC removal', () => {
      const content = 'Текст с公司 и العربية символами';
      const scriptsToStrip = ['CJK', 'ARABIC'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe('Текст с и символами');
      expect(result.fixCount).toBe(2);
    });
  });

  describe('code block preservation', () => {
    it('should preserve CJK inside code blocks', () => {
      const content = `
Текст перед кодом.

\`\`\`python
# Comment with 公司的 CJK chars
print("公司")
\`\`\`

Текст после кода.
      `.trim();
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toContain('公司的');
      expect(result.content).toContain('print("公司")');
      expect(result.fixCount).toBe(0);
    });

    it('should preserve CJK inside inline code', () => {
      const content = 'Текст с инлайн `公司的` кодом';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toContain('`公司的`');
      expect(result.fixCount).toBe(0);
    });

    it('should remove CJK from prose but preserve in code', () => {
      const content = `
Текст с公司 в прозе.

\`\`\`js
const code = "公司的";
\`\`\`

Еще текст汉字 в прозе.
      `.trim();
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      // Prose CJK should be removed (check the specific prose sentences)
      expect(result.content).toContain('Текст с в прозе');
      expect(result.content).toContain('Еще текст в прозе');

      // Code block should be preserved with all CJK chars intact
      expect(result.content).toContain('const code = "公司的"');

      // The prose versions should NOT exist (with CJK in prose context)
      const lines = result.content.split('\n');
      const proseLines = lines.filter(
        line => !line.includes('```') && !line.includes('const code')
      );
      const proseText = proseLines.join('\n');
      expect(proseText).not.toContain('公司');
      expect(proseText).not.toContain('汉字');

      // 公司 = 1 match, 汉字 = 1 match
      expect(result.fixCount).toBe(2);
    });
  });

  describe('LaTeX preservation', () => {
    it('should preserve CJK inside LaTeX block ($$...$$)', () => {
      const content = 'Формула $$公司的 = x + y$$ здесь';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toContain('$$公司的 = x + y$$');
      expect(result.fixCount).toBe(0);
    });

    it('should preserve CJK inside LaTeX inline ($...$)', () => {
      const content = 'Формула $公司的 = x$ в тексте';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toContain('$公司的 = x$');
      expect(result.fixCount).toBe(0);
    });

    it('should remove CJK from prose but preserve in LaTeX', () => {
      const content = 'Текст с公司 и формула $$汉字 = 1$$ и еще文字 текст';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).not.toContain('с公司');
      expect(result.content).toContain('$$汉字 = 1$$');
      expect(result.content).not.toContain('еще文字');
      expect(result.fixCount).toBe(2);
    });
  });

  describe('whitespace cleanup', () => {
    it('should clean up double spaces after removal', () => {
      const content = 'Текст  с  公司的  множественными  пробелами';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).not.toContain('  ');
      expect(result.content).toBe('Текст с множественными пробелами');
    });

    it('should remove space before punctuation', () => {
      const content = 'Текст с公司的 , запятой и公司的 . точкой';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe('Текст с, запятой и. точкой');
      expect(result.content).not.toContain(' ,');
      expect(result.content).not.toContain(' .');
    });

    it('should clean up multiple newlines', () => {
      const content = 'Текст\n\n\n公司的\n\n\n\nпродолжение';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).not.toContain('\n\n\n');
      expect(result.content).toBe('Текст\n\nпродолжение');
    });

    it('should handle complex whitespace cleanup scenario', () => {
      const content = 'Слово公司的  ,  еще汉字  .  конец';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe('Слово, еще. конец');
    });
  });

  describe('edge cases', () => {
    it('should return unchanged content when scriptsToStrip is empty', () => {
      const content = 'Текст с公司的 примером';
      const scriptsToStrip: string[] = [];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe(content);
      expect(result.fixCount).toBe(0);
    });

    it('should return unchanged content when no foreign chars found', () => {
      const content = 'Чистый русский текст';
      const scriptsToStrip = ['CJK', 'ARABIC'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe(content);
      expect(result.fixCount).toBe(0);
    });

    it('should handle unknown script key gracefully', () => {
      const content = 'Текст с公司的 примером';
      const scriptsToStrip = ['UNKNOWN_SCRIPT'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe(content);
      expect(result.fixCount).toBe(0);
    });

    it('should trim leading and trailing whitespace', () => {
      const content = '   Текст с公司的 примером   ';
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toBe('Текст с примером');
      expect(result.content).not.toMatch(/^\s/);
      expect(result.content).not.toMatch(/\s$/);
    });
  });

  describe('complex scenarios', () => {
    it('should handle all protected structures simultaneously', () => {
      const content = `
Текст с公司 в прозе.

\`\`\`python
code_with_公司的 = True
\`\`\`

Inline \`公司\` code.

Формула $$公司的 = x$$ здесь.

Inline formula $汉字$ тоже.

Еще公司的 в прозе.
      `.trim();
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      // Prose CJK removed
      expect(result.content).not.toContain('Текст с公司');
      expect(result.content).not.toContain('Еще公司的');

      // Code block preserved
      expect(result.content).toContain('code_with_公司的 = True');

      // Inline code preserved
      expect(result.content).toContain('`公司`');

      // LaTeX block preserved
      expect(result.content).toContain('$$公司的 = x$$');

      // LaTeX inline preserved
      expect(result.content).toContain('$汉字$');

      expect(result.fixCount).toBe(2);
    });

    it('should handle nested markdown structures', () => {
      const content = `
## Раздел с公司 заголовком

- Список с汉字 элементами
- Другой элемент

> Цитата с文字 текстом

\`\`\`js
// Code公司
\`\`\`
      `.trim();
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).toContain('## Раздел с заголовком');
      expect(result.content).toContain('- Список с элементами');
      expect(result.content).toContain('> Цитата с текстом');
      expect(result.content).toContain('// Code公司');
      expect(result.fixCount).toBe(3);
    });

    it('should handle multiple script types with selective removal', () => {
      const content = 'Текст с公司 CJK и العربية ARABIC и देवनागरी DEVANAGARI';
      const scriptsToStrip = ['CJK', 'ARABIC']; // Only remove CJK and ARABIC

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      expect(result.content).not.toContain('公司');
      expect(result.content).not.toContain('العربية');
      expect(result.content).toContain('देवनागरी'); // DEVANAGARI preserved
      expect(result.fixCount).toBe(2);
    });
  });

  describe('real-world markdown scenarios', () => {
    it('should handle realistic lesson content', () => {
      const content = `
# Урок 1: Введение

Добро пожаловать в курс по программированию公司的.

## Основы

Мы изучим следующие темы汉字:

1. Переменные
2. Функции公司
3. Классы

\`\`\`python
def example公司():
    return "Hello公司"
\`\`\`

Формула: $E = mc^2公司$

**Важно公司的**: Практикуйтесь каждый день.
      `.trim();
      const scriptsToStrip = ['CJK'];

      const result = stripForeignScriptCharacters(content, scriptsToStrip);

      // Prose cleaned
      expect(result.content).toContain('программированию.');
      expect(result.content).toContain('темы:');
      expect(result.content).toContain('Функции');
      expect(result.content).toContain('**Важно**:');

      // Code preserved
      expect(result.content).toContain('def example公司()');
      expect(result.content).toContain('return "Hello公司"');

      // LaTeX preserved
      expect(result.content).toContain('$E = mc^2公司$');

      expect(result.fixCount).toBe(4);
    });
  });
});
