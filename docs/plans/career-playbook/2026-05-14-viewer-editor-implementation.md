# Career Playbook Viewer Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Phase 6 frontend viewer for generated Career Playbooks with block navigation, local edit/regenerate controls, actions, streaming view, and tests.

**Architecture:** The route `/[locale]/career-playbook/[id]` is an authenticated App Router page that passes `locale` and `playbookId` into a client component. The frontend store owns a viewer snapshot and optional client seams for future backend procedures; when backend procedures are unavailable, the UI shows a clearly marked local preview/pending-backend state instead of pretending external actions succeeded. Viewer components are presentational and accept callbacks from the page client.

**Tech Stack:** Next.js 15 App Router, React, Zustand + immer, `@megacampus/shared-types`, shadcn UI, lucide-react, next-intl, Vitest, Playwright.

---

### Task 1: Store Viewer State And Client Seams

**Files:**

- Modify: `packages/shared-types/src/career-playbook.ts`
- Modify: `packages/web/stores/use-career-playbook-store.ts`
- Test: `packages/web/tests/unit/career-playbook-store.test.ts`

**Steps:**

1. Write failing store tests for loading a viewer snapshot, preserving 27 ordered entries (`header` + `block_1`...`block_26`), editing a block locally, regenerating a block with an instruction, and surfacing backend-unavailable action status.
2. Run `pnpm --filter @megacampus/web test tests/unit/career-playbook-store.test.ts` and confirm RED.
3. Add shared block catalog metadata and viewer types using existing `CareerPlaybookBlockId` and `CareerPlaybookBlockState`.
4. Extend `CareerPlaybookClient` with optional viewer methods and extend store state/actions for viewer load/edit/regenerate/action status.
5. Run the same store test and confirm GREEN.

### Task 2: Viewer Components

**Files:**

- Create: `packages/web/components/career-playbook/viewer/PlaybookViewer.tsx`
- Create: `packages/web/components/career-playbook/viewer/BlockEditor.tsx`
- Create: `packages/web/components/career-playbook/viewer/ActionsBar.tsx`
- Create: `packages/web/components/career-playbook/viewer/StreamingView.tsx`
- Test: `packages/web/tests/unit/components/career-playbook/viewer.test.tsx`

**Steps:**

1. Write failing component tests for sticky TOC labels, collapsible blocks, markdown/Mermaid rendering handoff, edit dialog save, regenerate dialog submit, actions bar pending status, and thinking-stream toggle.
2. Run `pnpm --filter @megacampus/web test tests/unit/components/career-playbook/viewer.test.tsx` and confirm RED.
3. Implement components with existing shadcn Button/Dialog/Collapsible/Textarea/Switch and `MarkdownRendererFull`/`MarkdownRendererClient`.
4. Keep page sections unframed and cards only for repeated block items/dialogs.
5. Run the component test and confirm GREEN.

### Task 3: Route And Page Client

**Files:**

- Create: `packages/web/app/[locale]/career-playbook/[id]/page.tsx`
- Create: `packages/web/app/[locale]/career-playbook/[id]/page-client.tsx`
- Modify: `packages/web/app/[locale]/career-playbook/new/auth-required-client.tsx`
- Test: `packages/web/tests/unit/components/career-playbook/viewer-page.test.tsx`

**Steps:**

1. Write failing route tests for Next.js 15 Promise `params`, auth guard, and viewer client handoff.
2. Run `pnpm --filter @megacampus/web test tests/unit/components/career-playbook/viewer-page.test.tsx` and confirm RED.
3. Add the server page using Next.js 15 Promise `params`, auth guard, metadata, and the client page.
4. Keep viewer copy local to the new components for this phase; no locale message files are changed.
5. Run the route test and confirm GREEN.

### Task 4: Smoke And Closeout

**Files:**

- Add: `packages/web/tests/e2e/career-playbook/viewer-editor.spec.ts`
- Add stage artifacts under `.codex/stages/mc2-db696.6/`.
- Update `.codex/handoff.md`.

**Steps:**

1. Add/adjust a focused e2e smoke for auth guard and, if feasible, local viewer preview behavior.
2. Run targeted unit tests, `pnpm --filter @megacampus/web type-check`, `pnpm lint`, and relevant Playwright smoke.
3. Request visible code review subagent and fix blocking findings.
4. Run `scripts/orchestration/run_stage_closeout.py --stage mc2-db696.6`.
5. Close Beads, `bd dolt push`, commit, push, and open a stacked draft PR targeting `feature/career-playbook-frontend-phase-b`.
