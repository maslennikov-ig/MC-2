# Orchestrator Handoff

Updated: 2026-08-31. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and stage summaries. Durable traps
live in `.codex/repository-failure-modes.md`; this file says what still binds work.

## Current stage

Accepted stage id: `mc2-1786710715922-25-db11a6c5`

Role Guide audience views and measurable repetition are accepted on `develop` at `bf7de071f`, and the
stage also closes `mc2-1786710716114-26-01631777`. Canonical employee/manager/HR views contain
20/20/14 stored blocks and cover all 27 ids; persisted `final_markdown` remains full. Canonical
`do_not_repeat` and the final-only 0.85 semantic gate are audience-scoped and fail closed on provider
error. The prior-blocks digest is **not** audience-scoped and is now one section per group. Against
the 14-playbook baseline, too-close rates fell from 8/6,594 to 0/471 and from 18/6,829 to 0/375; the
accepted dev row cost $0.073384245 over 34 records. Full evidence:
`.codex/stages/mc2-1786710715922-25-db11a6c5/summary.md` and
`docs/career-playbook/2026-08-29-role-guide-audience-acceptance.md`.

Three follow-ups closed on `develop` at `070b19865`, CI green with Deploy to Dev green on its own
conclusion. `mc2-spkoj`: the acceptance measurer's `--mode evaluation` now reads the production
catalogue, thresholds and paragraph splitter, so an owner checkbox reaches the script that grades a
live playbook; baseline stays frozen. `mc2-akmx2`: the Jina 429 wait is a budget per
`generateEmbeddings` call (300 s, one maximal Retry-After) instead of per batch, cutting the semantic
gate's worst-case lock hold from ~4,500 s to 300 s. `mc2-4win5`, `mc2-539pz`, `mc2-u3t9n`: the
prior-blocks digest now spends its ceiling once per group instead of once per target, its cadence
regex matches Russian at all (`\b` is an ASCII boundary; the section had been empty in every RU
playbook), and a numeric commitment needs a comparator, a unit, a currency or a scale rather than
just a digit somewhere on the line (33% of all lines → 14%). With the collector honest the ceiling
was measured, not guessed: **3,500 tokens**, the smallest value at which numeric commitments reach
97% in every group, about +3,000 input tokens per playbook. `group_6_wrap` end to end: anti-goals
64% → 100%, authority 3% → 100%, numbers 0% → 97%, cadences 0% → 56%.

`mc2-c0pdn`: **a block may only point at a block its reader was given** — subset of audiences, not
intersection, so `block_26` (manager+hr) may not cite `block_5` (employee+manager). A new
`citable_blocks_md` prompt variable names the permitted targets per output block, the AUTHORITY rule
is conditional on it, and `validateCrossViewReference` enforces it under a new
`unreadable_reference` critical category. The regenerator gets the same list, or it would spend both
attempts reproducing the defect. Before the change the HR view broke 72% of its cross-references and
every playbook in the sample was affected.

Two paid dev runs since then, both `Sales Manager B2B` / en, same wizard answers, so they are a
clean A/B: baseline `d5137bc5` on the citation rule alone, and `638ed691` on `cf328ba25` with the
five fixes below. Deploy verified on the container, not on CI: `megacampus-api-dev` and
`megacampus-worker-dev` both report `org.opencontainers.image.revision cf328ba251b8...`.

| Measure                            | `d5137bc5` | `638ed691`                  |
| ---------------------------------- | ---------- | --------------------------- |
| judge criticals (deduped)          | 25         | **9**                       |
| `unresolved_placeholder` criticals | 8          | **0**                       |
| rule-leak sentences in reader text | 5          | **0**                       |
| block regenerations                | 30         | 25                          |
| unreachable block references       | 15         | 28 → **1 after `3b81ac19`** |
| wall clock                         | 24m09s     | ~20m                        |
| cost                               | $0.104331  | $0.107929                   |

What each fix answered:

- **`mc2-b7rz8` — rhythms had no owner.** `cadence_ledger` joins the metric and evidence ledgers:
  model-built, normalized in `quality-ledger.ts` onto the six-word vocabulary `quality-checks.ts`
  reads, quoted verbatim by every block. The run built **15 entries**.
  `validateCadenceConsistency` now answers _which block is wrong_ — ledger first, else the guide's
  majority with the earliest block breaking a tie — and names each deviating block separately, so
  what used to be an unrepairable eleven-block disagreement is one regeneration per block. Its
  previous implementation sorted block ids as strings, which made `block_4` later than `block_15`
  and sent the block that was right to be rewritten.
