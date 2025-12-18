# Data Model: Stage 2 Verification Database Changes

**Date**: 2025-10-24
**Feature**: Stage 2 Implementation Verification and Completion
**Branch**: `003-stage-2-implementation`

## Overview

This document describes the database schema changes required for Stage 2 verification:
1. **Tier ENUM corrections** (add TRIAL, enforce BASIC format restrictions via code)
2. **error_logs table creation** (permanent failure tracking for admin panel)
3. **Validation queries** (verify tier structure and error logging)

## Schema Changes

### 1. Subscription Tier ENUM Update

**Current State** (presumed from spec):
```sql
-- Existing ENUM (missing TRIAL tier)
CREATE TYPE subscription_tier AS ENUM ('free', 'basic', 'standard', 'premium');
-- Note: May have 'basic_plus' instead of 'basic' (naming inconsistency)
```

**Target State**:
```sql
-- Updated ENUM with all 5 tiers
CREATE TYPE subscription_tier AS ENUM ('trial', 'free', 'basic', 'standard', 'premium');
```

**Migration Strategy**:
- Use `ALTER TYPE subscription_tier ADD VALUE 'trial' BEFORE 'free'` (PostgreSQL 12+)
- If 'basic_plus' exists, create new ENUM and migrate data (cannot rename ENUM values directly)
- Validate no existing organizations use invalid tier values

**Affected Tables**:
- `organizations.subscription_tier` (FK reference, auto-updates with ENUM change)
- Any RLS policies filtering by tier (should continue working with new ENUM values)

**Validation Queries**:
```sql
-- Verify TRIAL tier exists in ENUM
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = 'subscription_tier'::regtype
ORDER BY enumsortorder;
-- Expected: trial, free, basic, standard, premium

-- Verify no organizations use invalid tiers
SELECT subscription_tier, COUNT(*)
FROM organizations
GROUP BY subscription_tier;
-- Expected: All tiers in valid ENUM, no NULLs or unexpected values
```

### 2. Error Logs Table Creation

**Entity**: `error_logs`

**Purpose**: Centralized permanent failure tracking for admin panel access, isolated from operational metrics.

**Schema**:
```sql
CREATE TABLE error_logs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- User and organization context
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Error details (required)
  error_message TEXT NOT NULL,
  stack_trace TEXT,  -- Optional for some error types
  severity TEXT NOT NULL CHECK (severity IN ('WARNING', 'ERROR', 'CRITICAL')),

  -- File context (for document processing errors)
  file_name TEXT,
  file_size BIGINT,
  file_format TEXT,  -- e.g., 'pdf', 'docx', 'txt'

  -- Job context (for BullMQ worker errors)
  job_id TEXT,
  job_type TEXT,  -- e.g., 'DOCUMENT_PROCESSING', 'CREATE_SUMMARY'

  -- Extensibility
  metadata JSONB DEFAULT '{}'::jsonb  -- Additional context as needed
);

-- Indexes for admin panel queries
CREATE INDEX idx_error_logs_user_id ON error_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_error_logs_org_id ON error_logs(organization_id);
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_severity ON error_logs(severity) WHERE severity = 'CRITICAL';

-- RLS Policy (admin-only access)
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin can view all error logs"
  ON error_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.role = 'super_admin'
    )
  );

CREATE POLICY "Users can view their own organization's errors"
  ON error_logs
  FOR SELECT
  USING (
    organization_id = (
      SELECT organization_id FROM auth.users WHERE id = auth.uid()
    )
    AND (
      SELECT role FROM auth.users WHERE id = auth.uid()
    ) = 'admin'
  );

-- Note: No INSERT/UPDATE/DELETE policies needed - workers use service role
```

**Field Descriptions**:

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | UUID | NOT NULL | Primary key, auto-generated |
| `created_at` | TIMESTAMPTZ | NOT NULL | Error timestamp, defaults to NOW() |
| `user_id` | UUID | NULL | User who triggered the operation (NULL if system-initiated) |
| `organization_id` | UUID | NOT NULL | Organization context (required for RLS) |
| `error_message` | TEXT | NOT NULL | Human-readable error description |
| `stack_trace` | TEXT | NULL | Full stack trace (optional for non-exception errors) |
| `severity` | TEXT | NOT NULL | WARNING \| ERROR \| CRITICAL (CHECK constraint) |
| `file_name` | TEXT | NULL | Original filename (for document processing errors) |
| `file_size` | BIGINT | NULL | File size in bytes (for quota violation context) |
| `file_format` | TEXT | NULL | File extension/MIME type (for format validation errors) |
| `job_id` | TEXT | NULL | BullMQ job ID (for job failure correlation) |
| `job_type` | TEXT | NULL | BullMQ job type (e.g., DOCUMENT_PROCESSING) |
| `metadata` | JSONB | NOT NULL | Extensible JSON field (default empty object) |

