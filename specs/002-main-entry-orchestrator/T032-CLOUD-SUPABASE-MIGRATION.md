# T032: Migrate from Local Docker Supabase to Cloud Supabase

**Priority**: 🔴 **CRITICAL BLOCKER**
**Status**: Pending
**Executor**: database-architect OR infrastructure-specialist
**Estimated Time**: 2-3 hours
**Blocks**: T011-T019 (API endpoint), T020-T031 (all remaining tasks)

---

## Problem Statement

Currently using **local Supabase via Docker** (`supabase_db_course-gen-platform` container), but:

1. **Stage 0 already configured cloud Supabase** - data exists there
2. **Production will use cloud** - local is temporary development artifact
3. **Migrations inconsistent** - local has T003-T005 applied, cloud may not
4. **CLI not configured** for cloud access - both main agent and subagents need this
5. **Docker containers unnecessary** - 9 containers running for local dev

---

## Goal

1. **Remove local Docker Supabase** completely
2. **Configure Supabase CLI** to connect to cloud project
3. **Apply all migrations** (including T003-T005) to cloud database
4. **Verify cloud access** works for main agent and subagents
5. **Update documentation** for future agents

---

## Cloud Supabase Project Info

**IMPORTANT**: Credentials should be available in environment variables or `.env` files from Stage 0 setup.

Expected environment variables:
- `SUPABASE_PROJECT_REF` - Project reference ID (e.g., `abc123xyz`)
- `SUPABASE_URL` - https://<project-ref>.supabase.co
- `SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (backend)
- `SUPABASE_ACCESS_TOKEN` - Personal access token (for CLI)

**Where to find**:
1. Check `.env` files in:
   - `/home/me/code/megacampus2/.env.local`
   - `/home/me/code/megacampus2/courseai-next/.env.local`
   - `/home/me/code/megacampus2/packages/course-gen-platform/.env`

2. If missing, generate from Supabase Dashboard:
   - Project Settings → API → Project URL and API Keys
   - Account → Access Tokens → Generate new token

---

## Implementation Steps

### Step 1: Link to Cloud Supabase

**Working directory**: `/home/me/code/megacampus2/packages/course-gen-platform/`

```bash
# Link to cloud project
pnpm exec supabase link --project-ref <PROJECT_REF>

# Verify link
pnpm exec supabase projects list
pnpm exec supabase status
```

**Expected output**:
```
Linked to project: <project-name> (abc123xyz)
Status: Database is reachable
API URL: https://abc123xyz.supabase.co
```

### Step 2: Pull Current Schema from Cloud

Before applying new migrations, see what's already in cloud:

```bash
# Pull current schema
pnpm exec supabase db pull

# Check diff
pnpm exec supabase db diff --schema public
```

This creates `supabase/migrations/<timestamp>_remote_schema.sql` showing cloud state.

### Step 3: Apply New Migrations (T003-T005)

Our 3 new migrations:
- `20251021_add_course_generation_columns.sql`
- `20251021_create_system_metrics.sql`
- `20251021_create_update_course_progress_rpc.sql`

```bash
# Push migrations to cloud
pnpm exec supabase db push

# OR apply individually
pnpm exec supabase migration up
```

**Handle conflicts**:
- If `generation_progress` column already exists → Skip that part
- If `system_metrics` table exists → Verify schema matches
- If `update_course_progress` function exists → Replace with our version

### Step 4: Verify Migrations Applied

```bash
# List applied migrations
pnpm exec supabase migration list

# Check specific tables
pnpm exec supabase db execute --sql "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('system_metrics', 'courses');"

# Check RPC function
pnpm exec supabase db execute --sql "SELECT proname FROM pg_proc WHERE proname = 'update_course_progress';"

# Verify courses table has generation_progress column
pnpm exec supabase db execute --sql "\d courses"
```

### Step 5: Stop and Remove Local Docker Supabase

```bash
# Stop local Supabase
cd /home/me/code/megacampus2/packages/course-gen-platform
pnpm exec supabase stop

# Remove containers
docker rm -f supabase_db_course-gen-platform
docker rm -f supabase_storage_course-gen-platform
docker rm -f supabase_rest_course-gen-platform
docker rm -f supabase_realtime_course-gen-platform
docker rm -f supabase_inbucket_course-gen-platform
docker rm -f supabase_auth_course-gen-platform
docker rm -f supabase_kong_course-gen-platform
docker rm -f supabase_vector_course-gen-platform
docker rm -f supabase_analytics_course-gen-platform

# Verify removed
docker ps -a | grep supabase
```

### Step 6: Update Environment Variables

**File**: `packages/course-gen-platform/.env`

```env
# Cloud Supabase (NOT localhost)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_ANON_KEY=<anon-key>

# Database connection (cloud)
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres

# Redis (keep as is)
REDIS_URL=redis://localhost:6379

# Other vars...
```

**File**: `courseai-next/.env.local`

```env
# Cloud Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

### Step 7: Update `.claude/SUPABASE-SUBAGENT-GUIDE.md`

Replace Docker-specific instructions with cloud CLI commands:

**OLD** (remove):
```bash
docker exec -i supabase_db_course-gen-platform psql ...
```

**NEW** (use):
```bash
pnpm exec supabase db execute --sql "..."
```

### Step 8: Test Cloud Connection

```bash
# Test query
pnpm exec supabase db execute --sql "SELECT COUNT(*) FROM courses;"

# Test RPC function
pnpm exec supabase db execute --sql "SELECT update_course_progress('00000000-0000-0000-0000-000000000000'::uuid, 1, 'completed', 'Test', NULL, NULL, '{}'::jsonb);"
```

---

## Verification Checklist

- [ ] `pnpm exec supabase projects list` shows linked cloud project
- [ ] `pnpm exec supabase status` shows cloud API URL (not localhost)
- [ ] `system_metrics` table exists in cloud database
- [ ] `update_course_progress` RPC function exists in cloud
- [ ] `courses.generation_progress` column exists (JSONB)
- [ ] Local Docker containers removed (`docker ps | grep supabase` empty)
- [ ] `.env` files updated with cloud URLs
- [ ] Test query returns data from cloud database
- [ ] `.claude/SUPABASE-SUBAGENT-GUIDE.md` updated

---

## Expected Output

Return summary:
1. Cloud project linked: `<project-ref>`
2. Migrations applied: `20251021_*` (3 files)
3. Tables verified: `system_metrics`, `courses` (with new columns)
4. RPC function verified: `update_course_progress`
5. Docker containers removed: 9 containers
6. Environment files updated: 2 files
7. Documentation updated: `SUPABASE-SUBAGENT-GUIDE.md`

---

## Rollback Plan

If something goes wrong:

1. **Keep local Docker** running temporarily
2. **Export cloud schema**: `pnpm exec supabase db dump --schema public > cloud_backup.sql`
3. **Test migrations locally** first before applying to cloud
4. **Use transactions** when possible: `BEGIN; ... ROLLBACK;` for testing

---

## Dependencies

**After T032 Complete**:
- T033 can proceed (HTTP API will use cloud database)
- T020-T031 can proceed (worker/frontend use cloud)
- T011-T019 integration can be tested

**Blocks if not done**:
- Cannot test API endpoint (T011-T019)
- Cannot deploy to production (no local in prod)
- Migrations inconsistent between dev and cloud
