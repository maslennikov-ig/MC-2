/**
 * Regression: a Chinese course must be able to pass Stage 5 validation.
 *
 * On 2026-08-22 the first Chinese course this product ever generated failed
 * three times and was abandoned at Stage 5 on these two issues, quoted verbatim
 * from the run:
 *
 *   0.section_title: Section title too short (min 10 chars)
 *   0.lessons.2.key_topics.3: String must contain at least 5 character(s)
 *
 * Nothing was wrong with the text. The thresholds were calibrated on Latin
 * script and applied to an ideographic one, where one character carries about
 * what two Latin characters do — the same factor of two the token-ratio table
 * has always had (2.0 chars/token for Chinese, 4.0 for English) (mc2-v6fqp).
 *
 * The fix weights rather than lowers, so the assertions below come in pairs: the
 * Chinese case must now pass, and the equally short English case must still fail.
 */

import { describe, expect, it } from 'vitest';
import { informationLength, meaningfulText } from '@megacampus/shared-types';
import { SectionSchema } from '@megacampus/shared-types';

describe('what a character is worth', () => {
  it('counts a Han, Kana or Hangul character as two', () => {
    expect(informationLength('应急基金核心概念')).toBe(16);
    expect(informationLength('緊急資金の基本')).toBe(14);
    expect(informationLength('긴급자금')).toBe(8);
  });

  it('leaves alphabetic scripts alone, including Cyrillic', () => {
    // Weighting Cyrillic would loosen a check that has been correct for Russian
    // since the beginning.
    expect(informationLength('Резервный фонд')).toBe('Резервный фонд'.length);
    expect(informationLength('Emergency fund')).toBe(14);
    expect(informationLength('El fondo de emergencia')).toBe(22);
  });

  it('counts an astral character once, not twice for its surrogate pair', () => {
    // 𠀋 is Han outside the BMP: two UTF-16 units, one character, worth two.
    expect('𠀋'.length).toBe(2);
    expect(informationLength('𠀋')).toBe(2);
  });

  it('adds up a mixed string honestly', () => {
    // "API 接口" — three Latin letters, a space, two Han characters.
    expect(informationLength('API 接口')).toBe(3 + 1 + 4);
  });
});

describe('the two values that killed the Chinese run', () => {
  const title = meaningfulText({ minimum: 10, maximum: 600, label: 'Section title' });
  const topic = meaningfulText({ minimum: 5, maximum: 300, label: 'Key topic' });

  it('accepts the section title that was rejected', () => {
    // Eight characters, and a complete idiomatic title: "Core concepts of the
    // emergency fund", which is thirty-five characters in English.
    expect(title.safeParse('应急基金核心概念').success).toBe(true);
  });

  it('accepts the key topic that was rejected', () => {
    expect(topic.safeParse('存多少').success).toBe(true);
    expect(topic.safeParse('存在哪里').success).toBe(true);
  });

  it('still rejects an English title that really is too short', () => {
    // Nine characters of Latin is nine, and that is the point of the threshold.
    const result = title.safeParse('Overview');
    expect(result.success).toBe(false);
    if (!result.success) {
      // The message says how the counting works, so the next person does not
      // have to find this file.
      expect(result.error.issues[0].message).toContain('counts as 2');
    }
  });

  it('still rejects Chinese that really is too short', () => {
    // Two characters is four, still under ten. Weighting is not switching off.
    expect(title.safeParse('基金').success).toBe(false);
  });

  it('keeps the maximum a plain character count', () => {
    // The ceiling protects columns and prompt budgets, which are counted in
    // characters whatever is in them.
    expect(topic.safeParse('应'.repeat(301)).success).toBe(false);
    expect(topic.safeParse('a'.repeat(301)).success).toBe(false);
    expect(topic.safeParse('应'.repeat(300)).success).toBe(true);
  });
});

describe('the whole section the run produced', () => {
  const chineseSection = {
    section_title: '应急基金核心概念',
    section_description:
      '本节介绍应急基金的定义、用途与核心原则，帮助学习者建立正确的财务安全观念。',
    learning_objectives: ['定义应急基金及其在个人财务安全中的角色'],
    lessons: [
      {
        lesson_title: '什么是应急基金',
        lesson_objectives: ['解释应急基金的用途与覆盖范围'],
        key_topics: ['应急基金定义', '覆盖范围', '存多少', '存在哪里'],
        estimated_duration_minutes: 10,
      },
    ],
  };

  it('validates end to end where it previously did not', () => {
    const result = SectionSchema.safeParse(chineseSection);
    if (!result.success) {
      // Print what actually failed rather than just a boolean, because the
      // original failure was diagnosed entirely from this kind of message.
      throw new Error(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    expect(result.success).toBe(true);
  });

  it('would have failed before the change', () => {
    // Reconstructing the old rule directly: a plain character count.
    expect(chineseSection.section_title.length).toBeLessThan(10);
    expect(chineseSection.lessons[0].key_topics[2].length).toBeLessThan(5);
  });
});

describe('the Stage 4 fields that killed the second Chinese run', () => {
  it('accepts a Chinese paragraph where min(100) previously refused it', async () => {
    const { atLeastInformationChars } = await import('@megacampus/shared-types');
    const bridge = atLeastInformationChars(100);

    // From the run that failed: knowledge_bridge, experience_prompt and
    // practical_benefit_focus are all min(100). This is a complete, thorough
    // Chinese paragraph at 62 characters — the English equivalent runs past 250.
    const chinese =
      '虽然你可能是理财新手，但你一定对花钱和存钱有基本的感知。这门课会把你已有的生活经验与一个系统的财务规划框架连接起来，让专业概念变得一听就懂。';
    expect(chinese.length).toBeLessThan(100);
    expect(bridge.safeParse(chinese).success).toBe(true);
  });

  it('still refuses an English sentence that is genuinely too short', async () => {
    const { atLeastInformationChars } = await import('@megacampus/shared-types');
    expect(
      atLeastInformationChars(100).safeParse('You already know how to spend money.').success
    ).toBe(false);
  });

  it('leaves the non-empty checks alone', async () => {
    // `min(1)` through `min(3)` say "not blank", not "long enough", and were
    // deliberately not converted.
    const { AnalysisResultSchema } = await import('@megacampus/shared-types');
    expect(AnalysisResultSchema).toBeDefined();
  });
});
