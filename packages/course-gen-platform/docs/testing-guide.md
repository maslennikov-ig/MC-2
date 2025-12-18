# Testing Guide

## Overview

The MegaCampusAI project has comprehensive test coverage across multiple test types:

- **26 Vitest test files** (TypeScript unit & integration tests)
- **24 pgTAP tests** (SQL RLS policy tests)
- **Total: 95+ test cases** covering authentication, file uploads, course management, vector search, and security policies

---

## Test Types

### 1. Unit Tests

Location: `tests/unit/`

**Purpose**: Test individual components in isolation

**Files**:
- `auth-middleware.test.ts` - JWT authentication logic
- `authorize-middleware.test.ts` - Role-based authorization
- `trpc-context.test.ts` - tRPC context creation

**Run**: `pnpm test tests/unit`

---

### 2. Integration Tests

Location: `tests/integration/`

**Purpose**: Test complete workflows and API endpoints

**Key Files**:
- `authentication.test.ts` - Full auth flow (signup, login, JWT)
- `file-upload.test.ts` - Tier-based file upload permissions (8 tests)
- `course-structure.test.ts` - Course CRUD operations (22 tests)
- `database-schema.test.ts` - Database integrity and constraints
- `qdrant.test.ts` - Vector database operations
- `jina-embeddings.test.ts` - Text embedding generation
- `bullmq.test.ts` - Job queue operations
- `job-cancellation.test.ts` - Worker cancellation logic
- `trpc-server.test.ts` - tRPC API endpoints
- `cross-package-imports.test.ts` - TypeScript type safety (41 tests)

**Run**: `pnpm test tests/integration`

---

### 3. Component Tests

Location: `src/shared/**/__tests__/`

**Purpose**: Test shared utility modules

**Files**:
- `embeddings/__tests__/markdown-converter.test.ts` - Markdown parsing
- `embeddings/__tests__/structure-extractor.test.ts` - Document structure
- `qdrant/__tests__/lifecycle.test.ts` - Collection management
- `validation/__tests__/quota-enforcer.test.ts` - Storage quotas

**Run**: `pnpm test src/shared`

---

### 4. pgTAP Tests (RLS Policies)

Location: `supabase/tests/database/`

**Purpose**: Test Row-Level Security policies for multi-tenant isolation

**File**: `001-rls-policies.test.sql` (24 test scenarios)

**Test Scenarios**:
- **Scenario 1-3**: Admin access (3 tests)
- **Scenario 2-3**: Instructor read access (2 tests)
- **Scenario 3**: Instructor write access (4 tests)
- **Scenario 4**: Student read access (3 tests)
- **Scenario 5**: Student cannot create courses (2 tests)
- **Scenario 6**: Student cannot modify courses (2 tests)
- **Scenario 7**: Organization data isolation (4 tests)
- **Scenario 8**: Cross-organization enforcement (4 tests)

**Run**: `pnpm test:rls`

**Requirements**:
- Supabase CLI installed
- Local Supabase instance running (`supabase start`)

---

## Running Tests

### Locally

```bash
# All Vitest tests (unit + integration + component)
pnpm test

# Watch mode (re-run on file changes)
pnpm test:watch

# Specific test file
pnpm test tests/integration/file-upload.test.ts

# pgTAP/RLS tests
pnpm test:rls

# All tests (Vitest + pgTAP)
pnpm test:all
```

### In CI/CD (GitHub Actions)

**Workflow**: `.github/workflows/test.yml`

**Steps**:
1. Install dependencies
2. Run ESLint (max 300 warnings allowed)
3. Run TypeScript type-check
4. Run Vitest tests (with Redis service)
5. Setup Supabase CLI
6. Start local Supabase instance
7. Run pgTAP/RLS tests
8. Stop Supabase

**Triggers**:
- Push to any branch
- Pull request to any branch

**Environment Variables** (from GitHub Secrets):
- `SUPABASE_URL` - Production Supabase project URL
- `SUPABASE_SERVICE_KEY` - Service role key (admin access)
- `SUPABASE_ANON_KEY` - Anonymous key (public access)
- `QDRANT_URL` - Vector database URL
- `QDRANT_API_KEY` - Qdrant authentication
- `JINA_API_KEY` - Jina AI embeddings API key

---

## Test Configuration

### Vitest (`vitest.config.ts`)

