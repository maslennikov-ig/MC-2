import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
import {
  buildCareerPlaybookPdfHtml,
  renderCareerPlaybookPdf,
  renderCareerPlaybookPdfHtml,
  type CareerPlaybookPdfInput,
} from '../../../src/services/career-playbook-pdf';

function blockState(content: string): CareerPlaybookBlockState {
  return {
    content,
    status: 'generated',
    attempt: 1,
  };
}

function createPdfInput(): CareerPlaybookPdfInput {
  const generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> = {
    header: blockState(`# Revenue Operations Lead

Role Guide for the Revenue Operations Lead. This guide aligns teams around mission, metrics, decisions, and operating rituals.`),
  };

  for (let index = 1; index <= 26; index += 1) {
    const blockId = `block_${index}`;
    generatedBlocks[blockId] = blockState(`## ${index}. Block ${index} Title

This block contains practical guidance for the role. It includes owners, examples, risks, and measurable outcomes.

The manager should use this section as an operating contract, not as generic inspiration. It should be specific enough for a new employee to understand what good work looks like, what trade-offs are expected, and how success will be reviewed in the first ninety days.

Every recommendation in this block is written for repeated use during onboarding, weekly reviews, hiring calibration, and performance conversations. The role owner can copy the checklist into a working document, discuss it with stakeholders, and refine it as the team learns more about the position.

Use the detail here to prevent vague delegation. When the team disagrees about priority, the role owner should point back to the agreed standard, name the decision being made, and capture the trade-off so the next review starts from evidence rather than memory.

| Area | Detail | Owner |
| --- | --- | --- |
| Focus ${index} | Use a concrete observable standard for this responsibility. | Manager |
| Review ${index} | Revisit the standard during weekly operating cadence. | Role owner |
| Evidence ${index} | Keep examples, source links, and decision notes near the work so expectations remain auditable. | Team lead |
| Risk ${index} | Escalate ambiguity early when ownership, metric definitions, or stakeholder expectations diverge. | Role owner |
| Cadence ${index} | Convert this guidance into a repeated agenda item so the behavior is visible before a quarterly review. | Manager |

- First operating behavior for block ${index}
- Second operating behavior for block ${index}
- Third operating behavior for block ${index}
- Fourth operating behavior for block ${index}
- Fifth operating behavior for block ${index}
- Sixth operating behavior for block ${index}`);
  }

  generatedBlocks.block_10 = blockState(`## 10. Block 10 Title

The role connects sales, marketing, finance, and customer success.

\`\`\`mermaid
flowchart LR
  Sales["Sales"] --> RevOps["Revenue Operations Lead"]
  RevOps --> Finance["Finance"]
  RevOps --> CS["Customer Success"]
\`\`\``);

  return {
    playbookId: '33333333-3333-4333-8333-333333333333',
    positionTitle: 'Revenue Operations Lead',
    department: 'Revenue',
    level: 'Lead',
    language: 'en',
    generatedBlocks,
    finalMarkdown: null,
    completedAt: '2026-05-19T08:00:00.000Z',
  };
}

