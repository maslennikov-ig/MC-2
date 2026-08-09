# Remaining debt: triage the backlog, close what is real, name what is not

Status: proposed · Author: root orchestrator · Date: 2026-08-07
Tracker: Beads. Delivery: `develop` per `AGENTS.md`.

## 1. Outcome

The open backlog is 89 items and nobody can currently say which of them are
true. This work ends with a backlog whose every remaining item is known to be
real, sized, and ordered by consequence — and with the highest-consequence
items actually fixed rather than merely ranked.

The measure of success is NOT "89 → 0". It is: no item survives that has not
been checked against the code, and no risk of losing data or misleading a user
survives at all.

## 2. Evidence behind the scope

Counted from `bd` on 2026-08-07: 89 open/in-progress items — 13 P1, 39 P2,
26 P3, 11 P4; by type 23 bugs, 35 tasks, 20 chores, 7 features, 4 epics.

Ten of the thirteen "P1" entries are not work: `mc2-6yg`, `mc2-w7r`,
`mc2-vf0`, `mc2-mgb`, `mc2-wm8`, `mc2-4ul`, `mc2-0e0`, `mc2-g06`, `mc2-w50`,
`mc2-yp5` are `REF:` documentation records kept as issues. Four more are
feature epics (`mc2-db696`, `mc2-uv7n7`, `mc2-6ye5z`, `mc2-jz6y0`), which are
roadmap, not debt. The real P1 debt is a much shorter list.

**Backlog age is a known hazard here, not a hypothesis.** `mc2-jsamu` was filed
2026-02-18 and last touched 2026-07-13; `pnpm format:check` still fails on 11
files today, so that one is real. Others may not be. On 2026-07-27 an audit
found three finished, reviewed, closed changes stranded for weeks. Neither
"open" nor "closed" is evidence by itself.

**This specification does not claim to have audited all 89.** Stage 1 exists
precisely because that audit has not been done. Any ranking produced before it
would be guesswork dressed as a plan.

## 3. In scope

### Stage 1 — Triage (blocking, do first)

Every open item is checked against the repository and, where cheap, against
production, and lands in exactly one bucket:

- **already fixed** — close with the commit or measurement that fixed it;
- **not reproducible** — close with what was checked and how;
- **real** — keep, restate in one sentence, size S/M/L, tag the risk it carries;
- **not ours** — upstream-blocked or owner-deferred; record the exact condition
  that would reopen it;
- **duplicate** — merge, keeping the one with the better evidence.

`REF:` records are excluded from triage and from all counts; they are
documentation and must stop appearing in `bd ready`. Deciding how (a label, a
type, or moving them out of the tracker) is part of this stage.

### Stage 2 — Data-loss and safety first

These come before anything cosmetic, in this order:

1. `mc2-bygu1` — uploaded sources exist only on `megacampus-prod`: 206 MB, 117
   files, no second copy. Vectors and courses rebuild only from these; six
   documents already lost their sources. Smallest item on the list, largest
   consequence.
2. `mc2-q1ggs` — two processes hold `claude-deploy` on the production host with
   no shared lock. On 2026-08-07 one restarted docker and rebooted the host
   mid-deploy. This time it cost a deploy; the same collision during a
   migration would not be recoverable by waiting.
3. `mc2-2vtmk` — the host's `claude-deploy` GHCR token is dead; only the root
   token pulls. A credential that works only by accident is a deploy that fails
   at the worst moment.

### Stage 3 — Silent failure told to nobody

Measured 2026-08-07: `EmptyConversionError` names the true cause of an
unreadable document precisely, and **`file_catalog.error_message` is rendered
nowhere in `packages/web`** — grep returns nothing outside API-route logging.
The uploader is told only that processing failed.

Detection also happens after the full conversion attempt rather than at upload,
so the user waits through the whole pipeline to learn nothing.

In scope: surface the reason to the uploader in language they can act on, and
decide whether a cheap pre-flight at upload can say it sooner.

Out of scope here: actually reading such files — see Stage 5.

### Stage 4 — Content-quality bugs that reach the learner

`mc2-3ybyc` (PRO TIP callout regex), `mc2-raw1i` (`section_count=0` validation),
`mc2-dvymw` (`checkHeaderLanguage` never wired into the filter orchestrator),
`mc2-dqbw1` (Lesson Inspector does not load lesson content), `mc2-1ugj1` (media
UX stability). Each is P1 and each changes what a user sees. Confirm each still
reproduces before fixing.

