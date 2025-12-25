# Beautiful Mermaid.js Custom Themes for Light and Dark Mode

**No community theme library exists for Mermaid.js**, but polished configurations are achievable with the right themeVariables. Only the `base` theme supports customization—Mermaid's theming engine accepts hex colors only (#ffffff), not CSS variables or color names. For your Next.js app with dark (#0f172a) and light backgrounds, the solutions below provide ready-to-use configurations and the best available resources.

## The best repository: gotoailab/modern_mermaid

The **most comprehensive theme collection** available is [gotoailab/modern_mermaid](https://github.com/gotoailab/modern_mermaid) with **214 stars**, offering 10+ polished themes including Linear Light/Dark, Cyberpunk, Industrial, Hand Drawn, and Studio Ghibli styles. It's built with React 19 and Tailwind CSS—directly compatible with your stack.

- **Live demo**: https://modern-mermaid.live/
- **Installation**: Clone and run `pnpm install && pnpm dev`
- **Tech stack**: React 19.2, TypeScript, Tailwind CSS, Mermaid.js 11.12

A smaller but useful reference is [Gordonby/MermaidTheming](https://github.com/Gordonby/MermaidTheming) (12 stars), which contains practical experiments with Microsoft-branded color palettes and sequence diagram configurations.

## Copy-paste theme configurations for your Next.js app

### Tailwind-compatible dark theme (for #0f172a background)

```javascript
mermaid.initialize({
  theme: 'base',
  themeVariables: {
    darkMode: true,
    primaryColor: '#1e3a5f',           // custom dark blue node bg
    primaryTextColor: '#f1f5f9',       // slate-100
    primaryBorderColor: '#38bdf8',     // sky-400 - visible borders
    secondaryColor: '#334155',         // slate-700
    tertiaryColor: '#1e293b',          // slate-800
    background: '#0f172a',             // slate-900 (your dark bg)
    mainBkg: '#1e293b',                // slate-800
    lineColor: '#94a3b8',              // slate-400 - visible arrows
    textColor: '#e2e8f0',              // slate-200
    nodeBorder: '#38bdf8',             // sky-400
    clusterBkg: '#1e293b',             // slate-800
    clusterBorder: '#475569',          // slate-600
    edgeLabelBackground: '#1e293b',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px'
  }
});
```

### Tailwind-compatible light theme (for white background)

```javascript
mermaid.initialize({
  theme: 'base',
  themeVariables: {
    primaryColor: '#e0f2fe',           // sky-100
    primaryTextColor: '#0f172a',       // slate-900
    primaryBorderColor: '#0ea5e9',     // sky-500
    secondaryColor: '#f1f5f9',         // slate-100
    tertiaryColor: '#f8fafc',          // slate-50
    background: '#ffffff',
    mainBkg: '#f1f5f9',                // slate-100
    lineColor: '#64748b',              // slate-500
    textColor: '#334155',              // slate-700
    nodeBorder: '#0ea5e9',             // sky-500
    clusterBkg: '#f1f5f9',             // slate-100
    clusterBorder: '#cbd5e1',          // slate-300
    edgeLabelBackground: '#ffffff',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px'
  }
});
```

### Professional Dracula-style dark theme

```javascript
mermaid.initialize({
  theme: 'base',
  themeVariables: {
    darkMode: true,
    primaryColor: '#282a36',
    primaryBorderColor: '#bd93f9',     // purple accent
    primaryTextColor: '#f8f8f2',
    secondaryColor: '#44475a',
    lineColor: '#bd93f9',
    nodeBorder: '#bd93f9',
    background: '#282a36',
    textColor: '#f8f8f2'
  }
});
```

## Complete React component with theme switching

Since Mermaid diagrams must be **re-rendered when themes change** (the API doesn't support live theme updates), here's a production-ready component for Next.js with next-themes:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import mermaid from 'mermaid';

const lightTheme = {
  primaryColor: '#e0f2fe',
  primaryTextColor: '#0f172a',
  primaryBorderColor: '#0ea5e9',
  secondaryColor: '#f1f5f9',
  tertiaryColor: '#ffffff',
  background: '#ffffff',
  mainBkg: '#f1f5f9',
  lineColor: '#64748b',
  textColor: '#334155',
};

const darkTheme = {
  darkMode: true,
  primaryColor: '#1e3a5f',
  primaryTextColor: '#f1f5f9',
  primaryBorderColor: '#38bdf8',
  secondaryColor: '#334155',
  tertiaryColor: '#0f172a',
  background: '#0f172a',
  mainBkg: '#1e293b',
  lineColor: '#94a3b8',
  textColor: '#e2e8f0',
};

interface MermaidProps {
  chart: string;
  className?: string;
}

export function Mermaid({ chart, className }: MermaidProps) {
  const [svg, setSvg] = useState<string>('');
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const renderDiagram = async () => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: resolvedTheme === 'dark' ? darkTheme : lightTheme,
      });

      const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
      const { svg } = await mermaid.render(id, chart);
      setSvg(svg);
    };

    renderDiagram();
  }, [chart, resolvedTheme]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

