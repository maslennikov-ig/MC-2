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

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function collectMarkdown(input: CareerPlaybookPdfInput): string {
  if (input.finalMarkdown?.trim()) return input.finalMarkdown.trim();
  return BLOCK_ORDER.map(blockId => input.generatedBlocks[blockId]?.content?.trim())
    .filter((content): content is string => Boolean(content))
    .join('\n\n');
}

function extractBlockHeadings(markdown: string): Array<{ id: string; label: string }> {
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)]
    .map(match => stripMarkdownInline(match[1] ?? ''))
    .filter(label => label && !/^header$/i.test(label))
    .slice(0, 26);

  return headings.map((label, index) => ({ id: `block-${index + 1}`, label }));
}

function renderTable(rows: string[]): string {
  const parsedRows = rows
    .map(row =>
      row
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map(cell => cell.trim())
    )
    .filter(row => row.length > 1);
  if (parsedRows.length === 0) return '';

  const [header, separator, ...body] = parsedRows;
  const hasSeparator = separator?.every(cell => /^:?-{3,}:?$/.test(cell));
  const bodyRows = hasSeparator ? body : parsedRows.slice(1);
  return `<table><thead><tr>${header
    .map(cell => `<th>${renderInlineMarkdown(cell)}</th>`)
    .join('')}</tr></thead><tbody>${bodyRows
    .map(row => `<tr>${row.map(cell => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function renderParagraph(lines: string[]): string {
  const text = lines.join(' ').trim();
  return text ? `<p>${renderInlineMarkdown(text)}</p>` : '';
}

function renderMermaidFigure(source: string, diagramIndex: number): string {
  const trimmedSource = source.trim();
  return `<figure class="mermaid-figure"><div class="mermaid-diagram" id="mermaid-diagram-${diagramIndex}" data-mermaid-source="${escapeAttribute(trimmedSource)}"><pre>${escapeHtml(trimmedSource)}</pre></div></figure>`;
}

function renderCodeBlock(codeLanguage: string, codeLines: string[]): string {
  return `<pre class="code-block"><code data-language="${escapeAttribute(codeLanguage)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`;
}

function renderMarkdownBody(markdown: string): string {
  const htmlChunks: string[] = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let tableRows: string[] = [];
  let inCodeFence = false;
  let codeLanguage = '';
  let codeLines: string[] = [];
  let blockNumber = 0;
  let diagramNumber = 0;

  const flushParagraph = () => {
    const rendered = renderParagraph(paragraph);
    if (rendered) htmlChunks.push(rendered);
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length === 0) return;
    htmlChunks.push(
      `<ul>${listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`
    );
    listItems = [];
  };
  const flushTable = () => {
    if (tableRows.length > 0) htmlChunks.push(renderTable(tableRows));
    tableRows = [];
  };
  const flushFlow = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const line of lines) {
    const codeFence = /^```([a-zA-Z0-9_-]*)?\s*$/.exec(line);
    if (codeFence) {
      if (inCodeFence) {
        if (codeLanguage.toLowerCase() === 'mermaid') {
          diagramNumber += 1;
          htmlChunks.push(renderMermaidFigure(codeLines.join('\n'), diagramNumber));
        } else {
          htmlChunks.push(renderCodeBlock(codeLanguage, codeLines));
        }
        inCodeFence = false;
        codeLanguage = '';
        codeLines = [];
      } else {
        flushFlow();
        inCodeFence = true;
        codeLanguage = codeFence[1] ?? '';
      }
      continue;
    }
    if (inCodeFence) {
      codeLines.push(line);
      continue;
    }

    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) {
      flushFlow();
      htmlChunks.push(`<h1>${renderInlineMarkdown(stripMarkdownInline(h1[1] ?? ''))}</h1>`);
      continue;
    }
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      flushFlow();
      const label = stripMarkdownInline(h2[1] ?? '');
      if (/^header$/i.test(label)) {
        htmlChunks.push(`<h2>${renderInlineMarkdown(label)}</h2>`);
        continue;
      }

      blockNumber += 1;
      htmlChunks.push(
        `<h2 id="block-${blockNumber}" class="playbook-block-heading">${renderInlineMarkdown(label)}</h2>`
      );
      continue;
    }
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      flushFlow();
      htmlChunks.push(`<h3>${renderInlineMarkdown(stripMarkdownInline(h3[1] ?? ''))}</h3>`);
      continue;
    }
    if (/^\s*\|.+\|\s*$/.test(line)) {
      flushParagraph();
      flushList();
      tableRows.push(line);
      continue;
    }
    const listItem = /^\s*[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph();
      flushTable();
      listItems.push(listItem[1] ?? '');
      continue;
    }
    if (line.trim() === '') {
      flushFlow();
      continue;
    }
    flushList();
    flushTable();
    paragraph.push(line.trim());
  }

  if (inCodeFence) {
    if (codeLanguage.toLowerCase() === 'mermaid') {
      diagramNumber += 1;
      htmlChunks.push(renderMermaidFigure(codeLines.join('\n'), diagramNumber));
    } else {
      htmlChunks.push(renderCodeBlock(codeLanguage, codeLines));
    }
  }
  flushFlow();
  return htmlChunks.join('\n');
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

function renderTableOfContents(items: Array<{ id: string; label: string }>): string {
  return `<nav class="pdf-toc" aria-label="Table of contents"><h2>Table of contents</h2><ol>${items
    .map(item => `<li><a href="#${item.id}">${escapeHtml(item.label)}</a></li>`)
    .join('')}</ol></nav>`;
}

const PRINT_CSS = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body {
  color: #172033;
  font-family: Inter, Arial, sans-serif;
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
  break-before: page;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 4mm;
}
h1 { color: #0f172a; font-size: 24pt; line-height: 1.15; margin: 0 0 8mm; }
h2 { color: #0f172a; font-size: 18pt; line-height: 1.2; margin: 0 0 5mm; }
h3 { color: #1e293b; font-size: 14pt; margin: 8mm 0 3mm; }
p, ul, table, .mermaid-figure, .code-block { margin: 0 0 4mm; }
ul { padding-left: 6mm; }
li { margin-bottom: 1.5mm; }
table { border-collapse: collapse; break-inside: avoid; width: 100%; }
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
.mermaid-diagram svg { height: auto !important; max-width: 100% !important; }
`;

export function buildCareerPlaybookPdfHtml(input: CareerPlaybookPdfInput): string {
  const markdown = collectMarkdown(input);
  const title = input.positionTitle ?? 'Career Playbook';
  const body = renderMarkdownBody(markdown);

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
    <p class="cover-note">A practical role guide for expectations, operating rhythm, decision boundaries, onboarding, risks, and implementation.</p>
  </section>
  ${renderTableOfContents(extractBlockHeadings(markdown))}
  <main class="pdf-content">${body}</main>
</body>
</html>`;
}
