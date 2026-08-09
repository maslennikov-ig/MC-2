# What to finish, in what order, and why

Status: proposed, for discussion · Author: root orchestrator · Date: 2026-08-08
Tracker: Beads. Delivery: `develop` per `AGENTS.md`.
Intended executor: Codex (ChatGPT 5.6). Read `codex-prompt.md` in this directory.

## 1. Why this supersedes the stage order in `specs/025-remaining-debt/plan.md`

That plan was written before the backlog had been checked. Stage 1 (`mc2-osty1`)
then checked all 89 records against the code and three of its assumptions turned
out to be false, so the order it proposed is no longer the right one.

What actually changed:

- **`mc2-bygu1` is done.** The uploaded sources now have an off-host copy on
  `helixa-new`, pulled daily, with a restore proven against `file_catalog.hash`.
  It was Stage 2's head item and the only irreversible entry in the backlog.
- **`mc2-gbctb` was already fixed** on 2026-06-28. The plan allowed promoting it
  into Stage 2 as a deploy hazard; it is not one.
- **The repo-health stage is bigger and differently shaped than filed.**
  `format:check` fails on 138 files plus 11 unparseable, not 11, and 28 of those
  files fall outside every child of `mc2-jsamu`.
- **Two real problems had no bead at all** and are the reason this document
  exists rather than a simple re-ranking: `mc2-bswhl` and `mc2-3sz3d` below.

Backlog now: **49 work items** (P1 8, P2 27, P3 13, P4 1) plus 5 epics.

## 2. The ordering principle

Not tracker priority — the triage showed it is unreliable in both directions.
`mc2-jz6y0.13.6` is P1 and is an owner defer; `mc2-ekaup` is P2 and loses a
user's work.

The order here is:

1. a person loses work, or is told something untrue;
2. a person is blocked and cannot tell why;
3. the next incident costs more than it should;
4. we cannot see what we are doing (verification we cannot trust);
5. friction that compounds;
6. product work we chose;
7. things that are not ours to move.

Tiers 1–4 are the argument of this document. Everything below tier 4 is listed
so nothing is silently dropped, not because it is scheduled.

## 3. Tier 1 — someone loses work or is misled

### 3.1 `mc2-ekaup` — Career Playbook block edits vanish, and the UI says they were saved

`library.edit` and `library.regenerateBlock` throw `METHOD_NOT_SUPPORTED`
(`library.router.ts:40-46`). The client catches exactly that and calls
`applyLocalEdit()` (`use-career-playbook-store.ts:1603`), which writes into
`state.viewer.blocks`.

The store does use `persist` with `localStorage` (`:1436`, `:2808`) — but
`partialize` (`:2809`) lists wizard state only and **does not include `viewer`**.
So the edit is in memory and gone on reload.

The message shown is `Block edit saved locally until the backend action is
connected`. That is the part a user acts on, and it promises durability that
does not exist. **A silent failure that claims success is worse than an error.**

Two separable fixes, and they should be separated: tell the truth in the message
now (minutes), wire the real transport after (the actual work).

### 3.2 `mc2-bswhl` — an uploader is never told why their document could not be read

The pipeline already knows. `EmptyConversionError` in
`phase-1-docling-conversion.ts` carries a precise cause. It reaches nobody:
`file_catalog.error_message` is rendered **nowhere** in `packages/web` — the only
hits are `lesson_enrichments` handling and API routes writing the column.

The person waits through a full conversion to learn that "processing failed".

Deliberately _not_ in scope here: actually reading such files. That is
`mc2-3gz2m`, it is expensive, and it is gated on research. **Telling the truth is
the cheap half and does not depend on the expensive half.**

### 3.3 `mc2-raw1i` — a malformed lesson reaches a learner past a guard that cannot fire

`judge/filters/orchestrator.ts:243` raises `emptySections` when
`sectionCount === 0`. `basic-checks.ts:271` computes sections by splitting on a
header regex and dropping blanks — a split with no match returns the whole
string. Reproduced: intro-only lesson → 1, no headers at all → 1, three sections
→ 3, and only the empty string → 0.

So the exact case this was filed for — a lesson entirely in its introduction —
passes. Fix by counting header matches, not by restoring a clamp.

