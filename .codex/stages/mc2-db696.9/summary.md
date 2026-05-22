# mc2-db696.9 Career Playbook JD Bridge

## Current Decision

Implement the MVP bridge on branch `codex/career-playbook-jd-bridge` from `origin/codex/career-playbook-generation-status`.

Delivery: draft PR #36, https://github.com/maslennikov-ig/MC-2/pull/36, targeting `codex/career-playbook-generation-status`.

Accepted scope:

- Backend creates the course from a completed Career Playbook.
- Backend creates synthetic markdown source documents through the existing Stage 1 upload path.
- Backend starts the existing generation initiation path.
- Frontend adds a Library action and modal for completed Role Guides.
- No billing/payment work.

Deferred from this stage:

- Pre-course user upload from the modal. Current upload requires a `courseId`; adding pre-create uploads would require a larger upload contract change.
- Private viewer route `/career-playbook/[id]`. Current worktree has Library and public viewer only.

## Routing Evidence

- Context7 checked tRPC v11 procedure patterns, Supabase JS v2 insert/select behavior, and Next.js App Router client navigation.
- Supabase MCP checked current `courses` and `file_catalog` schema.
- Visible read-only subagents mapped backend and frontend implementation surfaces.

## Beads

- `mc2-db696.9` parent task is closed.
- `mc2-db696.9.1` backend service/router is closed.
- `mc2-db696.9.2` frontend modal/action is closed.
- `mc2-db696.9.3` review/verification is closed.
- Review follow-ups `mc2-zpsrx`, `mc2-e728b`, `mc2-5pkbz`, and `mc2-3v79s` are closed.
- `mc2-db696.11` is now unblocked for live tests/smoke/staging verification.

## Review Decisions

Accepted and fixed:

- `mc2-zpsrx`: rollback the created course and synthetic source documents when generation initiation fails.
- `mc2-e728b`: reuse persisted Career Playbook web research before running a fresh web search.
- `mc2-5pkbz`: add a bridge-specific server-side rate limit to protect web research, storage, and generation initiation.
- `mc2-3v79s`: remove the disabled pre-upload action from the MVP dialog.
- Physical synthetic file cleanup on DB insert failure and course rollback was fixed inside the backend service.
- Role profile extraction now follows the real `CareerPlaybookRoleProfileSpecSchema` shape.

Rejected or deferred:

- Reusing the full Stage 1 upload service is deferred for MVP. The bridge writes trusted server-generated markdown into `file_catalog` with `vector_status = pending`; adapting the full user-upload path would introduce quota and upload-contract behavior that does not match this generated-source flow. A smaller shared helper remains a bounded future cleanup if another generated-source path appears.

## Verification Evidence

- Backend targeted unit: `SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_KEY=test-service-key pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts` - 41 passed.
- Frontend targeted unit: `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx` - 8 passed.
- Artifact validation: `scripts/orchestration/validate_artifact.py .codex/stages/mc2-db696.9/artifacts/review-correctness.md .codex/stages/mc2-db696.9/artifacts/review-improvements.md` - passed.
- `pnpm type-check` - passed.
- `pnpm lint` - passed with existing warnings outside this stage.
- `pnpm build` without env failed at `packages/web` env validation for missing Supabase variables; rerun with local test env passed: `SUPABASE_SERVICE_ROLE_KEY=test-service-role NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon pnpm build`.
- `scripts/orchestration/run_process_verification.sh` - passed.
- Playwright project e2e on default `localhost:3000` was invalid because that port already served another Next app (`apps_console`) and returned 404. A browser smoke on isolated `PORT=3100` verified `/ru/career-playbook/new` unauthenticated auth gate renders correctly. TOKEN-backed live generation flow is deferred to `mc2-db696.11`.

Project index reviewed: no update needed; existing index already lists Career Playbook routes, backend stage areas, and targeted e2e command shape.
