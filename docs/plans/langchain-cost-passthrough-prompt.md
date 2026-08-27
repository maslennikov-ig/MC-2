# Handoff prompt — LangChain cost passthrough

Target: Claude Code CLI, repo `/home/me/code/mc2`, branch `develop`
Audience: a fresh session with no memory of this work
Runtime: Claude Code CLI in the VS Code terminal on WSL

---

## Goal

Deliver epic `mc2-skwm3` so the LangChain path records what OpenRouter charged
instead of a catalogue estimate that is usually never corrected. Tasks
`mc2-2sv4a` → `mc2-tcs2e` → `mc2-bij20`, wired as dependencies; `bd ready` offers
the next one.

## Context

Read `docs/plans/langchain-cost-passthrough.md` first, then the notes on each
task. They carry the measurements and the two rejected alternatives. Do not
re-derive them, and do not re-open `@langchain/openrouter` without reading why it
was refused.

Short version: `usage.cost` is in every completion body. The OpenAI-SDK path
reads it as of `1b6aefc97`; `@langchain/openai` strips it by design. The fix is
to capture it in the transport wrapper that already reads the body, keyed by the
generation id the cost callback already has.

Four constraints that have each cost this repository money when broken:

- A cost of `0` is a measurement. Check `=== undefined`, never falsy.
- The wrapper must not write to the ledger; the callback stays the only writer.
- The map must be bounded and drop each entry when read. Workers run for weeks.
- A miss leaves today's behaviour intact rather than throwing.

## Output

One commit per task on `develop`, reasoning in the message. Then, in order:

1. `pnpm type-check`, `pnpm build`, full unit suite. Capture output to a file —
   do not judge a run by its last five lines.
2. `pnpm exec eslint` on every touched file.
3. For `mc2-bij20` only: one **paid** micro course on deployed dev via
   `scripts/dev-run-micro-course.ts`. Acceptance is the SQL in the spec. Expect
   `settled = rows` on `stage_6_content`, against a baseline of 0 of 13.

Push after the suite is green and a fetch proves `origin/develop` is not ahead.
Close each task with what was actually verified.

If the spec disagrees with the code, say so and stop rather than working around
it. Two decisions in it were already reversed once, when a live call contradicted
the documentation.
