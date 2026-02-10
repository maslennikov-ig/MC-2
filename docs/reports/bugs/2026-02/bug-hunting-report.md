---
report_type: bug-hunting
generated: 2026-02-10T12:00:00Z
version: 2026-02-10
status: success
agent: bug-hunter (claude-opus-4-6)
files_processed: ~450
issues_found: 27
critical_count: 5
high_count: 8
medium_count: 9
low_count: 5
modifications_made: false
---

# Bug Hunting Report

**Generated**: 2026-02-10
**Project**: mc2 (MegaCampus AI Monorepo)
**Packages Analyzed**: web, course-gen-platform, shared-types, shared-utils, shared-logger
**Total Issues Found**: 27
**Status**: Build and type-check PASS. Security and logic issues found.

---

## Executive Summary

The codebase is in generally good shape -- both `pnpm type-check` and `pnpm build` pass cleanly. However, the security audit found **5 critical** issues including timing-unsafe comparisons for API keys and Telegram auth, a potential SSRF vector in the content generation endpoint, unsanitized body pass-through to Supabase updates, and session data leakage in the registration endpoint. There are also **8 high-priority** runtime and logic bugs including non-atomic course deletion, inconsistent dev-bypass logic, and the webhook route using user-scoped Supabase client instead of admin.

### Key Metrics

- **Critical Issues**: 5
- **High Priority Issues**: 8
- **Medium Priority Issues**: 9
- **Low Priority Issues**: 5
- **Build Status**: PASS
- **Type-check Status**: PASS
- **Modifications Made**: No

---

## Critical Issues (Priority 1)

_Immediate attention required -- Security vulnerabilities, data loss risks_

### CRITICAL-1: Timing-Unsafe API Key Comparison

- **File**: `packages/web/lib/auth.ts:225`
- **Category**: Security -- Timing Attack
- **Description**: The `authenticateApiKey()` function uses `===` to compare API keys, which is vulnerable to timing attacks. An attacker can measure response time differences to incrementally guess the API key character by character.
- **Impact**: API key can be guessed via timing side-channel if the endpoint is network-accessible.
- **Fix**: Use `crypto.timingSafeEqual()` for the comparison.

```typescript
// CURRENT (vulnerable):
return apiKey === validApiKey;

// FIX:
import crypto from 'crypto';
const a = Buffer.from(apiKey);
const b = Buffer.from(validApiKey);
return a.length === b.length && crypto.timingSafeEqual(a, b);
```

### CRITICAL-2: Timing-Unsafe Telegram Auth Hash Comparison

- **File**: `packages/web/app/api/telegram/connect/route.ts:51`
- **Category**: Security -- Timing Attack
- **Description**: The `verifyTelegramAuth()` function uses `!==` to compare HMAC hashes. This is the same timing attack vulnerability as CRITICAL-1. Ironically, the webhook endpoint (`webhooks/coursegen/route.ts:66-71`) correctly uses `crypto.timingSafeEqual()`, showing the pattern is known but not applied consistently.
- **Impact**: Telegram auth can be forged via timing side-channel.
- **Fix**: Use `crypto.timingSafeEqual()` for the hash comparison.

```typescript
// CURRENT (vulnerable):
if (calculatedHash !== hash) {

// FIX:
const hashBuffer = Buffer.from(hash)
const calculatedBuffer = Buffer.from(calculatedHash)
if (hashBuffer.length !== calculatedBuffer.length ||
    !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
```

### CRITICAL-3: SSRF Vector in Content Generation Webhook URL

- **File**: `packages/web/app/api/content/generate/route.ts:87-98`
- **Category**: Security -- SSRF (Server-Side Request Forgery)
- **Description**: The endpoint accepts a user-supplied `webhook` URL and makes an HTTP request to it. While there is an allowlist check via `ALLOWED_WEBHOOK_HOSTS`, the check is **skipped entirely** when the environment variable is empty or not set (`allowedWebhookHosts.length > 0`). This means by default, any authenticated user can make the server send HTTP requests to arbitrary URLs including internal services (`http://localhost`, `http://169.254.169.254` for cloud metadata, etc.).
- **Impact**: Authenticated users can probe internal network, access cloud metadata endpoints, or use the server as a proxy for attacks.
- **Fix**: Deny requests when `ALLOWED_WEBHOOK_HOSTS` is not configured. Add private IP range validation.

