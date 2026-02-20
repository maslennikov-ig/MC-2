/**
 * Tests for deterministic GFM table remediation utility
 * @module stages/stage6-lesson-content/utils/table-fix-pipeline.test
 */

import { describe, expect, it } from 'vitest';
import { runTableFixPipeline } from '../../../../src/stages/stage6-lesson-content/utils/table-fix-pipeline.js';

describe('runTableFixPipeline', () => {
  it('should normalize malformed separator rows to expected column count', () => {
    const content = `## Broken table

| Stage | Owner | Status |
| :--- | :--- | :--- | :|
| Draft | Team A | Open |
`;

    const result = runTableFixPipeline(content);

    expect(result.modified).toBe(true);
    expect(result.content).toContain('| :--- | :--- | :--- |');
    expect(result.content).not.toContain('| :--- | :--- | :--- | :|');
    expect(result.metrics.separatorRowsNormalized).toBe(1);
  });

  it('should pad short body rows when repair is unambiguous', () => {
    const content = `| Col A | Col B | Col C |
| --- | --- | --- |
| 1 | 2 |
| 3 | 4 | 5 |
`;

    const result = runTableFixPipeline(content);

    expect(result.modified).toBe(true);
    expect(result.content).toContain('| 1 | 2 |  |');
    expect(result.content).toContain('| 3 | 4 | 5 |');
    expect(result.metrics.dataRowsNormalized).toBe(1);
  });

  it('should preserve valid tables unchanged', () => {
    const content = `# Valid

| Name | Value |
| --- | ---: |
| Alpha | 10 |
| Beta | 20 |
`;

    const result = runTableFixPipeline(content);

    expect(result.modified).toBe(false);
    expect(result.content).toBe(content);
    expect(result.metrics.tablesModified).toBe(0);
  });

  it('should not mutate malformed table text inside fenced code blocks', () => {
    const content = `\`\`\`markdown
| Name | Value |
| :--- | :--- | :|
| A | B |
\`\`\`
`;

    const result = runTableFixPipeline(content);

    expect(result.modified).toBe(false);
    expect(result.content).toBe(content);
  });
});
