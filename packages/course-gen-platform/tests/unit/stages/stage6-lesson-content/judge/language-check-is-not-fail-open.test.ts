/**
 * Regression: an unlisted language must not switch the language check off.
 *
 * `LANGUAGE_UNEXPECTED_SCRIPTS` held `ru`, `en` and `zh`, and the lookup was
 * `TABLE[lang] || []`. Spanish is a language this product offers and was not in
 * the table, so the loop over "unexpected scripts" ran zero times and
 * `checkLanguageConsistency` returned `passed: true` for any content at all.
 *
 * That is the drift-gate shape: absent configuration reading as "nothing is
 * wrong". The tests below are written against content that is unambiguously
 * broken, so they say something about the check rather than about the text
 * (mc2-v6fqp).
 */

import { describe, expect, it } from 'vitest';
import { checkLanguageConsistency } from '@/stages/stage6-lesson-content/judge/filters/content-quality';

/** A Spanish lesson with a paragraph of Chinese in the middle of the prose. */
const SPANISH_WITH_CHINESE = `
# El fondo de emergencia

El fondo de emergencia cubre los gastos obligatorios del hogar cuando se
interrumpe el ingreso principal. 应急基金用于支付家庭的必要开支，当主要收入
中断时使用。它不是投资工具，也不用于获取收益。

Se recomienda mantener entre tres y seis meses de gastos.
`;

/** The same lesson, clean. */
const SPANISH_CLEAN = `
# El fondo de emergencia

El fondo de emergencia cubre los gastos obligatorios del hogar cuando se
interrumpe el ingreso principal. No es un instrumento de inversión.

Se recomienda mantener entre tres y seis meses de gastos. Usa una cuenta de
ahorro con retiro parcial, no una cuenta de corretaje.
`;

describe('Spanish is checked, not waved through', () => {
  it('fails a Spanish lesson carrying Chinese prose', () => {
    const result = checkLanguageConsistency(SPANISH_WITH_CHINESE, 'es');

    expect(result.passed).toBe(false);
    expect(result.scriptsFound).toContain('CJK');
    expect(result.foreignCharacters).toBeGreaterThan(20);
    // CJK is a zero-tolerance script, so this is critical, not a typo.
    expect(result.failure?.severity).toBe('critical');
  });

  it('fails a Spanish lesson carrying Cyrillic prose', () => {
    const result = checkLanguageConsistency(
      'El fondo de emergencia cubre los gastos обязательные расходы домохозяйства.',
      'es'
    );

    expect(result.passed).toBe(false);
    expect(result.scriptsFound).toContain('CYRILLIC');
  });

  it('passes clean Spanish', () => {
    const result = checkLanguageConsistency(SPANISH_CLEAN, 'es');

    expect(result.passed).toBe(true);
    expect(result.foreignCharacters).toBe(0);
    expect(result.unconfiguredLanguage).toBe(false);
  });
});

describe('the languages that already worked still work the same way', () => {
  it('still flags Chinese inside Russian', () => {
    const result = checkLanguageConsistency(
      'Резервный фонд покрывает обязательные расходы. 应急基金用于支付家庭的必要开支。',
      'ru'
    );

    expect(result.passed).toBe(false);
    expect(result.scriptsFound).toContain('CJK');
  });

  it('still tolerates Latin technical terms inside Russian', () => {
    const result = checkLanguageConsistency(
      'Запрос уходит по протоколу HTTP на endpoint платёжного провайдера через REST API.',
      'ru'
    );

    expect(result.passed).toBe(true);
    expect(result.scriptsFound).not.toContain('LATIN');
  });

  it('still flags Cyrillic inside English', () => {
    const result = checkLanguageConsistency(
      'The emergency fund covers обязательные расходы of the household.',
      'en'
    );

    expect(result.passed).toBe(false);
    expect(result.scriptsFound).toContain('CYRILLIC');
  });

  it('does not call Chinese characters foreign in a Chinese lesson', () => {
    const result = checkLanguageConsistency(
      '应急基金用于支付家庭的必要开支，当主要收入中断时使用。它不是投资工具。',
      'zh'
    );

    expect(result.passed).toBe(true);
    expect(result.foreignCharacters).toBe(0);
  });

  it('flags Cyrillic inside a Chinese lesson', () => {
    const result = checkLanguageConsistency(
      '应急基金用于支付家庭的必要开支，обязательные расходы домохозяйства。',
      'zh'
    );

    expect(result.passed).toBe(false);
    expect(result.scriptsFound).toContain('CYRILLIC');
  });
});

describe('a language nobody configured', () => {
  it('is reported rather than passed in silence', () => {
    // Swahili has no entry. It is Latin-script in practice, so the check is
    // treated as Latin-based — but the caller is told the answer is weaker.
    const result = checkLanguageConsistency('Hazina ya dharura inagharamia matumizi.', 'sw');

    expect(result.unconfiguredLanguage).toBe(true);
    // Weaker does not mean absent: Chinese in Swahili is still caught.
    const contaminated = checkLanguageConsistency('Hazina ya dharura 应急基金用于支付。', 'sw');
    expect(contaminated.passed).toBe(false);
    expect(contaminated.scriptsFound).toContain('CJK');
  });

  it('does not claim to be configured when it is', () => {
    expect(checkLanguageConsistency('Hello world', 'en').unconfiguredLanguage).toBe(false);
  });
});

describe('code blocks are still excluded', () => {
  it('ignores a fenced block full of Chinese identifiers', () => {
    const content = [
      'El siguiente ejemplo muestra la configuración.',
      '```json',
      '{ "标题": "应急基金", "月数": 6 }',
      '```',
      'Guarda el archivo y reinicia el servicio.',
    ].join('\n');

    expect(checkLanguageConsistency(content, 'es').passed).toBe(true);
  });
});
