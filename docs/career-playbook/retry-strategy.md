# Career Playbook Retry And Reliability Strategy

This document is the audited baseline of how Career Playbook generation retries,
degrades, and gives up. It exists so that future speed optimizations (batch or
parallel regeneration, cheaper judge models, env-gated model overrides) can be
measured against a fixed reliability contract instead of silently weakening it.

Every claim below is tied to a `file:line` reference verified against the current
working-tree code as of 2026-07-03, including the instrumentation and A/B tranche
(per-attempt timing, node-cost telemetry fields, and the env-gated phase-model
override) that landed alongside this document.

## Owner Invariant

Reliability comes before speed. A speed change is only acceptable if all of the
following still hold:

- The end-to-end success rate does not drop.
- Criterion #1 — target content language, no unresolved fill-in placeholders, and
  a persisted per-node cost breakdown — keeps passing on a real run.
- Cap-exhaustion warnings do not increase (they mark playbooks that advanced with
  unresolved critical issues).

The two structural reasons this invariant is defensible are load-bearing and must
not be undone by a speed change:

1. **Criterion #1 detection is deterministic and judge-model-independent.** The
   language, placeholder, minimum-item, and Mermaid checks run in-process, are all
   `severity: 'critical'`, and are unioned into `needs_regeneration`
   unconditionally. Swapping the LLM judge for a weaker/cheaper model cannot let a
   wrong-language or placeholder block pass. See
   [Deterministic Criterion-#1 Checks](#deterministic-criterion-1-checks-are-model-independent).
2. **Cost runaways are bounded by hard caps, not by model quality.** Job attempts
   are capped at 1, per-block regeneration at 2, per-judge-window regeneration at
   8, each LLM call at a 300s timeout, and each job at a 120-minute processor TTL.

## Reliability Layer Map

Career Playbook generation absorbs failure at seven nested layers. From outermost
(one BullMQ job) to innermost (one LLM call):

| #   | Layer                            | What it guarantees                                                                                                          | Config / caps                                                                                                                  | Verified location                                                                                                                                                                                                                  |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Job-level attempts cap           | A TTL hard-kill or crash never re-runs the full, non-resumable pipeline                                                     | `attempts = 1` (overrides shared-types default of 3, and any caller override)                                                  | `orchestrator/queue.ts:89` (`CAREER_PLAYBOOK_MAX_ATTEMPTS`), applied in `resolveJobOptions` `queue.ts:101-115`; rationale `queue.ts:77-88` (mc2-1maah); consumed by `isFinalAttempt` `handlers/career-playbook-handler.ts:665-668` |
| 2   | Processor hard TTL               | A stuck/expensive job is terminated at a fixed wall-clock bound                                                             | 120 min default via `CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS`; worker lock = max of both TTL classes                              | `orchestrator/processor-ttl.ts:4` (`DEFAULT_CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS = 7_200_000`), `processor-ttl.ts:18-31`; lock `processor-ttl.ts:63-65` used at `worker.ts:395`                                                    |
| 3   | Soft-budget warning              | Operators get a distinct early signal before the terminal TTL kill                                                          | Fires at 90% of hard TTL (108 min); Career Playbook only, `0` (disabled) for every other job type and for ratios outside (0,1) | `orchestrator/processor-ttl.ts:42` (`DEFAULT_PROCESSOR_SOFT_BUDGET_RATIO = 0.9`), `getProcessorSoftBudgetMs` `processor-ttl.ts:54-61`                                                                                              |
| 4   | Phase-level LLM retries          | Transient provider failures inside a single job attempt are retried                                                         | `attempts = maxRetries + 1` (default `maxRetries = 2` → 3 tries; real value is per-phase from `llm_model_config`)              | `nodes/runtime.ts:150-154`; default `runtime.ts:414`                                                                                                                                                                               |
| 5   | Fallback-model escalation        | A failing/misbehaving primary model is swapped for the configured fallback                                                  | Fallback used when `attempt > 0` OR `preferFallbackModel` is set; fallback pair stays within DeepSeek V4 Flash/Pro             | `nodes/runtime.ts:155-159`                                                                                                                                                                                                         |
| 6   | Per-call timeout + budget growth | No single provider call hangs the pipeline; retried calls get more output room                                              | 300s `Promise.race` timeout; output-token budget ×1.25 on `attempt >= 2`                                                       | timeout `runtime.ts:49` + `withLLMTimeout` `runtime.ts:112-133` applied `runtime.ts:171,176-180`; multiplier `runtime.ts:160`                                                                                                      |
| 6a  | Context-window output guard      | An oversized `prompt + output` request is clamped up front instead of burning retries on provider context-length rejections | Clamps output to fit; warns if the prompt alone (near-)fills the window                                                        | `nodes/runtime.ts:164-169`, `guardOutputAgainstContextWindow` `runtime.ts:288-322`                                                                                                                                                 |
| 7   | Emergency fallback config        | A `llm_model_config` DB read failure degrades to a hardcoded model instead of failing the phase                             | All-emergency config: model `google/gemini-3-flash-preview`, `maxRetries = 2`                                                  | `resolvePhaseConfig` catch `nodes/runtime.ts:420-433`; model `shared/llm/model-config-service.ts:35`                                                                                                                               |

The judge and regeneration sub-system adds three more absorbing layers that are
specific to the block-quality loop:

| #   | Layer                                 | What it guarantees                                                                                               | Config / caps                                                                                                                 | Verified location                                                                                                                                        |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | Structured-judge repair               | A malformed judge response is repaired once (on the fallback model) before the judge is treated as failed        | 1 initial call + up to 1 repair call (temp 0.1, `preferFallbackModel`, ×1.1 tokens)                                           | `nodes/cross-block-judge-structured.ts:85-140`                                                                                                           |
| 9   | Judge degradation to deterministic    | An unrepairable judge failure does not fail the graph; the node returns the deterministic verdict plus a warning | Emits `crossBlockJudge degraded to deterministic checks after LLM structured verdict failed: …`                               | `nodes/cross-block-judge.ts:544-562`                                                                                                                     |
| 10  | Regeneration caps + budget-exhaustion | Non-converging blocks cannot loop forever; the graph advances with warnings instead of failing                   | 2 per block, 8 per judge window; on exhaustion, scoped blocks are stripped from `needs_regeneration` and a warning is emitted | caps `nodes/block-regenerator.ts:16-17`; selection `block-regenerator.ts:247-286`; routing `graph.ts:157-185`; exhaustion `cross-block-judge.ts:376-417` |

## Deterministic Criterion-#1 Checks Are Model-Independent

The cross-block judge combines two verdicts: a set of deterministic, in-process
checks and (optionally) an LLM judge verdict.

The deterministic checks run in `runCareerPlaybookDeterministicChecks`
(`nodes/cross-block-judge.ts:319-350`) and are pure functions with no LLM call —
`language-consistency.ts`, `placeholder-detection.ts`, and `mermaid-quality.ts`
are all deterministic validators. They produce only `severity: 'critical'`
issues:

- Anti-goals minimum 4 items — `validateAntiGoalsMinimum` `cross-block-judge.ts:127-133` (only when `block_2` is present).
- Decision-authority matrix minimum 4 rows — `validateDecisionMatrixMinimum` `cross-block-judge.ts:135-141` (only when `block_5` is present).
- Failure-modes minimum 3 items — `validateFailureModesMinimum` `cross-block-judge.ts:143-149` (only when `block_21` is present).
- Mermaid coverage for dependency/career-path/main-process blocks — `validateMermaidCoverage` `cross-block-judge.ts:155-181`.
- Mermaid parser syntax — `validateCareerPlaybookMermaidSyntax` `cross-block-judge.ts:341`.
- Target-language consistency — `validateBlockLanguageConsistency` `cross-block-judge.ts:183-205`.
- Unresolved fill-in placeholders — `validateFillablePlaceholderResolution` `cross-block-judge.ts:207-229`.

`verdictFromIssues` (`cross-block-judge.ts:247-258`) puts every non-`info` issue
into `needs_regeneration`, so any deterministic critical issue always requests
regeneration.

The merge step is where model-independence is enforced.
`mergeJudgeVerdicts` (`cross-block-judge.ts:357-374`) takes the **unconditional
union** of the deterministic `needs_regeneration` with only those LLM
`needs_regeneration` entries the LLM also marked `critical`. Consequently:

- A weaker or cheaper LLM judge can add findings but cannot remove a deterministic
  critical from `needs_regeneration`.
- The overall `pass` is `deterministic.pass && llm.pass`, so the LLM can only make
  the gate stricter, never looser.

This is the property that makes an env-gated judge-model swap (Flash instead of
Pro) safe for Criterion #1 without a database routing change.

## Failure Modes

Trigger → absorbing layer → user-visible outcome → cost/latency effect.

| Trigger                                                    | Absorbing layer                                                                                                                                                              | User-visible outcome                                                                                                                  | Cost / latency                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Provider timeout (a single call exceeds 300s)              | `withLLMTimeout` rejects → counts as a failed attempt → retried with fallback model (layers 4–6)                                                                             | Transparent if a retry succeeds; if all `maxRetries+1` tries time out, the node throws and the job fails (attempts=1, terminal)       | Up to 3 × 300s per call in the worst case before the node gives up                                               |
| Provider 5xx / 429                                         | `invokeLLM` catch (now logs a per-attempt warning) → next attempt uses fallback model on `attempt > 0` (`runtime.ts:155-159,217-233`)                                        | Transparent if a retry succeeds; otherwise same terminal path as timeout                                                              | Same retry envelope as timeout                                                                                   |
| Malformed structured judge output                          | Structured-judge repair (layer 8) → if repair still unparsable → `StructuredJudgeOutputError` → judge degrades to deterministic verdict (layer 9)                            | Playbook still completes; the deterministic Criterion-#1 gate still applies; a `degraded to deterministic checks` warning is recorded | +1 judge LLM call (the repair); node cost is still captured via `error.nodeCosts` `cross-block-judge.ts:545-547` |
| Regeneration non-convergence (a block keeps failing judge) | Per-block cap 2 / window cap 8 → `capRegenerationWhenBudgetExhausted` strips the scoped blocks from `needs_regeneration` and warns (layer 10)                                | Playbook completes; the block is persisted with its unresolved issues surfaced as `quality_issues` in the private viewer              | Bounded at 8 regenerations + re-judges per window; no further loops                                              |
| Processor TTL kill (120-minute hard limit)                 | Sandboxed processor `process.exit()` → BullMQ failed attempt → attempts=1 is terminal → `persistFailed` on the final attempt (`handlers/career-playbook-handler.ts:652-668`) | Generation is marked failed; no partial retry                                                                                         | Preceded by the soft-budget warning at 108 min (layer 3); the full spend up to the kill is lost                  |
| `llm_model_config` DB read unavailable                     | `resolvePhaseConfig` catch → emergency fallback config (layer 7)                                                                                                             | Generation proceeds on `google/gemini-3-flash-preview` instead of failing the phase                                                   | Runs on the emergency model (potentially lower quality) rather than aborting                                     |

Two nuances worth keeping in mind when changing these paths:

- The anti-goals / decision-matrix / failure-modes minimum checks only run when
  the corresponding block content is present; language, placeholder, and
  Mermaid-syntax checks iterate every present block. So a missing block is not the
  same as a failing block.
- Judge degradation (layer 9) and budget-exhaustion (layer 10) both keep the graph
  moving. They trade completeness for liveness on purpose — the resulting warnings
  are the signal, not an error.

## Worst-Case Latency

The dominant cost is the judge ↔ regenerator loop, not early-phase generation.
For one judge window the worst case is:

```
1 initial judge
+ up to 8 × (1 regeneration + 1 re-judge)   ← window cap = 8
= 17 node executions on the Pro-routed phases
```

per `graph.ts:157-185` (routing) and `block-regenerator.ts:247-286` (selection).
There are 6 group windows plus 1 final-block window.

The 17-execution figure remains a valid upper bound, but batched regeneration now
lowers the typical loop: `selectPendingCareerPlaybookRegenerations`
(`block-regenerator.ts:247-286`) returns every flagged block still within the caps,
and one `blockRegenerator` visit fixes all of them via `Promise.allSettled`
(`block-regenerator.ts:330-344`) before a single re-judge. So the typical loop is
`1 judge + ceil(rounds) × (1 regen visit + 1 re-judge)` with the per-visit LLM
calls parallelized, instead of one regen + one re-judge per flagged block. The
per-block cap (2) and window budget (8) are unchanged, so the 17-execution worst
case still holds when blocks fail one at a time across separate re-judges.

Multiplicative factors on top of the node executions:

- Each **judge** node execution is 1 structured call + optionally 1 repair call =
  up to 2 LLM calls (`cross-block-judge-structured.ts:106,120`).
- Each **regeneration** node execution is 1 LLM call per block in the batch
  (`block-regenerator.ts:185`), issued concurrently within the visit.
- Each LLM call is retried up to `maxRetries + 1` = 3 times by default, each
  attempt bounded by the 300s timeout (`runtime.ts:150-180`).

Reaching the 8-per-window cap requires at least 4 distinct blocks each failing
twice (per-block cap = 2), so the 17-execution ceiling is a true worst case, not a
typical one. The **real terminal bound on any single job is the 120-minute
processor TTL**, with the soft-budget warning at 108 minutes — the multiplicative
call count is what the TTL exists to cut off.

Model routing for the expensive phases is Pro
(`stage_career_playbook_judge`, `stage_career_playbook_regenerator`,
`stage_career_playbook_spec`, `stage_career_playbook_group_5`) via migration
`20260523073000_update_career_playbook_v4_pro_routing.sql`; follow-up and groups
1–4/6 run on Flash.

Baseline observed run (2026-07-03, playbook `6b55ca50`): 73.4 minutes, $0.4963,
65 node costs, Criterion #1 passing. Spec-builder took ~2 minutes; the remaining
~68 minutes were the block-generation and judge↔regenerator loop on Pro.

## Test-Pinned Invariants

These invariants are pinned by existing unit tests so a speed change that breaks
them fails CI:

- **Job attempts cap = 1**, overriding the shared-types default of 3 and any
  caller override — `tests/unit/orchestrator/queue-job-options.test.ts:19-31`.
- **Processor TTL and soft-budget policy**: 120-minute Career Playbook TTL, soft
  warning strictly between 0 and the hard TTL, and `0` (disabled) for every other
  job type — `tests/unit/orchestrator/processor-ttl.test.ts:71-90`.
- **Regeneration caps** (`2` per block, `8` per window) and fewest-attempts-first
  batch selection — `tests/unit/stages/stage-career-playbook/block-regenerator.test.ts`.
- **Deterministic Criterion-#1 checks** (minimum items, Mermaid coverage/syntax,
  language violations, placeholder resolution) and **judge degradation** to the
  deterministic verdict when LLM output is unparsable, plus LLM warnings not
  forcing regeneration — `tests/unit/stages/stage-career-playbook/cross-block-judge.test.ts:58,97,143,401,468,536,584`.
