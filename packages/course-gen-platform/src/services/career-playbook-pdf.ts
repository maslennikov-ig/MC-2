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
const MAX_PDF_SOURCE_CHARS = 240_000;
const MAX_MERMAID_DIAGRAMS = 20;
const MAX_MERMAID_SOURCE_CHARS = 20_000;
const PDF_RENDER_TIMEOUT_MS = 60_000;
const MAX_CONCURRENT_PDF_RENDERS = 2;

let activePdfRenders = 0;
const pdfRenderQueue: Array<() => void> = [];

async function withPdfRenderSlot<T>(render: () => Promise<T>): Promise<T> {
  if (activePdfRenders >= MAX_CONCURRENT_PDF_RENDERS) {
    await new Promise<void>(resolve => {
      pdfRenderQueue.push(resolve);
    });
  }

  activePdfRenders += 1;
  try {
    return await render();
  } finally {
    activePdfRenders -= 1;
    pdfRenderQueue.shift()?.();
  }
}

async function withTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, PDF_RENDER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sourceTexts(input: CareerPlaybookPdfInput): string[] {
  if (input.finalMarkdown?.trim()) return [input.finalMarkdown.trim()];
  const blockTexts = Object.values(input.generatedBlocks).flatMap(block =>
    block ? [block.content] : []
  );
  return blockTexts;
}

function mermaidSourcesFromText(text: string): string[] {
  const sources: string[] = [];
  const mermaidFence = /```mermaid\s*([\s\S]*?)```/giu;
  let match: RegExpExecArray | null;
  while ((match = mermaidFence.exec(text)) !== null) {
    sources.push(match[1] ?? '');
  }
  return sources;
}

function assertPdfInputWithinLimits(input: CareerPlaybookPdfInput): void {
  const texts = sourceTexts(input);
  const sourceLength = texts.reduce((total, value) => total + value.length, 0);
  if (sourceLength > MAX_PDF_SOURCE_CHARS) {
    throw new Error('Career Playbook PDF source is too large');
  }

  const mermaidSources = texts.flatMap(mermaidSourcesFromText);
  if (mermaidSources.length > MAX_MERMAID_DIAGRAMS) {
    throw new Error('Career Playbook PDF contains too many Mermaid diagrams');
  }

  if (mermaidSources.some(source => source.length > MAX_MERMAID_SOURCE_CHARS)) {
    throw new Error('Career Playbook PDF contains an oversized Mermaid diagram');
  }
}

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
  assertPdfInputWithinLimits(input);
  return withPdfRenderSlot(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await withTimeout(
        createCareerPlaybookPdfPage(browser, input),
        'Career Playbook PDF rendering timed out'
      );
      return await withTimeout(page.content(), 'Career Playbook PDF HTML extraction timed out');
    } finally {
      await browser.close();
    }
  });
}

export async function renderCareerPlaybookPdf(
  input: CareerPlaybookPdfInput
): Promise<CareerPlaybookPdfResult> {
  assertPdfInputWithinLimits(input);
  return withPdfRenderSlot(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await withTimeout(
        createCareerPlaybookPdfPage(browser, input),
        'Career Playbook PDF rendering timed out'
      );
      const buffer = await withTimeout(
        page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        }),
        'Career Playbook PDF generation timed out'
      );
      return {
        buffer,
        fileName: pdfFileName(input.positionTitle),
        contentType: 'application/pdf',
      };
    } finally {
      await browser.close();
    }
  });
}
