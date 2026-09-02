# Handoff history archive — Career Playbook track, to 2026-09-02

`.codex/handoff.md` is current-state only and is capped at 308 lines
(`.codex/orchestrator.toml`, `[handoff] current_state_max_lines`). On 2026-09-02 it stood at 640
lines, most of it a chronicle of paid runs, arms and closures that had stopped binding any future
work. This file is that chronicle, moved out whole rather than shortened.

Every section below is copied **verbatim** from `.codex/handoff.md` as it stood at commit
`ab8f1bbf6`, with its original heading. Nothing was edited, condensed or reordered. The durable
lessons these runs taught were separately written into `.codex/repository-failure-modes.md`, which
is where a future session should look first; this file is the evidence behind them.

Sections, in their original order:

1. `## Current stage` — the accepted Role Guide stage and the five measured arms that followed it.
2. `## RAG retrieval, chunking and parent expansion (measured 2026-08-26/28)`
3. `## Career Playbook verification runs, 2026-09-01 night`
4. `## Jina key replaced (2026-09-02, mc2-7lp0u closed)`
5. `## Six open defects closed (2026-09-02, 0ab834bd3)`

---

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

---

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

---

## Career Playbook verification runs, 2026-09-01 night

Two paid dev runs, both `status: pass`, all evidence checks green, PDF and public pages included:

| run        | lang |    cost | duration |      markdown | stored findings |
| ---------- | ---- | ------: | -------: | ------------: | --------------: |
| `422471a2` | en   | $0.0942 | 18.7 min | 106,311 chars |  8 (1 critical) |
| `208746e3` | ru   | $0.1128 | 25.9 min | 102,742 chars | 19 (2 critical) |

