import type { HardcodedPrompt } from './types.js';
import { careerPlaybookBlockRegeneratorPrompt } from './career-playbook-block-regenerator-prompt.js';
import { careerPlaybookGroupPrompts } from './career-playbook-group-prompts.js';
import {
  CAREER_PLAYBOOK_CANONICAL_LAYOUT,
  contentLanguageNameVariable,
  contentLanguageVariable,
  specJsonVariable,
} from './career-playbook-prompt-parts.js';

export const careerPlaybookPrompts: HardcodedPrompt[] = [
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_department_classifier',
    promptName: 'Career Playbook - Department Classifier',
    promptDescription:
      'Classifies ambiguous role titles into a short list of Career Playbook functional areas.',
    promptTemplate: `SYSTEM:
You classify a role title into Career Playbook functional areas.
Return only valid JSON.

Rules:
- Use only values from allowed_departments_json.
- Return 2-5 candidates unless one department is extremely obvious.
- Do not return the full generic list.
- Labels must be written in the UI language.
- Use "other" only when none of the concrete departments fits.

JSON shape:
{
  "candidates": [
    { "value": "sales", "label": "...", "confidence": 0.0, "rationale": "..." }
  ]
}

USER:
Role title: {{title}}
UI language: {{ui_language}}
Allowed departments:
{{allowed_departments_json}}`,
    variables: [
      { name: 'title', description: 'Role title entered by the user', required: true },
      { name: 'ui_language', description: 'UI language for candidate labels', required: true },
      {
        name: 'allowed_departments_json',
        description: 'Allowed department values for the classifier',
        required: true,
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_followup_generator',
    promptName: 'Career Playbook - Follow-up Question Generator',
    promptDescription:
      'Generates adaptive follow-up questions from fixed Career Playbook wizard answers.',
    promptTemplate: `SYSTEM:
You are an HR expert helping create an operational Role Guide.
Generate 3-7 additional questions that collect critical data for a high-quality Role Guide based on Netflix, Amazon, Toyota, Spotify, and Bridgewater practices.

Rules:
- Each question focuses on one concrete aspect.
- If business_context_mode is "company_specific", ask 2-5 targeted questions only for missing or weak business signals.
- If business_context_mode is "universal", ask role-specific benchmark questions and do not invent company-specific product, customer, sales, process, or metric facts.
- Prefer single_choice or multi_choice when sensible options exist.
- Use "ready_to_generate" only when completeness_score is at least 0.75 and no critical gaps remain; otherwise use "ask_more".
- Write every user-facing string in questions[].question_text, questions[].options[].label, and questions[].rationale in {{content_language_name}}.
- Do not write user-facing strings in English unless content_language_name is English. Product names, acronyms, role titles, and technical terms supplied by the user may remain unchanged.
- Keep options[].value as stable machine-readable snake_case identifiers; do not localize options[].value.
- Return only valid JSON matching this shape:
{
  "questions": [
    {
      "question_id": "uuid_v4_string",
      "question_text": "...",
      "question_type": "open" | "single_choice" | "multi_choice",
      "options": [{"value": "...", "label": "..."}] | null,
      "rationale": "..."
    }
  ],
  "completeness_score": 0.0,
  "stop_recommendation": "ask_more" | "ready_to_generate"
}

USER:
Position: {{position}}
Department: {{department}}
Level: {{level}}
Team size: {{team_size}}
Company stage: {{company_stage}}
Reports to / subordinates: {{reporting}}
Content language code: {{content_language}}
Content language name: {{content_language_name}}
Free-form context: {{freeform_text}}
Business context mode: {{business_context_mode}}
Business context digest:
{{business_context_digest}}
Business context source evidence pack:
{{business_context_source_excerpts}}
Business context missing signals:
{{business_context_missing_signals}}
Previous follow-ups answered: {{previous_followups_json}}`,
    variables: [
      { name: 'position', description: 'Position title', required: true },
      { name: 'department', description: 'Department or function', required: true },
      { name: 'level', description: 'Role level', required: true },
      { name: 'team_size', description: 'Company or team size', required: true },
      { name: 'company_stage', description: 'Company stage', required: true },
      { name: 'reporting', description: 'Reporting line and subordinates', required: true },
      contentLanguageVariable,
      contentLanguageNameVariable,
      { name: 'freeform_text', description: 'Optional free-form context', required: true },
      {
        name: 'business_context_mode',
        description: 'Business context mode: company_specific or universal',
        required: true,
      },
      {
        name: 'business_context_digest',
        description: 'Structured business context digest or universal mode warning',
        required: true,
      },
      {
        name: 'business_context_source_excerpts',
        description:
          'Career Playbook source evidence pack from first-party files. Prefer authoritative Docling markdown; summaries are overview only.',
        required: true,
      },
      {
        name: 'business_context_missing_signals',
        description: 'Missing business signals to drive targeted follow-up questions',
        required: true,
      },
      {
        name: 'previous_followups_json',
        description: 'Serialized previous follow-up answers',
        required: true,
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_spec_builder',
    promptName: 'Career Playbook - Spec Builder',
    promptDescription:
      'Builds the RoleProfileSpec contract from Q&A data and web research insights.',
    promptTemplate: `SYSTEM:
Build a RoleProfileSpec JSON object from the user Q&A and web research.
This spec is the contract for generating 26 Role Guide blocks.

The Role Guide has a FIXED 26-block layout. Each block id owns one fixed topic.
Canonical block topics (block id: topic):
${CAREER_PLAYBOOK_CANONICAL_LAYOUT}

Critical requirements:
- Fill block_boundaries for every content block block_1 through block_26.
- block_boundaries[block_id].primary_topics MUST use the canonical topic for that
  exact block id above. You may refine the wording or add role-specific emphasis,
  but you MUST NOT move a topic to a different block id or rename a block's subject
  (e.g. block_11 is always career growth, block_23 is always continuity protocol,
  block_25 is always footer + revision cadence + MegaCampus CTA).
- Route role-specific emphasis into the canonical block that already owns it:
  recurring metrics or forecasting go into block_6 KPI and metrics and block_4
  duties; ownership areas go into block_3 responsibility zones; strategic ties go
  into block_20 business goals. Never invent a new block or repurpose a block id
  for a role emphasis such as forecasting, compliance, or career pathing.
- Extract anti_goals and failure_patterns explicitly.
- Build metric_ledger: exactly one entry per metric in focus_areas.primary_kpis, each with a
  concrete target and green/yellow/red thresholds plus a review period. This ledger becomes the
  single source of numeric truth for all 26 blocks, so the values must be internally coherent —
  a metric may hold only one target across the whole guide.
- Build cadence_ledger: one entry per recurring commitment this role runs — pipeline review, forecast
  review, 1:1s with reports, retrospectives, handoff checks, plus any ritual specific to this role.
  Each entry carries a snake_case key, a reader-facing label, the owner, the scope it applies to
  ("per direct report", "the whole team"), and a cadence written as exactly one of: daily, weekly,
  biweekly, monthly, quarterly, annual. This is the single source of rhythm for all 26 blocks: a
  commitment may hold only one cadence across the whole guide. Leave out any commitment whose rhythm
  does not fit one of those six words — a ledger row that cannot be quoted constrains nothing.
  Ten to fifteen entries is a healthy ledger for an operational role; err toward listing a rhythm the
  guide will need rather than leaving blocks to invent it.
- When context.has_subordinates is true, the cadence ledger MUST also carry the rhythms of managing
  people: the career conversation, the retention (stay) interview, the performance review, and the
  1:1 with each report. A guide for a manager needs all four, so leaving them out does not remove
  them from the document — it only means each block picks its own rhythm, which is how one run
  published a quarterly career conversation and a quarterly stay interview that no ledger sanctioned.
- Build milestone_ledger: one entry per ramp commitment with a due date — the first solo customer
  call, the first forecast submitted, the first full owned cycle, the end of probation. Each entry
  carries a snake_case key, a reader-facing label, the owner, the scope, and an offset written as a
  unit and a number: "day 30", "week 2", "month 1", "quarter 2". This is the single source of "by
  when" for all 26 blocks: a commitment may hold only one due date across the whole guide. Leave out
  anything whose timing cannot be written that way — a deadline that cannot be quoted constrains
  nothing. Five to ten entries is healthy; the onboarding plan and the one-page canvas both restate
  these dates, and without a ledger they restate them differently.
- Set provenance on every metric entry:
  * company_source — supported by the business context digest or source evidence pack
  * user_answer   — stated by the user in the Q&A
  * benchmark     — supported by a web research source
  * assumption    — not supported by anything; the guide will present it as a hypothesis to agree
  Research availability for this run: {{research_availability}}. When research is unavailable, no
  entry may use provenance "benchmark".
- Do NOT populate evidence_ledger or generated_on. The application fills both deterministically
  from the real research result and the system clock; anything you emit in those fields is
  discarded.
- Today is {{generated_on}}. Do not put absolute calendar dates into the spec.
- Keep client business_context separate from web research. Business context is first-party user/company data; web research is external benchmark data.
- If business_context_mode is "universal", do not invent product, customer, sales, process, or metric facts. Build a benchmark Role Guide and mark company-specific details as adaptation points.
- Keep content_language equal to {{content_language}}.
- Return only valid JSON matching the RoleProfileSpec schema.

USER:
Q&A answers:
{{qa_data_json}}

Business context mode:
{{business_context_mode}}

Business context digest:
{{business_context_digest}}

Business context source evidence pack:
{{business_context_source_excerpts}}

Business context missing signals:
{{business_context_missing_signals}}

Web research KPI insights:
{{kpi_insights}}

Web research trends:
{{trends_insights}}

Web research onboarding:
{{onboarding_insights}}

Source URLs:
{{source_urls}}`,
    variables: [
      { name: 'qa_data_json', description: 'Serialized Q&A data', required: true },
      {
        name: 'business_context_mode',
        description: 'Business context mode: company_specific or universal',
        required: true,
      },
      {
        name: 'business_context_digest',
        description: 'Structured first-party business context digest',
        required: true,
      },
      {
        name: 'business_context_source_excerpts',
        description:
          'Career Playbook source evidence pack from first-party files. Prefer authoritative Docling markdown; summaries are overview only.',
        required: true,
      },
      {
        name: 'business_context_missing_signals',
        description: 'Missing first-party business context signals',
        required: true,
      },
      { name: 'kpi_insights', description: 'KPI research insights', required: true },
      { name: 'trends_insights', description: 'Trends research insights', required: true },
      {
        name: 'onboarding_insights',
        description: 'Onboarding research insights',
        required: true,
      },
      { name: 'source_urls', description: 'Research source URLs', required: true },
      {
        name: 'research_availability',
        description: 'Whether external research produced usable sources for this run',
        required: true,
      },
      {
        name: 'generated_on',
        description: 'Generation date (ISO), application-filled',
        required: true,
      },
      contentLanguageVariable,
    ],
  },
  ...careerPlaybookGroupPrompts,
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_cross_block_judge',
    promptName: 'Career Playbook - Cross-block Judge',
    promptDescription:
      'Checks consistency, cross-references, minimum item counts, Mermaid coverage, and regeneration needs across generated Role Guide blocks.',
    promptTemplate: `SYSTEM:
Review generated Career Playbook blocks for consistency against RoleProfileSpec and previous groups.

Assign severity by CATEGORY, not by taste. An issue is "critical" (regeneration-worthy) ONLY when it belongs to one of these categories:
- "contradiction": the block contradicts RoleProfileSpec, OR contradicts another block, or repeats a topic that RoleProfileSpec.block_boundaries assigns to a different block. A repeated topic is critical ONLY when block_audiences_md shows the two blocks share at least one reader — the same material appearing in blocks with no shared reader is correct (the Role Guide's views are read separately) and must never be flagged. A duty that violates a stated anti-goal is a contradiction — for example an anti-goal against micromanaging individual activity next to a duty requiring a per-person daily review.
- "format_minimum": a hard format minimum is missing — anti-goals < 4, decision matrix < 4 rows, failure modes < 3, or a block that must contain a Mermaid diagram has none. The deterministic layer already enforces which blocks require a diagram, so only flag an entirely absent one; never ask for an extra, renamed, or duplicate diagram when the block already has one.
- "wrong_language": user-facing text is not in the target content language.
- "unresolved_placeholder": a raw template placeholder remains — a fill-in label inside square or curly brackets, such as [дата] or {fill}. The example marker "(пример — заменить)" / "(example — replace)" is NOT one, in any of its forms. This contract REQUIRES every unverified company-specific value to carry it, and permits a qualifier naming what to replace ("(example — replace with the company's actual CRM)"). Flagging the marker sends a block that followed the contract to be rewritten into one that breaks it.
- "invented_number": a company-specific number, quota, budget, or deadline is stated as fact with no support from RoleProfileSpec, Q&A, business context, or source evidence. How long a symptom must persist before it counts as a warning sign — "three days running", "two reviews in a row" — is NOT one of these. It qualifies an observation instead of setting a target, no ledger carries such a window, and the red-flag block cannot say when a flag is a flag without one. Flag it only where it is stated as a metric target or contradicts one.
- "metric_conflict": a metric that appears in the metric ledger is stated with a different value or threshold. The ledger wins; the block is wrong.
- "unsourced_claim": a precise external statistic (market, industry, competitor, AI impact) is stated without a [Sn] reference to the evidence ledger, or with a [Sn] that is not in the ledger.
- "stale_date": an absolute calendar year appears outside block 25, or block 25's date is not the generation date.
- "unmarked_example": an unverified company-specific value (salary, bonus, ARR, budget, person name, internal tool) appears without the example marker. This is the only direction the marker rule runs: a missing marker is the defect, a present one never is.

Everything else — tone, "too generic", "not actionable enough", "reads like HR jargon", phrasing, style preferences — is at most "warning" (or "info"), and is NEVER grounds for regeneration. Reason: the deterministic layer already blocks the hard failures reliably, so routing style opinions into regeneration only burns cycles without improving correctness; prefer author freedom over rigid style rules.

Rules:
- Report what you found, not what you checked. The list above defines what counts as critical; it is not a form with one row per category. Most categories will have nothing to report in a given group, and an empty "issues" list is the correct and expected answer for a group that holds together.
- Never file an issue whose own description concludes that the check passed. If the honest description would read "no issue found", "this is not an error", or "they are already marked", then there is no issue and nothing goes in the list.
- Each reported issue carries a "category" field; use "style" for a non-critical stylistic or tone finding.
- Use severity "critical" ONLY for issues in the critical categories above; use "warning" or "info" for everything else.
- List a block id in "needs_regeneration" only when it has a critical issue in one of the critical categories.
- A cadence disagreement is repaired in ONE place: the block that departs from the cadence ledger. Name that block, not the block it disagrees with, and say which rhythm the ledger gives.
- The deterministic layer already scans for metric conflicts, unsourced statistics, absolute dates, and unmarked examples by pattern. Spend your attention on what a pattern cannot see: a claim that contradicts another block in meaning rather than in digits, a duty that undermines a stated anti-goal, a threshold that is internally incoherent.

Return only valid JSON:
{
  "pass": true,
  "score": 100,
  "issues": [
    {
      "block_id": "block_5",
      "severity": "critical" | "warning" | "info",
      "category": "contradiction" | "format_minimum" | "wrong_language" | "unresolved_placeholder" | "invented_number" | "metric_conflict" | "unsourced_claim" | "stale_date" | "unmarked_example" | "style",
      "description": "...",
      "suggestion": "..."
    }
  ],
  "needs_regeneration": ["block_5"]
}

USER:
Group id: {{group_id}}
Today is {{generated_on}}.
RoleProfileSpec:
{{spec_json}}

Block audiences (who reads each block; use this to tell a same-view contradiction from allowed repetition between views):
{{block_audiences_md}}

Metric ledger (single source of numeric truth):
{{metric_ledger_md}}

Cadence ledger (single source of recurring rhythm):
{{cadence_ledger_md}}

Milestone ledger (single source of ramp deadlines):
{{milestone_ledger_md}}

Evidence ledger (the only citable sources):
{{evidence_ledger_md}}

Previous groups output:
{{prev_groups_content}}

Current group output:
{{current_group_content}}`,
    variables: [
      { name: 'group_id', description: 'Current group or block ids under review', required: true },
      specJsonVariable,
      {
        name: 'block_audiences_md',
        description: 'Canonical readers for every block in the Role Guide',
        required: true,
      },
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
        description: 'Citable sources rendered as a [Sn] list',
        required: true,
      },
      {
        name: 'generated_on',
        description: 'Generation date (ISO), application-filled',
        required: true,
      },
      {
        name: 'prev_groups_content',
        description: 'Previously generated group markdown for cross-reference checks',
        required: true,
      },
      {
        name: 'current_group_content',
        description: 'Current generated group markdown under review',
        required: true,
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'career_playbook_final_proofreader',
    promptName: 'Career Playbook - Final Proofreader',
    promptDescription:
      'Reads the fully assembled Role Guide and reports defects a group-sized window cannot see.',
    promptTemplate: `SYSTEM:
You are reading a finished Role Guide end to end, as a demanding editor would before it is handed to
an employee. Every other check in this pipeline sees one group of blocks at a time; you are the only
reader who sees the whole document at once, so report only what that vantage point reveals.

Look for:
- "contradiction": two blocks that disagree in meaning, not merely in digits — an authority granted
  in one block and required to be approved in another, a duty that undermines a stated anti-goal, a
  commitment restated with different conditions far from where it was made.
- "metric_conflict": a value that contradicts the metric ledger below.
- "contradiction" for a broken scale or an unworkable rhythm: a banded payout or rating scale whose
  value jumps between the top of one band and the bottom of the next; a recurring commitment given
  different cadences in different blocks; or a per-report cadence whose total volume exceeds the
  hours the typical-day block allocates at the upper bound of team size. Do the multiplication.
- "contradiction" for leaked instructions: a sentence addressed to the author of this document
  rather than to its reader — for example telling the writer which phrasing to avoid.
- "style" for grammar, agreement, and wording defects.

Do not re-report what a pattern already catches reliably: missing citations, unmarked example
values, absolute calendar dates, and raw placeholders are covered elsewhere. Spend your attention on
meaning.

The section inventory below is extracted from this same document by a pattern, so it lists every
section the document has. Read it before judging any claim about where something lives: a section it
names IS in the document, however far from the reference it sits. Completeness is settled there, not
by searching the body.

Severity: use "critical" only for contradiction and metric_conflict. Grammar and wording are
"style", which never triggers regeneration. Report at most 12 issues, most consequential first, and
return an empty list when the document holds together.

Return only valid JSON:
{
  "pass": true,
  "score": 100,
  "issues": [
    {
      "block_id": "block_5",
      "severity": "critical" | "warning" | "info",
      "category": "contradiction" | "metric_conflict" | "style",
      "description": "...",
      "suggestion": "..."
    }
  ],
  "needs_regeneration": ["block_5"]
}

USER:
Today is {{generated_on}}. Content language: {{content_language}}.

Metric ledger (single source of numeric truth):
{{metric_ledger_md}}

Cadence ledger (single source of recurring rhythm):
{{cadence_ledger_md}}

Milestone ledger (single source of ramp deadlines):
{{milestone_ledger_md}}

Evidence ledger (the only citable sources):
{{evidence_ledger_md}}

Section inventory (every section this document contains, in order):
{{document_outline}}

Assembled Role Guide:
{{full_document}}`,
    variables: [
      { name: 'full_document', description: 'The fully assembled Role Guide', required: true },
      {
        name: 'document_outline',
        description: "The assembled guide's own section headings, numbered in document order",
        required: true,
      },
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
        description: 'Citable sources rendered as a [Sn] list',
        required: true,
      },
      {
        name: 'generated_on',
        description: 'Generation date (ISO), application-filled',
        required: true,
      },
      contentLanguageVariable,
    ],
  },
  careerPlaybookBlockRegeneratorPrompt,
];
