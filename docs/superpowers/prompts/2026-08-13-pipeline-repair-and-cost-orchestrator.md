# Finish the pipeline repair and the cost work, then prove it with a live course

Validated start prompt for a fresh Claude Code session (Opus 5). Checked with
`orch-prompts prompt-check --kind handoff --runtime claude --profile opus-5` — **pass**, one warning
on length (2563 chars against a 1500 target). Nothing left to cut: what remains is the cause of each
blocker, the three traps this repository has already sprung, the spend ceiling and the cleanup duty.

Companion documents: `docs/plans/humble-floating-widget.md` (work order, owner decisions, exact
reproduction of the 2026-08-13 run) and `.codex/handoff.md` (current state). Epics: `mc2-qrdkt`,
`mc2-4clyr`.

## Prompt

```text
Target: Claude Code CLI, repo /home/me/code/mc2, branch develop.
Audience: engineering agent starting cold.
Runtime: WSL + VS Code terminal; dev and prod both on `ssh megacampus-prod`.

Goal: finish epics `mc2-qrdkt` (make the pipeline survive a course) and `mc2-4clyr` (stop overpaying
for it), then prove both with one live run, Stage 1 to Stage 6. Run `bd show mc2-qrdkt mc2-4clyr`;
bd is the source of truth, not this text. Work order, owner decisions and an exact reproduction of
the last run are in `docs/plans/humble-floating-widget.md` — read it before touching anything.

Context: on 2026-08-13 the first live run since June reached Stage 4 and stopped. Two blockers, both
with the fix already chosen by the owner. `mc2-ufpko`: a course carrying document evidence cannot be
deleted at all, because one immutability trigger lacks the `pg_trigger_depth() > 1` cascade exemption
its four siblings have; fix by migration, approved for this task only. `mc2-fqbrj`: a course sticks
in `stage_4_clarifying` forever, because `input_fingerprint` is built partly from an LLM output, so a
retry never reuses the accepted evidence run and the answer stays keyed to the old one; fix both
ends. Then `mc2-s2x84`, `mc2-o7740`, `mc2-43c75`.

Cost, over 118M traced tokens: Stage 6 is ~90% of spend, judging a lesson costs more than writing it,
and the cascade sends 80% of lessons to the full judge panel against its own target of 15-20%.

Three traps this repo has already sprung: a test that pinned the broken shape let a blocker into
production, so every fix must fail its test against the defect and you must say you checked; a red
CI gate silently skips all deploys and `gh run watch --exit-status` returned 0 on a failed run, so
confirm the run `conclusion` and that dev serves the new revision; the OpenRouter key is shared with
production, so hold the run under USD 5 and stop rather than finish if credit runs low.

Delete every course, document, vector and file the run creates. After `mc2-ufpko` that is one product
call, and it is that task's acceptance; a leftover is waiting for it, course
`08912e3b-4010-4719-89c8-e9c8e19d133e`, marked `[ТЕСТ mc2-2pplo, удалить]`. Migrations beyond
`mc2-ufpko`, reindex, secrets, access and production deploys stay out of bounds. Deliver via
`/push-dev`; before claiming delivery run `scripts/orchestration/check_stranded_commits.py`.

Output: what broke, what it cost from the database this time (that is the acceptance for
`mc2-o7740`), the quality of the lessons read rather than scored, and what you could not verify.
```

## What the receiving session inherits

Delivered to `develop` and running on dev on 2026-08-13: `3351378c5` (an LLM call is bounded by an
explicit `AbortSignal`, a short document is no longer chunked twice, course cleanup deletes the files
the upload wrote), `78b529e73` (the `nanoid` override held the tree on the version an advisory named,
which reddened the security gate and skipped every deploy), `8a7dfc1c7` (fonts ship in
`packages/web/app/fonts`, so the build no longer fetches them from Google), `532f00cad` (entrance
animations settle instead of springing back), plus the plan and handoff.

Open and untouched by these epics: `mc2-hb8mn`, `mc2-s1vg5`, `mc2-9yrgb`, `mc2-p6u8k` from the phase
config audit. Read `mc2-9yrgb` before calling any phase dead — a phase in this repository has twice
been declared dead while live.