They were the first runs to exercise the ten changes shipped since `cc12dccc`/`db9d3ff9`, and they
confirmed three of them directly: the proofreader's structured verdict survived a Russian document
(4 calls, verdict parsed, no lost pass — `db9d3ff9`'s regression is gone); `ae0dbfb83`'s FAQ fix held
(no `block_18` leak); the authority gate downgraded 13 of 19 Russian and 3 of 8 English findings
correctly, and semantic repetition filed zero criticals in either language.

Four defects found and delivered the same night, each with corpus evidence, each with a test that
fails on the old behaviour:

- `mc2-o29g8` (`c01cc4837`) — the `prior_blocks_digest` section titles carried writing rules inside
  the data, and the model wrote them down for the reader. Six leaks in three stored documents; the
  rules already existed in `GROUP_OUTPUT_CONTRACT`. The trigger is removed, not banned.
- `mc2-hrz7n` (`0785fdf48`) — group 6 dictated `"refreshed within the last two quarters"` and the
  judge filed a critical `invented_number` against a sentence the prompt required. 12 of 25 stored
  playbooks carry the phrase; the ones that state it as a rule invent a policy.
- `mc2-nfyyo` (`3b6ac446e`) — the whole-document proofreader's findings reached no stored row at
  all, because `q_a_data.quality_issues` is built by walking `generatedBlocks` for a per-block
  verdict. It now files under its own `final_proofreader` source. This unblocks `mc2-r2468`.
- `mc2-mo5yk` (`b45b7eb2c`) — new `validateScriptSplice`: a word whose letters come from two
  alphabets with no hyphen at the boundary. Five occurrences in five documents over three months,
  zero false positives, four of them never filed by anything; two are homoglyphs invisible on the
  page. Russian technical compounds (`CRM-данных`) are safe because the script changes at the hyphen.

Also `308ff8f31`: `browserslist` pinned above the 2026-09-01 advisory. Not ours — a newly published
GHSA pair failed Security Audit for everything on `develop`, including the deploy this track needed.

**All four are now verified in live documents and closed.** Three runs on 2026-09-02 after the key
replacement, $0.373081 together: `609b5a60` (en), `cfa66ada` (ru), `d50da4b1` (en); the first
reports `status: pass` with PDF export and all four public pages at HTTP 200.

| fix         | before                                   | in all three runs                 |
| ----------- | ---------------------------------------- | --------------------------------- |
| `mc2-o29g8` | 6 leaks / 3 documents / 5 blocks         | `validateContractLeakage` = **0** |
| `mc2-hrz7n` | both of `208746e3`'s criticals were this | **0** issues mention the phrase   |
| `mc2-nfyyo` | 0 proofreader findings stored, ever      | **42 / 26 / 12** stored           |
| `mc2-mo5yk` | 5 corruptions / 5 documents / 3 months   | `validateScriptSplice` = **0**    |

Open and evidenced, not fixed: `mc2-de6fe` (P3, the paragraph-pair repetition check measures
parallel structure, not repetition — full distribution and a measured-and-rejected candidate are in
the issue and in quality-contract §6.1), `mc2-afoz6` (P3, block 17's "три дня подряд"), `mc2-r2468`
(P2, no longer blocked; the block_13 claim in its original delivery note is corrected there and in
quality-contract §8bis.6 — the model misread a clock slot as a cadence).

### Three things the verification runs found

- **`mc2-jqvf4` (P1) exists only because `mc2-nfyyo` shipped.** The first Russian run's proofreader
  filed a critical saying sections 6–20 are absent from a document that carries all 26 in order.
  15 of that run's 26 findings grew from the false premise, all tagged `block_5`; the English run of
  the same day has a healthy spread and no such finding. It matters because
  `buildProofreaderQualityIssues` marks everything above `info` `action: 'regenerate'`, so a false
  premise spends a regeneration budget of three.
- **Critical counts are not a measurement at n=1** (`mc2-x15bk`). Replaying `finalProofreader` four
  times on a byte-identical input gave **1, 5, 12 and 7** criticals and four different
  `needs_regeneration` lists; three English runs of one fixture gave judge criticals **1, 5, 11**.
  The four closures above rest on deterministic checks instead, which is why they are trustworthy —
  and why the run-count tables earlier in this file should not be read as measurements. Replaying
  one node costs ~$0.002 against ~$0.10 for a run, so the cheap instrument already exists.
- **`mc2-encw8` (P3): the leak detector knows one grammatical mood.** `d50da4b1` block 17 shipped
  "Do not invent numeric escalation counts here… they belong in this section", and
  `validateContractLeakage` returned 0 — `AUTHOR_INSTRUCTION` covers the declarative self-description
  and not the imperative. Measured before proposing anything: **1 line in 28 playbooks**, too rare to
  justify widening a detector whose false positive is an honest warning to a reader.

---

## Jina key replaced (2026-09-02, `mc2-7lp0u` closed)

The exhausted key (sha256 `6fb2b6c3`) stopped Career Playbook on dev and would have stopped
production; the cause was mine and is recorded in the issue. The owner supplied a replacement
(sha256 `ea419b01`) on 2026-09-02 and it is installed in every place the value is read:

| where                                                     | how                                           |
| --------------------------------------------------------- | --------------------------------------------- |
| `packages/course-gen-platform/.env`                       | local dev                                     |
| GitHub Actions secret `JINA_API_KEY`                      | the source every deploy writes from           |
| `/opt/megacampus/.env.{dev,blue,green,production}`        | backed up as `.bak-jinakey-<stamp>`           |
| `megacampus-{api,worker,worker-stage6,worker-stage7}-dev` | recreated                                     |
| `megacampus-worker`, `-stage6`, `-stage7` (production)    | recreated on the image digest already running |

Production workers were pinned to `sha256:20e1372e15bd…`, the digest they were already on, so the
recreation changed the credential and nothing else; the queues were verified idle immediately
before. `megacampus-api-blue` and `megacampus-web-blue` deliberately still hold the old key: they
have no embedding or rerank call site — every one is in stages 2, 5 and 6, worker-side — and the
API's only use is the startup `healthCheck()`. They pick it up at the next production deploy.

Evidence, not assumption: `/v1/embeddings` 200 at 768 dims (matching the Qdrant collections),
`/v1/rerank` 200, `healthCheck()` true and `generateQueryEmbedding()` 768 dims through our own code,
and `megacampus-api-dev` logging a real 321-token embedding call at startup with no balance error.
All seven recreated containers came up with `RestartCount` 0.

**An operator trap found while doing this** is recorded on `mc2-cva3o`: `env_file` does not feed
compose interpolation, so a hand-written `docker compose … up` fails on `QDRANT_METRICS_GID` even
though the value is in `.env.dev`. The working form is the one `scripts/deploy_dev.sh:151` uses,
`--env-file "$BASE_PATH/.env.dev"`; production additionally needs `API_IMAGE` and `WEB_IMAGE` passed
explicitly.

---

## Six open defects closed (2026-09-02, `0ab834bd3`)

Every Career Playbook issue outside the epic is now closed. `mc2-db696` is the only open one left,
and what remains before it can close is a release, not a fix.

| issue       | what it was                                      | what shipped                                                                                    |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `mc2-jqvf4` | the proofreader invents missing sections         | it is handed a pattern-derived section inventory; regenerations are capped to its own criticals |
| `mc2-r2468` | deepseek vs glm for the proofreader              | dissolved by the measurement below — the model stays                                            |
| `mc2-x15bk` | a critical count is not a measurement            | 32 arms recorded in quality-contract §6.2 with a floor of eight arms per side                   |
| `mc2-afoz6` | block 17 sets a threshold it promised not to set | the ledger owns thresholds, the block owns observation windows; written on both sides           |
| `mc2-de6fe` | semantic repetition catches parallel structure   | two text-decidable exemptions, and the within-block finding drops to `warning`                  |
| `mc2-encw8` | the leak detector knows one grammatical mood     | the imperative form, requiring both halves in one line                                          |

**Three things the work found that the issues did not say.**

`mc2-jqvf4` is not a Russian defect and not intermittent between runs — the invented-section claim
appears in **all three** runs of 2026-09-02, in both languages. And it cannot be measured by replay
in either direction: 0 of 16 arms reproduced it before the change, 0 of 16 after, because a replay
reads `final_markdown` — the text after the final regenerations — while the live node saw the
assembly before them. The change rests on the mechanism, and this is stated that way in the contract
and in the commit rather than dressed up as a measured win.

`mc2-de6fe` has a number the issue never had: the within-block check has filed **six** criticals in
the life of this track, all six are read in the closure note, and **not one** is repetition. The one
real repeat in the corpus (`a03dfb46` block_9) has never been filed.

`verdictFromIssues` sent everything that was not `info` to regeneration, warnings included. That made
`validateContractLeakage`'s own suggestion — "this is a warning rather than a regeneration trigger" —
untrue of the code beneath it, and it would have silently voided the `mc2-de6fe` downgrade. Both
paths now regenerate on `critical` only.

**Verified on a live run, not only in tests.** The running dev worker was probed for the compiled
symbols first (`buildCareerPlaybookDocumentOutline`, `isParallelStructure`, `isAuthoringDirective`
all present in `dist/`), because a green Deploy job has lied before. Then `dc504385` (ru,
2026-09-02, `status: pass`, 27 blocks, PDF 505,921 bytes, all four public pages HTTP 200,
**$0.11128** against the $0.60 ceiling):

| fix         | on `dc504385`                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mc2-jqvf4` | zero claims that a section is absent; `action=regenerate` equals the critical count exactly (18 = 18), where the three runs before it were 10, 11 and 6 against 8, 7 and 2 |
| `mc2-encw8` | `validateContractLeakage` = 0                                                                                                                                              |
| `mc2-de6fe` | zero semantic-repetition findings                                                                                                                                          |
| `mc2-afoz6` | 3 `invented_number` criticals, every one about a promotion policy in quarters and none about an observation window — the carve-out did not over-generalize                 |

The 35 proofreader findings on that run are three passes of 12, the prompt's own cap, so about six
criticals per pass — inside the 3-12 range §6.2 measures. Read it that way; a raw total across
passes is the exact mistake `mc2-x15bk` exists to stop.
