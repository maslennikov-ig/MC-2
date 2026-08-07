# Plan — 025 Remaining debt

One active stage at a time, root-owned acceptance, canonical closeout per
`AGENTS.md`. Stage ids are Beads children created at stage start, not now.

## Order and why it is this order

| #   | Stage              | Why here                                                         | Gate to leave                                    |
| --- | ------------------ | ---------------------------------------------------------------- | ------------------------------------------------ |
| 1   | Triage             | Any ranking made before it is guesswork; 89 items, unknown truth | Every item bucketed with evidence                |
| 2   | Data-loss & safety | Only irreversible items on the list                              | Off-host copy restored once; `mc2-q1ggs` decided |
| 3   | Silent failure     | Users are misled today, and the fix is small                     | Reason visible in the UI                         |
| 4   | Content bugs       | Reaches learners, but recoverable                                | Each reproduced, then fixed                      |
| 5   | Vector diagrams    | Feature work; needs research first                               | Research in hand, approach chosen                |
| 6   | Repo health        | Harms nobody today                                               | Gates green                                      |

Stage 6 may be pulled forward if Stage 1 shows `mc2-gbctb` can ship an unbuilt
image — that turns it from hygiene into a deploy hazard.

## Stage 1 — Triage

Not a reading exercise. For each item: open the code path it names, decide
whether the statement is still true, record what was checked.

- Batch by label, because the checks repeat: `pipeline` (17), `ci` (9),
  `formatting` (7), `repo-health` (7), `tech-debt` (7), `career-playbook` (6),
  `stage6` (5).
- Delegation is justified here — the batches are independent, read-mostly, and
  the context does not fit one window. Workers report bucket + evidence and
  change no code.
- Never trust a subagent's verdict without the evidence it cites. That rule is
  in `bd prime` for a reason.
- Deliverable: a triage table in `.codex/stages/<id>/summary.md` and the same
  verdict on each bead.

Expect a meaningful fraction to be already fixed or no longer reproducible.
Also expect the opposite: `format:check` was filed in February and still fails
on 11 files today.

## Stage 2 — Data-loss and safety

`mc2-bygu1` first. 206 MB, 117 files under `/opt/megacampus/data/uploads`;
`file_catalog.storage_path` is a relative filesystem path, not a Storage key.
A copy that has never been restored is a belief, not a backup — restore one
file and check its hash against `file_catalog.hash`.

`mc2-q1ggs` needs an owner decision, not an implementation: separate accounts,
a shared lock, or sudoers narrowing. Present the options with costs; do not
pick one alone.

`mc2-2vtmk` is small and mechanical.

## Stage 3 — Silent failure

Measured: `EmptyConversionError` carries a precise message and
`file_catalog.error_message` renders nowhere in `packages/web`.

Two decisions, both cheap:

- where the reason belongs in the UI, and in what words for a non-technical
  uploader;
- whether a pre-flight at upload can detect "no text layer and OCR finds
  nothing" before the queue, or whether that necessarily costs a conversion.

Ship the message first; the pre-flight is an optimisation and may not be worth
it.

## Stage 4 — Content bugs

Reproduce, fix, re-check with the same check. If one no longer reproduces, it
belongs in Stage 1's "not reproducible" bucket with the evidence, not in a fix.

## Stage 5 — Vector diagrams, gated

1. Hand `research-prompt.md` to the owner, who runs deep research externally.
2. Findings come back into the working context.
3. Choose an approach against them and write the design down before code.
4. Implement behind a flag defaulting to current behaviour.
5. Prove it on the real fixture (`vector-outlines-no-text.pdf` and the four
   production files, which are test-course material and safe to use).

The negative case must keep passing: `vector-outlines-negative` asserts that an
empty conversion still raises. Reading these files must not weaken that.

## Stage 6 — Repo health

Mechanical. Batch by tool, one commit per tool, gates green at the end.

## Verification

Per stage: the smallest exact set that covers what changed. Full suite only at
epic close. Reuse evidence; do not re-run passing gates for freshness.

## What this plan refuses to promise

A number. "89 → N" is not knowable before Stage 1, and any figure quoted now
would be invented. The commitment is that nothing survives unchecked and that
the irreversible items are handled first.
