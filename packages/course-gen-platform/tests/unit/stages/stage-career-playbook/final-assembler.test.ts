import { describe, expect, it } from 'vitest';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  assembleCareerPlaybookFinalMarkdown,
  buildRoleGuideView,
  buildRoleGuideViewFromSpec,
  joinCareerPlaybookFinalBlocks,
  prepareCareerPlaybookFinalBlocksWithQuality,
} from '@/stages/stage-career-playbook/nodes/final-assembler';

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
    entries.push([`block_${index}`, block(`## ${index}. Block ${index}`)]);
  }

  entries[10] = ['block_10', block('## 10. Dependencies\n\nStakeholder and tool dependencies.')];
  entries[11] = ['block_11', block('## 11. Career Path\n\nGrowth path description.')];
  entries[16] = ['block_16', block('## 16. Main Process\n\nWorkflow description.')];

  return Object.fromEntries(entries) as Partial<
    Record<CareerPlaybookBlockId, CareerPlaybookBlockState>
  >;
}

const ruRoleProfileSpec: CareerPlaybookRoleProfileSpec = {
  position: {
    title: 'Контент-менеджер',
    slug: 'content-manager',
    department: 'marketing',
    level: 'senior',
  },
  context: {
    company_stage: 'mature',
    team_size: '51-200',
    reports_to: 'директору по маркетингу',
    has_subordinates: true,
    subordinates_description: '1-3 контент-специалиста',
  },
  focus_areas: {
    primary_kpis: ['80 MQL/месяц', 'CVR контент → лид 2.5%'],
    key_tools: ['CMS', 'Email platform', 'Analytics'],
    critical_competencies: ['Редакционная стратегия', 'Лидогенерация'],
    anti_goals: ['Юридическое утверждение чувствительных тем без Legal'],
    failure_patterns: ['Неподтверждённые KPI как факт'],
  },
  research: null,
  block_boundaries: {},
  content_language: 'ru',
};

