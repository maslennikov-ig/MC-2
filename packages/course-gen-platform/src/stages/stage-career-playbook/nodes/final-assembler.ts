import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import type { CareerPlaybookGraphStateType, CareerPlaybookGraphStateUpdate } from '../state';

export const CAREER_PLAYBOOK_FINAL_BLOCK_ORDER: CareerPlaybookBlockId[] = [
  'header',
  ...Array.from({ length: 26 }, (_, index) => `block_${index + 1}`),
];

interface RequiredMermaidSection {
  blockId: CareerPlaybookBlockId;
  heading: string;
  buildDiagram: (roleProfileSpec?: CareerPlaybookRoleProfileSpec) => string;
}

export interface AssembleCareerPlaybookFinalMarkdownInput {
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  roleProfileSpec?: CareerPlaybookRoleProfileSpec;
}

function cleanMermaidLabel(value: string | undefined, fallback: string): string {
  const cleaned = (value ?? fallback).replace(/["[\]{}]/g, '').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

export const REQUIRED_MERMAID_SECTIONS: RequiredMermaidSection[] = [
  {
    blockId: 'block_11',
    heading: 'Career Path Diagram',
    buildDiagram: roleProfileSpec => {
      const roleTitle = cleanMermaidLabel(roleProfileSpec?.position.title, 'Target role');
      return `flowchart LR
  Entry["Entry role"] --> Current["${roleTitle}"]
  Current --> Next["Next senior scope"]`;
    },
  },
  {
    blockId: 'block_10',
    heading: 'Dependencies Diagram',
    buildDiagram: roleProfileSpec => {
      const roleTitle = cleanMermaidLabel(roleProfileSpec?.position.title, 'Target role');
      const reportsTo = cleanMermaidLabel(roleProfileSpec?.context.reports_to, 'Manager');
      return `flowchart LR
  Manager["${reportsTo}"] --> Role["${roleTitle}"]
  Role --> Team["Internal team"]
  Role --> Stakeholders["Cross-functional stakeholders"]`;
    },
  },
  {
    blockId: 'block_16',
    heading: 'Main Process Diagram',
    buildDiagram: () => `flowchart TD
  Intake["Intake"] --> Prioritize["Prioritize"]
  Prioritize --> Execute["Execute"]
  Execute --> Review["Review"]`,
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasMermaidSection(content: string, heading: string): boolean {
  const headingPattern = new RegExp(`^###\\s+${escapeRegExp(heading)}\\s*$`, 'im');
  const match = headingPattern.exec(content);
  if (!match) return false;

  return /```mermaid[\s\S]*?```/i.test(content.slice(match.index));
}

function appendMermaidSection(
  content: string,
  section: RequiredMermaidSection,
  roleProfileSpec?: CareerPlaybookRoleProfileSpec
): string {
  if (hasMermaidSection(content, section.heading)) {
    return content.trim();
  }

  return `${content.trim()}

### ${section.heading}

\`\`\`mermaid
${section.buildDiagram(roleProfileSpec)}
\`\`\``;
}

function assertAllBlocksPresent(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): void {
  const missingBlockIds = CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.filter(blockId => {
    const content = generatedBlocks[blockId]?.content;
    return !content || content.trim().length === 0;
  });

  if (missingBlockIds.length > 0) {
    throw new Error(
      `Career Playbook final assembly is missing required blocks: ${missingBlockIds.join(', ')}`
    );
  }
}

export function ensureRequiredMermaidSections(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  roleProfileSpec?: CareerPlaybookRoleProfileSpec
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  assertAllBlocksPresent(generatedBlocks);

  const blocksWithDiagrams = { ...generatedBlocks };
  for (const section of REQUIRED_MERMAID_SECTIONS) {
    const block = blocksWithDiagrams[section.blockId];
    if (!block) continue;

    blocksWithDiagrams[section.blockId] = {
      ...block,
      content: appendMermaidSection(block.content, section, roleProfileSpec),
    };
  }

  return blocksWithDiagrams;
}

export function prepareCareerPlaybookFinalBlocks(
  input: AssembleCareerPlaybookFinalMarkdownInput
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  return ensureRequiredMermaidSections(input.generatedBlocks, input.roleProfileSpec);
}

export function assembleCareerPlaybookFinalMarkdown(
  input: AssembleCareerPlaybookFinalMarkdownInput
): string {
  const blocksWithDiagrams = prepareCareerPlaybookFinalBlocks(input);

  return CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.map(blockId =>
    blocksWithDiagrams[blockId]?.content.trim()
  ).join('\n\n');
}

export function createFinalAssemblerNode() {
  return function finalAssemblerNode(
    state: CareerPlaybookGraphStateType
  ): CareerPlaybookGraphStateUpdate {
    try {
      const generatedBlocks = prepareCareerPlaybookFinalBlocks({
        generatedBlocks: state.generatedBlocks,
        roleProfileSpec: state.roleProfileSpec ?? undefined,
      });

      return {
        generatedBlocks,
        finalMarkdown: assembleCareerPlaybookFinalMarkdown({ generatedBlocks }),
        currentNode: 'finalAssembler',
      };
    } catch (error) {
      return {
        errors: [
          `finalAssembler failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        currentNode: 'finalAssembler',
      };
    }
  };
}
