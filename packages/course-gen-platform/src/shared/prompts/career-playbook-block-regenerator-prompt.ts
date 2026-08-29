import type { HardcodedPrompt } from './types.js';

export const careerPlaybookBlockRegeneratorPrompt: HardcodedPrompt = {
  stage: 'stage_6',
  promptKey: 'career_playbook_block_regenerator',
  promptName: 'Career Playbook - Block Regenerator',
  promptDescription:
    'Regenerates a single Career Playbook block from judge feedback and optional user instructions.',
  promptTemplate: `SYSTEM:
Regenerate exactly one Career Playbook block: {{block_id}} ({{block_name}}).
Regenerate a finished section for all and only the readers listed in Target block readers.
Preserve the block format contract and fix the judge issue without repeating the other blocks listed below.
Repetition across audience views that share no reader is allowed and irrelevant; those blocks are intentionally absent from the summary.
- If the block already contains a Mermaid diagram, improve that existing diagram instead of appending a new one; add a diagram only when the block has none and its contract requires one.
- In every Mermaid diagram, wrap each node label in double quotes (for example A["Team Lead (Block 9)"]); never leave raw parentheses or a line break inside an unquoted label.
- For an illustrative name or value in narrative prose, use a realistic invented example and mark it as an example; do not leave raw bracket placeholders like [Name] or {value}, and never rewrite a narrative name into a "field to fill" phrase inside a sentence. Reserve "field to fill" wording for genuine blank template fields the reader completes later.

Original block content:
{{original_content}}

Issue from judge:
{{issue_description}}

Suggestion:
{{suggestion}}

User edit instruction:
{{user_instruction}}

Return only markdown for this one block.

- Numbers: reproduce every value from the metric ledger VERBATIM. If the issue is a metric conflict,
  align the block to the ledger — never invent a third value to split the difference.
- External statistics: allowed only with a [Sn] reference to the evidence ledger. Without a matching
  entry, rewrite without the precise number.
- Unverified company-specific values (salary, bonus, ARR, budget, person name, internal tool) keep
  the marker "(пример — заменить)" in Russian or "(example — replace)" in English.
- Today is {{generated_on}}. Use relative labels ("Day 1-30", "Week 2") in plans; an absolute
  calendar year is allowed only in block 25.

USER:
RoleProfileSpec:
{{spec_json}}

Metric ledger (single source of numeric truth):
{{metric_ledger_md}}

Evidence ledger (the only citable sources):
{{evidence_ledger_md}}

Target block readers:
{{block_audiences_md}}

Other blocks in the same audience view(s):
{{other_blocks_brief}}

Content language: {{content_language}}`,
  variables: [
    { name: 'block_id', description: 'Target block id', required: true },
    { name: 'block_name', description: 'Human-readable block name', required: true },
    { name: 'original_content', description: 'Original block markdown', required: true },
    { name: 'issue_description', description: 'Judge issue description', required: true },
    { name: 'suggestion', description: 'Judge suggestion or none', required: true },
    {
      name: 'user_instruction',
      description: 'Optional user instruction or none',
      required: true,
    },
    { name: 'spec_json', description: 'Serialized RoleProfileSpec JSON', required: true },
    {
      name: 'metric_ledger_md',
      description: 'Canonical metric ledger rendered as a markdown table',
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
      name: 'block_audiences_md',
      description: 'Canonical readers for the target block',
      required: true,
    },
    {
      name: 'other_blocks_brief',
      description: 'Compact summary of generated blocks sharing a target reader',
      required: true,
    },
    {
      name: 'content_language',
      description: 'Target content language code',
      required: true,
    },
  ],
};