**Relationships**:
- `user_id` → `auth.users.id` (ON DELETE SET NULL - preserve error history)
- `organization_id` → `organizations.id` (ON DELETE CASCADE - clean up with org)

**Lifecycle**:
1. **Insert**: Workers use service role to insert errors (bypasses RLS)
2. **Select**: SuperAdmin can view all, Org Admin can view their org's errors
3. **Update**: Not allowed (audit trail immutability)
4. **Delete**: Automatic via ON DELETE CASCADE, or manual cleanup (>90 days old)

**Validation Queries**:
```sql
-- Verify table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'error_logs'
ORDER BY ordinal_position;

-- Verify indexes exist
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'error_logs';

-- Verify RLS policies
SELECT policyname, permissive, roles, qual
FROM pg_policies
WHERE tablename = 'error_logs';

-- Test error log insertion (as service role)
INSERT INTO error_logs (
  organization_id, user_id, error_message, severity,
  file_name, file_size, file_format, job_id, job_type
) VALUES (
  'test-org-uuid'::uuid,
  'test-user-uuid'::uuid,
  'Test error: Qdrant connection timeout',
  'ERROR',
  'test-document.pdf',
  5242880,  -- 5MB
  'pdf',
  'job-12345',
  'DOCUMENT_PROCESSING'
) RETURNING id, created_at;

-- Verify retrieval (as SuperAdmin or Org Admin)
SELECT id, created_at, severity, error_message, file_name, job_type
FROM error_logs
WHERE organization_id = 'test-org-uuid'::uuid
ORDER BY created_at DESC
LIMIT 10;
```

### 3. Tier Configuration Validation

**Not a schema change**, but documented here for completeness.

**File Format Restrictions** (enforced in TypeScript code, not database constraints):

| Tier | Allowed Formats | Validation Location |
|------|-----------------|---------------------|
| TRIAL | PDF, DOCX, PPTX, TXT, MD (all formats except export) | `src/lib/file-validator.ts` |
| FREE | None (0 files allowed) | `src/lib/tier-validator.ts` + frontend UI |
| BASIC | TXT, MD only | `src/lib/file-validator.ts` |
| STANDARD | PDF, DOCX, PPTX, TXT, MD (same as TRIAL) | `src/lib/file-validator.ts` |
| PREMIUM | PDF, DOCX, PPTX, TXT, MD + image OCR | `src/lib/file-validator.ts` |

**Rationale for Code-Level Validation**:
- Database CHECK constraints on formats are inflexible (hard to update without migration)
- TypeScript validation provides better error messages (tier-specific user guidance)
- Easier to test (unit tests for validation logic, integration tests for enforcement)
- Consistent with constitution principle (configuration > schema complexity)

**Concurrent Upload Limits** (tracked in-memory or via Redis, not database):

| Tier | Max Concurrent Uploads | Validation Location |
|------|------------------------|---------------------|
| TRIAL | 5 | `src/lib/tier-validator.ts` |
| FREE | 1 | `src/lib/tier-validator.ts` |
| BASIC | 2 | `src/lib/tier-validator.ts` |
| STANDARD | 5 | `src/lib/tier-validator.ts` |
| PREMIUM | 10 | `src/lib/tier-validator.ts` |

**Storage Quotas** (enforced via database query aggregation):

| Tier | Max Storage (GB) | Validation Query |
|------|------------------|------------------|
| TRIAL | 1 | `SELECT SUM(file_size) FROM file_catalog WHERE organization_id = ?` |
| FREE | 0 (no files) | Hard-coded in tier config |
| BASIC | 0.5 | Same aggregation query |
| STANDARD | 1 | Same aggregation query |
| PREMIUM | 10 | Same aggregation query |

## Migration Dependencies

**Execution Order** (CRITICAL - sequential only):

1. **Migration 1**: `add_trial_tier_to_enum.sql`
   - Add TRIAL to subscription_tier ENUM
   - Validate ENUM values via pg_enum query
   - **BLOCKS**: All subsequent migrations (tier validation depends on complete ENUM)

