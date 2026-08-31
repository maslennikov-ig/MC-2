/**
 * Career Playbook — canonical ledgers (single source of numeric and factual truth)
 * @module stages/stage-career-playbook/nodes/quality-ledger
 *
 * The 2026-08-11 representative run scored 2.6/5 editorially. Two of its worst
 * dimensions trace back to the same shape of defect: the spec carried metric
 * *names* but no values, and research URLs never reached block generation. Each
 * block therefore invented its own thresholds (pipeline coverage appeared as
 * both >=2x and >=3x within a single generation call) and asserted precise
 * market statistics with nothing behind them.
 *
 * This module owns the ledgers that fix that:
 *
 * - `metric_ledger` — built by the model, then deterministically normalized here,
 *   and quoted verbatim by every block.
 * - `evidence_ledger` — built here from the research result and never by the
 *   model, so a citation cannot be hallucinated.
 * - `cadence_ledger` — the same treatment for recurring rhythms, added after the
 *   2026-08-30 run declared the pipeline review weekly in six blocks and
 *   quarterly in five. Numbers had an owner and agreed; rhythms had none.
 * - `milestone_ledger` — and again for ramp deadlines, added after 2026-08-31,
 *   when the Role Canvas promised the first forecast by week 4 over an
 *   onboarding plan that put it at week 2. "How much" and "how often" had an
 *   owner by then; "by when" was still each block's own opinion.
 *
 * Same division of labour as `spec-builder-canonical.ts`: ask the model, then
 * make the result conform. See docs/career-playbook/quality-contract.md.
 */

import type {
  CareerPlaybookCadenceLedgerEntry,
  CareerPlaybookEvidenceEntry,
  CareerPlaybookMetricLedgerEntry,
  CareerPlaybookMilestoneLedgerEntry,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import type { CareerPlaybookWebResearchResult } from '../rag/web-research';

/** Longest claim kept per evidence entry; enough to identify it, short enough to stay cheap. */
const MAX_CLAIM_LENGTH = 220;

/** Upper bound on evidence entries carried into every block prompt. */
const MAX_EVIDENCE_ENTRIES = 12;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, limit: number): string {
  const collapsed = collapseWhitespace(value);
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * Normalize a model-built metric ledger onto the contract: stable snake_case
 * keys, no duplicate metric, no entry without a target, lowercase units.
 *
 * Dropping a target-less entry is deliberate. An entry with no target cannot
 * constrain anything downstream, and keeping it would let a block "quote the
 * ledger" while still inventing the number — exactly the failure this ledger
 * exists to prevent.
 */
export function normalizeCareerPlaybookMetricLedger(
  entries: readonly CareerPlaybookMetricLedgerEntry[] | undefined
): CareerPlaybookMetricLedgerEntry[] {
  if (!entries?.length) return [];

  const byKey = new Map<string, CareerPlaybookMetricLedgerEntry>();

  for (const entry of entries) {
    const key = collapseWhitespace(entry.key)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const label = collapseWhitespace(entry.label);
    const target = collapseWhitespace(entry.target);

    if (!key || !label || !target) continue;
    // First occurrence wins: the model lists its primary definition first, and a
    // later duplicate is what produced conflicting thresholds in the first place.
    if (byKey.has(key)) continue;

    byKey.set(key, {
      ...entry,
      key,
      label,
      target,
      unit: collapseWhitespace(entry.unit ?? '').toLowerCase(),
      green: collapseWhitespace(entry.green ?? ''),
      yellow: collapseWhitespace(entry.yellow ?? ''),
      red: collapseWhitespace(entry.red ?? ''),
      review_period: collapseWhitespace(entry.review_period ?? '').toLowerCase(),
      source_ref: entry.source_ref?.trim() || null,
    });
  }

  return [...byKey.values()];
}

/**
 * The example marker, in both output languages, as one source for every reader.
 *
 * Two copies of this existed — the deterministic marking check and the
 * application-built calibration table — and both carried the same defect:
 * `\b(?:пример|example)\b`. In JavaScript without the `u` flag `\w` is
 * `[A-Za-z0-9_]`, so a Cyrillic letter is a NON-word character and `\b` never
 * fires between `(` and `п`. Every Russian guide's markers were therefore
 * invisible to both, and the calibration table has never had a row in Russian.
 * The same `\b` trap emptied the digest's cadence section in every RU playbook.
 *
 * `пример` is matched without a boundary and `example` with one, so
 * "(примерно 200 сотрудников)" still does not match — it carries no
 * "заменить"/"replace", which the second half requires.
 */
export const CAREER_PLAYBOOK_EXAMPLE_MARKER_SOURCE = String.raw`\([^)]*(?:\bexample\b|пример)[^)]*(?:заменит[ьи]|replace)[^)]*\)`;

/**
 * The fixed rhythm vocabulary, in both output languages.
 *
 * One list, two readers: the cadence ledger normalizes onto it, and
 * `quality-checks.ts` recognises a block's stated rhythm with it. A second copy
 * would let the ledger accept a word the checker cannot see, which is exactly
 * how a rhythm escapes comparison.
 */
export const CAREER_PLAYBOOK_CADENCE_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(daily|every day|each day)\b|ежедневн|каждый день/i, 'daily'],
  [/\b(weekly|every week|each week)\b|еженедельн|каждую неделю|раз в неделю/i, 'weekly'],
  [
    /\b(biweekly|fortnightly|every two weeks|every other week)\b|раз в две недели|каждые две недели/i,
    'biweekly',
  ],
  [/\b(monthly|every month|each month)\b|ежемесячн|раз в месяц|каждый месяц/i, 'monthly'],
  [
    /\b(quarterly|every quarter|each quarter)\b|ежекварт|раз в квартал|каждый квартал/i,
    'quarterly',
  ],
  [/\b(annual(ly)?|yearly|every year|each year)\b|ежегодн|раз в год|каждый год/i, 'annual'],
];

