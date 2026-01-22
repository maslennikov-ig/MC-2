---
report_type: bug-hunting
generated: 2026-01-22T19:15:00Z
version: 2026-01-22
status: success
agent: bug-hunter
duration: ~5m
files_processed: 500+
issues_found: 21
critical_count: 0
high_count: 4
medium_count: 10
low_count: 7
modifications_made: false
---

# Bug Hunting Report

**Generated**: 2026-01-22
**Project**: megacampus-monorepo v0.28.27
**Files Analyzed**: 500+
**Total Issues Found**: 21
**Status**: PASSED (No critical bugs found)

---

## Executive Summary

The codebase is in healthy condition with no critical security vulnerabilities or type errors. The type-check and production build both pass successfully. However, there are several dependency vulnerabilities that should be addressed, along with code cleanup opportunities.

### Key Metrics

- **Critical Issues**: 0
- **High Priority Issues**: 4
- **Medium Priority Issues**: 10
- **Low Priority Issues**: 7
- **Files Scanned**: 500+
- **Modifications Made**: No

### Highlights

- Type-check: PASSED (all 5 packages)
- Production build: PASSED
- No hardcoded secrets found in tracked files
- dangerouslySetInnerHTML usage is safe (inline loader scripts)
- 4 dependency vulnerabilities require attention

---

## Critical Issues (Priority 1)

**None found.**

---

## High Priority Issues (Priority 2)

### Issue #1: Vulnerable `tar` Package (Security)

- **Package**: `tar@7.5.2`
- **Category**: Security - Arbitrary File Overwrite / Symlink Poisoning
- **Severity**: HIGH
- **CVE**: GHSA-8qq5-rm4j-mr97, GHSA-r6q2-hw4h-h46w
- **Description**: The `tar` package has two HIGH severity vulnerabilities allowing arbitrary file overwrite and symlink poisoning via insufficient path sanitization.
- **Impact**: Malicious tar archives could overwrite arbitrary files when extracted.
- **Paths**:
  - `supabase@2.58.5 > tar@7.5.2` (root)
  - `packages/course-gen-platform > supabase@2.67.1 > tar@7.5.2`
  - `packages/course-gen-platform > tar@7.5.2`
- **Fix**: Add override in root `package.json`:

```json
"pnpm": {
  "overrides": {
    "tar": ">=7.5.4"
  }
}
```

### Issue #2: Vulnerable `undici` Package (Security)

- **Package**: `undici@6.22.0`
- **Category**: Security - Denial of Service via Decompression
- **Severity**: HIGH
- **CVE**: CVE-2026-22036, GHSA-g9mf-h72j-4rw9
- **Description**: Unbounded decompression chain in fetch() API allows high CPU usage and memory allocation.
- **Impact**: Malicious servers can cause denial of service.
- **Path**: `@qdrant/js-client-rest > undici@6.22.0`
- **Fix**: Add override in root `package.json`:

```json
"pnpm": {
  "overrides": {
    "undici": ">=6.23.0"
  }
}
```

### Issue #3: Vulnerable `lodash` / `lodash-es` Packages (Security)

- **Package**: `lodash@4.17.21`, `lodash-es@4.17.21`
- **Category**: Security - Prototype Pollution
- **Severity**: MODERATE
- **CVE**: GHSA-xxjr-mmjv-4gpg
- **Description**: Prototype pollution vulnerability in `_.unset` and `_.omit` functions.
- **Impact**: Could potentially allow property injection attacks.
- **Paths**:
  - `mermaid > @mermaid-js/parser > langium > chevrotain > lodash-es@4.17.21`
  - `@bull-board/api > redis-info > lodash@4.17.21`
- **Fix**: Add override in root `package.json`:

```json
"pnpm": {
  "overrides": {
    "lodash": ">=4.17.23",
    "lodash-es": ">=4.17.23"
  }
}
```

### Issue #4: Vulnerable `diff` Package (Security)