- **`mc2-wtgsd` — the premise in the tracker was wrong and is corrected there.** No prose
  placeholder was hiding from the bracket detector. All eight `unresolved_placeholder` criticals
  attacked the example marker the contract _requires_, and satisfying any of them would have turned
  a correct block into an `unmarked_example` defect. Filter first:
  `downgradeUnconfirmedPlaceholderIssues` demotes any placeholder critical
  `findUnresolvedFillablePlaceholders` cannot confirm in the block's own text. **8 → 0.**
- **`mc2-qgg2e` — the prompt explained a rule through its consequence and the model published the
  explanation.** Rationale removed, a per-sentence test given instead, `AUTHOR_INSTRUCTION` widened
  to the "this block does not restate…" shape. **5 → 0**, no false positive on "in other words" or
  "другими словами".
- **`mc2-1mr7r` — `Every issue MUST include a "category" field` read as one issue per category.**
  Three of the run's 25 criticals said in their own description that the check had passed. The
  prompt now states that an empty issues list is the right answer for a clean group.
- **`mc2-1q7q9` — our own code wrote the unfollowable pointers.** 27 of run `638ed691`'s 28
  unreachable references came out of `appendCareerPlaybookCalibrationTable`, which is
  application-built, appended into block 26 (manager+hr), scans every block, and labelled each row
  "Block 8"/"Block 11"/"Block 23". No prompt and no regeneration could remove them — block 26 was
  rewritten twice and the table was re-appended each time. Rows are now named by section title read
  from the block's own heading. Replayed against the stored blocks of that run: **27 → 0**, leaving
  one unreachable reference in the whole document (`block_13 -> block_2`).
- **`mc2-xklll` — also a wrong premise, corrected in the tracker.** Career Playbook has used flex
  since `4e0ab3486` (2026-08-25); `GET /api/v1/generation` confirms all 11 luna calls of `d5137bc5`
  were served by `openai/flex`. Only luna publishes a flex endpoint — `deepseek-v4-flash` and
  `glm-5.3-flash` have none and are already cheaper. The real gap was evidence: no cost row named a
  tier, and that absence read as "flex is off". `settleCareerPlaybookNodeCosts` now keeps
  `service_tier` from the receipt it was already fetching; run `638ed691` shows 12 rows as `flex`.

Writing the calibration-table test surfaced a defect neither run would have shown: both copies of
the example-marker regex used `\b(?:пример|example)\b`, and `\b` is ASCII-only without the `u`
flag, so **no Russian playbook's markers were ever visible** to the marking check or the calibration
table. One shared source now serves both.

A **third arm**, `88fc2368` (2026-08-31), ran the same role, language and wizard answers against
`64ae37652` — verified on the containers, not on CI. It validates the 028 prompt batch and is the
run `mc2-9d2ji` and `mc2-923ku` were waiting for; both are closed. Criticals 25 → 9 → **7**,
regenerations 30 → 25 → **19**, wall clock 24m09s → 20m26s → **12m57s**, cost $0.104331 →
$0.107929 → **$0.089506**. Semantic repetition 2/471 and 0/747 at 0.85: one real pair
(`block_1` ↔ `block_6`, 0.8665) that the pipeline found, failed to repair in two attempts and
recorded in `generation_warnings` — the degrade-never-abort behaviour, working. Evidence:
`docs/career-playbook/2026-08-31-prompt-batch-validation.md` and
`docs/career-playbook/2026-08-31-semantic-repetition-88fc2368.md`.

The run also found that **two deterministic checks were billing a regeneration for a correct
sentence** (`4ec3bf1f7`): `validateUnsourcedStatistics` demanded a citation for the ledger's own
`Forecast accuracy` target because the sentence restated the label across a clause and contained
the word "market"; `validateCadenceConsistency` read "daily" out of an enumeration where it
governed the item beside the duty. Replayed over the stored blocks of all three runs, contract
criticals fall 12 → 9, 7 → 3 and 3 → 1. Both tests proven red against the pre-change source.

