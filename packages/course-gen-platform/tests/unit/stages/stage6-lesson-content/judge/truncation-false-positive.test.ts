/**
 * Regression tests for section-level truncation false positives.
 *
 * These tests reproduce the exact patterns from live rejected lessons
 * (MKK-6903, KPE-0507) where checkContentTruncation falsely flagged
 * valid markdown structures as truncated:
 * - Markdown tables ending with | (pipe)
 * - Horizontal rules --- ending with -
 * - Table separators |---|---| ending with |
 * - Callout blocks ending with short non-punctuated text
 */
import { describe, expect, it } from 'vitest';
import { checkContentTruncation } from '@/stages/stage6-lesson-content/judge/heuristic-filter';

// Minimum 200 chars to avoid short-content check
const PAD =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip.';

describe('checkContentTruncation section-level false positives', () => {
  it('should NOT flag section ending with markdown table row (pipe |)', () => {
    // Live pattern from KPE-0507 lesson 1.1 section 2:
    // "Корпоративный vs личный бренд" ended with table row
    const content = `## Введение

${PAD}

## Корпоративный vs личный бренд

Корпоративный аккаунт транслирует ценности компании.

| Тип | Цель | Тон |
|---|---|---|
| Бренд | Продажи, имидж | Официальный |
| Личный | Доверие, нетворкинг | Живой |

## Интеграция с отделом продаж

Лиды из соцсетей не должны теряться в переписках. Это важная задача для любого бизнеса.`;

    const result = checkContentTruncation(content);

    const sectionIssues = result.truncationIssues.filter(i => i.includes('Section'));
    expect(sectionIssues).toHaveLength(0);
  });

  it('should NOT flag section ending with horizontal rule ---', () => {
    // Live pattern: sections in KPE-0507 ended with --- separator
    const content = `## Введение

${PAD}

## Первый раздел

Контент первого раздела. Подведем итоги.

---

## Второй раздел

Контент второго раздела с достаточным количеством текста для прохождения проверки на длину.`;

    const result = checkContentTruncation(content);

    const sectionIssues = result.truncationIssues.filter(i => i.includes('Section'));
    expect(sectionIssues).toHaveLength(0);
  });

  it('should NOT flag content globally ending with horizontal rule ---', () => {
    // Live pattern: MKK-6903 lesson 1.2 content tail: "---\n*Материал подготовлен...*"
    // After stripping trailing markdown formatting, last char could be "-" from ---
    const content = `## Введение

${PAD}

## Заключение

Теоретический блок завершён. В следующем уроке мы перейдём к практическому инструментарию.

---`;

    const result = checkContentTruncation(content);

    const globalTruncIssues = result.truncationIssues.filter(i =>
      i.includes('does not end with proper punctuation')
    );
    expect(globalTruncIssues).toHaveLength(0);
  });

  it('should NOT flag section ending with table separator |---|---|', () => {
    // Edge case: section that ends right after the table header separator
    const content = `## Введение

${PAD}

## Сравнение моделей

Рассмотрим различные модели управления контентом в таблице ниже.

| Модель | Плюсы | Минусы |
|---|---|---|

## Детали реализации

Подробности реализации каждой модели описаны в этом разделе. Все модели имеют свои особенности.`;

    const result = checkContentTruncation(content);

    const sectionIssues = result.truncationIssues.filter(i => i.includes('Section'));
    expect(sectionIssues).toHaveLength(0);
  });

  it('reproduces exact KPE-0507 lesson 1.1 pattern (tables + exercises)', () => {
    // Exact structure from the live rejected content
    const content = `## Введение

Добро пожаловать в курс по основам SMM-стратегии. Многие считают SMM изолированным творчеством, но это опасное заблуждение. Соцсети напрямую влияют на прибыль и репутацию компании. На этом уроке мы разберем, как вписать продвижение в структуру организации.

## Корпоративный vs личный бренд

Корпоративный аккаунт транслирует ценности компании, а личный — экспертизу владельца. Разделяйте доступы и гайдлайны.

| Тип | Цель | Тон |
|---|---|---|
| Бренд | Продажи, имидж | Официальный |
| Личный | Доверие, нетворкинг | Живой |

## Интеграция с отделом продаж

Лиды из соцсетей не должны теряться в переписках. Менеджер обязан связаться в течение 15 минут для максимальной конверсии.

## Бизнес-задачи в соцсетях

SMM решает конкретные задачи бизнеса. Измеряйте успех не лайками, а конверсией в заявку.

> [!INFO]
> **Ключевые задачи:** Повышение осведомленности, генерация лидов.

## Организационная структура

Кто ведет аккаунты? Выберите модель: штатный сотрудник, агентство или гибрид.

| Модель | Плюсы | Минусы |
|---|---|---|
| Штат | Контроль | Дорого |
| Агентство | Экспертиза | Конвейер |

## Репутационные риски

Негатив в соцсетях распространяется мгновенно. Нужен протокол действий при кризисе.

> [!WARNING]
> **Правило:** Отвечайте на негатив публично и быстро. Не удаляйте комментарии без веской причины.

## Упражнения

### Упражнение 1: Анализ типа аккаунта

**Задание:** Определите тип аккаунта вашей компании.
**Сценарий:** Вы ведете магазин одежды.
> **Подсказка:** Смотрите на цели.
> **Образец ответа:** Корпоративный, цель — продажи.

---

### Упражнение 2: Карта интеграции

**Задание:** Опишите путь лида.
**Сценарий:** Клиент пишет в директ.
> **Подсказка:** Куда падает заявка?
> **Образец ответа:** Директ -> Таблица -> Менеджер.
`;

    const result = checkContentTruncation(content);

    // This content is globally complete and structurally valid.
    // No section-level truncation should be reported.
    const sectionIssues = result.truncationIssues.filter(i => i.includes('Section'));
    expect(sectionIssues).toHaveLength(0);

    // Global ending is valid (period after "Менеджер.")
    const globalTruncIssues = result.truncationIssues.filter(i =>
      i.includes('does not end with proper punctuation')
    );
    expect(globalTruncIssues).toHaveLength(0);
  });

  it('should NOT flag content ending with --- followed by plain footer/copyright', () => {
    // Live pattern from MKK-6903 lesson 1.3:
    //   tail = "...гарантия стабильного результата завтра.\n---\n© 2024 Внутренний стандарт..."
    // The content is structurally complete, but the plain-text footer line
    // after the horizontal rule ends with "м" (no punctuation) → Check 1 fires
    // → under the composite rule can still combine with any section-level
    // heuristic (quote/callout/table) and re-trigger CRITICAL TRUNCATION.
    const content = `## Введение

${PAD}

## Заключение

Четкое распределение ролей сегодня — гарантия стабильного результата завтра.

---
© 2024 Внутренний стандарт управления контентом`;

    const result = checkContentTruncation(content);

    const globalTruncIssues = result.truncationIssues.filter(i =>
      i.includes('does not end with proper punctuation')
    );
    expect(globalTruncIssues).toHaveLength(0);
  });

  it('should NOT flag content ending with --- + multi-line plain footer', () => {
    // Variant with multiple plain lines after ---
    const content = `## Введение

${PAD}

## Заключение

Всё рассмотрено.

---
Материал защищен авторским правом
Copyright © 2024`;

    const result = checkContentTruncation(content);

    const globalTruncIssues = result.truncationIssues.filter(i =>
      i.includes('does not end with proper punctuation')
    );
    expect(globalTruncIssues).toHaveLength(0);
  });

  it('does NOT strip section content when --- is a section-separator (not a footer boundary)', () => {
    // Regression guard: if --- is followed by a new section header, it's
    // a separator not a footer marker — do not eat the new section.
    const content = `## Первый раздел

Первый раздел завершается обычной точкой в конце.

---

## Второй раздел

Второй раздел тоже завершается правильной точкой в конце.`;

    const result = checkContentTruncation(content);
    // Content globally ends with "." → Check 1 should pass
    const globalTruncIssues = result.truncationIssues.filter(i =>
      i.includes('does not end with proper punctuation')
    );
    expect(globalTruncIssues).toHaveLength(0);

    // Section-level heuristics should not fire either (both sections end with .)
    const sectionIssues = result.truncationIssues.filter(i => i.includes('Section'));
    expect(sectionIssues).toHaveLength(0);
  });

  describe('multiple horizontal rules: only the last one gates the footer strip', () => {
    it('strips footer after LAST --- even when earlier --- exists as section separator', () => {
      // Reviewer case: content has an earlier --- as a section divider, then
      // legitimate body content, then a FINAL --- followed by footer.
      // Previous exec() over a lazy pattern matched the FIRST HR, captured
      // everything through EOF, saw "## Body" was not footer-shaped, and
      // bailed — so the real footer at the very end was never stripped.
      const content = `## Introduction

${PAD}

---

## Body

More body text to make the lesson long enough to pass length checks properly.

---
© 2024 Internal Standard`;

      const result = checkContentTruncation(content);
      // The last HR + footer must be stripped; content effectively ends at
      // "properly." → Check 1 passes
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues).toHaveLength(0);
    });

    it('preserves content when last --- is followed by non-footer text (even with earlier footer-like text)', () => {
      // Guard: even if an earlier segment contains the word "Copyright" in
      // regular prose, the LAST HR's block determines the strip decision.
      const content = `## Chapter 1

Copyright law is discussed in this chapter with enough length to pass validation.

---

## Chapter 2

Second chapter with adequate content length for the validation checks to succeed here.

---
Новая история начинается здесь без знака препинания`;

      const result = checkContentTruncation(content);
      // Last HR leads into substantive text (not footer) → GLOBAL_ENDING fires
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues.length).toBeGreaterThan(0);
    });

    it('strips only after last HR when multiple consecutive footer blocks exist', () => {
      // Edge: two footer blocks separated by an HR. Should still strip correctly.
      const content = `## Intro

${PAD}

---
© 2023 Old copyright

---
© 2024 New copyright`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues).toHaveLength(0);
    });
  });

  describe('footer predicate must match shape, not arbitrary keyword-containing prose', () => {
    it('does NOT strip substantive prose that merely mentions "Copyright" mid-sentence', () => {
      // Reviewer P2 case #1: keyword appears in a real paragraph, not as a header
      const content = `## Introduction

${PAD}

---
Copyright law is discussed in this appendix without a final period`;

      const result = checkContentTruncation(content);
      // Substantive trailing prose → GLOBAL_ENDING must still fire
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues.length).toBeGreaterThan(0);
    });

    it('does NOT strip substantive prose starting with "Материал подготовлен"', () => {
      // Reviewer P2 case #2: keyword prefix but substantive content follows
      const content = `## Введение

${PAD}

---
Материал подготовлен в формате кейса с подробным разбором ситуации и выводами без финальной точки`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues.length).toBeGreaterThan(0);
    });

    it('does NOT strip SHORT substantive prose starting with "Материал подготовлен"', () => {
      const content = `## Введение

${PAD}

---
Материал подготовлен в формате кейса без финальной точки`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues).toHaveLength(0);
    });

    it('does NOT raise GLOBAL_ENDING for weak-only attribution block', () => {
      const content = `## Введение

${PAD}

## Итог

Всё рассмотрено.

---
Материал подготовлен учебным центром Мегакампус`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues).toHaveLength(0);
    });

    it('does NOT strip short ambiguous "Материал защищен X" without authorship signal', () => {
      const content = `## Введение

${PAD}

---
Материал защищен от повреждений специальной обработкой`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues).toHaveLength(0);
    });

    it('still strips weak "Материал подготовлен" when block also has strong copyright anchor', () => {
      const content = `## Введение

${PAD}

## Итог

Всё рассмотрено.

---
Материал подготовлен учебным центром Мегакампус
© 2024 МегаКампус`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues).toHaveLength(0);
    });

    it('does NOT strip prose where "Copyright" appears in an analysis context', () => {
      // Edge: "Copyright" in running text with substantial length
      const content = `## Legal analysis

${PAD}

---
The Copyright Act of 1976 established specific rules about derivative works which we examine throughout this module in detail`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues.length).toBeGreaterThan(0);
    });

    it('still strips short footer line "© 2024 Company"', () => {
      const content = `## Введение

${PAD}

## Conclusion

All covered.

---
© 2024 Company`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues).toHaveLength(0);
    });

    it('still strips "Copyright © 2024 Acme Inc."', () => {
      const content = `## Введение

${PAD}

## Conclusion

All covered.

---
Copyright © 2024 Acme Inc.`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues).toHaveLength(0);
    });

    it('still strips short footer line "Все права защищены."', () => {
      const content = `## Введение

${PAD}

## Итог

Всё рассмотрено.

---
Все права защищены.`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues).toHaveLength(0);
    });
  });

  describe('footer strip must NOT eat genuine last-section content', () => {
    it('does NOT strip a genuine paragraph continuation after --- (no footer markers)', () => {
      // Reviewer false-negative case #1: plain trailing paragraph without
      // footer keywords → must NOT be stripped, so real truncation remains visible
      const content = `## Введение

${PAD}

## Заключение

Это последний раздел с нормальной точкой в конце.

---
Следующая часть объясняет детали`;

      const result = checkContentTruncation(content);
      // Content genuinely ends without punctuation → GLOBAL_ENDING SHOULD fire
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues.length).toBeGreaterThan(0);
    });

    it('does NOT strip a bullet list item after --- (no footer markers)', () => {
      // Reviewer false-negative case #2: trailing bullet line
      const content = `## Введение

${PAD}

## Список

Список идей:

---
- пункт без точки`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues.length).toBeGreaterThan(0);
    });

    it('does NOT strip a plain final paragraph without punctuation', () => {
      // Reviewer false-negative case #3: plain final paragraph (no ©, no Copyright, no rights)
      const content = `## Введение

${PAD}

## Заключение

Всё рассмотрено подробно и поучительно.

---
Обычный финальный абзац без точки в конце`;

      const result = checkContentTruncation(content);
      const globalTruncIssues = result.truncationIssues.filter(i =>
        i.includes('does not end with proper punctuation')
      );
      expect(globalTruncIssues.length).toBeGreaterThan(0);
    });
  });

  it('should still flag genuinely truncated section (mid-word cutoff)', () => {
    const content = `## Введение

${PAD}

## Важный раздел

Этот раздел содержит важную информацию, но текст обрывает

## Следующий раздел

Контент следующего раздела завершается нормальной точкой в конце.`;

    const result = checkContentTruncation(content);

    const sectionIssues = result.truncationIssues.filter(i => i.includes('Section'));
    expect(sectionIssues.length).toBeGreaterThan(0);
  });
});
