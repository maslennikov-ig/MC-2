# Research Findings: Stage 2 Implementation Verification

**Date**: 2025-10-24
**Feature**: Stage 2 Implementation Verification and Completion
**Branch**: `003-stage-2-implementation`

## Overview

This research phase focuses on identifying the best practices and patterns for verifying existing infrastructure implementation, creating comprehensive integration tests for BullMQ worker handlers, and safely migrating database schemas with tier-based validation.

## Research Areas

### 1. Database Tier Schema Migration Strategy

**Decision**: Use Supabase MCP `apply_migration` with transactional DDL + validation queries

**Rationale**:
- Project has only test data (no production data to preserve)
- Transactional DDL automatically rolls back on error (built into PostgreSQL)
- Supabase MCP provides `apply_migration` tool for named migrations with automatic versioning
- Can validate changes immediately after migration using `execute_sql` queries

**Alternatives Considered**:
1. **Manual SQL via psql**: Rejected - no automatic versioning, harder to track migration history
2. **Supabase Studio UI**: Rejected - not automatable, no code review for migrations
3. **Raw SQL files**: Rejected - requires manual migration tracking, no MCP validation

**Implementation Approach**:
- Use `mcp__supabase__apply_migration(name, query)` for each change:
  - Migration 1: `add_trial_tier_to_enum` - Add TRIAL to subscription_tier ENUM
  - Migration 2: `update_basic_tier_formats` - Document BASIC tier format restrictions (code-level validation, not DB constraint)
  - Migration 3: `create_error_logs_table` - Create error_logs table with required fields
- Validate each migration immediately with `mcp__supabase__execute_sql` queries
- Test rollback scenario manually by triggering DDL error (verify automatic rollback works)

**Best Practices**:
- One logical change per migration (atomic commits)
- Use descriptive migration names in snake_case format
- Include validation queries in migration script comments
- Test migrations on development database first (already using MegaCampusAI project)

### 2. BullMQ Integration Testing Patterns

**Decision**: Use Vitest + Supabase MCP + actual BullMQ queue for end-to-end integration tests

**Rationale**:
- Vitest already configured in project (constitution standard)
- Supabase MCP allows direct database validation (file_catalog updates, error_logs entries)
- Testing against real BullMQ queue validates actual worker behavior (no mocking)
- Tier-based testing requires real auth context (JWT custom claims from Supabase Auth)

**Alternatives Considered**:
1. **Jest + mocked BullMQ**: Rejected - mocks hide integration bugs, not true end-to-end validation
2. **Playwright E2E tests**: Rejected - overkill for worker handler testing, slower than integration tests
3. **Manual testing only**: Rejected - not repeatable, no regression protection, violates constitution

**Implementation Approach**:
```typescript
// Test structure per tier:
describe('DOCUMENT_PROCESSING Worker - TRIAL Tier', () => {
  beforeAll(async () => {
    // Create test organization with tier='trial'
    // Create test user + JWT with organization_id claim
    // Set up test fixtures in fixtures/common/
  })

  it('should process PDF file successfully', async () => {
    // 1. Upload file via tRPC API (with auth context)
    // 2. Trigger DOCUMENT_PROCESSING job via BullMQ
    // 3. Wait for job completion (with timeout)
    // 4. Validate file_catalog.vector_status = 'indexed'
    // 5. Validate Qdrant vectors exist (query by document_id)
    // 6. Validate chunking metadata (parent/child structure)
  })

  it('should process DOCX file successfully', async () => { /* ... */ })
  it('should process TXT file successfully', async () => { /* ... */ })
})

// Repeat for FREE, BASIC, STANDARD, PREMIUM tiers
```

**Best Practices**:
- Reuse test fixtures from `fixtures/common/` (one set of files for all tiers)
- Vary only tier parameter in beforeAll setup (minimize duplication)
- Use real file uploads (not mocked file metadata) to validate storage integration
- Clean up test data in afterAll (delete test organization, files, vectors)
- Set reasonable timeouts (30s for PDF processing, per clarification)

### 3. Tier-Based Validation Patterns (Defense-in-Depth)

**Decision**: Dual validation (frontend disabled UI + backend 403 response) for FREE tier file upload

**Rationale**:
- FR-016 specifies defense-in-depth approach
- Frontend validation improves UX (immediate feedback, no wasted network request)
- Backend validation prevents bypass attacks (malicious API calls, direct curl requests)
- Industry best practice for security-critical features (never trust frontend)

**Alternatives Considered**:
1. **Frontend validation only**: Rejected - trivially bypassable, security risk
2. **Backend validation only**: Rejected - poor UX, wastes network bandwidth
3. **RLS policy enforcement only**: Rejected - RLS is data access control, not operation validation

**Implementation Approach**:
- **Frontend** (packages/course-gen-platform/src/app/...):
  ```tsx
  const { tier } = useOrganization()
  const isUploadDisabled = tier === 'free'

  <UploadButton
    disabled={isUploadDisabled}
    tooltip={isUploadDisabled ? "Недоступно на вашем тарифе" : undefined}
  />
  ```

