# Code Review: Enrichment Org-Level Authorization Fix

**Date**: 2026-03-18
**Commit**: ee213ee4
**Scope**: Fix enrichment authorization to allow org members, not just course owners
**Files**: 2 changed | **Changes**: +105 / -104

## Summary

|              | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Issues       | 0        | 1    | 1      | 0   |
| Improvements | —        | 1    | 1      | 0   |

**Verdict**: NEEDS WORK (1 High issue — same bug exists in 12+ other locations)

## Issues

### High

#### 1. Same owner-only auth bug exists in 12+ other server actions/API routes

- **Files**: Multiple (listed below)
- **Problem**: The fixed pattern (`course.user_id !== currentUser.id` without org check) is replicated in at least 12 other locations across the codebase. Org members will face the same "Unauthorized" errors for course operations like cancel, pause, resume, restart-stage, refinement, etc.
- **Impact**: Any non-owner org member (e.g., the liliya.kustova user who triggered this fix) will also be blocked from these operations on courses belonging to other org members.
- **Affected files**:
  - `app/actions/refinement.ts:75` — getChatTokenEstimates (owner-only)
  - `app/actions/refinement.ts:258` — fetchCourseStructure (owner-only)
  - `app/actions/courses.ts:646` — cancelCourse (owner-only)
  - `app/actions/courses.ts:749` — another course action (owner-only)
  - `app/api/courses/[orgSlug]/[courseSlug]/cancel/route.ts:47,279` — cancel API (owner-only)
  - `app/api/courses/[orgSlug]/[courseSlug]/pause/route.ts:43` — pause API (owner-only)
  - `app/api/courses/[orgSlug]/[courseSlug]/resume/route.ts:42` — resume API (owner-only)
  - `app/api/courses/[orgSlug]/[courseSlug]/restart-stage/route.ts:76` — restart-stage API (owner-only)
  - `app/api/courses/[orgSlug]/[courseSlug]/check-status/route.ts:41,155` — check-status API (has admin fallback but no org check)
  - `app/[locale]/courses/actions.ts:609` — togglePublishStatus (has admin fallback)
  - `app/[locale]/courses/actions.ts:685` — updateCourseVisibility (has admin fallback)
- **Fix**: Refactor `verifyCourseAccess` to a shared utility (e.g., `lib/auth-helpers.ts`) and replace all 12+ occurrences. Some already have admin-role fallbacks which should be preserved as an additional layer.

### Medium

#### 2. `verifyCourseAccess` is local to enrichment-actions.ts — not reusable

- **File**: `app/actions/enrichment-actions.ts:18`
- **Problem**: The new `verifyCourseAccess` helper is defined as a module-private function. The 12+ other files that need the same fix cannot use it.
- **Impact**: When fixing Issue #1, each file would need its own copy, creating DRY violations.
- **Fix**: Move `verifyCourseAccess` to `lib/auth-helpers.ts` alongside `getCurrentUser()`, export it, and import from there in all server actions.

## Improvements

### High

#### 1. Extract `organization_id` from JWT instead of extra DB query

- **File**: `lib/auth-helpers.ts:45-56`
- **Current**: A new Supabase query to the `users` table is added to fetch `organization_id`, adding ~50ms latency to **every** server action that calls `getCurrentUser()`.
- **Recommended**: The `organization_id` is already included in the JWT as a custom claim (per T047 implementation — `custom_access_token_hook`). The JWT is already decoded at line 35 to extract `role`. Extract `organization_id` from the same payload:
  ```typescript
  // Current (line 35):
  role = payload.role || 'student';
  // Add:
  organizationId = payload.organization_id || null;
  ```
  This eliminates the extra DB round-trip and is consistent with how the backend tRPC middleware reads org from JWT.

### Medium

#### 2. Inconsistent error reporting to UI

- **File**: `app/actions/enrichment-actions.ts:45` + `components/course/viewer/components/EnrichmentCard.tsx:276`
- **Current**: `verifyCourseAccess` returns `error: 'Unauthorized'` but the UI shows generic `t('viewer.deleteFailed')` ("Failed to delete enrichment") regardless of error type. User has no idea it's an auth issue.
- **Recommended**: Pass the server action error through to the toast, or at minimum distinguish auth errors:
  ```typescript
  // In handleDelete:
  toast.error(
    result.error === 'Unauthorized' ? t('viewer.unauthorized') : t('viewer.deleteFailed')
  );
  ```

## Positive Patterns

1. **Discriminated union return type** on `verifyCourseAccess` (`{ authorized: true } | { authorized: false; error: string }`) is clean and type-safe — forces callers to check before proceeding.
2. **Null-safe org comparison** — `currentUser.organizationId && course.organization_id === currentUser.organizationId` correctly handles all null/undefined edge cases (null org user, null org course, mismatched orgs).
3. **DRY extraction** — replacing 6 identical auth blocks with a single helper is a solid refactor.
4. **Defense-in-depth** — the backend tRPC procedure also validates org-level access, so even if the frontend check were bypassed, the backend would still enforce authorization.

## Escalation

- **Authorization logic change**: This changes who can manage enrichments (from owner-only to owner+org-members). This matches the backend behavior and is the intended fix, but it's worth confirming this is the desired access model for all 6 enrichment operations.

## Validation

- Type Check: **PASS**
- Build: **PASS**