Reading that run end to end — which the counters do not do — found four more, and two are fixed in
`b28663b77`. **A metric target never carries the example marker**, deliberately: the ledger is the
single source and a marked threshold would let blocks drift. The cost was that the publish
checklist, built from markers, could never name a threshold — run `88fc2368` listed 29 values to
calibrate and none of its six assumed numbers, while block 1 of the same guide told the reader
those six needed validating in the first quarter. The table now reads
`metric_ledger[].provenance`: `assumption` and `benchmark` lead it, asked to be _confirmed_;
`user_answer` and `company_source` stay off. In the same change: the model's bold heading carries a
subtitle, so the pattern that removes its duplicate list matched nothing and the reader met
"Calibrate before publishing" twice; a marked table row is now one row instead of one per marked
cell (continuity 16 → 6); and both columns cut on a word boundary. Block 26 had also published a
rule nobody wrote — "every number ... must not be changed during calibration" — and the prompt now
forbids it. **The prompt half is unvalidated by generation and rides the next paid run.**

A **fourth arm**, `2896e72f` (2026-08-31, on `88df445c3`), measures the batch above. Judge criticals
went 25 → 9 → 7 → **11**, which is noise: four runs of identical input span that range, and the
comparable row is the deterministic replay over the four stored documents, **12 → 7 → 3 → 2**.
Repetition 1/471 and 0/1,092 at 0.85. Two delivered fixes are verified in the published document
rather than by replay: **one** "Calibrate before publishing" heading where the previous run printed
two, and **nine** rows carrying "assumed threshold, not company data" where the previous table
listed 29 values and no threshold at all. Evidence:
`docs/career-playbook/2026-08-31-fourth-arm.md`.

A **fifth arm**, `4e355bf4` (2026-08-31, on `d8edac3b0`), is the first run with a **milestone
ledger** — the third canonical ledger, for ramp deadlines. Verified on the containers:
`megacampus-api-dev`, `-worker-dev` and `-web-dev` all report
`org.opencontainers.image.revision d8edac3b04ab3b40a0f43512bb753914f86886c1`. 26m12s, $0.117013,
20 regenerations, 55 priced calls. The spec built **7 milestone rows** and 15 cadence rows.

Judge criticals were 13, up from 11, and that number carries no signal: five runs of identical
input have now spanned 25 / 9 / 7 / 11 / 13. What the run does answer is what only a run can.

- **`mc2-i6l0i` closed by prevention, not by repair.** The canvas of `2896e72f` promised the first
  forecast "by week 4" against an onboarding plan that set it at week 2. This run's canvas says
  "first solo pipeline review in Week 2 ... submit the first evidence-backed forecast the same
  week", which is what the ledger publishes, and the deterministic check finds **zero** milestone
  contradictions in the finished document.
- **The run found two defects in the checks it was validating**, both false positives that each
  cost a paid regeneration, both fixed in `bd5f8e5` and both verified by replaying the same stored
  document: contract criticals on `4e355bf4` fall **8 → 1**, and the survivor is a real
  `metric_conflict`.
  - Six of them came from the milestone check anchoring on the label's **first** long word. Every
    ledger label begins with "First", so block_18's correct one-line ramp summary — every date
    right — was searched from five places at once and blamed five times. The locating word is now
    the label's rarest word in that line.
  - One came from `findCadenceLedgerEntry` taking the first row that matches a duty family. The
    ledger held both `Performance review` (quarterly, per report) and `Team performance review`
    (weekly, whole team); block_26 wrote "quarterly", which its own row publishes, and was blamed
    with the other row's rhythm. A contested family is now silent rather than guessing.
- **The final-window reserve is live and correctly did nothing.** The warning now reads
  `20/8; final-window reserve 0/3`: every block the final pass flagged had already spent attempts,
  so no block was in the zero-attempt shape the reserve exists for. Before this change the same
  situation printed only `19/8` and could not be told apart from a block that never had a turn.
- **The unconfirmed-critical filter had one candidate and kept it.** The run's only critical in a
  deterministically-owned category was block_3's `metric_conflict`, which the deterministic check
  also found, so it stayed critical. The downgrade direction is still unexercised by a run; the two
  downgrades in the row are the older placeholder filter.
- **`category` now reaches the stored quality issue**, so a run's defect classes are readable from
  `q_a_data->'quality_issues'` instead of `judge_verdict` on every block: 12 `contradiction`, 1
  `metric_conflict`.

The deterministic replay over the four earlier documents is unchanged by all of this — **8 / 3 / 1 /
3**, measured today on `d8edac3b0`. That is not the `12 → 7 → 3 → 2` row above: those were measured
before `3ff023abf` loosened the citation rule, which legitimately removed findings. The three new
people-rhythm families contribute exactly **+1** across the four, isolated by toggling them off and
re-measuring, and that one is real — block_15 of `2896e72f` gives the career conversation two
rhythms.

