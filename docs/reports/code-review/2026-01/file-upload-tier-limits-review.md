# Code Review Report: Tier-Based File Upload Limits Feature

**Generated**: 2026-01-21
**Reviewer**: Claude Code
**Feature**: Tier-based file upload size, count, and type restrictions
**Files Reviewed**: 6 files

---

## 1. Summary

This review covers the implementation of tier-based file upload restrictions across the platform. The feature introduces dynamic file size limits, file count limits, and allowed file types based on organization tier (free, basic, trial, standard, premium).

**Overall Assessment**: ✅ **GOOD** with minor improvements needed

**Key Strengths**:

- Proper single source of truth pattern with `@megacampus/shared-types`
- Type-safe tier key definitions
- Good user messaging with upgrade hints
- Proper tier data flow from database to UI
- Backward compatibility with deprecated constants

**Areas for Improvement**:

- Missing backend validation for tier-based limits (security concern)
- Potential race condition in tier loading
- Missing error handling in some edge cases
- No tests for tier-aware validation logic

---

## 2. Issues Found

### CRITICAL Issues (0)

None found.

---

### HIGH Priority Issues (2)

#### H1. Missing Backend Validation for Tier-Based File Size Limits

**File**: `packages/course-gen-platform/src/server/index.ts` (line 188)
**Severity**: HIGH (Security)

**Issue**:
The backend has a global 100MB limit for JSON payloads, but there is NO tier-aware validation in the tRPC router. A free-tier user could bypass frontend validation and upload files larger than their 5MB limit by directly calling the API.

**Current Code**:

```typescript
// Backend only enforces global 100MB limit
app.use(express.json({ limit: '100mb' }));
// No tier-based validation in upload endpoint
```

**Impact**:

- Users can bypass tier restrictions via API calls
- Potential abuse of premium features by lower-tier users
- Unfair resource usage

**Recommendation**:
Add tier-aware validation in the file upload tRPC endpoint:

```typescript
// In file upload procedure
const { tier } = await getUserOrganizationTier(ctx.user.organizationId);
const maxSize = FILE_SIZE_LIMITS_BY_TIER[tier];

if (fileSize > maxSize) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `File exceeds tier limit (${tier}: ${maxSize / (1024 * 1024)}MB)`,
  });
}
```

**Files to modify**:

- `packages/course-gen-platform/src/server/routers/files/upload.ts` (or wherever file upload endpoint is)

---

#### H2. Race Condition: organizationTier State May Be Undefined During Initial Render

**File**: `packages/web/components/forms/create-course/_hooks/useCreateCourseForm.ts` (lines 31, 187)
**Severity**: HIGH (User Experience)

**Issue**:
The `organizationTier` state is initialized to `'standard'` but loaded asynchronously from Supabase. If the user's actual tier is different (e.g., 'premium'), there is a brief window where the form uses incorrect limits.

**Current Code**:

```typescript
const [organizationTier, setOrganizationTier] = useState<TierKey>('standard');

useEffect(() => {
  const initSession = async () => {
    // ... async fetch ...
    const tier = (orgData.organizations as { tier?: string } | null)?.tier as TierKey | undefined;
    if (tier) {
      setOrganizationTier(tier); // Updates AFTER initial render
    }
  };
  initSession();
}, [sessionId, mounted, canCreate]);
```

**Impact**:

- User sees incorrect file size limits briefly
- File validation may fail if user selects files before tier loads
- Confusing user experience

**Recommendation**:

1. Show a loading state while tier is being fetched
2. Disable file upload until tier is confirmed
3. Or set default to most restrictive tier ('free') until loaded

```typescript
const [organizationTier, setOrganizationTier] = useState<TierKey | null>(null)

// In FileUpload component
if (!tier) {
  return <div>Loading tier information...</div>;
}
```

---

### MEDIUM Priority Issues (4)

#### M1. Silent Failure When Organization Tier Not Found

**File**: `packages/web/components/forms/create-course/_hooks/useCreateCourseForm.ts` (line 179-182)
**Severity**: MEDIUM (User Experience)

**Issue**:
When `organization_id` is not found, the code logs a warning but continues with the default 'standard' tier. The user is never notified.

**Current Code**:

```typescript
if (!orgData?.organization_id) {
  logger.warn('No organization_id found for user', { userId: user.id });
  return; // Silently fails
}
```

**Impact**:

