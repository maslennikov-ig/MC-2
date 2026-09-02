/**
 * Career Playbook — deterministic quality checks
 * @module stages/stage-career-playbook/nodes/quality-checks
 *
 * Five checks for the five defect classes the 2026-08-11 editorial review found
 * by hand. They run before the LLM judge and cost nothing, which matters twice
 * over: they are free, and they do not depend on which model the judge happened
 * to get. The reviewed run had judge calls return an empty verdict on groups
 * that demonstrably contained conflicts.
 *
 * Every check is a pure function over block markdown plus the spec ledgers, and
 * every one ignores fenced code and Mermaid so diagram syntax is never mistaken
 * for prose. See docs/career-playbook/quality-contract.md section 6.
 */

import {
  type CareerPlaybookBlockId,
  type CareerPlaybookBlockState,
  type CareerPlaybookCadenceLedgerEntry,
  type CareerPlaybookEvidenceEntry,
  type CareerPlaybookJudgeIssue,
  type CareerPlaybookMetricLedgerEntry,
  type CareerPlaybookMilestoneLedgerEntry,
} from '@megacampus/shared-types';
import { careerPlaybookBlockMayCite, getCareerPlaybookBlockAudiences } from './audience-scope';
import {
  blockPosition,
  dedupeIssues,
  enumerationSegmentAt,
  issue,
  lineNamesLabelLoosely,
  proseLines,
  stripFencedBlocks,
  truncateLine,
} from './quality-check-text';
import { validateMilestoneConsistency, validateRampOwnership } from './milestone-checks';
import {
  CAREER_PLAYBOOK_CADENCE_WORDS,
  CAREER_PLAYBOOK_EXAMPLE_MARKER_SOURCE,
} from './quality-ledger';

// Re-exported: `stripFencedBlocks` is part of this module's public surface and
// the scorecard and tests import it from here.
export { stripFencedBlocks } from './quality-check-text';

export interface CareerPlaybookQualityCheckContext {
  metricLedger: readonly CareerPlaybookMetricLedgerEntry[];
  evidenceLedger: readonly CareerPlaybookEvidenceEntry[];
  /** Canonical rhythms. Empty for a spec built before the ledger existed. */
  cadenceLedger?: readonly CareerPlaybookCadenceLedgerEntry[];
  /** Canonical ramp deadlines. Empty for a spec built before the ledger existed. */
  milestoneLedger?: readonly CareerPlaybookMilestoneLedgerEntry[];
  generatedOn?: string;
  /** Only universal-mode runs treat an unmarked company value as a defect. */
  businessContextMode?: 'universal' | 'company_specific';
  /** Anti-goal statements already published, used by the anti-goal conflict check. */
  publishedAntiGoals?: readonly string[];
}

type BlockMap = Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;

// ---------------------------------------------------------------------------
// 1. Metric ledger consistency
// ---------------------------------------------------------------------------

/** Numeric tokens a threshold can be written with, e.g. `>=3x`, `±10%`, `15%`, `2.5x`. */
const NUMBER_TOKEN =
  /[<>]=?\s*\d+(?:[.,]\d+)?\s*[%x×]?|[±]\s*\d+(?:[.,]\d+)?\s*%?|\d+(?:[.,]\d+)?\s*[%x×]/gi;

/**
 * Reduce a numeric token to a comparable form: digits plus unit, direction and
 * spacing dropped. `>= 3x`, `3х` and `3 x` all become `3x` so a genuine value
 * clash is detected while formatting noise is not.
 */
function canonicalNumber(token: string): string {
  return token
    .toLowerCase()
    .replace(/[×х]/g, 'x')
    .replace(/,/g, '.')
    .replace(/[<>=±\s]/g, '')
    .replace(/\.0+$/, '');
}

function numbersIn(text: string): Set<string> {
  const matches = text.match(NUMBER_TOKEN) ?? [];
  return new Set(matches.map(canonicalNumber).filter(Boolean));
}

/** Trailing unit of a canonical number, so a weight percentage is not compared to a coverage multiple. */
function unitOf(canonicalValue: string): string {
  const match = canonicalValue.match(/[%x]$/);
  return match ? match[0] : '';
}

/** Values from the traffic-light thresholds; allowed on a line, but they do not count as citing the target. */
function thresholdNumbers(metric: CareerPlaybookMetricLedgerEntry): Set<string> {
  const values = new Set<string>();
  for (const field of [metric.green, metric.yellow, metric.red]) {
    if (!field) continue;
    for (const value of numbersIn(field)) values.add(value);
  }
  return values;
}

/**
 * The example marker, tolerating the qualifiers a writer naturally adds:
 * "(example — replace)", "(example — replace: $4,000)", "(пример — заменить числа)".
 * Requiring the bare form flagged correctly-marked values on the first clean run.
 */
// The verb may follow the value: "(example: $100K — replace with your threshold)".
// The marker may sit anywhere inside the parentheses and use any separator:
// "(e.g., >$50,000 — example, replace with your threshold)".
const EXAMPLE_MARKER = new RegExp(CAREER_PLAYBOOK_EXAMPLE_MARKER_SOURCE, 'i');

type ThresholdDirection = 'floor' | 'ceiling' | 'range';

const CEILING_CUE =
  /(?:<|≤|below|under|less than|at most|no more than|drops? below|ниже|меньше|не более)\s*$/i;
const FLOOR_CUE = /(?:>|≥|above|over|more than|at least|minimum|выше|больше|не менее)\s*$/i;

/** Direction of the comparison attached to a number, read from the text before it. */
function directionBefore(text: string, index: number): ThresholdDirection | null {
  const lead = text.slice(Math.max(0, index - 24), index);
  if (CEILING_CUE.test(lead)) return 'ceiling';
  if (FLOOR_CUE.test(lead)) return 'floor';
  return null;
}

/** Band values with the direction the ledger states them in. A range matches either way. */
function directedBandValues(
  metric: CareerPlaybookMetricLedgerEntry
): Map<string, Set<ThresholdDirection>> {
  const bands = new Map<string, Set<ThresholdDirection>>();

  const record = (field: string, fallback: ThresholdDirection) => {
    if (!field) return;
    for (const match of field.matchAll(NUMBER_TOKEN)) {
      const value = canonicalNumber(match[0]);
      if (!value) continue;
      const direction = directionBefore(field, match.index ?? 0) ?? fallback;
      const existing = bands.get(value) ?? new Set<ThresholdDirection>();
      existing.add(direction);
      bands.set(value, existing);
    }
  };

  record(metric.green, 'floor');
  // A yellow band is a corridor: either side of it may be quoted.
  record(metric.yellow, 'range');
  record(metric.red, 'ceiling');

  return bands;
}