Probing that run's reader links on dev found a defect that is **not** about reader links and is
older than they are: **every public page of a guide with a red band returns HTTP 500**
(`mc2-j8ms8`, fixed in `da92fc620`). `MarkdownRenderer` compiles with `compileMDX`, where `<` opens
an element, and a red band is a ceiling written with `<` — run `4e355bf4` carries 54 of them
(`red <2x`, `<65%`, `<80%`). The catalog share, the slug share and all three reader links were 500;
the metric ledger has published a red band for every metric since it existed, so this has been true
for every such guide all along. `escapeBareAngleBrackets` rewrites a `<` that cannot start a tag and
leaves what can, including everything inside a fence or a code span.

Worth carrying forward: **the live-smoke's `public-share` gate reported "rendered successfully" for
a page that was a 500.** It checks a tRPC query, not an HTTP status, which is why five paid runs
passed over this. Recorded in `mc2-j8ms8`.

Three things the run did **not** fix. `mc2-i6l0i`: the canvas still contradicts the onboarding plan
(Week 4 against Week 2) — the digest now carries the published milestones and the judge filed it as
a critical, where before nothing caught it, but visible is not fixed; the canvas should stop
re-authoring what it summarizes. `mc2-3dw6j` (new): the judge again filed a critical whose own
description ends "no defect is established here", the `mc2-1mr7r` shape a prompt alone cannot hold.
And two blocks invented a cadence the ledger does not carry.

**Reader views are delivered and enforced** (`mc2-ehao2`, `3ff023abf`). Owner ruling 2026-08-31:
employee ⊂ manager ⊂ HR — 20, 26 and 27 blocks, with only `block_12` outside the manager's view.
The link is the credential, because nothing in the platform knows which of the three a visitor is:
`share.listViewLinks` (owner-only) issues one link per reader, `share.getViewByToken` resolves the
audience from an HMAC over (playbook, audience) and serves that view **through assembly**, so it
carries the diagrams, sources and calibration table. No column was added; sharing off still revokes
all three. The citation rule moved with it and is now looser and correct — it asks who _receives_
the target. `mc2-ga3nf` is the remaining half: the owner's share dialog still shows one public link
instead of the three.

Still open on this track: `mc2-i6l0i` (the Role Canvas, one of five blocks every reader gets, names
career steps that are not in block 11 and a first forecast in month 1 against block 14's Day 60 —
and the manager, who does not hold block 11, is told by block 15 to run a career conversation
against its criteria), `mc2-r1qen` (block 9 sends the reader to a vendor blog for a Gartner
prediction, while block 19 of the same guide handles the identical figure honestly), `mc2-eksyp`
(the 22.5-entry `do_not_repeat` list is measured, not settled — the product question needs a second
arm), `mc2-s8xx6` and `mc2-tub8q` (their counts fell to 1 and 0 in `88fc2368`, but no code named
them, so that is variance), and `mc2-ehao2` (`buildRoleGuideView` has no caller). All three dev rows
are kept as A/B baselines and are not cleaned up.

A paid run needs no browser and no owner click: `auth.admin.generateLink` + `verifyOtp` mints a
real session from code, and step 1 of `docs/career-playbook/live-smoke-dev-run.md` is stale where
it says otherwise.

The previously current callout fix remains verified live and delivered to staging (`mc2-ctlar`,
master `22401f40c`); its detailed proof stays in
`docs/rag/2026-08-28-lesson-arms-batch/after-the-callout-fix.md`.

## RAG retrieval, chunking and parent expansion (measured 2026-08-26/28)

Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.65
ceiling). Degenerate parents no longer reach the index (`selectIndexableChunks`); only children are
indexed plus any childless parent, and the passage is rebuilt at retrieval time from siblings,
**after reranking**, for Stage 5 section RAG, Stage 6 lesson RAG and `search_documents` — off for
evidence retrieval, where a citation must point at the fragment that matched.

**Expansion runs at 1.00x on the live corpus, not 5.5x** (`mc2-xg6g8`): `sibling_chunk_ids` is empty
on all 6856 points, indexed in July 2026 with `total_chunks: 1`. The 5.5x is what expansion **will**
cost once a document is indexed with the current chunker. Token ceilings (20K Stage 6, 40K Stage 5)
are never approached.