describe('career-playbook-pdf service', () => {
  it('builds print HTML with cover, table of contents, all 26 blocks, and Mermaid placeholders', () => {
    const html = buildCareerPlaybookPdfHtml(createPdfInput());

    expect(html).toContain('<title>Revenue Operations Lead - Career Playbook</title>');
    expect(html).toContain('class="pdf-cover"');
    expect(html).toContain('Table of contents');
    expect(html).toContain('@page');
    expect(html).toContain('data-mermaid-source');
    // Block headings must NOT force a page break. Doing so produced three fully
    // blank pages in the 2026-08-11 export; the heading now merely refuses to be
    // separated from the content it introduces.
    expect(html).toMatch(/\.playbook-block-heading\s*\{[^}]*break-before:\s*auto/);
    expect(html).toMatch(/\.playbook-block-heading\s*\{[^}]*break-after:\s*avoid/);

    for (let index = 1; index <= 26; index += 1) {
      expect(html).toContain(`Block ${index} Title`);
      expect(html).toContain(`href="#block-${index}"`);
    }
  });

  it('builds the table of contents from the 26 content blocks and excludes the header block', () => {
    const input = createPdfInput();
    input.generatedBlocks.header = blockState(`## Header

Revenue Operations Lead overview.`);

    const html = buildCareerPlaybookPdfHtml(input);
    const toc = /<nav class="pdf-toc"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';

    expect(toc).not.toContain('Header');
    expect(toc).toContain('Block 1 Title');
    expect(toc).toContain('Block 26 Title');
    expect(toc).toContain('href="#block-26"');
    expect(toc).not.toContain('>1. Block 1 Title<');
    expect(toc).not.toContain('>26. Block 26 Title<');
  });

  it('localizes static PDF chrome for Russian playbooks', () => {
    const input = createPdfInput();
    input.language = 'ru';

    const html = buildCareerPlaybookPdfHtml(input);

    expect(html).toContain('<title>Revenue Operations Lead - Career Playbook</title>');
    expect(html).toContain('Оглавление');
    expect(html).toContain('Практический Role Guide');
    expect(html).not.toContain('Table of contents');
    expect(html).not.toContain('A practical role guide');
  });

  it('keeps Mermaid figure markup intact before browser rendering', () => {
    const html = buildCareerPlaybookPdfHtml(createPdfInput());

    expect(html).toContain('<figure class="mermaid-figure"><div class="mermaid-diagram"');
    expect(html).toContain('</div></figure>');
    expect(html).not.toContain('&lt;/pre&gt;&lt;/div&gt;&lt;/figure&gt;');
    expect(html).not.toContain('<p>  Sales');
  });

  it('renders Mermaid diagrams to inline SVG before PDF generation', async () => {
    const html = await renderCareerPlaybookPdfHtml(createPdfInput());

    expect(html).toContain('class="mermaid-diagram"');
    expect(html).toContain('<svg');
    expect(html).toContain('Sales');
    expect(html).toContain('Finance');
  }, 60_000);

  it('renders a downloadable A4 PDF containing all block titles and inline diagram text', async () => {
    const result = await renderCareerPlaybookPdf(createPdfInput());

    expect(result.contentType).toBe('application/pdf');
    expect(result.fileName).toBe('career-playbook-revenue-operations-lead.pdf');
    expect(result.buffer.byteLength).toBeGreaterThan(100_000);

    const parser = new PDFParse({ data: result.buffer });
    const text = await parser.getText();

    expect(text.text).toContain('Revenue Operations Lead');
    expect(text.text).toContain('Table of contents');
    expect(text.text).toContain('Block 1 Title');
    expect(text.text).toContain('Block 26 Title');
    expect(text.text).toContain('Sales');
    expect(text.text).toContain('Finance');
  }, 60_000);

  it('rejects oversized markdown before launching browser rendering', async () => {
    const input = createPdfInput();
    input.finalMarkdown = '# Oversized\n\n'.concat('A'.repeat(260_000));

    await expect(renderCareerPlaybookPdf(input)).rejects.toThrow(
      'Career Playbook PDF source is too large'
    );
  });

  it('rejects too many Mermaid diagrams before launching browser rendering', async () => {
    const input = createPdfInput();
    input.generatedBlocks.block_1 = blockState(
      Array.from(
        { length: 21 },
        (_, index) => `\`\`\`mermaid\nflowchart LR\n  A${index} --> B${index}\n\`\`\``
      ).join('\n\n')
    );

    await expect(renderCareerPlaybookPdf(input)).rejects.toThrow(
      'Career Playbook PDF contains too many Mermaid diagrams'
    );
  });

  it('validates the final markdown only when completed playbooks also keep generated blocks', async () => {
    const input = createPdfInput();
    input.finalMarkdown = '# Final Role Guide\n\n## 1. Mission\n\nUse the assembled guide.';

    for (let index = 1; index <= 26; index += 1) {
      input.generatedBlocks[`block_${index}`] = blockState('A'.repeat(20_000));
    }

    const result = await renderCareerPlaybookPdf(input);

    expect(result.contentType).toBe('application/pdf');
  }, 60_000);
});

/**
 * Regression fixture for the Markdown constructs the hand-rolled renderer did
 * not understand. Each one printed as raw text in the reviewed 60-page export
 * (`#### Bucket ...` on page 14, nine `---` rules, 37 ordered-list lines split
 * into paragraphs), and links were not rendered at all — which would have broken
 * the source citations the quality contract now requires.
 */
