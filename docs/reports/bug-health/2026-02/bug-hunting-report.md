# Bug Hunting Report

**Date**: 2026-02-06
**Project**: MegaCampusAI Monorepo (megacampus-monorepo v0.28.53)
**Branch**: develop
**Scan Scope**: Full monorepo (packages/web, packages/course-gen-platform, packages/shared-types, packages/shared-logger, packages/trpc-client-sdk)
**Files Analyzed**: 1688 TypeScript/TSX files
**Agent**: bug-hunter

---

## Summary

| Priority  | Count  |
| --------- | ------ |
| Critical  | 2      |
| High      | 5      |
| Medium    | 12     |
| Low       | 6      |
| **Total** | **25** |

### Static Analysis Results

- **TypeScript type-check**: PASSED (all 5 packages)
- **Production build**: PASSED (Next.js 15.5.9 + tsup)
- **Build warnings**: Telegram env vars missing (expected in CI)

---

## Critical Issues

### BUG-001: SSRF + Credential Leakage via User-Supplied Webhook URL

- **File**: `packages/web/app/api/content/generate/route.ts:87-91`
- **Category**: security
- **Description**: The `/api/content/generate` endpoint accepts a user-supplied `webhook` URL from the request body and makes a server-side HTTP request to it, attaching the `OPENAI_API_KEY` as a Bearer token in the Authorization header. This endpoint uses `withOptionalAuth`, meaning **no authentication is required**. An attacker can:
  1. Send a POST to `/api/content/generate` with `webhook` pointing to their own server
  2. Receive the `OPENAI_API_KEY` in the Authorization header
  3. Use the stolen API key for unlimited OpenAI API access at the project's expense
- **Impact**: Full OPENAI_API_KEY exfiltration by any unauthenticated user. Financial damage (API billing), potential data access if the key has broader permissions.
- **Code**:
  ```typescript
  // Line 87-94: Server sends OPENAI_API_KEY to attacker-controlled URL
  const webhookResponse = await fetch(webhook, {
    // webhook is user-supplied!
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // LEAKED
    },
    body: JSON.stringify(webhookPayload),
  });
  ```
- **Suggested fix**:
  1. Replace `withOptionalAuth` with `withAuth` to require authentication
  2. Validate `webhook` against an allowlist of trusted domains
  3. Never send API keys to user-supplied URLs. If a webhook needs auth, use a separate webhook secret
  4. Consider using HMAC signing for webhook payloads instead

### BUG-002: Auth Bypass via BYPASS_AUTH Environment Variable in Production

- **File**: `packages/web/app/api/courses/[orgSlug]/[courseSlug]/route.ts:438-439`
- **Category**: security
- **Description**: The course DELETE and PUT handlers use a `shouldBypassAuth` flag that checks `process.env.BYPASS_AUTH === 'true'` **without any production safeguards**. Unlike `withDevBypass()` (which checks for production URLs and requires `NODE_ENV === 'development'`), this check only uses an OR condition: `process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true'`. If `BYPASS_AUTH=true` is accidentally set in a production environment, anyone can delete or modify courses without authentication.
- **Impact**: Unauthenticated course deletion/modification in production if env var is misconfigured.
- **Code**:
  ```typescript
  // Line 438-439: Missing production safeguards unlike withDevBypass()
  const shouldBypassAuth =
    process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true';
  ```
- **Suggested fix**: Remove the `BYPASS_AUTH` check entirely, or replicate the production safeguards from `withDevBypass()` (check `VERCEL_ENV`, `NEXT_PUBLIC_SITE_URL`, etc.)

---

## High Priority Issues

### BUG-003: Operator Precedence Bug in Time Estimate Calculation