- User may have wrong tier limits
- No feedback to user about the issue
- Hard to debug in production

**Recommendation**:

```typescript
if (!orgData?.organization_id) {
  logger.error('No organization_id found for user', { userId: user.id });
  toast.error('Не удалось загрузить информацию об организации. Используются стандартные лимиты.');
  setOrganizationTier('free'); // Use most restrictive tier as fallback
  return;
}
```

---

#### M2. Type Coercion Without Validation

**File**: `packages/web/components/forms/create-course/_hooks/useCreateCourseForm.ts` (line 185)
**Severity**: MEDIUM (Type Safety)

**Issue**:
The tier value from the database is cast to `TierKey` without validating that it's actually a valid tier.

**Current Code**:

```typescript
const tier = (orgData.organizations as { tier?: string } | null)?.tier as TierKey | undefined;
```

**Impact**:

- Invalid tier values from database could cause runtime errors
- TypeScript type safety bypassed

**Recommendation**:

```typescript
// Add validation function
function isValidTier(tier: string | undefined): tier is TierKey {
  return tier !== undefined && ['free', 'basic', 'trial', 'standard', 'premium'].includes(tier);
}

const rawTier = (orgData.organizations as { tier?: string } | null)?.tier;
if (isValidTier(rawTier)) {
  setOrganizationTier(rawTier);
} else {
  logger.error('Invalid tier from database', { tier: rawTier, userId: user.id });
  setOrganizationTier('free'); // Safe fallback
}
```

---

#### M3. File Extension Validation Case Sensitivity

**File**: `packages/web/components/forms/file-upload.tsx` (line 145-146)
**Severity**: MEDIUM (Validation)

**Issue**:
File extension validation converts to lowercase but extension list in constants may not match casing in some browsers.

**Current Code**:

```typescript
const extension = file.name.split('.').pop()?.toLowerCase()
if (!extension || !(allowedExtensions as readonly string[]).includes(extension)) {
```

**Impact**:

- Files with uppercase extensions (e.g., `file.PDF`) may fail validation if constants don't match
- Inconsistent behavior across systems

**Recommendation**:
Ensure `FILE_EXTENSIONS_BY_TIER` always uses lowercase or normalize during comparison:

```typescript
const normalizedAllowedExtensions = allowedExtensions.map(ext => ext.toLowerCase());
if (!extension || !normalizedAllowedExtensions.includes(extension)) {
```

---

#### M4. Hardcoded Tier Order for Upgrade Suggestions

**File**: `packages/web/components/forms/file-upload.tsx` (lines 63, 80, 185)
**Severity**: MEDIUM (Maintainability)

**Issue**:
The tier hierarchy is hardcoded in multiple places as `['free', 'basic', 'trial', 'standard', 'premium']`. If tier structure changes, all locations must be updated.

**Current Code**:

```typescript
// Appears 3 times in the file
const tierOrder: TierKey[] = ['free', 'basic', 'trial', 'standard', 'premium'];
```

**Impact**:

- Error-prone if tier structure changes
- Code duplication

**Recommendation**:
Export tier order from shared-types:

```typescript
// In shared-types/src/file-upload-constants.ts
export const TIER_ORDER: readonly TierKey[] = [
  'free',
  'basic',
  'trial',
  'standard',
  'premium',
] as const;

// In file-upload.tsx
import { TIER_ORDER } from '@megacampus/shared-types';
const currentIndex = TIER_ORDER.indexOf(currentTier);
```

---

### LOW Priority Issues (3)

#### L1. Deprecated Constants Still in Use

**File**: `packages/shared-types/src/file-upload-constants.ts` (lines 120-122)
**Severity**: LOW (Technical Debt)

**Issue**:
Deprecated `MAX_FILE_SIZE_BYTES` constant is exported but no migration plan is documented.

**Current Code**:

```typescript
/**
 * @deprecated Use FILE_SIZE_LIMITS_BY_TIER instead
 */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
```

**Impact**:

- Confusion for developers
- Risk of using wrong limit

**Recommendation**:

- Add TODO comment with deprecation timeline
- Consider removing in next major version
- Add console warning when used in development mode

---

#### L2. Incomplete Error Messages in Russian

**File**: `packages/web/components/forms/file-upload.tsx` (multiple locations)
**Severity**: LOW (UX)

**Issue**:
Error messages are hardcoded in Russian. No i18n support for other languages.