```typescript
{
  testTimeout: 120000,     // 2 minutes per test
  hookTimeout: 60000,      // 1 minute for setup/teardown
  fileParallelism: false,  // Run files sequentially (Supabase RLS)
  environment: 'node'
}
```

### pgTAP (`supabase/config.toml`)

```toml
[db]
major_version = 17
port = 54322

[db.migrations]
enabled = true
```

---

## Key Test Patterns

### 1. Tier-Based File Upload Tests

**Location**: `tests/integration/file-upload.test.ts:981`

**Pattern**: Test different subscription tiers with different file type permissions

```typescript
// Basic Plus: Only TXT, MD allowed
await caller.generation.uploadFile({
  organizationId,
  file: Buffer.from('test'),
  filename: 'test.txt',
  mimeType: 'text/plain'
});

// Standard: PDF, DOCX, PPTX allowed
await caller.generation.uploadFile({
  organizationId,
  file: pdfBuffer,
  filename: 'test.pdf',
  mimeType: 'application/pdf'
});
```

**Tier Permissions** (from `shared-types/src/zod-schemas.ts`):
- **FREE**: No uploads
- **BASIC_PLUS**: TXT, MD
- **STANDARD**: PDF, DOCX, PPTX, HTML + TXT, MD
- **PREMIUM**: All formats including images

### 2. RLS Policy Tests

**Location**: `supabase/tests/database/001-rls-policies.test.sql:120`

**Pattern**: Set JWT claims → Query → Assert results

```sql
-- Set user context
SELECT tests.set_jwt_claims(
  'user-uuid'::uuid,
  'admin',
  'org-uuid'::uuid
);

-- Query with RLS enforced
SELECT results_eq(
  $$ SELECT COUNT(*)::int FROM courses $$,
  ARRAY[3],
  'Admin sees all 3 courses in their organization'
);
```

### 3. Cross-Package Type Safety Tests

**Location**: `tests/integration/cross-package-imports.test.ts`

**Pattern**: Verify TypeScript types are properly exported

```typescript
import { SubscriptionTier } from '@megacampus/shared-types';

describe('Tier Permissions', () => {
  it('should have correct MIME types for basic_plus tier', () => {
    const allowed = MIME_TYPE_TIER_MAP.basic_plus;
    expect(allowed).toContain('text/plain');
    expect(allowed).toContain('text/markdown');
  });
});
```

---

## Debugging Test Failures

### 1. Check Test Logs in CI

```bash
gh run view --repo maslennikov-ig/MegaCampusAI <run-id> --log
```

### 2. Run Tests Locally with Verbose Output

```bash
pnpm test --reporter=verbose
```

### 3. Debug Single Test

```bash
pnpm test tests/integration/file-upload.test.ts --reporter=verbose
```

### 4. Check Supabase Logs (for pgTAP failures)

```bash
supabase status
supabase logs db
```

---

## Common Issues

### Issue 1: Vitest Tests Fail with "Missing environment variables"

**Solution**: Copy `.env.example` to `.env` and populate with real credentials

```bash
cp .env.example .env
# Edit .env with your Supabase/Qdrant/Jina credentials
```

### Issue 2: pgTAP Tests Fail with "relation does not exist"

**Solution**: Reset local Supabase database

```bash
supabase stop
supabase db reset
supabase start
```

### Issue 3: CI Fails but Local Tests Pass

**Solution**: Ensure all changes are committed (especially `.eslintrc.json` and `package.json`)

```bash
git status
git add .
git commit -m "fix: commit missing test files"
git push
```

---

## Test Coverage Goals

| Category | Current | Target |
|----------|---------|--------|
| Unit Tests | 3 files | 10 files |
| Integration Tests | 19 files | 25 files |
| Component Tests | 4 files | 8 files |
| pgTAP/RLS Tests | 24 scenarios | 30 scenarios |
| **Total Coverage** | **~85%** | **90%** |

---

## Next Steps

1. Add tests for:
   - RAG workflow (document chunking, vector search)
   - Course generation workflow (async jobs)
   - Quota enforcement (storage limits)
   - Error handling (graceful degradation)

2. Implement E2E tests with Playwright
3. Add performance benchmarks (load testing)
4. Set up code coverage reporting (Codecov)

---

**Last Updated**: 2025-10-16
**CI Status**: ✅ All tests passing (95+ test cases)
