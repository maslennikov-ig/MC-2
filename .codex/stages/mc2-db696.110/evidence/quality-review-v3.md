# Career Playbook — acceptance read after quality v3

Review date: 2026-08-11

Reviewer: root owner. This time the full L3 order was followed: scorecard, cover opened, pages
rendered and viewed, whole document read, rubric filled — and only then cleanup.

Fixture: identical to both prior runs (Sales Manager B2B, sales, lead, reports to CRO, leads SDR/AE,
51-200-person growth-stage B2B SaaS, English, universal, no uploads, no course bridge).

Playbook: `eeeb54d9-cd43-47b3-884e-9222a6bed5d2` (deleted after review).

## Verdict

**Editorial score: 4.4 / 5 — above the 4.0 threshold.**

| Dimension | 2026-08-11 baseline | v2 read | v3 read | Threshold |
|---|---:|---:|---:|---:|
| Completeness | 5 | 5 | **5** | >= 5 |
| Coherence | 2 | 4 | **4** | >= 4 |
| Practical usefulness | 3 | 4 | **5** | >= 4 |
| Grounding and traceability | 1 | 3 | **3** | >= 3 |
| Decision and risk guidance | 3 | 4 | **5** | >= 4 |
| PDF fidelity | 2 | 4 | **5** | >= 4 |
| Cover image | 3 | unscored | **4** | >= 3 |
| **Overall** | **2.6** | **3.9** | **4.4** | **>= 4.0** |

## Run facts

- Completed, 27 blocks, 86,431 characters, 49 PDF pages.
- 55.9 minutes; cost **USD 0.352** against the raised USD 0.60 ceiling; 16 regenerations;
  `unknown_cost_attempts: 1`.
- Ledgers: 6 metrics, 12 evidence entries, `generated_on 2026-08-11`.
- The whole-document proofreading pass ran, found issues, and capped regeneration at three as
  designed, recording the block it did not address.

## What the v3 fixes actually did

**Authority is now consistent — the worst defect of the v2 read is gone.** Hiring appears in four
places and all four agree: Block 5 "Align (with HRBP and CRO)", Block 16 "Align with HRBP and CRO per
Block 5 before extending an offer", Block 24 "Hire within headcount plan (align with HRBP and CRO)",
Block 18 Q5 "the plan itself is set with the CRO and HRBP". Discount authority is consistent across
five places at 15%. Block 5 no longer grants act-alone authority over an irreversible decision.

**The calibration table is complete.** Nine rows naming nine values, cross-checked against every
marker in the document: the $50K deal threshold, the $120,000 ACV, the $3,000 training budget, the
buddy name, the $X forecast threshold. In the v2 run this table listed six items and named none of
the seven money values. Assembling it from the markers rather than asking the model to remember them
is what changed.

**No contract leakage.** Zero snake_case block identifiers in 49 PDF pages, and the block 6
anti-metrics table now describes real anti-behaviours (sandbagging, low-quality pipeline padding)
instead of telling the reader which phrasing the author should avoid.

**The metric ledger holds across six metrics and five blocks.** Blocks 1, 6, 17, 20 and 24 restate
targets and traffic lights identically. Verified line by line.

**PDF verified by looking at it**, not only by extraction: tables break across pages with repeated
headers, ordered lists render as real lists, headings are not stranded, no raw Markdown, no clipped
diagram. Zero blank pages.

**Cover opened and viewed.** Deep teal with amber, a pipeline funnel, a rising trajectory, four
silhouettes at a negotiation table — the department style landed and reads as B2B sales leadership.
Not brand-distinct, hence 4 rather than 5. Note: `image_content.visualStyle` records the default
palette rather than the one actually used, so that metadata field is misleading.

## Defects that remain

1. **One miscitation, caught by the new check.** Block 19 attributes "61% of B2B buyers favour a
   rep-free experience" to Gartner via `[S9]`, but `[S9]` is a SalesHive blog post whose retrieved
   text is about AI next-best-actions and a survey of 227 chief sales officers. The number does not
   appear in the source. This is attribution laundering — a vendor blog cited as "Gartner's
   research" — and it is exactly the class `mc2-db696.117` was built for. The check flags it; the
   generator still produced it.
2. **The 1:1 cadence contradicts itself across three blocks.** Block 4 lists "Rep 1:1 development
   sessions" as **monthly**; Block 15 job-crafting says "Weekly 1:1s with each direct report
   (Block 4)"; Block 18 Q7 says "two short coaching 1:1s per rep" weekly. A reader cannot tell what
   the commitment is.
3. **Coaching still does not fit the day at the upper bound.** Block 4 asks for five recorded calls
   reviewed per rep per week; Block 13 allocates two 45-minute coaching blocks per day. At 12 reports
   that is 60 call reviews against ten sessions. The v3 prompt rule for this exists and was not
   honoured.
4. **Two copy defects**: a stray `**Total** | **100%** |` line outside the Block 3 table, and a
   lowercase "provide access" opening a Block 26 checklist item.
5. **Grounding is real but narrow**: only two distinct sources are actually cited across the whole
   guide, both vendor marketing. The `source_kind` label surfaces this honestly rather than hiding
   it, which is why the dimension scores 3 and not higher.

## Scorecard precision — the expensive finding

The first scorecard pass on this output reported **seven** criticals, of which **one** was real. Six
false positives is not cosmetic: each one drives a paid regeneration, and this run hit the per-block
cap on eleven blocks with unresolved issues remaining.

Four causes, all fixed and covered by tests taken from these exact lines:

- A line citing a traffic-light band ("if coverage drops below 2x, flag") read as a competing target.
  Fixed by comparing direction, not just digits: the red band `<2x` and a claim of "at least 2x"
  share digits and mean opposites.
- `mid‑market` read as a claim about the market. The guide uses U+2011, so excluding the ASCII hyphen
  was not enough.
- The marker form `(example: $100K — replace with your threshold)` not recognised.
- A number belonging to a different quantity in the same table row.

The last one is **deliberately not fixed**. Narrowing comparison to the naming cell or clause removed
it and also disabled detection on the standard KPI table shape, where the metric sits in column 1 and
its target in column 3 — including the original 2x/3x conflict this whole track exists for. Losing
the core detection is worse than one extra regeneration, so the row stays the unit of comparison and
the residue is accepted and pinned by a test that says so.

## Limits of this review

- Citation support is verified as "the number appears in the retrieved fragment", not as "the source
  supports the claim". The 61% case was caught because the digits are absent; a source that contains
  the right number in the wrong context would still pass.
- The PDF was verified by rendering four representative pages plus full text extraction, not by
  viewing all 49 pages individually.

## Cleanup

Performed after this review, not before. Zero residual rows across organizations, users, memberships,
playbooks, job status, error logs, courses, auth users, and storage objects.
