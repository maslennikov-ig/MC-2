import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId } from '@megacampus/shared-types';
import { extractCareerPlaybookNumericFacts } from '@/stages/stage-career-playbook/numeric-facts';

function extract(blockId: CareerPlaybookBlockId, content: string, evidenceText = '') {
  return extractCareerPlaybookNumericFacts({
    blockId,
    content,
    evidenceText,
    language: 'ru',
  });
}

describe('Career Playbook numeric facts', () => {
  it('extracts percentages, ranges, money, dates, durations, and counts', () => {
    const facts = extract(
      'block_6',
      [
        '## 6. KPI и метрики',
        'Цель: увеличить win rate до 18%, держать pipeline coverage 3x.',
        'Бюджет: $50k в квартал. Пересмотр: 2026-07-01.',
        'Онбординг: 30-60-90 дней и первые 5 побед.',
      ].join('\n')
    );

    expect(facts.map(fact => fact.raw_text)).toEqual(
      expect.arrayContaining(['18%', '3x', '$50k', '2026-07-01', '30-60-90', '5'])
    );
    expect(facts.every(fact => fact.block_id === 'block_6')).toBe(true);
    expect(facts.every(fact => Number.isInteger(fact.occurrence_index))).toBe(true);
  });

  it('classifies source-backed values as verified and unsupported exact values as needs_review', () => {
    const facts = extract(
      'block_6',
      '## 6. KPI и метрики\n\nПлан продаж: 12 млн ₽. Win rate: 18%. Лидогенерация: 80 MQL/месяц.',
      'Из загруженного KPI-документа: план продаж 12 млн ₽. Лидогенерация через контент: 80 MQL/месяц.'
    );

    expect(facts.find(fact => fact.raw_text === '12 млн ₽')).toMatchObject({
      status: 'verified',
      source: 'source_document',
    });
    expect(facts.find(fact => fact.raw_text === '18%')).toMatchObject({
      status: 'needs_review',
      source: 'model_suggestion',
    });
    expect(facts.find(fact => fact.raw_text === '80')).toMatchObject({
      status: 'verified',
      source: 'source_document',
    });
  });

  it('does not treat a global benchmark instruction as benchmark provenance for source-backed values', () => {
    const evidenceText = [
      'Uploaded source: KPI document',
      '- Content to lead CVR: 2.5%.',
      '- Pipeline influenced revenue: 12%.',
      'Constraint: do not present unsupported KPI as facts; unsupported values should be marked benchmark/suggested/needs_review.',
    ].join('\n');

    const facts = extract(
      'block_6',
      'CVR контент → лид: 2,5%. Pipeline influenced revenue: 12%.',
      evidenceText
    );

    expect(facts.find(fact => fact.raw_text === '2,5%')).toMatchObject({
      status: 'verified',
      source: 'source_document',
    });
    expect(facts.find(fact => fact.raw_text === '12%')).toMatchObject({
      status: 'verified',
      source: 'source_document',
    });
  });

  it('marks methodology constants as structural and ignores fenced code blocks', () => {
    const facts = extract(
      'block_14',
      [
        '## 14. Онбординг',
        'Используйте план 30-60-90 и First 5 Wins.',
        '',
        '```mermaid',
        'flowchart LR',
        '  A --> B30',
        '```',
      ].join('\n')
    );

    expect(facts.find(fact => fact.raw_text === '30-60-90')).toMatchObject({
      status: 'structural',
      source: 'methodology',
    });
    expect(facts.find(fact => fact.raw_text === '5')).toMatchObject({
      status: 'structural',
      source: 'methodology',
    });
    expect(facts.map(fact => fact.raw_text)).not.toContain('30');
  });

  it('does not verify low-signal checklist and table numbering from broad source evidence', () => {
    const facts = extract(
      'block_6',
      [
        '## 2.6. Чеклист внедрения',
        '',
        '| № | Этап | Ожидаемый срок |',
        '| --- | --- | --- |',
        '| 1 | Ознакомление | День 1 |',
        '| 2 | Обсуждение карты роли | 1-я неделя |',
        '| 6 | Заполнить раздел 22 | 2-3 недели |',
        '| 7 | Заполнение протокола | 3-4 недели |',
      ].join('\n'),
      [
        'Пользовательский контекст содержит раздел 22.',
        'В документе есть день 1 и шаг 2, но это не подтверждает номера строк чеклиста.',
        'Также встречается план 3-4 квартала в другом разделе.',
      ].join('\n')
    );

    const sourceVerified = facts.filter(
      fact => fact.status === 'verified' && fact.source === 'source_document'
    );

    expect(sourceVerified).toEqual([]);
    expect(facts.map(fact => fact.raw_text)).not.toEqual(
      expect.arrayContaining(['1', '2', '6', '7'])
    );
  });

  it('does not verify table row numbers by matching substrings inside larger metrics', () => {
    const facts = extract(
      'block_6',
      [
        '## 6. KPI и метрики',
        '',
        '| № | Метрика | Цель |',
        '| --- | --- | --- |',
        '| 1 | Win rate | 18% |',
      ].join('\n'),
      'Из загруженного KPI-документа: win rate target is 18%.'
    );

    expect(facts.map(fact => fact.raw_text)).not.toContain('1');
    expect(facts.find(fact => fact.raw_text === '18%')).toMatchObject({
      status: 'verified',
      source: 'source_document',
    });
  });

  it('keeps actionable single-value timelines in markdown tables', () => {
    const facts = extract(
      'block_26',
      [
        '| Инициатива | Срок |',
        '| --- | --- |',
        '| Запуск пилота | 2 недели |',
      ].join('\n')
    );

    expect(facts.find(fact => fact.raw_text === '2 недели')).toMatchObject({
      status: 'needs_review',
      source: 'model_suggestion',
      unit: 'duration',
    });
  });
});