### Stage 5 — Unreadable vector diagrams, gated on research

`mc2-3gz2m`. The four affected files are sales scripts drawn as flowcharts —
one page, 4296 pt tall, type converted to curves, zero text layer. OCR returns
nothing even at 3× with full-page OCR forced: a 150 cm page is pathological for
a detector that downscales its input.

This is feature work with a real design space (tiling before OCR, per-region
rasterisation at high DPI, a vision model, or refusing the class outright with
a good message). **It must not start from a guess.** A deep-research pass runs
first and its findings gate the approach; the research prompt is
`research-prompt.md` in this directory.

The four current files are test-course material and are themselves disposable.
The class of file is not: flowcharts and mind maps are ordinary training
material and will arrive again.

### Stage 6 — Repo health

`mc2-jsamu` and its children (`format:check` fails on 11 files), `mc2-5dzld`
(stale `tsbuildinfo`), `mc2-zsoih` (lint-staged type-aware mismatch),
`mc2-c2p8z` (hand-maintained colour env files drift), `mc2-gbctb` (a deploy can
proceed with a stale image after a CI gate failure). Last, because none of them
harms a user today — but `mc2-gbctb` moves to Stage 2 if triage shows it can
ship an unbuilt image.

## 4. Explicit non-goals

- Reindexing or otherwise touching existing documents. The Qdrant collection is
  mixed by design; making it uniform is a separate decision with its own
  authorization.
- Schema migrations, secrets or access changes, force-push.
- The four feature epics. They are roadmap and are tracked on their own.
- `mc2-x72bq` (chart extraction) — owner-deferred 2026-08-07 until after the
  production launch and a larger server. Do not propose it.
- `mc2-ibzcc` / `mc2-vlskb` — blocked on a `docling-mcp` release that has not
  happened since 3.0.0. Check the version; do not attempt to work around it
  again.
- Rewriting the tracker or the orchestration contract.

## 5. Functional requirements

- **FR-1** Every open item is triaged into exactly one Stage 1 bucket, with the
  evidence recorded on the item itself.
- **FR-2** A closed-as-fixed item names the commit or the measurement that
  fixed it. "Looks done" is not a close reason.
- **FR-3** A kept item carries a one-sentence restatement, a size, and the risk
  it carries if left.
- **FR-4** `REF:` records no longer appear in `bd ready`.
- **FR-5** The uploaded sources have a second copy off the production host, and
  restoring from it is demonstrated once, not assumed.
- **FR-6** A user whose document cannot be read is told why, in terms they can
  act on, without reading a log.
- **FR-7** Each Stage 4 bug is confirmed to reproduce before it is fixed and
  confirmed fixed by the same check afterwards.
- **FR-8** Stage 5 produces no implementation until the research findings are
  in hand and an approach has been chosen against them.

## 6. Non-functional requirements

- Production mutation, deploy, reindex and paid runs follow the existing
  authority rules; the standing prod-deploy authorization covers a green
  pipeline and nothing else.
- Preserve concurrent work by others. `mc2-q1ggs` is open precisely because
  this host has more than one operator.
- No claim of improvement without a measurement that could have failed.

## 7. Acceptance criteria

- **AC-1** Triage is complete: every one of the 89 has a bucket and evidence,
  and the remaining count is stated with its composition.
- **AC-2** Uploaded sources are copied off-host and a restore has been
  demonstrated.
- **AC-3** The concurrent-access risk is either mitigated or explicitly
  accepted by the owner in writing on `mc2-q1ggs`.
- **AC-4** An unreadable document produces a message the uploader can act on,
  shown in the interface.
- **AC-5** Every Stage 4 bug is closed with a before/after check, or reclassified
  with evidence.
- **AC-6** `pnpm format:check`, `pnpm type-check`, `pnpm build` green.
- **AC-7** Anything deferred is listed under `Explicit defers` in
  `.codex/handoff.md` with its reopen condition.

## 8. Rollback contract

Stage 2 adds copies and changes no read path — nothing to roll back. Stage 3 is
a message surface: it ships behind no flag but touches no conversion behaviour,
and reverting is a single revert. Stage 5 must arrive behind a flag defaulting
to today's behaviour, because it changes what a document becomes.
