# Orchestrator Handoff

Updated: 2026-06-06
Stage: `mc2-db696.51`
Branch: `codex/career-playbook-canonical-public-url`

## Current State

- Career Playbook canonical public URLs are implemented on this branch.
- Owner/editor route remains authenticated: `/[locale]/career-playbook/[id]`.
- Public route is now organization-scoped: `/[locale]/career-playbooks/[orgSlug]/[playbookSlug]`.
- `share_slug` generation now uses readable role-title slug plus a 6-character hex suffix; legacy random `cp-...` slugs are regenerated when a playbook is published through the visibility service.
- Backend library/detail/public responses expose `organizationSlug` so frontend share controls do not guess URL namespaces.
- Library cards and the reader inspector copy/open the canonical public URL for owner-managed public playbooks.
- Old `/[locale]/share/career-playbook/[slug]` route remains available for compatibility, but no redirect was added per user direction.
- Other worktree `/home/me/code/mc2-worktrees/career-playbook-business-context` remains untouched.

## Verification

- `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/career-playbook-library-service.test.ts` passed: 5 tests.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/share-page.test.tsx` passed: 22 tests.
- Targeted `prettier --check` for changed files passed.
- Targeted ESLint for changed backend/web files passed with one warning: existing `max-lines` warning in `library-service.ts`.
- `pnpm type-check` passed.
- `pnpm build` passed; Next build output includes dynamic route `/[locale]/career-playbooks/[orgSlug]/[playbookSlug]`.

## Next recommended

Next stage id: `mc2-db696.51`.
Recommended action: commit and push this branch, then merge/deploy only after the user explicitly asks for delivery.
Recommended action: after deployment, republish any existing test playbooks that still have legacy `cp-...` slugs if readable URLs are desired for those rows.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads task `mc2-db696.51`, stage summary `.codex/stages/mc2-db696.51/summary.md`, and Graphify report. Continue from branch `codex/career-playbook-canonical-public-url`. Do not touch `/home/me/code/mc2-worktrees/career-playbook-business-context` unless explicitly requested.

## Delivery

- docs-reviewed: updated - handoff, project index, and stage summary record the canonical public Career Playbook route and verification.
- graph-reviewed: updated - ran `graphify update .` and `graphify cluster-only . --no-viz`; report shows 57328 nodes and 79493 edges.

## Explicit defers

- No legacy redirect or migration for already-public test rows; republishing regenerates legacy `cp-...` slugs through service logic.
- Browser smoke against live dev is deferred until after deploy because this branch is not yet deployed.
