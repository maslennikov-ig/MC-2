# Deploy-Aware Error Reopen Mechanism

## Context

When containers restart during deployment, transient errors (Redis disconnect, queue errors, health check failures) trigger the `trg_reset_resolved_on_new_error` trigger on `error_logs`. This reopens ALL historical resolved errors with matching fingerprints — flooding the admin panel with 177K+ false positives.

**Root cause**: The reopen trigger has no concept of "deployment is happening". It treats every new error equally, whether it's a genuine recurrence or a 2-second Redis blip during container restart.

**User requirement**: "If an error reappeared, it should still be checked — we can't just ignore it. But we need to distinguish deploy transients from real recurrences."

## Approach

1. **Track deploy events** in a new `deploy_events` table (start/end/grace timestamps)
2. **Modify the reopen trigger**: during deploy grace period, set `to_verify` instead of `new`
3. **Post-deploy verification**: pg_cron function every 5 min checks expired grace periods — auto-resolves transients, reopens genuine recurrences
4. **CI/CD records events** via Supabase REST API (curl calls in GitHub Actions)

## Implementation

### 1. Migration: `20260310200000_deploy_aware_error_reopen.sql`

**File**: `packages/course-gen-platform/supabase/migrations/20260310200000_deploy_aware_error_reopen.sql`

Creates:

- **`deploy_events` table**: id, environment, status (started/completed/failed/rolled_back), git_sha, git_branch, actor, started_at, completed_at, grace_period_minutes (default 10), grace_ends_at
- **`is_in_deploy_grace_period()`**: Returns boolean — true if any deploy is in progress or within grace window
- **Modified `reset_resolved_status_on_new_error()`**: During grace → set `to_verify` with `[deploy-grace]` note prefix. Outside grace → set `new` (current behavior preserved)
- **`verify_deploy_grace_errors()`**: Scheduled every 5 min via pg_cron. After grace expires: errors that stopped → auto-resolve; errors that continued → reopen to `new`
- **`record_deploy_event()`**: RPC for CI/CD to call
- **Stale deploy cleanup**: If deploy stays `started` > 30 min (CI crash), auto-mark as `failed`

Key trigger logic:

```sql
IF is_in_deploy_grace_period() THEN
  -- Soft: to_verify with [deploy-grace] note
  UPDATE log_issue_status SET status = 'to_verify', notes = '[deploy-grace: ...]'
  WHERE fingerprint = NEW.fingerprint AND status = 'resolved';
ELSE
  -- Hard: immediate reopen (current behavior)
  UPDATE log_issue_status SET status = 'new', notes = '[Auto-reopened: ...]'
  WHERE fingerprint = NEW.fingerprint AND status = 'resolved';
END IF;
```

### 2. CI/CD: `.github/workflows/ci-cd.yml`

**Production deploy job** (line ~600):

- **Before** SSH deploy (after "Copy deployment files"): `curl` to `record_deploy_event('production', 'started', sha, branch, actor)`
- **After** "Verify deployment" success: `curl` to `record_deploy_event(status='completed', deploy_id=...)`
- **On failure**: `curl` to `record_deploy_event(status='failed', deploy_id=...)`

**Dev deploy job** (line ~818): Same pattern with `'development'` environment.

**Rollback job** (line ~733): Find latest deploy, mark `rolled_back`.

Uses existing secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (already in CI/CD).

### 3. No TypeScript changes

`to_verify` status already exists in UI and backend. The `[deploy-grace]` note prefix distinguishes deploy-related entries from manual ones.

### 4. No deploy script changes

`scripts/deploy_blue_green.sh` runs on server without Supabase credentials. All DB interaction via CI/CD layer.

## Safety

| Risk                                 | Mitigation                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| CI/CD crashes between start/complete | Stale cleanup: auto-fail after 30 min                                                              |
| Supabase API down during deploy      | Fail-open: deploy proceeds, errors get immediate reopen (existing behavior)                        |
| pg_cron misses a run                 | `to_verify` with `[deploy-grace]` caught by existing `resolve_inactive_to_verify()` at 14-day mark |
| Overlapping prod + dev deploys       | `is_in_deploy_grace_period()` checks ANY active deploy — conservative but safe                     |

## Flow Diagram

```
Normal operation (no deploy):
  New error → trigger → fingerprint resolved? → YES → reopen to 'new' ✓

During deploy (grace active):
  New error → trigger → fingerprint resolved? → YES → set 'to_verify' [deploy-grace]

After grace expires (pg_cron every 5 min):
  to_verify [deploy-grace] + NO new errors → auto-resolve (transient confirmed)
  to_verify [deploy-grace] + errors continue → reopen to 'new' (genuine recurrence)
```

## Files to modify

| File                                                                                            | Change                                               |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `packages/course-gen-platform/supabase/migrations/20260310200000_deploy_aware_error_reopen.sql` | **NEW** — table, functions, trigger, cron            |
| `.github/workflows/ci-cd.yml`                                                                   | Add deploy event recording steps (~6 steps total)    |
| `.claude/docs/deployment-guide.md`                                                              | Document deploy_events table in architecture section |

## Verification

```sql
-- 1. After migration: verify table and functions exist
SELECT * FROM deploy_events;
SELECT is_in_deploy_grace_period();
SELECT verify_deploy_grace_errors();

-- 2. After deploy: verify event was recorded
SELECT * FROM deploy_events ORDER BY created_at DESC LIMIT 1;

-- 3. During grace: verify errors get to_verify not new
SELECT * FROM log_issue_status WHERE notes LIKE '[deploy-grace:%' LIMIT 5;

-- 4. After grace: verify auto-resolution
SELECT * FROM log_issue_status WHERE notes LIKE 'Deploy-transient:%' LIMIT 5;

-- 5. pg_cron job active
SELECT * FROM cron.job WHERE jobname = 'verify-deploy-grace-errors';
```
