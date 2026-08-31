import type {
  CareerPlaybookAudience,
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookMetricLedgerEntry,
  CareerPlaybookQualityIssue,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import { CAREER_PLAYBOOK_BLOCK_CATALOG } from '@megacampus/shared-types';
import type { CareerPlaybookGraphStateType, CareerPlaybookGraphStateUpdate } from '../state';
import { remediateCareerPlaybookMermaidBlocks } from './mermaid-quality';
import { CAREER_PLAYBOOK_EXAMPLE_MARKER_SOURCE } from './quality-ledger';

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
  // Any diagram already in the block satisfies coverage (validateMermaidCoverage counts
  // fenced mermaid blocks, not headings). Appending the canonical stub next to an existing
  // rich diagram produced the duplicate 3-4 node stubs seen in runs b866d2f5/35602db1
  // (mc2-db696.104.4); the fallback stub is only for blocks with no diagram at all.
  if (
    hasMermaidSection(normalizedContent, Object.values(section.heading)) ||
    /```mermaid[\s\S]*?```/i.test(normalizedContent)
  ) {
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

/** An evidence citation, `[S3]`. */
const EVIDENCE_CITATION = /^S\d+$/;
/** A markdown task box, `[ ]` or `[x]`. */
const TASK_BOX = /^[ xX]$/;

/**
 * Is a bracketed token a fill-in field rather than markdown syntax?
 *
 * This was a whitelist of six labels — name, number, date, url, title, company
 * name — chosen to avoid false positives. Measured on all 19 stored playbooks it
 * matched **11 of 158** bracketed tokens, and 13 of those playbooks shipped at
 * least one raw placeholder to a reader: `[Заполняется]`, `[Enter date]`,
 * `[поле для заполнения]`, `[ФИО, должность]`, `[краткое описание]`,
 * `[research: onboarding insights]` — that last one a prompt variable name the
 * model echoed into an onboarding table, twice.
 *
 * So the test is inverted. A bracket in reader-facing prose is a fill-in field
 * unless it is markdown: an inline or reference link, an evidence citation, or a
 * task box. Across those 19 playbooks the inverted rule produced no false
 * positive at all, which is the evidence the whitelist never had.
 *
 * The caller supplies the surrounding characters, because a link is only
 * recognisable from them: `[text](url)` and `[text][ref]` by what follows, and
 * the `[ref]` half of a reference link by what precedes it.
 */
export function shouldTreatBracketAsFillableField(
  label: string,
  nextChar?: string,
  previousChar?: string
): boolean {
  if (nextChar === '(' || nextChar === '[') return false;
  if (previousChar === ']') return false;

  const normalized = label.trim();
  if (normalized.length === 0) return false;

  return !EVIDENCE_CITATION.test(normalized) && !TASK_BOX.test(normalized);
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
          if (
            !shouldTreatBracketAsFillableField(label, line[offset + match.length], line[offset - 1])
          ) {
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

/**
 * Normalize internal block identifiers to the reader-facing form.
 *
 * The 2026-08-11 guide mixed 23 `block_5`-style identifiers into FAQ answers and
 * the implementation checklist alongside the correct "Block 8" form. This is
 * vocabulary, not meaning, so it is cheaper and more reliable to fix here than
 * to spend a regeneration on it.
 */
export function normalizeCareerPlaybookBlockReferences(content: string): string {
  const lines = content.split('\n');
  let insideFence = false;

  return lines
    .map(line => {
      if (/^\s*```/.test(line)) {
        insideFence = !insideFence;
        return line;
      }
      if (insideFence) return line;

      return line.replace(/\b[Bb]lock_(\d{1,2})\b/g, 'Block $1');
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
      content: normalizeCareerPlaybookBlockReferences(
        normalizeFillablePlaceholders(block.content, language)
      ),
    };
  }

  return normalizedBlocks;
}

const SOURCES_HEADING = { en: 'Sources', ru: 'Источники' } as const;

/**
 * Append the sources section to the footer block, rendered straight from the
 * evidence ledger.
 *
 * Generated here rather than by the model on purpose: a model-written source
 * list drifts from the ledger, and a citation that resolves to nothing is worse
 * than an honest absence. Only entries actually cited in the document are
 * listed, so the section never advertises sources the guide did not use.
 */
export function appendCareerPlaybookSourcesSection(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  roleProfileSpec?: CareerPlaybookRoleProfileSpec
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  const evidence = roleProfileSpec?.evidence_ledger ?? [];
  const footer = generatedBlocks.block_25;
  if (evidence.length === 0 || !footer) return generatedBlocks;

  const language = resolveContentLanguage(roleProfileSpec);
  const heading = SOURCES_HEADING[language];
  if (new RegExp(`^###\\s+${escapeRegExp(heading)}\\s*$`, 'im').test(footer.content)) {
    return generatedBlocks;
  }

  const documentText = Object.values(generatedBlocks)
    .map(block => block?.content ?? '')
    .join('\n');
  const cited = evidence.filter(entry =>
    new RegExp(`\\[${escapeRegExp(entry.id)}\\]`).test(documentText)
  );
  if (cited.length === 0) return generatedBlocks;

  const lines = cited.map(
    entry =>
      `- [${entry.id}] ${entry.title} — ${entry.url}${
        entry.source_kind && entry.source_kind !== 'unknown' ? ` (${entry.source_kind})` : ''
      }`
  );

  return {
    ...generatedBlocks,
    block_25: {
      ...footer,
      content: `${footer.content.trim()}\n\n### ${heading}\n\n${lines.join('\n')}`,
    },
  };
}

const CALIBRATION_HEADING = {
  en: 'Calibrate before publishing',
  ru: 'Что заменить перед публикацией',
} as const;

const CALIBRATION_INTRO = {
  en: 'Every value below is either marked as an example or rests on an assumed threshold. Replace or confirm each against real company data before this guide is published.',
  ru: 'Каждое значение ниже либо помечено как пример, либо опирается на предполагаемый порог. До публикации замените или подтвердите каждое по реальным данным компании.',
} as const;

/**
 * Why an assumed metric target is on the list, said to the person calibrating.
 *
 * The wording is deliberately not "replace": a threshold the company already
 * runs at needs confirming, not changing. Only its provenance is in question.
 */
const CALIBRATION_ASSUMED_METRIC = {
  en: 'assumed threshold, not company data — confirm against your own baseline before publishing',
  ru: 'предполагаемый порог, не данные компании — подтвердите по своим базовым данным до публикации',
} as const;

const CALIBRATION_COLUMNS = {
  en: '| Section | Value to replace | Context |',
  ru: '| Раздел | Значение к замене | Контекст |',
} as const;

/** Marker forms the guide may use, from the one source the deterministic check reads. */
const EXAMPLE_MARKER_GLOBAL = new RegExp(CAREER_PLAYBOOK_EXAMPLE_MARKER_SOURCE, 'gi');

/**
 * The scorecard's home, used as the Section label for a metric row.
 *
 * A threshold appears in eight blocks; the one the reader edits it in is the
 * scorecard. Naming it by its own heading keeps the row inside the citation
 * rule, exactly as every other row is named.
 */
const METRIC_LEDGER_HOME_BLOCK: CareerPlaybookBlockId = 'block_6';

export interface CareerPlaybookCalibrationItem {
  blockId: CareerPlaybookBlockId;
  value: string;
  context: string;
}

/**
 * Cut to `limit` characters on a word boundary, marking the side that was cut.
 *
 * Run `88fc2368` published rows opening mid-word — "…d escalation map are
 * current as of the last quarterly playbook" — because both columns sliced at a
 * fixed offset. A calibration row is read by a manager deciding what to replace;
 * a fragment starting inside a word costs them a lookup.
 */
function truncateOnWord(text: string, limit: number, side: 'start' | 'end'): string {
  if (text.length <= limit) return text;

  if (side === 'end') {
    const head = text.slice(0, limit);
    const cut = head.lastIndexOf(' ');
    return `${(cut > limit / 2 ? head.slice(0, cut) : head).trimEnd()}…`;
  }

  const tail = text.slice(-limit);
  const cut = tail.indexOf(' ');
  return `…${(cut >= 0 && cut < limit / 2 ? tail.slice(cut + 1) : tail).trimStart()}`;
}

/** Strip table pipes and emphasis so a captured fragment reads as plain text. */
function toPlainFragment(line: string): string {
  return line
    .replace(/^\|\s*/, '')
    .replace(/\s*\|$/, '')
    .replace(/\s*\|\s*/g, ' — ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the value a marker annotates: the text immediately before it, cut at
 * the nearest sentence or cell boundary. "base $120,000 (example — replace)"
 * yields "base $120,000".
 */
function valueBeforeMarker(line: string, markerIndex: number): string {
  const before = line.slice(0, markerIndex);
  const boundary = Math.max(
    before.lastIndexOf('. '),
    before.lastIndexOf('; '),
    before.lastIndexOf(': '),
    before.lastIndexOf('|')
  );
  const value = (boundary >= 0 ? before.slice(boundary + 1) : before).trim();
  return value
    .replace(/^[-*+\s]+/, '')
    .replace(/\*\*/g, '')
    .trim();
}

/**
 * Collect every value carrying the example marker, in block order.
 *
 * The reviewed 2026-08-11 guide left this to the model, and block 26 listed six
 * items while naming none of the seven money values in the document — the very
 * figures most likely to be copied verbatim into an official role guide. A model
 * cannot reliably recall what it marked 900 lines earlier, so the table is
 * assembled here instead, exactly like the Sources section is assembled from the
 * evidence ledger.
 */
export function collectCareerPlaybookCalibrationItems(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): CareerPlaybookCalibrationItem[] {
  const items: CareerPlaybookCalibrationItem[] = [];

  for (const blockId of CAREER_PLAYBOOK_FINAL_BLOCK_ORDER) {
    // Block 26 hosts the table itself; scanning it would list its own rows.
    if (blockId === 'block_26') continue;
    const content = generatedBlocks[blockId]?.content;
    if (!content) continue;

    for (const rawLine of content.replace(/```[\s\S]*?```/g, '\n').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const values = [...line.matchAll(EXAMPLE_MARKER_GLOBAL)]
        .map(match => valueBeforeMarker(line, match.index ?? 0))
        .filter(Boolean);
      if (values.length === 0) continue;

      const context = truncateOnWord(toPlainFragment(line), 120, 'end');

      // In a table the row is the unit of calibration; in prose the value is.
      // The continuity protocol marks every cell it owns, so a row per marker
      // put that one table into sixteen of run `88fc2368`'s twenty-nine rows —
      // "Backup", "Handover state", "Senior AE", "not yet run one solo" — each
      // asking for the same edit. A prose line, by contrast, carries genuinely
      // separate values: "base $120,000 ... and a $5,000 offsite".
      if (line.startsWith('|')) {
        items.push({
          blockId,
          value: truncateOnWord([...new Set(values)].join('; '), 90, 'start'),
          context,
        });
        continue;
      }

      for (const value of values) {
        items.push({ blockId, value: truncateOnWord(value, 90, 'start'), context });
      }
    }
  }

  return dedupeCalibrationItems(items);
}

/**
 * One row per value to calibrate, not one per marker occurrence.
 *
 * A table cell whose every column is marked yields a marker per cell, so run
 * `88fc2368` listed the continuity protocol's backup table sixteen times — as
 * "Backup", "Handover state", "Senior AE", "not yet run one solo" — out of
 * twenty-nine rows. Same block and same value is the same instruction to the
 * person calibrating, however many markers produced it.
 */
function dedupeCalibrationItems(
  items: readonly CareerPlaybookCalibrationItem[]
): CareerPlaybookCalibrationItem[] {
  const seen = new Set<string>();

  return items.filter(item => {
    const key = `${item.blockId}::${item.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The rows the example marker structurally cannot produce: metric targets the
 * model assumed rather than read from the company.
 *
 * A metric value never carries the marker, and that is deliberate — the ledger
 * is the single source, and a marked threshold would let blocks drift from it.
 * The cost was that the checklist built from markers could never name a
 * threshold. Run `88fc2368` listed twenty-nine values to calibrate — peer-buddy
 * hours, backup names, a salary benchmark — and none of the six assumed numbers
 * the role is actually judged against, while block 1 of the same guide told the
 * reader those six needed validating within the first quarter.
 *
 * `user_answer` and `company_source` rows stay off the list: those the company
 * already gave us.
 */
export function collectCareerPlaybookAssumedMetricItems(
  metricLedger: readonly CareerPlaybookMetricLedgerEntry[],
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  language: 'en' | 'ru'
): CareerPlaybookCalibrationItem[] {
  return metricLedger
    .filter(metric => metric.provenance === 'assumption' || metric.provenance === 'benchmark')
    .map(metric => ({
      blockId: METRIC_LEDGER_HOME_BLOCK,
      value: truncateOnWord(
        `${metric.label} — ${metric.target}${metric.unit && !metric.target.includes(metric.unit) ? ` ${metric.unit}` : ''}`,
        90,
        'start'
      ),
      context: CALIBRATION_ASSUMED_METRIC[language],
    }))
    .filter(item => Boolean(sectionLabel(item.blockId, generatedBlocks)));
}

/**
 * Name a calibration row's home by its section title, never as "Block N".
 *
 * This table is application-built and appended into block 26, which the manager
 * and HR read — and it scans every block, most of which neither of them holds.
 * Labelling the rows "Block 8", "Block 11", "Block 23" therefore wrote 27
 * unfollowable pointers into the 2026-08-30 run, more than the whole rest of the
 * guide produced, and no amount of prompt work or regeneration could remove
 * them: they are re-appended at every assembly. The title says what kind of
 * value it is, which is what someone calibrating the guide actually needs, and
 * sends nobody to a page they were not given.
 *
 * Read from the block's own heading so it is the guide's real, localized wording
 * rather than a second English copy of it; the leading number goes with it,
 * because a number is the pointer this exists to avoid.
 */
function sectionLabel(
  blockId: CareerPlaybookBlockId,
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): string {
  const heading = generatedBlocks[blockId]?.content?.match(/^##[ \t]+(.+)$/m)?.[1];
  const title = heading?.replace(/^\s*\d{1,2}\s*[.)]\s*/, '').trim();
  if (title) return title;

  return CAREER_PLAYBOOK_BLOCK_CATALOG.find(block => block.blockId === blockId)?.title ?? blockId;
}

/**
 * Replace block 26's own attempt at a calibration list with one built from the
 * assembled document. The model keeps authorship of everything else in the
 * block; only the table is application-owned, because only the application can
 * see every marker at once.
 */
export function appendCareerPlaybookCalibrationTable(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  roleProfileSpec?: CareerPlaybookRoleProfileSpec
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  const checklist = generatedBlocks.block_26;
  if (!checklist) return generatedBlocks;

  const language = resolveContentLanguage(roleProfileSpec);
  const items = [
    // Assumed thresholds first: they are the values the reader is judged on.
    ...collectCareerPlaybookAssumedMetricItems(
      roleProfileSpec?.metric_ledger ?? [],
      generatedBlocks,
      language
    ),
    ...collectCareerPlaybookCalibrationItems(generatedBlocks),
  ];
  if (items.length === 0) return generatedBlocks;

  const heading = CALIBRATION_HEADING[language];

  // Drop a model-written section with the same purpose so the document does not
  // carry two lists that disagree, bounded by the next third-level heading or the
  // end of the block. Built with String.raw because a template literal silently
  // turns [\s\S] into [sS], which quietly removed only the heading line.
  // The heading is a prefix, not the whole line. Run `88fc2368` wrote
  // "**Calibrate before publishing — replace every value marked as an example**",
  // and a pattern that demanded the closing `**` right after the heading text
  // matched nothing — so the reader met two "Calibrate before publishing"
  // headings in a row, the model's list and this table.
  const localizedHeadings = `${escapeRegExp(CALIBRATION_HEADING.en)}|${escapeRegExp(CALIBRATION_HEADING.ru)}`;
  const boldModelSection = new RegExp(
    String.raw`^\*\*[ \t]*(?:${localizedHeadings})[^\n]*\*\*[^\n]*\n` +
      String.raw`(?:(?!^(?:#{1,6}[ \t]+|\*\*[^*\n]+\*\*[ \t]*$))[\s\S])*`,
    'im'
  );
  const markdownModelSection = new RegExp(
    String.raw`^###[ \t]+(?:${localizedHeadings})[^\n]*\n(?:(?!^###[ \t])[\s\S])*`,
    'im'
  );
  const withoutModelSection = checklist.content
    .replace(boldModelSection, '')
    .replace(markdownModelSection, '')
    .trim();

  const rows = items.map(
    item => `| ${sectionLabel(item.blockId, generatedBlocks)} | ${item.value} | ${item.context} |`
  );

  return {
    ...generatedBlocks,
    block_26: {
      ...checklist,
      content: [
        withoutModelSection,
        '',
        `### ${heading}`,
        '',
        CALIBRATION_INTRO[language],
        '',
        CALIBRATION_COLUMNS[language],
        '| --- | --- | --- |',
        ...rows,
      ].join('\n'),
    },
  };
}

export function prepareCareerPlaybookFinalBlocks(
  input: AssembleCareerPlaybookFinalMarkdownInput
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  const normalizedBlocks = normalizeCareerPlaybookFinalContent(
    input.generatedBlocks,
    input.roleProfileSpec
  );
  const withSources = appendCareerPlaybookSourcesSection(normalizedBlocks, input.roleProfileSpec);
  const withCalibration = appendCareerPlaybookCalibrationTable(withSources, input.roleProfileSpec);
  return ensureRequiredMermaidSections(withCalibration, input.roleProfileSpec);
}

export async function prepareCareerPlaybookFinalBlocksWithQuality(
  input: AssembleCareerPlaybookFinalMarkdownInput
): Promise<PrepareCareerPlaybookFinalBlocksResult> {
  const blocksWithDiagrams = prepareCareerPlaybookFinalBlocks(input);
  return remediateCareerPlaybookMermaidBlocks(blocksWithDiagrams);
}

export function joinCareerPlaybookFinalBlocks(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): string {
  return CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.map(blockId => generatedBlocks[blockId]?.content.trim())
    .filter((content): content is string => Boolean(content))
    .join('\n\n');
}

/** Assemble one reader-specific view from the canonical generated block store. */
export function buildRoleGuideView(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  audience: CareerPlaybookAudience
): string {
  return CAREER_PLAYBOOK_BLOCK_CATALOG.filter(block =>
    (block.audiences as readonly CareerPlaybookAudience[]).includes(audience)
  )
    .map(block => generatedBlocks[block.blockId]?.content.trim())
    .filter((content): content is string => Boolean(content))
    .join('\n\n');
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