/**
 * Whether the line is quoting a traffic-light band rather than asserting a
 * competing target. Requires the direction to agree: the red band "<2x" and a
 * claim of "at least 2x" share digits and mean opposite things.
 */
function citesBand(
  line: string,
  value: string,
  bands: Map<string, Set<ThresholdDirection>>
): boolean {
  const directions = bands.get(value);
  if (!directions) return false;
  if (directions.has('range')) return true;

  for (const match of line.matchAll(NUMBER_TOKEN)) {
    if (canonicalNumber(match[0]) !== value) continue;
    const direction = directionBefore(line, match.index ?? 0);
    // An undirected mention is ambiguous; treat it as quoting the band rather
    // than spending a regeneration on a guess.
    if (!direction || directions.has(direction)) return true;
  }

  return false;
}

const TRAFFIC_LIGHT_WORD = /\b(green|yellow|red|amber)\b|зелён|жёлт|желт|красн/i;

/**
 * Whether a line is reporting the traffic-light scale rather than committing to
 * a value. Such a line legitimately contains the threshold numbers, including
 * ones that look like a different target when the direction is stripped — the
 * red band `<2x` and a claim of "at least 2x" share digits but mean opposites.
 */
function isTrafficLightLine(line: string, thresholds: Set<string>): boolean {
  if (TRAFFIC_LIGHT_WORD.test(line)) return true;
  const present = [...numbersIn(line)].filter(value => thresholds.has(value));
  return present.length >= 2;
}

/** Generic tail nouns a block routinely drops when naming a metric in prose. */
const METRIC_LABEL_TAIL = /\s+(ratio|rate|score|percentage|percent|index|коэффициент|показатель)$/i;

/**
 * Match a metric by its ledger label, tolerating the shorter form prose uses.
 *
 * The reviewed guide wrote "Pipeline coverage ratio" in the KPI table and
 * "pipeline coverage drops below 4x" in the FMEA table. Matching only the exact
 * label would let that second, conflicting threshold through — which is exactly
 * the defect this check exists for.
 */
function metricLabelPattern(label: string): RegExp {
  const variants = new Set([label, label.replace(METRIC_LABEL_TAIL, '')]);
  const alternatives = [...variants]
    .filter(variant => variant.trim().length >= 4)
    .map(variant =>
      variant
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s+')
    );

  return new RegExp(alternatives.join('|'), 'i');
}

/**
 * The part of the line that belongs to this metric.
 *
 * A line routinely carries several metrics with a number each — "CSAT <85%;
 * First response time >30 мин; Average resolution time >48 ч" — and reading the
 * numbers off the whole line hands each metric its neighbours'. Every
 * metric_conflict surviving in the stored corpus on 2026-09-01 was that:
 * block_21 of run 638ed691 was told it puts team quota attainment at 90%, on a
 * line whose 90% belongs to planned coaching completion; block_3 of 4e355bf4 was
 * told it puts team retention at 10%, where 10% is the weight of the
 * responsibility zone in a heading. Both spent the regeneration cap on it.
 *
 * The same answer the ramp and rhythm families arrived at, using the same
 * primitive: nearest-wins inside the enumeration item.
 */
function metricSegmentsIn(line: string, label: string): string {
  const pattern = new RegExp(metricLabelPattern(label).source, 'gi');
  const segments: string[] = [];

  for (const match of line.matchAll(pattern)) {
    const segment = enumerationSegmentAt(line, match.index ?? 0);
    if (!segments.includes(segment.text)) segments.push(segment.text);
  }

  return segments.join(' ');
}

/**
 * Flag a line that names a ledger metric and attaches a number the ledger does
 * not sanction.
 *
 * This is the check for the review's finding 2: pipeline coverage appeared as
 * both >=2x and >=3x, forecast accuracy as ±10%, ±5% and ±15%, turnover across
 * four different thresholds — all presented as Definitions of Done and bonus
 * conditions rather than as illustrations.
 */
export function validateMetricLedgerConsistency(
  blocks: BlockMap,
  context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  if (context.metricLedger.length === 0) return [];

  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    for (const line of proseLines(content)) {
      for (const metric of context.metricLedger) {
        if (!metricLabelPattern(metric.label).test(line)) continue;

        const targetNumbers = numbersIn(metric.target);
        if (targetNumbers.size === 0) continue;

        const claim = metricSegmentsIn(line, metric.label);

        // Compare like with like: a 25% responsibility weight beside "pipeline
        // coverage" is not a claim about coverage, so only numbers sharing a
        // unit with the target are candidates.
        const targetUnits = new Set([...targetNumbers].map(unitOf));
        const candidates = [...numbersIn(claim)].filter(value => targetUnits.has(unitOf(value)));
        if (candidates.length === 0) continue;

        // The line quotes the committed value: nothing to flag.
        if (candidates.some(value => targetNumbers.has(value))) continue;

        const thresholds = thresholdNumbers(metric);
        if (isTrafficLightLine(line, thresholds)) continue;
        // A line may legitimately quote a band: "if coverage drops below 2x,
        // flag" restates the red threshold. Direction is what separates that
        // from a competing target — "coverage is at least 2x" uses the same
        // digits to mean the opposite of the red band "<2x".
        const bands = directedBandValues(metric);
        if (candidates.every(value => citesBand(claim, value, bands))) continue;
        // A line the author already marked as an illustration is not claiming a
        // competing target: "target variable 50% of base (example — replace)"
        // is about compensation, not about the metric named beside it.
        if (EXAMPLE_MARKER.test(line)) continue;

        const conflicting = candidates.filter(value => !targetNumbers.has(value));
        if (conflicting.length === 0) continue;

        issues.push(
          issue(
            blockId,
            'metric_conflict',
            `${blockId} states "${metric.label}" with ${conflicting.join(', ')}, which is not in the metric ledger (target ${metric.target}).`,
            `Use the ledger value for "${metric.label}": target ${metric.target}${
              metric.green ? `, green ${metric.green}` : ''
            }${metric.yellow ? `, yellow ${metric.yellow}` : ''}${metric.red ? `, red ${metric.red}` : ''}.`
          )
        );
        break;
      }
    }
  }

  return dedupeIssues(issues);
}

// ---------------------------------------------------------------------------
// 2. Unsourced external statistics
// ---------------------------------------------------------------------------

