/**
 * Regression: the ratio table is reached by every language, not two (mc2-v6fqp).
 *
 * `LANGUAGE_RATIOS` has carried `spa: 4.3` and `cmn: 2.0` all along. Three call
 * sites never asked for them, writing `language === 'ru' ? 'rus' : 'eng'`, and a
 * fourth passed the ISO 639-1 code straight in — where it matches no key at all,
 * so even Russian silently got the 4.0 default instead of its own 3.2.
 *
 * The Chinese case is the one that costs something visible: 4.0 against 2.0 is
 * an estimate at half the text's real token count, so every budget derived from
 * it is half the size it should be, and the natural consequence is truncation
 * that gets blamed on the model.
 */

import { describe, expect, it } from 'vitest';
import {
  TokenEstimator,
  detectScriptLanguage,
  toTokenRatioLanguage,
} from '@/shared/llm/token-estimator';

const estimator = new TokenEstimator();

describe('a course language code reaches its own ratio', () => {
  it.each([
    ['ru', 'rus', 3.2],
    ['en', 'eng', 4.0],
    ['es', 'spa', 4.3],
    ['zh', 'cmn', 2.0],
    ['ja', 'jpn', 2.5],
    ['ko', 'kor', 3.0],
    ['de', 'deu', 4.5],
    ['ar', 'ara', 3.0],
  ])('maps %s to %s (ratio %s)', (iso1, iso3, ratio) => {
    expect(toTokenRatioLanguage(iso1)).toBe(iso3);
    expect(estimator.getLanguageRatio(toTokenRatioLanguage(iso1))).toBe(ratio);
  });

  it('is what the old ternary got wrong', () => {
    // The shipped expression, for the two languages this batch adds.
    const collapse = (language: string) => (language === 'ru' ? 'rus' : 'eng');

    expect(collapse('zh')).toBe('eng');
    expect(estimator.getLanguageRatio(collapse('zh'))).toBe(4.0);
    // Twice the ratio means half the estimated tokens for the same text.
    expect(estimator.getLanguageRatio(toTokenRatioLanguage('zh'))).toBe(2.0);
  });

  it('fixes the Russian case that was also wrong', () => {
    // `getLanguageRatio('ru')` — the ISO 639-1 code — matches no key, so this
    // returned the 4.0 default for the product's primary language.
    expect(estimator.getLanguageRatio('ru')).toBe(4.0);
    expect(estimator.getLanguageRatio(toTokenRatioLanguage('ru'))).toBe(3.2);
  });

  it('accepts an ISO 639-3 code unchanged', () => {
    expect(toTokenRatioLanguage('cmn')).toBe('cmn');
    expect(toTokenRatioLanguage('rus')).toBe('rus');
    // franc's "cannot tell" is a key of the table and means the default.
    expect(estimator.getLanguageRatio(toTokenRatioLanguage('und'))).toBe(4.0);
  });

  it('falls back to the default rather than a wrong neighbour', () => {
    for (const unknown of ['sw', 'xx', '', '   ', null, undefined]) {
      expect(estimator.getLanguageRatio(toTokenRatioLanguage(unknown))).toBe(4.0);
    }
  });

  it('accepts a full language name, because the repo normalizer does', () => {
    expect(toTokenRatioLanguage('Chinese')).toBe('cmn');
    expect(toTokenRatioLanguage('spanish')).toBe('spa');
  });
});

describe('script detection replaces four hand-rolled Cyrillic tests', () => {
  it.each([
    ['Резервный фонд покрывает обязательные расходы домохозяйства.', 'rus'],
    ['The emergency fund covers mandatory household expenses.', 'eng'],
    ['El fondo de emergencia cubre los gastos obligatorios.', 'eng'],
    ['应急基金用于支付家庭的必要开支，当主要收入中断时使用。', 'cmn'],
    ['긴급 자금은 주요 소득이 중단되었을 때 필수 지출을 충당합니다.', 'kor'],
    ['緊急資金は、主な収入が途絶えたときの必須支出をまかないます。', 'jpn'],
    ['يغطي صندوق الطوارئ النفقات الإلزامية للأسرة.', 'ara'],
  ])('reads %s as %s', (text, expected) => {
    expect(detectScriptLanguage(text)).toBe(expected);
  });

  it('does not call Japanese Chinese, despite the shared Han characters', () => {
    // Kana is tested before Han precisely for this.
    expect(detectScriptLanguage('この資金は投資商品ではありません。')).toBe('jpn');
  });

  it('estimates a Chinese paragraph at roughly twice the old count', () => {
    const chinese = '应急基金用于支付家庭的必要开支，当主要收入中断时使用。'.repeat(4);

    const now = estimator.estimateTokens(chinese, detectScriptLanguage(chinese));
    const before = estimator.estimateTokens(chinese, 'eng');

    expect(now).toBeGreaterThan(before * 1.9);
    expect(now).toBeLessThan(before * 2.1);
  });
});