```typescript
// CURRENT (allows all when env var is empty):
if (allowedWebhookHosts.length > 0 && !allowedWebhookHosts.includes(webhookUrl.host)) {

// FIX: Deny when not configured
if (allowedWebhookHosts.length === 0) {
  logger.error('ALLOWED_WEBHOOK_HOSTS not configured')
  return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
}
if (!allowedWebhookHosts.includes(webhookUrl.host)) {
```

### CRITICAL-4: Unsanitized Request Body Passed Directly to Database Update

- **File**: `packages/web/app/api/courses/[orgSlug]/[courseSlug]/route.ts:389`
- **Category**: Security -- Mass Assignment / Privilege Escalation
- **Description**: The PUT handler passes the raw request body directly to `supabase.update(body)` without any field filtering or validation. An attacker can update any column on the courses table including `user_id` (change ownership), `organization_id`, `generation_status`, `visibility`, or any other field. Even though RLS may provide some protection, the admin client is used here (`supabaseAdmin`), which bypasses RLS entirely.
- **Impact**: Authenticated users can modify any field on their courses (or ownerless courses), potentially escalating privileges, changing ownership, or corrupting data.
- **Fix**: Whitelist allowed fields before passing to the database.

```typescript
// CURRENT (dangerous):
const { data: course, error } = await supabaseAdmin
  .from('courses')
  .update(body) // <-- raw user input passed to admin client
  .eq('id', id);

// FIX: Whitelist fields
const allowedFields = ['title', 'course_description', 'visibility', 'style', 'target_audience'];
const sanitizedBody = Object.fromEntries(
  Object.entries(body).filter(([key]) => allowedFields.includes(key))
);
const { data: course, error } = await supabaseAdmin
  .from('courses')
  .update(sanitizedBody)
  .eq('id', id);
```

### CRITICAL-5: Registration Endpoint Leaks Magic Link Session Data

- **File**: `packages/web/app/api/auth/register/route.ts:206-224`
- **Category**: Security -- Information Disclosure / Auth Bypass
- **Description**: After creating a user, the endpoint generates a magic link using `supabaseAdmin.auth.admin.generateLink()` and returns the full `sessionData` in the response body. The `generateLink()` response includes the actual magic link URL with the authentication token. This means a client calling the registration endpoint gets a fully usable login token in the response without email verification.
- **Impact**: Email verification is effectively bypassed. Any automated script can register accounts and immediately authenticate without accessing the email.
- **Fix**: Remove `session: sessionData` from the response, or remove the magic link generation entirely.

```typescript
// CURRENT (leaking session):
return NextResponse.json(
  {
    message: 'Registration successful!...',
    user: { id: authData.user.id, email: authData.user.email, name: fullName },
    session: sessionData, // <-- REMOVE THIS
  },
  { status: 201 }
);
```

---

## High Priority Issues (Priority 2)

_Should be fixed before deployment -- Runtime bugs, logic errors, unsafe operations_

### HIGH-1: Non-Atomic Course Deletion Can Leave Orphaned Records

- **File**: `packages/web/app/api/courses/[orgSlug]/[courseSlug]/route.ts:192-286` and `delete/route.ts:168-263`
- **Category**: Data Integrity -- Race Condition
- **Description**: Course deletion performs multiple sequential deletes (assets, lessons, sections, course) without a database transaction. If any intermediate step fails or the server crashes mid-deletion, the database is left in an inconsistent state with orphaned records. The code logs errors from intermediate steps but continues to the next delete, meaning partial failures are silently accepted.
- **Impact**: Orphaned lessons, sections, or assets accumulate in the database over time. Foreign key violations may prevent future operations on affected records.
- **Fix**: Use a Supabase RPC function that wraps all deletions in a single transaction.

### HIGH-2: Webhook Endpoint Uses User-Scoped Client Instead of Admin

- **File**: `packages/web/app/api/webhooks/coursegen/route.ts:89`
- **Category**: Runtime Bug -- Auth/Permissions
- **Description**: The webhook handler calls `createClient()` which creates a user-scoped Supabase client (reads cookies from the request). Since webhooks come from n8n (a backend service), there are no user cookies, meaning the client has no authenticated session. This could cause all `.from().update()` operations to fail if RLS policies restrict access to authenticated users only.
- **Impact**: Webhook status updates may silently fail to update course records if RLS is enforced, leaving courses stuck in intermediate states.
- **Fix**: Use `getAdminClient()` instead of `createClient()` for webhook operations.

