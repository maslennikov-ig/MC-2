# Storage Quota Enforcement

This module provides real-time storage quota enforcement for multi-tenant course generation platform with atomic operations to prevent race conditions.

## Overview

The quota enforcement system ensures organizations stay within their tier-based storage limits through:

- **Real-time quota checking** before file uploads
- **Atomic increment/decrement** operations to prevent race conditions
- **Database constraints** to enforce quota limits at the database level
- **User-friendly error messages** with formatted byte sizes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  (tRPC procedures, API handlers, file upload handlers)      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Quota Enforcer Module                       │
│  • checkQuota()      - Pre-upload validation                │
│  • incrementQuota()  - Post-upload quota update             │
│  • decrementQuota()  - Post-delete quota update             │
│  • getQuotaInfo()    - Retrieve quota status                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL (Supabase Admin)                     │
│  • increment_storage_quota() - Atomic RPC function          │
│  • decrement_storage_quota() - Atomic RPC function          │
│  • organizations table with CHECK constraint                │
└─────────────────────────────────────────────────────────────┘
```

## Files

- `quota-enforcer.ts` - Main implementation with all quota functions
- `quota-enforcer.example.ts` - Usage examples and integration patterns
- `__tests__/quota-enforcer.test.ts` - Comprehensive integration tests
- `QUOTA_ENFORCEMENT.md` - This documentation

## Database Migration

The quota enforcement requires PostgreSQL RPC functions. Apply the migration:

```bash
# From course-gen-platform directory
cd supabase
supabase db push

# Or apply migration file directly
psql $DATABASE_URL -f migrations/20250112_storage_quota_functions.sql

# Regenerate TypeScript types after migration
cd ..
npm run supabase:generate-types
```

### Migration Details

Location: `supabase/migrations/20250112_storage_quota_functions.sql`

The migration creates three PostgreSQL functions:

1. **`increment_storage_quota(org_id UUID, size_bytes BIGINT)`**
   - Atomically increments storage_used_bytes
   - Throws constraint violation if quota would be exceeded
   - Uses `SECURITY DEFINER` for admin access
   - Returns `false` if organization not found, `true` if successful

2. **`decrement_storage_quota(org_id UUID, size_bytes BIGINT)`**
   - Atomically decrements storage_used_bytes
   - Uses `GREATEST(0, ...)` to prevent negative values
   - Returns `false` if organization not found, `true` if successful

3. **`reset_storage_quota(org_id UUID)`**
   - Resets storage_used_bytes to zero
   - For testing and administrative purposes only
   - Should be restricted in production

## Tier Quotas

```typescript
const TIER_QUOTAS = {
  free: 10485760, // 10 MB
  basic_plus: 104857600, // 100 MB
  standard: 1073741824, // 1 GB
  premium: 10737418240, // 10 GB
};
```

## Usage

### Basic File Upload Flow

```typescript
import { checkQuota, incrementQuota } from '@/shared/validation/quota-enforcer';
import { QuotaExceededError } from '@/server/errors/typed-errors';

async function uploadFile(organizationId: string, file: File) {
  // 1. Check quota BEFORE upload
  const check = await checkQuota(organizationId, file.size);

  if (!check.allowed) {
    throw new QuotaExceededError(
      `Upload would exceed quota. Using ${check.currentUsageFormatted} ` +
        `of ${check.totalQuotaFormatted}. Available: ${check.availableSpaceFormatted}.`
    );
  }

  // 2. Perform upload
  const fileUrl = await uploadToStorage(file);

  // 3. Update quota AFTER successful upload
  await incrementQuota(organizationId, file.size);

  return { fileUrl };
}
```

### File Deletion Flow

```typescript
import { decrementQuota } from '@/shared/validation/quota-enforcer';

async function deleteFile(organizationId: string, fileId: string) {
  // 1. Get file info
  const file = await db.fileCatalog.findUnique({ where: { id: fileId } });

  // 2. Delete from storage
  await deleteFromStorage(file.storagePath);

  // 3. Delete from database
  await db.fileCatalog.delete({ where: { id: fileId } });

  // 4. Update quota AFTER successful deletion
  await decrementQuota(organizationId, file.fileSize);
}
```

### Display Quota Information

```typescript
import { getQuotaInfo } from '@/shared/validation/quota-enforcer';