/** Canonical token for a rhythm written in any accepted wording, or null. */
export function normalizeCareerPlaybookCadence(value: string): string | null {
  const collapsed = collapseWhitespace(value);
  if (!collapsed) return null;
  for (const [pattern, name] of CAREER_PLAYBOOK_CADENCE_WORDS) {
    if (pattern.test(collapsed)) return name;
  }
  return null;
}

/**
 * Normalize a model-built cadence ledger: stable snake_case keys, one entry per
 * commitment, and a rhythm drawn from the fixed vocabulary.
 *
 * An entry whose rhythm is not recognisable is dropped, for the same reason a
 * target-less metric is dropped. It cannot constrain a block, and keeping it
 * would let a block "quote the ledger" while still choosing its own rhythm —
 * the failure the ledger exists to prevent.
 */
export function normalizeCareerPlaybookCadenceLedger(
  entries: readonly CareerPlaybookCadenceLedgerEntry[] | undefined
): CareerPlaybookCadenceLedgerEntry[] {
  if (!entries?.length) return [];

  const byKey = new Map<string, CareerPlaybookCadenceLedgerEntry>();

  for (const entry of entries) {
    const key = collapseWhitespace(entry.key)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const label = collapseWhitespace(entry.label);
    const cadence = normalizeCareerPlaybookCadence(entry.cadence ?? '');

    if (!key || !label || !cadence) continue;
    // First occurrence wins, as in the metric ledger: a later duplicate is the
    // second answer that made the commitment unplannable in the first place.
    if (byKey.has(key)) continue;

    byKey.set(key, {
      ...entry,
      key,
      label,
      cadence,
      owner: collapseWhitespace(entry.owner ?? ''),
      scope: collapseWhitespace(entry.scope ?? ''),
    });
  }

  return [...byKey.values()];
}

// Data, not instruction: the rule about rhythms lives in the RHYTHMS section of
// the contract, and a sentence phrased as guidance here is one more sentence the
// model can mistake for content worth passing on to the reader.
const CADENCE_LEDGER_EMPTY = 'none — no recurring commitment was declared for this role';

