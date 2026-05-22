# Career Playbook Marketing Landing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `/career-playbook` marketing landing with methodology cards, an annotated interactive Role Guide demo, localized metadata, and SEO structure.

**Architecture:** Keep the route server wrapper in `packages/web/app/[locale]/career-playbook/page.tsx`, the localized landing composition in `page-client.tsx`, and reusable methodology/demo UI under `packages/web/components/career-playbook/methodology`. Use the existing MC2 ShaderBackground, shadcn primitives, lucide icons, and next-intl namespace already introduced by the wizard work.

**Tech Stack:** Next.js 15 App Router, React 19, next-intl, Tailwind/shadcn, lucide-react, Vitest, Playwright.

---

## Routing Notes

- Context7 Next.js docs confirm App Router `params` are Promise-wrapped in current Next.js and must be awaited in `page.tsx` and `generateMetadata`.
- Context7 next-intl docs confirm localized metadata should use `getTranslations({ locale, namespace })`; client UI should use `useTranslations(namespace)`.
- Lazyweb references selected: Storylane/Workday interactive demo grids, Chameleon expandable cards, Craft/Genius document-preview annotation patterns.

## Parallel Decomposition Matrix

| Stream                    | Goal                                                | Agent           | Write zone                                                                                                              | Dependencies         | Verification               | Decision   | Reason                                                        |
| ------------------------- | --------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------- | ---------- | ------------------------------------------------------------- |
| A: Docs/UI routing        | Confirm current framework and UI reference patterns | local           | read-only                                                                                                               | none                 | stage notes                | completed  | Context7 and Lazyweb are already queried.                     |
| B: Repo conventions       | Identify page, metadata, and test conventions       | explorer        | read-only                                                                                                               | none                 | explorer summary           | parallel   | Independent read-only work.                                   |
| C: Demo content           | Extract sample Role Guide and methodology mapping   | explorer        | read-only                                                                                                               | none                 | explorer summary           | parallel   | Independent content analysis.                                 |
| D: Landing implementation | Route, client, methodology/demo components, i18n    | local           | `packages/web/app/[locale]/career-playbook/*`, `packages/web/components/career-playbook/methodology/*`, messages, tests | RED tests            | Vitest/e2e/type/lint/build | sequential | Route, copy, and components share a single coherent UI slice. |
| E: Review                 | Independent implementation review                   | review subagent | read-only                                                                                                               | after GREEN/refactor | findings/fixes             | sequential | Required before closeout.                                     |

## Task 1: RED Tests

**Files:**

- Create: `packages/web/tests/unit/components/career-playbook/landing-page.test.tsx`
- Create: `packages/web/tests/unit/components/career-playbook/methodology.test.tsx`

**Steps:**

1. Add route/page tests for localized metadata, client render, CTA, methodology count, demo preview, and JSON-LD.
2. Add component tests for five methodology cards, 26 block chips, annotation buttons, and active demo excerpt switching.
3. Run targeted Vitest and confirm failure because the route/components do not exist.

## Task 2: Landing Route And Client

**Files:**

- Create: `packages/web/app/[locale]/career-playbook/page.tsx`
- Create: `packages/web/app/[locale]/career-playbook/page-client.tsx`

**Steps:**

1. Implement server page with awaited `params`, `setRequestLocale`, `generateMetadata`, OpenGraph/Twitter metadata, alternates, and JSON-LD script.
2. Implement client landing composition using ShaderBackground, localized copy, CTA to `/career-playbook/new`, methodology section, interactive demo, value section, FAQ, and final CTA.
3. Keep hero text over the full-bleed shader scene, not inside a card.

## Task 3: Methodology And Demo Components

**Files:**

- Create: `packages/web/components/career-playbook/methodology/MethodologySection.tsx`
- Create: `packages/web/components/career-playbook/methodology/InteractiveDemo.tsx`

**Steps:**

1. Implement typed props that receive resolved localized copy from the page client.
2. Use shadcn/lucide affordances, compact cards, responsive grids, tooltips, and tabs/buttons where useful.
3. Preserve stable dimensions for preview panes, cards, buttons, and block chips.

## Task 4: I18n And E2E

**Files:**

- Modify: `packages/web/messages/ru/career-playbook.json`
- Modify: `packages/web/messages/en/career-playbook.json`
- Create: `packages/web/tests/e2e/career-playbook/landing.spec.ts`

**Steps:**

1. Add `landing` namespace strings in RU and EN.
2. Add an unauthenticated landing e2e smoke for hero, CTA, methodology, and demo controls.
3. Run targeted unit/e2e checks until green.

## Task 5: Verification And Closeout

**Files:**

- Create/update: `.codex/stages/mc2-db696.7/summary.md`
- Create/update: `.codex/stages/mc2-db696.7/artifacts/landing.md`
- Modify: `.codex/handoff.md`

**Steps:**

1. Request visible Codex code review and fix findings.
2. Run targeted tests, `pnpm type-check`, `pnpm lint`, `pnpm build`, process verification, and stage closeout.
3. Close `mc2-db696.7`, run `bd dolt push`, commit, push, and open a stacked draft PR targeting `feature/career-playbook-frontend-phase-b`.