**Impact**:

- Limited to Russian-speaking users
- Inconsistent with rest of platform if multilingual

**Recommendation**:

- Use i18n for error messages
- Extract to translation files (`messages/ru/fileUpload.json`, `messages/en/fileUpload.json`)

---

#### L3. Missing JSDoc for Public Functions

**File**: `packages/web/components/forms/file-upload.tsx` (lines 62, 78, 93)
**Severity**: LOW (Documentation)

**Issue**:
Helper functions `getSuggestedTierForSize`, `getMinTierForExtension`, `isExtensionSupportedAnywhere` lack JSDoc comments.

**Impact**:

- Harder for other developers to understand purpose
- No type hints in IDE hover

**Recommendation**:
Add JSDoc comments:

```typescript
/**
 * Suggests the minimum tier required for a given file size
 * @param fileSize - File size in bytes
 * @param currentTier - Current organization tier
 * @returns Suggested tier or null if file too large even for premium
 */
function getSuggestedTierForSize(fileSize: number, currentTier: TierKey): TierKey | null {
  // ...
}
```

---

## 3. Improvements Suggested

### 3.1 Testing

**Missing Test Coverage**:

- No unit tests for tier-based validation logic
- No integration tests for tier enforcement
- No tests for upgrade suggestion logic

**Recommended Tests**:

```typescript
// file-upload.test.tsx
describe('FileUpload tier validation', () => {
  it('should reject files exceeding free tier limit (5MB)', () => {
    const file = createMockFile(6 * 1024 * 1024); // 6MB
    const validation = validateFile(file, 'free');
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('5 МБ');
  });

  it('should accept files within premium tier limit (100MB)', () => {
    const file = createMockFile(50 * 1024 * 1024); // 50MB
    const validation = validateFile(file, 'premium');
    expect(validation.valid).toBe(true);
  });

  it('should suggest correct tier for upgrade', () => {
    const fileSize = 15 * 1024 * 1024; // 15MB
    const suggestion = getSuggestedTierForSize(fileSize, 'basic');
    expect(suggestion).toBe('trial'); // or 'standard'
  });
});
```

---

### 3.2 Performance Optimization

**Issue**: Multiple Supabase queries in tier loading

**File**: `useCreateCourseForm.ts` (line 173-177)

**Current**:

```typescript
const { data: orgData } = await supabase
  .from('users')
  .select('organization_id, organizations!inner(tier)')
  .eq('id', user.id)
  .single();
```

**Optimization**:
This query uses a join which is good. However, consider caching the tier value:

```typescript
// Cache tier in localStorage for faster initial load
const cachedTier = localStorage.getItem('organizationTier');
if (cachedTier && isValidTier(cachedTier)) {
  setOrganizationTier(cachedTier);
}

// Then fetch fresh value in background
const tier = await fetchOrganizationTier();
setOrganizationTier(tier);
localStorage.setItem('organizationTier', tier);
```

---

### 3.3 User Experience Enhancements

#### Better Tier Display

Currently tier is only shown indirectly through limits. Consider showing tier badge:

```tsx
<div className="mb-2 flex items-center gap-2">
  <Badge variant="premium">{TIER_DISPLAY_NAMES[tier]}</Badge>
  <span className="text-sm text-gray-600">
    {maxFileSizeMB} МБ, {maxFiles} файлов
  </span>
</div>
```

#### Proactive Upgrade Prompts

When user tries to upload a file exceeding limits, show upgrade CTA:

```tsx
{
  validation.error && suggestedTier && (
    <Button onClick={() => router.push('/pricing')}>
      Перейти на тариф {TIER_DISPLAY_NAMES[suggestedTier]}
    </Button>
  );
}
```

---

### 3.4 Security Hardening

#### Rate Limiting by Tier

Consider adding tier-based rate limits for file uploads:

```typescript
const UPLOAD_RATE_LIMITS: Record<TierKey, { maxPerHour: number }> = {
  free: { maxPerHour: 5 },
  basic: { maxPerHour: 10 },
  trial: { maxPerHour: 20 },
  standard: { maxPerHour: 50 },
  premium: { maxPerHour: 200 },
};
```

#### File Content Validation

Current validation only checks file extension and MIME type. Consider:

- Virus scanning for premium tiers
- File integrity checks
- Magic number validation (actual file type vs extension)

---

## 4. Code Quality Notes

