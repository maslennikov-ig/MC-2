# Ten lessons per arm, and three things found while looking

**Date:** 2026-08-28 · **Follows:** `docs/rag/2026-08-28-retrieval-on-a-lesson-and-jina-priced.md`
**Runs:** 20 (course `8baaa75e`, sections 3 and 4, five lessons each, both arms)
**Cost:** $0.105135 — $0.096351 OpenRouter, $0.008784 Jina

The single-lesson pass said the two arms were indistinguishable and said, in the same breath, that
one observation per arm cannot separate run-to-run variance from a retrieval effect. This is the
larger sample. `runs.json` holds every run: retrieval shape, chunk ids, quality, flags, review state.

## 1. The cap changes what the model reads more than one lesson suggested

| Per lesson, mean of 10                    | Arm A (current) | Arm B (cap restored) |
| ----------------------------------------- | --------------- | -------------------- |
| Distinct documents in the model's context | **3.4**         | **4.4**              |
| Chunks shared with the other arm, of 7    | \_              | **3.2**              |
| Context handed to the model               | 5631 chars      | 5476 chars           |
| Judge quality                             | 0.830           | 0.841                |

Two corrections to what the single lesson implied:

- **The overlap is not four of seven, it is 3.2 of seven.** On lesson 3.2 the arms happened to share
  four chunks; across ten lessons they share fewer than half. The cap is not only rearranging the
  tail.
- **The cap buys about one whole document** in the final context, every time — B ≥ A in seven
  lessons, equal in three, never lower. The earlier figure of 0.11 documents was measured on the
  union before reranking; measured on the seven chunks the model actually reads, it is +1.0.

**And quality still does not move.** 0.830 against 0.841 is inside the noise, and it changes sign
lesson by lesson: five favour A, five favour B. Excluding the lessons the callout gate mauled
(below), the paired comparison is A 0.900 against B 0.910 on three clean pairs — a sample too small
to say anything, and honest to report as such.

So the trade is now measured at the right granularity and it is a real trade: the cap costs 22.6
points of recall@5 and buys one document of breadth in what the model reads. Neither shows up in the
lesson. **Nothing here argues for changing the setting back**, and nothing here argues it was free.

Read the judge score as the judge's, not as a verdict. Two lessons were read by eye in the previous
pass; these twenty were not.

## 2. The callout gate blocks every lesson it sees

Recorded per run because the previous pass ended `needs_review` twice and nobody knew why.

```
callouts per lesson: min 3, max 8, mean 4.8
  in the rule's pass band (<= 2):   0 of 20
  3-4, warning:                     9 of 20
  5+, blocking -> full regeneration: 11 of 20
needs_review:                       11 of 20
  carrying callout_density_blocking: 11 of 11   (100%)
```

Every `needs_review` in this sample is this one rule, and **not one lesson met it**. Regeneration
does not help — a blocked lesson is generated again and comes back with five or more again, once
with eight. And the regenerated lesson is worse:

|              | quality   | regenerations |
| ------------ | --------- | ------------- |
| blocked (5+) | **0.778** | 2.00          |
| warned (3–4) | **0.907** | 0.44          |

The gap is 0.13 while the filter's own weight in the score is 0.03, so most of it is the damage done
by regenerating, not the deduction.

The disagreement is visible in the prompts. `single-call-generator.ts` asks for "max 1-2 callouts per
lesson"; `serial-generator.ts` asks for "at least ONE visual element" and "concrete examples using
callout format" **per section**, and `expander.ts` makes the callout the required form of the
practical example. At five or six sections that is about one callout per section — exactly what is
asked for, and exactly what the per-lesson cap forbids. The rule counts per lesson what the prompts
produce per section.

Full account and the options in `mc2-udj0b`. The threshold is an owner's call and is not changed
here.

## 3. Uniqueness across lessons: the worry is not confirmed, a different one is

Measured on 340 lessons — the latest completed version of every lesson in six courses of 45–75
lessons. `repetition-audit.py` reproduces it.

**Between lessons of one course, repetition is negligible.** Share of eight-word sequences that any
two lessons of a course have in common: worst pair in the whole set 4.9%, 95th percentile 0.0–2.7%,
mean 0.0–0.4%. There is no systematic bleed from lesson to lesson.

The worst offender in the worst course turned out not to be content at all: an English fallback
sentence about an unrenderable Mermaid diagram, in 19 lessons of a Russian course — `mc2-zxzgf`, 123
lessons across 12 courses.

**Inside a single lesson, repetition is real.** 18 lessons of 340 (5.3%) contain a duplicated block,
and nine of those repeat 4–13% of their own text verbatim. Every heavy case is a long lesson —
23–47k characters against a median of 9.4k — which points at the section-by-section path duplicating
a section rather than at the model repeating itself. `checkSectionDuplication` blocks only exact
duplicate sections (`similarity === 1`), so near-duplicates pass. `mc2-hpful`.

## Method

Both arms ran from the same lesson specification and the same evidence, against the live 6856-point
collection over a read-only tunnel, with a cold Redis database per arm so neither could answer from
the other's cache. The cap was restored by an uncommitted local switch; `search-options.ts` is
unchanged in the tree.

The Jina accounting delivered earlier the same day priced this run without being asked: 117 query
embeddings ($0.000154) and 20 reranker calls ($0.008630), **8.4% of the run's total** — against the
7.9% measured on the single lesson.
