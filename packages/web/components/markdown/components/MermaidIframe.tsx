'use client';

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { MermaidDiagramProps } from '../types';

/**
 * Mermaid CDN URL for loading the library
 */
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

/**
 * Minimal HTML escaping for Mermaid content
 *
 * Only escapes angle brackets (< >) which could break HTML structure.
 * Quotes and ampersands are preserved for Mermaid syntax compatibility.
 * The iframe is sandboxed without allow-same-origin, so XSS risks are mitigated.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for HTML insertion
 */
function escapeHtml(str: string): string {
  // Only escape angle brackets - quotes are needed for Mermaid subgraph labels etc.
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generates the complete HTML document for the iframe
 *
 * This creates a self-contained HTML page that loads Mermaid from CDN
 * and renders the provided chart with appropriate theme settings.
 *
 * Includes postMessage communication to dynamically adjust iframe height
 * after the diagram is rendered.
 *
 * @param chart - The Mermaid diagram syntax
 * @param isDark - Whether dark mode is active
 * @returns Complete HTML string for iframe srcdoc
 */
function generateMermaidHtml(chart: string, isDark: boolean): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body {
        margin: 0;
        padding: 16px;
        background: transparent;
        display: flex;
        justify-content: center;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .mermaid {
        max-width: 100%;
      }
    </style>
  </head>
  <body>
    <pre class="mermaid">${escapeHtml(chart)}</pre>
    <script type="module">
      import mermaid from '${MERMAID_CDN}';
      mermaid.initialize({
        startOnLoad: true,
        securityLevel: 'strict',
        theme: '${isDark ? 'dark' : 'default'}'
      });

      // Send height to parent after diagram renders
      window.addEventListener('load', () => {
        // Wait for Mermaid to finish rendering
        setTimeout(() => {
          const height = document.body.scrollHeight;
          window.parent.postMessage({ type: 'mermaid-height', height }, '*');
        }, 100);
      });
    </script>
  </body>
</html>`;
}

/**
 * MermaidIframe component for rendering Mermaid diagrams in a sandboxed iframe
 *
 * This component provides secure rendering of Mermaid diagrams by isolating
 * them in an iframe with restricted sandbox permissions. It automatically
 * detects and responds to theme changes (light/dark mode).
 *
 * Security features:
 * - Sandboxed iframe (only allow-scripts, NO allow-same-origin)
 * - HTML escaping to prevent XSS
 * - Mermaid securityLevel: 'strict'
 * - CDN-loaded library (no local execution)
 *
 * @example
 * ```tsx
 * <MermaidIframe
 *   chart="graph TD\n  A-->B"
 *   ariaLabel="Simple flowchart from A to B"
 * />
 * ```
 */
export function MermaidIframe({ chart, className, ariaLabel }: MermaidDiagramProps) {
  const [isDark, setIsDark] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(200);

  useEffect(() => {
    // Check if dark mode is currently active
    const checkDark = () => document.documentElement.classList.contains('dark');
    setIsDark(checkDark());

    // Observe class changes on the html element for theme switching
    const observer = new MutationObserver(() => {
      setIsDark(checkDark());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Listen for height updates from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'mermaid-height' && typeof e.data.height === 'number') {
        // Set height with minimum of 200px and add 32px for padding
        setIframeHeight(Math.max(200, e.data.height + 32));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Memoize the HTML generation to avoid unnecessary recalculations
  const srcdoc = useMemo(() => generateMermaidHtml(chart, isDark), [chart, isDark]);

  return (
    <figure className={cn('mermaid-container not-prose my-6', className)}>
      <iframe
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        title={ariaLabel || 'Mermaid diagram'}
        className="mermaid-iframe w-full border-0 rounded-lg border border-border bg-card"
        style={{ height: `${iframeHeight}px`, minHeight: '200px' }}
      />
    </figure>
  );
}
