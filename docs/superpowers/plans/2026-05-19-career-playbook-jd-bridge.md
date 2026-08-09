# Career Playbook JD Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP path that turns a completed Career Playbook Role Guide into a generated course.

**Architecture:** The backend owns course creation, synthetic source creation, and generation initiation so the frontend does not need a pre-existing `courseId`. The frontend adds a Library action and modal for completed playbooks, then navigates to the returned generation URL. User-uploaded extra materials stay out of this MVP because the current upload API requires a course before upload.

**Tech Stack:** tRPC v11, Supabase JS v2, Vitest, Next.js App Router client components, next-intl, existing Career Playbook and course generation routers.

**Execution status:** Implemented on `codex/career-playbook-jd-bridge`; authoritative closeout evidence lives in `.codex/stages/mc2-db696.9/summary.md`. The checkboxes below preserve the original execution plan rather than acting as the task ledger; Beads remains the source of truth.

---

## Design Decisions

- Use `careerPlaybook.courseBridge.createCourseFromPlaybook` as the public mutation.
- Require authenticated instructor-level behavior by checking `ctx.user` and ownership through the Career Playbook row; do not add billing or payment.
- Build a deterministic course brief from completed `generated_blocks`, `role_profile_spec`, `q_a_data`, and denormalized role columns.
- Run bounded Career Playbook web research through the existing Tavily helper. If the key is missing, search fails, or search times out, continue with a local synthetic markdown document derived from the Role Guide.
- Persist sources by using the existing Stage 1 `uploadFile` path with generated `.md` files and `vector_status='pending'`; this lets `generation.initiate` start Stage 2 normally.
- Extract generation initiation into a reusable service and keep the existing `generation.initiate` router behavior unchanged.
- Return `{ success, courseId, redirectUrl, sourceDocumentIds, generationCode }`.
- Frontend uses `router.push(redirectUrl)` from a Client Component, matching current Next.js App Router guidance.

## Parallel Decomposition Matrix

| Stream   | Goal                                         | Agent                                 | Write Zone                                                                                                                                                        | Dependencies                                    | Verification                              | Decision                     | Reason                                                |
| -------- | -------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------- | ---------------------------- | ----------------------------------------------------- |
| Backend  | Service, schema, router, reusable initiation | Local orchestrator or backend worker  | `packages/course-gen-platform/src/server/routers/career-playbook/*`, `packages/course-gen-platform/src/server/routers/generation/lifecycle/*`, backend unit tests | Existing Stage 1 upload and generation initiate | Targeted Vitest, type-check               | Start first                  | Defines the mutation contract.                        |
| Frontend | Library button, modal, adapter, i18n, tests  | Local orchestrator or frontend worker | `packages/web/app/[locale]/career-playbook/library/*`, `packages/web/components/career-playbook/*`, messages, frontend unit tests                                 | Backend response contract                       | Targeted Vitest, accessibility assertions | Can run after contract fixed | UI does not need backend internals.                   |
| Review   | Correctness/improvement/security review      | Visible review subagents              | Report artifacts only                                                                                                                                             | Backend/frontend complete                       | Review reports plus local verification    | Run after GREEN              | User explicitly requested independent review streams. |

## Task 1: Backend RED Tests

**Files:**

- Modify: `packages/course-gen-platform/tests/unit/server/routers/career-playbook.router.test.ts`
- Create: `packages/course-gen-platform/tests/unit/server/routers/career-playbook-course-bridge.service.test.ts`

- [ ] **Step 1: Replace the skeleton router assertion**

Change the existing `keeps course bridge procedures as skeletons for later tasks` test into a RED test that expects `createCourseFromPlaybook` to:

```ts
expect(result).toMatchObject({
  success: true,
  courseId: '44444444-4444-4444-8444-444444444444',
  redirectUrl: '/courses/acme/product-lead/generating',
  sourceDocumentIds: ['file-role-guide', 'file-web-kpis'],
});
```

The mock chain must include `career_playbooks`, `courses`, `file_catalog`, and `organizations` rows as needed by the service.

- [ ] **Step 2: Add service unit tests**

Cover these cases:

```ts
it('extracts course brief from blocks 6, 7, 8, 14, and 21');
it('creates a fallback role-guide source when web research is unavailable');
it('creates web research source markdown with source URLs when search succeeds');
it('rolls back the created course when synthetic source upload fails');
it('reuses the generation initiation service with the created course id');
```

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm --filter @megacampus/course-gen-platform test:unit -- tests/unit/server/routers/career-playbook.router.test.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts
```

Expected: tests fail because the bridge still throws `METHOD_NOT_SUPPORTED` and the service does not exist.

## Task 2: Backend GREEN Implementation

**Files:**

- Create: `packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts`
- Modify: `packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.router.ts`
- Modify: `packages/course-gen-platform/src/server/routers/career-playbook/_shared.ts`
- Create: `packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.service.ts`
- Modify: `packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.router.ts`

- [ ] **Step 1: Add input and output schemas**

`_shared.ts` gets:

```ts
export const createCourseFromPlaybookInputSchema = playbookIdInputSchema.extend({
  includeWebResearch: z.boolean().default(true),
});
```

- [ ] **Step 2: Extract initiation service**

Move the body of `generation.initiate` into:

```ts
export async function initiateCourseGeneration(params: {
  ctx: Context;
  input: { courseId: string; webhookUrl?: string | null };
}): Promise<{
  success: true;
  jobId: string | undefined;
  message: string;
  courseId: string;
  generationCode: string;
}> { ... }
```

The router becomes a thin call to `initiateCourseGeneration({ ctx, input })`.

- [ ] **Step 3: Implement brief extraction**

`buildCourseBridgeBrief(playbook)` returns:

```ts
{
  title,
  slugBase,
  courseDescription,
  targetAudience,
  learningOutcomes,
  language,
  courseSize: 'medium',
  settings: { source: 'career_playbook', playbookId: playbook.id }
}
```

Use generated block IDs as preferred source, with row fields and `final_markdown` fallback.

- [ ] **Step 4: Implement synthetic markdown creation**

Create markdown documents:

```md
# Career Playbook source: <title>