### 3.4 `mc2-1ugj1` — the enrichment UI subscribes to a channel that can never fire

`lesson_enrichments` appears in no `ALTER PUBLICATION supabase_realtime` and has
no `REPLICA IDENTITY` (exactly three tables are published: `courses`,
`generation_trace`, `course_nodes`). Meanwhile
`course-viewer-enhanced.tsx:262` disables fallback polling once the subscription
reports success. Subscribing "succeeds", nothing arrives, polling is off —
**strictly worse than plain polling**.

Caveat that must be honoured before fixing: this reads repository migrations
only, and this project does not auto-apply migrations in CI. Confirm against the
live database with `select * from pg_publication_tables where
pubname='supabase_realtime'` first.

### 3.5 `mc2-dqbw1` — Lesson Inspector can spin forever

`useLessonInspectorData.ts:750` starts `isLoading=true`; `:1107-1111` fetches
only when `isAuthenticated`, and no branch clears `isLoading` when auth resolves
_without_ a session (`browser-client.tsx:105-107` always drives `authLoading`
false, but `session` may stay null).

That path is proved by code. It is **not** proved to be the 2026-03-21 report,
where the user was a superadmin with a valid session. Fix the proved path; do not
claim the original report is closed by it without a reproduction.

### 3.6 `mc2-sznhi` — the teaser leaks to the learner outside ru/en

`generator-intro-guard.ts:25-32` holds exactly six patterns, four English and two
Russian. `CONTENT_LABELS` is a `Record<Language,…>` and is not used here. On any
other locale the guard never fires.

## 4. Tier 2 — we cannot trust what we measure

### 4.1 `mc2-3sz3d` — the backend suite cannot start and exits 0

`pnpm -F course-gen-platform exec vitest run` aborts in `tests/global-setup.ts:20`
("Unable to verify required Qdrant server 1.18.2 …: Not Found") and then prints
`No test files found, exiting with code 0`.

**A run that never started reports success.** This is first in its tier because
it silently degraded the triage that produced this document: every backend
verdict had to fall back to commit shas and reading source, because no local test
run could settle anything.

Wanted: `global-setup` must exit non-zero when a precondition fails, and the
version check must either match what is reachable locally or be skippable by an
explicit opt-out rather than by accident.

## 5. Tier 3 — the next incident costs more than it should

| #   | id               | why it is here                                                                                                                                                                                                                                                                                                             |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | `mc2-q1ggs`      | Two processes hold `claude-deploy` on production with no lock. It already cost a deploy on 2026-08-07. **Needs an owner decision, not code** — see §8.                                                                                                                                                                     |
| 5.2 | `mc2-2vtmk`      | The host's `claude-deploy` GHCR token is dead; only the root token pulls. A credential that works by accident is a deploy that fails at the worst moment. Small and mechanical.                                                                                                                                            |
| 5.3 | `mc2-c2p8z`      | CI writes only `.env.production`; `.env.blue`/`.env.green` are hand-edited. Adding a `${VAR:?}` to compose silently breaks deploy — it did on 2026-07-11 and surfaced only on 07-27. The issue's own option (c), a CI check that every `${VAR:?}` exists in both colour files, is cheap and catches drift before a deploy. |
| 5.4 | `mc2-jz6y0.13.6` | **Its premise changed today.** The owner deferred off-host Qdrant snapshots because there was no second machine. There is one now, and `deploy/uploads-backup/` is a working pull pattern that would extend to snapshots for roughly no new infrastructure. Worth re-deciding rather than inheriting the defer.            |

## 6. Tier 4 — friction that compounds

`mc2-jsamu` **must be restructured before it is worked**, not after: 28 of the
138 unformatted files fall outside `docs/**`, `specs/**` and `packages/**` and so
outside every child, and `.6` would fail as written. Most of them
(`.beads` 4, `.codex` 16, `.claude` 6, `.pytest_cache`, `test.js`) plus the
generated files under `packages/web/{public,test-results}` and
`types/database.generated.ts` belong in `.prettierignore`, which currently
excludes none of them. The 11 unparseable files are raw LLM captures saved as
`.json`; repairing them destroys the record, so they are an ignore too.

