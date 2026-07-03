import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookQualityIssue,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import type { CareerPlaybookGraphStateType, CareerPlaybookGraphStateUpdate } from '../state';
import { remediateCareerPlaybookMermaidBlocks } from './mermaid-quality';

export const CAREER_PLAYBOOK_FINAL_BLOCK_ORDER: CareerPlaybookBlockId[] = [
  'header',
  ...Array.from({ length: 26 }, (_, index) => `block_${index + 1}`),
];

interface RequiredMermaidSection {
  blockId: CareerPlaybookBlockId;
  heading: {
    en: string;
    ru: string;
  };
  buildDiagram: (
    roleProfileSpec: CareerPlaybookRoleProfileSpec | undefined,
    language: string
  ) => string;
}

export interface AssembleCareerPlaybookFinalMarkdownInput {
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  roleProfileSpec?: CareerPlaybookRoleProfileSpec;
}

export interface PrepareCareerPlaybookFinalBlocksResult {
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  qualityIssues: CareerPlaybookQualityIssue[];
}

function resolveContentLanguage(roleProfileSpec?: CareerPlaybookRoleProfileSpec): 'en' | 'ru' {
  return roleProfileSpec?.content_language === 'ru' ? 'ru' : 'en';
}

function localizedValue(language: string, en: string, ru: string): string {
  return language === 'ru' ? ru : en;
}