**Retrieval quality is a number:** recall@5 **0.9677** Stage 5, **0.9677** Stage 6, **0.4839**
`search_documents` (the only path that does not ask for hybrid). Re-run read-only with
`pnpm --filter @megacampus/course-gen-platform benchmark:rag run`; the 76-query set is in
`packages/course-gen-platform/eval/rag-retrieval/`. Method:
`docs/rag/2026-08-26-retrieval-quality-measurement.md`.

What that measurement changed and still constrains:

- **Stage 5 was never hybrid for a plan of three or fewer queries** — `max_query_limit` is 100 and
  Stage 5 asked for 300/150/102, getting `Bad Request` → dense-only. `getPrefetchLimit` clamps to the
  collection's ceiling; Stage 5 recall@5 0.7742 → 0.9677, fallbacks 76/76 → 0/76.
- **The dense threshold costs nothing between 0.15 and 0.30**; 0.25 stays, now measured.
- **A fused RRF score is not on a different scale from a dense cosine one.** Fused scores reach
  1.0000 against dense bests of 0.45–0.65. The old advice stands; its stated reason was wrong.
- **Stage 6 no longer caps results per document** (`mc2-zewto`, owner 2026-08-27). The cap cost 22.6
  points of recall@5 and bought 0.11 documents per lesson. Grouping is untouched where it earns its
  keep: Stage 4 evidence preflight, conflict detection, Stage 5 advisory enrichment.
- **A per-query retrieval rate does not describe a ten-query lesson**: the per-query limit is a
  function of the query count, so the benchmark's 29.97 candidates (one-query harness) is 6 in a real
  lesson.

Three traps for the next measuring run: `[Lesson RAG] Retrieval complete` logs
`queriesExecuted: queries.length`, the number **planned**, not issued — count Jina embedding rows in
`generation_trace` instead; the dev workers point at `qdrant-dev` with **12 points**, so a lesson
driven through the dev queue never touches the 6856-point corpus on 6335; and a Stage 6 probe's
lesson length follows `estimated_duration_minutes` from `course_structure` (5 for course `8baaa75e`,
against the 15 an older baseline used), so every per-lesson counter moves with it.

## Routing and models

Ten live models. Workhorse `deepseek/deepseek-v4-flash-0731` — a **pinned snapshot** — fallback
`openai/gpt-5.6-luna`; prose `z-ai/glm-5.3-flash` with `PROSE_FALLBACK_MODEL_ID` =
`openai/gpt-5.6-luna` (never DeepSeek: it is the model this seat was taken away from);
`z-ai/glm-5.2` for the deciding judge and Stage 6's last chance; plus `google/gemini-3.7-flash`,
`minimax/minimax-m3` and four image models. Four invariants: judges keep three separate vendors,
`emergency` stays off OpenAI, every fallback crosses vendors, and the three escalation phases avoid
the default model on both hops.

**Judges by price** (`mc2-d1d09`): primary `gpt-5.6-luna`, secondary `deepseek-v4-flash-0731`,
tiebreaker `glm-5.2` (fallback `minimax-m3`). `executeSingleJudge` takes `judgeModels.secondary`, the
most frequent judge call. Reasoning is on for `stage_6_complex`, `stage_5_escalation` and
`stage_6_auto_last_chance` only.

**Images, settled 2026-08-27.** Card `openai/gpt-5-image-mini` at `quality: 'medium'`, $0.0091 a
frame, cheapest of all 47 square-capable models. Banner `sourceful/riverflow-v2.5-fast` at $0.013954,
fallback `openai/gpt-image-2`, ratio **16:9**. Image models are a separate catalogue: 26 of 48 charge
per frame and report no tokens (`imagePriceFlatUsd`), and only 7 publish `quality`.

**One table decides which model a phase gets** (`3cb14ffb6`, `mc2-u8kwx`): `llm_model_config`, edited
by the superadmin panel, snapshotted into `config-seed.json`, with `model-defaults.ts` naming the
four roles a snapshot cannot express. Every second answer is gone — `PHASE_FALLBACK_CONFIG`,
pipeline-admin's `DEFAULT_MODEL_CONFIGS`, `shared/llm/model-selector.ts`, Stage 5's `MODEL_FALLBACK`.
The guard is `model-ids-live-in-one-place.test.ts`: a model id spelt out anywhere under `src/`
outside six named registries fails the build. `collectRoutableModelIds()` returns exactly
`LIVE_ROUTING_MODEL_IDS`, asserted by `model-catalog-coverage` — it fails both when a registry goes
silent and when an undeclared one appears. A model id changes **database first, then**
`pnpm generate:config-seed`.