- **File**: `packages/web/components/course/generation-progress.tsx:109`
- **Category**: quality
- **Description**: The estimated time remaining calculation has an operator precedence bug. The expression `progress.total_steps || 5 - progress.current_step` evaluates as `progress.total_steps || (5 - progress.current_step)` due to JavaScript precedence rules (subtraction binds tighter than `||`). The intended behavior is `(progress.total_steps || 5) - progress.current_step`. When `total_steps` is falsy (0, null, undefined), the fallback computes `5 - current_step` instead of using 5 as the default then subtracting.
- **Impact**: Users see incorrect time estimates during course generation. If `current_step` is e.g. 3, the result is `2 * 1.5 = 3 min` instead of `(5-3) * 1.5 = 3 min` (coincidentally same), but if `current_step > 5`, the result goes negative.
- **Code**:
  ```typescript
  const estimatedMinutesRemaining = Math.ceil(
    ((progress.total_steps || 5 - progress.current_step) * 1.5) +  // BUG
    // should be: (((progress.total_steps || 5) - progress.current_step) * 1.5) +
    (progress.lessons_total ? ... : 0)
  )
  ```
- **Suggested fix**: Add parentheses: `((progress.total_steps || 5) - progress.current_step)`

### BUG-004: N+1 Database Query Pattern in Stage 5 Materialization

- **File**: `packages/course-gen-platform/src/stages/stage5-generation/handler.ts:830-880`
- **Category**: performance
- **Description**: The section/lesson materialization in Stage 5 uses nested `for...of` loops with individual `await supabaseAdmin.from('sections').insert()` and `await supabaseAdmin.from('lessons').insert()` calls for each section and lesson. For a course with 10 sections and 10 lessons each, this results in 10 + 100 = 110 individual database round trips instead of 2 batch inserts.
- **Impact**: Significantly slower course generation (110 DB queries vs 2), higher latency, increased connection pool pressure. Could cause timeouts for large courses.
- **Code**:

  ```typescript
  for (const [sectionIndex, section] of sanitizedStructure.sections.entries()) {
    const { data: newSection } = await supabaseAdmin
      .from('sections').insert({...}).select('id').single();  // N queries

    for (const [lessonIndex, lesson] of section.lessons.entries()) {
      await supabaseAdmin.from('lessons').insert({...});  // N*M queries
    }
  }
  ```

- **Suggested fix**: Batch insert all sections first, then batch insert all lessons with a single `.insert([...])` call each.

### BUG-005: Unsafe Type Assertions Bypassing Supabase Type Safety (17 occurrences)

- **File**: Multiple files in `packages/web/app/api/invitations/` and `packages/web/app/api/organizations/`
- **Category**: quality
- **Description**: 17 Supabase queries use `(adminClient as any).from(...)` or `(client as any).from(...)` to bypass TypeScript's type checking. This eliminates compile-time detection of:
  - Incorrect column names
  - Wrong filter conditions
  - Missing required fields
  - Schema drift after migrations

  Key files affected:
  - `packages/web/app/api/invitations/code/route.ts` (4 occurrences)
  - `packages/web/app/api/invitations/[token]/route.ts` (5 occurrences)
  - `packages/web/app/api/organizations/[orgId]/invitations/route.ts` (3 occurrences)
  - `packages/web/app/api/organizations/[orgId]/invitations/[invitationId]/route.ts` (3 occurrences)
  - `packages/web/app/api/organizations/[orgId]/invitations/bulk/route.ts` (1 occurrence)
  - `packages/web/app/api/organizations/[orgId]/transfer-ownership/route.ts` (1 occurrence)

- **Impact**: Silent runtime errors if DB schema changes. Type safety completely disabled for invitation/organization CRUD operations.
- **Suggested fix**: Regenerate Supabase types with `mcp__supabase__generate_typescript_types`, ensure tables/views are included, and remove `as any` casts.

### BUG-006: `as any` Casts on Supabase Observability Queries (3 occurrences)

- **File**: `packages/course-gen-platform/src/stages/stage4-analysis/utils/observability.ts:322,371,416,470`
- **Category**: quality
- **Description**: The observability module uses `as unknown as any` double-casts when inserting/querying metric events, completely bypassing type safety for telemetry data. If the metric event types or table schema change, these queries will silently fail or insert malformed data.
- **Impact**: Telemetry data corruption risk. Silent failures in monitoring.
- **Suggested fix**: Define proper types for MetricEventType enum values in the database types.