### HIGH-3: Inconsistent Dev Bypass Logic Across Delete Endpoints

- **File**: `packages/web/app/api/courses/[orgSlug]/[courseSlug]/route.ts:163,367` vs `delete/route.ts:92-103`
- **Category**: Security -- Inconsistent Access Control
- **Description**: Two different delete endpoints for the same resource have different dev bypass logic:
  - `route.ts:163`: `process.env.NODE_ENV === 'development' && user.id === 'dev-user'` (no production guard)
  - `delete/route.ts:92-103`: Full production safeguards with `isProductionEnv`, `devBypassFlag`, and multiple checks

  The simpler endpoint at `route.ts` would allow deletion if `NODE_ENV` is accidentally set to `development` in production, while the `delete/route.ts` endpoint properly guards against this.

- **Impact**: If `NODE_ENV=development` is misconfigured on a production server, the older DELETE endpoint allows unauthenticated deletion.
- **Fix**: Apply the same production safeguards from `delete/route.ts` to `route.ts`. Consider removing the duplicate endpoint.

### HIGH-4: Telegram Webhook Has No Authentication

- **File**: `packages/web/app/api/telegram/webhook/route.ts:195-229`
- **Category**: Security -- Missing Authentication
- **Description**: The Telegram webhook endpoint accepts POST requests without any verification that they actually come from Telegram. Telegram provides a mechanism to verify webhooks by setting a secret token in `setWebhook()` and checking the `X-Telegram-Bot-Api-Secret-Token` header. This endpoint does neither. Anyone who discovers the URL can send fake updates, potentially triggering bot responses to arbitrary chat IDs.
- **Impact**: An attacker can send crafted payloads to trigger bot responses, waste resources, or potentially confuse users with fake bot messages.
- **Fix**: Set a `secret_token` when registering the webhook with Telegram, and verify the `X-Telegram-Bot-Api-Secret-Token` header on incoming requests.

### HIGH-5: Missing `lesson_contents` Deletion in Course Delete

- **File**: `packages/web/app/api/courses/[orgSlug]/[courseSlug]/delete/route.ts:168-186`
- **Category**: Data Integrity -- Incomplete Cleanup
- **Description**: The course deletion handler deletes assets, lessons, sections, and the course, but does not delete `lesson_contents` records. The `lesson_contents` table has a `course_id` column (per project docs), so these records become orphaned after deletion. The same issue exists in the older `route.ts` delete handler.
- **Impact**: Orphaned `lesson_contents` records accumulate, wasting storage. If lesson content contains generated text, this could be significant data.
- **Fix**: Add `await supabase.from('lesson_contents').delete().eq('course_id', id)` before deleting lessons.

### HIGH-6: `getSession()` Used for Auth Instead of `getUser()` in Multiple API Routes

- **File**: `packages/web/app/api/coursegen/generate/route.ts:33-35`, `job-status/route.ts:44`, `partial-generate/route.ts:43`, `upload/route.ts:113`
- **Category**: Security -- Auth Weakness
- **Description**: Several API route proxies use `supabase.auth.getSession()` to check authentication. Per Supabase documentation, `getSession()` reads from local storage/cookies and does NOT validate the JWT with the server. It should only be used for reading cached session data, not for authentication decisions. The `getUser()` method validates the JWT against the Supabase auth server. Note: these routes also call `getUser()` separately for the initial auth check, but then use `getSession()` to obtain the access token, which is a less severe pattern since the token is forwarded to the backend for re-validation.
- **Impact**: While mitigated by backend re-validation, using `getSession()` means an expired or revoked token could still be forwarded. Low-probability but represents defense-in-depth weakness.
- **Fix**: Use `getUser()` consistently and obtain the access token from the same call.

### HIGH-7: Origin Header Used Unvalidated for Redirect URLs

- **File**: `packages/web/app/api/auth/register/route.ts:204-211`, `courses/share/route.ts:135,176`
- **Category**: Security -- Open Redirect
- **Description**: The registration endpoint uses `headersList.get('origin')` directly to construct a redirect URL for magic link generation (`redirectTo: ${origin}/dashboard`). The `origin` header is client-controlled and can be set to any URL. While this is somewhat mitigated by Supabase's redirect URL allowlist (if configured), the share endpoint also uses `origin` to construct share URLs returned to the user.
- **Impact**: If Supabase redirect allowlist is not configured, this enables open redirect attacks via the magic link.
- **Fix**: Validate the origin against a server-side allowlist before using it in URL construction.

