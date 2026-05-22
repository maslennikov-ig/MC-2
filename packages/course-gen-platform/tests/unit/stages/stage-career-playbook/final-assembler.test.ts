import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
import { assembleCareerPlaybookFinalMarkdown } from '@/stages/stage-career-playbook/nodes/final-assembler';

function block(content: string): CareerPlaybookBlockState {
  return {
    content,
    status: 'generated',
    judge_verdict: null,
    generated_at: '2026-05-13T00:00:00.000Z',
    llm_model: 'mock-career-model',
    attempt: 1,
  };
}

function completeBlocks(): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  const entries: [CareerPlaybookBlockId, CareerPlaybookBlockState][] = [
    ['header', block('## Header\n\n# B2B Sales Manager')],
  ];

  for (let index = 1; index <= 26; index += 1) {
    entries.push([`block_${index}` as CareerPlaybookBlockId, block(`## ${index}. Block ${index}`)]);
  }

  entries[10] = ['block_10', block('## 10. Dependencies\n\nStakeholder and tool dependencies.')];
  entries[11] = ['block_11', block('## 11. Career Path\n\nGrowth path description.')];
  entries[16] = ['block_16', block('## 16. Main Process\n\nWorkflow description.')];

  return Object.fromEntries(entries) as Partial<
    Record<CareerPlaybookBlockId, CareerPlaybookBlockState>
  >;
}

describe('Career Playbook final assembler', () => {
  it('assembles Header then blocks 1-26 and creates required Mermaid sections', () => {
    const markdown = assembleCareerPlaybookFinalMarkdown({ generatedBlocks: completeBlocks() });

    expect(markdown.indexOf('## Header')).toBeLessThan(markdown.indexOf('## 1. Block 1'));
    expect(markdown.indexOf('## 1. Block 1')).toBeLessThan(markdown.indexOf('## 2. Block 2'));
    expect(markdown.indexOf('## 25. Block 25')).toBeLessThan(markdown.indexOf('## 26. Block 26'));
    expect(markdown).toContain('### Career Path Diagram');
    expect(markdown).toContain('### Dependencies Diagram');
    expect(markdown).toContain('### Main Process Diagram');
    expect(markdown.match(/```mermaid/g)).toHaveLength(3);
  });

  it('preserves existing required Mermaid sections without duplication', () => {
    const blocks = completeBlocks();
    blocks.block_11 = block(`## 11. Career Path

### Career Path Diagram

\`\`\`mermaid
flowchart LR
  Current --> Lead
\`\`\``);

    const markdown = assembleCareerPlaybookFinalMarkdown({ generatedBlocks: blocks });

    expect(markdown.match(/### Career Path Diagram/g)).toHaveLength(1);
    expect(markdown).toContain('Current --> Lead');
  });

  it('throws a deterministic error when a required block is missing', () => {
    const blocks = completeBlocks();
    delete blocks.block_26;

    expect(() => assembleCareerPlaybookFinalMarkdown({ generatedBlocks: blocks })).toThrow(
      'Career Playbook final assembly is missing required blocks: block_26'
    );
  });
});
