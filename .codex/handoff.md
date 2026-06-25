# Orchestrator Handoff

Updated: 2026-06-25
Stage: Stage 6/course-bridge fix and Stage 2 Qdrant recovery fix complete locally; delivery pending final closeout/commit decision
Branch: `codex/single-source-course-generation-flow`
Beads: `mc2-0cihf`, `mc2-evr7l`

## Current State

- Implemented `mc2-0cihf`: Stage 6 no longer accepts invalid repaired JSON/empty structured lesson bodies as completed lesson content.
- Stage 6 sanity-check failure now creates a `review_required` marker instead of saving `completed` content.
- Stage 6 completion/finalization now counts only publishable completed rows: non-empty markdown, no failed stored sanity check, and current sanity pass. Invalid completed rows are marked for review and block auto-finalization.
- Career Playbook course bridge now creates courses in `semi_automatic` mode with `clarifying_questions_enabled = true`, preserving the user-facing course-level question step after Role Guide conversion.
- Career Playbook bridge initial progress now records synthetic source markdown filenames, sizes, and `text/markdown` type.
- Durable docs updated in `docs/career-playbook/architecture.md`.
- Stage summary: `.codex/stages/mc2-0cihf/summary.md`.
- Implemented `mc2-evr7l`: Stage 2 Qdrant upload now classifies retryable outages separately from non-retryable `Not Found`/invalid configuration errors.
- Retryable Qdrant upload failures now move the document-processing job into BullMQ delayed recovery for up to 3 hours instead of immediately failing the course.
- Stage 2 keeps course progress `in_progress` and file `vector_status=indexing` while waiting for Qdrant recovery.
- Existing Telegram path is reused: `notifyCourseError` sends only after the 3-hour retry window is exhausted for retryable outages, or immediately for non-retryable Qdrant configuration errors.
- Stage 2 Qdrant upload now uses 5 short in-job attempts by default, preserves Qdrant SDK `status`/`data` details, and has a 15-minute document-processing timeout.
- Durable docs updated in `packages/course-gen-platform/src/stages/stage2-document-processing/README.md` and `docs/features/automatic-generation-mode.md`.
- Stage summary: `.codex/stages/mc2-evr7l/summary.md`.

## Verification

- Focused Vitest passed: `judge-helpers`, `job-processor`, `database-service.completion-check`, `career-playbook-course-bridge.service` — 65 tests.
- Focused Vitest passed: `phase-6-qdrant-upload`, `qdrant-recovery-policy` — 7 tests.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed.
- `pnpm type-check` passed.
- `pnpm build` passed.
- Graphify refreshed after `mc2-0cihf` with final result 54,794 nodes / 79,233 edges / 3,405 communities.
- Graphify refreshed after `mc2-evr7l` with final result 54,222 nodes / 78,728 edges / 3,372 communities.

## Explicit defers

- Live/dev/prod data repair was not performed. Existing affected courses, including generated secretary course `c5cd1cc8-f24b-4f55-9dcd-795dbc0d6aa9` and failed secretary course `c3662efb-4632-4902-945a-ad1e013ddde1`, need explicit authorization for mutation/regeneration/backfill/restart.
- Stage 2 delayed Qdrant recovery currently re-runs document processing work on each delayed retry. A larger optimization to persist/reuse embeddings or resume from vector-upload checkpoints is deferred and should be tracked separately if needed.
- Pre-existing build warnings were not fixed: Browserslist `caniuse-lite` stale and Node `[DEP0169] url.parse()` deprecation in `next build`.
- Pre-existing dirty files remain outside this stage scope: `AGENTS.md`, `CLAUDE.md`, `.codex/orchestrator.toml`, and pre-existing Beads working state.

## Next recommended

Next stage id: `mc2-course-data-repair`
Recommended action: after reviewing this code patch, authorize a bounded data repair/regeneration plan if the generated secretary course must be corrected in-place or the failed `sekretar` course should be restarted.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Continue from `mc2-0cihf` and `mc2-evr7l`: inspect the completed local code fixes and decide whether to run a bounded data repair/regeneration/restart for affected courses. Start by reading `.codex/stages/mc2-0cihf/summary.md`, `.codex/stages/mc2-evr7l/summary.md`, `bd show mc2-0cihf`, `bd show mc2-evr7l`, and the latest `git status`. Do not mutate Dev/stage/production data, deploy, push, or create a PR without explicit current-task authorization.

## Closeout Markers

docs-reviewed: updated - `docs/career-playbook/architecture.md`, `packages/course-gen-platform/src/stages/stage2-document-processing/README.md`, `docs/features/automatic-generation-mode.md`, and this handoff reflect the new bridge/sanity/Qdrant recovery behavior.
graph-reviewed: updated - final `graphify update . --force` completed after `mc2-evr7l` code/docs changes.
