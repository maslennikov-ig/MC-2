Target: Claude Code CLI, repo /home/me/code/mc2, branch develop.
Audience: engineering agent starting cold, Opus 5.
Runtime: WSL + VS Code terminal; dev and staging both on ssh megacampus-prod.

Goal: run ten lessons on dev and say whether the callout fix did what it was
predicted to do — then close mc2-ctlar. Run `bd show mc2-ctlar` first; it carries
the baseline numbers, the traps and what to check, and bd is the source of truth,
not this text.

Context: on 2026-08-28 a gate was found that blocked 100% of lesson output. It
capped callouts (`> [!TIP]`, `> [!WARNING]`) at two per lesson and forced a full
regeneration at five. Measured over 20 generations: callouts ran 3 to 8, mean 4.8,
0 of 20 lessons met the cap, 11 were regenerated twice and came back over it again,
all 11 landed in review_required, and they scored 0.778 against 0.907 for the rest.
Two changes shipped (mc2-udj0b, commit ebea0dc6f): the budget now scales with the
section count and never escalates to a regeneration, and the prompts stopped
demanding the callout form for the mandatory practical example — one prompt had
said "max 1-2 callouts per lesson" four lines above "each content section SHOULD
include at least one visual element (diagram, table, callout, ...)".

The prompt half cannot be checked by a unit test. That is what this run is for.

The baseline is already recorded and must not be recomputed:
docs/rag/2026-08-28-lesson-arms-batch/runs.json — 20 runs, course
8baaa75e-bb85-496e-81df-807e770fd73d, lessons 3.1-3.5 and 4.1-4.5, with retrieval
shape, quality, flags, qa_signals and review state per run. Cost then: $0.105135
for 20, of which Jina $0.008784.

Run the same ten lessons once each, about $0.05. No second arm — the retrieval
question closed in mc2-d0e2n. Compare against the baseline and report, in order:
review_required (was 11 of 20; if any remain, name the flag, and it must not be
callout_density_blocking, which no longer exists in the code); callouts per lesson
against the budget; quality; regenerations and billed calls per lesson (was 5.0,
a clean lesson needs 2). Then read at least two lessons by eye against the same
two in runs.json — the real risk of the prompt change is that the mandatory
practical example vanished rather than changed form, and no test sees that.

Traps, all already paid for. The dev workers point at qdrant-dev with 12 points;
the 6856-point corpus is on 6335, read-only over
`ssh -N -L 16335:127.0.0.1:6335 megacampus-prod` with the key at
/opt/megacampus/secrets/qdrant_read_only_api_key (needs sudo). `localhost:6333` on
a workstation is a different project's Qdrant. Use a fresh Redis database or the
reranker and the embeddings answer from cache and report no tokens.
`[Lesson RAG] Retrieval complete` logs `queriesExecuted: queries.length`, which is
the number planned, not issued. lint-staged rewrites files at commit time, so
re-run text-asserting tests after committing. The probe script is not committed:
write one, delete it after, and keep `git diff` clean.

Authority: standing owner authorization covers paid runs under USD 5, commits,
push to develop and dev deploys on a green pipeline — act and report, do not ask.
The callout budget and the prompts are settled: a defect this run reveals is a
finding to report, not a knob to turn in the same pass. Dev only; no production
mutation and no migration.

Output: pnpm type-check and pnpm build for code changes, one risk-selected
pnpm test, vitest.config.unit.ts for focused runs because the default backend
command is fail-closed and needs Qdrant 1.18.2, eslint on touched files. Put the
before/after comparison in docs/rag/2026-08-28-lesson-arms-batch/ and one line in
.codex/handoff.md. Deliver through /push-dev after
scripts/orchestration/check_stranded_commits.py.

Stop and ask if the ten lessons cannot be generated under USD 5, or if reading the
lessons argues for changing the budget or the prompts again rather than recording
what they did.