- **Structured-judge repair** happening exactly once before merging — `cross-block-judge.test.ts:324`.
- **Phase retry semantics** (attempt count, fallback-model escalation, exhausting
  all attempts throws the last error) — `tests/unit/stages/stage-career-playbook/runtime.test.ts`.
- **Judge-window routing** (a flagged block routes to `blockRegenerator`, then back
  to the same group judge) — `tests/unit/stages/stage-career-playbook/graph.test.ts`.
- **Pro/Flash phase routing** — `tests/unit/stages/stage-career-playbook/model-routing-migration.test.ts`.

Pins added alongside this change (all closing current behavior so the speed levers
cannot silently change it):

- Per-attempt telemetry: total wall-clock and single-attempt success
  (`runtime.test.ts:366-391`), attempt counting with success/warn logs
  (`runtime.test.ts:395`), and "throws the last error and never exceeds
  `maxRetries+1` invocations when every attempt fails" (`runtime.test.ts:448`).
- Env override: applied for the matching phase only (`runtime.test.ts:480`),
  escalates an overridden phase to its override fallback on validation retries
  (`runtime.test.ts:525`), and ignores a malformed value while warning exactly once
  (`runtime.test.ts:562`).
- Budget exhaustion warns but does not fail: window-budget case
  (`cross-block-judge.test.ts:682`) and per-block-cap case
  (`cross-block-judge.test.ts:717`).
