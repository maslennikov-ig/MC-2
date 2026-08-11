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

## Cleanup evidence

Exact cleanup by fixture identifiers reported zero residual rows for organizations, users,
memberships, playbooks, job status, error logs, courses, auth users, and storage objects. The
disposable credential files were removed. No upload, course bridge, or vectorization path ran, so no
Qdrant resource was created by construction.

## Tracked follow-ups

- Latency and regeneration count above target: first-draft contract adherence in the group prompts.
- Full-document proofreading pass (baseline finding 6), still deferred by budget.
