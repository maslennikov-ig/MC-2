# Stage mc2-db696.7 Summary

Status: ready for delivery
Branch: feature/career-playbook-landing
Base: feature/career-playbook-frontend-phase-b @ 883df2e462e53aad86347b3d488b5e3d5883f9e7

## Scope

Career Playbook marketing landing at `/career-playbook`: shader hero, methodology section, annotated interactive B2B sales Role Guide demo, localized SEO metadata, JSON-LD, CTA to the constructor, unit tests, and Playwright smoke.

## Current Design Decision

- Keep the landing public and unauthenticated; the CTA sends users to `/career-playbook/new`, where existing auth gating applies.
- Adapt Lazyweb references into the existing MC2 dark shader/shadcn/lucide visual language:
  - Storylane/Workday: interactive demo/category pattern.
  - Chameleon: expandable methodology-card behavior.
  - Craft/Genius: document preview with annotation affordances.
- Use static localized demo excerpts paraphrased from `docs/job-descriptions/sales-manager-b2b.md`; do not add live backend generation or billing/payment scope.
- JSON-LD uses an absolute page URL built from `NEXT_PUBLIC_SITE_URL || NEXT_PUBLIC_APP_URL`; Next metadata canonical/OG remain locale-aware relative paths resolved by the App Router metadata layer.

## Parallel Streams

- `repo-conventions`: read-only explorer for route, metadata, i18n, and test patterns.
- `demo-content`: read-only explorer for sample Role Guide excerpts and methodology mapping.
- `code-review`: read-only reviewer; accepted P2 feedback for absolute JSON-LD URL and covered it with RED -> GREEN unit regression.
- Local orchestrator owns route/components/i18n/tests and final verification.

## Verification

- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/landing-page.test.tsx tests/unit/components/career-playbook/methodology.test.tsx`: passed, 6 tests.
- `pnpm --filter @megacampus/web test tests/unit/components/career-playbook tests/unit/career-playbook-store.test.ts`: passed, 44 tests.
- Scoped ESLint for new landing files and tests: passed.
- `pnpm type-check`: passed.
- `pnpm lint`: passed with existing warnings outside the landing scope.
- `pnpm --filter @megacampus/web exec playwright test tests/e2e/career-playbook/landing.spec.ts --project=chromium`: passed, 1 test.
- `pnpm build`: passed.

## Explicit Defers

- Real backend follow-up/generation transport remains tracked as `mc2-db696.12`.
- PDF export remains tracked as `mc2-db696.8`.
- JD/course bridge remains tracked as `mc2-db696.9`.
- Library/share/RLS/public viewer remains tracked as `mc2-db696.10`.
