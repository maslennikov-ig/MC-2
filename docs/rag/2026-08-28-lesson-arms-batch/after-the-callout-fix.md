# The callout fix, measured on ten live lessons

**Date:** 2026-08-28 · **Issue:** `mc2-ctlar` · **Verifies:** `mc2-udj0b`, commit `ebea0dc6f`
**Baseline:** `runs.json` in this directory — 20 runs from earlier the same day, before the fix
**Runs:** 23 new generations, course `8baaa75e`, lessons 3.1-3.5 and 4.1-4.5 · **Cost:** $0.065383
($0.055782 OpenRouter, $0.009601 Jina) · every run recorded in `runs-after.json`

The fix changed two things: the callout budget now scales with the section count and never escalates
to a regeneration, and the prompts stopped naming the callout as the required form of the mandatory
practical example. Only the first half can be tested. This is the live run for the second.

## What was run

Three arms, all through the real `loadStage6EvidenceForCourse` → `retrieveLessonContext` →
`executeStage6` path against the live 6856-point collection over a read-only tunnel, each with its
own cold Redis database so nothing answered from another arm's cache. Retrieval reports `cached:
false` on all 23 runs, 9 or 10 query embeddings and one reranker call per lesson — counted from the
`generation_trace` rows Jina now writes, not from the `queriesExecuted` log field, which reports the
number planned.

| Arm                               | n   | What it isolates                                                   |
| --------------------------------- | --- | ------------------------------------------------------------------ |
| `after-fix`                       | 10  | develop as it stands, at the baseline's 15-minute word budget      |
| `after-fix-structure-duration`    | 10  | the same, at the 5 minutes the stored course structure asks for    |
| `after-fix-rule-only-old-prompts` | 3   | new rule, **pre-fix prompts** restored locally — the prompt's half |

The third arm exists because the first two cannot separate the rule from the prompt. It was run with
`ebea0dc6f^` versions of the three prompt files, uncommitted, and the tree was restored afterwards.

**One comparability note, and it decides which arm is the answer.** The baseline's ten lessons ran at
a 2250-word target, i.e. `estimated_duration_minutes` of 15. The stored `course_structure` says
**5 minutes for every lesson in this course**, and `buildMinimalLessonSpec` passes that through, so a
probe that reads the structure faithfully asks for 750 words and gets a third of the baseline's
lesson. The baseline's probe was deleted by design and cannot be inspected, so this is inferred from
its own numbers. The `after-fix` arm therefore overrides the duration to 15 to match the baseline;
the second arm records what the structure actually asks for.

## 1. review_required: 11 of 20 → 0 of 10

| Per lesson                 | Before (uncapped 10) | Before (all 20) | After (10)  |
| -------------------------- | -------------------- | --------------- | ----------- |
| `needs_review`             | 5 of 10              | 11 of 20        | **0 of 10** |
| Regenerations              | 1.20                 | 1.30            | **0.00**    |
| `callout_density_blocking` | 5                    | 11              | **0**       |
| `callout_density_warning`  | 5                    | 9               | 2           |
| Wall clock                 | 316s                 | 334s            | 107s        |

No lesson went to review, and no flag of any kind appeared other than `callout_density_warning` on
two lessons — 3.1 with seven callouts against a budget of six, and 4.3 with six against five. Both
resolved to `WARN_ONLY`, both kept their content, and both scored 0.92 and 0.88. That is the designed
behaviour: the filter advises and never regenerates. `callout_density_blocking` does not exist in the
source any more; the only occurrences left in the repository are this directory's baseline and one
test that asserts the flag is absent.

The two `content_truncation_blocking` flags the baseline carried did not recur.

## 2. Callouts did not fall — the prompt raised them, and that is fine

This is the part the fix predicted wrongly, and the run says so.

| Same three lessons (3.3, 3.4, 3.5) | callouts per lesson |
| ---------------------------------- | ------------------- |
| Before: old prompt, old rule       | 3.67                |
| **New rule, old prompts restored** | **3.00**            |
| **New rule, new prompts**          | **5.00**            |

Across all ten, the mean went from 4.70 before to **5.30** after, inside a budget of six. The reason
is in the wording. The old prompt said "Use max 1-2 callouts per lesson", which the model ignored
while obeying the "visual element per section" line four lines below it. The new prompt says "About
one per section is plenty" — a licence, not a cap — and the model now aims at it. The trigger was not
removed; it was renamed to the number the budget allows.

Nothing here argues for changing the wording back. The old prompt produced a lesson the old rule
failed 100% of the time; the new pair produces lessons that pass. But the fix's stated expectation —
"the mean should fall slightly" — is not what happened, and the reason it is not visible in the
`needs_review` numbers is that the rule, not the prompt, is doing all the work.

**Two of the three prompt edits reached the model; one did not.** `single-call-generator.ts` renders
on every lesson, and `serial-generator.ts` renders on section regeneration, which fired on 4 of the
10 lessons. `src/shared/prompts/stage6/expander.ts` renders nowhere: no call site passes `stage6_expander`
to `renderPrompt`, and the live Section-Expander builds its own prompt in
`judge/section-expander/expander-prompt.ts`, which never mentions callouts. It is already recorded as
deprecated in `docs/reports/code-review-callout-fix.md`. The edit is harmless and unread.

## 3. Quality: the damage disappeared, the text did not improve

| Judge quality              | Before | After     |
| -------------------------- | ------ | --------- |
| All ten                    | 0.830  | **0.897** |
| The five that were blocked | 0.759  | **0.894** |
| The five that were not     | 0.902  | 0.906     |

Read the second and third rows, not the first. The lessons that used to be regenerated twice and
land in review recovered by 0.135; the lessons that were left alone are unchanged within noise. This
is the removal of the regeneration's damage, exactly as `mc2-udj0b` said, and not evidence that the
prompt writes better text.

Retrieval was effectively identical between the runs — the same distinct-document count on nine of
ten lessons (3.1 drew 3 documents instead of 4) — so none of this is a retrieval effect.

## 4. Money: 4.8 billed calls a lesson, and 39% cheaper

| Per lesson               | Before    | After         |
| ------------------------ | --------- | ------------- |
| Billed OpenRouter calls  | 5.0       | **4.8**       |
| Cost                     | $0.005257 | **$0.003198** |
| Jina share of the lesson | 8.4%      | 12.6%         |

The call count barely moved and the bill fell by 39%, because the calls that disappeared were the
expensive ones. What a clean lesson costs today, counted over the ten:

```
stage_6_{simple,normal,complex}/llm_call   10   the generator, one per lesson
stage_6_judge/llm_call                     10
stage_6_refinement/llm_call                10
stage_6_section_expander/llm_call          11
stage_6_delta_judge/llm_call                7
                                           48   = 4.8 per lesson
