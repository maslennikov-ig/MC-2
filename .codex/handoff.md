# Orchestrator Handoff

Updated: 2026-08-08 — epic `mc2-p2908` (`specs/025-remaining-debt/`) opened; Stage 1 triage
ACCEPTED. Epic `mc2-1sobq` (Docling) is DELIVERED and closed; its detail lives in
`.codex/stages/mc2-1sobq.{1,2,3,4,5}/summary.md` and is not repeated here.
Accepted stage id: `mc2-osty1`

## Backlog truth: 89 → 53, established by evidence not by reading titles

`mc2-osty1` checked all 89 open records against the code. **19 closed, every one citing a
commit sha or a measurement**; 10 `REF:` documentation records deferred out of `bd ready`
(closing them would make them targets of `bd admin compact`, which summarises closed
issues — these exist to be read verbatim). `bd ready` went 80 → 52.

Then the owner retired the LanguageTool track (8 more), so the delivered state is **53
open, of which 5 are epics → 48 real work items** (P1 12, P2 27, P3 13, P4 1) and
`bd ready` is 44. Three still need an OWNER DECISION before any engineering; eight are
`not_ours` with a recorded reopen condition. Full table: `.codex/stages/mc2-osty1/summary.md`.

**Do not re-open the 19 by habit.** Each close names its sha. All 13 cited shas were
verified as ancestors of `develop` with `git merge-base --is-ancestor` before acceptance.

## What the triage corrected, and what it found that nobody had filed

- **`format:check` fails on 138 files plus 11 unparseable, not 11.** The "11" in prettier's
  footer counts only PARSE failures. All 11 are raw LLM output captures saved as `.json`
  under `docs/llm-testing/` and `specs/008-*/quality-tests/` — experiment records that can
  never be valid JSON. The fix is `.prettierignore`, and repairing them destroys the record.
- **`mc2-jsamu`'s children miss 28 of the 138 files.** `.codex` 16, `.claude` 6, `.beads` 4,
  `.pytest_cache` 1, `test.js` 1 fall outside `docs/**`, `specs/**` and `packages/**`, so
  `mc2-jsamu.6` would fail as written.
- **`mc2-gbctb` was fixed 2026-06-28 (`e381f5dd0`) and is NOT a deploy hazard.** The plan
  allowed promoting it to Stage 2; it does not move.
- **`mc2-raw1i` (P1): the guard exists and is DEAD CODE.** `orchestrator.ts:243` raises
  `emptySections` when `sectionCount === 0`, but `basic-checks.ts:271` splits on a header
  regex — a split with no match returns the whole string, so a non-empty lesson always
  yields ≥1. Re-run in node: intro-only → 1, no headers → 1, empty string → 0 only. The
  exact W2-3 case still passes. Fix by counting header matches, not by restoring a clamp.
- **`mc2-5dzld` REPRODUCED.** Removing one emitted `.d.ts` while keeping
  `tsconfig.tsbuildinfo` makes `pnpm build:types` exit 0 without restoring it. `--force` is
  rejected with `-p` (TS5093), so the fix must use `--build`.
- **`mc2-iioip` has a second victim.** `.codex/subagent-spawn-template.md` was rewritten in
  `e40c3dd18` from `## Goal` to `Goal:` — the template was bent to fit a broken linter
  (`orchestration_panel.py:707-741`, outside this repo) instead of the linter being fixed.

Two verdicts are deliberately `real (unverified)`: `mc2-5e4ek.1` and `mc2-1nots`. Both had
their filed hypotheses disproved by code; settling them needs a live run (a backend on
:3456, or a mutation smoke with real LLM spend). A guess would have been worse than the gap.
`mc2-1ugj1`'s verdict reads repository migrations only — this project does not auto-apply
migrations in CI, so confirm the live publication before fixing.

## Next: Stage 2, ordered by irreversibility not by tracker priority

1. ~~`mc2-bygu1`~~ **DONE 2026-08-08.** `helixa-new` (82.26.152.8) now PULLS the uploads
   from `megacampus-prod` daily into 14 dated snapshots. Pull not push, so production holds
   no credential to the backup host. The key carries `restrict` + a forced `tar` command and
   was verified unable to do anything else. Neither host has `rsync`, so it is tar over ssh
   and nothing was installed. Restore PROVEN: one file extracted, its sha256 equals
   `file_catalog.hash` exactly. NOT disaster recovery — `helixa-new` is a single VPS with
   server-local backups of its own. See `deploy/uploads-backup/README.md`.
   **The lost-source count is NINE, not six** (126 catalog paths under `uploads/` vs 117
   files on disk) — `mc2-mrhuw`.