async function displayQuota(organizationId: string) {
  const info = await getQuotaInfo(organizationId);

  console.log(`Using ${info.storageUsedFormatted} of ${info.storageQuotaFormatted}`);
  console.log(`${info.usagePercentage.toFixed(1)}% used`);
  console.log(`${info.availableFormatted} available`);

  return info;
}
```

## API Reference

### `checkQuota(organizationId, fileSize): Promise<QuotaCheckResult>`

Check if a file upload would exceed quota. Call this BEFORE starting upload.

**Parameters:**

- `organizationId` (string) - Organization UUID
- `fileSize` (number) - File size in bytes

**Returns:** `QuotaCheckResult` with:

- `allowed` (boolean) - Whether upload is allowed
- `currentUsage` (number) - Current usage in bytes
- `totalQuota` (number) - Total quota in bytes
- `availableSpace` (number) - Available space in bytes
- `projectedUsage` (number) - Usage after upload
- Formatted strings for display

**Throws:**

- `Error` if organizationId is invalid
- `Error` if fileSize is invalid or negative
- `Error` if organization not found

---

### `incrementQuota(organizationId, fileSize): Promise<void>`

Atomically increment organization's storage usage. Call this AFTER successful upload.

**Parameters:**

- `organizationId` (string) - Organization UUID
- `fileSize` (number) - File size in bytes

**Throws:**

- `QuotaExceededError` if increment would violate quota constraint
- `Error` if organizationId is invalid
- `Error` if fileSize is invalid
- `Error` if organization not found

**Race Condition Safety:** Uses PostgreSQL RPC function for atomic updates.

---

### `decrementQuota(organizationId, fileSize): Promise<void>`

Atomically decrement organization's storage usage. Call this AFTER successful file deletion.

**Parameters:**

- `organizationId` (string) - Organization UUID
- `fileSize` (number) - File size in bytes

**Throws:**

- `Error` if organizationId is invalid
- `Error` if fileSize is invalid
- `Error` if organization not found

**Safety:** Never decrements below zero.

---

### `getQuotaInfo(organizationId): Promise<QuotaInfo>`

Get comprehensive quota information for an organization.

**Parameters:**

- `organizationId` (string) - Organization UUID

**Returns:** `QuotaInfo` with:

- `organizationId` (string)
- `storageUsedBytes` (number)
- `storageQuotaBytes` (number)
- `availableBytes` (number)
- `usagePercentage` (number)
- `tier` (enum)
- Formatted strings for display

**Throws:**

- `Error` if organizationId is invalid
- `Error` if organization not found

---

### `formatBytes(bytes): string`

Format bytes to human-readable string.

**Example:**

```typescript
formatBytes(0); // "0 Bytes"
formatBytes(1024); // "1 KB"
formatBytes(1048576); // "1 MB"
formatBytes(1073741824); // "1 GB"
```

---

### `calculateUsagePercentage(used, total): number`

Calculate usage percentage (0-100).

**Example:**

```typescript
calculateUsagePercentage(50, 100); // 50
calculateUsagePercentage(150, 100); // 100 (capped)
```

## Error Handling

The module throws specific error types for different scenarios:

### QuotaExceededError

Thrown when quota would be exceeded:

```typescript
try {
  await incrementQuota(orgId, fileSize);
} catch (error) {
  if (error instanceof QuotaExceededError) {
    // Handle quota exceeded - show upgrade prompt
    console.error(error.message);
    // error.statusCode === 429
    // error.code === 'QUOTA_EXCEEDED'
  }
}
```

### Validation Errors

Thrown for invalid inputs:

```typescript
// Invalid organizationId
await checkQuota('', 1000); // Error: Invalid organizationId

// Invalid fileSize
await checkQuota(orgId, -100); // Error: Invalid fileSize
await checkQuota(orgId, 0); // Error: Invalid fileSize
```

### Database Errors

Thrown when database operations fail:

```typescript
// Non-existent organization
await checkQuota('00000000-0000-0000-0000-000000000000', 1000);
// Error: Organization not found
```

## Race Condition Handling

The module handles concurrent uploads safely through:

1. **PostgreSQL Atomic Operations** - RPC functions use row-level locking
2. **Database Constraints** - CHECK constraint ensures quota never exceeded
3. **Double-Check Pattern** - checkQuota before upload, constraint enforced during increment

### Example: Concurrent Uploads

```typescript
// Multiple concurrent uploads
const uploads = [uploadFile(orgId, file1), uploadFile(orgId, file2), uploadFile(orgId, file3)];