```

So the expectation of "about 2 for a clean lesson" was wrong about the composition: judge, targeted
refinement, section expansion and the delta judge fire on ordinary lessons that never needed review.
The regenerations were the second full generator call, and those are gone.

Jina: 96 query embeddings and 10 reranker calls, $0.004034 over the arm, no unpriced billed rows.

## 5. Read by eye: the practical example survived, in prose

`after-3.2.md` and `after-4.1.md` are kept beside this file, read in full, and compared against the
pre-fix generation of the same lesson 3.2 in `../2026-08-28-lesson-arms/arm-a-uncapped.md`.

**The mandatory practical example did not vanish. It changed form.** 3.2 carries a worked two-bid
comparison in prose (`1 100 000 × 0,85 = 935 000`), a three-bid ranking table, an auction example in
millions, the ×0.85 threshold derived correctly as ~17.65%, two Mermaid diagrams that parse, and two
exercises with model answers. 4.1 carries two hypothetical calculations, four tables, two diagrams
and two exercises whose arithmetic checks out (900 − 100 = 800, 180/800 = 22.5%, 140/800 = 17.5%).
Nothing in either lesson is an unfilled slot where a callout used to be.

The callouts that remain are advisory TIP and WARNING notes — and so were the pre-fix lesson's five.
The `[!INFO] Example:` box the expander and serial prompts used to demand never appeared in this path
even before the fix, which is consistent with §2: the callout pressure came from the single-call
prompt, not from the example requirement.

**One defect found by reading, unrelated to this fix.** In `after-3.2.md`, exercise 1's model answer
computes the three comparison prices correctly (765 000, 858 500, 800 000) and then ranks them
wrongly, putting 858 500 ahead of 800 000 and closing with the meaningless "№ 1 (800 000 — вне
очередности между ними)". The winner it names is right; the order it lists is not. A generated-content
arithmetic slip, in the exercise block, which no filter checks. `mc2-hoke7`, with the frequency
unmeasured — two lessons of ten were read, and one carried it.

## 6. One number that moved and is not explained by the fix

The lesson got shorter at the same word target: 2718 words before, **1840** after, against a target of
2250 in both. The third arm rules the prompt out — with the pre-fix prompts restored the same three
lessons came out at 1653 words against 1769 with the new ones, both far below the baseline's 2404 for
those three.

So something between the baseline run and now changed the length, and it is not the callout fix. The
only stage 6 commit in between is `ebea0dc6f` itself. The likeliest remaining explanation is the
baseline probe's own construction — it was deleted by design, so what it passed to `executeStage6`
(analysis result, style, duration) cannot be read back.

**The owner's ruling, same day: length is not the criterion, the meaning surviving is.** A shorter
lesson that keeps its worked examples, its exercises and its reasoning is not a regression, so this
is recorded as a measurement and nothing is tracked against it. `mc2-c7ire` was opened and closed on
that ruling. What §5 checked — that the mandatory practical example survived the prompt edit rather
than vanishing — is the test that matters, and both lessons read in full pass it.

## Method

Course `8baaa75e-bb85-496e-81df-807e770fd73d`, sections 3 and 4. Specs built with
`buildMinimalLessonSpec` from `courses.course_structure`; evidence through
`loadStage6EvidenceForCourse` (this course has no accepted evidence run, so `evidenceContext` is
undefined in every run, as in the baseline); retrieval against `course_embeddings` → 6856-point
`course_embeddings_v1` over `ssh -N -L 16335:127.0.0.1:6335 megacampus-prod` with the read-only key;
a cold Redis database per arm (11, 12, 13, 15). The probe was written for this run and deleted after
it, as the baseline's was; `runs-after.json` holds every field it recorded.