Then: `mc2-5dzld` (reproduced: removing one emitted `.d.ts` while keeping
`tsconfig.tsbuildinfo` makes `build:types` exit 0 without restoring it; the fix
needs `--build --force`, since `--force` is rejected with `-p`), `mc2-zt4ju`
(`pnpm start` broken under Node 24 by extensionless ESM imports, masked because
the Dockerfile runs tsx), `mc2-n6szm`, `mc2-1mmop`, `mc2-iioip`.

`mc2-iioip` carries a finding larger than itself: `.codex/subagent-spawn-template.md`
was rewritten in `e40c3dd18` to fit the broken linter rather than the linter
being fixed. The fix lives outside this repository.

## 7. Tier 5 — product work we chose, not debt

`mc2-3gz2m` (unreadable vector diagrams — **do not start before the research in
`specs/025-remaining-debt/research-prompt.md` is in hand**), `mc2-6ye5z.4/.5/.8`
(slide_deck, report, data_table; their siblings shipped),
`mc2-db696.{57,60,78,79}`, `mc2-5e4ek.2`, `mc2-k2qih`, `mc2-mt07s` (restate it
first — model routing is phase-based now, so the risk in its title has expired),
`mc2-stds7` (only S-2 of four remains), `mc2-r7udy`, `mc2-68qwn`, `mc2-vb8kl`.

`mc2-wxun` and `mc2-vjbb` need instrumentation before any experiment: the tier-1
exit trace carries no score at all, because the threshold is applied Qdrant-side.

## 8. Decisions that are the owner's, and block nothing

- **`mc2-q1ggs`** — separate accounts, a shared lock, or narrower sudoers.
- **`mc2-jz6y0.13.6`** — re-decide now that an off-host machine exists (§5.4).
- **`mc2-db696.61`** — unblocked (`mc2-t5auh` closed); needs one live run then a
  cost-versus-quality call.
- **`mc2-db696.11.6`** — needs disposable staging resources and an approved LLM
  spend budget.

## 9. Do not touch

- **Reindex, schema migrations, secrets or access changes, force-push.** None is
  authorized. Deploy is covered by the standing authorization on a green
  pipeline only.
- `mc2-x72bq` (chart extraction) — owner-deferred long-term. Do not propose it.
- `mc2-ibzcc`, `mc2-vlskb` — waiting on a `docling-mcp` release above 3.0.0.
  PyPI still shows 3.0.0 (2026-07-31, checked 2026-08-08). Do not work around it
  again.
- `mc2-hqfc3` — owner-gated; branch deliberately absent from `develop`.
- `mc2-8m90f` — precondition measured as not fired; the evidence tables are empty.
- `mc2-qd12b`, `mc2-1nots`, `mc2-5e4ek.1` — the last two are recorded as
  `real (unverified)` on purpose; settling them needs a live run, not a guess.
- The 9 documents whose source bytes are gone — owner accepted the loss
  2026-08-08. Do not re-open.

## 10. Acceptance

- **AC-1** Every tier-1 item is either fixed with a before/after check, or
  reclassified with evidence. "Looks done" closes nothing.
- **AC-2** `mc2-ekaup`'s misleading message is corrected even if the transport is
  not yet wired.
- **AC-3** An unreadable document produces a reason the uploader can act on,
  visible in the interface.
- **AC-4** `pnpm -F course-gen-platform exec vitest run` either runs the suite or
  exits non-zero. It never again exits 0 without running.
- **AC-5** `mc2-jsamu` is restructured to cover all 138 files before any batch is
  worked; `pnpm format:check`, `pnpm type-check`, `pnpm build` green at the end.
- **AC-6** Anything deferred is listed in `.codex/handoff.md` with its reopen
  condition.

## 11. Traps that have already cost this repository time

- `AGENTS.md` is rewritten by a `bd` hook — stage explicit paths, never
  `git add -A`.
- Host port 6333 is the DEV Qdrant and is empty; production answers on **6335**.
- A closed Beads issue does not prove delivery. Run
  `scripts/orchestration/check_stranded_commits.py`.
- Subagent reports are not evidence. Check the cited sha or file:line yourself.
- `monitoring-drift` is a separate job, never a step of `deploy`: as a step it
  fails the deploy job and `rollback` triggers on exactly that.
