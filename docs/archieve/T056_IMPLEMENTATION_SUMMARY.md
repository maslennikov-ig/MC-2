# T056: Create Billing Router (Placeholder) - Implementation Summary

## Overview

Successfully implemented the **billing router** for the Stage 0 Foundation project with placeholder procedures for billing and usage tracking. This router provides organization storage usage metrics and tier quota information for authenticated users.

## Files Created/Modified

### Created Files:

1. `/home/me/code/megacampus2/packages/course-gen-platform/src/server/routers/billing.ts` (297 lines)
   - Main billing router with two protected procedures

2. `/home/me/code/megacampus2/packages/course-gen-platform/src/server/utils/billing-helpers.ts` (70 lines)
   - Shared billing utility functions and constants

## Implementation Details

### 1. Billing Router Procedures

#### `billing.getUsage`

**Purpose**: Display current storage usage for the authenticated user's organization

**Authorization**: Protected procedure (requires authentication)

**Input**: None (uses `ctx.user.organizationId` from authenticated context)

**Output**:

- `storageUsedBytes`: Raw bytes currently used
- `storageQuotaBytes`: Raw bytes allowed by tier
- `storageUsedFormatted`: Human-readable usage (e.g., "50.00 MB")
- `storageQuotaFormatted`: Human-readable quota (e.g., "100.00 MB")
- `usagePercentage`: Percentage of quota used (0-100, rounded to 2 decimal places)
- `fileCount`: Total number of files uploaded by organization
- `tier`: Current organization tier

**Data Sources**:

- `organizations` table: storage_used_bytes, storage_quota_bytes, tier
- `file_catalog` table: COUNT(\*) WHERE organization_id = ctx.user.organizationId

**Error Handling**:

- Unauthenticated → 401 UNAUTHORIZED
- Organization not found → 404 NOT_FOUND
- Database query fails → 500 INTERNAL_SERVER_ERROR

#### `billing.getQuota`

**Purpose**: Display tier details and quota limits

**Authorization**: Protected procedure (requires authentication)

**Input**: None (uses `ctx.user.organizationId` from authenticated context)

**Output**:

- `tier`: Current organization tier (free, basic_plus, standard, premium)
- `tierDisplayName`: Human-readable tier name (e.g., "Basic Plus")
- `storageQuotaBytes`: Storage limit in bytes
- `storageQuotaFormatted`: Human-readable storage limit (e.g., "1.00 GB")
- `fileCountLimit`: Maximum files per course for this tier
- `fileCountLimitDisplay`: Formatted file count limit (e.g., "3 files per course")
- `canUpgrade`: Whether upgrade is available
- `nextTier`: Next tier in upgrade path (null if at premium)
- `upgradePrompt`: Message encouraging upgrade (null if at premium)

**Data Sources**:

- `organizations` table: tier, storage_quota_bytes
- `FILE_COUNT_LIMITS_BY_TIER` constant from shared-types
- `STORAGE_QUOTA_BY_TIER` constant from billing-helpers

**Error Handling**:

- Unauthenticated → 401 UNAUTHORIZED
- Organization not found → 404 NOT_FOUND
- Database query fails → 500 INTERNAL_SERVER_ERROR

### 2. Billing Helper Functions

**Location**: `/home/me/code/megacampus2/packages/course-gen-platform/src/server/utils/billing-helpers.ts`

**Exports**:

- `STORAGE_QUOTA_BY_TIER`: Tier to storage quota mapping (bytes)
  - Free: 10,485,760 bytes (10 MB)
  - Basic Plus: 104,857,600 bytes (100 MB)
  - Standard: 1,073,741,824 bytes (1 GB)
  - Premium: 10,737,418,240 bytes (10 GB)

- `formatBytes(bytes: number)`: Convert bytes to human-readable format
  - Returns formatted string (e.g., "1.50 GB", "500.00 MB", "10.00 KB")

- `getNextTier(currentTier)`: Get next tier upgrade path
  - Returns next tier or null if already at premium

- `formatTierName(tier)`: Format tier name for display
  - Converts enum values to human-readable names (e.g., "basic_plus" → "Basic Plus")

## Architecture Decisions

### 1. Protected Procedures Only

Both procedures use `protectedProcedure` to ensure authentication. This aligns with the security requirement that billing information should only be visible to authenticated users.

### 2. Organization-Scoped Queries