**The cheapest endpoint is the cheapest that can finish** (`263ae6c37`, `mc2-6a1x4`):
`MIN_ENDPOINT_THROUGHPUT_TPS = 30`, from the largest ordinary Stage 6 budget against its 300 s phase
timeout. Price-only sorting had been sending the workhorse to a 9 tok/s endpoint. The floor cannot
refuse every endpoint, ignores an endpoint publishing no figure, and never reaches across service
tiers. `throughput_last_30m` is an **object**; `uptime_last_30m` beside it is a number, and uptime is
deliberately not a criterion (owner, 2026-08-27).

**Phase configs**: Stage 5, metadata generation and `getModelForPhase` all go through
`buildProviderParams` (`phase-config-provider-contract.test.ts`); collision fallback
`LARGE_CONTEXT_MODEL_ID`. `stage_5_escalation` leads `getEscalationChain('generation')`.
`routing-seed-integrity` fails any phase whose model changes with language alone.

**The prose method outlives its ruling:** same input twice, read the artifact, do not trust the
judge. It is how a model that scored 0.92 was found to invent a statistic, and how a whole fabricated
metrics column was caught in the playbook. Also: **never measure a model on a container that has not
been told about it.**

**Where the money goes** (`mc2-4clyr`, remeasured 2026-08-27): a month of real courses came to
$0.9728 — Stage 6 prose 49.6%, the **cover image 25.6%**, judges 13.1%, Stage 4 6.4%, Stage 5 4.9%.
After the prose move the card is the largest single line of a small course.

## Cost accounting

Epic `mc2-qrdkt` is complete and the ledger reconciles. What binds work:

- **The receipt exists.** `GET /api/v1/generation?id=` returns what OpenRouter billed; the id is in
  the body **and** the `x-generation-id` header, which arrives before any abort, so a timed-out call
  is still countable. The record takes ~9.6 s to become readable. A paid call prices itself **at the
  call** and is stamped `input_data.billedCall`; a node-level summary row keeps tokens and carries no
  price. Guard: `tests/unit/shared/metrics/no-anonymous-spend`.
- **The ledger holds two providers** since 2026-08-28. A lesson costs about $0.0004 in Jina beside
  its OpenRouter bill — 8–13%, the reranker being 97% of it. Rates come from
  `GET https://api.jina.ai/v1/models` into `src/shared/jina/pricing.ts`, watched by
  `check:jina-pricing-drift`. Do **not** put Jina in `MODEL_CATALOG`. Jina rows are stamped
  `provider: 'jina'` and stay **out** of the OpenRouter reconciliation, which compares against a
  per-call receipt Jina does not issue.
- **The catalogue is an estimate, not the price.** `MODEL_CATALOG` builds budgets and the
  `provider.max_price` ceiling; every call settles against the provider. The nightly
  `check-model-catalog-drift.ts` is in **no** CI job: it writes published rates and commits to
  `develop`; a 1.5x move and a failed run both go to Telegram. Catalogue the **plain** tier — `/flex`
  is half it, `/priority` double — and never retype a rate in a test.
- **`provider.max_price` below every endpoint is a refusal**, not a cheaper route.
- **One transport, one place**: every OpenRouter client comes from `shared/llm/openrouter-client.ts`,
  held by `one-openrouter-transport.test.ts`, whose exception list may shrink, never grow.
- **A playbook is not a course** — `generation_trace.course_id` is a foreign key into `courses`, so
  playbook money lives in `career_playbooks.cost_breakdown`, and a playbook cannot have a
  `course_override` row. **Stage 6 and Stage 7 run their own workers, queues and containers**:
  anything added to the general processor misses them, and cost was wrong three times for this.
- **Editing is inside the course total**: `generation_trace.stage` accepts `stage_edit` and
  `get_audit_summary` returns it as its own row.
- **Attempt 1 stays on the primary**: `FALLBACK_FROM_ATTEMPT = 2`. `mc2-f1tqd` stays **open** — a
  pinned endpoint that answered with nothing at all, five attempts, no record.

After a paid run, reconcile with `pnpm cost:report --since <T0> --verify-with-provider`.

## Stage 6 Batch API, and backlog order

