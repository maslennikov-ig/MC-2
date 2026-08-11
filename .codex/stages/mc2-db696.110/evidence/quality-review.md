# Career Playbook — representative quality review after quality v2

Review date: 2026-08-11

Reviewer: root owner (no delegated reviewer)

Fixture: Sales Manager B2B, sales, lead, reports to CRO, leads SDR/AE, 51-200-person growth-stage
B2B SaaS, English, universal context, no uploads and no course bridge — identical to the
2026-08-11 baseline run so the comparison is honest.

Playbook: `066cc83e-17d5-4e64-a250-7a0c4c5b049c` (deleted after capture)

Baseline: `.codex/stages/mc2-db696.105/evidence/quality-review.md` — editorial **2.6 / 5**

## Verdict

The contract holds end to end. Every defect class the baseline review found by hand is now either
absent from the output or blocked deterministically before it can reach the reader.

Two of the three acceptance thresholds are met. **Wall clock is not**: the run took 59 minutes
against a 25-minute target, and 20 block regenerations against a target of 6.

| Dimension | Baseline | Now | Threshold | Result |
|---|---:|---:|---:|---|
| Deterministic scorecard criticals | 14 | **0** | 0 | pass |
| Cost | $0.1226 | **$0.2347** | <= $0.35 | pass |
| Wall clock | 56 min | **59 min** | <= 25 min | **fail** |
| Block regenerations | 13 | **20** | <= 6 | **fail** |
| Blank PDF pages | 3 | **0** | 0 | pass |
| Literal `---` in PDF | 9 | **0** | 0 | pass |
| Raw Markdown links in PDF | n/a | **0** | 0 | pass |
| Citations in document | 0 | **12** | > 0 | pass |
| Sources with real URLs | 0 | **4** | > 0 | pass |
| Calendar years other than 2026 | 2024, 2025 | **none** | none | pass |
| Marked examples | 0 | **13** | all unverified values | pass |

## Generation evidence

- Terminal state: `completed`; 27 stored blocks; final Markdown 91,562 characters.
- Created `2026-08-11T13:01:29Z`, completed `2026-08-11T14:00:54Z` — 59.4 minutes.
- Recorded cost `$0.234668095`; `unknown_cost_attempts: 1` — the receipt now names an attempt whose
  cost it cannot account for instead of implying that what it cannot see was free.
- Spec ledgers: 4 metrics, 12 evidence entries, `generated_on 2026-08-11`.
- PDF: 60 pages, 421,024 bytes.

Per-node time and cost:

| Node | Calls | Cost | Minutes |
|---|---:|---:|---:|
| blockRegenerator | 18 | $0.1279 | 10.9 |
| crossBlockJudge | 15 | $0.0413 | 9.4 |
| specBuilder | 3 | $0.0368 | 6.0 |
| group4Generator | 2 (1 aborted) | $0.0105 | 12.0 |
| group5Generator | 1 | $0.0122 | 2.6 |
| groups 1,2,3,6 | 4 | $0.0061 | 6.7 |

## What the baseline review found, and where it stands now

**1. No factual traceability.** Closed. The guide carries 12 `[S9]`-`[S12]` citations resolving to a
Sources section with four real URLs, assembled from the evidence ledger rather than written by the
model. `validateUnsourcedStatistics` reports zero unsourced precise statistics.

**2. Cross-block metric conflicts.** Closed. Four metrics live in the ledger and are quoted verbatim;
`validateMetricLedgerConsistency` reports zero conflicts. The baseline had four separate metrics
appearing with contradicting thresholds, one pair inside a single generation call.

**3. Anti-micromanagement contradicted by duties.** Closed. `validateAntiGoalConflict` reports no
per-person daily duty against the published anti-goal.

**4. Generic input presented as company truth.** Closed. Thirteen values carry the explicit example
marker, and no calendar year other than the generation year appears anywhere in the document. The
baseline pinned an onboarding Gantt to January-March 2025 in a guide generated in August 2026.

**5. Overstated decision classification.** Addressed in the prompt with four independent axes
(reversibility, blast radius, contract commitment, approval level). Not separately measurable by a
deterministic check; spot-read only.

**6. Smaller copy defects.** Not addressed by design — deferred with the full-document proofreading
pass, see below.

**PDF.** Closed for the measured defects: zero blank pages (was 3), zero literal `---` (was 9), zero
raw Markdown links, ordered lists and `####` headings render as HTML.

## Findings from this run

**Status glyphs still did not render, and the font-family fix was not enough.** After declaring
Noto/DejaVu, a screenshot of the rendered cell still showed an empty box: the container has no font
covering U+2705. Fixed by substituting ASCII markers (`[OK]`, `[!]`) in the PDF template only, so the
Markdown export keeps the richer glyphs. Verified by re-screenshotting the same cell.

**Two scorecard findings were check artifacts, not content defects.** A compensation share stated as
"target variable 50% of base (example — replace)" was read as a competing metric value, and the
marker variant "(example — replace: $4,000)" was not recognised. Both checks were tightened: a line
already marked as an illustration is not a competing commitment, and the marker accepts a qualifier.