describe('Career Playbook final assembler', () => {
  // Owner ruling 2026-08-31: reading is a hierarchy, not three disjoint views.
  // The employee sees only their own guide; the manager also sees everything the
  // employee sees, because they run the conversations it describes; HR sees the
  // whole document. Before this the manager and the employee were disjoint in
  // six blocks, which left the manager holding a career conversation whose
  // criteria live in a block only the employee and HR were given.
  it('builds each reader view as a hierarchy without changing the full document', () => {
    const blocks = completeBlocks();
    const full = joinCareerPlaybookFinalBlocks(blocks);
    const employee = buildRoleGuideView(blocks, 'employee');
    const manager = buildRoleGuideView(blocks, 'manager');
    const hr = buildRoleGuideView(blocks, 'hr');

    expect(full.match(/^## /gm)).toHaveLength(27);
    expect(employee.match(/^## /gm)).toHaveLength(20);
    expect(manager.match(/^## /gm)).toHaveLength(26);
    expect(hr.match(/^## /gm)).toHaveLength(27);
    expect(employee.indexOf('## Header')).toBeLessThan(employee.indexOf('## 1. Block 1'));

    // Only block_12 (HR-only) is outside the manager's view.
    expect(manager).not.toContain('## 12. Block 12');
    expect(manager).toContain('## 22. Block 22');
    expect(hr).toContain('## 12. Block 12');

    // The employee still receives only what is written for them: no failure
    // pre-mortem, no disengagement ladder, no screening filter.
    expect(employee).not.toContain('## 12. Block 12');
    expect(employee).not.toContain('## 17. Block 17');
    expect(employee).not.toContain('## 21. Block 21');
    expect(employee).not.toContain('## 23. Block 23');
    expect(employee).not.toContain('## 26. Block 26');

    // Every block an employee reads, a manager reads too.
    for (const heading of employee.match(/^## .*$/gm) ?? []) {
      expect(manager).toContain(heading);
    }

    expect(joinCareerPlaybookFinalBlocks(blocks)).toBe(full);
  });

  // A view served from stored blocks arrives without the diagrams, the sources
  // section and the calibration table, all of which assembly appends. That is
  // the defect mc2-ehao2 warned would ship if a view were wired up naively.
  it('serves a reader view through assembly, so it carries what assembly adds', () => {
    const blocks = completeBlocks();
    const raw = buildRoleGuideView(blocks, 'hr');
    const served = buildRoleGuideViewFromSpec({ generatedBlocks: blocks }, 'hr');

    expect(raw).not.toContain('```mermaid');
    expect(served).toContain('```mermaid');
    expect(served.match(/^## /gm)).toHaveLength(27);
  });

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

  it('does not append a stub next to an existing rich diagram under a non-canonical heading', () => {
    const blocks = completeBlocks();
    blocks.block_11 = block(`## 11. Career growth

### Dual-track growth map

\`\`\`mermaid
flowchart LR
  IC["Senior IC"] --> Principal["Principal"]
  Manager["Team Lead"] --> Director["Director"]
\`\`\``);

    const markdown = assembleCareerPlaybookFinalMarkdown({ generatedBlocks: blocks });

    expect(markdown).not.toContain('### Career Path Diagram');
    expect(markdown).not.toContain('Entry role');
    expect(markdown).toContain('Dual-track growth map');
    // Blocks 10 and 16 still have no diagram at all, so only their fallbacks are added.
    expect(markdown.match(/```mermaid/g)).toHaveLength(3);
  });

  it('remediates invalid Mermaid before final persistence and records a quality issue', async () => {
    const blocks = completeBlocks();
    blocks.block_10 = block(`## 10. Dependencies

### Dependencies Diagram

\`\`\`mermaid
flowchart LR
  Sales -->
\`\`\``);

    const result = await prepareCareerPlaybookFinalBlocksWithQuality({ generatedBlocks: blocks });
    const content = result.generatedBlocks.block_10?.content ?? '';

    expect(content).not.toContain('Sales -->');
    expect(content).not.toContain('Syntax error in text');
    expect(result.qualityIssues).toEqual([
      expect.objectContaining({
        source: 'mermaid',
        severity: 'warning',
        blockId: 'block_10',
        title: expect.stringContaining('Mermaid'),
        action: 'edit',
      }),
    ]);
  });

  it('localizes auto-added Mermaid section headings and labels for Russian output', () => {
    const markdown = assembleCareerPlaybookFinalMarkdown({
      generatedBlocks: completeBlocks(),
      roleProfileSpec: ruRoleProfileSpec,
    });

    expect(markdown).toContain('### Схема карьерного пути');
    expect(markdown).toContain('### Схема зависимостей');
    expect(markdown).toContain('### Схема основного процесса');
    expect(markdown).toContain('Current["Контент-менеджер"]');
    expect(markdown).toContain('Manager["директору по маркетингу"]');
    expect(markdown).not.toContain('Career Path Diagram');
    expect(markdown).not.toContain('Dependencies Diagram');
    expect(markdown).not.toContain('Main Process Diagram');
    expect(markdown).not.toContain('Entry role');
    expect(markdown).not.toContain('Cross-functional stakeholders');
  });

  it('converts raw fill-in placeholders into explicit editable fields', () => {
    const blocks = completeBlocks();
    blocks.block_18 = block(`## 18. FAQ

Шаблон письма: [Имя], отправьте [число] материалов до [дата] и добавьте ссылку [url].

- [ ] Проверить факты`);

    const markdown = assembleCareerPlaybookFinalMarkdown({
      generatedBlocks: blocks,
      roleProfileSpec: ruRoleProfileSpec,
    });

    expect(markdown).toContain('поле для заполнения: имя');
    expect(markdown).toContain('поле для заполнения: число');
    expect(markdown).toContain('поле для заполнения: дата');
    expect(markdown).toContain('поле для заполнения: ссылка');
    expect(markdown).toContain('- [ ] Проверить факты');
    expect(markdown).not.toContain('[Имя]');
    expect(markdown).not.toContain('[число]');
    expect(markdown).not.toContain('[дата]');
    expect(markdown).not.toContain('[url]');
  });

  it('throws a deterministic error when a required block is missing', () => {
    const blocks = completeBlocks();
    delete blocks.block_26;

    expect(() => assembleCareerPlaybookFinalMarkdown({ generatedBlocks: blocks })).toThrow(
      'Career Playbook final assembly is missing required blocks: block_26'
    );
  });
});
