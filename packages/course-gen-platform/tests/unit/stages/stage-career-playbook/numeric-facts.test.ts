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
      '## 6. KPI и метрики\n\nПлан продаж: 12 млн ₽. Win rate: 18%.',
      'Из загруженного KPI-документа: план продаж 12 млн ₽.'
    );

    expect(facts.find(fact => fact.raw_text === '12 млн ₽')).toMatchObject({
      status: 'verified',
      source: 'source_document',
    });
    expect(facts.find(fact => fact.raw_text === '18%')).toMatchObject({
      status: 'needs_review',
      source: 'model_suggestion',
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
});