Source: Career Playbook
Playbook ID: <id>

<final markdown or extracted block summary>
```

and, when web research has sources:

```md
# Web research for <title>

## Sources

- <url>

## KPI insights

...
```

Upload each document with `uploadFile({ courseId, organizationId, userId, filename, fileSize, mimeType: 'text/markdown', fileContent: Buffer.from(markdown).toString('base64') })`.

- [ ] **Step 5: Implement course creation and generation start**

Insert a row into `courses` with brief fields, `status: 'draft'`, `generation_status: null`, `has_files: true`, and a collision-safe slug. Then upload sources and call `initiateCourseGeneration`.

- [ ] **Step 6: Run GREEN**

Run the targeted backend command from Task 1. Expected: all targeted backend tests pass.

## Task 3: Frontend RED Tests

**Files:**

- Modify: `packages/web/tests/unit/components/career-playbook/library-page-client.test.tsx`
- Create: `packages/web/tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx`

- [ ] **Step 1: Extend adapter mock**

Mock:

```ts
createCourseFromPlaybook: vi.fn();
```

from `@/components/career-playbook/library/client-adapter`.

- [ ] **Step 2: Add Library assertions**

Cover:

```ts
expect(within(completedCard).getByRole('button', { name: 'Create course' })).toBeInTheDocument();
expect(within(generatingCard).queryByRole('button', { name: 'Create course' })).toBeNull();
```

- [ ] **Step 3: Add modal assertions**

Cover:

```ts
await user.click(screen.getByRole('button', { name: 'Create course' }));
expect(screen.getByRole('dialog', { name: 'Create course from Role Guide' })).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Start without extra materials' }));
expect(createCourseFromPlaybook).toHaveBeenCalledWith({
  playbookId: 'pb-1',
  includeWebResearch: true,
});
```

- [ ] **Step 4: Run RED**

Run:

```bash
pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx
```

Expected: tests fail because the adapter and dialog do not exist.

## Task 4: Frontend GREEN Implementation

**Files:**

- Modify: `packages/web/components/career-playbook/library/client-adapter.ts`
- Modify: `packages/web/components/career-playbook/library/types.ts`
- Create: `packages/web/components/career-playbook/viewer/CreateCourseFromPlaybookDialog.tsx`
- Modify: `packages/web/app/[locale]/career-playbook/library/page-client.tsx`
- Modify: `packages/web/messages/ru/career-playbook.json`
- Modify: `packages/web/messages/en/career-playbook.json`

- [ ] **Step 1: Add adapter method**

`createCourseFromPlaybook(input)` calls:

```ts
client.careerPlaybook?.courseBridge?.createCourseFromPlaybook.mutate(input);
```

and throws a clear unavailable error if the procedure is absent.

- [ ] **Step 2: Add dialog component**

The dialog contains the existing-design action copy, one primary button for starting without extra materials, an informative disabled secondary path for adding materials after the course is created, loading state, error state, and `router.push(result.redirectUrl)` after success.

- [ ] **Step 3: Wire Library card action**

Only `status === 'completed'` cards render the dialog trigger. Use a small outline button with a `BookOpenCheck` or similar lucide icon and keep the card radius at `rounded-md`.

- [ ] **Step 4: Run GREEN**

Run the targeted frontend command from Task 3. Expected: all targeted frontend tests pass.

## Task 5: Review and Verification

**Files:**

- Create: `.codex/stages/mc2-db696.9/artifacts/review-correctness.md`
- Create: `.codex/stages/mc2-db696.9/artifacts/review-improvements.md`
- Modify: `.codex/stages/mc2-db696.9/summary.md`

- [ ] **Step 1: Request visible subagent reviews**

Spawn separate correctness and improvement reviewers with file references, Beads task IDs, and verification commands.

- [ ] **Step 2: Accept or reject each finding**

For each finding, record:

```md
- Finding: ...
- Decision: accepted | rejected
- Reason: ...
- Follow-up Beads: <id or none>
```

- [ ] **Step 3: Run local verification**

Run:

```bash
pnpm --filter @megacampus/course-gen-platform test:unit -- tests/unit/server/routers/career-playbook.router.test.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts
pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx
pnpm type-check
pnpm lint
scripts/orchestration/run_process_verification.sh
```

- [ ] **Step 4: Close Beads and push Beads data**

Close `mc2-db696.9.1`, `mc2-db696.9.2`, and `mc2-db696.9.3` only after verification passes or bounded defers are filed.