/** Render the cadence ledger as the markdown table the block prompts quote from. */
export function formatCareerPlaybookCadenceLedgerForPrompt(
  cadences: readonly CareerPlaybookCadenceLedgerEntry[]
): string {
  if (cadences.length === 0) return CADENCE_LEDGER_EMPTY;

  const rows = cadences.map(
    entry => `| ${entry.label} | ${entry.cadence} | ${entry.owner || '—'} | ${entry.scope || '—'} |`
  );

  return ['| Commitment | Cadence | Owner | Scope |', '| --- | --- | --- | --- |', ...rows].join(
    '\n'
  );
}

/** Convenience accessor used by prompt builders and deterministic checks alike. */
export function getCareerPlaybookCadenceLedger(
  spec: CareerPlaybookRoleProfileSpec | null | undefined
): CareerPlaybookCadenceLedgerEntry[] {
  return spec?.cadence_ledger ?? [];
}

/**
 * The ramp vocabulary, in both output languages, with the length of each unit in
 * days.
 *
 * One list, two readers, exactly as with rhythms: the milestone ledger
 * normalizes onto it and `milestone-checks.ts` recognises a block's stated
 * deadline with it. Days are the comparison unit because the guide legitimately
 * mixes units for the same commitment — "Day 60" and "the first two months" are
 * the same promise, and only a common unit can say so.
 *
 * The Russian side matches a stem PLUS its inflection — `недел\p{L}*` — rather
 * than the stem alone. The trailing letters have to be consumed, not merely
 * tolerated: the number is read from the text immediately around the match, so
 * a pattern that stops at `недел` leaves "я 2" behind and finds no digit at all.
 * No `\b` is asserted next to a Cyrillic letter, which is the trap that made
 * every Russian example marker invisible.
 */
export const CAREER_PLAYBOOK_MILESTONE_UNITS: ReadonlyArray<readonly [RegExp, string, number]> = [
  [/\b(?:days?)\b|день|дн\p{L}*/iu, 'day', 1],
  [/\b(?:weeks?)\b|недел\p{L}*/iu, 'week', 7],
  [/\b(?:months?)\b|месяц\p{L}*/iu, 'month', 30],
  [/\b(?:quarters?)\b|квартал\p{L}*/iu, 'quarter', 90],
];

/** Ordinal words that stand in for the number 1..4 in a ramp phrase. */
const MILESTONE_ORDINALS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\b(?:first|1st)\b|перв/i, 1],
  [/\b(?:second|2nd)\b|втор/i, 2],
  [/\b(?:third|3rd)\b|трет/i, 3],
  [/\b(?:fourth|4th)\b|четв[её]рт/i, 4],
];

export interface CareerPlaybookMilestone {
  /** Canonical wording, e.g. `week 2`. */
  canonical: string;
  /** Days from the start of the ramp, the only comparable form. */
  days: number;
}

/**
 * Read a ramp deadline written in any accepted wording, or null.
 *
 * Accepts a number on either side of the unit ("Day 30", "30 days", "день 30",
 * "30 дней") and an ordinal in place of it ("the first month", "первый
 * квартал"), because those are the forms the guide actually uses. Anything else
 * returns null and the row is dropped: a deadline the checker cannot read is a
 * deadline a block can "quote" while writing whatever it likes.
 */
export function normalizeCareerPlaybookMilestone(value: string): CareerPlaybookMilestone | null {
  const text = collapseWhitespace(value);
  if (!text) return null;

  for (const [pattern, unit, dayLength] of CAREER_PLAYBOOK_MILESTONE_UNITS) {
    const match = pattern.exec(text);
    if (!match) continue;

    const index = match.index;
    const before = text.slice(Math.max(0, index - 24), index);
    const after = text.slice(index + match[0].length, index + match[0].length + 12);
    const digits = /(\d{1,3})\s*$/.exec(before)?.[1] ?? /^\s*(\d{1,3})/.exec(after)?.[1];

    if (digits) {
      const count = Number(digits);
      if (count > 0) return { canonical: `${unit} ${count}`, days: count * dayLength };
      continue;
    }

    const ordinal = MILESTONE_ORDINALS.find(([ordinalPattern]) => ordinalPattern.test(text));
    if (ordinal) return { canonical: `${unit} ${ordinal[1]}`, days: ordinal[1] * dayLength };
  }

  return null;
}