- Batch regeneration: fewest-attempts-first batch selection
  (`block-regenerator.test.ts:211`), trimming the batch to the remaining window
  budget (`block-regenerator.test.ts:234`), recording costs for successes and
  warnings for failures (`block-regenerator.test.ts:256`), and `duration_ms`
  in the node cost (`block-regenerator.test.ts:314`).
- Cost-breakdown durability: `regeneration_attempts`/`duration_ms` survival across
  `appendCareerPlaybookNodeCost`
  (`tests/unit/server/routers/career-playbook-cost-breakdown.test.ts`).

## A/B Measurement Methodology

Speed levers must be measured against the baseline without a database routing
change (the database is shared between dev and staging, so a routing migration
would affect staging too). The measurement mechanism is a set of additive,
optional fields plus an env-gated model override.

**New measurement fields:**

- `duration_ms` and `attempts` on `CareerPlaybookNodeCostSchema`
  (`shared-types/src/career-playbook.ts:783-794`; the new fields are
  `duration_ms` at `:792` and `attempts` at `:793`). Both optional and
  backward-compatible with existing rows, so no migration is required. They are
  filled at the node-cost build sites — `block-regenerator.ts:158-175` and
  `cross-block-judge-structured.ts:36-53`.
- `regeneration_attempts` (a per-block attempt map) on
  `CareerPlaybookCostBreakdownSchema`
  (`shared-types/src/career-playbook.ts:797-803`; the field is at `:802`). The
  worker attaches it in `buildCostBreakdown`
  (`handlers/career-playbook-handler.ts:76-91`) from
  `state.blockRegenerationAttempts` (declared on the result type at
  `career-playbook-handler.ts:55`) and also logs the totals in the completion
  summary (`career-playbook-handler.ts:333-347`). Attempts are the ground truth
  because the regenerator's failure path increments an attempt without emitting a
  node cost.
