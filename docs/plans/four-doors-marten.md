# Plan: four independent tracks, and the order that keeps them independent

**Status.** Written 2026-08-22. Nothing here has been run. Supersedes nothing;
`docs/plans/cheaper-verdict-heron.md` is track A below and stays authoritative for its own
detail.

**Why it exists.** Six owner answers on 2026-08-22 turned one queued paid run into four
tracks. They share almost nothing, which is the useful part: each can be finished and
delivered without waiting on the others, and the only real sequencing constraint is inside
track C.

## A. Prove the Stage 6 cost cuts — `mc2-bxmje`, then `mc2-tux1y`

Unchanged; `docs/plans/cheaper-verdict-heron.md` holds the numbers, the baseline course, the
acceptance list and the caveat about what one run cannot show. Start here: everything cut on
2026-08-22 is still an estimate against a price list, and estimates rot.

**Test language is ru** — owner, 2026-08-22 — which is what the baseline course already used.

## B. Document-evidence money reaches the course total — `mc2-b7olk.4`

**Decided:** it belongs in the course total, as a `generation_trace` row like any other paid
call. The document-evidence coverage registry becomes analytics. The ticket's other option —
teaching the course total to read both tables — is the more expensive one and splits the
truth across two sources, against the rule the whole ledger stands on: one paid call, one
priced row, priced by the provider.

The work is not the row, it is the plumbing: `stage4-analysis/evidence/card-generator.ts`
(three calls) and `evidence/conflict-detector.ts` call the LLM with no `costContext`, and
the ports are built with a model id and have no `courseId` in their signature at all. It
threads through `StructuredEvidencePort`.

Guard: `tests/unit/shared/metrics/no-anonymous-spend` fails if any of the four is left
anonymous. **Acceptance is live, not unit** — a run _with an uploaded document_ whose window
reconciles against the `/api/v1/credits` delta. That is the run the current runbook forbids
("do not upload a document"), and closing this lifts that caveat; update
`docs/runbooks/cost-ledger-paid-run.md` when it does.

## C. NotebookLM — `mc2-rmbwo`, `mc2-p99f1`, then `mc2-6ye5z.4/.5/.8`

This is the one track with a real order, and skipping it means doing the work twice.

**C1. See what changed.** We run `notebooklm-py` **0.6.0**; **0.8.1** shipped 2026-08-14 —
five releases (0.7.1, 0.7.2, 0.7.3, 0.8.0, 0.8.1). The integration automates somebody else's
web interface through an unofficial library, so read the changelog before upgrading, check
the Google cookies are alive (`notebooklm login` → `NOTEBOOKLM_AUTH_JSON`), take a baseline
of `nlm_audio` and `nlm_video` on 0.6.0, upgrade, run the same two, compare.

**C2. Connect what is already built** (`mc2-p99f1`). Four enrichments —
`nlm_study_guide`, `nlm_flashcards`, `nlm_mind_map`, `nlm_infographic` — exist end to end:
the `enrichment_type` enum in the live database carries all four, the bridge implements
them, all four handlers exist, `enrichment-router.ts:125-128` routes them, and the web
already knows all six nlm types. `ON_DEMAND_ENRICHMENT_TYPES` names five and omits them.

**No migration, almost no new code.** But find the _real_ gate before changing anything:
that array has no consumer inside the platform beyond a re-export, so the block may be in
tRPC input validation or in whatever the UI renders its menu from. Fixing the wrong list
and declaring victory is the failure mode here.

**C3. The three that genuinely need a migration** — `nlm_slide_deck` (`mc2-6ye5z.4`),
`nlm_report` (`mc2-6ye5z.5`), `nlm_data_table` (`mc2-6ye5z.8`). One `ALTER TYPE … ADD VALUE`
covers all three. Approved by the owner 2026-08-22, conditionally: necessary, useful and
current — and the library does support all three today.

Two things to check before writing it: `ALTER TYPE … ADD VALUE` and transactions do not
mix on older PostgreSQL and the push wraps migrations in one, so confirm against the live
server version; and dev and staging **share one database** while CI does not auto-apply
migrations, so applying it hits both at once.

## D. Measure what the RAG gate is costing in quality — `mc2-wxun`, then `mc2-vjbb`

**Authorized 2026-08-22.** Set `RAG_SHADOW_RETRIEVAL_RATE=0.05` in `/opt/megacampus/.env`
and restart the Stage 6 worker. The parser fails closed: absent or non-numeric means 0.

**Production, not dev** — dev has almost no lessons, so the cohort would measure nothing.
The tickets say the same: the production experiment is a separate live action.

What it buys: Tier 1 is a two-query gate at threshold **0.15**; when it finds nothing the
pipeline skips full retrieval, saving ~75% of reranker calls. If it is wrong, the lesson is
written **without the user's documents**, silently, and nobody has ever measured how often.
The shadow run re-runs the skipped Tier 2 for the sampled cohort and records what it _would_
have found — `falsePositive: tier2ChunksFound > 0` — without touching generation. Cost is
Qdrant and Jina, not OpenRouter.

Then `mc2-vjbb` reads the distribution and calibrates 0.15. This is the same shape as the
judge threshold on 2026-08-22: a round number nobody had measured, which turned out to sit
on the median.

Start at 0.05 and only raise it once rows are actually landing.

## Also ready, not blocked by any of the above

- `mc2-r7udy` — **needs no migration**, checked: `system_metrics` carries no CHECK at all,
  so a `worker_start` row with the build sha in `metadata` needs no schema change. (By
  contrast `generation_trace` _does_ have one, pinning `stage` to eight values — which is why
  this was worth checking rather than assuming.) Half the ticket was overtaken when every log
  line gained its build sha; what is left is the row and an admin query.
- `mc2-f1tqd` — an empty provider response crashes the parse instead of naming itself.
- `mc2-bnm62` — `stage_7_card` / `stage_7_cover` rows in `llm_model_config` are read by
  nothing; the models come from constants and the values merely happen to agree.

## Still waiting on the owner

`mc2-v6fqp` needs **which third language**. The answer "ru and en" is read as the test
language for everything else — that is what the paid runs already use — because this task's
own acceptance requires a non-ru/en path, and a matrix containing only the two languages
already proven in daily use answers nothing. One micro course, $0.05–0.10: the decision is
about which language to promise, not about money.

## Traps this repository has already paid for

- A green pipeline is not a deploy: check the `Deploy to Dev` job's own conclusion and the
  container's `APP_VERSION`.
- The database wins over `config-seed.json` at runtime: edit `llm_model_config` first, then
  `pnpm generate:config-seed`.
- `lint-staged` rewrites files at commit time; re-run text-asserting tests before pushing.
- Run the guard suite that matches what you touched — a spend-path change needs
  `tests/unit/shared/metrics`, which is how CI caught what a narrower local run did not.
- `.codex/handoff.md` is current-state only and capped at 308 lines by
  `run_process_verification.sh`. Durable findings belong in
  `.codex/repository-failure-modes.md`.