2. **Migration 2**: `create_error_logs_table.sql`
   - Create error_logs table with indexes and RLS policies
   - Validate table structure via information_schema
   - **BLOCKS**: Integration tests (tests verify error logging works)

3. **Migration 3** (if needed): `rename_basic_plus_to_basic.sql`
   - Only if database has 'basic_plus' instead of 'basic'
   - Create new ENUM, migrate data, drop old ENUM, rename new
   - **BLOCKS**: Code deployment (tier-validator.ts references 'basic')

**Rollback Strategy**:
- All migrations wrapped in transactions (PostgreSQL DDL is transactional)
- If migration fails, automatic rollback to pre-migration state
- No manual compensation needed (test data can be recreated)
- Validate rollback by triggering intentional error in migration script

## Data Validation Scripts

### Tier Structure Validation

```sql
-- Script: validate-tier-structure.sql
-- Purpose: Verify all 5 tiers exist and no invalid tier values

-- 1. Check ENUM values
WITH tier_enum AS (
  SELECT enumlabel AS tier
  FROM pg_enum
  WHERE enumtypid = 'subscription_tier'::regtype
  ORDER BY enumsortorder
)
SELECT
  CASE
    WHEN COUNT(*) = 5 THEN 'PASS'
    ELSE 'FAIL: Expected 5 tiers, found ' || COUNT(*)
  END AS enum_count_check,
  CASE
    WHEN bool_and(tier IN ('trial', 'free', 'basic', 'standard', 'premium'))
    THEN 'PASS'
    ELSE 'FAIL: Invalid tier values found'
  END AS enum_values_check
FROM tier_enum;

-- 2. Check organizations table
SELECT
  subscription_tier,
  COUNT(*) AS org_count
FROM organizations
GROUP BY subscription_tier
ORDER BY
  CASE subscription_tier
    WHEN 'trial' THEN 1
    WHEN 'free' THEN 2
    WHEN 'basic' THEN 3
    WHEN 'standard' THEN 4
    WHEN 'premium' THEN 5
  END;
-- Expected: All subscription_tier values in valid ENUM, no NULLs

-- 3. Check RLS policies still work
SET ROLE authenticated;
SET request.jwt.claims.organization_id TO 'test-org-uuid';
SELECT COUNT(*) FROM organizations WHERE id = 'test-org-uuid'::uuid;
-- Expected: 1 row (RLS allows user to see their own org)
RESET ROLE;
```

### Error Logs Table Validation

```sql
-- Script: validate-error-logs.sql
-- Purpose: Verify error_logs table structure and RLS policies

-- 1. Check table exists
SELECT
  CASE
    WHEN COUNT(*) = 1 THEN 'PASS: error_logs table exists'
    ELSE 'FAIL: error_logs table not found'
  END AS table_check
FROM information_schema.tables
WHERE table_name = 'error_logs' AND table_schema = 'public';

-- 2. Check required columns
WITH expected_columns AS (
  SELECT unnest(ARRAY[
    'id', 'created_at', 'user_id', 'organization_id',
    'error_message', 'stack_trace', 'severity',
    'file_name', 'file_size', 'file_format',
    'job_id', 'job_type', 'metadata'
  ]) AS column_name
),
actual_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'error_logs'
)
SELECT
  CASE
    WHEN COUNT(DISTINCT e.column_name) = 13 THEN 'PASS: All 13 columns present'
    ELSE 'FAIL: Missing columns - ' || string_agg(e.column_name, ', ')
  END AS columns_check
FROM expected_columns e
LEFT JOIN actual_columns a USING (column_name)
WHERE a.column_name IS NULL;

-- 3. Check indexes
SELECT
  CASE
    WHEN COUNT(*) >= 4 THEN 'PASS: At least 4 indexes created'
    ELSE 'FAIL: Expected at least 4 indexes, found ' || COUNT(*)
  END AS indexes_check
FROM pg_indexes
WHERE tablename = 'error_logs';

-- 4. Check RLS enabled
SELECT
  CASE
    WHEN relrowsecurity THEN 'PASS: RLS enabled'
    ELSE 'FAIL: RLS not enabled'
  END AS rls_check
FROM pg_class
WHERE relname = 'error_logs';

-- 5. Check RLS policies exist
SELECT
  CASE
    WHEN COUNT(*) >= 2 THEN 'PASS: At least 2 RLS policies exist'
    ELSE 'FAIL: Expected at least 2 policies, found ' || COUNT(*)
  END AS policies_check
FROM pg_policies
WHERE tablename = 'error_logs';
```