2. **`mc2-q1ggs`** — two processes hold `claude-deploy` on production with no shared lock;
   one rebooted the host mid-deploy 2026-08-07. Owner picks: separate accounts, a shared
   lock, or narrower sudoers. Structurally unchanged.
3. **`mc2-2vtmk`** — host `claude-deploy` GHCR token dead; only root pulls.

Then Stage 3 (tell the uploader why a document failed), Stage 4 (content bugs), Stage 5
(vector diagrams, GATED on research), Stage 6 (repo health). See `specs/025-remaining-debt/`.

**Stage 5 must not start before the research findings are in hand.** Prompt:
`specs/025-remaining-debt/research-prompt.md`. `mc2-3gz2m` is ONE family, not sixteen
problems: 4 unique flowcharts, 4296 pt tall, type converted to curves, no text layer; OCR
returns nothing even at 3× with full-page OCR forced. Telling the user WHY is Stage 3 and
is cheap; READING the file is Stage 5 and is not.

## Settled by the owner 2026-08-08

**LanguageTool is retired** (`mc2-z6er` + 7 children, all closed). Eight items filed
2026-02-16 with zero lines ever written; the LLM judge and self-reviewer now carry grammar
handling. Reopen condition: a deterministic rule-based checker is wanted alongside the LLM
path. Do not re-file it as debt.

## Awaiting an owner decision — none of these blocks other work

- `mc2-q1ggs` — the three options above.
- `mc2-db696.61` — now UNBLOCKED (`mc2-t5auh` closed); needs one live run then a cost /
  quality call.
- `mc2-db696.11.6` — needs disposable staging resources and an approved LLM spend budget.

## Production and delivery facts that are still live

Production runs `docling-serve@sha256:91d06a5d…` (Serve 1.30.0, jobkit 3.3.0, docling
2.118.0, core 2.90.0, parse 7.10.0) and `docling-mcp-v3@sha256:d6610a7c…`, digest-pinned.
`DOCLING_CHUNK_STRATEGY=docling_hybrid` is live and runtime-proven; it changes NEW documents
only and the collection is mixed BY DESIGN. Rollback is one variable edit back to
`sha256:459f995d…`; keep `DOCLING_ROLLBACK_IMAGE` on MCP 1.x. Verify a strategy flip in the
WORKER, never in the pipeline. `mc2-ibzcc`/`mc2-vlskb` wait on a `docling-mcp` release above
3.0.0 — PyPI still shows 3.0.0 (2026-07-31), checked 2026-08-08.

**Reindex, schema migrations, secrets/access changes and force-push are NOT authorized.**
Deploy is covered by the standing 2026-08-06 authorization on a green pipeline only.
`mc2-x72bq` is DEFERRED LONG-TERM by the owner — do not propose it.

Reindex repair, when it is ever authorized: `qdrant-operator retry-documents --file-ids
<path> --confirm`, idempotent. Two flags are NOT optional — `-e
BULLMQ_QUEUE_NAME=course-generation` and `-e DOCLING_UPLOADS_BASE_PATH=/app`. Source
recovery COMPLETE (42/42, 24/24); reindex 218/234, `gaps=21 schema_mismatches=0`.

## Backup guarantees

All three timers ENABLED. Snapshot and Supabase backup have PROVEN THEMSELVES UNATTENDED
(2026-08-02); the Qdrant restore drill is monthly, next **2026-09-01**, so its scheduled
path is still unproven — the drill itself PASSED 2026-07-31, all seven checks. Snapshots are
`storage_mode local`. Install the Supabase backup ONLY via
`install-supabase-backup-schedule.sh`, which clears the start-limit first; without that the
trap DISABLES the timer after repeated failures. All 13 alerting rules are inactive, each
cleared by being made true. `/opt/megacampus/recovery/probe.json` exists (root:root 0444)
and is NOT in the repository — it embeds real course content; regenerate it after anything
that rewrites course `0b3af59d-eeb7-4be6-89fb-5d2abac302bd`, then snapshot before the drill.