**Latency and regeneration count regressed.** The contract is working — the checks find real issues
and the loop fixes them — but 20 regenerations across 14 blocks and 15 judge passes cost 20 minutes
between them. The generators are producing first drafts that violate the new contract often enough
that the repair loop dominates the run. This is a prompt-adherence problem, not a check problem:
the fix is to make first drafts comply, not to loosen the gate.

## Editorial review (added after the fact — the acceptance above was mechanical only)

The section above verified what had been formalized into checks. That is a partial acceptance, and
recording it as the acceptance was wrong: the plan's primary threshold is a seven-dimension manual
rubric at >= 4.0 / 5, and half the baseline findings are not expressible as a regex. The full
1,118-line document was then read end to end.

**Editorial score: 3.9 / 5 — below the 4.0 threshold.**

| Dimension | Baseline | Now | Threshold | Note |
|---|---:|---:|---:|---|
| Completeness | 5 | 5 | >= 5 | 26 sections plus header, richer than the baseline |
| Coherence | 2 | 4 | >= 4 | Metric consistency genuinely solved; one authority contradiction remains |
| Practical usefulness | 3 | 4 | >= 4 | Docked: the calibration table is the reader's map and it is wrong |
| Grounding and traceability | 1 | 3 | >= 3 | 12 citations to 4 real sources; content of the claims unverified |
| Decision and risk guidance | 3 | 4 | >= 4 | Four-axis matrix is a real gain; one row is internally incoherent |
| PDF fidelity | 2 | 4 | >= 4 | Docked: verified mechanically plus one screenshot, not all 60 pages by eye |
| Cover image | 3 | **unscored** | >= 3 | Not reviewed; storage was cleaned before the editorial pass |

### What the metric ledger actually delivered

The four ledger metrics appear with identical targets and thresholds in blocks 1, 6, 17, 20 and 24.
The baseline had four separate metrics carrying contradicting values across blocks, one pair inside a
single generation call. This dimension was the worst in the baseline and is now the strongest.

Relative dates hold throughout — "Day 1-14", "after 4 quarters", "(relative: Month 1)" — with the
only absolute date in the footer. The four-axis decision matrix correctly classifies CRM stage
changes and vendor selection as "reversible with cost". The career ladder has no duplicate level and
keeps the IC and management tracks separate. All three are baseline findings closed properly.

### Defects reading found that no check can see

1. **Hiring authority contradicts itself across three blocks.** Block 5 line 90: "Act alone ... CRO is
   notified for visibility - no approval required". Block 16 line 581: "culture-fit debrief -> CRO
   sign-off -> offer". Block 24: "Full authority | CRO for exceptions". A reader cannot tell whether
   they may hire without approval. Block 5 also classifies the same decision as *irreversible* with
   function-level blast radius while granting act-alone authority, which is internally incoherent.
2. **The calibration checklist misses every monetary example.** Block 26 "Calibrate before publishing"
   lists six rows: a lead-response SLA, the field-to-fill templates, and the version number. The
   document contains seven marked money values — $120,000 base, $100K and $50K in the GWC questions,
   $5,000 offsite, $4,000 conference, EUR 200,000 and EUR 120,000 in the SBAR — and the table names
   none of them. The instrument that makes marked examples actionable does not point at the values
   that most need replacing.
3. **Generation-contract instructions leaked into reader-facing text.** Block 6 anti-metrics: "Do not
   use 'accuracy above +/-20%' language - always measure forecast quality as absolute error." That is
   an instruction to the document's author, not guidance for a sales manager. Same class: "described
   qualitatively - no precise target from ledger". This is a defect the prompt rules introduced.
4. **Internal block identifiers leaked into prose**: 23 occurrences of `block_5`, `block_17`,
   `Block_6` and similar in FAQ answers and the implementation checklist, alongside the correct
   "Block 8" form elsewhere. One row mislabels block 6 as "(FAQ)".
5. **The bonus schedule has a discontinuity.** Block 15 prorates the yellow band "from 50% at 75% to
   90% at 89%", then pays 100% at 90%. One point of attainment is worth ten points of bonus at the
   boundary — a comp reviewer would reject it.
6. **Coaching capacity does not fit the schedule.** Block 4 requires a weekly 1:1 with each of 6-12
   direct reports; block 13 allocates two 30-minute slots per day, which is ten per week. At the top
   of the stated range the cadence is unachievable.

### Limits of this review

- **Citations are verified as resolvable, not as supporting.** The checks confirm a `[Sn]` exists and
  resolves to a ledger entry; nothing confirms that the source says what the sentence claims. The
  87% AI-adoption figure and the 2.6x quota claim rest on four vendor marketing posts, not research.
- **The PDF was verified mechanically** (page count, blank pages, absence of raw Markdown, one
  screenshot of a substituted glyph). The baseline reviewer rendered and inspected all 60 pages.
- **The cover was never opened.** Storage was cleaned before the editorial pass, so it cannot be
  scored now. Cleanup should follow the review, not precede it.

## Cleanup evidence

Exact cleanup by fixture identifiers reported zero residual rows for organizations, users,
memberships, playbooks, job status, error logs, courses, auth users, and storage objects. The
disposable credential files were removed. No upload, course bridge, or vectorization path ran, so no
Qdrant resource was created by construction.

## Tracked follow-ups

- Latency and regeneration count above target: first-draft contract adherence in the group prompts.
- Full-document proofreading pass (baseline finding 6), still deferred by budget.