- `durationMs` (total wall-clock across attempts) and `attemptCount` on
  `CareerPlaybookLLMResult` (`nodes/runtime.ts:28-39`), populated by `invokeLLM`,
  plus a `logger.info` on success (`runtime.ts:192-206`) and a `logger.warn` on
  each failed attempt (`runtime.ts:217-233`) — the previously silent catch, now the
  single most valuable diagnostic line for latency/cost runaways.
- A cost-breakdown fix so that `appendCareerPlaybookNodeCost`
  (`server/routers/career-playbook/cost-breakdown.ts:20-36`) spreads the existing
  parsed breakdown (`:28-35`) instead of rebuilding it, so schema-known extras like
  `regeneration_attempts` survive a manual single-block regeneration.

**Env-gated model override:**

- `CAREER_PLAYBOOK_PHASE_MODEL_OVERRIDES` is parsed by
  `parseCareerPlaybookPhaseModelOverrides` (`nodes/runtime.ts:340-378`) and layered
  over `getModelForPhase` by `applyCareerPlaybookPhaseModelOverride`
  (`runtime.ts:380-390`) inside `resolvePhaseConfig` (`runtime.ts:392-434`, applied
  on both the DB-config path `:408-419` and the emergency-fallback path `:420-433`).
  It is a JSON map from phase name to `{ modelId, fallbackModelId? }`. Invalid JSON
  warns exactly once and is ignored. Default is off, so staging is untouched.
