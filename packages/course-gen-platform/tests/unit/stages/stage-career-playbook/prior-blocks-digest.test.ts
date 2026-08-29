import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
import { buildCareerPlaybookPriorBlocksDigest } from '@/stages/stage-career-playbook/nodes/prior-blocks-digest';

function block(content: string): CareerPlaybookBlockState {
  return {
    content,
    status: 'generated',
    judge_verdict: null,
    generated_at: '2026-05-13T00:00:00.000Z',
    llm_model: 'mock-model',
    attempt: 1,
  };
}

function blocks(
  entries: Array<[CareerPlaybookBlockId, string]>
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  return Object.fromEntries(entries.map(([blockId, content]) => [blockId, block(content)]));
}

describe('buildCareerPlaybookPriorBlocksDigest', () => {
  // block_2 (employee, manager) and block_5 (employee, manager) share no reader
  // with block_12 (hr-only). mc2-923ku: the digest's four sections are
  // contradiction guards over the single assembled document, not
  // repetition-avoidance guidance, so they must reach block_12 regardless.
  it("includes block_2's anti-goals and block_5's decision authority in block_12's digest", () => {
    const generatedBlocks = blocks([
      [
        'block_2',
        `## 2. Анти-цели

- Никогда не согласовывать скидку выше 20% без CRO.
- Никогда не нанимать сотрудника без утверждённого бюджета.
- Никогда не обещать клиенту недостижимый срок поставки.
- Никогда не менять план вознаграждения задним числом.`,
      ],
      [
        'block_5',
        `## 5. Матрица решений

| Решение | Автономия | Действие |
| --- | --- | --- |
| Ежедневные приоритеты | Full | Decide |
| Скидка 10% | Inform | Use policy |
| Скидка 20% | Recommend | Ask CRO |
| Условия контракта | Approval | Ask Legal |`,
      ],
    ]);

    const digest = buildCareerPlaybookPriorBlocksDigest(generatedBlocks, ['block_12']);

    expect(digest).toContain('Никогда не согласовывать скидку выше 20% без CRO');
    expect(digest).toContain('Скидка 20%');
  });
});