`FEATURE_STAGE6_BATCH_GENERATION` (off) sends a course's initial lesson generation as one
asynchronous OpenRouter batch; a coordinator polls, and each lesson is also enqueued with a
`STAGE6_BATCH_MAX_WAIT_MS` delay so it generates synchronously if the batch never lands. Turning it
on is not a config switch — see `:batch` in `.codex/repository-failure-modes.md`.

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order; do not re-open the 27
already closed with a commit or a measurement, and do not re-rank by tracker priority. Complete
through T5 (`mc2-sznhi`, `mc2-3sz3d`, `mc2-jz6y0.13.6`, `mc2-iioip`, `mc2-wxun`/`mc2-vjbb`).

## Live operational facts

- `course_embeddings_v1` holds **6856 points** after deduplication; a snapshot restoring 13712 is not
  a fault, half are copies. Qdrant and uploads pull daily to `helixa-new`; on-host snapshots share
  the docker volume with live data, so that pull is the only real mitigation.
- Dev and staging share one Supabase project; CI does not auto-apply migrations. Dev has its own
  Qdrant (host port 6333) and a full `-dev` worker set, but shares Redis with production.
- Nine source documents are accepted as lost and are **not** in the indexed set; do not reopen.
  Uploads live on the production host, not Supabase Storage. Monitoring drift is a separate job,
  never a deploy step: it can trigger rollback.
- Deploy/rollback entrypoints exit 75 when `/opt/megacampus/.host-operation.lock` is held; manual
  infra work uses `scripts/with_host_operation_lock.sh`. Production workers read
  `.env.<active_color>` (`cat /opt/megacampus/active_color`), **not** `.env.production`.
- The default backend Vitest command is fail-closed and needs Qdrant 1.18.2; use
  `vitest.config.unit.ts` for focused unit tests. `MC2_Q12_REAL_CONTROLLER` runs on uid 1000 only.
  Graphify is 0.9.45 and **does** refresh: `graphify update .`, no LLM, plus `--force` after a
  release that deletes code, because it refuses to write a smaller graph. Semantic extraction and
  community naming need an external model backend and stay off.
- Dev evidence metrics reach Prometheus labelled `environment="dev"` (`mc2-kim48`): the four rules
  aggregate `by (environment)`, dev writes an instance ending `-dev` and one `metric_relabel_config`
  rewrites it. Install monitoring config with
  `sudo /opt/megacampus/deploy/qdrant/install-monitoring-config.sh` — a single-file bind mount pins
  the inode, so Prometheus must be restarted. `dev-compose-variables-are-written.test.ts` compares
  every `${VAR:?}` in `docker-compose.dev.yml` against what the deploy writes.

## Owner decisions

Answered: `mc2-jz6y0.13.6` (pull-based off-host snapshots), `mc2-lrav0` (no backfill of dev Qdrant),
`mc2-db696.61` (`career_playbook_sources` has never held a row). `mc2-dgw4u` — Stage 7 audio stays on
its own OpenAI account, **paused, not settled**. `mc2-hqfc3` video stays parked; the job-description
rework stays parked. Migrations approved when necessary, useful and current, one at a time.
2026-08-28: lesson **length is not a criterion**, meaning surviving is; model arithmetic slips are
accepted noise and get no deterministic check.

**Still open:** `mc2-v6fqp` — which third language. "ru and en" stays the test language.

## Safety boundary

**Standing authorization, owner 2026-08-22: do not ask, act and report.** Paid runs inside the USD 5
ceiling, commits, `git push` to `develop`, dev deploys on a green pipeline, edits to
`llm_model_config` and `config-seed.json`, branch/worktree cleanup, the migrations named in the
active plan when necessary, and `RAG_SHADOW_RETRIEVAL_RATE` in production.

Outside it, needing a fresh decision each time: reindex, force-push, secrets or access changes, any
other production mutation, and any migration the plan does not name.

