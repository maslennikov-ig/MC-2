# Orchestrator Handoff

Updated: 2026-05-26
Branch: `codex/hallmark-hero-redesign`
Base: `origin/develop` at `557bada7`

## Current State

- `mc2-fpnf2` (`Redesign home Hero with Hallmark variants`) is closed.
- Selected Hero variant was committed as `284120f7` and promoted to `develop`.
- Dev merge commit is `557bada7` (`dev: merge codex/hallmark-hero-redesign into develop`).
- GitHub Actions run `26461501129` completed successfully, including `Deploy to Dev`.
- Dev health check passed: `https://dev.ai.megacampus.ru/api/health` returned `{"status":"ok"}`.
- Dev route checks returned 200 for `/courses` and `/career-playbook`.
- Browser smoke on `https://dev.ai.megacampus.ru/` passed at 375px and 1440px.

## Delivered Changes

- Home Hero now uses the selected Hallmark-derived product split layout.
- Left side keeps the main value proposition and creation CTAs:
  - `Создать инструкцию` -> `/career-playbook/new`
  - `Создать курс` -> `/create`
- Right side shows two product cards:
  - `Должностные инструкции`
  - `Курсы`
- Product card links point to landing pages:
  - `Узнать больше об инструкциях` -> `/career-playbook`
  - `Узнать больше о курсах` -> `/courses`
- Desktop connection between products is a centered arrow with the existing Tooltip component.
- Mobile connection text is inline between cards because hover is unavailable.
- The temporary Hero lab route/component was removed.
- The local Hallmark skill and `.hallmark/preflight.json` were added for repeatable future design work.

## Verification

- Local red/green test flow:
  - new Hero unit test failed before implementation, then passed after the selected variant was moved into production.
- Local focused verification passed:
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/common/hero-content.test.tsx`
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/common/hero-content.test.tsx tests/unit/components/layouts/header.test.tsx`
  - `pnpm --filter @megacampus/web lint`
  - `pnpm --filter @megacampus/web type-check`
  - `pnpm --filter @megacampus/web build`
  - browser smoke for the home Hero at 320/375/414/768/1440 px
- Local root verification passed:
  - `pnpm type-check`
  - `pnpm build`
- CI/CD run `26461501129` passed on `develop`:
  - Security Audit
  - Type Check
  - Lint
  - Unit Tests
  - Build Packages
  - Contract Tests
  - Docker builds
  - Deploy to Dev
- Post-deploy smoke passed:
  - health endpoint returned ok
  - new Hero text is present on dev
  - CTA hrefs are correct on mobile and desktop
  - desktop tooltip appears on the arrow
  - Info icon is not rendered
  - no horizontal overflow at 375px or 1440px

## Next Recommended

Use `bd ready` for the next task. No follow-up task is required for the Hero delivery itself.

## Starter Prompt For Next Orchestrator

Use `$orchestrator-stage` in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads state, and `git status`. Current delivered state: selected Hallmark Hero variant is live on Dev via `develop` run `26461501129`, task `mc2-fpnf2` is closed, and post-deploy browser smoke passed.

## Explicit Defers

- No staging/production deploy was performed; the user explicitly asked for dev.
- No backend, schema, course generation, Career Playbook generation, ESCO, or role-suggestion data changes were included.
- Existing build warnings remain: stale Browserslist data, Node `url.parse()` deprecation warnings, and Supabase Edge Runtime warnings during web build.