- **Backend** (tRPC router or worker handler):
  ```typescript
  // In file upload endpoint
  const { tier } = await getUserOrganization(ctx.user.organizationId)
  if (tier === 'free') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'File uploads not available on FREE tier. Please upgrade to BASIC or higher.'
    })
  }
  ```

**Best Practices**:
- Consistent error messages between frontend tooltip and backend error
- Include upgrade path in error message (actionable for users)
- Log backend 403 errors to error_logs table (detect bypass attempts)
- Test both frontend (disabled state) and backend (403 response) in integration tests

### 4. Error Logging Strategy for Permanent Failures

**Decision**: Dedicated `error_logs` table in Supabase with standard context fields

**Rationale**:
- FR-017 specifies isolation from metrics (separate table, not system_metrics)
- Admin panel needs easy SQL access (Supabase Studio can query error_logs directly)
- Standard context fields enable effective troubleshooting without extra joins
- Easy rotation of old records (DELETE WHERE created_at < NOW() - INTERVAL '90 days')

**Alternatives Considered**:
1. **system_metrics table**: Rejected - mixes operational metrics with error context, harder to query
2. **Pino logs only**: Rejected - logs are ephemeral, not queryable from admin panel, no structured search
3. **External error tracking (Sentry)**: Rejected - adds dependency, costs money, overkill for current scale

**Schema Design**:
```sql
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('WARNING', 'ERROR', 'CRITICAL')),
  file_name TEXT,
  file_size BIGINT,
  file_format TEXT,
  job_id TEXT,
  job_type TEXT,
  metadata JSONB  -- Extensible for future fields
);

-- Indexes for admin panel queries
CREATE INDEX idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX idx_error_logs_org_id ON error_logs(organization_id);
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_severity ON error_logs(severity);
```

**Best Practices**:
- Use TIMESTAMPTZ (not TIMESTAMP) for timezone awareness
- ON DELETE CASCADE for organization_id (clean up errors when org deleted)
- ON DELETE SET NULL for user_id (preserve error history even if user deleted)
- JSONB metadata field for extensibility (future fields without schema migration)
- Partial indexes if needed (e.g., only CRITICAL severity for fast alerts)

### 5. BullMQ Stalled Job Detection Configuration

**Decision**: Use BullMQ built-in stalled job detection with production-tested parameters

**Rationale**:
- FR-019 specifies stalledInterval=30s, maxStalledCount=2, lockDuration=60s
- Production-tested configuration (from clarification Q6)
- Automatic recovery without custom orchestrator logic (YAGNI principle)
- Acceptable recovery delay (90s worst-case: 30s detection + 60s lock release)

**Alternatives Considered**:
1. **Custom heartbeat mechanism**: Rejected - reinvents BullMQ wheel, adds complexity
2. **External monitoring (cron job)**: Rejected - race conditions with BullMQ, duplicate recovery attempts
3. **No orphan recovery**: Rejected - violates Reliability First constitution principle

**Implementation Approach**:
```typescript
// In document-processing queue config
const documentProcessingQueue = new Queue('DOCUMENT_PROCESSING', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000  // 2s, 4s, 8s
    },
    removeOnComplete: 1000,  // Keep last 1000 completed jobs
    removeOnFail: 5000       // Keep last 5000 failed jobs for debugging
  }
})

const documentProcessingWorker = new Worker('DOCUMENT_PROCESSING', handler, {
  connection: redisConnection,
  stalledInterval: 30000,      // Check every 30 seconds
  maxStalledCount: 2,           // Max 2 stalls before permanent failure
  lockDuration: 60000,          // Worker holds lock for 60 seconds
  concurrency: 5                // Process 5 jobs concurrently
})
```

**Best Practices**:
- Test stalled job recovery in integration tests (simulate worker crash mid-processing)
- Log stalled job events to system_metrics table (track recovery frequency)
- Monitor maxStalledCount threshold (if jobs frequently stall, investigate root cause)
- Use removeOnComplete/removeOnFail to prevent Redis memory bloat

## Summary of Decisions

| Area | Decision | Key Benefit |
|------|----------|-------------|
| Database Migrations | Supabase MCP with transactional DDL | Automatic rollback, versioned history, MCP validation |
| Integration Testing | Vitest + real BullMQ + Supabase MCP | True end-to-end validation, no mocking gaps |
| Tier Validation | Defense-in-depth (frontend + backend) | Security + UX balance, industry best practice |
| Error Logging | Dedicated error_logs table | Admin panel access, easy rotation, isolated from metrics |
| Orphan Recovery | BullMQ built-in stalled detection | Production-tested, no custom complexity, 90s recovery |

## Next Steps

1. **Phase 2**: Create data-model.md documenting error_logs table schema and tier ENUM updates
2. **Phase 2**: Create contracts/ directory with integration test schemas (if needed)
3. **Phase 2**: Create quickstart.md with instructions for running integration tests locally
4. **Phase 2**: Update agent context (claude/.context.md) with new technology decisions

## References

- Supabase MCP Documentation: Available via `mcp__supabase__search_docs`
- BullMQ Stalled Jobs Guide: https://docs.bullmq.io/guide/workers/stalled-jobs
- Vitest Integration Testing: https://vitest.dev/guide/
- Constitution v1.1.0: `.specify/memory/constitution.md`
