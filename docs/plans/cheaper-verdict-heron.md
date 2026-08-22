# Plan: making the cost changes of 2026-08-22 true, not merely calculated

**Status.** Written 2026-08-22, after the changes it verifies were shipped and deployed
(`27d4453da` on dev). Nothing here has been run.

**Why it exists.** Everything cut on 2026-08-22 was cut against a price list, on one
measured token shape. Not one figure has met an invoice. The repository already knows what
that is worth: three times this month a paid run found a defect no test had, and twice a
number that looked settled was out by a factor. This plan is the acceptance for that day's
work, and the decision procedure for the one change deliberately left undone.

## What was changed and is unverified

|                                                 | before    | after (estimated) |
| ----------------------------------------------- | --------- | ----------------- |
| judging, per lesson past the heuristics         | $0.01173  | $0.00140          |
| lessons sent to a full panel                    | 45.5%     | ~24%              |
| judge calls for a lesson that reaches the panel | 3–4       | 2–3               |
| card image                                      | $0.045076 | ~$0.0086          |

Four separate mechanisms produced that, and a run can tell them apart:

1. **The judge seats were reshuffled by price** (`mc2-d1d09`). `executeSingleJudge` takes
   `judgeModels.secondary`, so that seat is the most frequent judge call in the pipeline —
   every lesson past the heuristics — and it held `z-ai/glm-5.2` at $0.966/M under a
   comment reading "cheapest". Now: primary `gpt-5.6-luna`, secondary
   `deepseek-v4-flash-0731`, tiebreaker `glm-5.2` (fallback `minimax-m3`). Three vendors,
   every fallback still crossing one.
2. **The acceptance threshold moved from 0.80 to 0.75** (`mc2-r31fw`), off a measured
   distribution rather than a round number: 1302 stored verdicts run 0.520–0.930 with a
   median of 0.820, so 0.80 sat on the steepest point of the curve.
3. **The two judge prompts became one.** They had drifted, and only the panel's asked
   whether exercises belong to the lesson, whether stray CJK reached the prose, and
   whether the lesson is far shorter than its stated duration. The cheap gate that settles
   most lessons alone was asking _less_ than the panel behind it.
4. **A lesson reaching the panel is no longer judged twice.** The single verdict _is_ the
   secondary vote and is counted, not re-cast. This is only legitimate because of (3).

Plus, on the image path (`mc2-xbqz8`): cards moved to `POST /api/v1/images` at
`quality: medium`, which is the only endpoint carrying that control.

## The run

Follow `docs/runbooks/cost-ledger-paid-run.md`. Drive it from code — the owner does not
click through the UI, and the runbook's "Nobody drives the UI" section has the exact tRPC
sequence. Expect $0.15–0.20.

**Compare against a real baseline, not against intuition.** Course
`1db21afb-0312-4388-ae69-2b7777c2fdf9` was generated on 2026-08-22 on `7c80e479c`, micro /
ru / automatic / no files, entirely on the old configuration:

- window total $0.202480, reconciled to the `/credits` delta to the sixth decimal;
- Stage 6 $0.052570, of which judging $0.031376 — three `glm-5.2` calls for three lessons;
- card image $0.045076;
- single-judge scores 0.92, 0.93, 0.93.

Repeat it with the same settings and put the two side by side.

### What this run can and cannot show

It **can** show the model change and the image change: those apply to every lesson.

It **cannot** show the threshold change. All three baseline lessons scored 0.92–0.93 —
above both the old and the new threshold — so they would have been settled by one judge
either way. A course whose lessons land in 0.75–0.80 cannot be ordered on demand. The
threshold's effect is read from accumulated `enrichedOutput.singleJudge.score` across
several courses, not from one run. Say so in the report rather than claiming a saving the
run did not demonstrate.

## Acceptance

Answer each line with a number, and name what failed.

- The reconciliation still closes: report TOTAL against the `/api/v1/credits` delta for the
  same window, and — when they disagree — the third figure, summed from
  `GET /api/v1/generation` over every recorded generation id.
- `billed calls with NO price` is 0; `priced by the provider` is close to the number of
  billed calls (25 of 25 on the baseline).
- The single judge ran on **deepseek**, not `glm-5.2`. The log line is
  `Single judge verdict accepted with high confidence`; the model is on the trace row.
- If any lesson reached the panel: how many judge calls did it cost? Two means the reuse
  works; three means the single verdict was re-cast and (4) is not doing its job.
- The card image is ~$0.0086 with `quality: medium` on the request, and its trace row
  carries `output_data.billedByProvider`.
- Stage 6 total against the baseline's $0.052570, and the whole window against $0.202480.
- `mc2-f1tqd`: did `Cannot read properties of undefined` recur on `sail-research/fp4`?
  Five attempts died that way on the baseline run, at no cost but ~85s.

## The decision this unblocks

`mc2-tux1y` — 30 configuration rows where DeepSeek runs nowhere on that phase: the lesson
body, the course structure, Stage 4 expert analysis, the playbook's authoring phases. Those
are the product's writing. They were left alone deliberately: an `UPDATE` there changes what
customers read, with no evidence behind it.

The comparison is the same course, twice, one variable. What to compare — in this order:

1. **Judge scores per lesson.** Already written to
   `generation_trace.output_data.enrichedOutput`; no new instrumentation needed.
2. **How many lessons needed regenerating.** A cheaper model that triggers more
   regeneration is not cheaper.
3. **An editorial read of the finished course.** The repository's own rule, from
   `mc2-db696.110`: read the artifact before calling a run accepted. A score is not a
   substitute for reading what a customer would read.

`mc2-oofx5` rides along: `stage_6_simple` now leads with DeepSeek at both tiers, so the
tiers differ again — but "measure quality on simple lessons", the second half of that task,
is answered by this same comparison.

The four chat phases (`chat_full_regeneration`, `chat_global_guidance`,
`chat_node_refinement`, `chat_stage_5_refinement`) can be decided earlier and more cheaply:
a person is reading the answer as it arrives, `chat_stage_6_refinement` and
`chat_intent_classification` already run on DeepSeek, and a bad answer costs one retry
rather than a course.

## Traps this repository has already paid for

- **A green pipeline is not a deploy.** Check the `Deploy to Dev` job's own conclusion and
  the container's `APP_VERSION`, not the run's overall status.
- **Do not upload a document** unless the run is about documents: evidence extraction keeps
  its own cost ledger (`mc2-b7olk.4`) and puts a knowingly unattributable delta into the
  window.
- **A generation record takes ~9.6 s** to become readable, and for a call still running,
  never. One early read returns nothing and looks like a working feature.
- **The database wins over `config-seed.json` at runtime.** Edit `llm_model_config` first,
  then `pnpm generate:config-seed`, which reads the database and rewrites the seed.
- **`lint-staged` rewrites files at commit time.** Re-run any text-asserting test after
  committing and before pushing.
- **Run the guard suites that match what you touched.** A spend-path change needs
  `tests/unit/shared/metrics`, not just the obvious directory. That mistake reached CI on
  2026-08-22.

## Out of scope

Routing to a `~…-latest` alias — decided against by the owner on 2026-08-22 (`mc2-hjj8a`).
The resolution code stays, so an alias is no longer _unsafe_, but nothing routes to one.
Stage 7 audio stays on its own OpenAI account and outside every OpenRouter reconciliation
(`mc2-dgw4u`). The 12 `course_override` rows on two courses are somebody's choice for those
courses and are not swept.
