'use client';

import React from 'react';
import { DiffViewer } from './DiffViewer';

/**
 * Example usage of DiffViewer component
 *
 * This demonstrates the diff viewer showing changes made by SelfReviewer
 * when status is FIXED.
 */
export default function DiffViewerExample() {
  const originalContent = `# Introduction to React

React is a JavaScript library for building user interfaces.

## Key Concepts

- Components are the building blocks
- State management with hooks
- Virtual DOM for performance

## Getting Started

Install React with npm:

\`\`\`bash
npm install react react-dom
\`\`\`

Create your first component:

\`\`\`jsx
function Hello() {
  return <h1>Hello World</h1>;
}
\`\`\`

## Conclusion

React makes building UIs easier.`;

  const fixedContent = `# Introduction to React

React is a JavaScript library for building user interfaces. It was created by Facebook and is now maintained by Meta and a community of developers.

## Key Concepts

- **Components** are the building blocks of React applications
- **State management** with hooks like useState and useEffect
- **Virtual DOM** for efficient rendering and performance

## Getting Started

Install React with npm:

\`\`\`bash
npm install react react-dom
\`\`\`

Create your first component:

\`\`\`jsx
function Hello() {
  return <h1>Hello, World!</h1>;
}
\`\`\`

You can then render this component in your application.

## Conclusion

React makes building interactive UIs easier and more maintainable.`;

  const changes = [
    {
      type: 'HYGIENE',
      severity: 'FIXABLE',
      location: 'Introduction',
      description: 'Added context about React creators',
    },
    {
      type: 'HYGIENE',
      severity: 'FIXABLE',
      location: 'Key Concepts',
      description: 'Enhanced bullet points with bold formatting and examples',
    },
    {
      type: 'HYGIENE',
      severity: 'FIXABLE',
      location: 'Getting Started',
      description: 'Fixed punctuation in greeting',
    },
    {
      type: 'HYGIENE',
      severity: 'FIXABLE',
      location: 'Conclusion',
      description: 'Expanded conclusion with more detail',
    },
  ];

  return (
    <div className="p-8 space-y-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-slate-900 dark:text-slate-100">
          DiffViewer Component Example
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Side-by-side and unified diff views for SelfReviewer auto-fixes
        </p>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            English Example
          </h2>
          <DiffViewer
            originalContent={originalContent}
            fixedContent={fixedContent}
            changes={changes}
            locale="en"
          />
        </div>

        <div className="mt-12 space-y-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Russian Example (Пример на русском)
          </h2>
          <DiffViewer
            originalContent={originalContent}
            fixedContent={fixedContent}
            changes={changes}
            locale="ru"
          />
        </div>

        <div className="mt-12 p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">
            Features Demonstrated
          </h3>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li>✅ Toggle between unified and split view modes</li>
            <li>✅ Green highlighting for added lines</li>
            <li>✅ Red highlighting for removed lines</li>
            <li>✅ Line numbers for both original and fixed content</li>
            <li>✅ Stats header showing additions and deletions count</li>
            <li>✅ Monospace font for code readability</li>
            <li>✅ Dark mode support</li>
            <li>✅ Scrollable content area (400px height)</li>
            <li>✅ Internationalization (English/Russian)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
