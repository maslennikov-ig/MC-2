import { createRequire } from 'node:module';
import { chromium, type Browser, type Page } from 'playwright';
import {
  buildCareerPlaybookPdfHtml,
  type CareerPlaybookPdfInput,
} from './career-playbook-pdf-template';

export { buildCareerPlaybookPdfHtml, type CareerPlaybookPdfInput };

export interface CareerPlaybookPdfResult {
  buffer: Buffer;
  fileName: string;
  contentType: 'application/pdf';
}

declare global {
  interface Window {
    mermaid: {
      initialize: (config: unknown) => void;
      render: (id: string, source: string) => Promise<{ svg: string }>;
    };
  }
}

const require = createRequire(import.meta.url);
const MERMAID_DIST_PATH = require.resolve('mermaid/dist/mermaid.min.js');

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яё]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return normalized || 'career-playbook';
}

function pdfFileName(positionTitle: string | null): string {
  return `career-playbook-${slugify(positionTitle ?? 'role-guide')}.pdf`;
}

async function renderMermaidDiagrams(page: Page): Promise<void> {
  const diagramCount = await page.locator('[data-mermaid-source]').count();
  if (diagramCount === 0) return;

  await page.addScriptTag({ path: MERMAID_DIST_PATH });
  await page.evaluate(async () => {
    const mermaidRenderer = window.mermaid;
    mermaidRenderer.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        primaryColor: '#e0f2fe',
        primaryTextColor: '#0f172a',
        primaryBorderColor: '#0f766e',
        lineColor: '#334155',
        secondaryColor: '#f8fafc',
        tertiaryColor: '#f1f5f9',
        fontFamily: 'Inter, Arial, sans-serif',
      },
      flowchart: {
        htmlLabels: false,
        useMaxWidth: true,
      },
    });

    const diagrams = Array.from(document.querySelectorAll<HTMLElement>('[data-mermaid-source]'));
    for (let index = 0; index < diagrams.length; index += 1) {
      const element = diagrams[index];
      const source = element.getAttribute('data-mermaid-source') || '';
      try {
        const result = await mermaidRenderer.render(`career-playbook-mermaid-${index}`, source);
        element.innerHTML = result.svg;
      } catch {
        const fallback = document.createElement('pre');
        fallback.textContent = source;
        element.replaceChildren(fallback);
      }
    }
  });
}

async function createCareerPlaybookPdfPage(
  browser: Browser,
  input: CareerPlaybookPdfInput
): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  await page.emulateMedia({ media: 'print' });
  await page.setContent(buildCareerPlaybookPdfHtml(input), {
    waitUntil: 'load',
    timeout: 30_000,
  });
  await renderMermaidDiagrams(page);
  return page;
}

export async function renderCareerPlaybookPdfHtml(input: CareerPlaybookPdfInput): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await createCareerPlaybookPdfPage(browser, input);
    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function renderCareerPlaybookPdf(
  input: CareerPlaybookPdfInput
): Promise<CareerPlaybookPdfResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await createCareerPlaybookPdfPage(browser, input);
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return {
      buffer,
      fileName: pdfFileName(input.positionTitle),
      contentType: 'application/pdf',
    };
  } finally {
    await browser.close();
  }
}
