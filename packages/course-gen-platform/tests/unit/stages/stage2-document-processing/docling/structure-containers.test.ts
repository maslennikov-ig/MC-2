/**
 * Structural containers: the worksheet, slide and chapter boundaries that are
 * the whole reason the Premium families are worth ingesting.
 *
 * The documents below are trimmed copies of what the PINNED stack actually
 * returned for the Stage C fixtures on 2026-08-07, group labels and names
 * included. They are deliberately verbatim rather than idealised: XLSX names a
 * worksheet group `Бюджет курса` while ODS decorates the same idea as
 * `sheet: Нагрузка`, and ODP numbers its groups from zero while numbering the
 * slide titles from one. Code that assumed either convention would be wrong.
 */

import { describe, expect, it } from 'vitest';

import {
  aggregateProvenance,
  buildDoclingProvenanceIndex,
} from '@/stages/stage2-document-processing/docling/provenance';
import { checkStructure } from '@/stages/stage2-document-processing/docling/structure-assertions';

const workbook = {
  body: { children: [{ $ref: '#/groups/0' }, { $ref: '#/groups/1' }] },
  groups: [
    {
      self_ref: '#/groups/0',
      parent: { $ref: '#/body' },
      children: [{ $ref: '#/texts/0' }, { $ref: '#/tables/0' }],
      label: 'sheet',
      name: 'Бюджет курса',
    },
    {
      self_ref: '#/groups/1',
      parent: { $ref: '#/body' },
      children: [{ $ref: '#/tables/1' }],
      label: 'sheet',
      name: 'Преподаватели',
    },
  ],
  texts: [
    {
      self_ref: '#/texts/0',
      parent: { $ref: '#/groups/0' },
      label: 'text',
      text: 'Смета расходов на запуск',
      prov: [{ page_no: 1, bbox: { l: 0, t: 1, r: 2, b: 2, coord_origin: 'TOPLEFT' } }],
    },
  ],
  tables: [
    {
      self_ref: '#/tables/0',
      parent: { $ref: '#/groups/0' },
      label: 'table',
      data: {
        num_rows: 2,
        num_cols: 2,
        table_cells: [
          { text: 'Итого', start_row_offset_idx: 1, start_col_offset_idx: 0 },
          { text: '1350', start_row_offset_idx: 1, start_col_offset_idx: 1 },
        ],
      },
    },
    {
      self_ref: '#/tables/1',
      parent: { $ref: '#/groups/1' },
      label: 'table',
      data: {
        num_rows: 1,
        num_cols: 2,
        table_cells: [
          { text: 'Ассистент', start_row_offset_idx: 0, start_col_offset_idx: 0 },
          { text: '3100', start_row_offset_idx: 0, start_col_offset_idx: 1 },
        ],
      },
    },
  ],
};

const slides = {
  body: {
    children: [{ $ref: '#/groups/0' }, { $ref: '#/groups/1' }, { $ref: '#/groups/2' }],
  },
  groups: [0, 1, 2].map(index => ({
    self_ref: `#/groups/${index}`,
    parent: { $ref: '#/body' },
    children: [{ $ref: `#/texts/${index}` }],
    label: 'chapter',
    name: `slide-${index}`,
  })),
  texts: [
    'Первый слайд: цели программы',
    'Второй слайд: методика оценки',
    'Третий слайд: итоговые результаты',
  ].map((text, index) => ({
    self_ref: `#/texts/${index}`,
    parent: { $ref: `#/groups/${index}` },
    label: 'text',
    text,
  })),
  tables: [],
};

const paper = {
  body: { children: [{ $ref: '#/texts/0' }, { $ref: '#/texts/1' }] },
  groups: [],
  texts: [
    {
      self_ref: '#/texts/0',
      parent: { $ref: '#/body' },
      label: 'formula',
      text: 'E = \\frac{\\alpha t}{1 + \\beta t}',
    },
    {
      self_ref: '#/texts/1',
      parent: { $ref: '#/body' },
      label: 'code',
      text: 'def retention(alpha, beta, t):',
    },
  ],
  tables: [],
};

describe('buildDoclingProvenanceIndex containers', () => {
  it('binds each worksheet element to the sheet that owns it', () => {
    const index = buildDoclingProvenanceIndex(workbook);

    expect(index.refs.get('#/tables/0')?.containers).toEqual([
      { label: 'sheet', name: 'Бюджет курса', index: 0, selfRef: '#/groups/0' },
    ]);
    expect(index.refs.get('#/tables/1')?.containers[0]?.name).toBe('Преподаватели');
  });

  it('numbers slides by their position, not by the name the backend chose', () => {
    const index = buildDoclingProvenanceIndex(slides);
    const positions = [0, 1, 2].map(i => index.refs.get(`#/texts/${i}`)?.containers[0]?.index);
    expect(positions).toEqual([0, 1, 2]);
  });

  it('leaves body-level elements without containers rather than inventing one', () => {
    const index = buildDoclingProvenanceIndex(paper);
    expect(index.refs.get('#/texts/0')?.containers).toEqual([]);
  });

  it('reports nested containers outermost first', () => {
    const nested = {
      body: { children: [{ $ref: '#/groups/0' }] },
      groups: [
        {
          self_ref: '#/groups/0',
          parent: { $ref: '#/body' },
          children: [{ $ref: '#/groups/1' }],
          label: 'section',
          name: 'header-1',
        },
        {
          self_ref: '#/groups/1',
          parent: { $ref: '#/groups/0' },
          children: [{ $ref: '#/texts/0' }],
          label: 'list',
          name: 'ordered list',
        },
      ],
      texts: [
        {
          self_ref: '#/texts/0',
          parent: { $ref: '#/groups/1' },
          label: 'list_item',
          text: 'Глава вторая. Практика',
        },
      ],
      tables: [],
    };

    expect(buildDoclingProvenanceIndex(nested).refs.get('#/texts/0')?.containers).toEqual([
      { label: 'section', name: 'header-1', index: 0, selfRef: '#/groups/0' },
      { label: 'list', name: 'ordered list', index: 0, selfRef: '#/groups/1' },
    ]);
  });

  it('stops on a parent cycle instead of walking it forever', () => {
    const cyclic = {
      body: { children: [] },
      groups: [
        {
          self_ref: '#/groups/0',
          parent: { $ref: '#/groups/1' },
          children: [],
          label: 'sheet',
          name: 'A',
        },
        {
          self_ref: '#/groups/1',
          parent: { $ref: '#/groups/0' },
          children: [],
          label: 'sheet',
          name: 'B',
        },
      ],
      texts: [{ self_ref: '#/texts/0', parent: { $ref: '#/groups/0' }, label: 'text', text: 'x' }],
      tables: [],
    };

    const containers = buildDoclingProvenanceIndex(cyclic).refs.get('#/texts/0')?.containers ?? [];
    expect(containers.map(c => c.name)).toEqual(['B', 'A']);
  });
});