### HIGH-8: Duplicate Course API Endpoints with Divergent Behavior

- **File**: `packages/web/app/api/courses/[orgSlug]/[courseSlug]/route.ts` (DELETE) vs `delete/route.ts` (POST)
- **Category**: Architecture -- Inconsistency
- **Description**: There are two separate endpoints that delete a course:
  1. `DELETE /api/courses/[orgSlug]/[courseSlug]` (in `route.ts`)
  2. `POST /api/courses/[orgSlug]/[courseSlug]/delete` (in `delete/route.ts`)

  They have different auth logic (see HIGH-3), different cleanup steps (only `delete/route.ts` calls external resource cleanup via tRPC), and use different Supabase clients (`supabaseAdmin` vs `getAdminClient()`). This makes it impossible to know which endpoint is actually being called in production.

- **Impact**: Confusing API surface, potential for using the wrong endpoint, inconsistent cleanup behavior.
- **Fix**: Deprecate one endpoint and redirect to the other. Ensure all callers use a single, correct endpoint.

---

## Medium Priority Issues (Priority 3)

_Should be scheduled for fixing -- Type safety, code quality_

### MEDIUM-1: `as any` Used to Bypass Translation Type Safety (37 occurrences)

- **Files**: `packages/web/components/course/generation-progress.tsx`, `EnrichmentCard.tsx`, `UnifiedEnrichmentCard.tsx`, `models-ranking-table.tsx`, `top-models-cards.tsx`
- **Category**: Type Safety
- **Description**: Dynamic translation keys are cast to `any` to bypass next-intl type checking: `t(rawError as any)`, `t('tiers.S' as any)`, etc. This means typos in translation keys won't be caught at compile time and will render as raw key strings in the UI.
- **Impact**: Translation keys with typos will show raw strings to users instead of translated text.
- **Fix**: Extend the translation types to include dynamic key patterns, or use `t.rich()` / `t.has()` for dynamic keys.

### MEDIUM-2: `as any` Used on Audit Log Client Bypasses Type Checking

- **File**: `packages/web/lib/audit-log.ts:66`
- **Category**: Type Safety
- **Description**: The admin client is cast to `any` before calling `.from('audit_log').insert()`. The comment says "due to TypeScript project reference caching issue" but this means the insert payload is not type-checked. A column rename or schema change would silently fail at runtime.
- **Fix**: Regenerate Supabase types to include the `audit_log` table properly.

### MEDIUM-3: `console.log` / `console.error` Used Instead of Logger in Production Code

- **Files**: `packages/web/app/api/telegram/connect/route.ts:29,52,60,105,116`, `telegram/webhook/route.ts:226`
- **Category**: Code Quality -- Debug Code in Production
- **Description**: The Telegram integration files use bare `console.error()` instead of the structured logger used everywhere else in the codebase (`logger.error()`). This bypasses the centralized logging infrastructure (error_logs table, structured metadata, severity tracking).
- **Impact**: Telegram-related errors are invisible in the admin logs dashboard and harder to correlate with other events.
- **Fix**: Replace all `console.error()` calls with `logger.error()`.

### MEDIUM-4: Webhook Secret Sent as Plain Header Instead of HMAC Signature

- **File**: `packages/web/app/api/content/generate/route.ts:101-108`
- **Category**: Security -- Weak Authentication
- **Description**: The content generation endpoint sends the webhook secret as a plain `X-Webhook-Secret` header instead of using HMAC signature verification. The comment says "Send webhook request with HMAC signature" but the implementation just sends the raw secret. Compare with the incoming webhook handler (`webhooks/coursegen/route.ts`) which correctly uses HMAC-SHA256 signature verification.
- **Impact**: The webhook secret is transmitted in cleartext in every request. If network traffic is intercepted, the secret is exposed.
- **Fix**: Compute HMAC-SHA256 of the request body using the secret, and send the signature in the header instead.

### MEDIUM-5: `@ts-expect-error` Used in Production Code (Not Just Tests)

