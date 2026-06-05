# Orchestrator Handoff

Updated: 2026-06-05
Stage: `mc2-saz6x`
Branch: `develop`

## Current State

- Career Playbook visibility and owner-only access shipped to dev and staging/master.
- `career_playbooks.visibility` is canonical: `private | organization | public`; `is_public` remains a synchronized public-link compatibility mirror.
- Library/viewer responses include `visibility`, `ownerId`, and `viewerPermissions`; organization readers get read-only cards and reader UI without edit/management layers.
- Legacy `careerPlaybook.share.shareToggle` remains a compatibility wrapper over canonical visibility.
- Feature branch `codex/career-playbook-visibility-owner` remains pushed with implementation commit `c22caf99` and CI test hotfix `8813cfb6`.
- Follow-up `mc2-k2qih` remains open for panel animation, active TOC section, and TOC auto-scroll polish.

## Verification

- Local deploy script passed `pnpm type-check` and `pnpm build` before merging `develop` into `master`.
- Dev delivery: `develop` `367e4c77`, GitHub Actions run `27028026312` completed success; `https://dev.ai.megacampus.ru/api/health` returned `200` with `{"status":"ok"}`.
- Staging delivery: `master` `9893ea29`, GitHub Actions run `27029012143` completed success; `https://ai.megacampus.ru/api/health` returned `200` with `{"status":"ok"}`.
- First dev run `27027456907` failed full backend unit tests because an older router transport test missed the new `.or()` query builder and visibility payload expectations; fixed in `8813cfb6` and rerun passed.
- Master `Integration Tests` job failed non-blocking while the overall workflow and `Deploy to Production` succeeded; this matches tracked follow-up `mc2-yyxzc`.

## Next recommended

Next stage id: `mc2-k2qih`.
Recommended action: polish Career Playbook reader panel animation and TOC sync.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads task `mc2-k2qih`, stage summary `.codex/stages/mc2-saz6x/summary.md`, and Graphify report. Do not touch the separate worktree `/home/me/code/mc2-worktrees/career-playbook-business-context` unless the user explicitly asks.

## Delivery

- docs-reviewed: updated - handoff and stage summary now record the delivered dev/staging state; stable Career Playbook docs were already updated in stage `mc2-yfhm6`.
- graph-reviewed: no-change-needed - delivery/test-only hotfix did not change code architecture or module boundaries after the implementation graph refresh in `mc2-yfhm6`.

## Explicit defers

- Browser smoke for owner/non-owner authenticated Career Playbook records remains deferred until suitable test data/session is available.
- Non-blocking master Integration Tests failure remains tracked in Beads task `mc2-yyxzc`.