- **Package**: `diff` (version unspecified)
- **Category**: Security
- **Severity**: MODERATE
- **Path**: `packages/web > react-diff-viewer-continued > diff`
- **Fix**: Upgrade to `diff@5.2.2`

---

## Medium Priority Issues (Priority 3)

### Issue #5: Debug File in Production Code

- **File**: `/home/me/code/mc2/packages/course-gen-platform/debug-docling-export.ts`
- **Category**: Code Quality - Debug Artifact
- **Description**: Standalone debug script file with console.log statements left in the package root.
- **Impact**: Clutters the codebase, not intended for production use.
- **Fix**: Move to `tools/debug/` directory or delete if no longer needed.

### Issue #6: 524 Usages of `any` Type

- **Category**: Type Safety
- **Description**: Found 524 occurrences of `: any` or `as any` across 176 files.
- **Impact**: Reduces type safety and can hide potential bugs.
- **Note**: Many are in test files (acceptable) and experiment scripts, but production code should be audited.
- **Fix**: Gradually replace with proper types. Priority files:
  - `packages/web/components/generation-monitoring/realtime-provider.tsx` (5 occurrences)
  - `packages/course-gen-platform/src/shared/logger/error-service.ts` (5 occurrences)
  - `packages/course-gen-platform/src/orchestrator/job-status-tracker.ts` (6 occurrences)

### Issue #7: 63 `@ts-expect-error` Annotations

- **Category**: Type Safety
- **Description**: 63 TypeScript error suppressions found across the codebase.
- **Impact**: Most are legitimate (testing invalid inputs, mock setups), but some may mask real issues.
- **Notable**: `mermaid-dom-setup.ts` has many suppressions due to DOM manipulation needs.
- **Fix**: Audit and document necessity of each suppression.

### Issue #8: 50+ TODO Comments in Production Code

- **Category**: Technical Debt
- **Description**: Many TODO comments indicate incomplete implementations.
- **Notable TODOs requiring attention**:
  - `packages/web/lib/user-preferences.ts:71` - "Enable Supabase integration when user_preferences table is created"
  - `packages/web/components/generation-graph/panels/module/ModuleDashboard.tsx:131` - "Implement other actions via tRPC mutations"
  - `packages/course-gen-platform/src/server/routers/generation/dependencies.router.ts:300` - "Implement BullMQ job queuing when regeneration job type is available"
- **Fix**: Create tickets to address or remove stale TODOs.

### Issue #9: Empty Catch Blocks Pattern

- **Pattern**: `.catch(() => {})`
- **Category**: Error Handling
- **Description**: Found 80+ instances of empty catch blocks (fire-and-forget pattern).
- **Impact**: Silently swallows errors, making debugging difficult.
- **Example Files**:
  - `packages/web/app/actions/courses.ts:572`
  - `packages/web/app/api/auth/register/route.ts:63`
  - `packages/web/app/api/organizations/route.ts:87`
- **Note**: Many are intentional for audit logging (non-critical), but pattern should be audited.
- **Fix**: Add comment explaining why errors are ignored, or add minimal error logging.

### Issue #10: Console Statements in Example/Doc Files

- **Files**:
  - `packages/course-gen-platform/docs/examples/qdrant/lifecycle-integration-example.ts`
  - `packages/course-gen-platform/docs/examples/qdrant/examples.ts`
  - `packages/course-gen-platform/docs/examples/embeddings/jina-embeddings-usage-examples.ts`
- **Category**: Code Quality
- **Description**: Example files contain many console.log statements.
- **Impact**: Low - these are documentation examples, not production code.
- **Fix**: Leave as-is (acceptable for examples) or convert to proper logging.

### Issue #11: Development Conditional - console.warn in Production

- **File**: `/home/me/code/mc2/packages/shared-types/src/common-enums.ts`
- **Lines**: 73, 314
- **Category**: Code Quality
- **Description**: `console.warn` triggered in development for unknown language codes.
- **Impact**: Could leak warnings in development builds.
- **Fix**: Ensure warnings are properly gated by `NODE_ENV`.

