# Integration Test Schemas

**Date**: 2025-10-24
**Feature**: Stage 2 Implementation Verification
**Purpose**: Document expected test data structures and validation schemas for integration tests

## Overview

This document defines the schemas and data structures used in integration tests for the DOCUMENT_PROCESSING worker handler. Since this is a verification feature (not API creation), these are **test contracts** rather than API contracts.

## Test Fixture Schema

**Location**: `packages/course-gen-platform/tests/integration/fixtures/common/`

### Test File Requirements

All test files MUST meet these criteria:
- **Size**: < 5MB (for PDF processing 30s target)
- **Formats**: PDF, DOCX, TXT, MD (PPTX optional)
- **Content**: Multilingual (English + Russian) to test Jina-v3 multilingual embeddings
- **Structure**: Hierarchical (headings + paragraphs) to validate parent/child chunking

### Fixture File List

```typescript
export const TEST_FIXTURES = {
  pdf: {
    path: 'fixtures/common/sample-course-material.pdf',
    size: 2048000,  // ~2MB
    format: 'pdf',
    expectedChunks: 15,  // Approximate (depends on content)
    expectedParents: 5,  // Heading-based parent chunks
    expectedChildren: 15 // Paragraph-based child chunks
  },
  docx: {
    path: 'fixtures/common/sample-course-material.docx',
    size: 512000,  // ~500KB
    format: 'docx',
    expectedChunks: 10,
    expectedParents: 3,
    expectedChildren: 10
  },
  txt: {
    path: 'fixtures/common/sample-course-material.txt',
    size: 51200,  // ~50KB
    format: 'txt',
    expectedChunks: 5,
    expectedParents: 2,
    expectedChildren: 5
  },
  md: {
    path: 'fixtures/common/sample-course-material.md',
    size: 51200,  // ~50KB
    format: 'md',
    expectedChunks: 5,
    expectedParents: 2,
    expectedChildren: 5
  }
}
```

## Test Organization Schema

**Purpose**: Create test organizations with specific tier configurations

```typescript
export type TestOrganization = {
  id: string  // UUID
  name: string
  subscription_tier: SubscriptionTier
  created_at: string
  updated_at: string
  storage_used_bytes: number
  current_uploads: number  // Track concurrent uploads in tests
}

export const TEST_ORGANIZATIONS: Record<SubscriptionTier, TestOrganization> = {
  trial: {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Org - TRIAL',
    subscription_tier: 'trial',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    storage_used_bytes: 0,
    current_uploads: 0
  },
  free: {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Test Org - FREE',
    subscription_tier: 'free',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    storage_used_bytes: 0,
    current_uploads: 0
  },
  basic: {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Test Org - BASIC',
    subscription_tier: 'basic',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    storage_used_bytes: 0,
    current_uploads: 0
  },
  standard: {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Test Org - STANDARD',
    subscription_tier: 'standard',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    storage_used_bytes: 0,
    current_uploads: 0
  },
  premium: {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'Test Org - PREMIUM',
    subscription_tier: 'premium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    storage_used_bytes: 0,
    current_uploads: 0
  }
}
```

## Test User Schema

**Purpose**: Create test users with JWT custom claims for tier validation

```typescript
export type TestUser = {
  id: string  // UUID
  email: string
  organization_id: string
  role: 'admin' | 'instructor' | 'student'
  jwt_claims: {
    user_id: string
    role: string
    organization_id: string
  }
}

export function createTestUser(
  tier: SubscriptionTier,
  role: 'admin' | 'instructor' | 'student' = 'admin'
): TestUser {
  const orgId = TEST_ORGANIZATIONS[tier].id
  const userId = `test-user-${tier}-${role}-${Date.now()}`

  return {
    id: userId,
    email: `${tier}-${role}@test.megacampus.ai`,
    organization_id: orgId,
    role,
    jwt_claims: {
      user_id: userId,
      role,
      organization_id: orgId
    }
  }
}
```

## Integration Test Assertion Schema

**Purpose**: Define expected outcomes for each test scenario