All queries use `ctx.user.organizationId` to ensure users can only view their organization's billing information. This provides proper data isolation.

### 3. Defensive Error Handling

- All database queries wrapped in try-catch blocks
- TRPCError instances re-thrown to preserve error context
- Errors logged for debugging with console.error
- User-friendly error messages without exposing internal details

### 4. Modular Design

Helper functions extracted to separate file to:

- Keep billing router under 300-line ESLint limit
- Enable reuse across future billing-related modules
- Improve testability

### 5. Type Safety

- Full TypeScript type inference with Database types
- Proper enum handling for tier values
- Exported router type for app-router integration

## Future Expansion (Placeholders)

The following procedures are documented as future expansion areas:

1. **billing.getSubscription**: Active subscription details with payment method info
2. **billing.upgradeTier**: Initiate tier upgrade workflow with payment processing
3. **billing.downgradeTier**: Initiate tier downgrade with validation
4. **billing.getBillingHistory**: Past invoices and payment history
5. **billing.updatePaymentMethod**: Update payment method via Stripe/Paddle
6. **billing.cancelSubscription**: Cancel subscription with confirmation
7. **billing.getUsageAlerts**: Storage usage alerts and notifications

## Code Quality

### Line Counts

- `billing.ts`: 297 lines (within 300-line ESLint limit)
- `billing-helpers.ts`: 70 lines

### TypeScript Compliance

- Zero TypeScript errors in billing router
- Full type safety with Database types
- Proper type exports for router inference

### Documentation

- Comprehensive JSDoc documentation for all procedures
- Clear parameter and return type descriptions
- Usage examples for each procedure
- Inline comments explaining business logic

## Integration Points

### Dependencies Used:

- `@trpc/server`: TRPCError for error handling
- `../trpc`: router, protectedProcedure builders
- `../../shared/supabase/admin`: getSupabaseAdmin() for database queries
- `@megacampus/shared-types`: FILE_COUNT_LIMITS_BY_TIER, Database types

### Database Tables Queried:

- `organizations`: tier, storage_used_bytes, storage_quota_bytes
- `file_catalog`: COUNT(\*) for file count aggregation

### Context Requirements:

- `ctx.user.organizationId`: User's organization ID from JWT
- `ctx.user` must be non-null (enforced by protectedProcedure)

## Testing Considerations

### Test Scenarios for Future Tests:

1. **Authentication Tests**:
   - Unauthenticated requests should return 401 UNAUTHORIZED
   - Valid JWT should allow access to procedures

2. **getUsage Tests**:
   - Returns correct storage metrics for organization
   - Calculates usage percentage correctly
   - Handles organizations with zero quota gracefully
   - Returns accurate file count

3. **getQuota Tests**:
   - Returns correct tier information
   - Generates proper upgrade prompts
   - Handles premium tier (no upgrade available)
   - Formats file count limits correctly

4. **Error Handling Tests**:
   - Handles missing organization gracefully
   - Logs and wraps database errors properly
   - Returns user-friendly error messages

## Next Steps (T057-T058)

1. **T057**: Create webhooks router (placeholder)
   - Stripe webhook handler stub
   - Payment success/failure endpoints
   - Subscription status updates

2. **T058**: Create app router (integration)
   - Merge all routers (generation, jobs, billing, webhooks, admin)
   - Export unified AppRouter type
   - Integrate with HTTP server

3. **Integration Testing**:
   - Write integration tests for billing procedures
   - Mock Supabase responses for isolated testing
   - Validate error handling scenarios

## Success Criteria Checklist

- [x] File created at correct path: `packages/course-gen-platform/src/server/routers/billing.ts`
- [x] Both procedures (`getUsage`, `getQuota`) implemented
- [x] Both procedures require authentication (use `protectedProcedure`)
- [x] Database queries use Supabase admin client
- [x] Usage percentage calculated correctly
- [x] File count aggregation implemented
- [x] Type-safe responses returned
- [x] Router properly exported for app-router integration (T058)
- [x] Code follows ESLint rules (max 300 lines per file)
- [x] TypeScript compiles without errors
- [x] Comprehensive JSDoc documentation
- [x] Placeholder comments indicating future payment integration

## Notes

- This is a **Stage 0 placeholder implementation** focused on read-only operations
- No payment processing is implemented (future stages)
- Storage quota enforcement happens at file upload time via separate validator (T052)
- Billing router is ready for integration into app-router (T058)