Off-host backup (`mc2-jz6y0.13.6`) is an owner defer: local snapshots stay, Qdrant gets its
own server later. Do NOT go shopping for object storage. Local snapshots cover a dropped
collection, a bad reindex or a corrupting upgrade — never losing the machine.

## Verification and Delivery

- Gates at the delivered HEAD: `pnpm type-check`, `pnpm build`, `pnpm lint` green;
  unit suite 400 files / 6773 tests green. `pnpm format:check` is RED by design — see above.
- **Backend vitest cannot start locally right now**: `tests/global-setup.ts:20` aborts with
  "Unable to verify required Qdrant server 1.18.2 for @qdrant/js-client-rest 1.18.0: Not
  Found", then reports "No test files found, exiting with code 0" — a red suite that looks
  green. Web tests do run (7 files / 202 tests).
- Known and not a stop, all timing out under full-suite parallelism yet passing alone:
  `q12-live-controller`, `q12-live-cutover`, `q12-retained-barrier-*`,
  `q12-barrier-input-checkpoint-publication`, `q12-live-quiesce-deferred`,
  `qdrant-source-recovery-runtime`, `stage4-analysis/evidence/downstream-context`. Re-run
  the failed jobs. Anything else failing in isolation IS a stop.
- Monitoring config drift is a SEPARATE JOB (`monitoring-drift`), never a step of `deploy`:
  as a step it failed the deploy job and `rollback` triggers on exactly that — on
  2026-08-01 a stale rule file rolled production back under a green pipeline for twenty
  minutes. Fix with `sudo /opt/megacampus/deploy/qdrant/install-monitoring-config.sh`,
  EXCEPT `megacampus-supabase-backup.{service,timer}`.
- Regenerate `deploy/qdrant/q12-deployed-asset-manifest.json` whenever a tracked asset
  changes.
- Run `scripts/orchestration/check_stranded_commits.py` before claiming work is delivered.
  Clean 2026-08-08: nothing missing from `develop`, 87 refs scanned.

**Failure modes live in `.codex/repository-failure-modes.md`. READ IT BEFORE YOU START.**
Two traps repeated because they cost the most time: host port 6333 is the DEV Qdrant and is
empty, production answers on **6335**; and `AGENTS.md` is rewritten by a `bd` hook, so stage
explicit paths and never `git add -A`.

## Explicit defers

- `mc2-3gz2m` — gated on research; see above.
- `mc2-8m90f` — precondition MEASURED as not fired: `document_evidence_runs` and
  `document_evidence_items` are empty. Join column is `document_id`, NOT `file_catalog_id`.
- `mc2-qd12b` — host-gated fixtures rot: `RUN_REAL_CONTROLLER` auto-enables at uid 1000,
  off on GitHub runners.
- `mc2-n6szm` — measured 2026-08-08 at 16 errors + 4 warnings (issue says 17); two warnings
  need a file split. `tools/` is outside every lint script.
- `mc2-hqfc3`, `mc2-jz6y0.13.6`, `mc2-x72bq`, `mc2-uv7n7` — owner-gated, each with its
  reopen condition recorded on the bead.
- CLOSED 2026-07-31/08-01, do not re-open by habit: `mc2-82bt2`, `mc2-lkkcv`, `mc2-ugl5g`,
  `mc2-2i78i`, `mc2-1cxna`, `mc2-y5tgw`, `mc2-x6en2`, `mc2-jz6y0.25`, `mc2-6l2yz`,
  `mc2-oc83n`. Q12 C1..C10 and the beads retired then each carry their reason and reopen
  condition in `.codex/stages/mc2-jz6y0/summary.md`.

## Next recommended

Next stage id: `mc2-bygu1`
Recommended action: start Stage 2 of `specs/025-remaining-debt/` with `mc2-bygu1` — the
uploaded sources on `megacampus-prod` are the only irreversible item the triage found, and
the smallest. Acceptance must include restoring one file and checking its hash against
`file_catalog.hash`. Reindex, migrations, secrets and force-push are NOT authorized.

## Starter prompt for next orchestrator

Use $orchestrator-stage for Stage 2 of `specs/025-remaining-debt/`, starting with
`mc2-bygu1`. Triage is done — do not re-triage. Subagent reports are not evidence: check
the cited sha or file:line yourself, and expect subagents to go idle without reporting.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/025-remaining-debt/`,
stage summaries `mc2-osty1` and `mc2-1sobq.{1,2,3,4,5}`, `mc2-nxd3g`, `mc2-jz6y0`.