### Positive Test Assertions (Success Cases)

```typescript
export type SuccessAssertion = {
  // File catalog validation
  fileCatalog: {
    vector_status: 'indexed'
    processing_status: 'completed'
    file_size: number  // Should match uploaded file
    mime_type: string  // Should match file format
  }

  // Qdrant validation
  qdrant: {
    vectorCount: number  // Should match expectedChunks from fixture
    dimensions: 768      // Jina-v3 embedding size
    parentChunks: number // Should match expectedParents
    childChunks: number  // Should match expectedChildren
  }

  // Chunking validation
  chunks: {
    hierarchyValid: boolean  // All children have parent references
    tokenCounts: {
      parent: { min: 1000, max: 1500 }  // Parent chunk size range
      child: { min: 300, max: 400 }     // Child chunk size range
      overlap: 50                        // Child overlap tokens
    }
  }

  // Progress tracking validation
  progress: {
    finalStatus: 'completed'
    progressPercentage: 100
    stepsCompleted: [
      'upload',
      'docling_conversion',
      'chunking',
      'embedding',
      'qdrant_upload',
      'finalize'
    ]
  }

  // No errors logged
  errorLogs: {
    count: 0  // No permanent failures
  }
}
```

### Negative Test Assertions (Failure Cases)

```typescript
export type FailureAssertion = {
  // Expected error type
  errorType: 'FORBIDDEN' | 'BAD_REQUEST' | 'INTERNAL_ERROR'

  // Expected error message pattern (regex)
  errorMessagePattern: RegExp

  // File catalog state (should NOT be 'indexed')
  fileCatalog: {
    vector_status: 'failed' | 'pending' | null
    processing_status: 'failed' | 'pending' | null
  }

  // Qdrant validation (should have NO vectors)
  qdrant: {
    vectorCount: 0  // No vectors uploaded
  }

  // Error logs (SHOULD have entry for permanent failures)
  errorLogs?: {
    count: 1  // Exactly one error logged
    severity: 'ERROR' | 'CRITICAL'
    messagePattern: RegExp
    hasStackTrace: boolean
    hasFileContext: boolean  // file_name, file_size, file_format populated
  }
}
```

## Test Scenario Coverage Matrix

**Purpose**: Ensure all tier × format combinations are tested

| Tier | PDF (Positive) | DOCX (Positive) | TXT (Positive) | Negative Test | Total Tests |
|------|----------------|-----------------|----------------|---------------|-------------|
| TRIAL | ✅ Success | ✅ Success | ✅ Success | ❌ N/A (all allowed) | 3 |
| FREE | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden | ✅ All blocked | 1 (or 3 if testing each format) |
| BASIC | ❌ 403 Forbidden | ❌ 403 Forbidden | ✅ Success | ✅ PDF blocked | 4 |
| STANDARD | ✅ Success | ✅ Success | ✅ Success | ❌ N/A (all allowed) | 3 |
| PREMIUM | ✅ Success | ✅ Success | ✅ Success | ❌ N/A (all allowed) | 3 |
| **TOTAL** | 3 pass, 2 fail | 3 pass, 2 fail | 5 pass | 5 fail scenarios | **20 tests** |

**Note**: Per clarification, we test 3 positive scenarios (PDF, DOCX, TXT) + 1 negative scenario per tier = minimum 20 tests.

## BullMQ Job Schema

**Purpose**: Define expected job structure for DOCUMENT_PROCESSING queue

```typescript
export type DocumentProcessingJobData = {
  file_id: string  // UUID from file_catalog
  organization_id: string
  user_id: string
  course_id: string
  file_metadata: {
    name: string
    size: number
    mime_type: string
    storage_path: string  // /uploads/{orgId}/{courseId}/{fileName}
  }
  processing_options: {
    enable_ocr: boolean  // PREMIUM tier only
    chunk_strategy: 'hierarchical'
    embedding_model: 'jina-v3'
  }
}

export type DocumentProcessingJobResult = {
  success: boolean
  file_id: string
  vector_ids: string[]  // Qdrant point IDs
  chunk_count: number
  processing_time_ms: number
  errors?: string[]  // If partial failure
}
```