/**
 * Normalize a model-built milestone ledger: stable snake_case keys, one entry
 * per commitment, and a deadline drawn from the ramp vocabulary.
 *
 * A row whose deadline is unreadable is dropped, for the same reason a rhythm
 * outside the six words is: it cannot constrain a block.
 */
export function normalizeCareerPlaybookMilestoneLedger(
  entries: readonly CareerPlaybookMilestoneLedgerEntry[] | undefined
): CareerPlaybookMilestoneLedgerEntry[] {
  if (!entries?.length) return [];

  const byKey = new Map<string, CareerPlaybookMilestoneLedgerEntry>();

  for (const entry of entries) {
    const key = collapseWhitespace(entry.key)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const label = collapseWhitespace(entry.label);
    const milestone = normalizeCareerPlaybookMilestone(entry.offset ?? '');

    if (!key || !label || !milestone) continue;
    // First occurrence wins, as in the other two ledgers: a later duplicate is
    // the second answer that made the commitment unplannable in the first place.
    if (byKey.has(key)) continue;

    byKey.set(key, {
      ...entry,
      key,
      label,
      offset: milestone.canonical,
      owner: collapseWhitespace(entry.owner ?? ''),
      scope: collapseWhitespace(entry.scope ?? ''),
    });
  }

  return [...byKey.values()];
}

const MILESTONE_LEDGER_EMPTY = 'none — no ramp deadline was declared for this role';