### BUG-007: Stage 6 Inspector Passes null Props Unconditionally

- **File**: `packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx:319-321`
- **Category**: quality
- **Description**: The Stage 6 inspector component always passes `null` for `lessonSpec`, `style`, and `language` props to `Stage6InputTab`, with TODO comments indicating these should come from `LessonInspectorData`. This means the input tab always shows empty/null data for lesson specifications, rendering the "Input" tab useless for debugging lesson generation.
- **Impact**: Admin users cannot inspect lesson generation inputs through the workflow UI, hindering debugging of generation issues.
- **Code**:
  ```typescript
  <Stage6InputTab
    lessonSpec={null}  // TODO: Add lessonSpec to LessonInspectorData
    style={null}       // TODO: Add style to LessonInspectorData
    language={null}    // TODO: Add language to LessonInspectorData
  />
  ```
- **Suggested fix**: Extend `LessonInspectorData` type to include `lessonSpec`, `style`, and `language` fields from the generation trace data.

---

## Medium Priority Issues

### BUG-008: `generation-progress.tsx` Uses `as any` for Pause State Detection

- **File**: `packages/web/components/course/generation-progress.tsx:101-102`
- **Category**: quality
- **Description**: The pause state initialization uses `(initialProgress as any)?.generation_paused_at` twice, indicating the `initialProgress` type definition is missing the `generation_paused_at` field. This bypasses type checking and could break silently if the field name changes.
- **Code**:
  ```typescript
  const [isPaused, setIsPaused] = useState(
    () =>
      (initialProgress as any)?.generation_paused_at !== null &&
      (initialProgress as any)?.generation_paused_at !== undefined
  );
  ```
- **Suggested fix**: Add `generation_paused_at` to the `GenerationProgress` type definition.

### BUG-009: 139 Explicit `any` Type Annotations in Production Code

- **File**: Multiple files across `packages/web/` and `packages/course-gen-platform/`
- **Category**: quality
- **Description**: 139 instances of explicit `any` types (`as any`, `: any`, `<any>`) found in production source code (excluding tests). Major clusters:
  - **Translation keys** (25+): `t('key' as any)` pattern in benchmarks, enrichment cards
  - **Supabase clients** (17): `adminClient as any` in API routes
  - **UI components** (15): `as any` casts in sheet.tsx, navigation, generation graph
  - **Backend services** (10): observability, clarifying phase, RPC calls
- **Impact**: Reduced type safety across the codebase. Bugs from type mismatches will only be caught at runtime.
- **Suggested fix**: Address in priority order: Supabase casts (BUG-005), then translation key types, then UI component types.

### BUG-010: console.log in Production Client Code

- **File**: Multiple locations
- **Category**: debug
- **Description**: 3 `console.log` statements found in production client-side code (not guarded by dev-mode checks):
  1. `packages/web/lib/supabase/browser-client.tsx:129` - Auth state changes
  2. `packages/web/components/pwa/ServiceWorkerManager.tsx:27` - Cache deletion
  3. `packages/web/components/pwa/ServiceWorkerManager.tsx:32` - Precache deletion

  Additionally, 28 `console.warn`/`console.error` statements found in production code across `packages/web/lib/` that should use the structured logger instead.

- **Impact**: Browser console noise for end users. No structured logging for monitoring/alerting.
- **Suggested fix**: Replace with `logger.debug()` or `logger.info()` from the client-logger module, or wrap in `process.env.NODE_ENV === 'development'` checks.

### BUG-011: @ts-expect-error in Production Code (9 occurrences)

- **File**: Multiple files
- **Category**: quality
- **Description**: 9 `@ts-expect-error` annotations in production source code (tests excluded):
  1. `packages/shared-types/src/generation-result.ts:526` - Unused variable kept for future use
  2. `packages/web/lib/supabase/browser-client.tsx:27,29` - HMR dispose callback
  3. `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-dom-setup.ts:83,85,172,174,176` - DOMPurify/Mermaid globals
  4. `packages/course-gen-platform/src/stages/stage7-enrichments/services/image-generation-service.ts:209` - OpenRouter extensions
