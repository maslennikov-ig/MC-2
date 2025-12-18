# Quickstart: Stage 2 Verification Testing

**Date**: 2025-10-24
**Feature**: Stage 2 Implementation Verification and Completion
**Branch**: `003-stage-2-implementation`

## Prerequisites

Before running the verification tests, ensure you have:

1. **Development Environment Setup**
   - Node.js 20+ installed
   - pnpm installed (`npm install -g pnpm`)
   - WSL2 or Linux environment (for consistency with production)
   - Git repository cloned and on branch `003-stage-2-implementation`

2. **Supabase Configuration**
   - `.env.local` file with Supabase credentials:
     ```bash
     NEXT_PUBLIC_SUPABASE_URL=https://diqooqbuchsliypgwksu.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
     ```
   - Supabase project accessible (MegaCampusAI project, ref: diqooqbuchsliypgwksu)

3. **External Services**
   - **Redis** running locally or accessible remotely (for BullMQ)
     ```bash
     # Check Redis connection
     redis-cli ping
     # Expected: PONG
     ```
   - **Qdrant Cloud** instance accessible
     ```bash
     # .env.local should contain:
     QDRANT_URL=https://your-cluster.aws.cloud.qdrant.io
     QDRANT_API_KEY=your-qdrant-api-key
     ```
   - **Jina API** key for embeddings
     ```bash
     # .env.local should contain:
     JINA_API_KEY=your-jina-api-key
     ```

4. **MCP Server Configuration** (for database migrations)
   - Supabase MCP server enabled in `.mcp.json`:
     ```bash
     # Check current MCP config
     cat .mcp.json | grep supabase
     # Should show supabase server configuration
     ```
   - If not configured, run:
     ```bash
     ./switch-mcp.sh
     # Select option 2: SUPABASE
     # Restart Claude Code
     ```

## Installation

```bash
# 1. Navigate to monorepo package
cd packages/course-gen-platform

# 2. Install dependencies (if not already done)
pnpm install

# 3. Build project to ensure no type errors
pnpm build

# 4. Run type-check to verify TypeScript correctness
pnpm type-check
```

## Step 1: Database Schema Verification

### 1.1 Audit Current Tier Structure

**Using Supabase MCP** (via Claude Code with `.mcp.json` = SUPABASE config):

Ask Claude to run:
```sql
-- Check current subscription_tier ENUM values
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = 'subscription_tier'::regtype
ORDER BY enumsortorder;
```

**Expected Output**:
- If TRIAL missing: `free, basic, standard, premium` (4 values)
- If TRIAL present: `trial, free, basic, standard, premium` (5 values)
- Check for `basic_plus` instead of `basic` (naming inconsistency)

### 1.2 Apply Database Migrations

**Option A: Via Claude Code with Supabase MCP**

Ask Claude to:
1. Create migration to add TRIAL tier (if missing)
2. Create error_logs table migration
3. Apply migrations using `mcp__supabase__apply_migration`
4. Validate migrations using queries from `data-model.md`

**Option B: Manual via Supabase CLI** (if MCP unavailable)

```bash
# 1. Navigate to migrations directory
cd packages/course-gen-platform/supabase/migrations

# 2. Create migration files (if not already created by Claude)
# Files should be named: YYYYMMDDHHMMSS_migration_name.sql

# 3. Apply migrations locally
supabase db reset  # Reset local database (test data only)

# 4. Or apply to remote development database
supabase db push
```

### 1.3 Validate Migrations

Run validation scripts from `data-model.md`:

```bash
# Using Supabase MCP via Claude Code:
# Copy validation queries from data-model.md and ask Claude to run them

# OR using psql directly:
psql $DATABASE_URL -f specs/003-stage-2-implementation/data-model.md
# (Extract validation queries manually)
```

**Expected Results**:
- ✅ `trial` tier exists in ENUM
- ✅ `error_logs` table created with 13 columns
- ✅ At least 4 indexes on `error_logs`
- ✅ RLS enabled on `error_logs`
- ✅ At least 2 RLS policies on `error_logs`

## Step 2: Code Inspection (Verification Only)

### 2.1 Inspect Tier Validation Logic

**Files to review**:
```bash
# 1. Tier types and configuration
cat packages/course-gen-platform/src/orchestrator/types/tier.ts

# 2. Tier validation logic
cat packages/course-gen-platform/src/lib/tier-validator.ts

# 3. File format validation
cat packages/course-gen-platform/src/lib/file-validator.ts
```