const results = await Promise.allSettled(uploads);

// Some may succeed, some may fail with QuotaExceededError
// Database ensures quota is never exceeded
```

## Testing

Run the test suite:

```bash
npm run test src/shared/validation/__tests__/quota-enforcer.test.ts
```

### Test Coverage

- ✅ Utility functions (formatBytes, calculateUsagePercentage)
- ✅ Quota checking logic
- ✅ Atomic increment operations
- ✅ Atomic decrement operations
- ✅ Quota information retrieval
- ✅ Error handling and validation
- ✅ Race condition handling (concurrent operations)
- ✅ Complete upload/delete lifecycle
- ✅ Quota enforcement during concurrent uploads

## Integration with tRPC

Example tRPC procedure with quota enforcement:

```typescript
import { z } from 'zod';
import { authenticatedProcedure } from '@/server/trpc';
import { checkQuota, incrementQuota, formatBytes } from '@/shared/validation/quota-enforcer';
import { QuotaExceededError } from '@/server/errors/typed-errors';

export const uploadFileProcedure = authenticatedProcedure
  .input(
    z.object({
      fileName: z.string(),
      fileSize: z.number().positive(),
      base64Content: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const { organizationId } = ctx.user;

    // Check quota
    const check = await checkQuota(organizationId, input.fileSize);
    if (!check.allowed) {
      throw new QuotaExceededError(
        `Upload would exceed quota. Using ${check.currentUsageFormatted} ` +
          `of ${check.totalQuotaFormatted}.`
      );
    }

    // Upload file
    const fileUrl = await uploadToStorage(input);

    // Save to database
    const file = await ctx.db.fileCatalog.create({
      data: {
        organizationId,
        filename: input.fileName,
        fileSize: input.fileSize,
        storagePath: fileUrl,
      },
    });

    // Update quota
    await incrementQuota(organizationId, input.fileSize);

    return { success: true, file };
  });
```

## Performance Considerations

1. **checkQuota is fast** - Single SELECT query
2. **incrementQuota/decrementQuota use atomic RPC** - No round trips
3. **Database constraints provide final safety net** - Even if checks fail
4. **Indexes on organizations(id)** - Fast quota lookups (already exists as PK)

## Monitoring and Alerts

Consider implementing:

1. **Quota usage alerts** - Notify when usage exceeds 75%, 90%
2. **Quota exceeded metrics** - Track QuotaExceededError occurrences
3. **Usage trends** - Monitor storage growth over time
4. **Tier upgrade prompts** - Suggest upgrades when quota reached

## Troubleshooting

### TypeScript errors for RPC functions

If you see errors like `Argument of type '"increment_storage_quota"' is not assignable...`:

1. Apply the migration: `supabase db push`
2. Regenerate types: `npm run supabase:generate-types`
3. Restart TypeScript server in your IDE

### Quota not updating

Check:

1. Migration applied successfully: `SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%quota%';`
2. RPC functions have correct permissions: `\df increment_storage_quota` in psql
3. Supabase admin client is configured correctly
4. Environment variables set (SUPABASE_URL, SUPABASE_SERVICE_KEY)

### Race conditions still occurring

Verify:

1. PostgreSQL version supports row-level locking (9.5+)
2. RPC functions use `SECURITY DEFINER`
3. No direct UPDATE queries bypassing RPC functions

## Security Notes

1. **Use Supabase admin client** - RPC functions require admin access
2. **Validate organizationId** - Ensure user owns the organization
3. **Never expose service key** - Keep SUPABASE_SERVICE_KEY secret
4. **RLS policies** - Organizations table should have proper RLS
5. **Input validation** - Always validate file sizes and IDs

## Related Documentation

- See `file-validator.ts` for tier-based file type and count validation
- See `supabase/migrations/20250110_initial_schema.sql` for database schema
- See `packages/shared-types/src/zod-schemas.ts` for tier definitions

## License

Part of MegaCampusAI course generation platform.