/**
 * Signals that a number describes the world outside this company rather than
 * this role's own target.
 *
 * Deliberately narrow. A first, looser version flagged "team adoption of the new
 * process", "based on pulse survey results" and "below company benchmark" —
 * internal statements that carry no citation because none is owed. Since these
 * findings drive paid regeneration, a false positive costs money and can make
 * the guide worse, so only high-confidence signals qualify:
 *
 * 1. explicit attribution ("research shows", "according to", "по данным")
 * 2. a percentage OF a population ("95% of B2B marketers")
 * 3. an external-scope noun (industry, market, sector, worldwide)
 */
const EXTERNAL_ATTRIBUTION =
  /\b(research shows|research indicates|studies|study (?:shows|found|indicates)|according to|survey of|surveyed)\b|по\sданным|исследовани\w*\s+показ|согласно\s+исследовани/i;

const POPULATION_SHARE = /\d{1,3}(?:[.,]\d+)?\s*%\s+(?:of|из|от)\s+\w/i;

/**
 * A share is only an external claim when the population it describes lives
 * outside the company. "80% of 1:1s happen" is an internal observation; "95% of
 * B2B marketers use AI weekly" is a market statistic that owes a citation.
 */
const EXTERNAL_POPULATION =
  /\b(b2b|saas|companies|organi[sz]ations|firms|respondents|buyers|professionals|marketers|vendors|enterprises|employers)\b|компани\w*\s+рынка|респондент/i;

const EXTERNAL_SCOPE =
  /\b(industry|sector|worldwide|globally|industry-wide|across the industry)\b|(?<![\w‐-―-])market\b|отраслев|рыночн\w*\s+(?:данн|показател)/i;

const PRECISE_STATISTIC = /\b\d{1,3}(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*[x×]\b/i;

function looksLikeExternalClaim(line: string): boolean {
  if (EXTERNAL_ATTRIBUTION.test(line)) return true;
  if (POPULATION_SHARE.test(line) && EXTERNAL_POPULATION.test(line)) return true;
  return EXTERNAL_SCOPE.test(line);
}

/**
 * Flag a precise external statistic with no resolvable citation.
 *
 * The reviewed guide asserted 90-95% AI accuracy, 40-60 saved hours per month,
 * 95% weekly and 65% daily AI adoption, and a 28% response rate, all with the
 * phrase "research shows" and not one URL anywhere in the document.
 */
export function validateUnsourcedStatistics(
  blocks: BlockMap,
  context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  const knownIds = new Set(context.evidenceLedger.map(entry => entry.id));
  const citedById = new Map(context.evidenceLedger.map(entry => [entry.id, entry]));
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    for (const line of proseLines(content)) {
      if (!PRECISE_STATISTIC.test(line) || !looksLikeExternalClaim(line)) continue;
      // A line stating one of this role's own ledger metrics is a target, not a
      // claim about the world, even when it mentions the market it operates in.
      if (context.metricLedger.some(metric => metricLabelPattern(metric.label).test(line))) {
        continue;
      }
      // The label is rarely written out. Run `88fc2368` published "Forecast
      // numbers are submitted by the role and judged on accuracy quarterly —
      // treat accuracy below the published 80% target as a method failure, not a
      // market failure": the ledger's own `Forecast accuracy` target, restated in
      // prose. One incidental "market" was the only external signal, and the
      // contiguous-label exemption cannot see a label split across a clause, so
      // the guide was asked to cite a source for its own number. Block 18 was
      // regenerated twice and shipped the critical.
      //
      // Scattered label words are a weaker signal than the written-out label, so
      // they excuse only the weakest trigger: a line named as external by scope
      // alone. An attribution ("research shows") or a share of an outside
      // population still owes a citation however the line reads.
      if (
        !EXTERNAL_ATTRIBUTION.test(line) &&
        !(POPULATION_SHARE.test(line) && EXTERNAL_POPULATION.test(line)) &&
        context.metricLedger.some(metric => lineNamesLabelLoosely(line, metric.label))
      ) {
        continue;
      }

      const citations = line.match(/\[S\d+\]/g) ?? [];
      if (citations.length === 0) {
        issues.push(
          issue(
            blockId,
            'unsourced_claim',
            `${blockId} states a precise external statistic with no source: "${truncateLine(line)}".`,
            context.evidenceLedger.length === 0
              ? 'No external source was retrieved for this run. Rewrite without the precise figure, as a hypothesis to validate.'
              : 'Add a [Sn] reference from the evidence ledger, or rewrite without the precise figure.'
          )
        );
        continue;
      }

      const dangling = citations.filter(marker => !knownIds.has(marker.slice(1, -1)));
      if (dangling.length > 0) {
        issues.push(
          issue(
            blockId,
            'unsourced_claim',
            `${blockId} cites ${dangling.join(', ')}, which is not in the evidence ledger.`,
            'Cite an existing evidence entry or drop the precise figure.'
          )
        );
        continue;
      }

      // A resolvable citation is not the same as a supporting one. The ledger
      // stores the retrieved fragment, so the cheapest honest check is whether
      // the number in the sentence appears in the fragment at all. The
      // 2026-08-11 guide asserted "87% of sales organisations now use AI [S9]"
      // and nothing had ever compared 87 to what S9 actually said.
      const citedEntries = citations
        .map(marker => citedById.get(marker.slice(1, -1)))
        .filter((entry): entry is CareerPlaybookEvidenceEntry => Boolean(entry));
      if (citedEntries.length === 0) continue;

      const supportingText = citedEntries.map(entry => entry.claim).join(' ');
      const supportingNumbers = numbersIn(supportingText);
      const claimedNumbers = [...numbersIn(line)];
      const unsupported = claimedNumbers.filter(value => !supportingNumbers.has(value));

      if (unsupported.length > 0 && unsupported.length === claimedNumbers.length) {
        issues.push(
          issue(
            blockId,
            'unsourced_claim',
            `${blockId} cites ${citations.join(', ')} for ${unsupported.join(', ')}, but that figure does not appear in the retrieved source text.`,
            'Quote a figure the cited source actually contains, cite a different entry, or state the point without a precise number.'
          )
        );
      }
    }
  }

  return dedupeIssues(issues);
}

// ---------------------------------------------------------------------------
// 3. Example marking
// ---------------------------------------------------------------------------

/** Currency amounts and ARR/budget figures — the values a reader is most likely to copy verbatim. */
const COMPANY_VALUE =
  /(?:[$€£₽]\s?\d[\d\s.,]*(?:\s*[kmb]| ?млн| ?тыс| ?млрд)?)|(?:\b\d[\d\s.,]*\s*(?:USD|EUR|RUB|руб\.?|млн|тыс\.?|k\b|m\b))/i;

/** Lines that are explicitly template fields the reader fills in are not violations. */
const FILLABLE_FIELD = /field to fill|поле для заполнения/i;