- **Impact**: Type errors are silently suppressed. If the underlying issue is fixed in a library update, the suppression hides the improvement.
- **Suggested fix**: Most are justified workarounds. Review periodically as libraries update. The `generation-result.ts:526` unused variable should be removed if truly unused.

### BUG-012: 23 TODO/FIXME Comments in Production Code

- **File**: Multiple files
- **Category**: quality
- **Description**: 23 TODO/FIXME comments found in production code indicating incomplete features:

  **Incomplete implementations**:
  - `course-notifications.ts:78` - Web-push not implemented
  - `course-notifications.ts:122` - Email notifications not implemented
  - `section-regeneration-service.ts:411` - Cost calculation not implemented
  - `course-mapper.ts:259` - Asset URL extraction not implemented
  - `openedx/adapter.ts:281` - Open edX Course API not implemented
  - `section-batch-generator.ts:155` - Inter-section context not passed

  **Stub handlers**:
  - `orchestrator/handlers/initialize.ts:50-74` - 4 TODOs for Stage 1 orchestrator
  - `orchestrator/worker.ts:128` - Additional handler registration
  - `error-handler.ts:354` - Stalled job recovery

  **Admin UI**:
  - `ModuleDashboard.tsx:152,167,184` - 3 TODOs for module dashboard
  - `Stage6InspectorContent.tsx:319-321` - Inspector input tab (see BUG-007)

- **Impact**: Incomplete features that may confuse developers. Some represent missing functionality users might expect.
- **Suggested fix**: Create backlog tickets for each TODO. Remove TODOs for features that are intentionally deferred.

### BUG-013: console.warn/error in Shared Packages Instead of Structured Logger

- **File**: `packages/shared-types/src/analysis-schemas.ts:95`, `packages/shared-types/src/common-enums.ts:89,373`, `packages/shared-types/src/analysis-guards.ts:56`, `packages/shared-types/src/generation-result.ts:1062`
- **Category**: quality
- **Description**: The `shared-types` package uses `console.warn` and `console.error` for validation failures and fallback notifications. Since this package is used by both frontend and backend, these messages bypass the structured logging pipeline (Pino on backend, client-logger on frontend).
- **Impact**: Validation warnings are not captured by monitoring systems. Cannot be filtered, aggregated, or alerted on.
- **Suggested fix**: Accept an optional logger parameter in these functions, or use a lightweight logging adapter that works in both environments.

### BUG-014: `let query: any` in Benchmarks Server Action

- **File**: `packages/web/app/actions/benchmarks.ts:89`
- **Category**: quality
- **Description**: A Supabase query builder is declared as `let query: any` because the `llm_model_leaderboard` view types are not generated. This makes the entire query chain (filters, ordering, pagination) completely untyped.
- **Impact**: No compile-time checking for filter column names, sort fields, or response shape.
- **Suggested fix**: Regenerate database types to include the `llm_model_leaderboard` view, or define a manual type.

### BUG-015: Commented-Out Code Blocks (15 blocks, ~160 lines)

- **File**: Multiple files
- **Category**: dead-code
- **Description**: 15 blocks of commented-out code detected in production source files, totaling approximately 160 lines:

  | File                                                   | Lines               | Description                      |
  | ------------------------------------------------------ | ------------------- | -------------------------------- |
  | `stage5-generation/handler.ts`                         | 972-1006 (35 lines) | Disabled lesson cover generation |
  | `stage6-lesson-content/services/job-processor.ts`      | 452-462 (11 lines)  | Disabled lesson card generation  |
  | `fsm-initialization-command-handler.ts`                | 210-224 (15 lines)  | SQL function documentation       |
  | `web/lib/supabase/middleware.ts`                       | 71-82 (12 lines)    | Supabase documentation comments  |
  | `web/components/generation-graph/nodes/LessonNode.tsx` | 85-111 (19 lines)   | Disabled enrichment toolbar      |
  | `trpc-client-sdk/src/index.ts`                         | 497-504 (8 lines)   | Commented utility code           |
  | Others                                                 | Various             | Smaller blocks                   |

  Note: The `middleware.ts` block (71-82) is actually Supabase documentation, not dead code.

