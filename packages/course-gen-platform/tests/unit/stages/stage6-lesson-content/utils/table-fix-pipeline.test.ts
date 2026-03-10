/**
 * Tests for stage6-lesson-content/utils/table-fix-pipeline.ts
 *
 * runTableFixPipeline: deterministic markdown table repair.
 * No external dependencies — pure string transformation.
 */

import { describe, it, expect } from 'vitest';
import { runTableFixPipeline } from '../../../../../src/stages/stage6-lesson-content/utils/table-fix-pipeline';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function validTable(): string {
  return `| Name | Age | City |
| --- | --- | --- |
| Alice | 30 | London |
| Bob | 25 | Paris |`;
}

// ─────────────────────────────────────────────────────────────────────────────
// runTableFixPipeline — early exits
// ─────────────────────────────────────────────────────────────────────────────

describe('runTableFixPipeline — empty/no-pipe content', () => {
  it('returns unchanged content with no modification for empty string', () => {
    const result = runTableFixPipeline('');
    expect(result.content).toBe('');
    expect(result.modified).toBe(false);
    expect(result.metrics.tablesDetected).toBe(0);
  });

  it('returns unchanged content when no pipe character present', () => {
    const content = '# Title\n\nNo tables here, just plain text.';
    const result = runTableFixPipeline(content);
    expect(result.content).toBe(content);
    expect(result.modified).toBe(false);
    expect(result.metrics.tablesDetected).toBe(0);
  });

  it('includes durationMs metric', () => {
    const result = runTableFixPipeline('No table');
    expect(typeof result.metrics.durationMs).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runTableFixPipeline — valid tables (no modification needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('runTableFixPipeline — valid tables', () => {
  it('detects but does not modify a valid table', () => {
    const content = validTable();
    const result = runTableFixPipeline(content);
    expect(result.metrics.tablesDetected).toBe(1);
    expect(result.metrics.tablesModified).toBe(0);
    expect(result.modified).toBe(false);
  });

  it('preserves valid table content exactly', () => {
    const content = validTable();
    const result = runTableFixPipeline(content);
    expect(result.content).toBe(content);
  });

  it('handles aligned table with colons in separator', () => {
    const content = `| Left | Center | Right |
|:---|:---:|---:|
| a | b | c |`;
    const result = runTableFixPipeline(content);
    expect(result.modified).toBe(false);
    expect(result.content).toBe(content);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runTableFixPipeline — missing columns (padding)
// ─────────────────────────────────────────────────────────────────────────────

describe('runTableFixPipeline — missing columns in body rows', () => {
  it('pads body row with empty cells when columns are missing', () => {
    const content = `| A | B | C |
| --- | --- | --- |
| only one |`;
    const result = runTableFixPipeline(content);
    expect(result.modified).toBe(true);
    expect(result.metrics.tablesModified).toBe(1);
    // Result should have 3 columns for the padded row
    const lines = result.content.split('\n');
    const bodyRow = lines[2];
    expect((bodyRow.match(/\|/g) || []).length).toBe(4); // 3 cols = 4 pipe chars
  });

  it('reports dataRowsNormalized count', () => {
    const content = `| A | B | C |
| --- | --- | --- |
| one |
| also one |`;
    const result = runTableFixPipeline(content);
    expect(result.metrics.dataRowsNormalized).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runTableFixPipeline — malformed separator
// ─────────────────────────────────────────────────────────────────────────────

describe('runTableFixPipeline — separator normalization', () => {
  it('normalizes malformed separator row', () => {
    const content = `| A | B | C |
| - | - |
| x | y | z |`;
    const result = runTableFixPipeline(content);
    expect(result.modified).toBe(true);
    expect(result.metrics.separatorRowsNormalized).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runTableFixPipeline — fenced code block protection
// ─────────────────────────────────────────────────────────────────────────────

describe('runTableFixPipeline — code blocks ignored', () => {
  it('does not process table-like content inside fenced code blocks', () => {
    const content = '```\n| A | B |\n| --- | --- |\n| x | y |\n```';
    const result = runTableFixPipeline(content);
    expect(result.metrics.tablesDetected).toBe(0);
    expect(result.modified).toBe(false);
  });

  it('processes tables outside code blocks normally', () => {
    const content = `Some text.

${validTable()}

\`\`\`
| Not a table |
| (code block) |
\`\`\``;
    const result = runTableFixPipeline(content);
    expect(result.metrics.tablesDetected).toBe(1);
    // valid table should not be modified
    expect(result.metrics.tablesModified).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runTableFixPipeline — multiple tables in document
// ─────────────────────────────────────────────────────────────────────────────

describe('runTableFixPipeline — multiple tables', () => {
  it('detects and processes multiple tables in one document', () => {
    const content = `# Section A

${validTable()}

# Section B

${validTable()}`;
    const result = runTableFixPipeline(content);
    expect(result.metrics.tablesDetected).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runTableFixPipeline — edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('runTableFixPipeline — edge cases', () => {
  it('handles pipe character in non-table context without crashing', () => {
    const content = 'Use the `|` operator for bitwise OR.';
    expect(() => runTableFixPipeline(content)).not.toThrow();
  });

  it('handles null/undefined gracefully', () => {
    // Function checks !content first
    const result = runTableFixPipeline(null as any);
    expect(result.modified).toBe(false);
  });

  it('splits rows with too many cells into multiple rows when divisible', () => {
    // 6-cell row in 3-column table: should split into 2 rows
    const content = `| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 | 4 | 5 | 6 |`;
    const result = runTableFixPipeline(content);
    expect(result.modified).toBe(true);
    const lines = result.content.split('\n');
    // Should have header + separator + 2 body rows = 4 lines
    expect(lines.length).toBe(4);
  });
});