Do not touch `mc2-x72bq`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f` or `mc2-1nots`; see §9 of the active
spec for exact reopen gates. Before claiming delivery, run
`scripts/orchestration/check_stranded_commits.py`. `/push-dev` deletes the branch it delivered, so a
report naming a branch again means something really was left behind.

## Explicit defers

- `mc2-6ye5z.4/.5/.8` — handlers written 2026-08-23; live proof merely unrun, as for `mc2-rmbwo` and
  `mc2-p99f1`. `mc2-db696.106`/`.107` not planned; `mc2-gmab0` held by unit tests.
- `mc2-sv89s` — Jina spend from the two quality gates (`quality-validator.ts`,
  `semantic-matching.ts`) prices itself but is not attributed to a course; neither module mentions
  `courseId`. Both are named in `no-anonymous-spend.test.ts` under `RETRIEVAL_DEFERRED`.
- `mc2-9d2ji` / `mc2-923ku` — **closed 2026-08-31** by run `88fc2368`. No judge critical pairs two
  blocks with no shared reader, and `block_12`, the HR-only block the audience filter had stripped
  of 13 of its 26 constraint pairs, took zero regenerations. `mc2-eksyp` stays open: its question is
  whether a 22.5-entry `do_not_repeat` list beats a short one, and one arm cannot answer it.
- `mc2-de3vu` is **closed with the checkboxes unchanged** (owner, 2026-08-30). Widening a view was
  offered and declined: a whole section is too coarse a unit of access — the decision matrix holds
  both what HR needs and what it does not — and every extra reader flattens the voice the split
  exists to keep. Carrying one line across is therefore the mechanism, not a workaround. Do not
  reopen by proposing to move an audience checkbox without a new owner request.
- `mc2-ehao2` — `buildRoleGuideView` has **no caller** in the API or `packages/web`; no reader
  receives a view today. It also reads raw `generatedBlocks`, so a view would ship without the
  diagrams, sources section and calibration table that `prepareCareerPlaybookFinalBlocks` adds.
- `mc2-eksyp` — `do_not_repeat` is deterministic now but not shorter: 12–25 entries per block,
  average 22.5 of 25 against the 028 plan's 13–19. Not a defect (the run measured 0/471), but the
  selectivity question needs a paid A/B. `mc2-zewto` — Stage 6 grouping costs 22.6pp of recall@5;
  the owner's trade, measured, not acted on.
- `mc2-cva3o` — the production deploy writes `QDRANT_METRICS_GID` from a secret that does not exist.
  Not burning: the host carries 900 by some other means. It burns when `.env.production` is rewritten
  and the infra stack is recreated.
- `mc2-ibzcc` is closed, but its docling-mcp 3.1.0 image is **neither published nor deployed** — that
  is the manual `build-docling-images.yml` workflow and a recorded `image@sha256`, a production
  mutation of its own. `mc2-vlskb` stays open: 3.1.0 still drops `service_timeout`/`service_max_retries`.
- `mc2-v6r1p` — two catalogue prices have drifted; the question is whether either model belongs in
  live routing at all. `mc2-z08mv` — revisit `glm-5.3` when it has more than one provider.
  `mc2-pdcb7` — covers drawn without their visual style, fixed; whether to pay to redraw is the owner's.

## NotebookLM and languages

**The hop is live** (`mc2-xjykw`): SOCKS5 through `helixa-new` (82.26.152.8, NL), own revocable key,
system unit `megacampus-socks.service`. Judge it by its listener and its egress, never by unit state.
**Cookies are no longer a blocker**: the session is minted from a master token, `/health` reads
`2028-08-24 (730d)` and `notebooks.list()` answers. **Nothing has yet run a real NLM generation
through it** — the one proof still owed, and it now needs only a run.

`mc2-p99f1` has **no gate at all** — every layer already accepts the four types, and
`ON_DEMAND_ENRICHMENT_TYPES` is read by nobody. Three more enum values are applied to the database
and their handlers exist (`dbe094e21`), held by `stage7-new-nlm-types-are-real.test.ts`. `nlm_report`
is `artifacts.generate_report` with a format that is **not** `study_guide`, refused at both bridge
and handler.

**Spanish and Chinese both complete** (`mc2-v6fqp`), read by eye. Chinese never could before: five
thresholds calibrated on Latin script, each invisible until the previous was fixed. Weight by script,
never lower the number.

## Next recommended

Next stage id: none selected. The accepted Role Guide stage is delivered; its verification record is
in `.codex/stages/mc2-1786710715922-25-db11a6c5/summary.md`. No schema migration, reindex,
audience-checkbox change, secret/access mutation or force-push has occurred since.

Recommended action: `mc2-ehao2` — `buildRoleGuideView` still has no caller, so the audience views
this track spent two stages building reach no reader. It needs an owner decision on what ships to
whom before any view can be wired up, and the view must go through
`prepareCareerPlaybookFinalBlocks` or it will ship without diagrams, sources and the calibration
table.

## Starter prompt for next orchestrator

Use $orchestrator-stage after selecting the next ready Beads goal. Read `AGENTS.md`,
`.codex/orchestrator.toml`, this handoff and the selected issue before creating a new stage; do not
reopen the accepted Role Guide boundary without a new owner request or measured regression.