- **Impact**: Code clutter, maintenance confusion. Some blocks include useful context (cost reasons for disabling) that should be preserved in commit messages or documentation.
- **Suggested fix**: Remove commented-out code. Preserve context about disabled features in code comments (without the code) or in documentation.

### BUG-016: Silently Swallowed Errors with `.catch(() => {})` Pattern

- **File**: Multiple files in `packages/web/app/api/`
- **Category**: quality
- **Description**: At least 20 instances of `.catch(() => {})` (fire-and-forget pattern) found across API routes, primarily in auth, organizations, and course actions. While the pattern is documented as intentional for non-critical logging operations, some instances may hide real failures.
- **Impact**: Errors in audit logging, error reporting, and state cleanup are silently lost. If the underlying service fails repeatedly, there is no visibility.
- **Suggested fix**: Replace with `.catch((err) => logger.warn('Non-critical operation failed', { err }))` for at minimum diagnostic visibility.

### BUG-017: Stage 5 Missing Inter-Section Context for Lesson Specifications

- **File**: `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/section-batch-generator.ts:155`
- **Category**: quality
- **Description**: The section batch generator passes `undefined` for the `allSections` parameter when generating lesson specifications. This means lesson specs lack context about other sections in the course, potentially leading to content overlap or poor inter-section coherence.
- **Code**:
  ```typescript
  const allSections = undefined; // TODO: Pass all course sections when available
  ```
- **Impact**: Lesson content may repeat topics across sections or lack proper cross-referencing.
- **Suggested fix**: After all section batches are generated, call `convertSectionToV2Specs` again with the full `allSections` array for proper context.

### BUG-018: Redis Client Uses console.warn/error Instead of Logger

- **File**: `packages/web/lib/redis-client.ts:15,19,22` and `packages/web/lib/rate-limit.ts:63,67,70`
- **Category**: quality
- **Description**: The Redis client and rate limiter modules use `console.info/warn/error` directly instead of the structured logger. These are server-side modules in Next.js that handle critical infrastructure (caching, rate limiting).
- **Impact**: Redis connection errors, rate limit violations, and cache failures are not captured by structured logging/monitoring.
- **Suggested fix**: Import and use the server-side logger module.

### BUG-019: Missing Notifications Implementation

- **File**: `packages/course-gen-platform/src/shared/notifications/course-notifications.ts:78,122`
- **Category**: quality
- **Description**: Two notification channels are declared but not implemented:
  1. Web-push notifications (line 78): `// TODO: Implement web-push when push_subscriptions table is ready`
  2. Email notifications (line 122): `// 3. Email notification (TODO: implement with Resend)`

  Users may expect to receive push/email notifications for course generation completion, but only Telegram notifications are functional.

- **Impact**: Users who don't use Telegram receive no generation completion notifications.
- **Suggested fix**: Implement web-push using the existing push subscription API routes (`/api/push/subscribe`, `/api/push/unsubscribe`), or document the limitation.

---

## Low Priority Issues

### BUG-020: MermaidDirect.tsx Uses innerHTML for SVG Rendering

- **File**: `packages/web/components/markdown/components/MermaidDirect.tsx:521`
- **Category**: security
- **Description**: The Mermaid diagram renderer uses `containerRef.current.innerHTML = svg` to inject SVG content. While Mermaid is configured with `securityLevel: 'strict'` which provides XSS protection via DOMPurify, the `innerHTML` assignment itself is a pattern that security scanners flag.
- **Impact**: Low risk due to Mermaid's strict security mode. However, if Mermaid's DOMPurify integration is bypassed in a future version, this could become a vector.
- **Suggested fix**: No immediate action needed. The `securityLevel: 'strict'` setting is correctly applied. Document the security rationale in a code comment.

