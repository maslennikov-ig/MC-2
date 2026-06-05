# Orchestrator Handoff

Updated: 2026-06-05
Stage: `mc2-yfhm6`
Branch: `codex/career-playbook-visibility-owner`

## Current State

- `career_playbooks.visibility` is now canonical with values `private`, `organization`, and `public`; `is_public` remains a synchronized compatibility mirror for public links.
- Canonical mutation added: `careerPlaybook.library.updateVisibility({ playbookId, visibility })`; legacy `careerPlaybook.share.shareToggle` maps to `public`/`private`.
- Library listing is scoped at the database query level and selects only library-card columns, avoiding all-tenant `select('*')` through the admin client.
- Business-context source rows are owner/superadmin-only because they may contain raw private company context.
- Library/viewer responses include `visibility`, `ownerId`, `viewerPermissions`; organization readers get read-only library cards and a clean reader without edit/management layers.
- Follow-up `mc2-k2qih` remains open for panel animation, active TOC section, and TOC auto-scroll polish.

## Verification

- Passed targeted backend unit tests: `career-playbook-library-service.test.ts` and `career-playbook-visibility-migration.test.ts`.
- Passed targeted web unit tests: `library-page-client.test.tsx` and `viewer.test.tsx`.
- Passed targeted Prettier, web ESLint, and backend ESLint with one non-blocking warning: `library-service.ts` exceeds `max-lines`.
- Passed `pnpm type-check` and `pnpm build`; only existing Browserslist and `url.parse()` warnings appeared.
- Visible read-only reviewer agents completed; must-fix findings were addressed before final gates.

## Next recommended

Next stage id: pick the next ready Beads task.
Recommended action: merge/deploy only after explicit user request; otherwise continue with `mc2-k2qih` panel/TOC polish.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads task `mc2-yfhm6`, stage summary `.codex/stages/mc2-yfhm6/summary.md`, and Graphify report. Inspect the feature branch `codex/career-playbook-visibility-owner`. Do not touch the separate worktree `/home/me/code/mc2-worktrees/career-playbook-business-context`.

## Delivery

- No merge/deploy has been requested for this feature branch yet.
- docs-reviewed: updated - Career Playbook README/architecture, project index, stage summary, and handoff reflect the new access model.
- graph-reviewed: updated - Graphify refreshed with `graphify update .` and `graphify cluster-only . --no-viz`.

## Explicit defers

- Browser smoke for owner/non-owner authenticated Career Playbook records is deferred until suitable test data/session is available.
- Reader panel animation and TOC scroll polish is tracked separately in Beads task `mc2-k2qih`.
