import { describe, expect, it } from 'vitest';

import { normalizeDoclingDocument } from '@/stages/stage2-document-processing/docling/raw-adapter';

describe('normalizeDoclingDocument', () => {
  it('normalizes the Docling 2.80 provenance shape into stable downstream fields', () => {
    const document = normalizeDoclingDocument({
      schema_name: 'DoclingDocument',
      version: '1.8.0',
      name: 'paper',
      origin: { filename: 'paper.pdf', mimetype: 'application/pdf' },
      pages: {
        '1': { page_no: 1, size: { width: 612, height: 792 } },
      },
      texts: [
        {
          self_ref: '#/texts/0',
          label: 'section_header',
          text: 'Результаты',
          level: 2,
          prov: [{ page_no: 1, bbox: { l: 10, t: 100, r: 210, b: 80 } }],
        },
        {
          self_ref: '#/texts/1',
          label: 'caption',
          text: 'Рисунок 1',
          prov: [{ page_no: 1, bbox: { l: 20, t: 70, r: 120, b: 50 } }],
        },
      ],
      pictures: [
        {
          self_ref: '#/pictures/0',
          captions: [{ $ref: '#/texts/1' }],
          prov: [{ page_no: 1, bbox: { l: 20, t: 300, r: 220, b: 100 } }],
        },
      ],
      tables: [],
    });

    expect(document).toMatchObject({
      schema_version: '1.8.0',
      name: 'paper',
      metadata: { page_count: 1, format: 'application/pdf' },
      texts: [
        {
          id: '#/texts/0',
          type: 'section_header',
          text: 'Результаты',
          page_no: 1,
          bbox: [10, 80, 200, 20],
          order: 0,
          level: 2,
        },
        expect.objectContaining({ id: '#/texts/1', page_no: 1 }),
      ],
      pictures: [
        expect.objectContaining({
          id: '#/pictures/0',
          page_no: 1,
          bbox: [20, 100, 200, 200],
          caption: 'Рисунок 1',
        }),
      ],
    });
  });

  it('normalizes the Docling 2.118 table and image shape without provenance gaps', () => {
    const document = normalizeDoclingDocument({
      schema_name: 'DoclingDocument',
      version: '1.9.0',
      name: 'deck',
      origin: {
        filename: 'deck.pptx',
        mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
      pages: {},
      texts: [{ self_ref: '#/texts/0', label: 'text', text: 'Диаграмма продаж', prov: [] }],
      pictures: [
        {
          self_ref: '#/pictures/0',
          prov: [],
          image: { uri: 'data:image/png;base64,AAECAw==' },
          annotations: [{ kind: 'description', text: 'Рост продаж' }],
        },
      ],
      tables: [
        {
          self_ref: '#/tables/0',
          prov: [{ page_no: 3, bbox: { l: 5, t: 55, r: 105, b: 5 } }],
          data: {
            num_rows: 2,
            num_cols: 2,
            table_cells: [
              {
                text: 'Квартал',
                start_row_offset_idx: 0,
                start_col_offset_idx: 0,
                row_span: 1,
                col_span: 1,
                column_header: true,
              },
              {
                text: 'Q1',
                start_row_offset_idx: 1,
                start_col_offset_idx: 0,
                row_span: 1,
                col_span: 2,
              },
            ],
          },
        },
      ],
    });

    expect(document.metadata.page_count).toBe(3);
    expect(document.texts[0]).toMatchObject({
      id: '#/texts/0',
      page_no: 1,
      type: 'text',
    });
    expect(document.pictures[0]).toMatchObject({
      id: '#/pictures/0',
      page_no: 1,
      data: 'AAECAw==',
      ocr_text: 'Рост продаж',
    });
    expect(document.tables[0]).toMatchObject({
      id: '#/tables/0',
      page_no: 3,
      num_rows: 2,
      num_cols: 2,
      cells: [
        [{ text: 'Квартал', rowspan: 1, colspan: 1, is_header: true }],
        [{ text: 'Q1', rowspan: 1, colspan: 2, is_header: false }],
      ],
    });
  });

  it('rejects malformed payloads instead of silently producing empty metadata', () => {
    expect(() => normalizeDoclingDocument({ texts: 'not-an-array' })).toThrow(
      'Invalid Docling document'
    );
  });
});