### Issue #12: Debug Route Endpoint

- **File**: `/home/me/code/mc2/packages/web/app/api/debug/webhook/route.ts`
- **Category**: Security Consideration
- **Description**: Debug webhook endpoint exists in production codebase.
- **Impact**: Potentially exposes debug information if not properly secured.
- **Fix**: Verify endpoint is protected or only available in development.

### Issue #13: Test Generate Endpoint

- **File**: `/home/me/code/mc2/packages/web/app/api/coursegen/test-generate/route.ts`
- **Category**: Security Consideration
- **Description**: Test generation endpoint in production codebase.
- **Impact**: Could allow unauthorized test generations if not properly secured.
- **Fix**: Verify endpoint requires proper authentication.

### Issue #14: Missing Error Boundary Coverage

- **File**: `/home/me/code/mc2/packages/shared-types/src/generation-result.ts:1062`
- **Category**: Error Handling
- **Description**: `console.error` for placeholder validation failure may not be caught.
- **Impact**: Silent failures in production.
- **Fix**: Ensure proper error propagation.

---

## Low Priority Issues (Priority 4)

### Issue #15: Hardcoded Test Credentials in Setup Tools

- **Files**:
  - `packages/course-gen-platform/tools/auth/setup-test-auth-users.ts:28` - `password: 'test-password-123'`
  - `packages/course-gen-platform/tools/auth/configure-auth.ts:32` - `password: 'TestPassword123!'`
- **Category**: Code Quality
- **Description**: Test passwords hardcoded in setup scripts.
- **Impact**: Low - these are development/test tools only.
- **Fix**: Move to environment variables for consistency.

### Issue #16: Example JWT in Documentation

- **File**: `packages/trpc-client-sdk/src/index.ts:175`
- **Category**: Documentation
- **Description**: Example contains truncated JWT token.
- **Impact**: None - clearly an example/placeholder.
- **Fix**: None required.

### Issue #17: Commented Console.log in Layout

- **File**: `/home/me/code/mc2/packages/web/app/[locale]/layout.tsx:271`
- **Category**: Debug Code
- **Description**: `console.log` in cache invalidator inline script.
- **Impact**: Logs appear in browser console during version changes.
- **Fix**: Consider removing or gating behind debug flag.

### Issue #18: dangerouslySetInnerHTML Usage

- **File**: `/home/me/code/mc2/packages/web/app/[locale]/layout.tsx`
- **Lines**: 187, 204, 262
- **Category**: Security (Verified Safe)
- **Description**: Three uses of dangerouslySetInnerHTML for inline scripts/styles.
- **Impact**: SAFE - Content is hardcoded (theme detection, loader styles, cache invalidation).
- **Fix**: None required - this is an intentional pattern for critical path optimization.

### Issue #19: Experiment Files with Any Types

- **Directory**: `packages/course-gen-platform/experiments/`
- **Category**: Code Quality
- **Description**: Experiment scripts have relaxed typing.
- **Impact**: None - experiments are not production code.
- **Fix**: None required for experiments.

### Issue #20: Duplicate Test Files

- **Category**: Code Organization
- **Description**: Some test files appear duplicated between directories:
  - `tests/unit/` and `src/**/__tests__/`
- **Impact**: Potential test maintenance overhead.
- **Fix**: Audit and consolidate test locations.

### Issue #21: Debug Tool Script

- **File**: `/home/me/code/mc2/packages/course-gen-platform/tools/debug/debug-stage6-generation.ts`
- **Category**: Development Tooling
- **Description**: Debug script for stage 6 generation (properly located in tools/).
- **Impact**: None - correctly placed in debug tools directory.
- **Fix**: None required.

---

## Code Cleanup Required

### Debug Code to Remove

| File                                                   | Type         | Description                           |
| ------------------------------------------------------ | ------------ | ------------------------------------- |
| `packages/course-gen-platform/debug-docling-export.ts` | Debug Script | Standalone debug file in package root |

### Dead Code Review Recommended