**Verification Checklist**:
- [ ] `tier.ts` includes all 5 tiers (trial, free, basic, standard, premium)
- [ ] BASIC tier only allows TXT, MD formats (not PDF, DOCX, PPTX)
- [ ] FREE tier has `fileUpload: false` and empty `allowedFormats`
- [ ] Concurrent upload limits match spec (TRIAL=5, FREE=1, BASIC=2, STANDARD=5, PREMIUM=10)
- [ ] Storage quotas match spec (TRIAL=1GB, FREE=0, BASIC=0.5GB, STANDARD=1GB, PREMIUM=10GB)

### 2.2 Inspect Worker Handler

```bash
# View document processing worker handler
cat packages/course-gen-platform/src/orchestrator/handlers/document-processing.ts
```

**Verification Checklist**:
- [ ] Handler uses Docling for text extraction (PDF, DOCX, PPTX → Markdown)
- [ ] Hierarchical chunking implemented (parent: 1500 tokens, child: 400 tokens, overlap: 50)
- [ ] Jina-v3 embeddings used (768D, late_chunking=true)
- [ ] Qdrant upload integrated
- [ ] Progress tracking via RPC (`update_course_progress`)
- [ ] Error handling with retry logic (matches FR-018 retry policies)
- [ ] Permanent failures logged to `error_logs` table (matches FR-017)

### 2.3 Inspect BullMQ Configuration

```bash
# View queue configuration
cat packages/course-gen-platform/src/orchestrator/queues/document-processing.ts
```

**Verification Checklist**:
- [ ] Queue name: `DOCUMENT_PROCESSING`
- [ ] Stalled job detection enabled: `stalledInterval: 30000` (30s)
- [ ] Max stalled count: `maxStalledCount: 2`
- [ ] Lock duration: `lockDuration: 60000` (60s)
- [ ] Retry attempts: 3 (for Docling, per FR-018)
- [ ] Exponential backoff configured (2s, 4s, 8s delays for Docling)

## Step 3: Integration Test Preparation

### 3.1 Create Test Fixtures Directory

```bash
# Create fixtures directory structure
mkdir -p packages/course-gen-platform/tests/integration/fixtures/common

# Verify directory exists
ls -la packages/course-gen-platform/tests/integration/fixtures/common
```

### 3.2 Prepare Test Files

**Manual Option**: Create sample files using office tools
- `sample-course-material.pdf` (~2MB, multilingual content)
- `sample-course-material.docx` (~500KB, multilingual content)
- `sample-course-material.txt` (~50KB, plain text)
- `sample-course-material.md` (~50KB, Markdown with headings)

**Automated Option**: Use existing test files from Stage 0-1 (if available)
```bash
# Copy existing fixtures if they exist
cp packages/course-gen-platform/tests/fixtures/*.pdf packages/course-gen-platform/tests/integration/fixtures/common/
cp packages/course-gen-platform/tests/fixtures/*.docx packages/course-gen-platform/tests/integration/fixtures/common/
# etc.
```

**File Requirements** (from `contracts/integration-test-schema.md`):
- Size: < 5MB per file
- Content: Multilingual (English + Russian preferred)
- Structure: Hierarchical with headings and paragraphs
- Formats: PDF, DOCX, TXT, MD (minimum required)

### 3.3 Create Test Organizations

**Option A: Via Supabase MCP** (recommended)

Ask Claude to run:
```sql
-- Insert test organizations for all 5 tiers
INSERT INTO organizations (id, name, subscription_tier, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Test Org - TRIAL', 'trial', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000002', 'Test Org - FREE', 'free', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000003', 'Test Org - BASIC', 'basic', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000004', 'Test Org - STANDARD', 'standard', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000005', 'Test Org - PREMIUM', 'premium', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create test users for each org (using Supabase Auth)
-- (This may require using Supabase Auth API or manual Studio creation)
```

**Option B: Via Integration Test Setup** (automated)

Integration tests will create/delete test orgs automatically in `beforeAll` / `afterAll` hooks.

## Step 4: Run Integration Tests

### 4.1 Run Full Test Suite

```bash
# From monorepo root
cd packages/course-gen-platform

# Run all integration tests (once created)
pnpm test:integration

# Or run specific test file
pnpm vitest tests/integration/document-processing-worker.test.ts

# Run with coverage
pnpm test:integration --coverage
```