const MARKDOWN_CONSTRUCT_FIXTURE = `## 1. Every supported construct

### Third level

#### Fourth level

##### Fifth level

Intro paragraph with **bold**, *italic*, \`inline code\` and a [source link](https://example.com/source).

---

1. First ordered item
2. Second ordered item
3. Third ordered item

- Bullet item
  - Nested bullet item
- Another bullet

> A block quote that must not print its marker.

| Column A | Column B |
| --- | --- |
| Value ✅ | Value ⚠️ |

\`\`\`mermaid
flowchart LR
  A["Start"] --> B["End"]
\`\`\`

\`\`\`ts
const answer = 42;
\`\`\`
`;

describe('career-playbook-pdf markdown fidelity', () => {
  function fixtureInput(): CareerPlaybookPdfInput {
    return {
      playbookId: '44444444-4444-4444-8444-444444444444',
      positionTitle: 'Markdown Fixture',
      department: 'Quality',
      level: 'Lead',
      language: 'en',
      generatedBlocks: { block_1: blockState(MARKDOWN_CONSTRUCT_FIXTURE) },
      finalMarkdown: MARKDOWN_CONSTRUCT_FIXTURE,
      completedAt: '2026-08-11T08:44:06.610Z',
    };
  }

  it('renders every construct as HTML with no raw Markdown left in the body', () => {
    const html = buildCareerPlaybookPdfHtml(fixtureInput());
    const body = /<main class="pdf-content">([\s\S]*)<\/main>/.exec(html)?.[1] ?? '';

    expect(body).toContain('<h3>Third level</h3>');
    expect(body).toContain('<h4>Fourth level</h4>');
    expect(body).toContain('<h5>Fifth level</h5>');
    expect(body).toContain('<hr>');
    expect(body).toContain('<ol>');
    expect(body).toContain('<blockquote>');
    expect(body).toContain('<table>');
    expect(body).toContain('<a href="https://example.com/source">source link</a>');
    expect(body).toContain('<strong>bold</strong>');
    expect(body).toContain('<code>inline code</code>');
    // Nested list survives as a real nesting rather than a flattened one.
    expect(body).toMatch(/<ul>[\s\S]*<ul>/);

    // The defect this fixture exists for: no construct may survive as literal text.
    expect(body).not.toMatch(/^#{1,6}\s/m);
    expect(body).not.toMatch(/^---\s*$/m);
    expect(body).not.toMatch(/^\d+\.\s/m);
    expect(body).not.toMatch(/\[[^\]]+\]\(https?:[^)]+\)/);
  });

  it('keeps the Mermaid fence as a figure and the plain fence as a code block', () => {
    const html = buildCareerPlaybookPdfHtml(fixtureInput());

    expect(html).toContain('data-mermaid-source');
    expect(html).toContain('<pre class="code-block"><code data-language="ts">');
    expect(html).not.toContain('data-language="mermaid"');
  });

  it('constrains diagram height so a tall diagram cannot be clipped across pages', () => {
    const html = buildCareerPlaybookPdfHtml(fixtureInput());

    expect(html).toMatch(/\.mermaid-diagram svg\s*\{[^}]*max-height:\s*200mm/);
  });

  it('declares a symbol-capable font so check and warning glyphs render', () => {
    const html = buildCareerPlaybookPdfHtml(fixtureInput());

    expect(html).toMatch(/font-family:[^;]*Noto Sans/);
  });

  it('produces a PDF with no fully blank page', async () => {
    const result = await renderCareerPlaybookPdf(fixtureInput());
    const parser = new PDFParse({ data: new Uint8Array(result.buffer) });

    try {
      const parsed = await parser.getText();
      const pages = parsed.pages ?? [];

      expect(pages.length).toBeGreaterThan(0);
      // The cover is intentionally image-like but still carries the title; every
      // other page must contain readable text. A page with nothing on it is the
      // layout artefact this fixture guards against.
      const blankPages = pages
        .map((page, index) => ({ index, text: (page.text ?? '').trim() }))
        .filter(page => page.text.length === 0);

      expect(blankPages.map(page => page.index)).toEqual([]);
    } finally {
      await parser.destroy();
    }
  }, 60_000);
});