## TypeScript Type Definitions

**Location**: `packages/course-gen-platform/src/orchestrator/types/`

### Tier Types Update

```typescript
// File: tier.ts
// Updated to include TRIAL tier

export const SUBSCRIPTION_TIERS = [
  'trial',
  'free',
  'basic',
  'standard',
  'premium'
] as const

export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[number]

export const TIER_CONFIG: Record<
  SubscriptionTier,
  {
    maxStorageGB: number
    maxConcurrentUploads: number
    allowedFormats: string[]
    features: {
      fileUpload: boolean
      exportCourse: boolean
      imageOCR: boolean
      prioritySupport: boolean
    }
  }
> = {
  trial: {
    maxStorageGB: 1,
    maxConcurrentUploads: 5,
    allowedFormats: ['pdf', 'docx', 'pptx', 'txt', 'md'],
    features: {
      fileUpload: true,
      exportCourse: false,  // TRIAL cannot export
      imageOCR: false,
      prioritySupport: false
    }
  },
  free: {
    maxStorageGB: 0,
    maxConcurrentUploads: 1,  // Theoretical, but no files allowed
    allowedFormats: [],        // No file uploads
    features: {
      fileUpload: false,
      exportCourse: false,
      imageOCR: false,
      prioritySupport: false
    }
  },
  basic: {
    maxStorageGB: 0.5,
    maxConcurrentUploads: 2,
    allowedFormats: ['txt', 'md'],  // BASIC restriction
    features: {
      fileUpload: true,
      exportCourse: true,
      imageOCR: false,
      prioritySupport: false
    }
  },
  standard: {
    maxStorageGB: 1,
    maxConcurrentUploads: 5,
    allowedFormats: ['pdf', 'docx', 'pptx', 'txt', 'md'],
    features: {
      fileUpload: true,
      exportCourse: true,
      imageOCR: false,
      prioritySupport: false
    }
  },
  premium: {
    maxStorageGB: 10,
    maxConcurrentUploads: 10,
    allowedFormats: ['pdf', 'docx', 'pptx', 'txt', 'md'],  // Same as standard
    features: {
      fileUpload: true,
      exportCourse: true,
      imageOCR: true,         // PREMIUM exclusive
      prioritySupport: true
    }
  }
}
```

### Error Logs Types

```typescript
// File: error-logs.ts
// New types for error_logs table

export type ErrorSeverity = 'WARNING' | 'ERROR' | 'CRITICAL'

export type ErrorLog = {
  id: string  // UUID
  created_at: string  // ISO 8601 timestamp
  user_id: string | null
  organization_id: string
  error_message: string
  stack_trace: string | null
  severity: ErrorSeverity
  file_name: string | null
  file_size: number | null  // bytes
  file_format: string | null
  job_id: string | null
  job_type: string | null
  metadata: Record<string, unknown>  // JSONB
}

export type CreateErrorLogParams = {
  organization_id: string
  user_id?: string | null
  error_message: string
  stack_trace?: string | null
  severity: ErrorSeverity
  file_name?: string | null
  file_size?: number | null
  file_format?: string | null
  job_id?: string | null
  job_type?: string | null
  metadata?: Record<string, unknown>
}

// Helper function for worker handlers
export async function logPermanentFailure(
  params: CreateErrorLogParams
): Promise<void> {
  const { data, error } = await supabaseServiceRole
    .from('error_logs')
    .insert(params)

  if (error) {
    // Fallback to Pino if error_logs insert fails
    logger.error({
      msg: 'Failed to insert error_logs record',
      original_error: params.error_message,
      insert_error: error.message
    })
  }
}
```

## Summary

**Entities Changed**: 2
1. `subscription_tier` ENUM (add TRIAL value)
2. `error_logs` table (new table creation)

**Migrations Required**: 2-3
1. Add TRIAL tier to ENUM
2. Create error_logs table
3. (Optional) Rename basic_plus → basic if needed

**Validation Scripts**: 2
1. `validate-tier-structure.sql`
2. `validate-error-logs.sql`

**Type Definitions**: 2
1. `tier.ts` (update TIER_CONFIG with TRIAL)
2. `error-logs.ts` (new file for error_logs types)

**Next Step**: Create `quickstart.md` with instructions for local testing
