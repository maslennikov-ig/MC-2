/**
 * Career Playbook — prompt fragments shared by more than one prompt
 * @module shared/prompts/career-playbook-prompt-parts
 *
 * Split out when `career-playbook-prompts.ts` crossed the 800-line lint budget,
 * on the same seam that worked for the block catalogue: the pieces every prompt
 * quotes live apart from the prompts that quote them, and adding a rule to the
 * group contract no longer scrolls past six prompt templates.
 */

import { formatCareerPlaybookCanonicalLayoutForPrompt } from './career-playbook-block-topics.js';

export const CAREER_PLAYBOOK_CANONICAL_LAYOUT = formatCareerPlaybookCanonicalLayoutForPrompt();

export const specJsonVariable = {
  name: 'spec_json',
  description: 'Serialized RoleProfileSpec JSON',
  required: true,
};

export const contentLanguageVariable = {
  name: 'content_language',
  description: 'Target content language code',
  required: true,
};

export const contentLanguageNameVariable = {
  name: 'content_language_name',
  description: 'Target content language full English name for prompt clarity',
  required: true,
};

export const groupHeadingVariables = [
  { name: 'heading_header', description: 'Localized Header heading', required: true },
  { name: 'heading_block_1', description: 'Localized Block 1 heading', required: true },
  { name: 'heading_block_2', description: 'Localized Block 2 heading', required: true },
  { name: 'heading_block_3', description: 'Localized Block 3 heading', required: true },
  { name: 'heading_block_4', description: 'Localized Block 4 heading', required: true },
  { name: 'heading_block_5', description: 'Localized Block 5 heading', required: true },
  { name: 'heading_block_6', description: 'Localized Block 6 heading', required: true },
  { name: 'heading_block_7', description: 'Localized Block 7 heading', required: true },
  { name: 'heading_block_8', description: 'Localized Block 8 heading', required: true },
  { name: 'heading_block_9', description: 'Localized Block 9 heading', required: true },
  { name: 'heading_block_10', description: 'Localized Block 10 heading', required: true },
  { name: 'heading_block_11', description: 'Localized Block 11 heading', required: true },
  { name: 'heading_block_12', description: 'Localized Block 12 heading', required: true },
  { name: 'heading_block_13', description: 'Localized Block 13 heading', required: true },
  { name: 'heading_block_14', description: 'Localized Block 14 heading', required: true },
  { name: 'heading_block_15', description: 'Localized Block 15 heading', required: true },
  { name: 'heading_block_16', description: 'Localized Block 16 heading', required: true },
  { name: 'heading_block_17', description: 'Localized Block 17 heading', required: true },
  { name: 'heading_block_18', description: 'Localized Block 18 heading', required: true },
  { name: 'heading_block_19', description: 'Localized Block 19 heading', required: true },
  { name: 'heading_block_20', description: 'Localized Block 20 heading', required: true },
  { name: 'heading_block_21', description: 'Localized Block 21 heading', required: true },
  { name: 'heading_block_22', description: 'Localized Block 22 heading', required: true },
  { name: 'heading_block_23', description: 'Localized Block 23 heading', required: true },
  { name: 'heading_block_24', description: 'Localized Block 24 heading', required: true },
  { name: 'heading_block_25', description: 'Localized Block 25 heading', required: true },
  { name: 'heading_block_26', description: 'Localized Block 26 heading', required: true },
];

export function groupHeadingVariable(name: string) {
  const variable = groupHeadingVariables.find(item => item.name === name);
  if (!variable) {
    throw new Error(`Unknown Career Playbook heading variable: ${name}`);
  }

  return variable;
}

/**
 * Contract variables shared by every group prompt. Declared once so a rule can
 * never drift between the six groups — the previous per-prompt copies are how
 * the "invented example" instruction ended up in all six while the citation
 * requirement made it into none.
 */
