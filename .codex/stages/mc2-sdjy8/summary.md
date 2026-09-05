# Stage mc2-sdjy8 — Debt closeout 2026-09-05

Date: 2026-09-05

Status: accepted. Acceptance owner: root.

Level: release

Delivered implementation: `94cd02f16` + `f1444efe4` on `develop`; release `v0.31.44`.

## Outcome

An audit of open debt (Beads, GitHub, leftover markers, skipped tests, CI runs, branches) found
one live regression and a tail of six-month-old items. Everything found was closed in one
stage, in six delegated Opus streams plus root work, and one epic parked since August was
landed:

- **The nightly price sync was red again two nights after its 2026-09-03 fix.** Its full unit
  suite launches Playwright Chromium, which the job never installed, and a 10-minute
  `timeout-minutes` cancelled it the night before without a Telegram message because
  `failure()` is false for a cancelled job. Now: Chromium install step, 25 minutes,
  `failure() || cancelled()`.
- **Section regeneration wrote `cost_usd: 0`.** The call was already priced at the call; only
  the read-back was missing. `recordLlmCallCost` returns the price it wrote, a collector drains
  LangChain's background callbacks, and the history entry carries the recorded cost or omits it.
- **Six February leftover markers.** Three implemented (asset URL extraction, Stage 5 job schema
  alignment via one shared builder, module tier from the course), three replaced by recorded
  decisions. The schema work exposed a live defect: five Stage 5 producers enqueued only the
  snake_case payload, so a permanent failure reached the error log with `organizationId`
  undefined. Fixed producer-side with `buildStructureGenerationJobData`.
- **Jina spend in the quality gates (mc2-sv89s).** Cost context threaded from four Stage 2/4/5
  callers through `QualityValidator` and `semanticMatch` to the embedder; `RETRIEVAL_DEFERRED` is
  empty and the guard was red before, green after.
- **Two moderate advisories.** `qs` 6.16.0 and `@xmldom/xmldom` 0.8.15 through the existing
  overrides. The first attempt used an open range, resolved to 0.9.12 and broke mammoth's DOCX
  fallback on CI only; pinned inside the major in `f1444efe4`.
- **docling-mcp #134** has an upstream PR: `docling-project/docling-mcp#135`.
- **Helixa AIOS bridge (mc2-gxese)** landed: blockers merged, six triggers on live tables
  reviewed and three database defects repaired (`extensions.digest`, `SECURITY DEFINER` on the
  `file_catalog` guard, three indexes), the inbound HTTP transport built
  (`POST /api/integrations/helixa/generation/{dispatch,lookup}`, HMAC over the raw body, 22 tests),
  a `CREATE_JOB_INSTRUCTION` scheduler that did not exist, a `live` mode, nginx locations, and
  eight migrations applied to the one shared Supabase project (7 tables, 6 triggers, 32
  functions, 0 bindings — data-gated off). `docs/helixa/megacampus-side.md` is the contract and
  go-live recipe; `docs/helixa/handoff-for-helixa.md` is the prompt for the Helixa side.

## Verification and delivery evidence

- Root acceptance on the integrated branch: `pnpm type-check` 0 errors across all packages;
  `pnpm -F @megacampus/course-gen-platform lint` 0 warnings; unit suite 541 files passed / 14
  skipped, 8502 tests passed / 128 skipped.
- The local tree could not install the new lockfile (`.modules.yaml` still points at an August
  sibling worktree), so the dependency change had its first real run on CI: run `33960070623`
  failed on the xmldom major bump, run for `f1444efe4` is the accepted one.
- Migrations applied through Supabase MCP, in file order, each recorded in
  `supabase_migrations.schema_migrations`; post-apply query confirmed one overload of
  `schedule_helixa_course_from_role_guide`, `prosecdef = true` on the file guard, and
  `search_path = public, extensions` on the proof-capture trigger.
- `check_stranded_commits.py` clean after both deliveries; the three Helixa branches and their
  worktrees removed, allowlist entries removed with them.

## Explicit defers

- `mc2-zxzgf`: the 105 lessons with the English Mermaid fallback stay as they are (owner ruling
  2026-08-28); regeneration is paid and irreversible on published courses.
- `mc2-vlskb`: waits on upstream PR #135; `mc2-z08mv`, `mc2-x72bq`, `mc2-vjbb` unchanged.
- The Helixa bridge is delivered but not provisioned: no binding row, no shared secret, both mode
  variables unset. Go-live is §9 of `docs/helixa/megacampus-side.md` and needs the two joint
  values in the handoff's §4.

graph-reviewed: blocked — the primary tree cannot reinstall, and `graphify update .` after a
release that deletes code needs `--force`; deferred to the next closeout with a clean install.

project-index: reviewed-no-change — orchestrator.toml only moved current_stage_id and the three stage paths to mc2-sdjy8; no module, directory or entrypoint changed.
docs-reviewed: updated - docs/helixa/megacampus-side.md (contract, trigger review, rollback, env vars, go-live recipe), docs/helixa/handoff-for-helixa.md (Helixa-side prompt), .codex/handoff.md, .codex/repository-failure-modes.md (two new traps), CHANGELOG.md and RELEASE_NOTES.md by the release.
