import { Marked, Renderer, type Tokens } from 'marked';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  Language,
} from '@megacampus/shared-types';

export interface CareerPlaybookPdfInput {
  playbookId: string;
  positionTitle: string | null;
  department: string | null;
  level: string | null;
  language: Language;
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  finalMarkdown: string | null;
  completedAt: string | null;
}

const BLOCK_ORDER: CareerPlaybookBlockId[] = [
  'header',
  ...Array.from({ length: 26 }, (_, index) => `block_${index + 1}`),
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, '&#10;');
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function stripLeadingHeadingNumber(value: string): string {
  return value.replace(/^\d+[.)]\s+/, '').trim();
}

function pdfChrome(language: Language): {
  tocLabel: string;
  coverNote: string;
} {
  if (language === 'ru') {
    return {
      tocLabel: 'Оглавление',
      coverNote:
        'Практический Role Guide: ожидания, рабочий ритм, границы решений, онбординг, риски и внедрение.',
    };
  }

  return {
    tocLabel: 'Table of contents',
    coverNote:
      'A practical role guide for expectations, operating rhythm, decision boundaries, onboarding, risks, and implementation.',
  };
}

/**
 * Status glyphs the guide uses in checklist tables, mapped to ASCII.
 *
 * Declaring a symbol-capable font family is not enough: the rendering container
 * has no font covering U+2705/U+26A0, so the glyph draws as an empty box — the
 * defect the 2026-08-11 review found on page 32, still reproducible after the
 * font-family change. Substitution is done here rather than in the content so
 * the Markdown export keeps the richer glyphs, which render fine anywhere a
 * system emoji font exists; only the PDF, where the failure actually happens,
 * falls back to text that is guaranteed to draw.
 */
const PDF_GLYPH_FALLBACKS: Array<[RegExp, string]> = [
  [/✅/g, '[OK]'],
  [/⚠️?/g, '[!]'],
  [/❌/g, '[X]'],
  [/\u{1F7E2}/gu, '[green]'],
  [/\u{1F7E1}/gu, '[yellow]'],
  [/\u{1F534}/gu, '[red]'],
];

export function replacePdfGlyphFallbacks(markdown: string): string {
  return PDF_GLYPH_FALLBACKS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    markdown
  );
}

function collectMarkdown(input: CareerPlaybookPdfInput): string {
  const markdown = input.finalMarkdown?.trim()
    ? input.finalMarkdown.trim()
    : BLOCK_ORDER.map(blockId => input.generatedBlocks[blockId]?.content?.trim())
        .filter((content): content is string => Boolean(content))
        .join('\n\n');

  return replacePdfGlyphFallbacks(markdown);
}

function extractBlockHeadings(markdown: string): Array<{ id: string; label: string }> {
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)]
    .map(match => stripMarkdownInline(match[1] ?? ''))
    .filter(label => label && !/^header$/i.test(label))
    .map(stripLeadingHeadingNumber)
    .filter(Boolean)
    .slice(0, 26);

  return headings.map((label, index) => ({ id: `block-${index + 1}`, label }));
}

function renderMermaidFigure(source: string, diagramIndex: number): string {
  const trimmedSource = source.trim();
  return `<figure class="mermaid-figure"><div class="mermaid-diagram" id="mermaid-diagram-${diagramIndex}" data-mermaid-source="${escapeAttribute(trimmedSource)}"><pre>${escapeHtml(trimmedSource)}</pre></div></figure>`;
}

function renderCodeBlock(codeLanguage: string, codeLines: string[]): string {
  return `<pre class="code-block"><code data-language="${escapeAttribute(codeLanguage)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`;
}