export const groupContractVariables = [
  {
    name: 'metric_ledger_md',
    description: 'Canonical metric ledger rendered as a markdown table',
    required: true,
  },
  {
    name: 'cadence_ledger_md',
    description: 'Canonical recurring rhythms rendered as a markdown table',
    required: true,
  },
  {
    name: 'milestone_ledger_md',
    description: 'Canonical ramp deadlines rendered as a markdown table',
    required: true,
  },
  {
    name: 'evidence_ledger_md',
    description: 'Citable sources rendered as a [Sn] list, or an explicit "none" notice',
    required: true,
  },
  {
    name: 'generated_on',
    description: 'Generation date (ISO), application-filled',
    required: true,
  },
  {
    name: 'prior_blocks_digest',
    description: 'Per-output-block anti-goals, commitments and cadences already published',
    required: true,
  },
  {
    name: 'block_audiences_md',
    description: 'Canonical readers for every block generated by this prompt',
    required: true,
  },
  {
    name: 'citable_blocks_md',
    description: 'Per output block, the blocks every one of its readers also receives',
    required: true,
  },
];

/**
 * The output contract every group shares.
 *
 * Each rule here answers a measured defect from the 2026-08-11 review rather
 * than a style preference: conflicting thresholds across blocks, precise market
 * statistics with no source, invented company values presented as truth, a
 * Gantt chart pinned to 2025 in a document generated in 2026, and duties that
 * contradicted the guide's own anti-goals.
 */
