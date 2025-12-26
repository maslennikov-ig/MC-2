'use client';

import * as React from 'react';
import { useEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';
import { cn } from '@/lib/utils';
import type { MermaidDiagramProps } from '../types';

/**
 * Theme colors for dark mode
 */
const DARK_COLORS = {
  nodeBg: '#1e3a5f',        // dark blue node bg
  nodeText: '#f1f5f9',      // slate-100
  nodeBorder: '#38bdf8',    // sky-400
  lineColor: '#94a3b8',     // slate-400
  textColor: '#e2e8f0',     // slate-200
  clusterBg: '#1e293b',     // slate-800
  clusterBorder: '#475569', // slate-600
};

/**
 * Theme colors for light mode
 */
const LIGHT_COLORS = {
  nodeBg: '#e0f2fe',        // sky-100
  nodeText: '#0f172a',      // slate-900
  nodeBorder: '#0ea5e9',    // sky-500
  lineColor: '#64748b',     // slate-500
  textColor: '#334155',     // slate-700
  clusterBg: '#f1f5f9',     // slate-100
  clusterBorder: '#cbd5e1', // slate-300
};

/**
 * Mermaid default colors that need to be replaced
 */
const MERMAID_DEFAULT_COLORS = [
  '#f9f', '#ff0', '#faf', '#faa', '#afa', '#aff', '#aaf',
  '#ffcccc', '#ffffcc', '#ccffcc', '#ccccff', '#ffccff',
  'rgb(255, 153, 255)', 'rgb(255, 255, 0)',
  '#ECECFF', '#9370DB', '#8B008B',
  '#f2f2f2', '#ececff',
];

/**
 * Post-process SVG to replace Mermaid's default colors with our theme colors
 */
function postProcessSvg(container: HTMLElement, isDark: boolean): void {
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  // Replace default colors in all elements
  container.querySelectorAll('*').forEach((el) => {
    const element = el as SVGElement;

    const fill = element.getAttribute('fill');
    if (fill) {
      const normalizedFill = fill.toLowerCase().trim();
      if (MERMAID_DEFAULT_COLORS.some(c => normalizedFill === c.toLowerCase())) {
        element.setAttribute('fill', colors.nodeBg);
      }
    }

    if (element.style?.fill) {
      const styleFill = element.style.fill.toLowerCase().trim();
      if (MERMAID_DEFAULT_COLORS.some(c => styleFill === c.toLowerCase() || styleFill.includes(c.toLowerCase()))) {
        element.style.fill = colors.nodeBg;
      }
    }

    const stroke = element.getAttribute('stroke');
    if (stroke) {
      const normalizedStroke = stroke.toLowerCase().trim();
      if (MERMAID_DEFAULT_COLORS.some(c => normalizedStroke === c.toLowerCase())) {
        element.setAttribute('stroke', colors.nodeBorder);
      }
    }
  });

  // Force node styling
  container.querySelectorAll('.node rect, .node circle, .node ellipse, .node polygon, .node path').forEach((el) => {
    const element = el as SVGElement;
    element.setAttribute('fill', colors.nodeBg);
    element.setAttribute('stroke', colors.nodeBorder);
  });

  // Force text colors
  container.querySelectorAll('.nodeLabel, .node text, .label text').forEach((el) => {
    const element = el as SVGElement;
    element.setAttribute('fill', colors.nodeText);
    element.style.fill = colors.nodeText;
  });

  // Force edge/arrow colors
  container.querySelectorAll('.edge-pattern-solid, .flowchart-link, path.path').forEach((el) => {
    const element = el as SVGElement;
    element.setAttribute('stroke', colors.lineColor);
  });

  // Force arrowhead colors
  container.querySelectorAll('marker path').forEach((el) => {
    const element = el as SVGElement;
    element.setAttribute('fill', colors.lineColor);
  });
}

/**
 * Tailwind-compatible dark theme for Mermaid
 * Designed for dark backgrounds (~#0f172a / slate-900)
 */
const darkThemeVariables = {
  darkMode: true,
  // Primary nodes (rectangles [text])
  primaryColor: DARK_COLORS.nodeBg,
  primaryTextColor: DARK_COLORS.nodeText,
  primaryBorderColor: DARK_COLORS.nodeBorder,
  // Secondary nodes (rounded (text), stadium ([text]))
  secondaryColor: DARK_COLORS.nodeBg,
  secondaryTextColor: DARK_COLORS.nodeText,
  secondaryBorderColor: DARK_COLORS.nodeBorder,
  // Tertiary nodes (other shapes)
  tertiaryColor: DARK_COLORS.nodeBg,
  tertiaryTextColor: DARK_COLORS.nodeText,
  tertiaryBorderColor: DARK_COLORS.nodeBorder,
  // Background and general
  background: 'transparent',
  mainBkg: DARK_COLORS.clusterBg,
  // Node background and borders
  nodeBkg: DARK_COLORS.nodeBg,
  nodeBorder: DARK_COLORS.nodeBorder,
  nodeTextColor: DARK_COLORS.nodeText,
  // Lines and arrows
  lineColor: DARK_COLORS.lineColor,
  arrowheadColor: DARK_COLORS.lineColor,
  textColor: DARK_COLORS.textColor,
  // Clusters/subgraphs
  clusterBkg: DARK_COLORS.clusterBg,
  clusterBorder: DARK_COLORS.clusterBorder,
  // Labels
  edgeLabelBackground: DARK_COLORS.clusterBg,
  labelBoxBkgColor: DARK_COLORS.clusterBg,
  labelBoxBorderColor: DARK_COLORS.clusterBorder,
  labelTextColor: DARK_COLORS.textColor,
  // Color scale for different node types (cScale0-11)
  // All set to same color for consistency
  cScale0: DARK_COLORS.nodeBg,
  cScale1: DARK_COLORS.nodeBg,
  cScale2: DARK_COLORS.nodeBg,
  cScale3: DARK_COLORS.nodeBg,
  cScale4: DARK_COLORS.nodeBg,
  cScale5: DARK_COLORS.nodeBg,
  cScale6: DARK_COLORS.nodeBg,
  cScale7: DARK_COLORS.nodeBg,
  cScale8: DARK_COLORS.nodeBg,
  cScale9: DARK_COLORS.nodeBg,
  cScale10: DARK_COLORS.nodeBg,
  cScale11: DARK_COLORS.nodeBg,
  // Color scale labels
  cScaleLabel0: DARK_COLORS.nodeText,
  cScaleLabel1: DARK_COLORS.nodeText,
  cScaleLabel2: DARK_COLORS.nodeText,
  cScaleLabel3: DARK_COLORS.nodeText,
  cScaleLabel4: DARK_COLORS.nodeText,
  cScaleLabel5: DARK_COLORS.nodeText,
  cScaleLabel6: DARK_COLORS.nodeText,
  cScaleLabel7: DARK_COLORS.nodeText,
  cScaleLabel8: DARK_COLORS.nodeText,
  cScaleLabel9: DARK_COLORS.nodeText,
  cScaleLabel10: DARK_COLORS.nodeText,
  cScaleLabel11: DARK_COLORS.nodeText,
  // Font
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
};

/**
 * Tailwind-compatible light theme for Mermaid
 * Designed for light/white backgrounds
 */
const lightThemeVariables = {
  // Primary nodes (rectangles [text])
  primaryColor: LIGHT_COLORS.nodeBg,
  primaryTextColor: LIGHT_COLORS.nodeText,
  primaryBorderColor: LIGHT_COLORS.nodeBorder,
  // Secondary nodes (rounded (text), stadium ([text]))
  secondaryColor: LIGHT_COLORS.nodeBg,
  secondaryTextColor: LIGHT_COLORS.nodeText,
  secondaryBorderColor: LIGHT_COLORS.nodeBorder,
  // Tertiary nodes (other shapes)
  tertiaryColor: LIGHT_COLORS.nodeBg,
  tertiaryTextColor: LIGHT_COLORS.nodeText,
  tertiaryBorderColor: LIGHT_COLORS.nodeBorder,
  // Background and general
  background: 'transparent',
  mainBkg: LIGHT_COLORS.clusterBg,
  // Node background and borders
  nodeBkg: LIGHT_COLORS.nodeBg,
  nodeBorder: LIGHT_COLORS.nodeBorder,
  nodeTextColor: LIGHT_COLORS.nodeText,
  // Lines and arrows
  lineColor: LIGHT_COLORS.lineColor,
  arrowheadColor: LIGHT_COLORS.lineColor,
  textColor: LIGHT_COLORS.textColor,
  // Clusters/subgraphs
  clusterBkg: LIGHT_COLORS.clusterBg,
  clusterBorder: LIGHT_COLORS.clusterBorder,
  // Labels
  edgeLabelBackground: '#ffffff',
  labelBoxBkgColor: '#ffffff',
  labelBoxBorderColor: LIGHT_COLORS.clusterBorder,
  labelTextColor: LIGHT_COLORS.textColor,
  // Color scale for different node types (cScale0-11)
  // All set to same color for consistency
  cScale0: LIGHT_COLORS.nodeBg,
  cScale1: LIGHT_COLORS.nodeBg,
  cScale2: LIGHT_COLORS.nodeBg,
  cScale3: LIGHT_COLORS.nodeBg,
  cScale4: LIGHT_COLORS.nodeBg,
  cScale5: LIGHT_COLORS.nodeBg,
  cScale6: LIGHT_COLORS.nodeBg,
  cScale7: LIGHT_COLORS.nodeBg,
  cScale8: LIGHT_COLORS.nodeBg,
  cScale9: LIGHT_COLORS.nodeBg,
  cScale10: LIGHT_COLORS.nodeBg,
  cScale11: LIGHT_COLORS.nodeBg,
  // Color scale labels
  cScaleLabel0: LIGHT_COLORS.nodeText,
  cScaleLabel1: LIGHT_COLORS.nodeText,
  cScaleLabel2: LIGHT_COLORS.nodeText,
  cScaleLabel3: LIGHT_COLORS.nodeText,
  cScaleLabel4: LIGHT_COLORS.nodeText,
  cScaleLabel5: LIGHT_COLORS.nodeText,
  cScaleLabel6: LIGHT_COLORS.nodeText,
  cScaleLabel7: LIGHT_COLORS.nodeText,
  cScaleLabel8: LIGHT_COLORS.nodeText,
  cScaleLabel9: LIGHT_COLORS.nodeText,
  cScaleLabel10: LIGHT_COLORS.nodeText,
  cScaleLabel11: LIGHT_COLORS.nodeText,
  // Font
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
};

/**
 * MermaidDirect component for rendering Mermaid diagrams using the direct API
 *
 * Uses mermaid.render() directly instead of iframe for more reliable rendering.
 * Automatically handles theme changes with Tailwind-compatible color schemes.
 *
 * @example
 * ```tsx
 * <MermaidDirect
 *   chart="graph TD\n  A-->B"
 *   ariaLabel="Simple flowchart from A to B"
 * />
 * ```
 */
export function MermaidDirect({ chart, className, ariaLabel }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const uniqueId = useId().replace(/:/g, '-'); // React's useId returns colons which aren't valid in IDs

  // Detect dark mode
  useEffect(() => {
    const checkDark = () => document.documentElement.classList.contains('dark');
    setIsDark(checkDark());

    const observer = new MutationObserver(() => {
      setIsDark(checkDark());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Render diagram
  useEffect(() => {
    if (!containerRef.current || !chart?.trim()) return;

    const renderDiagram = async () => {
      try {
        // Initialize mermaid with custom Tailwind-compatible theme
        // Using 'base' theme with themeVariables for full customization
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: isDark ? darkThemeVariables : lightThemeVariables,
          securityLevel: 'strict',
        });

        // Render the diagram
        const { svg, bindFunctions } = await mermaid.render(
          `mermaid-${uniqueId}`,
          chart.trim()
        );

        if (containerRef.current) {
          // Mermaid uses securityLevel: 'strict' which provides XSS protection
          containerRef.current.innerHTML = svg;

          // Post-process SVG to force our theme colors
          // This overrides any inline styles Mermaid may have applied
          postProcessSvg(containerRef.current, isDark);

          // Bind interactive functions if available
          if (bindFunctions) {
            bindFunctions(containerRef.current);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      }
    };

    renderDiagram();
  }, [chart, isDark, uniqueId]);

  if (error) {
    return (
      <figure className={cn('mermaid-error not-prose my-6', className)}>
        <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-4">
          <div className="text-destructive font-medium mb-2">Diagram Error</div>
          <div className="text-muted-foreground text-sm mb-2">{error}</div>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
            {chart}
          </pre>
        </div>
      </figure>
    );
  }

  return (
    <figure
      className={cn('mermaid-container not-prose my-6', className)}
      role="img"
      aria-label={ariaLabel || 'Mermaid diagram'}
    >
      <div
        ref={containerRef}
        className="mermaid-diagram flex justify-center p-4 rounded-lg bg-card border border-border overflow-x-auto"
      />
    </figure>
  );
}