### BUG-021: dangerouslySetInnerHTML in Layout for Inline Scripts

- **File**: `packages/web/app/[locale]/layout.tsx:187,204,262`
- **Category**: security
- **Description**: Three uses of `dangerouslySetInnerHTML` for inline scripts: theme detection, CSS styles for initial loader, and cache invalidation. All are static/server-rendered content with no user input interpolation (except `APP_VERSION` from env var).
- **Impact**: Minimal risk - content is server-rendered and controlled. Standard Next.js pattern for inline scripts.
- **Suggested fix**: No action needed. This is a standard Next.js pattern for pre-hydration scripts.

### BUG-022: JWT Tokens in Test Files (Test-Only)

- **File**: `packages/course-gen-platform/src/server/__tests__/trpc.test.ts:173`, `packages/course-gen-platform/tests/unit/trpc-context.test.ts:172`
- **Category**: security
- **Description**: Test files contain the well-known JWT example token `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (the standard jwt.io example). This is a publicly known test token, not a real secret.
- **Impact**: None - this is a standard test token. Listed for completeness.
- **Suggested fix**: No action needed.

### BUG-023: Build Logs Show Missing Telegram Env Warning

- **File**: Build output (runtime)
- **Category**: quality
- **Description**: Production build emits `Missing required Telegram environment variables` warning twice during static page generation. This is expected in CI/build environments but may cause confusion.
- **Impact**: Log noise during builds. No functional impact.
- **Suggested fix**: Guard the warning to only emit in non-build contexts, or reduce severity to debug level.

### BUG-024: Untyped Translation Key Pattern (`as any`) in UI Components

- **File**: `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx:269-281`, `packages/web/app/[locale]/benchmarks/components/models-ranking-table.tsx:183-536`, `packages/web/components/course/viewer/components/EnrichmentCard.tsx:109`
- **Category**: quality
- **Description**: Multiple UI components use `t('dynamic.key' as any)` to work around next-intl's strict key type checking when constructing translation keys dynamically. This is a common pattern in next-intl but reduces type safety for i18n keys.
- **Impact**: Typos in dynamic translation keys are not caught at compile time.
- **Suggested fix**: Define union types for valid dynamic key segments, or use next-intl's `useMessages()` hook for dynamic access.

### BUG-025: Unused Variable Suppressed with @ts-expect-error

- **File**: `packages/shared-types/src/generation-result.ts:526`
- **Category**: dead-code
- **Description**: A variable is suppressed with `@ts-expect-error TS6133 - Kept for potential future use`. If the variable is not currently used, it should be removed rather than suppressed.
- **Impact**: Dead code. Minor maintenance burden.
- **Suggested fix**: Remove the unused variable and the `@ts-expect-error` annotation. Re-add when actually needed.

---

## Validation Results

### Type Check

**Command**: `pnpm type-check`
**Status**: PASSED
**Exit Code**: 0

### Build

**Command**: `pnpm build`
**Status**: PASSED (with non-blocking warnings)
**Exit Code**: 0

### Overall Status

**Validation**: PASSED - Both type-check and production build succeed.

---

## Metrics Summary

| Metric                          | Count                       |
| ------------------------------- | --------------------------- |
| Security vulnerabilities        | 2 critical + 1 medium       |
| Performance issues              | 1 (N+1 queries)             |
| Type safety bypasses (as any)   | 139 instances               |
| @ts-expect-error                | 9 in production code        |
| console.log in production       | 3 (+ 28 console.warn/error) |
| TODO/FIXME comments             | 23 in production code       |
| Commented-out code blocks       | 15 blocks (~160 lines)      |
| Dead code (unused suppressed)   | 1                           |
| Missing implementations (TODOs) | 6 functional features       |
| Technical Debt Score            | **Medium-High**             |

---

## Task List

### Critical Tasks (Fix Immediately)

- [ ] **[CRITICAL-1]** Fix SSRF + credential leakage in `/api/content/generate` (BUG-001)
- [ ] **[CRITICAL-2]** Remove `BYPASS_AUTH` env var check from course route (BUG-002)

### High Priority Tasks (Fix Before Deployment)

- [ ] **[HIGH-1]** Fix operator precedence bug in time estimate (BUG-003)
- [x] **[HIGH-2]** Batch DB inserts in Stage 5 materialization (BUG-004)
- [ ] **[HIGH-3]** Remove `as any` casts from Supabase queries in invitation/org routes (BUG-005)
- [ ] **[HIGH-4]** Fix observability type casts (BUG-006)
- [ ] **[HIGH-5]** Wire up Stage 6 inspector input tab props (BUG-007)

### Medium Priority Tasks (Schedule for Sprint)

- [ ] **[MEDIUM-1]** Add `generation_paused_at` to progress type (BUG-008)
- [ ] **[MEDIUM-2]** Systematic `any` type reduction campaign (BUG-009)
- [x] **[MEDIUM-3]** Replace console.log with structured logger (BUG-010)
- [ ] **[MEDIUM-4]** Review @ts-expect-error annotations (BUG-011)
- [ ] **[MEDIUM-5]** Triage TODO/FIXME into backlog tickets (BUG-012)
- [ ] **[MEDIUM-6]** Add logging to shared-types validation (BUG-013)
- [ ] **[MEDIUM-7]** Type the benchmarks query builder (BUG-014)
- [x] **[MEDIUM-8]** Remove commented-out code blocks (BUG-015)
- [x] **[MEDIUM-9]** Replace `.catch(() => {})` with logged catch (BUG-016)
- [ ] **[MEDIUM-10]** Pass inter-section context in Stage 5 (BUG-017)
- [x] **[MEDIUM-11]** Use structured logger in Redis/rate-limit modules (BUG-018)
- [ ] **[MEDIUM-12]** Implement or document missing notification channels (BUG-019)

### Low Priority Tasks (Backlog)

- [ ] **[LOW-1]** Document Mermaid innerHTML security rationale (BUG-020)
- [ ] **[LOW-2]** Suppress Telegram env warning during builds (BUG-023)
- [ ] **[LOW-3]** Type dynamic translation keys (BUG-024)
- [x] **[LOW-4]** Remove unused suppressed variable (BUG-025)

---

## Recommendations

1. **Immediate Actions** (this week):
   - Fix BUG-001 (SSRF + credential leak) - this is exploitable today
   - Fix BUG-002 (BYPASS_AUTH) - remove or add production safeguards
   - Fix BUG-003 (operator precedence) - one-character fix

2. **Short-term Improvements** (1-2 weeks):
   - Regenerate Supabase types to eliminate `as any` casts in invitation/org routes
   - Batch Stage 5 DB inserts for performance
   - Replace `console.*` with structured logger in server-side code

3. **Long-term Refactoring**:
   - Systematic `any` type reduction (139 instances)
   - Implement missing notification channels (web-push, email)
   - Add inter-section context to Stage 5 for better content coherence

4. **Testing Gaps**:
   - No security test for webhook URL validation
   - No integration test for BYPASS_AUTH behavior
   - Missing tests for time estimate calculation edge cases

---

## Next Steps

### Immediate Actions (Required)

1. **Fix Critical Security Issues** (BUG-001, BUG-002)
   - These should be fixed before next deployment
   - BUG-001 can be exploited by any unauthenticated user

2. **Fix High Priority Bugs** (BUG-003 through BUG-007)
   - BUG-003 is a one-line fix
   - BUG-004 improves generation performance significantly

### Recommended Actions (Optional)

- Schedule medium-priority bugs for current sprint
- Create backlog tickets for TODO/FIXME items
- Plan an `any` type reduction sprint

### Follow-Up

- Re-run bug scan after critical fixes
- Monitor for regression
- Consider adding pre-commit hooks for `as any` detection

---

_Report generated by bug-hunter agent on 2026-02-06_
_No modifications were made to source code_
_Scan duration: ~8 minutes_
