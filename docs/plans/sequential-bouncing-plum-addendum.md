# Addendum to `sequential-bouncing-plum`

## Purpose

This addendum updates the original migration plan with missing scope and corrections discovered during implementation progress.

## Scope Corrections (Mandatory)

1. Add missing server action migration:
   - `packages/web/app/actions/courses.ts`
   - Function: `triggerCourseGeneration()`
   - Replace direct `fetch(${backendUrl}/trpc/generation.initiate)` with `getServerTrpcClient().generation.initiate.mutate(...)`.

2. Correct upload route assumption:
   - `packages/web/app/api/coursegen/upload/route.ts` is JSON/base64, not multipart.
   - Input stays: `courseId`, `filename`, `fileSize`, `mimeType`, `fileContent`.
   - Migrate to `getServerTrpcClient().generation.uploadFile.mutate(...)`.

3. Error mapping for API routes must be explicit (no blanket `400`):
   - `UNAUTHORIZED -> 401`
   - `FORBIDDEN -> 403`
   - `NOT_FOUND -> 404`
   - `TOO_MANY_REQUESTS -> 429`
   - `BAD_REQUEST -> 400`
   - `INTERNAL_SERVER_ERROR -> 500`
   - fallback: `error.data?.httpStatus ?? 500`

4. Keep infrastructure proxy out of scope:
   - Do not refactor `packages/web/app/api/trpc/[...path]/route.ts` in this task.

5. `jobs.getStatus` note:
   - `/trpc/jobs.getStatus 404` may be expected race condition after job cleanup.
   - Do not treat this class of 404 as a primary blocker for this migration.

## Current Priority Delta

### P0 (finish first)

1. `packages/web/app/actions/courses.ts` (`triggerCourseGeneration`)
2. `packages/web/app/api/coursegen/upload/route.ts`
3. Unify tRPC error-to-HTTP mapping in already migrated routes:
   - `packages/web/app/api/coursegen/partial-generate/route.ts`
   - `packages/web/app/api/coursegen/generate/route.ts`
   - `packages/web/app/api/coursegen/lesson-content/route.ts`
   - `packages/web/app/api/coursegen/job-status/route.ts` (same mapping standard)

### P1

1. Complete remaining server actions that still use raw backend calls:
   - `packages/web/app/actions/refinement.ts`
   - `packages/web/app/actions/document-actions.ts`
   - `packages/web/app/actions/admin-logs.ts`
   - `packages/web/app/[locale]/courses/actions.ts`

2. Remove `as any` introduced during migration where possible:
   - Prefer typed input via `Parameters<typeof client.router.proc.mutate>[0]` or shared schema-inferred types.

### P2

1. Client-side raw fetch migration (separate PR if needed):
   - `packages/web/hooks/useAutoCard.ts`
   - `packages/web/lib/hooks/useEnrichmentGeneration.ts`
   - `packages/web/components/course/CourseVisualsManager.tsx`

## Compatibility Rules

1. Keep compatibility response shape in compatibility API routes:
   - Return `{ result: { data: ... } }` where existing frontend consumers expect it.

2. Preserve pre-validation/auth checks in Next API routes for user-friendly errors.

## Verification Additions

1. Type/build:
   - `pnpm type-check`
   - `pnpm --filter web build`

2. Raw-call audit:
   - `rg -n "fetch\\(.*TRPC_URL|fetch\\(.*\\/trpc\\/" packages/web/app packages/web/lib packages/web/hooks packages/web/components`

3. Behavioral checks:
   - Partial generation no longer fails with 400.
   - Stage approval / apply proposal / retry document path no longer fails due to malformed tRPC payload.
   - Upload route works via typed tRPC call using existing JSON/base64 contract.