**Expected Test Count**: 20+ tests
- TRIAL tier: 3 positive tests (PDF, DOCX, TXT)
- FREE tier: 1 negative test (all formats blocked) or 3 negative tests (one per format)
- BASIC tier: 1 positive (TXT), 3 negative (PDF, DOCX, PPTX blocked)
- STANDARD tier: 3 positive tests (PDF, DOCX, TXT)
- PREMIUM tier: 3 positive tests (PDF, DOCX, TXT with image OCR if applicable)

### 4.2 Run Tier-Specific Tests

```bash
# Run only TRIAL tier tests
pnpm vitest tests/integration/document-processing-worker.test.ts -t "TRIAL"

# Run only negative tests (tier restrictions)
pnpm vitest tests/integration/document-processing-worker.test.ts -t "negative"

# Run with verbose output
pnpm vitest tests/integration/document-processing-worker.test.ts --reporter=verbose
```

### 4.3 Monitor Test Progress

**BullMQ Dashboard** (if available):
```bash
# Access BullMQ UI at http://localhost:3000/admin/queues
# Watch DOCUMENT_PROCESSING queue in real-time during tests
```

**Pino Logs**:
```bash
# Tail logs during test execution
tail -f packages/course-gen-platform/logs/application.log | pino-pretty
```

## Step 5: Validate Test Results

### 5.1 Check Test Pass Rate

**Expected Results**:
- ✅ 100% pass rate for all integration tests
- ✅ All positive tests complete within 60s timeout
- ✅ All negative tests fail with expected error codes (403 Forbidden for FREE/BASIC restrictions)
- ✅ No unexpected errors in Pino logs
- ✅ No stalled jobs in BullMQ (recovery successful if any stalls occur)

### 5.2 Verify Database State After Tests

```sql
-- Check file_catalog entries (should be cleaned up in afterAll)
SELECT COUNT(*) FROM file_catalog WHERE organization_id LIKE '00000000-0000-0000-0000-00000000000%';
-- Expected: 0 (test data cleaned up)

-- Check error_logs entries (should be cleaned up)
SELECT COUNT(*) FROM error_logs WHERE organization_id LIKE '00000000-0000-0000-0000-00000000000%';
-- Expected: 0 (test data cleaned up)

-- Check Qdrant vectors (query via Qdrant client)
-- Expected: 0 vectors with test file_ids (cleaned up in afterAll)
```

### 5.3 Verify Tier Validation Works

**Manual Test - Frontend Defense-in-Depth**:
1. Log in as FREE tier user
2. Navigate to file upload page
3. Verify upload button is **disabled** with tooltip "Недоступно на вашем тарифе"

**Manual Test - Backend Defense-in-Depth**:
```bash
# Attempt direct API call as FREE tier user
curl -X POST https://your-api.com/api/trpc/files.upload \
  -H "Authorization: Bearer $FREE_TIER_JWT" \
  -F "file=@test.pdf"

# Expected response:
# HTTP 403 Forbidden
# {"error": "File uploads not available on FREE tier. Please upgrade to BASIC or higher."}
```

## Step 6: Documentation Updates

### 6.1 Update Database Reference

```bash
# Edit SUPABASE-DATABASE-REFERENCE.md
vim docs/SUPABASE-DATABASE-REFERENCE.md

# Add sections:
# - subscription_tier ENUM (updated with TRIAL)
# - error_logs table schema
# - Tier-specific file format restrictions
```

### 6.2 Update Implementation Roadmap

```bash
# Edit IMPLEMENTATION_ROADMAP_EN.md
vim docs/IMPLEMENTATION_ROADMAP_EN.md

# Update Stage 2 status:
# - Change "99% COMPLETE" → "100% COMPLETE ✅"
# - Add verification evidence (integration test pass rate, migration status)
# - Update task completion percentages
```

### 6.3 Generate Verification Report

```bash
# Create final verification report (manual or via Claude Code)
# Location: docs/reports/verification/2025-10/2025-10-24-stage-2-verification.md

# Include:
# - Database migration results
# - Integration test results (pass rate, coverage)
# - Code inspection findings
# - Tier validation verification
# - Next steps (proceed to Stage 3)
```

## Troubleshooting

### Issue: Redis Connection Refused

```bash
# Check if Redis is running
redis-cli ping

# If not running, start Redis
# (Linux/WSL)
sudo service redis-server start

# (macOS with Homebrew)
brew services start redis

# (Docker)
docker run -d -p 6379:6379 redis:alpine
```

### Issue: Supabase MCP Not Available

