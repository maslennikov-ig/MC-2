# Stage mc2-osty1 — Triage of the open backlog

Epic: `mc2-p2908` (spec `specs/025-remaining-debt/`)
Status: accepted
Level: slice_acceptance
Started: 2026-08-08

Backlog measured at start: **89** (`bd list --status open,in_progress` → 88 open + 1 in_progress).

## Rule applied

A bucket is only as good as the evidence beside it. "Looks done" closes nothing.
`already_fixed` needs a commit sha or a measurement; `real` needs a file:line.
Where an experiment could settle a claim, it was run so that it could have failed.

## Root-owned batch (51 items)

### Repo health (12)

| id            | bucket        | size | evidence                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mc2-jsamu`   | real          | M    | `pnpm format:check` → **138 unformatted + 11 parse-error files**, exit 2. Filed 2026-02-18, still true.                                                                                                                                                                                                                                                     |
| `mc2-jsamu.1` | already_fixed | —    | Its deliverable is the baseline inventory; this stage produced it (counts below).                                                                                                                                                                                                                                                                           |
| `mc2-jsamu.2` | real          | S    | The 11 parse errors are ALL raw LLM captures stored as `.json` under `docs/llm-testing/` and `specs/008-*/quality-tests/`. They are experiment records and can never be valid JSON — the fix is `.prettierignore`, not repair.                                                                                                                              |
| `mc2-jsamu.3` | real          | S    | `docs/**`: 29 files.                                                                                                                                                                                                                                                                                                                                        |
| `mc2-jsamu.4` | real          | S    | `specs/**`: 1 file + 8 of the 11 parse-error files.                                                                                                                                                                                                                                                                                                         |
| `mc2-jsamu.5` | real          | M    | `packages/**`: 82 files.                                                                                                                                                                                                                                                                                                                                    |
| `mc2-jsamu.6` | real          | S    | Would fail as written — see the coverage gap below.                                                                                                                                                                                                                                                                                                         |
| `mc2-5dzld`   | real          | S    | **Reproduced.** Deleted `dist/server/routers/admin/users.d.ts`, left `tsconfig.tsbuildinfo`, ran `pnpm build:types`: exit 0, declaration did NOT return. `tsconfig.json` sets `composite: true`; the final emit is `tsc -p tsconfig.json --emitDeclarationOnly` with no `--force`. `--force` is rejected with `-p` (TS5093), so the fix must use `--build`. |
| `mc2-zsoih`   | already_fixed | —    | `519a6e503` (2026-07-31) "chore(lint): make pnpm lint and lint-staged agree". `.lintstagedrc.mjs` now restricts eslint to the three roots the packages actually lint.                                                                                                                                                                                       |
| `mc2-n6szm`   | real          | S    | `npx eslint …/reindex-course-embeddings.test.ts` → **16 errors, 4 warnings** (issue said 17; count moved).                                                                                                                                                                                                                                                  |
| `mc2-c2p8z`   | real          | S    | `.github/workflows/ci-cd.yml` mentions `.env.production` only (4 sites); `.env.blue`/`.env.green` appear nowhere. Compose still hard-requires exactly `API_IMAGE`, `WEB_IMAGE`, `QDRANT_METRICS_GID`, `QDRANT_METRICS_TEXTFILE_HOST_DIR` as `${VAR:?}`.                                                                                                     |
| `mc2-gbctb`   | already_fixed | —    | `e381f5dd0` (2026-06-28) "fix(ci): harden deploy gates". `ci-cd.yml:711` now gates deploy on `build-docker.result == 'success' \|\| (skipped && should_build_docker != 'true')`. A skipped build with deploy-relevant changes blocks the deploy. **Does not move to Stage 2.**                                                                              |

**Coverage gap in the `mc2-jsamu` breakdown.** 28 of the 138 unformatted files fall
outside `docs/**`, `specs/**` and `packages/**` and therefore outside every child:
`.codex` 16 (stage artifacts), `.claude` 6, `.beads` 4 (tool-managed state),
`.pytest_cache` 1, `test.js` 1. Most are generated or tool-owned and belong in
`.prettierignore`, which currently excludes none of them.

### LanguageTool (8) — real, never started

`mc2-z6er`, `mc2-e35y`, `mc2-rqev`, `mc2-41t1`, `mc2-jk01`, `mc2-ebjd`, `mc2-03z1`, `mc2-5coh`.

Evidence: `grep -ril languagetool` over `packages/`, compose files and workflows returns
**nothing**. Eight items filed 2026-02-16, zero lines written.

**Owner decision required, not an engineering one.** Since February the repository grew an
LLM judge and a self-reviewer with a grammar pass. Whether a self-hosted LanguageTool is
still wanted is the owner's call; nothing here is blocked on code.

### NotebookLM enrichment (7)

| id                              | bucket        | evidence                                                                                                                                    |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mc2-6ye5z`                     | roadmap       | Epic.                                                                                                                                       |
| `mc2-6ye5z.6` (quiz/flashcards) | already_fixed | `nlm_flashcards: nlmFlashcardsHandler` registered in `enrichment-router.ts:126`; handler is 245 lines with real bridge parsing, not a stub. |
| `mc2-6ye5z.7` (infographic)     | already_fixed | `enrichment-router.ts:128`; handler 188 lines.                                                                                              |
| `mc2-6ye5z.9` (mind_map)        | already_fixed | `enrichment-router.ts:127`; handler 277 lines.                                                                                              |
| `mc2-6ye5z.4` (slide_deck)      | real          | `nlm_slide_deck` / `slide_deck`: zero occurrences in `packages/shared-types/src` and `packages/course-gen-platform/src`.                    |
| `mc2-6ye5z.5` (report)          | real          | `nlm_report`: zero occurrences.                                                                                                             |
| `mc2-6ye5z.8` (data_table)      | real          | `nlm_data_table` / `data_table`: zero occurrences.                                                                                          |

### Known infrastructure and owner-gated (13)

| id               | bucket         | evidence / reopen condition                                                                                                                                                                                                                                                     |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mc2-bygu1`      | real           | 206 MB / 117 files under `/opt/megacampus/data/uploads`, no second copy. Stage 2 item #1.                                                                                                                                                                                       |
| `mc2-q1ggs`      | real           | Two processes hold `claude-deploy`; one rebooted the host mid-deploy 2026-08-07. Needs an owner decision between separate accounts, a shared lock, or sudoers narrowing.                                                                                                        |
| `mc2-2vtmk`      | real           | Host `claude-deploy` GHCR token dead; only the root token pulls.                                                                                                                                                                                                                |
| `mc2-3gz2m`      | real           | Gated on deep research (`specs/025-remaining-debt/research-prompt.md`).                                                                                                                                                                                                         |
| `mc2-ibzcc`      | not_ours       | PyPI: `docling-mcp` latest is **3.0.0**, uploaded 2026-07-31. Reopens on any release > 3.0.0.                                                                                                                                                                                   |
| `mc2-vlskb`      | not_ours       | Same upstream gate.                                                                                                                                                                                                                                                             |
| `mc2-x72bq`      | not_ours       | Owner-deferred long-term 2026-08-07. Reopens after production launch on a larger server.                                                                                                                                                                                        |
| `mc2-hqfc3`      | not_ours       | Owner-gated; branch allowlisted in `check_stranded_commits.py`.                                                                                                                                                                                                                 |
| `mc2-jz6y0`      | roadmap        | Epic, in_progress.                                                                                                                                                                                                                                                              |
| `mc2-jz6y0.13.6` | not_ours       | Owner decided 2026-08-02 to stay on local snapshots and give Qdrant its own server later.                                                                                                                                                                                       |
| `mc2-8m90f`      | real (blocked) | Precondition measured as not fired: `document_evidence_runs`/`document_evidence_items` are empty. Reopens after the first post-window Stage-4 generation.                                                                                                                       |
| `mc2-qd12b`      | real           | `RUN_REAL_CONTROLLER` auto-enables at uid 1000, off on GitHub runners.                                                                                                                                                                                                          |
| `mc2-vb8kl`      | real           | Reindex job ids are `qdrant-reindex-${runId}-${fileId}` (`tools/qdrant/reindex-course-embeddings.ts:434`), and **no reindex-origin guard exists anywhere in `src/`**; `stage2-document-processing/orchestrator-helpers.ts:79` calls `updateCourseProgressInDB` unconditionally. |

### UI redesign (1)

`mc2-uv7n7` — not_ours. Owner paused Phase 1 ("not satisfied with result"), deleted the
branch locally and on origin 2026-07-27, and recorded that a future Phase 1 restarts from
the Stitch screens. Reopens when the owner restarts it.

### REF: records (10)

`mc2-6yg`, `mc2-w7r`, `mc2-vf0`, `mc2-mgb`, `mc2-wm8`, `mc2-4ul`, `mc2-0e0`, `mc2-g06`,
`mc2-w50`, `mc2-yp5`. Excluded from triage — they are documentation kept as issues.

**They do pollute the queue: 10 of the 80 items in `bd ready` are `REF:`.** FR-4 is real work.

## Delegated batches (38 items)

Three read-only `Explore` streams: Career Playbook 13, content pipeline / Stage 6 15,
code review / tests / tooling 10. They shared the primary worktree because none of them
writes; `git status` after they finished confirms not one file changed.

All three went idle without delivering their tables and needed an explicit nudge. A
mid-run "status check" ping got no reply either — it consumes the turn without producing
a message, so it is useless as a progress probe.

**No verdict was taken on the agents' word.** Every commit they cited was checked with
`git merge-base --is-ancestor <sha> develop`: all 13 are ancestors and every subject
matches the claim. The claims that carried the most risk were then re-read at source:

- `mc2-3ybyc` — `PRO\s*TIP` is present in `CALLOUT_REGEX` (`structural-checks.ts:552`)
  AND in `CALLOUT_DETECT_RE`/`CALLOUT_STRIP_RE` (`callout-parser.tsx`), with whitespace
  collapsed on both sides. Confirmed.
- `mc2-dvymw` — `checkHeaderLanguage(content, language)` is called at
  `judge/filters/orchestrator.ts:239` and weighted at `types.ts:220`. Confirmed.
- `mc2-db696.18` — the only `continue-on-error` in the entire workflow is line 261, on
  the security-audit job; `test-integration` has none. Confirmed.
- `mc2-1ugj1` — exactly three `ALTER PUBLICATION supabase_realtime` statements exist
  (courses, generation_trace, course_nodes) and none for `lesson_enrichments`. Confirmed.
- `mc2-raw1i` — re-run independently in node. Confirmed, see below.

### The sharpest finding: a P1 guard that cannot fire

`mc2-raw1i` was filed to add a `section_count=0` validation. The validation **exists** —
`judge/filters/orchestrator.ts:243` raises `emptySections` — but it is dead code.
`basic-checks.ts:271` computes sections by splitting on a header regex and dropping
blanks, and a split with no match returns the whole string. Re-run independently:

```
intro-only lesson  -> 1
no headers at all  -> 1
empty string       -> 0
normal 3-section   -> 3
```

Only an empty string reaches 0, so the exact W2-3 case the issue was filed for — the
whole lesson sitting in the introduction — still passes. Closing this on "the guard is
there" would have been wrong, and that is precisely what an unverified report would have
produced.

### Verdicts taken

Closed with a sha (13): `mc2-iqeaf`, `mc2-xbjj3`, `mc2-637fd`, `mc2-x7p81` (all
`719275a49`), `mc2-7iqbc` (`26403e775`), `mc2-47k7g` (`1527bd1ee`), `mc2-db696.18`
(`3c36a6a1b`), `mc2-3ybyc` (`ed5b7d1c6`+`07f1e7f8a`), `mc2-dvymw` (`5a2367a0c`),
`mc2-zxomr` (`8969303e4`), `mc2-fk8mz` and `mc2-neslr` (`994ebb7af`), `mc2-hkwkk`
(`c31cc9f71`).

Kept with evidence (25). Four of them are narrower than filed and were restated on the
bead: `mc2-stds7` (only S-2 of four remains), `mc2-k2qih` (only the panel animation),
`mc2-zt4ju` (only `node dist`, not tsx — masked in production because the Dockerfile runs
tsx), `mc2-mt07s` (the risk in its title has expired; model routing is phase-based now).

**Two are recorded as `real (unverified)` on purpose**, because settling them needs a live
run that the read-only mandate did not permit: `mc2-5e4ek.1` (needs a backend on :3456 and
`SUPABASE_SERVICE_ROLE_KEY`) and `mc2-1nots` (needs a live mutation smoke with real LLM
spend). Both had their filed hypotheses disproved by code, so the cause is genuinely open.
A guess in either slot would have been worse than the gap.

### Two findings worth acting on beyond their own bead

- `mc2-iioip`: the canonical `.codex/subagent-spawn-template.md` was rewritten in
  `e40c3dd18` (2026-08-05) from `## Goal` to `Goal:` — the template was bent to fit a
  broken linter rather than the linter fixed. That is the exact risk the issue named. The
  fix lives outside this repository, in `orchestration_panel.py:707-741`.
- `mc2-1ugj1`: the verdict reads repository migrations only. This project does not
  auto-apply migrations in CI, so confirm against the live database with
  `select * from pg_publication_tables where pubname='supabase_realtime'` before fixing.

### Verification limits the streams reported honestly

Backend vitest could not run at all: `tests/global-setup.ts:20` aborts with "Unable to
verify required Qdrant server 1.18.2 for @qdrant/js-client-rest 1.18.0: Not Found", so
backend evidence is commit shas and file:line rather than test runs. Web tests did run:
7 files, 202 tests passed.

## Result: 89 → 62, and what the 62 are

19 closed, every one citing a commit sha or a measurement. 10 `REF:` records deferred out
of `bd ready`. 2 new records created for this work (`mc2-p2908`, `mc2-osty1`).

|                                      | count  |
| ------------------------------------ | ------ |
| open / in_progress                   | 62     |
| — of which epics (roadmap, not debt) | 5      |
| — of which this triage stage itself  | 1      |
| **actual work items**                | **56** |

By priority: P1 13, P2 27, P3 21, P4 1. By type: task 34, bug 15, epic 5, feature 4,
chore 4.

`bd ready` went from 80 to 52.

Of the 56, eleven need an owner decision before any engineering — the eight LanguageTool
items, `mc2-q1ggs`, `mc2-db696.61` and `mc2-db696.11.6` — and eight are `not_ours`
(upstream or owner-gated) with a recorded reopen condition.

## Corrections to `specs/025-remaining-debt/spec.md`

Two claims in the spec were imprecise and are corrected by measurement:

- "`format:check` fails on 11 files" — 11 is the count of files prettier could not _parse_.
  The full failure is **138 unformatted + 11 unparseable**.
- `mc2-gbctb` was listed as a candidate to promote into Stage 2. It was fixed on
  2026-06-28 and is not a hazard.

## Verification used

- `pnpm format:check` — full run, output retained.
- `pnpm build:types` after removing one emitted declaration — the falsifiable reproduction
  for `mc2-5dzld`; `dist` restored afterwards.
- `npx eslint` on the named test file.
- `git log -S` for each `already_fixed` verdict.
- `curl https://pypi.org/pypi/docling-mcp/json` for the upstream gate.

`docs-reviewed: updated - .codex/handoff.md rewritten to current state (Docling epic detail
moved out to its stage summaries, backlog truth and the Stage 2 order put in), and two
measured corrections recorded against specs/025-remaining-debt/spec.md: format:check fails
on 138 files plus 11 unparseable rather than 11, and mc2-gbctb was fixed 2026-06-28 so it
does not promote into Stage 2.`

`graph-reviewed: no-change-needed` — this stage changed no source file. The only edits are
Beads issue state and this stage's own records, so the code graph is unaffected.

`project-index: reviewed-no-change` — the sole structural edit to `.codex/orchestrator.toml`
is repointing `current_stage_id` and the three stage-scoped paths from `mc2-1sobq.5` to
`mc2-osty1`. No subsystem, entrypoint or contract was added, removed or renamed.