/**
 * Flag an unverified monetary value presented without the example marker.
 *
 * The universal fixture had no company corpus, yet the guide printed a
 * $120,000/$60,000 compensation split and a $50M incremental ARR scenario. The
 * product decision is to keep concrete examples — they make the guide usable —
 * so the requirement is that they are unmistakably marked as replaceable.
 */
export function validateExampleMarking(
  blocks: BlockMap,
  context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  // In company_specific mode the corpus can legitimately supply real figures.
  if (context.businessContextMode !== 'universal') return [];

  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;
    // Block 26 hosts the application-built calibration table, which quotes each
    // marked value with the marker stripped. Scanning it makes the instrument
    // that lists unmarked values report itself.
    if (blockId === 'block_26') continue;

    for (const line of proseLines(content)) {
      if (!COMPANY_VALUE.test(line)) continue;
      if (EXAMPLE_MARKER.test(line) || FILLABLE_FIELD.test(line)) continue;

      issues.push(
        issue(
          blockId,
          'unmarked_example',
          `${blockId} presents an unverified company-specific amount as fact: "${truncateLine(line)}".`,
          'Append "(example — replace)" / "(пример — заменить)" after the value, or remove the amount.'
        )
      );
    }
  }

  return dedupeIssues(issues);
}

// ---------------------------------------------------------------------------
// 4. Relative dates
// ---------------------------------------------------------------------------

const CALENDAR_YEAR = /\b(19|20)\d{2}\b/g;

/**
 * Flag an absolute calendar year outside the footer.
 *
 * No prompt carried the current date, so the model defaulted to its training
 * era: the onboarding Gantt was pinned to January-March 2025 and training
 * records to 2024-2025, in a guide generated in August 2026.
 */
