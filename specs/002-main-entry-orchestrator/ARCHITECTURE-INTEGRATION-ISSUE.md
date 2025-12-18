# Architecture Integration Issue - T011-T019

**Status**: API endpoint created but **cannot execute without integration**
**Date**: 2025-10-21
**Blocker**: Phase 3 (API endpoint) requires architecture decision

## Problem

`fullstack-nextjs-specialist` created `/courseai-next/app/api/coursegen/generate/route.ts` (374 lines) implementing all T011-T019 requirements.

However, the endpoint **cannot function** because:

### 1. Package Isolation
- `courseai-next` (Next.js 15 App Router) is a **separate deployment** from `course-gen-platform` (Node.js API)
- `courseai-next/node_modules/@megacampus/` does **not exist** - packages not shared
- Cannot import:
  - `concurrencyTracker` from `course-gen-platform/src/shared/concurrency/tracker`
  - `addJob`, `getQueue` from `course-gen-platform` BullMQ
  - `logger` from `course-gen-platform` Pino

### 2. RPC Approach Used (But RPCs Don't Exist)
Subagent correctly identified the isolation and used PostgreSQL RPC calls:
- `check_and_reserve_concurrency(p_user_id, p_tier)`
- `create_bullmq_job(p_job_type, p_job_data, p_priority)`
- `update_course_progress(...)` ✅ **EXISTS** (created in T004)
- `remove_bullmq_job(p_job_id)`
- `release_concurrency_slot(p_user_id)`

**Only 1 of 5 RPCs exists!**

## Solutions (Choose One)

### Option 1: Create PostgreSQL RPC Functions ⚠️ Complex
Create 4 missing RPCs in PostgreSQL that call Redis/BullMQ:

**Challenges**:
- PostgreSQL cannot natively call Redis or BullMQ
- Would need **Supabase Edge Functions** (Deno runtime) as intermediary
- Edge Functions would:
  1. Accept RPC call from PostgreSQL trigger
  2. Connect to Redis (requires `REDIS_URL` in Edge Function secrets)
  3. Execute Lua script / BullMQ operation
  4. Return result to PostgreSQL
- **Latency**: PostgreSQL → Edge Function → Redis → Edge Function → PostgreSQL
- **Complexity**: 4 Edge Functions + triggers

**Files to create**:
```
supabase/functions/check-and-reserve-concurrency/index.ts
supabase/functions/create-bullmq-job/index.ts
supabase/functions/remove-bullmq-job/index.ts
supabase/functions/release-concurrency-slot/index.ts
```

### Option 2: Setup Shared Packages (Monorepo) ✅ **RECOMMENDED**

Configure pnpm workspace to share `course-gen-platform` modules with `courseai-next`:

**Step 1**: Update root `package.json`:
```json
{
  "name": "megacampus-monorepo",
  "workspaces": [
    "courseai-next",
    "packages/*"
  ]
}
```

**Step 2**: Update `packages/course-gen-platform/package.json`:
```json
{
  "name": "@megacampus/course-gen-platform",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    "./concurrency": "./dist/shared/concurrency/index.js",
    "./logger": "./dist/shared/logger/index.js",
    "./utils": "./dist/shared/utils/index.js"
  }
}
```

**Step 3**: Add to `courseai-next/package.json`:
```json
{
  "dependencies": {
    "@megacampus/course-gen-platform": "workspace:*"
  }
}
```

**Step 4**: Run `pnpm install` from repo root

**Step 5**: Update API endpoint imports:
```typescript
import { concurrencyTracker } from '@megacampus/course-gen-platform/concurrency';
import { logger } from '@megacampus/course-gen-platform/logger';
import { retryWithBackoff } from '@megacampus/course-gen-platform/utils';
```

**Benefits**:
- Direct imports (no RPC latency)
- Type safety across packages
- Shared code maintenance
- Standard monorepo pattern

**Caveats**:
- BullMQ/Redis dependencies bundled in Next.js (tree-shaking should remove unused)
- Requires build step for `course-gen-platform` before Next.js dev
- May need `next.config.js` adjustments for transpilation

### Option 3: HTTP API on course-gen-platform

Create HTTP endpoint on `course-gen-platform` (port 3001):

```typescript
// packages/course-gen-platform/src/api/generate.ts
app.post('/api/generate', async (req, res) => {
  const { courseId, userId, tier } = req.body;

  // Check concurrency
  const check = await concurrencyTracker.checkAndReserve(userId, tier);
  if (!check.allowed) {
    return res.status(429).json({ error: 'Too many jobs', details: check });
  }

  // Create job
  const job = await addJob(jobType, jobData, { priority });

  // Update progress
  await supabase.rpc('update_course_progress', {...});

  res.json({ success: true, jobId: job.id });
});
```

Then call from Next.js:
```typescript
// courseai-next/app/api/coursegen/generate/route.ts
const response = await fetch('http://localhost:3001/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId, userId, tier })
});
```

**Benefits**:
- Clear service boundary
- No package sharing needed
- Can scale independently

**Drawbacks**:
- Extra network hop
- Requires service discovery in production
- Duplicates auth logic (or needs shared session)

## Recommendation

**Use Option 2: Shared Packages (Monorepo)**

Reasoning:
1. Already using pnpm workspaces (see root `pnpm-workspace.yaml`)
2. Minimal changes needed
3. Best developer experience
4. No latency overhead
5. Type safety maintained

## Next Steps

1. **Immediate**: Decide on solution (recommend Option 2)
2. **If Option 2**: Configure workspace and rebuild
3. **If Option 1**: Create 4 Edge Functions
4. **If Option 3**: Create HTTP API on course-gen-platform
5. **Then**: Test API endpoint with real requests
6. **Finally**: Complete T020-T031 (worker updates, frontend, polish)

## Current Status

- ✅ T001-T010: Complete (setup, DB, utilities)
- ⚠️ T011-T019: Code written but **not functional** (integration needed)
- ⏳ T020-T031: Pending (can proceed independently)

## Files Affected

- `/courseai-next/app/api/coursegen/generate/route.ts` - Needs import path updates
- `/packages/course-gen-platform/package.json` - Add exports
- `/courseai-next/package.json` - Add workspace dependency