export const GROUP_OUTPUT_CONTRACT = `Output rules:
- Markdown only, no HTML.
- Write all prose in {{content_language}}.
- For Russian output, translate user-facing framework labels and table labels; do not output raw English phrases such as "Decision Authority", "Definition of Done", "Traffic-light actions", "Role Canvas", "Implementation checklist", "Red Flags", or "Hit by a Bus". Common KPI acronyms from user context may remain unchanged.
- RoleProfileSpec.block_boundaries is an ownership map, not a repetition budget: write everything your own subject genuinely needs, in full.
- When a topic under your block's do_not_repeat belongs to another block, do not re-derive or re-explain that model — name it, point to the block that owns it, and move on.

NUMBERS — the metric ledger is the only source of numeric truth:
- Reproduce every value and traffic-light threshold from the metric ledger VERBATIM, including its review period.
- Never state a different number for a metric that appears in the ledger, in any block, table, or checklist.
- A metric that is not in the ledger is described qualitatively, without a precise target.

RHYTHMS — the cadence ledger is the only source of recurring rhythm:
- Reproduce the cadence of every commitment in the cadence ledger VERBATIM.
- Never give a ledger commitment a different rhythm, in any block, table, or checklist. A pipeline review that is weekly in one block and quarterly in another leaves the reader unable to plan a week.
- A recurring commitment absent from the ledger still holds ONE rhythm across the whole guide: use the rhythm the digest already published for it. When the digest publishes none, the rhythm you choose here becomes the guide's answer, so choose it once and keep it.

DEADLINES — the milestone ledger is the only source of "by when":
- Reproduce the due date of every ramp commitment in the milestone ledger VERBATIM, in the guide's own language ("Неделя 2", "Week 2").
- Never give a ledger commitment a different deadline, in any block, table, checklist or summary. A first forecast due in week 2 in the onboarding plan and in week 4 on the one-page canvas is one promise with two answers, and the reader meets both on their first day.
- A summary block restates these dates rather than setting them: when you summarise a commitment the ledger governs, carry its date across unchanged.
- A ramp commitment absent from the ledger still holds ONE deadline across the whole guide: use the one the digest already published for it.

EXTERNAL CLAIMS — no precise statistic without a source:
- A precise statistic about the market, the industry, competitors, or AI impact is allowed ONLY with a [Sn] reference to an entry in the evidence ledger below.
- If the evidence ledger has no entry supporting the claim, rewrite it without the number, as an explicit hypothesis to validate.
- Never write "research shows", "studies indicate", or a dated study reference unless it carries a [Sn] reference.
- Never attribute a claim to a named research house (Gartner, Forrester, McKinsey, IDC, HBR, Statista) unless the cited entry IS that house. The evidence ledger marks each source as research, vendor, or media: a vendor blog quoting an analyst is still a vendor blog, and presenting it as analyst research misleads the reader.
- Disclosing the chain does not lift that rule. "Gartner analysts cited in [S11]" still sends the reader to a vendor page
  for an analyst prediction. When the ledger holds no entry from the house, drop the house name and state the claim as
  what it is — an industry direction the retrieved sources describe — or, if the figure is the point, say plainly that it
  reaches this guide through a vendor source rather than the primary research and is directional, not verified.

EXAMPLES — mark every unverified company-specific value:
- A company-specific value that is not backed by the business context or the user's answers (salary, bonus, ARR, budget, headcount cost, a person's name, an internal tool name) stays concrete, but MUST carry the marker "(пример — заменить)" in Russian or "(example — replace)" in English, immediately after the value in the same sentence or table cell.
- Do not leave raw template placeholders in square or curly brackets (for example [Name] or {value}). Reserve an explicit "field to fill" label for a genuine blank template field the reader completes later, such as an onboarding form or a backup-contact table.

DATES — today is {{generated_on}}:
- Plans, schedules, ramp charts, and Gantt-style tables use relative labels only: "Day 1-30", "Week 2", "Month 3", "Quarter 1".
- Never write an absolute calendar year in a plan, a training record, or a milestone.

CONSISTENCY — do not contradict what is already published:
- The digest below is split into subsections, each headed by the output blocks it applies to.
- When writing block_N, use the subsection whose heading names block_N or covers every output block in this group; ignore any other subsection even though it is visible in the prompt.
- Each subsection lists anti-goals, decision authority, numeric commitments, cadences, and career steps from every earlier block, regardless of reader: these are consistency constraints on the single assembled document, not readership-scoped guidance.
- Never contradict them. If a duty you are about to write would violate a published anti-goal, restate the duty so both hold — for example, review a sample on a cadence rather than every person every day.
- A career step the digest already publishes keeps the title it was given: name one of the published steps, or none at all. A second title for the same step gives the reader two ladders and no way to tell which one they are on.

REFERENCES — a reader must be able to follow every pointer you write:
- Each block is delivered inside a reader-specific guide that contains only the blocks that reader needs. A pointer to a block outside that guide sends the reader to a page they do not have.
- The list below states, for each block you are writing, exactly which other blocks it may name. Name no other block, in any wording — not "Block 12", not "the candidate profile section", not "as described elsewhere in this guide".
- When the content you need lives in a block you may not name, carry across only the part this block actually needs — one threshold, one approval level, one named owner — never the whole section.
- Write that part for THIS block's readers, addressing them the way this block addresses them. What may change is the framing; what may not is the substance. Every number, threshold, approval level, cadence and named party stays exactly as the digest publishes it.
- If the part you would need is something this block's readers should not be handed, leave it out entirely. Saying nothing is always available; a pointer they cannot follow is not.

{{citable_blocks_md}}

AUTHORITY — Block 5 is the single source of decision authority:
- Block 5 is to authority what the metric ledger is to numbers. If you mention a decision that appears in the digest and Block 5 is in your own list above, reference Block 5 and let it carry the approval level.
- If Block 5 is not in that list, quote the approval level exactly as the digest gives it, without naming Block 5.
- An irreversible decision whose blast radius reaches function, company, or customer can never be "act alone".

SCALES AND WORKLOAD:
- A banded payout or rating scale must be continuous: the value at the top of one band and the bottom of the next may not jump.
- A cadence promised in the duties block must fit the slots the typical-day block allocates, at the UPPER bound of the stated number of reports. Count it before you write it: a per-report weekly commitment multiplies by the number of reports.

THESE RULES GOVERN HOW YOU WRITE, NOT WHAT YOU WRITE ABOUT:
- The output is a finished document section, written as if these instructions had never existed. Apply every rule above silently and let the result speak.
- Before each sentence ships, ask who it is for. A sentence about how this guide was assembled — which wording was avoided, what this block chose not to repeat, where a definition is kept instead — is for the author, and the reader has no use for it. Delete it; do not soften it.
- Write each block for the readers listed for that block; do not assume every block addresses the employee.
- Address the readers this block actually has. A block read by the manager speaks to the manager about the role; a block read by HR speaks to HR about the role. A block with more than one reader names each where their part differs, rather than flattening into a voice that fits nobody.
- Refer to other sections as "Block 8", never as "block_8".`;

/** The USER section every group prompt shares. */
export const GROUP_USER_SECTION = `USER:
RoleProfileSpec:
{{spec_json}}

Metric ledger (single source of numeric truth):
{{metric_ledger_md}}

Cadence ledger (single source of recurring rhythm):
{{cadence_ledger_md}}

Milestone ledger (single source of ramp deadlines):
{{milestone_ledger_md}}

Evidence ledger (the only citable sources):
{{evidence_ledger_md}}

Block audiences (write directly to every listed reader for that block):
{{block_audiences_md}}

Already published content (use only the subsection matching the output block):
{{prior_blocks_digest}}`;