## Validation Query Schemas

**Purpose**: SQL queries to validate test outcomes

### File Catalog Validation

```sql
-- Verify file_catalog entry after processing
SELECT
  id,
  vector_status,
  processing_status,
  file_size,
  mime_type,
  created_at,
  updated_at
FROM file_catalog
WHERE id = :file_id;

-- Expected for success:
-- vector_status = 'indexed'
-- processing_status = 'completed'
-- file_size matches uploaded file
```

### Qdrant Vector Validation

```typescript
// Vitest test code (using Qdrant client)
const qdrantResults = await qdrantClient.scroll({
  collection_name: 'course_documents',
  filter: {
    must: [
      { key: 'file_id', match: { value: fileId } }
    ]
  },
  limit: 100
})

expect(qdrantResults.points).toHaveLength(expectedChunks)
expect(qdrantResults.points[0].vector).toHaveLength(768)  // Jina-v3 dimensions
```

### Error Logs Validation

```sql
-- Verify error_logs entry for permanent failures
SELECT
  id,
  severity,
  error_message,
  stack_trace,
  file_name,
  file_size,
  file_format,
  job_id,
  job_type,
  created_at
FROM error_logs
WHERE organization_id = :org_id
  AND job_id = :job_id
ORDER BY created_at DESC
LIMIT 1;

-- Expected for permanent failure:
-- severity IN ('ERROR', 'CRITICAL')
-- error_message contains descriptive text
-- file_name, file_size, file_format populated
-- job_id matches BullMQ job ID
```

## Test Timeout Configuration

**Purpose**: Define reasonable timeouts for async operations

```typescript
export const TEST_TIMEOUTS = {
  // File upload timeout (network operation)
  fileUpload: 10_000,  // 10 seconds

  // Document processing timeout (full workflow)
  documentProcessing: 60_000,  // 60 seconds (2x aspirational 30s target)

  // Qdrant query timeout
  qdrantQuery: 5_000,  // 5 seconds

  // Database query timeout
  databaseQuery: 3_000,  // 3 seconds

  // BullMQ job completion polling interval
  jobPollingInterval: 1_000,  // Check every 1 second

  // Test suite overall timeout (Vitest config)
  testSuiteTimeout: 300_000  // 5 minutes for entire test file
}
```

## Cleanup Schema

**Purpose**: Define cleanup operations for test teardown

```typescript
export type TestCleanup = {
  // Delete test organization (CASCADE deletes users, files, etc.)
  deleteOrganization: (orgId: string) => Promise<void>

  // Delete Qdrant vectors for test files
  deleteQdrantVectors: (fileIds: string[]) => Promise<void>

  // Delete Supabase Storage files
  deleteStorageFiles: (paths: string[]) => Promise<void>

  // Clear BullMQ test jobs
  clearBullMQQueue: (queueName: string) => Promise<void>

  // Delete error_logs entries for test org
  deleteErrorLogs: (orgId: string) => Promise<void>
}

export async function cleanupTestData(
  tier: SubscriptionTier
): Promise<void> {
  const orgId = TEST_ORGANIZATIONS[tier].id

  // Order matters: delete from least dependent to most dependent
  await deleteErrorLogs(orgId)
  await deleteQdrantVectors([/* collect file IDs */])
  await deleteStorageFiles([/* collect storage paths */])
  await clearBullMQQueue('DOCUMENT_PROCESSING')
  await deleteOrganization(orgId)  // CASCADE deletes users, file_catalog, etc.
}
```

## Summary

**Test Schemas Defined**: 6
1. Test Fixture Schema (file requirements)
2. Test Organization Schema (tier-specific orgs)
3. Test User Schema (JWT claims)
4. Success Assertion Schema (positive tests)
5. Failure Assertion Schema (negative tests)
6. BullMQ Job Schema (worker input/output)

**Coverage**: 20+ integration tests across 5 tiers × 4 file formats

**Next Step**: Create `quickstart.md` with instructions for running integration tests locally