/**
 * Render the guide body to HTML.
 *
 * This used to be a hand-rolled line scanner that understood h1-h3, tables,
 * `-`/`*` lists and code fences, and dropped everything else into a paragraph
 * verbatim. The reviewed 60-page export therefore printed `#### Bucket ...` and
 * nine `---` rules as literal text, and split 37 ordered-list lines into
 * separate paragraphs. Links were not rendered at all, which would have broken
 * the source citations outright.
 *
 * A real parser closes that class of defect rather than the six known instances
 * of it. Three integrations are preserved through a custom renderer, because the
 * rest of the pipeline depends on them:
 *
 * - a `mermaid` fence must emit `data-mermaid-source` for `renderMermaidDiagrams`
 * - a block `##` heading must keep `id="block-N"` for the table of contents
 * - everything else must stay inside the print stylesheet's expectations
 */
function renderMarkdownBody(markdown: string): string {
  let blockNumber = 0;
  let diagramNumber = 0;

  const parser = new Marked({ gfm: true, breaks: false });
  parser.use({
    renderer: {
      code(this: Renderer, token: Tokens.Code) {
        if ((token.lang ?? '').toLowerCase() === 'mermaid') {
          diagramNumber += 1;
          return renderMermaidFigure(token.text, diagramNumber);
        }
        return renderCodeBlock(token.lang ?? '', token.text.split('\n'));
      },
      heading(this: Renderer, token: Tokens.Heading) {
        const inline = this.parser.parseInline(token.tokens);

        if (token.depth === 2) {
          const label = stripMarkdownInline(token.text);
          // The Header block is a title, not a numbered section: it carries no
          // table-of-contents anchor, matching extractBlockHeadings below.
          if (/^header$/i.test(label)) return `<h2>${inline}</h2>`;

          blockNumber += 1;
          return `<h2 id="block-${blockNumber}" class="playbook-block-heading">${inline}</h2>`;
        }

        return `<h${token.depth}>${inline}</h${token.depth}>`;
      },
    },
  });

  return parser.parse(markdown, { async: false });
}

function renderMetadata(input: CareerPlaybookPdfInput): string {
  const parts = [input.department, input.level, input.language.toUpperCase()].filter(
    (part): part is string => Boolean(part)
  );
  if (input.completedAt) {
    const locale = input.language === 'ru' ? 'ru-RU' : 'en-US';
    parts.push(new Intl.DateTimeFormat(locale).format(new Date(input.completedAt)));
  }
  return parts.map(part => `<span>${escapeHtml(part)}</span>`).join('');
}

function renderTableOfContents(
  items: Array<{ id: string; label: string }>,
  chrome: ReturnType<typeof pdfChrome>
): string {
  return `<nav class="pdf-toc" aria-label="${escapeAttribute(chrome.tocLabel)}"><h2>${escapeHtml(chrome.tocLabel)}</h2><ol>${items
    .map(item => `<li><a href="#${item.id}">${escapeHtml(item.label)}</a></li>`)
    .join('')}</ol></nav>`;
}

const PRINT_CSS = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body {
  color: #172033;
  /* Noto/DejaVu carry the check and warning glyphs the guide uses in checklist
     tables. Without a symbol-capable family they degraded to empty boxes on the
     reviewed export, because the container ships neither Inter nor a fallback
     that covers U+2705/U+26A0. */
  font-family: Inter, "Noto Sans", "DejaVu Sans", "Noto Sans Symbols 2", Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.55;
  margin: 0;
  background: #ffffff;
}
a { color: inherit; text-decoration: none; }
.pdf-cover {
  min-height: 245mm;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  break-after: page;
  padding: 10mm 0;
}
.brand {
  color: #475569;
  font-size: 10pt;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}