### Positive Patterns

✅ **Single Source of Truth**:

- All constants in `@megacampus/shared-types` package
- Proper exports and imports across packages

✅ **Type Safety**:

- Strong TypeScript typing with `TierKey` type
- Readonly arrays for constants
- Proper type exports

✅ **User-Friendly Messages**:

- Upgrade hints suggest specific tier
- Clear error messages with limits shown
- Russian localization (though hardcoded)

✅ **Backward Compatibility**:

- Deprecated constants still available
- Graceful fallbacks to 'standard' tier

✅ **Clean Data Flow**:

```
Database (organization.tier)
  → Supabase query
  → useState hook
  → Component props
  → FileUpload validation
```

---

### Areas Needing Improvement

⚠️ **Error Handling**:

- Silent failures when tier not found
- No user notification for tier loading errors
- Missing error boundaries

⚠️ **Code Duplication**:

- Tier order array repeated 3 times
- Tier display names defined once but could be in shared-types

⚠️ **Missing Validation**:

- Backend doesn't enforce tier limits (critical)
- No validation for tier value from database

⚠️ **Testing**:

- No automated tests for tier logic
- Manual testing required for each tier

---

## 5. Specific File Analysis

### 5.1 `file-upload-constants.ts`

**Rating**: ✅ Excellent

**Strengths**:

- Comprehensive comments explaining tier restrictions
- Well-organized sections
- Proper type exports
- Backward compatibility

**Minor Issues**:

- Could add tier order constant
- Deprecated constants need migration timeline

---

### 5.2 `server/index.ts`

**Rating**: ⚠️ Needs Improvement

**Strengths**:

- Good comments explaining 100MB limit
- Proper global limit configuration

**Critical Issues**:

- Missing tier-based backend validation (H1)
- Comment mentions tier validation but not implemented

---

### 5.3 `file-upload.tsx`

**Rating**: ✅ Good

**Strengths**:

- Comprehensive frontend validation
- Good user messaging with upgrade hints
- Proper tier-aware limits
- Clean component structure

**Issues**:

- Hardcoded tier order (M4)
- Hardcoded Russian messages (L2)
- Missing JSDoc on helpers (L3)

---

### 5.4 `UploadSection.tsx`

**Rating**: ✅ Excellent

**Strengths**:

- Clean passthrough of tier prop
- Good use of useMemo for computed values
- Clear user messaging

**Minor**:

- Could add tier badge for visibility

---

### 5.5 `useCreateCourseForm.ts`

**Rating**: ⚠️ Needs Improvement

**Strengths**:

- Proper async tier loading
- Good Supabase join query
- Type safety with TierKey

**Issues**:

- Race condition with initial state (H2)
- Silent failure when org not found (M1)
- Type coercion without validation (M2)

---

### 5.6 `create-course-form.tsx`

**Rating**: ✅ Excellent

**Strengths**:

- Clean prop passing
- Proper tier flow from hook to component

**No issues found**

---

## 6. Final Recommendations

### Immediate Actions (Before Merge)

1. **Add backend tier validation** (H1) - Critical security issue
2. **Fix tier loading race condition** (H2) - Poor UX
3. **Add tier validation** (M2) - Type safety

### Short-term (Next Sprint)

4. **Extract tier order to constants** (M4)
5. **Add error notification for tier loading failure** (M1)
6. **Add unit tests for validation logic**

### Long-term (Future)

7. **Add i18n for error messages** (L2)
8. **Add JSDoc comments** (L3)
9. **Consider rate limiting by tier**
10. **Add file content validation**

---

## 7. Conclusion

The tier-based file upload limits feature is well-implemented on the **frontend** with good type safety, user messaging, and proper single-source-of-truth pattern. However, it has a **critical security gap** in the backend where tier limits are not enforced.

**Overall Score**: 7.5/10

**Before Merge**:

- ⚠️ **MUST FIX**: Add backend tier validation (H1)
- ⚠️ **SHOULD FIX**: Tier loading race condition (H2)
- ✅ **CAN MERGE** after H1 is addressed (H2 can be fixed post-merge if time-sensitive)

**Key Strengths**:

- Clean architecture
- Type safety
- Good UX with upgrade hints

**Key Weaknesses**:

- Missing backend validation
- Silent error handling
- No tests

---

**Review Complete**
_Generated by Claude Code on 2026-01-21_