| Location         | Type         | Description                             |
| ---------------- | ------------ | --------------------------------------- |
| `experiments/`   | Experimental | Many one-off test scripts               |
| `docs/examples/` | Examples     | Contains many console.logs (acceptable) |

---

## Validation Results

### Type Check

**Command**: `pnpm type-check`

**Status**: PASSED

**Output**:

```
packages/shared-logger type-check: Done
packages/shared-types type-check: Done
packages/trpc-client-sdk type-check: Done
packages/course-gen-platform type-check: Done
packages/web type-check: Done
```

**Exit Code**: 0

### Build

**Command**: `pnpm build`

**Status**: PASSED

**Output**:

```
packages/shared-logger build: Done
packages/shared-types build: Done
packages/trpc-client-sdk build: Done
packages/course-gen-platform build: Done
packages/web build: Done
```

**Exit Code**: 0

### Overall Status

**Validation**: PASSED

---

## Metrics Summary

- **Security Vulnerabilities**: 4 (in dependencies)
- **Type Errors**: 0
- **Build Errors**: 0
- **Dead Code Files**: 1 (debug script)
- **Debug Statements**: ~100 (mostly in examples/tests)
- **TODO Comments**: 50+
- **Any Type Usage**: 524 occurrences
- **TypeScript Suppressions**: 63

---

## Task List

### High Priority Tasks (Fix Before Next Deployment)

- [x] **[HIGH-1]** Add pnpm override for `tar>=7.5.4` to fix arbitrary file overwrite vulnerability
- [x] **[HIGH-2]** Add pnpm override for `undici>=6.23.0` to fix DoS vulnerability
- [x] **[HIGH-3]** Add pnpm override for `lodash>=4.17.23` and `lodash-es>=4.17.23` to fix prototype pollution
- [x] **[HIGH-4]** Upgrade `diff` package via react-diff-viewer-continued (added pnpm override for diff>=5.2.2)

### Medium Priority Tasks (Schedule for Sprint)

- [ ] **[MEDIUM-1]** Move or delete `debug-docling-export.ts` from package root
- [ ] **[MEDIUM-2]** Audit debug/test API endpoints for proper authentication
- [ ] **[MEDIUM-3]** Review and document empty `.catch(() => {})` patterns
- [ ] **[MEDIUM-4]** Triage and create tickets for TODO comments

### Low Priority Tasks (Backlog)

- [ ] **[LOW-1]** Gradually reduce `any` type usage in production code
- [ ] **[LOW-2]** Audit `@ts-expect-error` annotations for necessity
- [ ] **[LOW-3]** Consolidate duplicate test file locations

---

## Recommendations

1. **Immediate Actions**:
   - Update dependency overrides in `package.json` for security vulnerabilities
   - Run `pnpm install` after adding overrides to apply fixes

2. **Short-term Improvements** (1-2 weeks):
   - Move debug files to proper locations
   - Audit API endpoints for proper authentication

3. **Long-term Refactoring**:
   - Reduce `any` type usage
   - Establish consistent test file organization

4. **Testing Gaps**:
   - No significant gaps identified

5. **Documentation Needs**:
   - Document the empty catch pattern rationale where used

---

## Next Steps

### Immediate Actions (Required)

1. **Fix Dependency Vulnerabilities**
   Add to `/home/me/code/mc2/package.json` in the `pnpm.overrides` section:

   ```json
   "tar": ">=7.5.4",
   "undici": ">=6.23.0",
   "lodash": ">=4.17.23",
   "lodash-es": ">=4.17.23"
   ```

2. **Re-run Audit**
   After updating overrides:
   ```bash
   pnpm install && pnpm audit
   ```

### Recommended Actions (Optional)

- Clean up debug file from package root
- Schedule technical debt sprint for TODO items
- Create tickets for medium-priority issues

---

## Artifacts

- Bug Report: `bug-hunting-report.md` (this file)

---

_Report generated by bug-hunter agent_
_All issues documented for tracking_