function cleanMermaidLabel(value: string | undefined, fallback: string): string {
  const cleaned = (value ?? fallback).replace(/["[\]{}]/g, '').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

export const REQUIRED_MERMAID_SECTIONS: RequiredMermaidSection[] = [
  {
    blockId: 'block_11',
    heading: {
      en: 'Career Path Diagram',
      ru: 'Схема карьерного пути',
    },
    buildDiagram: (roleProfileSpec, language) => {
      const roleTitle = cleanMermaidLabel(
        roleProfileSpec?.position.title,
        localizedValue(language, 'Target role', 'Целевая роль')
      );
      const entryRole = localizedValue(language, 'Entry role', 'Стартовая роль');
      const nextScope = localizedValue(
        language,
        'Next senior scope',
        'Следующий уровень ответственности'
      );
      return `flowchart LR
  Entry["${entryRole}"] --> Current["${roleTitle}"]
  Current --> Next["${nextScope}"]`;
    },
  },
  {
    blockId: 'block_10',
    heading: {
      en: 'Dependencies Diagram',
      ru: 'Схема зависимостей',
    },
    buildDiagram: (roleProfileSpec, language) => {
      const roleTitle = cleanMermaidLabel(
        roleProfileSpec?.position.title,
        localizedValue(language, 'Target role', 'Целевая роль')
      );
      const reportsTo = cleanMermaidLabel(
        roleProfileSpec?.context.reports_to,
        localizedValue(language, 'Manager', 'Руководитель')
      );
      const team = localizedValue(language, 'Internal team', 'Внутренняя команда');
      const stakeholders = localizedValue(
        language,
        'Cross-functional stakeholders',
        'Смежные участники'
      );
      return `flowchart LR
  Manager["${reportsTo}"] --> Role["${roleTitle}"]
  Role --> Team["${team}"]
  Role --> Stakeholders["${stakeholders}"]`;
    },
  },
  {
    blockId: 'block_16',
    heading: {
      en: 'Main Process Diagram',
      ru: 'Схема основного процесса',
    },
    buildDiagram: (_roleProfileSpec, language) => {
      const intake = localizedValue(language, 'Intake', 'Входящий запрос');
      const prioritize = localizedValue(language, 'Prioritize', 'Приоритизация');
      const execute = localizedValue(language, 'Execute', 'Исполнение');
      const review = localizedValue(language, 'Review', 'Проверка');
      return `flowchart TD
  Intake["${intake}"] --> Prioritize["${prioritize}"]
  Prioritize --> Execute["${execute}"]
  Execute --> Review["${review}"]`;
    },
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasMermaidSection(content: string, headings: string[]): boolean {
  for (const heading of headings) {
    const headingPattern = new RegExp(`^###\\s+${escapeRegExp(heading)}\\s*$`, 'im');
    const match = headingPattern.exec(content);
    if (!match) continue;

    if (/```mermaid[\s\S]*?```/i.test(content.slice(match.index))) {
      return true;
    }
  }

  return false;
}

function normalizeMermaidSectionHeading(
  content: string,
  section: RequiredMermaidSection,
  language: string
): string {
  const targetHeading = language === 'ru' ? section.heading.ru : section.heading.en;
  const sourceHeadings = Object.values(section.heading).filter(
    heading => heading !== targetHeading
  );
  let normalized = content;

  for (const sourceHeading of sourceHeadings) {
    normalized = normalized.replace(
      new RegExp(`^(###\\s+)${escapeRegExp(sourceHeading)}\\s*$`, 'gim'),
      `$1${targetHeading}`
    );
  }

  return normalized;
}

function appendMermaidSection(
  content: string,
  section: RequiredMermaidSection,
  roleProfileSpec: CareerPlaybookRoleProfileSpec | undefined,
  language: string
): string {
  const normalizedContent = normalizeMermaidSectionHeading(content, section, language);
  const localizedHeading = section.heading[resolveContentLanguage(roleProfileSpec)];
  if (hasMermaidSection(normalizedContent, Object.values(section.heading))) {
    return normalizedContent.trim();
  }

  return `${normalizedContent.trim()}

### ${localizedHeading}

\`\`\`mermaid
${section.buildDiagram(roleProfileSpec, language)}
\`\`\``;
}

function normalizeFillableFieldLabel(rawLabel: string, language: string): string {
  const label = rawLabel
    .replace(/\s+/g, ' ')
    .replace(/[.:;]+$/g, '')
    .trim()
    .toLocaleLowerCase('ru');

  if (/^(url|ссылка|link)/i.test(label)) {
    return language === 'ru' ? 'ссылка' : 'link';
  }
  if (/^(dd\.mm\.yyyy|дд\.мм\.гггг|дата|date)/i.test(label)) {
    return language === 'ru' ? 'дата' : 'date';
  }
  if (/^(имя|name)/i.test(label)) {
    return language === 'ru' ? 'имя' : 'name';
  }
  if (/^(число|number|value)/i.test(label)) {
    return language === 'ru' ? 'число' : 'number';
  }
  if (/название компании|company name/i.test(label)) {
    return language === 'ru' ? 'название компании' : 'company name';
  }
  if (/^(название|title)/i.test(label)) {
    return language === 'ru' ? 'название' : 'title';
  }

  return label;
}

function formatFillableField(rawLabel: string, language: string): string {
  const label = normalizeFillableFieldLabel(rawLabel, language);
  return language === 'ru' ? `поле для заполнения: ${label}` : `field to fill: ${label}`;
}

export function shouldTreatBracketAsFillableField(label: string): boolean {
  const normalized = label.trim().toLocaleLowerCase('ru');
  return (
    /^(имя|name)$/.test(normalized) ||
    /^(число|number|value)$/.test(normalized) ||
    /^(дата|date|dd\.mm\.yyyy|дд\.мм\.гггг)(?:\b|$)/.test(normalized) ||
    /^(url|ссылка|link)(?:\b|$)/.test(normalized) ||
    /^название(?: компании)?$/.test(normalized) ||
    /^company name$/.test(normalized)
  );
}

export function shouldTreatBraceAsFillableField(label: string): boolean {
  const normalized = label.trim().toLocaleLowerCase('ru');
  return (
    normalized === 'заполните' ||
    shouldTreatBracketAsFillableField(normalized) ||
    /^требуется ли /.test(normalized)
  );
}

function normalizeFillablePlaceholders(content: string, language: string): string {
  const lines = content.split('\n');
  let insideFence = false;

  return lines
    .map(line => {
      if (/^\s*```/.test(line)) {
        insideFence = !insideFence;
        return line;
      }
      if (insideFence) return line;

      const withBrackets = line.replace(
        /\[([^\]\n]{2,80})\]/g,
        (match: string, label: string, offset: number) => {
          const nextChar = line[offset + match.length];
          if (nextChar === '(' || !shouldTreatBracketAsFillableField(label)) {
            return match;
          }

          return formatFillableField(label, language);
        }
      );

      return withBrackets.replace(/\{([^}\n]{2,100})\}/g, (match: string, label: string) => {
        if (!shouldTreatBraceAsFillableField(label)) {
          return match;
        }

        return formatFillableField(label, language);
      });
    })
    .join('\n');
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
  const language = resolveContentLanguage(roleProfileSpec);
  for (const section of REQUIRED_MERMAID_SECTIONS) {
    const block = blocksWithDiagrams[section.blockId];
    if (!block) continue;

    blocksWithDiagrams[section.blockId] = {
      ...block,
      content: appendMermaidSection(block.content, section, roleProfileSpec, language),
    };
  }

  return blocksWithDiagrams;
}

export function normalizeCareerPlaybookFinalContent(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  roleProfileSpec?: CareerPlaybookRoleProfileSpec
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  const language = resolveContentLanguage(roleProfileSpec);
  const normalizedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> = {};

  for (const [blockId, block] of Object.entries(generatedBlocks)) {
    if (!block) continue;
    normalizedBlocks[blockId] = {
      ...block,
      content: normalizeFillablePlaceholders(block.content, language),
    };
  }

  return normalizedBlocks;
}

export function prepareCareerPlaybookFinalBlocks(
  input: AssembleCareerPlaybookFinalMarkdownInput
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  const normalizedBlocks = normalizeCareerPlaybookFinalContent(
    input.generatedBlocks,
    input.roleProfileSpec
  );
  return ensureRequiredMermaidSections(normalizedBlocks, input.roleProfileSpec);
}

export async function prepareCareerPlaybookFinalBlocksWithQuality(
  input: AssembleCareerPlaybookFinalMarkdownInput
): Promise<PrepareCareerPlaybookFinalBlocksResult> {
  const blocksWithDiagrams = prepareCareerPlaybookFinalBlocks(input);
  return remediateCareerPlaybookMermaidBlocks(blocksWithDiagrams);
}

function joinCareerPlaybookFinalBlocks(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): string {
  return CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.map(blockId =>
    generatedBlocks[blockId]?.content.trim()
  ).join('\n\n');
}

export function assembleCareerPlaybookFinalMarkdown(
  input: AssembleCareerPlaybookFinalMarkdownInput
): string {
  const blocksWithDiagrams = prepareCareerPlaybookFinalBlocks(input);

  return joinCareerPlaybookFinalBlocks(blocksWithDiagrams);
}

export function createFinalAssemblerNode() {
  return async function finalAssemblerNode(
    state: CareerPlaybookGraphStateType
  ): Promise<CareerPlaybookGraphStateUpdate> {
    try {
      const { generatedBlocks, qualityIssues } = await prepareCareerPlaybookFinalBlocksWithQuality({
        generatedBlocks: state.generatedBlocks,
        roleProfileSpec: state.roleProfileSpec ?? undefined,
      });

      return {
        generatedBlocks,
        ...(qualityIssues.length > 0 ? { qualityIssues } : {}),
        finalMarkdown: joinCareerPlaybookFinalBlocks(generatedBlocks),
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
