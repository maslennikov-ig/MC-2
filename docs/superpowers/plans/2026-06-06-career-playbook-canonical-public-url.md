# Career Playbook Canonical Public URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public Career Playbook links use a course-like, organization-scoped URL and share controls copy that URL instead of the authenticated viewer URL.

**Architecture:** Keep the owner/editor route at `/career-playbook/[id]`. Add the public route `/career-playbooks/[orgSlug]/[playbookSlug]`, where `playbookSlug` is readable text plus a short unique suffix. Store the full public slug in `career_playbooks.share_slug`; expose `organizationSlug` in library/viewer/public responses so clients can build canonical links.

**Tech Stack:** Next.js App Router, tRPC, Supabase admin client, Vitest/React Testing Library.

---

### Task 1: Backend Public URL Contract

**Files:**

- Modify: `packages/course-gen-platform/src/server/routers/career-playbook/library-service.ts`
- Test: backend Career Playbook router/service unit tests or nearest existing targeted tests

- [x] Add `organizationSlug` to library item/detail/public response shapes.
- [x] Generate new public `share_slug` from `position_title` plus a six-character unique suffix.
- [x] Keep public lookup guarded by `visibility='public'`, `status='completed'`, and non-empty `final_markdown`.
- [x] Verify targeted backend tests.

### Task 2: Frontend Public Route And Share Controls

**Files:**

- Create: `packages/web/app/[locale]/career-playbooks/[orgSlug]/[playbookSlug]/page.tsx`
- Create/modify: route data helper for canonical public lookup
- Modify: `packages/web/app/[locale]/career-playbook/[id]/page-client.tsx`
- Modify: `packages/web/app/[locale]/career-playbook/library/page-client.tsx`
- Modify: `packages/web/components/career-playbook/viewer/PlaybookViewer.tsx`
- Modify: `packages/web/components/career-playbook/viewer/ActionsBar.tsx`
- Modify: `packages/web/messages/{ru,en}/career-playbook.json`

- [x] Add a public route that renders the existing public viewer by canonical slug and validates `orgSlug`.
- [x] Add a helper to build absolute canonical URLs from `locale`, `organizationSlug`, and `shareSlug`.
- [x] Make viewer `Поделиться` copy the canonical URL only when the playbook is public and has `shareSlug`.
- [x] Make library owner card copy/open the canonical URL for public playbooks.
- [x] Remove user-facing English fallback labels in touched share controls.
- [x] Verify targeted web tests.

### Task 3: Docs And Closeout

**Files:**

- Modify: `.codex/handoff.md`
- Modify: `.codex/project-index.md`
- Add/update: `.codex/stages/mc2-db696.51/summary.md`

- [x] Record the new canonical public URL entrypoint.
- [x] Run targeted tests, `pnpm type-check`, and `pnpm build`.
- [x] Close or update Beads based on verification.