export function validateRelativeDates(
  blocks: BlockMap,
  context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  const generatedYear = context.generatedOn?.slice(0, 4);
  // No anchor means no way to tell a stale year from the current one; skipping
  // beats guessing and flagging every legitimate reference.
  if (!generatedYear || !/^\d{4}$/.test(generatedYear)) return [];

  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    // Block 25 is the footer: it is the one place an absolute date belongs.
    if (!content || blockId === 'block_25') continue;

    const years = new Set(
      (stripFencedBlocks(content).match(CALENDAR_YEAR) ?? []).filter(year => year !== generatedYear)
    );
    if (years.size === 0) continue;

    issues.push(
      issue(
        blockId,
        'stale_date',
        `${blockId} contains absolute calendar year(s) ${[...years].join(', ')} while the guide was generated in ${generatedYear}.`,
        'Replace absolute years with relative labels such as "Day 1-30", "Week 2", or "Quarter 1".'
      )
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 5. Anti-goal versus duty conflict
// ---------------------------------------------------------------------------

const MICROMANAGEMENT_ANTI_GOAL =
  /micromanag|микроменеджм|контролировать каждый|control every|individual activity|индивидуальн\w* активност/i;

const PER_PERSON_DAILY_DUTY =
  /(?:daily|every day|ежедневн|каждый день)[^.]{0,80}(?:per (?:rep|report|person|employee)|each (?:rep|report|person|employee)|каждого (?:сотрудника|подчинённого|подчиненного)|на каждого)/i;

const PER_PERSON_DAILY_DUTY_REVERSED =
  /(?:per (?:rep|report|person|employee)|each (?:rep|report|person|employee)|каждого (?:сотрудника|подчинённого|подчиненного)|на каждого)[^.]{0,80}(?:daily|every day|ежедневн|каждый день)/i;

/**
 * Flag a duty that violates a published anti-goal about micromanagement.
 *
 * The reviewed guide committed to "context over control" and against
 * micromanaging individual activity, then required three deal updates before
 * 10:00 and one reviewed call per report per day. Anti-goals live in block 2
 * (group 1) and duties in block 4 (group 2), so nothing in the generation path
 * could see both until the digest existed.
 */
export function validateAntiGoalConflict(
  blocks: BlockMap,
  context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  const antiGoalText = [...(context.publishedAntiGoals ?? []), blocks.block_2?.content ?? ''].join(
    '\n'
  );

  if (!MICROMANAGEMENT_ANTI_GOAL.test(antiGoalText)) return [];

  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content || blockId === 'block_2') continue;

    for (const line of proseLines(content)) {
      if (!PER_PERSON_DAILY_DUTY.test(line) && !PER_PERSON_DAILY_DUTY_REVERSED.test(line)) continue;

      issues.push(
        issue(
          blockId,
          'contradiction',
          `${blockId} requires a per-person daily activity while block 2 declares an anti-goal against micromanaging individual activity: "${truncateLine(line)}".`,
          'Restate the duty so both hold — for example review a sample on a weekly cadence, or make the daily step the team-level signal rather than a per-person check.'
        )
      );
      break;
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Run every contract check. Ordered most-structural first for readable reports. */
export function runCareerPlaybookContractChecks(
  blocks: BlockMap,
  context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  return [
    ...validateMetricLedgerConsistency(blocks, context),
    ...validateUnsourcedStatistics(blocks, context),
    ...validateExampleMarking(blocks, context),
    ...validateRelativeDates(blocks, context),
    ...validateAntiGoalConflict(blocks, context),
    ...validateDecisionAuthorityCoherence(blocks, context),
    ...validateContractLeakage(blocks, context),
    ...validateSourceAttribution(blocks, context),
    ...validateCadenceConsistency(blocks, context),
    ...validateMilestoneConsistency(blocks, context),
    ...validateRampOwnership(blocks, context),
    ...validateCrossViewReference(blocks, context),
    ...validateScriptSplice(blocks, context),
  ];
}

// ---------------------------------------------------------------------------
// 12. A word that changes alphabet in the middle
// ---------------------------------------------------------------------------

/**
 * A letter of one script immediately followed by a letter of the other, inside
 * one word.
 *
 * The hyphen is what makes a Russian technical compound: "CRM-данных",
 * "AI-инструменты", "quarterly-обзора" are ordinary and appear in almost every
 * Russian guide, and none of them trips this — the script changes at a hyphen,
 * not between two letters. "Руковедityel" has no hyphen, and is not a word in
 * either language.
 */
const SCRIPT_SPLICE = /[\p{Script=Cyrillic}][a-zA-Z]|[a-zA-Z][\p{Script=Cyrillic}]/u;

/**
 * Flag a word whose letters are drawn from two alphabets.
 *
 * Five occurrences across the 25 stored playbooks, one per affected document,
 * spanning three months — and not one false positive:
 *
 *   208746e3  block_26  провестиwelcome   a space eaten between two words
 *   7bd743bd  block_2   Руковедityel      Latin spliced into «Руководитель»
 *   a573c83c  block_3   ОКR               Cyrillic О and К wearing OKR's face
 *   370c18c3  block_14  НДA               Cyrillic НД with a Latin A
 *   30996512  block_2   войc              Latin c closing a Cyrillic word
 *
 * Stripping fenced blocks first is not cosmetic. A Mermaid label carries its
 * line break as a literal `\n`, and reading the raw block turns
 * `Директор по\nмаркетингу` into the word `nмаркетингу` — a sixth finding that
 * is nothing but the escape.
 *
 * The judge is a poor detector for this and the corpus says so: it filed a
 * `style` warning about 208746e3 and named three other fragments in that run,
 * never this one, and none of the four older documents was flagged at all. Two
 * of the six are homoglyph splices that look correct on the page — a reader
 * cannot see them, and neither can a model reading the page. What they break is
 * everything that reads the characters: search, copy-paste, a screen reader.
 *
 * Critical rather than a style note, because there is nothing here to weigh: a
 * word that changes alphabet mid-run is wrong, and one occurrence per affected
 * document is a rounding error against the regeneration budget.
 */
export function validateScriptSplice(
  blocks: BlockMap,
  _context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    const spliced = new Set<string>();
    for (const word of stripFencedBlocks(content).match(/[\p{L}]+/gu) ?? []) {
      if (SCRIPT_SPLICE.test(word)) spliced.add(word);
    }
    if (spliced.size === 0) continue;

    issues.push(
      issue(
        blockId,
        'wrong_language',
        `${blockId} contains ${spliced.size === 1 ? 'a word' : 'words'} written in two alphabets at once: ${[...spliced].map(word => `"${word}"`).join(', ')}.`,
        'Rewrite each of these in one alphabet. A Latin letter standing in for its Cyrillic lookalike reads correctly and breaks search, copy-paste and screen readers; a technical compound keeps its hyphen ("CRM-данных").'
      )
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 10. A reference the reader cannot follow
// ---------------------------------------------------------------------------

/** "Block 5", "Блок 5", "блока 5", "Block №5". */
const BLOCK_REFERENCE = /(?<![\p{L}\p{N}])(?:block|блок\p{L}*)\s*№?\s*(\d{1,2})/giu;

/**
 * Flag a block that sends its reader to a block that reader was never given.
 *
 * A view is a separately read document. Measured on the 14 stored playbooks,
 * 71% of the HR view's cross-references pointed at a block outside the HR view,
 * and the two summary blocks every reader gets routinely cited `block_23`, which
 * only a manager holds. That is not model noise: the group prompt told every
 * block to cite Block 5 without saying who holds it.
 *
 * The fix is never "stop citing". Restating an approval level in different words
 * is what produced three contradictory statements about one decision in the
 * 2026-08-11 guide. The digest already carries the authority rows to every
 * target, so a block with no citable target must carry the published wording
 * itself rather than point at a page its reader does not have.
 */
export function validateCrossViewReference(
  blocks: BlockMap,
  _context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    const unreachable = new Set<string>();
    for (const match of stripFencedBlocks(content).matchAll(BLOCK_REFERENCE)) {
      const target = `block_${Number(match[1])}`;
      if (target === blockId) continue;
      if (getCareerPlaybookBlockAudiences(target).length === 0) continue;
      if (careerPlaybookBlockMayCite(blockId, target)) continue;
      unreachable.add(target);
    }
    if (unreachable.size === 0) continue;

    const readers = getCareerPlaybookBlockAudiences(blockId).join(', ');
    const targets = [...unreachable]
      .map(target => `${target} (${getCareerPlaybookBlockAudiences(target).join(', ')})`)
      .join('; ');

    issues.push(
      issue(
        blockId,
        'unreadable_reference',
        `${blockId} is read by ${readers} and points at ${targets}, which at least one of those readers never receives.`,
        'State the referenced content here using the wording already published, or drop the pointer. Do not paraphrase an approval level into different words.'
      )
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 6. Decision-authority coherence (within block 5)
// ---------------------------------------------------------------------------

const IRREVERSIBLE = /\birreversible\b|необратим/i;
/** "Reversible with cost" contains "reversible", so the negative form must be excluded explicitly. */
const REVERSIBLE_WITH_COST = /reversible\s+with\s+cost|обратим\w*\s+с\s+издержк/i;
const WIDE_BLAST_RADIUS = /\b(function|company|customer)\b|функци|компани|клиент/i;
const ACT_ALONE = /\bact\s+alone\b|самостоятельно/i;

/**
 * Flag a decision row that grants act-alone authority over an irreversible
 * decision with a blast radius beyond the team.
 *
 * All four axes come from fixed vocabularies, so this reads unambiguously. The
 * 2026-08-11 guide classified hiring as irreversible with function-level blast
 * radius and then wrote "Act alone ... no approval required" — an internally
 * incoherent row that also contradicted the hiring workflow in block 16.
 */
export function validateDecisionAuthorityCoherence(
  blocks: BlockMap,
  _context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  const content = blocks.block_5?.content;
  if (!content) return [];

  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const line of proseLines(content)) {
    if (!line.startsWith('|') || /^\|?\s*:?-{3,}/.test(line)) continue;
    if (REVERSIBLE_WITH_COST.test(line) || !IRREVERSIBLE.test(line)) continue;
    if (!WIDE_BLAST_RADIUS.test(line) || !ACT_ALONE.test(line)) continue;

    issues.push(
      issue(
        'block_5',
        'contradiction',
        `block_5 grants act-alone authority over an irreversible decision whose blast radius reaches beyond the team: "${truncateLine(line)}".`,
        'Raise the approval level to at least "align" for an irreversible decision with function, company, or customer blast radius, and keep it consistent with the hiring and escalation workflows in Block 16 and the Role Canvas in Block 24.'
      )
    );
  }

  return dedupeIssues(issues);
}

// ---------------------------------------------------------------------------
// 7. Contract leakage into reader-facing text
// ---------------------------------------------------------------------------

const SNAKE_CASE_BLOCK_ID = /\b[Bb]lock_\d{1,2}\b/g;

/**
 * Sentences that address the author of the document rather than its reader.
 *
 * Two shapes, both observed. The first quotes a banned phrasing and tells the
 * writer to avoid it. The second, from the 2026-08-30 run, explains the
 * document's own construction to its reader: "Do not restate these levels in
 * different words anywhere else in this guide" shipped inside a manager's
 * implementation checklist, and two more blocks announced what they had chosen
 * not to repeat. The rule that governs the writing is not information the
 * manager needs.
 *
 * "In other words" is a normal discourse marker and is deliberately not matched;
 * "in different words" is not, and neither is the Russian "другими словами"
 * unless it carries the scope word that makes it a rule about the document.
 */
const AUTHOR_INSTRUCTION = new RegExp(
  [
    'do not use\\s+["“][^"”]{3,60}["”]\\s+language',
    'не используй\\w*\\s+формулировк',
    'always measure\\s+\\w+\\s+quality as',
    // "restate", "reword" and "paraphrase" are always about wording, so the bare
    // prohibition is enough. "redefine" and "repeat" have honest reader-facing
    // uses, so they only count when the sentence is about a part of the document.
    "\\b(?:do not|don't|never|does not|doesn't)\\s+(?:restate|re-state|reword|paraphrase)\\b",
    "\\b(?:this|the)\\s+(?:block|section|guide|checklist|table)\\s+(?:does not|doesn't|must not|should not)\\s+(?:restate|redefine|repeat|reword)\\b",
    'in different words',
    'не\\s+(?:повторяй|переформулируй|переопредел\\w+|дублируй)',
    'этот\\s+блок\\s+не\\s+(?:повтор\\w+|переопредел\\w+|дублир\\w+)',
    'другими\\s+словами\\s+(?:нигде|больше|где-либо)',
  ].join('|'),
  'i'
);

/**
 * An order about what to write, in the imperative.
 *
 * Alone this matches honest advice — "never invent a number when you report
 * upward" is exactly what a red-flag block should say to an employee — so it is
 * never a finding by itself.
 */
const WRITING_IMPERATIVE =
  /\b(?:do not|don't|never)\s+(?:\w+\s+){0,3}(?:invent|include|add|write|put|list|mention|state)\b|не\s+(?:выдумывай|придумывай|добавляй|включай|пиши|указывай)/i;

/**
 * A pointer at a place in this document.
 *
 * This is the half that makes the sentence the author's business: an employee
 * has no "here" to put text in, and no section to decide what belongs to.
 */
const DOCUMENT_DEIXIS =
  /\b(?:here|in this (?:section|block|guide|table|list|checklist)|belongs? in this|this section)\b|этот раздел|в этом разделе|в этом блоке|здесь/i;

/**
 * An instruction to the author written in the imperative and anchored to a place
 * in the document — the shape `AUTHOR_INSTRUCTION` cannot express.
 *
 * Run d50da4b1 (2026-09-02, en) shipped this to a reader in block 17: "Do not
 * invent numeric escalation counts here; if the company later ratifies formal
 * trigger rules, they belong in this section as confirmed values, not as
 * defaults." `validateContractLeakage` returned 0 for that document. The phrase
 * is not in any prompt — the model wrote it in the genre of the `do not invent`
 * family it was trained on by the universal-mode rules.
 *
 * Both halves are required in one line, because the price of a false positive is
 * a critical filed against honest advice. Measured on the stored corpus before
 * shipping: 28 completed playbooks, 1 matching line, in the one document this
 * was found in, and none of the other 27 produce a match.
 */
function isAuthoringDirective(line: string): boolean {
  return WRITING_IMPERATIVE.test(line) && DOCUMENT_DEIXIS.test(line);
}

/**
 * Flag generation-contract instructions that surfaced as reader guidance.
 *
 * The rules added in v2 are about how to write; the 2026-08-11 guide printed one
 * of them to the reader — "Do not use 'accuracy above +/-20%' language — always
 * measure forecast quality as absolute error" — inside an anti-metrics list
 * meant for a sales manager. The 23 `block_5`-style identifiers are the same
 * class: internal vocabulary reaching the page.
 */
export function validateContractLeakage(
  blocks: BlockMap,
  _context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    const identifiers = stripFencedBlocks(content).match(SNAKE_CASE_BLOCK_ID) ?? [];
    if (identifiers.length > 0) {
      issues.push(
        issue(
          blockId,
          'style',
          `${blockId} refers to other sections by internal identifier (${[...new Set(identifiers)].join(', ')}) instead of the reader-facing form.`,
          'Write cross-references as "Block 8". Final assembly normalizes these, so this is a warning rather than a regeneration trigger.',
          'warning'
        )
      );
    }

    for (const line of proseLines(content)) {
      const matched = line.match(AUTHOR_INSTRUCTION);
      if (!matched && !isAuthoringDirective(line)) continue;

      // Name the phrase, not just the line. `truncateLine` cuts at 160
      // characters from the start, and these sentences run long: four of the
      // seven findings on the stored corpus quote a line whose trigger sits
      // past the cut, so the finding reads as a false positive until someone
      // fetches the block and greps it. Verifying two of them cost a
      // measurement cycle on 2026-09-02.
      const evidence = matched ? ` The phrase is "${matched[0]}".` : '';

      issues.push(
        issue(
          blockId,
          'contradiction',
          `${blockId} prints an instruction addressed to the document's author rather than its reader: "${truncateLine(line)}".${evidence}`,
          'Apply the writing rule silently. The reader is an employee doing this job, not the author of this guide.'
        )
      );
      break;
    }
  }

  return dedupeIssues(issues);
}

// ---------------------------------------------------------------------------
// 8. Attribution: a named research house needs a research source
// ---------------------------------------------------------------------------

/** Houses a reader treats as primary research, not as a vendor's own marketing. */
const RESEARCH_HOUSE =
  /\b(gartner|forrester|mckinsey|bain|bcg|boston consulting|deloitte|pwc|kpmg|idc|harvard business review|hbr|statista|nielsen|pew research)\b/i;

/**
 * Words that turn a mention of a house into a claim carried by its authority.
 *
 * "Recommended reading: Harvard Business Review" names a house and asserts
 * nothing; "Gartner predicts that…" borrows its authority. Only the second is
 * an attribution, and only the second is worth a regeneration.
 */
const ATTRIBUTION_VERB =
  /\b(predicts?|predicted|forecasts?|projects?|estimates?|reports?|finds?|found|shows?|suggests?|says?|according to|research|study|studies|survey|analysis|data)\b|прогнозиру|оценива|сообща|исследован|опрос|по данным|отчёт/i;

/**
 * Flag a claim that borrows a named research house's authority without one of
 * its sources behind it.
 *
 * The v3 acceptance output wrote "Gartner's research suggests that 61% of B2B
 * buyers favour a rep-free experience [S9]" — but S9 is a vendor blog post, and
 * the figure appears nowhere in it. The number check caught the missing digits;
 * nothing caught the attribution itself, which is the more damaging half: a
 * reader who trusts "Gartner" is being told a marketing page is analyst research.
 *
 * Run 88fc2368 then showed the other half of the same defect. Its block 9 wrote
 * "Gartner analysts cited in [S11] predict…", the block was regenerated twice,
 * and it shipped the claim anyway — because no source in that run was research,
 * so "cite the Gartner publication directly" asked for something that did not
 * exist. The remedy now depends on what the run actually holds, and a house
 * named with no citation at all is caught too when the run has no research to
 * name it from (mc2-r1qen).
 */
export function validateSourceAttribution(
  blocks: BlockMap,
  context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  if (context.evidenceLedger.length === 0) return [];

  const byId = new Map(context.evidenceLedger.map(entry => [entry.id, entry]));
  const hasResearchSource = context.evidenceLedger.some(entry => entry.source_kind === 'research');
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    for (const line of proseLines(content)) {
      const house = line.match(RESEARCH_HOUSE);
      if (!house) continue;

      const citations = line.match(/\[S\d+\]/g) ?? [];

      if (citations.length === 0) {
        // With research in the run the house may be citable elsewhere, and an
        // unsourced figure is already the unsourced-claim check's business.
        // With none, naming a house is unsupportable however it is phrased.
        if (hasResearchSource || !ATTRIBUTION_VERB.test(line)) continue;

        issues.push(
          issue(
            blockId,
            'unsourced_claim',
            `${blockId} attributes a claim to ${house[0]}, and no source retrieved for this run is research: "${truncateLine(line)}".`,
            `Drop the attribution and state the point without naming a research house. This run retrieved no ${house[0]} publication, so there is nothing to cite.`
          )
        );
        break;
      }

      const cited = citations
        .map(marker => byId.get(marker.slice(1, -1)))
        .filter((entry): entry is CareerPlaybookEvidenceEntry => Boolean(entry));
      if (cited.length === 0) continue;

      // The named house may legitimately appear if a cited source is research, or
      // if the source itself is that house.
      const supported = cited.some(
        entry =>
          entry.source_kind === 'research' ||
          new RegExp(house[0], 'i').test(entry.url) ||
          new RegExp(house[0], 'i').test(entry.title)
      );
      if (supported) continue;

      issues.push(
        issue(
          blockId,
          'unsourced_claim',
          `${blockId} attributes a claim to ${house[0]} while citing ${citations.join(', ')}, which is not that house and is not research: "${truncateLine(line)}".`,
          hasResearchSource
            ? `Cite the ${house[0]} publication directly, or drop the attribution and present the point as what the cited source actually is.`
            : `Drop the attribution and present the point as what ${citations.join(', ')} actually is. This run retrieved no research source, so no research house can be cited here.`
        )
      );
      break;
    }
  }

  return dedupeIssues(issues);
}

// ---------------------------------------------------------------------------
// 9. Cadence consistency across blocks
// ---------------------------------------------------------------------------

/** One vocabulary, shared with the cadence ledger that normalizes onto it. */
const CADENCE_WORDS = CAREER_PLAYBOOK_CADENCE_WORDS;

/**
 * Recurring commitments a reader plans their week around.
 *
 * `requires` disambiguates a phrase that names two different commitments. A 1:1
 * with the CRO and a 1:1 with each report are both "1:1" and legitimately run on
 * different rhythms, so only the report-facing one is compared.
 */
const RECURRING_DUTIES: Array<{ pattern: RegExp; duty: string; requires?: RegExp }> = [
  {
    pattern: /\b1[:\s-]?on[:\s-]?1s?\b|\b1:1s?\b|один на один/i,
    duty: 'one-to-one with reports',
    requires: /\b(rep|reps|direct report|team member|SDR|AE)\b|подчинённ|сотрудник/i,
  },
  { pattern: /pipeline review|обзор воронки/i, duty: 'pipeline review' },
  // A weekly handoff inspection and a monthly collaboration meeting are separate
  // rituals that share the word "handoff"; grouping them invented a conflict.
  { pattern: /handoff (huddle|audit)|аудит передач/i, duty: 'handoff inspection' },
  { pattern: /(handoff|collaboration) sync|синхрон\w* по передач/i, duty: 'handoff sync meeting' },
  {
    pattern: /forecast (call|review|submission)|прогнозн\w* (звонок|обзор)/i,
    duty: 'forecast review',
  },
  { pattern: /retrospective|ретроспектив/i, duty: 'retrospective' },
  {
    pattern: /career (conversation|discussion|check-in)|карьерн\w* (разговор|беседа|диалог)/i,
    duty: 'career conversation',
  },
  {
    pattern: /stay interview|retention interview|stay-интервью|интервью\w* удержани/i,
    duty: 'stay interview',
  },
  {
    pattern: /performance review|перформанс-ревью|оценк\w* результативност|ревью результатов/i,
    duty: 'performance review',
  },
  // The rhythms of managing people, added 2026-08-31 with the spec-builder rule
  // that requires them in the ledger for a role with reports. Both halves land
  // together on purpose: a family the checker knows but the ledger does not
  // carry falls back to consensus, and consensus among invented rhythms is how
  // block_15 and block_17 published a quarterly career conversation that no
  // ledger sanctioned. The guide needs these conversations; what it lacked was
  // an owner for how often they happen.
];

/**
 * The cadence that governs a duty mentioned at `dutyIndex`.
 *
 * A communication-charter row packs several rhythms into one line — "Daily via
 * CRM, dedicated weekly 1-on-1s, weekly pipeline review" — so taking the first
 * cadence word in the line attributed "daily" to the pipeline review. The
 * nearest cadence word wins instead.
 */
/** Closest cadence word to any mention of the duty, within that mention's list item. */
function nearestCadenceAcrossMentions(line: string, pattern: RegExp): string | null {
  const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
  let best: { name: string; distance: number } | null = null;

  for (const mention of line.matchAll(global)) {
    const mentionIndex = mention.index ?? 0;
    const segment = enumerationSegmentAt(line, mentionIndex);
    const found = cadenceNearWithDistance(segment.text, mentionIndex - segment.start);
    if (found && (!best || found.distance < best.distance)) best = found;
  }

  return best?.name ?? null;
}

function cadenceNearWithDistance(
  line: string,
  dutyIndex: number
): { name: string; distance: number } | null {
  let best: { name: string; distance: number } | null = null;

  for (const [pattern, name] of CADENCE_WORDS) {
    const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    for (const match of line.matchAll(global)) {
      const distance = Math.abs((match.index ?? 0) - dutyIndex);
      if (!best || distance < best.distance) best = { name, distance };
    }
  }

  return best;
}

/**
 * The ledger row that governs a duty family, matched by the family's own
 * pattern. Matching on the label rather than on the key means the model may name
 * the row however it likes and the binding still holds.
 */
function findCadenceLedgerEntry(
  duty: (typeof RECURRING_DUTIES)[number],
  cadenceLedger: readonly CareerPlaybookCadenceLedgerEntry[]
): CareerPlaybookCadenceLedgerEntry | null | 'ambiguous' {
  const matches = cadenceLedger.filter(entry => {
    const subject = `${entry.label} ${entry.scope ?? ''}`;
    if (!duty.pattern.test(subject)) return false;
    return duty.requires ? duty.requires.test(subject) : true;
  });

  // Two ledger rows governing one family is not a rhythm this check can decide.
  // Run 4e355bf4 carried both "Performance review" (quarterly, per direct
  // report) and "Team performance review" (weekly, whole team); first-match-wins
  // took the team row and filed a critical against block_26 for writing
  // "quarterly", which the ledger's own row says. A guess here costs a paid
  // regeneration on a correct block, so an ambiguous ledger silences the family
  // rather than falling through to consensus — the ledger is contested, not
  // absent.
  if (matches.length > 1) return 'ambiguous';
  return matches[0] ?? null;
}

interface CadenceObservation {
  blockId: string;
  cadence: string;
}

/**
 * The rhythm the guide actually runs on when no ledger row governs it.
 *
 * Most blocks win, and a tie goes to the block that publishes earliest — the
 * digest hands every later block what earlier ones committed to, so the earliest
 * statement is the one the rest were written against. Majority rather than
 * earliest-outright, because a single early slip should not send four correct
 * blocks back for rewriting.
 */
function selectConsensusCadence(observations: readonly CadenceObservation[]): {
  cadence: string;
  firstBlockId: string;
} {
  const byCadence = new Map<string, CadenceObservation[]>();
  for (const observation of observations) {
    byCadence.set(observation.cadence, [
      ...(byCadence.get(observation.cadence) ?? []),
      observation,
    ]);
  }

  const ranked = [...byCadence.entries()].sort(([, left], [, right]) => {
    if (left.length !== right.length) return right.length - left.length;
    return earliestPosition(left) - earliestPosition(right);
  });

  const [cadence, winners] = ranked[0];
  return {
    cadence,
    firstBlockId: [...winners].sort(
      (left, right) => blockPosition(left.blockId) - blockPosition(right.blockId)
    )[0].blockId,
  };
}

function earliestPosition(observations: readonly CadenceObservation[]): number {
  return Math.min(...observations.map(entry => blockPosition(entry.blockId)));
}

/**
 * Flag every block whose rhythm for a recurring commitment differs from the
 * guide's rhythm for it.
 *
 * Two lessons are built in. The first: the v3 output listed rep 1:1 sessions as
 * monthly in the duties block, weekly in the motivation block and weekly in the
 * FAQ, and no window-sized reviewer saw all three. The second, from 2026-08-30:
 * naming ONE block for a disagreement between eleven made the defect
 * unrepairable, because regenerating that block just moved the conflict to its
 * counterpart, and the loop burned the regeneration cap without converging.
 *
 * So the check now answers "which block is wrong", not merely "these disagree".
 * The cadence ledger decides when it has a row; otherwise the block that
 * publishes the rhythm first holds it and every later deviation is named
 * individually. Either way each issue lands on a block that can fix it alone.
 */
export function validateCadenceConsistency(
  blocks: BlockMap,
  context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  const cadenceLedger = context.cadenceLedger ?? [];
  const observed = new Map<string, CadenceObservation[]>();

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    for (const line of proseLines(content)) {
      for (const { pattern, duty, requires } of RECURRING_DUTIES) {
        if (requires && !requires.test(line)) continue;

        // A line may name the duty twice — "Forecast call pack ... quarterly
        // business review | Weekly forecast call" — so take the cadence that
        // sits closest to any mention, not the one nearest the first.
        const cadence = nearestCadenceAcrossMentions(line, pattern);
        if (!cadence) continue;

        const observations = observed.get(duty) ?? [];
        if (!observations.some(entry => entry.blockId === blockId && entry.cadence === cadence)) {
          observations.push({ blockId, cadence });
        }
        observed.set(duty, observations);
      }
    }
  }

  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const duty of RECURRING_DUTIES) {
    const observations = observed.get(duty.duty);
    if (!observations?.length) continue;

    const ledgerMatch = findCadenceLedgerEntry(duty, cadenceLedger);
    if (ledgerMatch === 'ambiguous') continue;
    const ledgerEntry = ledgerMatch;
    const consensus = selectConsensusCadence(observations);
    const canonical = ledgerEntry?.cadence ?? consensus.cadence;

    const deviatingCadences = new Map<string, string[]>();
    for (const observation of observations) {
      if (observation.cadence === canonical) continue;
      deviatingCadences.set(observation.blockId, [
        ...(deviatingCadences.get(observation.blockId) ?? []),
        observation.cadence,
      ]);
    }
    if (deviatingCadences.size === 0) continue;

    const contested = observations.length > deviatingCadences.size;

    for (const [blockId, cadences] of deviatingCadences) {
      // A block can disagree with itself: run 2896e72f's block_15 stated the
      // career conversation as both quarterly and monthly, so the consensus
      // leader and the deviation were the same block. Citing "the rest of the
      // guide, led by block_15" against block_15 reads as a bug in the checker
      // and tells the regenerator nothing it can act on.
      const selfContradiction = !ledgerEntry && consensus.firstBlockId === blockId;
      const authority = ledgerEntry
        ? 'the cadence ledger, which is the single source of rhythm for this guide'
        : selfContradiction
          ? 'its own earlier statement in this same block'
          : `the rest of the guide, led by ${consensus.firstBlockId}`;

      issues.push(
        issue(
          blockId,
          'contradiction',
          `${blockId} states the ${duty.duty} as ${cadences.join(' and ')}, but this guide runs it ${canonical} per ${authority}.${
            selfContradiction
              ? ' One block giving one commitment two rhythms is unreadable on its own.'
              : contested
                ? ' A reader holding both blocks cannot plan a week against two answers.'
                : ''
          }`,
          selfContradiction
            ? `State the ${duty.duty} as ${canonical} everywhere in ${blockId}; the block currently gives it more than one rhythm.`
            : `Rewrite every ${duty.duty} mention in ${blockId} to ${canonical}. Change nothing in the other blocks: ${canonical} is the published rhythm and this block is the deviation.`
        )
      );
    }
  }

  return issues;
}
