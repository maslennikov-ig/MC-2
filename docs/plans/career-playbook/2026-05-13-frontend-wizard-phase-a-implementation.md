# Career Playbook Frontend Wizard Phase A Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the authorized-user Phase A Career Playbook wizard with fixed questions, draft persistence, autosave hooks, and localized UI.

**Architecture:** Keep route wiring in `app/[locale]/career-playbook/new`, reusable wizard UI in `components/career-playbook/wizard`, and state/persistence in `stores/use-career-playbook-store.ts`. The store owns answers, branching, local persistence, and a thin injectable tRPC adapter so unit tests do not require the backend skeleton to be implemented.

**Tech Stack:** Next.js 15 App Router, React 19, next-intl, Zustand 5 with Immer and persist, shadcn/Radix UI primitives, Vitest, Playwright.

---

## Parallel Decomposition Matrix

| Stream                  | Mode                   | Write zone                                                                                                                                                                     | Depends on             | Reason                                                   |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------- |
| A: Store and unit tests | Parallel worker        | `packages/web/stores/use-career-playbook-store.ts`, `packages/web/tests/unit/career-playbook-store.test.ts`                                                                    | none                   | Store behavior is isolated from visual layout.           |
| B: Wizard components    | Parallel worker        | `packages/web/components/career-playbook/wizard/*`, component tests if needed                                                                                                  | planned store API only | Components can be built against a stable store contract. |
| C: Route, i18n, e2e     | Sequential integration | `packages/web/app/[locale]/career-playbook/new/*`, `packages/web/messages/*/career-playbook.json`, `packages/web/src/i18n/config.ts`, `packages/web/types/i18n.d.ts`, e2e spec | A and B                | Needs final imports, selectors, and copy.                |

## Task 1: Store And Fixed Question Model

**Files:**

- Create: `packages/web/stores/use-career-playbook-store.ts`
- Create: `packages/web/tests/unit/career-playbook-store.test.ts`

**Step 1: Write failing tests**

Cover:

- initializes RU/EN fixed questions with optional `company_stage` hidden for `team_size` `201-1000` and `1000+`
- records fixed answers and advances to the next visible question
- persists only draft-safe fields
- queues autosave submissions through an injectable client without failing the local draft when the remote call rejects
- hydrates a server draft into local state

Run:

```bash
pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts
```

Expected: fail because the store file does not exist.

**Step 2: Implement minimal store**

Use Zustand `persist(immer(...))`, frontend fixed-question fallback data, selectors for visible questions/progress, and `setCareerPlaybookClientForTests` for unit tests. Do not call billing/payment code.

**Step 3: Verify GREEN**

Run the same Vitest command and require all new store tests to pass.

## Task 2: Wizard UI Components

**Files:**

- Create: `packages/web/components/career-playbook/wizard/QuestionRenderer.tsx`
- Create: `packages/web/components/career-playbook/wizard/ProgressIndicator.tsx`
- Create: `packages/web/components/career-playbook/wizard/Wizard.tsx`
- Optional test: `packages/web/tests/unit/components/career-playbook/wizard.test.tsx`

**Step 1: Write failing component test**

Cover:

- progress text and bar reflect visible questions
- open, single-choice, and multi-choice questions render accessible controls
- answered state enables next navigation
- free-form draft dialog stores text without leaving the wizard

Run:

```bash
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx
```

Expected: fail because components do not exist.

**Step 2: Implement minimal components**

Use existing UI primitives (`Button`, `Input`, `Textarea`, `RadioGroup`, `Checkbox`, `Progress`, `Dialog`) and lucide icons. Keep the interface dense and work-focused; no landing-page hero or decorative orb background.

**Step 3: Verify GREEN**

Run the same component test command and then the store test command.

## Task 3: Route, I18n, And E2E

**Files:**

- Create: `packages/web/app/[locale]/career-playbook/new/page.tsx`
- Create: `packages/web/app/[locale]/career-playbook/new/page-client.tsx`
- Create: `packages/web/messages/ru/career-playbook.json`
- Create: `packages/web/messages/en/career-playbook.json`
- Modify: `packages/web/src/i18n/config.ts`
- Modify: `packages/web/types/i18n.d.ts`
- Create: `packages/web/tests/e2e/career-playbook/wizard-phase-a.spec.ts`

**Step 1: Write failing route/e2e checks**

Add route/client unit tests and an e2e spec that verify:

- unauthenticated users see the auth-required state instead of the wizard
- authenticated rendering starts a best-effort Career Playbook backend session
- Phase A answer flow preserves local draft persistence and conditional `company_stage` behavior
- dirty answers are not dropped when session start succeeds or autosave races with edits
- authenticated Playwright flow runs when `TOKEN` is available; local no-token runs still verify the auth guard

Run:

```bash
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/page.test.tsx tests/unit/components/career-playbook/page-client.test.tsx
pnpm --filter @megacampus/web exec playwright test tests/e2e/career-playbook/wizard-phase-a.spec.ts
```

Expected: fail before the route/auth/session wiring exists.

**Step 2: Implement route and translations**

Use server `page.tsx` for locale setup, metadata, and `getCurrentUser()` auth gating. Use client components for the auth-required state and interactive wizard rendering. Add `career-playbook` namespace to config and i18n types.

**Step 3: Verify targeted checks**

Run:

```bash
pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/wizard.test.tsx tests/unit/components/career-playbook/page-client.test.tsx tests/unit/components/career-playbook/page.test.tsx
pnpm --filter @megacampus/web exec playwright test tests/e2e/career-playbook/wizard-phase-a.spec.ts
pnpm --filter @megacampus/web type-check
pnpm lint
```

## Task 4: Stage Closeout

**Files:**

- Create/update: `.codex/stages/mc2-db696.4/summary.md`
- Create/update: `.codex/stages/mc2-db696.4/artifacts/*.md`
- Modify: `.codex/handoff.md`

**Step 1: Request review**

Use visible Codex review subagents for implementation review before closing the stage.

**Step 2: Run canonical verification**

Run:

```bash
python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.4 --verify-group code_change_commands
```

**Step 3: Deliver**

Close `mc2-db696.4`, run `bd dolt push`, commit, push a stacked branch, and open a draft PR targeting `feature/career-playbook-backend-3`.