describe('aggregateProvenance containers', () => {
  it('collects the distinct containers behind a chunk, in first-seen order', () => {
    const index = buildDoclingProvenanceIndex(workbook);
    const aggregated = aggregateProvenance(['#/texts/0', '#/tables/0', '#/tables/1'], index);
    expect(aggregated.containers.map(container => container.name)).toEqual([
      'Бюджет курса',
      'Преподаватели',
    ]);
  });

  it('reports no containers for a chunk whose refs do not resolve', () => {
    const index = buildDoclingProvenanceIndex(workbook);
    const aggregated = aggregateProvenance(['#/texts/99'], index);
    expect(aggregated.containers).toEqual([]);
    expect(aggregated.unresolvedRefs).toEqual(['#/texts/99']);
  });
});

describe('checkStructure', () => {
  it('passes a workbook that keeps its sheets, its cells and its formula result', () => {
    const checks = checkStructure(workbook, {
      containers: [
        { label: 'sheet', name: 'Бюджет курса' },
        { label: 'sheet', name: 'Преподаватели' },
      ],
      containedText: [{ text: 'Ассистент', container: 'Преподаватели' }],
      tableRows: [['Итого', '1350']],
      minimumTables: 2,
    });
    expect(checks.filter(check => !check.passed)).toEqual([]);
  });

  it('fails when a cell resolves to the wrong sheet', () => {
    const checks = checkStructure(workbook, {
      containedText: [{ text: 'Ассистент', container: 'Бюджет курса' }],
    });
    expect(checks[0]?.passed).toBe(false);
    expect(checks[0]?.details).toContain('Преподаватели');
  });

  it('fails when the text is not in the document at all, and says which', () => {
    const checks = checkStructure(workbook, {
      containedText: [{ text: 'Командировки', container: 'Бюджет курса' }],
    });
    expect(checks[0]?.passed).toBe(false);
    expect(checks[0]?.details).toContain('does not appear');
  });

  it('matches a sheet name the backend decorated', () => {
    // ODS reports the group name as `sheet: Нагрузка`; the fixture declares the
    // sheet, not the backend's prefix.
    const sheet = {
      body: { children: [{ $ref: '#/groups/0' }] },
      groups: [
        {
          self_ref: '#/groups/0',
          parent: { $ref: '#/body' },
          children: [{ $ref: '#/tables/0' }],
          label: 'section',
          name: 'sheet: Нагрузка',
        },
      ],
      texts: [],
      tables: [
        {
          self_ref: '#/tables/0',
          parent: { $ref: '#/groups/0' },
          label: 'table',
          data: {
            table_cells: [
              { text: 'Практика', start_row_offset_idx: 0, start_col_offset_idx: 0 },
              { text: '12', start_row_offset_idx: 0, start_col_offset_idx: 1 },
            ],
          },
        },
      ],
    };

    const checks = checkStructure(sheet, {
      containedText: [{ text: 'Практика', container: 'Нагрузка' }],
      tableRows: [['Практика', '12']],
    });
    expect(checks.filter(check => !check.passed)).toEqual([]);
  });

  it('counts typed items so an equation that arrived as prose fails', () => {
    expect(
      checkStructure(paper, { itemLabels: { formula: 1, code: 1 } }).filter(c => !c.passed)
    ).toEqual([]);

    const flattened = {
      ...paper,
      texts: paper.texts.map(text => ({ ...text, label: 'text' })),
    };
    const checks = checkStructure(flattened, { itemLabels: { formula: 1, code: 1 } });
    expect(checks.every(check => !check.passed)).toBe(true);
    expect(checks[0]?.details).toBe('0 of at least 1');
  });

  it('requires table cells to be adjacent in the same row', () => {
    const checks = checkStructure(workbook, { tableRows: [['Итого', 'Ассистент']] });
    expect(checks[0]?.passed).toBe(false);
  });

  it('fails a container that is present but in the wrong position', () => {
    const checks = checkStructure(workbook, {
      containers: [
        { label: 'sheet', name: 'Преподаватели' },
        { label: 'sheet', name: 'Бюджет курса' },
      ],
    });
    expect(checks.every(check => !check.passed)).toBe(true);
  });
});