```bash
# 1. Check current MCP configuration
cat .mcp.json | grep supabase

# 2. If missing, switch to SUPABASE config
./switch-mcp.sh
# Select option 2: SUPABASE (~2500 tokens)

# 3. Restart Claude Code for MCP to load

# 4. Verify MCP loaded by asking Claude to list available tools
# Should see: mcp__supabase__apply_migration, mcp__supabase__execute_sql, etc.
```

### Issue: Integration Tests Timeout

**Cause**: Document processing taking >60s (test timeout)

**Solution**:
1. Check file sizes (should be <5MB per fixture)
2. Verify external services accessible (Qdrant, Jina API, Docling)
3. Increase timeout in Vitest config:
   ```typescript
   // vitest.config.ts
   export default defineConfig({
     test: {
       timeout: 120_000  // Increase to 2 minutes
     }
   })
   ```
4. Check Pino logs for bottlenecks (Docling conversion, Qdrant upload)

### Issue: Tier Validation Not Enforcing BASIC Restrictions

**Cause**: Code may allow PDF for BASIC tier (incorrect)

**Solution**:
1. Check `TIER_CONFIG` in `src/orchestrator/types/tier.ts`:
   ```typescript
   basic: {
     allowedFormats: ['txt', 'md']  // Should NOT include 'pdf', 'docx', 'pptx'
   }
   ```
2. Check `file-validator.ts` logic uses `TIER_CONFIG.allowedFormats`
3. Re-run integration tests to verify fix

### Issue: error_logs Table Not Found

**Cause**: Migration not applied

**Solution**:
1. Re-run migration (Step 1.2)
2. Verify migration exists in `supabase/migrations/`
3. Check Supabase Studio for table existence
4. Run validation query: `SELECT * FROM error_logs LIMIT 1;`

## Success Criteria Checklist

Before marking Stage 2 as complete, verify:

- [ ] **SC-001**: All 4 infrastructure components validated (file upload, text extraction, vectorization, worker handler)
- [ ] **SC-002**: Database supports all 5 tiers (TRIAL, FREE, BASIC, STANDARD, PREMIUM)
- [ ] **SC-003**: BASIC tier rejects 100% of PDF/DOCX/PPTX uploads
- [ ] **SC-004**: Integration tests achieve 100% pass rate (20+ tests)
- [ ] **SC-005**: Database migrations execute successfully in <5 seconds
- [ ] **SC-006**: Documentation updated (SUPABASE-DATABASE-REFERENCE.md, IMPLEMENTATION_ROADMAP_EN.md)
- [ ] **SC-007**: Tier-based concurrent upload limits enforced with 100% accuracy
- [ ] **SC-008**: DOCUMENT_PROCESSING workflow completes end-to-end successfully
- [ ] **SC-009**: Zero security vulnerabilities (run security scanner if available)
- [ ] **SC-010**: FREE tier blocked on frontend (disabled UI) and backend (403)
- [ ] **SC-011**: Permanent failures logged to error_logs with complete context
- [ ] **SC-012**: Retry policies implemented (Qdrant: 5 attempts, Docling: 3 attempts)
- [ ] **SC-013**: BullMQ stalled job detection recovers within 90 seconds
- [ ] **SC-014**: error_logs table queryable from admin panel in <100ms

## Next Steps

After successful verification:

1. **Commit Changes**:
   ```bash
   git add .
   git commit -m "feat: Stage 2 verification complete - database migrations, integration tests, tier validation"
   git push origin 003-stage-2-implementation
   ```

2. **Create Pull Request**:
   ```bash
   # Use GitHub CLI
   gh pr create --title "Stage 2 Implementation Verification Complete" \
     --body "See docs/reports/verification/2025-10/2025-10-24-stage-2-verification.md"
   ```

3. **Proceed to Stage 3**:
   ```bash
   # Create new branch for Stage 3 (Create Summary workflow)
   git checkout main
   git pull origin main
   git checkout -b 004-stage-3-create-summary

   # Run spec workflow
   # /speckit.specify "Stage 3: Create Summary - Map-Reduce summarization workflow"
   ```

## References

- **Spec**: `specs/003-stage-2-implementation/spec.md`
- **Plan**: `specs/003-stage-2-implementation/plan.md`
- **Research**: `specs/003-stage-2-implementation/research.md`
- **Data Model**: `specs/003-stage-2-implementation/data-model.md`
- **Test Schemas**: `specs/003-stage-2-implementation/contracts/integration-test-schema.md`
- **Constitution**: `.specify/memory/constitution.md`
- **Roadmap**: `docs/IMPLEMENTATION_ROADMAP_EN.md`
- **Database Reference**: `docs/SUPABASE-DATABASE-REFERENCE.md`