.pdf-cover h1 {
  color: #0f172a;
  font-size: 34pt;
  line-height: 1.05;
  margin: 28mm 0 8mm;
  max-width: 165mm;
}
.metadata { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10mm; }
.metadata span {
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #334155;
  padding: 3px 7px;
}
.cover-note {
  border-left: 3px solid #0f766e;
  color: #334155;
  font-size: 13pt;
  max-width: 150mm;
  padding-left: 6mm;
}
.pdf-toc { break-after: page; }
.pdf-toc h2,
.playbook-block-heading {
  color: #0f172a;
  font-size: 20pt;
  line-height: 1.2;
  margin: 0 0 8mm;
}
.pdf-toc ol { columns: 2; column-gap: 12mm; margin: 0; padding-left: 6mm; }
.pdf-toc li { break-inside: avoid; margin: 0 0 3mm; }
.playbook-block-heading {
  /* Was break-before: page. Forcing 26 unconditional page breaks, combined with
     break-inside: avoid on the figures below, produced three fully blank pages
     (20, 34, 57) in the reviewed export. Keeping the heading with its first
     paragraph achieves the same visual separation without the empty pages. */
  break-before: auto;
  break-after: avoid;
  margin-top: 10mm;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 4mm;
}
h1 { color: #0f172a; font-size: 24pt; line-height: 1.15; margin: 0 0 8mm; break-after: avoid; }
h2 { color: #0f172a; font-size: 18pt; line-height: 1.2; margin: 0 0 5mm; break-after: avoid; }
h3 { color: #1e293b; font-size: 14pt; margin: 8mm 0 3mm; break-after: avoid; }
h4 { color: #1e293b; font-size: 12pt; margin: 6mm 0 2mm; break-after: avoid; }
h5, h6 { color: #334155; font-size: 11pt; margin: 5mm 0 2mm; break-after: avoid; }
p, ul, ol, table, .mermaid-figure, .code-block, blockquote { margin: 0 0 4mm; }
/* Keep a lone first/last line from being stranded across a page boundary; the
   reviewed export left the FMEA tail on a quarter page and the FAQ continuation
   on a few lines. */
p, ul, ol, blockquote { orphans: 3; widows: 3; }
ul, ol { padding-left: 6mm; }
li { margin-bottom: 1.5mm; }
ul ul, ul ol, ol ul, ol ol { margin: 1.5mm 0 0; }
blockquote {
  border-left: 3px solid #cbd5e1;
  color: #334155;
  padding-left: 4mm;
}
hr { border: none; border-top: 1px solid #cbd5e1; margin: 6mm 0; }
.pdf-content a { color: #0f766e; text-decoration: underline; }
/* Long tables used to be pushed whole onto the next page. Break them by row and
   repeat the header instead, which removes the pushed-page whitespace. */
table { border-collapse: collapse; break-inside: auto; width: 100%; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td {
  border: 1px solid #cbd5e1;
  padding: 2.5mm;
  text-align: left;
  vertical-align: top;
}
th { background: #eef2f7; color: #0f172a; font-weight: 700; }
.code-block,
.mermaid-figure { break-inside: avoid; }
.code-block {
  background: #0f172a;
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 9pt;
  overflow: hidden;
  padding: 4mm;
  white-space: pre-wrap;
}
.mermaid-figure {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4mm;
}
.mermaid-diagram { display: flex; justify-content: center; width: 100%; }
/* max-height is what stops a tall diagram from being clipped across a page
   boundary — the revision-flow diagram was split between pages 58 and 59 with
   the bottom node cut off. 200mm leaves room for the figure padding inside the
   A4 text block. */
.mermaid-diagram svg {
  height: auto !important;
  max-width: 100% !important;
  max-height: 200mm !important;
}
`;

export function buildCareerPlaybookPdfHtml(input: CareerPlaybookPdfInput): string {
  const markdown = collectMarkdown(input);
  const title = input.positionTitle ?? 'Career Playbook';
  const body = renderMarkdownBody(markdown);
  const chrome = pdfChrome(input.language);

  return `<!doctype html>
<html lang="${escapeAttribute(input.language)}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} - Career Playbook</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <section class="pdf-cover">
    <div>
      <div class="brand">MC2 Career Playbook</div>
      <h1>${escapeHtml(title)}</h1>
      <div class="metadata">${renderMetadata(input)}</div>
    </div>
    <p class="cover-note">${escapeHtml(chrome.coverNote)}</p>
  </section>
  ${renderTableOfContents(extractBlockHeadings(markdown), chrome)}
  <main class="pdf-content">${body}</main>
</body>
</html>`;
}