## CSS overrides for additional control

Mermaid embeds styles in the SVG, but you can override with `!important`. These selectors work for fine-tuning:

```css
/* Container background for dark mode */
pre.mermaid {
  background-color: transparent !important;
}

/* Node styling */
.nodeLabel {
  font-family: 'Inter', sans-serif !important;
}

/* Flowchart edges */
.flowchart-link {
  stroke: #38bdf8 !important;
  stroke-width: 2px !important;
}

/* Cluster/subgraph styling */
.cluster rect {
  fill: #1e293b !important;
  stroke: #475569 !important;
}

/* Custom class-based node colors */
.GreenNode > rect {
  fill: #10b981 !important;
  stroke: #059669 !important;
}
.GreenNode .nodeLabel {
  color: #ffffff !important;
}
```

Apply custom classes in your diagram using Mermaid's classDef syntax:

```
graph TD
    A[Start]:::GreenNode --> B[End]
    classDef GreenNode fill:#10b981,stroke:#059669,color:#fff
```

## Key themeVariables reference

| Variable | Purpose | Dark value | Light value |
|----------|---------|------------|-------------|
| `darkMode` | Enables dark calculations | `true` | `false` |
| `primaryColor` | Node backgrounds | `#1e3a5f` | `#e0f2fe` |
| `primaryBorderColor` | Node borders | `#38bdf8` | `#0ea5e9` |
| `lineColor` | Arrows/connections | `#94a3b8` | `#64748b` |
| `textColor` | General text | `#e2e8f0` | `#334155` |
| `background` | SVG background | `#0f172a` | `#ffffff` |
| `mainBkg` | Container backgrounds | `#1e293b` | `#f1f5f9` |

For sequence diagrams, also set `actorBkg`, `actorBorder`, `signalColor`, and `signalTextColor` explicitly.

## No theme generators exist—use the Live Editor instead

The [Mermaid Live Editor](https://mermaid.live/) is the only official tool for experimenting with themes. Add frontmatter at the top of your diagram to test configurations:

```yaml
---
config:
  theme: 'base'
  themeVariables:
    primaryColor: '#1e3a5f'
    primaryTextColor: '#f1f5f9'
    primaryBorderColor: '#38bdf8'
---
graph TD
    A[Test] --> B[Theme]
```

A dedicated theme generator with color pickers has been requested ([GitHub Issue #4987](https://github.com/mermaid-js/mermaid/issues/4987)) but doesn't exist yet. Native CSS variable support is also proposed ([Issue #6677](https://github.com/mermaid-js/mermaid/issues/6677)).

## Conclusion

**The practical path forward** for your Mermaid v11.4 + Next.js setup: use the Tailwind-compatible configurations above with the React component that re-renders on theme change. The `gotoailab/modern_mermaid` repository provides the richest collection of polished themes if you want more variety. Remember three critical constraints: always use `theme: 'base'` for custom theming, convert all colors to hex codes, and re-render diagrams when switching between light and dark modes. The built-in themes genuinely look poor—custom themeVariables are the only way to achieve professional results.