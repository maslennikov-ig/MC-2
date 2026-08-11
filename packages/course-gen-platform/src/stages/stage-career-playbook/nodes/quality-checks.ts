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
  suggestion: string,
  severity: CareerPlaybookJudgeIssue['severity'] = 'critical'
): CareerPlaybookJudgeIssue {
  return { block_id: blockId, severity, category, description, suggestion };
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
// The verb may follow the value: "(example: $100K — replace with your threshold)".
const EXAMPLE_MARKER = /\(\s*(?:пример|example)\b[^)]*(?:заменит[ьи]|replace)[^)]*\)/i;

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

        // Compare like with like: a 25% responsibility weight beside "pipeline
        // coverage" is not a claim about coverage, so only numbers sharing a
        // unit with the target are candidates.
        const targetUnits = new Set([...targetNumbers].map(unitOf));
        const candidates = [...numbersIn(line)].filter(value => targetUnits.has(unitOf(value)));
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
        if (candidates.every(value => citesBand(line, value, bands))) continue;
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
    ...validateDecisionAuthorityCoherence(blocks, context),
    ...validateContractLeakage(blocks, context),
    ...validateSourceAttribution(blocks, context),
    ...validateCadenceConsistency(blocks, context),
  ];
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
 * The observed shape quotes a banned phrasing and tells the writer to avoid it.
 */
const AUTHOR_INSTRUCTION =
  /do not use\s+["“][^"”]{3,60}["”]\s+language|не используй\w*\s+формулировк|always measure\s+\w+\s+quality as/i;

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
      if (!AUTHOR_INSTRUCTION.test(line)) continue;

      issues.push(
        issue(
          blockId,
          'contradiction',
          `${blockId} prints an instruction addressed to the document's author rather than its reader: "${truncateLine(line)}".`,
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
 * Flag a claim attributed to a named research house while citing something else.
 *
 * The v3 acceptance output wrote "Gartner's research suggests that 61% of B2B
 * buyers favour a rep-free experience [S9]" — but S9 is a vendor blog post, and
 * the figure appears nowhere in it. The number check caught the missing digits;
 * nothing caught the attribution itself, which is the more damaging half: a
 * reader who trusts "Gartner" is being told a marketing page is analyst research.
 */
export function validateSourceAttribution(
  blocks: BlockMap,
  context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  if (context.evidenceLedger.length === 0) return [];

  const byId = new Map(context.evidenceLedger.map(entry => [entry.id, entry]));
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    for (const line of proseLines(content)) {
      const house = line.match(RESEARCH_HOUSE);
      if (!house) continue;

      const citations = line.match(/\[S\d+\]/g) ?? [];
      // An unsourced house attribution is already caught as an unsourced claim
      // when it carries a figure; here we only judge what it cites.
      if (citations.length === 0) continue;

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
          `Cite the ${house[0]} publication directly, or drop the attribution and present the point as what the cited source actually is.`
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

const CADENCE_WORDS: Array<[RegExp, string]> = [
  [/\b(daily|every day)\b|ежедневн|каждый день/i, 'daily'],
  [/\bweekly\b|еженедельн|каждую неделю/i, 'weekly'],
  [/\b(biweekly|fortnightly|every two weeks)\b|раз в две недели/i, 'biweekly'],
  [/\bmonthly\b|ежемесячн|раз в месяц/i, 'monthly'],
  [/\bquarterly\b|ежекварт|раз в квартал/i, 'quarterly'],
  [/\bannual(ly)?\b|ежегодн|раз в год/i, 'annual'],
];

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
];

/**
 * The cadence that governs a duty mentioned at `dutyIndex`.
 *
 * A communication-charter row packs several rhythms into one line — "Daily via
 * CRM, dedicated weekly 1-on-1s, weekly pipeline review" — so taking the first
 * cadence word in the line attributed "daily" to the pipeline review. The
 * nearest cadence word wins instead.
 */
function cadenceNear(line: string, dutyIndex: number): string | null {
  let best: { name: string; distance: number } | null = null;

  for (const [pattern, name] of CADENCE_WORDS) {
    const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    for (const match of line.matchAll(global)) {
      const distance = Math.abs((match.index ?? 0) - dutyIndex);
      if (!best || distance < best.distance) best = { name, distance };
    }
  }

  return best?.name ?? null;
}

/**
 * Flag a recurring commitment stated with different cadences in different blocks.
 *
 * The v3 output listed rep 1:1 development sessions as monthly in the duties
 * block, then described "weekly 1:1s with each direct report" in the motivation
 * block and "two coaching 1:1s per rep" weekly in the FAQ. A reader cannot plan
 * a week against three answers, and no window-sized reviewer sees all three.
 */
export function validateCadenceConsistency(
  blocks: BlockMap,
  _context: CareerPlaybookQualityCheckContext
): CareerPlaybookJudgeIssue[] {
  const stated = new Map<string, Map<string, string[]>>();

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    for (const line of proseLines(content)) {
      for (const { pattern, duty, requires } of RECURRING_DUTIES) {
        const mention = line.match(pattern);
        if (!mention) continue;
        if (requires && !requires.test(line)) continue;

        const cadence = cadenceNear(line, mention.index ?? 0);
        if (!cadence) continue;

        const byCadence = stated.get(duty) ?? new Map<string, string[]>();
        const blockIds = byCadence.get(cadence) ?? [];
        if (!blockIds.includes(blockId)) blockIds.push(blockId);
        byCadence.set(cadence, blockIds);
        stated.set(duty, byCadence);
      }
    }
  }

  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [duty, byCadence] of stated) {
    if (byCadence.size < 2) continue;

    const summary = [...byCadence.entries()]
      .map(([cadence, blockIds]) => `${cadence} (${blockIds.join(', ')})`)
      .join(' vs ');
    // Report against the block that mentions it last: the earlier statement is
    // the published commitment, the later one is the deviation.
    const lastBlock = [...byCadence.values()].flat().sort().at(-1) ?? 'block_4';

    issues.push(
      issue(
        lastBlock,
        'contradiction',
        `The ${duty} cadence is stated inconsistently across blocks: ${summary}.`,
        `Pick one cadence for the ${duty} and have every other block reference it rather than restate it.`
      )
    );
  }

  return issues;
}