/** Render the milestone ledger as the markdown table the block prompts quote from. */
export function formatCareerPlaybookMilestoneLedgerForPrompt(
  milestones: readonly CareerPlaybookMilestoneLedgerEntry[]
): string {
  if (milestones.length === 0) return MILESTONE_LEDGER_EMPTY;

  const rows = milestones.map(
    entry => `| ${entry.label} | ${entry.offset} | ${entry.owner || '—'} | ${entry.scope || '—'} |`
  );

  return ['| Commitment | Due | Owner | Scope |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

/** Convenience accessor used by prompt builders and deterministic checks alike. */
export function getCareerPlaybookMilestoneLedger(
  spec: CareerPlaybookRoleProfileSpec | null | undefined
): CareerPlaybookMilestoneLedgerEntry[] {
  return spec?.milestone_ledger ?? [];
}

/**
 * Build the evidence ledger from the research result. Application-owned on
 * purpose: identifiers are assigned in retrieval order and every claim stays
 * attached to the URL it came from, so a `[Sn]` marker in the guide always
 * resolves to a real source.
 */
/** Domains whose content is peer-reviewed, statistical, or institutional. */
const RESEARCH_DOMAIN =
  /(?:^|\.)(?:gartner|forrester|mckinsey|bain|bcg|deloitte|pwc|kpmg|hbr|nber|oecd|statista|pewresearch|nature|springer|acm|ieee)\.|\.(?:edu|ac\.uk|gov)(?:$|\/)/i;

/** News and trade media: reporting, not primary research, but not self-interested either. */
const MEDIA_DOMAIN =
  /(?:^|\.)(?:reuters|bloomberg|ft|wsj|economist|techcrunch|theverge|wired|forbes|businessinsider|axios|cnbc)\./i;

/**
 * Classify a source so a reader can tell a study from a vendor blog.
 *
 * Every source of the 2026-08-11 run was a vendor marketing post, and the guide
 * presented those numbers exactly as it would have presented research. A blog
 * post from a company selling the tooling it measures is still usable evidence —
 * it just should not look like a study.
 */
export function classifyCareerPlaybookSource(
  url: string
): 'research' | 'vendor' | 'media' | 'unknown' {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'unknown';
  }

  if (RESEARCH_DOMAIN.test(host)) return 'research';
  if (MEDIA_DOMAIN.test(host)) return 'media';
  // A company blog is the default shape of a retrieved marketing page.
  if (/\/blog\/|\/resources\/|\/guides\//i.test(url)) return 'vendor';
  return 'unknown';
}

export function buildCareerPlaybookEvidenceLedger(
  research: CareerPlaybookWebResearchResult | null | undefined,
  retrievedAt: string
): CareerPlaybookEvidenceEntry[] {
  if (!research?.findings?.length) return [];

  const seenUrls = new Set<string>();
  const entries: CareerPlaybookEvidenceEntry[] = [];

  for (const finding of research.findings) {
    if (entries.length >= MAX_EVIDENCE_ENTRIES) break;

    const url = finding.url.trim();
    const claim = truncate(finding.claim, MAX_CLAIM_LENGTH);
    if (!url || !claim || seenUrls.has(url)) continue;

    seenUrls.add(url);
    entries.push({
      id: `S${entries.length + 1}`,
      url,
      title: truncate(finding.title, 120) || url,
      claim,
      retrieved_at: retrievedAt,
      source_kind: classifyCareerPlaybookSource(url),
    });
  }

  return entries;
}

/**
 * Drop metric source references that point at no evidence entry. A dangling
 * `source_ref` would let a block print `[S3]` for a source that does not exist,
 * which is worse than an honest unsourced benchmark.
 */
export function reconcileMetricLedgerSourceRefs(
  metrics: readonly CareerPlaybookMetricLedgerEntry[],
  evidence: readonly CareerPlaybookEvidenceEntry[]
): CareerPlaybookMetricLedgerEntry[] {
  const ids = new Set(evidence.map(entry => entry.id));

  return metrics.map(metric => {
    if (!metric.source_ref || ids.has(metric.source_ref)) return metric;
    // A benchmark without a resolvable source is an assumption, and the guide
    // must present it as one rather than as an externally backed figure.
    return {
      ...metric,
      source_ref: null,
      provenance: metric.provenance === 'benchmark' ? 'assumption' : metric.provenance,
    };
  });
}

const METRIC_LEDGER_EMPTY = 'none — no canonical metric targets were derived for this role';

/** Render the metric ledger as the markdown table the block prompts quote from. */
export function formatCareerPlaybookMetricLedgerForPrompt(
  metrics: readonly CareerPlaybookMetricLedgerEntry[]
): string {
  if (metrics.length === 0) return METRIC_LEDGER_EMPTY;

  const rows = metrics.map(metric => {
    const thresholds = [
      metric.green && `green ${metric.green}`,
      metric.yellow && `yellow ${metric.yellow}`,
      metric.red && `red ${metric.red}`,
    ]
      .filter(Boolean)
      .join('; ');

    return `| ${metric.label} | ${metric.target}${metric.unit ? ` ${metric.unit}` : ''} | ${
      thresholds || '—'
    } | ${metric.review_period || '—'} | ${metric.provenance}${
      metric.source_ref ? ` [${metric.source_ref}]` : ''
    } |`;
  });

  return [
    '| Metric | Target | Traffic light | Review period | Provenance |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

const EVIDENCE_LEDGER_EMPTY =
  'none — no external source was retrieved for this run, so no precise external statistic may be stated';

/** Render the evidence ledger as the citable list the block prompts reference. */
export function formatCareerPlaybookEvidenceLedgerForPrompt(
  evidence: readonly CareerPlaybookEvidenceEntry[]
): string {
  if (evidence.length === 0) return EVIDENCE_LEDGER_EMPTY;

  return evidence
    .map(
      entry =>
        `- [${entry.id}] (${entry.source_kind ?? 'unknown'}) ${entry.title} — ${entry.url} — supports: ${entry.claim}`
    )
    .join('\n');
}

/** Convenience accessor used by prompt builders and deterministic checks alike. */
export function getCareerPlaybookMetricLedger(
  spec: CareerPlaybookRoleProfileSpec | null | undefined
): CareerPlaybookMetricLedgerEntry[] {
  return spec?.metric_ledger ?? [];
}

/** Convenience accessor used by prompt builders and deterministic checks alike. */
export function getCareerPlaybookEvidenceLedger(
  spec: CareerPlaybookRoleProfileSpec | null | undefined
): CareerPlaybookEvidenceEntry[] {
  return spec?.evidence_ledger ?? [];
}
