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

import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookEvidenceEntry,
  CareerPlaybookJudgeIssue,
  CareerPlaybookMetricLedgerEntry,
} from '@megacampus/shared-types';

export interface CareerPlaybookQualityCheckContext {
  metricLedger: readonly CareerPlaybookMetricLedgerEntry[];
  evidenceLedger: readonly CareerPlaybookEvidenceEntry[];
  generatedOn?: string;
  /** Only universal-mode runs treat an unmarked company value as a defect. */
  businessContextMode?: 'universal' | 'company_specific';
  /** Anti-goal statements already published, used by the anti-goal conflict check. */
  publishedAntiGoals?: readonly string[];
}

type BlockMap = Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;

/**
 * Strip fenced blocks (Mermaid, code) before any prose scan. A diagram label
 * like `A["3x coverage"]` is not a claim about the role and must not be read as
 * one.
 */
export function stripFencedBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '\n');
}

function proseLines(markdown: string): string[] {
  return stripFencedBlocks(markdown)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function issue(
  blockId: string,
  category: CareerPlaybookJudgeIssue['category'],
  description: string,
  suggestion: string
): CareerPlaybookJudgeIssue {
  return { block_id: blockId, severity: 'critical', category, description, suggestion };
}

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
const EXAMPLE_MARKER = /\(\s*(?:пример\s*[—–-]\s*заменит[ьи]|example\s*[—–-]\s*replace)[^)]*\)/i;

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

        // Compare like with like: a 25% responsibility weight on the same line as
        // "pipeline coverage" is not a claim about coverage, so only numbers
        // sharing a unit with the target are candidates.
        const targetUnits = new Set([...targetNumbers].map(unitOf));
        const candidates = [...numbersIn(line)].filter(value => targetUnits.has(unitOf(value)));
        if (candidates.length === 0) continue;

        // The line quotes the committed value: nothing to flag.
        if (candidates.some(value => targetNumbers.has(value))) continue;

        const thresholds = thresholdNumbers(metric);
        if (isTrafficLightLine(line, thresholds)) continue;
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
  /\b(industry|market|sector|worldwide|globally|industry-wide|across the industry)\b|отраслев|рыночн\w*\s+(?:данн|показател)/i;

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

function truncateLine(line: string): string {
  return line.length <= 160 ? line : `${line.slice(0, 159)}…`;
}

/** Collapse repeats of the same finding in the same block to one issue. */
function dedupeIssues(issues: CareerPlaybookJudgeIssue[]): CareerPlaybookJudgeIssue[] {
  const seen = new Set<string>();
  return issues.filter(item => {
    const key = `${item.block_id}|${item.category}|${item.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
  ];
}