- **Files**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/image-generation-service.ts:209`, `packages/web/lib/supabase/browser-client.tsx:28,30`, `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-dom-setup.ts:83,85,171,173,175`
- **Category**: Type Safety
- **Description**: `@ts-expect-error` annotations in production source code (not test files) suppress type errors. While each has a comment explaining why, this hides potential type mismatches that could cause runtime errors.
- **Impact**: If the underlying library types are fixed in an update, the suppressed errors may mask real issues.
- **Fix**: Create proper type declarations for the external APIs being used.

### MEDIUM-6: Metrics and API Key Health Endpoints Exposed Without Authentication

- **File**: `packages/course-gen-platform/src/server/routers/metrics.ts:71,112,135,164,190`, `pipeline-admin/api-keys.ts:463`
- **Category**: Security -- Information Disclosure
- **Description**: Multiple monitoring endpoints (`metrics.getAll`, `metrics.getFSM`, `metrics.getOutbox`, `metrics.getFallbacks`, `metrics.healthCheck`, `getApiKeysHealth`) are exposed as `publicProcedure` requiring no authentication. While intentionally public for Prometheus/Grafana integration, they expose internal system state including error counts, queue depths, failure reasons, and which API keys are configured.
- **Impact**: An attacker can enumerate system health, identify failure patterns, and determine which external services are configured. The error details may leak internal implementation information.
- **Fix**: Consider adding basic auth or IP-based filtering for the detailed metrics endpoints. Keep only `healthCheck` as truly public.

### MEDIUM-7: `.catch(() => {})` Pattern Used Extensively (~60 occurrences)

- **Files**: Across all API routes in `packages/web/app/api/`
- **Category**: Code Quality -- Silent Error Swallowing
- **Description**: The `.catch(() => {})` pattern is used pervasively for `logPermanentFailure()` calls. While silencing errors on best-effort logging is acceptable, the pattern is also applied to operations where failure should at least be logged, making it impossible to detect when the error logging infrastructure itself is broken.
- **Impact**: If the error logging table is unavailable (migration issue, RLS change), all error logging silently fails and the team has no visibility into production errors.
- **Fix**: Add a minimal fallback: `.catch((e) => console.error('Failed to log error:', e.message))` to at least surface logging infrastructure failures.

### MEDIUM-8: Supabase `getSession()` Usage Pattern

- **Files**: `packages/web/app/actions/courses.ts:199,258,452`, `lib/auth-helpers.ts:23`
- **Category**: Security -- Auth Pattern
- **Description**: Several server action files use `getSession()` instead of `getUser()` for authentication. While Supabase docs warn that `getSession()` should not be trusted for auth decisions (it reads from cookies without server validation), these are server actions where the session comes from server-side cookies. Still, `getUser()` provides stronger guarantees.
- **Impact**: Low probability but a defense-in-depth weakness.
- **Fix**: Migrate to `getUser()` consistently across all server actions.

### MEDIUM-9: `generation_trace` and `fsm_events` Not Cleaned Up on Course Delete

- **File**: `packages/web/app/api/courses/[orgSlug]/[courseSlug]/delete/route.ts`
- **Category**: Data Integrity
- **Description**: Course deletion does not clean up related records in `generation_trace` and `fsm_events` tables (referenced in project docs as having `course_id` and `entity_id` columns respectively). These diagnostic records accumulate indefinitely.
- **Impact**: Growing storage usage, potential foreign key issues if constraints are added later.
- **Fix**: Add deletion of `generation_trace` and `fsm_events` records during course cleanup.

---

## Low Priority Issues (Priority 4)

_Can be fixed during regular maintenance_

### LOW-1: Hardcoded Test Credentials in Tools Directory

- **Files**: `packages/course-gen-platform/tools/auth/setup-test-auth-users.ts:28,34,40`, `tools/auth/configure-auth.ts:32`
- **Category**: Code Quality
- **Description**: Hardcoded passwords like `test-password-123`, `test-password-456`, and `TestPassword123!` in tool scripts. While these are in a `tools/` directory (not production code), they could be confused with actual credentials.
- **Impact**: Minimal -- tools directory only, not deployed.
- **Fix**: Use environment variables for test credentials.

### LOW-2: Hardcoded Test UUIDs in E2E Scripts

- **Files**: `packages/course-gen-platform/scripts/e2e-express-auto-course.ts:55-56`, `e2e-micro-auto-course.ts:26-27`, `e2e-compact-auto-course.ts:34-35`, `e2e-mini-auto-course.ts:26-27`
- **Category**: Code Quality
- **Description**: Same hardcoded `TEST_ORG_ID` and `TEST_USER_ID` UUIDs (`9b98a7d5-...`, `ca704da8-...`) appear across multiple E2E scripts with `process.env` fallback. These point to specific database records that must exist for tests to work.
- **Impact**: Fragile test infrastructure. If these records are deleted, all E2E tests break.
- **Fix**: Create test fixtures programmatically or document the required seed data.

### LOW-3: Large First Load JS for Course Generation Page

- **Build Output**: `packages/web build`
- **Category**: Performance
- **Description**: The course generating page (`/[locale]/courses/[orgSlug]/[courseSlug]/generating`) has a First Load JS of **1.13 MB**, significantly larger than all other pages (most are 100-350 KB).
- **Impact**: Slow initial page load for users on slow connections, particularly relevant for the course generation monitoring page that users wait on.
- **Fix**: Lazy-load heavy components (graph visualization, rich editors) on the generating page.

### LOW-4: `MotionProps` Type Assertion in Sheet Component

- **File**: `packages/web/components/ui/sheet.tsx:35,45,169`
- **Category**: Type Safety
- **Description**: Multiple `as any` casts on motion component props suggest incompatibility between framer-motion types and the component's expected types. This is a common issue with framer-motion type definitions.
- **Impact**: Animation bugs would not be caught at compile time.
- **Fix**: Update framer-motion types or create proper type declarations.

### LOW-5: Missing `generation_trace` and `fsm_events` in Course Delete Comments

- **File**: `packages/web/app/api/courses/[orgSlug]/[courseSlug]/route.ts:196-197`
- **Category**: Documentation
- **Description**: Comments mention "Tests/questions tables will be added in future database schema updates" and list tables that "don't exist" -- but `lesson_contents`, `generation_trace`, and `fsm_events` do exist and should be cleaned up but are not mentioned.
- **Impact**: Misleading comments make it harder for developers to identify missing cleanup steps.
- **Fix**: Update comments to reflect actual table dependencies.

---

## Validation Results

### Type Check

**Command**: `pnpm type-check`
**Status**: PASS
**Exit Code**: 0

All 5 workspace packages pass TypeScript type checking.

### Build

**Command**: `pnpm build`
**Status**: PASS
**Exit Code**: 0

All packages build successfully including Next.js production build with 63 static pages.

---

## Metrics Summary

- **Security Vulnerabilities**: 8 (CRITICAL-1 through CRITICAL-5, HIGH-4, HIGH-7, MEDIUM-6)
- **Runtime/Logic Bugs**: 5 (HIGH-1, HIGH-2, HIGH-5, HIGH-6, MEDIUM-9)
- **Type Safety Issues**: 4 (MEDIUM-1, MEDIUM-2, MEDIUM-5, LOW-4)
- **Code Quality Issues**: 3 (MEDIUM-3, MEDIUM-4, MEDIUM-7)
- **Architecture Issues**: 2 (HIGH-3, HIGH-8)
- **Performance Issues**: 1 (LOW-3)
- **Data Integrity Issues**: 4 (HIGH-1, HIGH-5, MEDIUM-9, LOW-5)

---

## Task List

### Critical Tasks (Fix Immediately)

- [ ] **[CRITICAL-1]** Use `crypto.timingSafeEqual()` for API key comparison in `lib/auth.ts:225`
- [ ] **[CRITICAL-2]** Use `crypto.timingSafeEqual()` for Telegram hash comparison in `telegram/connect/route.ts:51`
- [ ] **[CRITICAL-3]** Deny webhook requests when `ALLOWED_WEBHOOK_HOSTS` is not configured in `content/generate/route.ts:95`
- [ ] **[CRITICAL-4]** Whitelist allowed fields in course update body in `courses/[orgSlug]/[courseSlug]/route.ts:389`
- [ ] **[CRITICAL-5]** Remove `session: sessionData` from registration response in `auth/register/route.ts:223`

### High Priority Tasks (Fix Before Deployment)

- [ ] **[HIGH-1]** Wrap course deletion in a database transaction (RPC function)
- [ ] **[HIGH-2]** Use `getAdminClient()` in webhook handler instead of `createClient()`
- [ ] **[HIGH-3]** Unify dev bypass logic across both delete endpoints
- [ ] **[HIGH-4]** Add Telegram webhook secret token verification
- [ ] **[HIGH-5]** Add `lesson_contents` deletion to course delete handler
- [ ] **[HIGH-6]** Replace `getSession()` with `getUser()` in API route auth checks
- [ ] **[HIGH-7]** Validate `origin` header against server-side allowlist
- [ ] **[HIGH-8]** Consolidate duplicate course delete endpoints

### Medium Priority Tasks (Schedule for Sprint)

- [ ] **[MEDIUM-1]** Fix dynamic translation key typing (37 `as any` casts in i18n)
- [ ] **[MEDIUM-2]** Regenerate Supabase types to include `audit_log` table
- [ ] **[MEDIUM-3]** Replace `console.error` with `logger.error` in Telegram files (6 occurrences)
- [ ] **[MEDIUM-4]** Use HMAC signature instead of plain secret in webhook requests
- [ ] **[MEDIUM-5]** Create proper type declarations for `@ts-expect-error` in production code
- [ ] **[MEDIUM-6]** Add auth or IP filtering to detailed metrics endpoints
- [ ] **[MEDIUM-7]** Add minimal fallback logging to `.catch(() => {})` patterns
- [ ] **[MEDIUM-8]** Migrate server actions from `getSession()` to `getUser()`
- [ ] **[MEDIUM-9]** Add `generation_trace` and `fsm_events` cleanup to course deletion

### Low Priority Tasks (Backlog)

- [ ] **[LOW-1]** Move test credentials to environment variables in tools/
- [ ] **[LOW-2]** Programmatically create test fixtures instead of hardcoded UUIDs
- [ ] **[LOW-3]** Code-split the generating page to reduce 1.13 MB bundle
- [ ] **[LOW-4]** Fix framer-motion type assertions in Sheet component
- [ ] **[LOW-5]** Update misleading comments about table existence in delete handlers

---

## Recommendations

1. **Immediate Actions (This Week)**:
   - Fix CRITICAL-1 through CRITICAL-5. These are all small, targeted changes.
   - CRITICAL-4 (mass assignment) and CRITICAL-5 (session leak) are the highest-risk.
   - CRITICAL-3 (SSRF) requires ensuring `ALLOWED_WEBHOOK_HOSTS` is set in all environments.

2. **Short-term (1-2 Weeks)**:
   - Consolidate the duplicate delete endpoints (HIGH-3, HIGH-8).
   - Fix the webhook Supabase client (HIGH-2) -- this may be causing silent failures.
   - Add `lesson_contents` to course deletion (HIGH-5).

3. **Long-term Refactoring**:
   - Create a database-level cascade delete or stored procedure for course cleanup.
   - Establish a security middleware pattern to avoid repeating timing-safe comparisons.
   - Consider an internal API gateway pattern to consolidate auth checks for tRPC proxies.

4. **Testing Gaps**:
   - No integration tests for the course deletion flow (including cleanup verification).
   - No security tests for the content generation SSRF protection.
   - No tests for the Telegram webhook endpoint.

---

## File-by-File Summary

<details>
<summary>Click to expand high-risk files</summary>

### High-Risk Files

1. `packages/web/app/api/content/generate/route.ts` -- SSRF (CRITICAL-3), weak webhook auth (MEDIUM-4)
2. `packages/web/app/api/auth/register/route.ts` -- Session leak (CRITICAL-5), origin validation (HIGH-7)
3. `packages/web/app/api/courses/[orgSlug]/[courseSlug]/route.ts` -- Mass assignment (CRITICAL-4), weak dev bypass (HIGH-3), duplicate endpoint (HIGH-8)
4. `packages/web/lib/auth.ts` -- Timing attack (CRITICAL-1)
5. `packages/web/app/api/telegram/connect/route.ts` -- Timing attack (CRITICAL-2), console.error (MEDIUM-3)
6. `packages/web/app/api/telegram/webhook/route.ts` -- No auth (HIGH-4), console.error (MEDIUM-3)
7. `packages/web/app/api/webhooks/coursegen/route.ts` -- Wrong Supabase client (HIGH-2)
8. `packages/web/app/api/courses/[orgSlug]/[courseSlug]/delete/route.ts` -- Missing cleanup (HIGH-5), non-atomic (HIGH-1)

</details>

---

_Report generated by bug-hunter agent (claude-opus-4-6)_
_No modifications made -- read-only analysis_