- For the judge A/B on dev, set it to
  `{"stage_career_playbook_judge":{"modelId":"deepseek/deepseek-v4-flash","fallbackModelId":"deepseek/deepseek-v4-pro"}}`.
  Because the judge repair path uses `preferFallbackModel: true`
  (`cross-block-judge-structured.ts:123`), a parse failure automatically escalates
  the repair call back to Pro.

**Dev enablement point:**

- The override value is already declared on the `worker-dev` service
  (`docker-compose.dev.yml:175`) in its environment block
  (`docker-compose.dev.yml:204`), pointing the judge phase at Flash with a Pro
  fallback. This is dev-only; staging and the shared `llm_model_config` database are
  not touched.
- Delivery follows the normal dev deploy path: CI copies the compose file to the
  dev host, and `scripts/deploy_dev.sh` force-recreates `worker-dev`
  (`deploy_dev.sh:248`), which is also included in the pull set when the API image
  changes (`deploy_dev.sh:123`). A `worker-dev` recreate is what actually applies a
  changed override value to the running worker.

**Comparison protocol:**

- Baseline ("before") — the 2026-07-03 run: 73.4 min, $0.4963, 65 node costs,
  Criterion #1 pass.
- "After" — enable the judge override env on the dev worker, run a mutation-smoke
  with the same fixture profile (runbook
  [`live-smoke-dev-run.md`](./live-smoke-dev-run.md)), and compare: wall-clock,
  success, Criterion #1 (language / placeholders / persisted cost breakdown), the
  new `duration_ms` / `regeneration_attempts`, cap-exhaustion warning count, and
  the number of judge vs. regeneration calls.
- Success criterion: wall-clock materially lower, failures no higher, Criterion #1
  passing, and cap-exhaustion warnings not increased. Only then consider a
  database routing promotion of judge → Flash (which knowingly affects staging)
  and a data-driven evaluation of regenerator → Flash.
