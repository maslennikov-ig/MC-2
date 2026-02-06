# Plan: Process Error Logs — Fix Active Issues

## Summary

165,827 new errors total. After deduplication: **2 real bugs to fix + 1 auto-mute rule + bulk SQL cleanup**.

---

## Step 1: Bulk-resolve local + old auto-muted errors (SQL)

Resolve local (NULL env) errors and old server errors matching existing auto-mute patterns.

```sql
-- 1a. Bulk resolve local environment errors (~23,826)
WITH local_fingerprints AS (
  SELECT DISTINCT ON (el.fingerprint) el.id, el.fingerprint
  FROM error_logs el
  LEFT JOIN log_issue_status lis ON lis.fingerprint = el.fingerprint AND lis.log_type = 'error_log'
  WHERE (lis.id IS NULL OR lis.status = 'new')
    AND el.environment IS NULL
    AND el.fingerprint IS NOT NULL
  ORDER BY el.fingerprint, el.created_at DESC
)
INSERT INTO log_issue_status (log_type, log_id, status, notes, fingerprint, updated_at)
SELECT 'error_log', lf.id, 'resolved', 'Local environment: Testing/development errors', lf.fingerprint, NOW()
FROM local_fingerprints lf
ON CONFLICT (log_type, log_id) DO UPDATE SET status = 'resolved', notes = EXCLUDED.notes, updated_at = NOW();

-- 1b. Bulk resolve known auto-mute patterns that predate rule creation
-- Patterns: health probe, Job not found, ModelConfigBunker sync, generation trace, Patcher REJECTED
```

---

## Step 2: Fix EACCES on `/app/data/enrichments` (CRITICAL)

**Impact**: ~1,700 errors/3d. ALL Stage 7 enrichments broken on stage.

### 2a. SSH: Fix permissions immediately

```bash
ssh megacampus-prod "sudo chown -R 1001:1001 /opt/megacampus/data/enrichments && sudo chmod -R 755 /opt/megacampus/data/enrichments"
```

SSH config is in `.claude/local.md`.

### 2b. Code: Improve Dockerfile

**File**: `packages/course-gen-platform/Dockerfile` (line 111)

```dockerfile
# BEFORE:
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

# AFTER:
RUN mkdir -p /app/data /app/data/enrichments && chown -R nodejs:nodejs /app/data
```

### 2c. Code: Better error message in worker-entrypoint.ts

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/worker-entrypoint.ts` (line 121-132)

- When directory is not writable, add a CRITICAL log with fix instructions:
  `"Run: sudo chown -R 1001:1001 /opt/megacampus/data/enrichments on host"`

### 2d. SQL: Bulk-resolve all EACCES fingerprints

Fingerprints to resolve (all same root cause):

- `168c6ff762f87018929175a5b7e4e1e4` — "Enrichments directory is not writable"
- `bd94a63c6f72ddc78686f67fc8755f4a` — "Failed to upload local course card"
- `5c86a74bc2e03d6f383c060c4afe169d` — "Stage 7 job failed" (EACCES)
- `e9bdbe59853eaf0e95369435beea55a7` — "Card handler: generation failed" (EACCES)
- `ef6cc7a3569bf9d68279ee52e1580cad` — "Card handler: generation failed" (other fingerprint)
- `4065b2e244e4a9f207df61bc11fc1917` — "Error uploading enrichment asset"
- `0977e7fc6deb62694c1c95c34a1578c5` — "Failed to upload enrichment asset"

Notes: `EACCES permission denied on /app/data/enrichments. Fixed host dir permissions.`

---

## Step 3: Fix Jina API Rate Limiting (HIGH)

**Impact**: ~1,163 errors/3d. Embedding and reranking requests failing with 429.
**Root cause**: 3 separate RateLimiter instances (each allows 100 RPM = 300 RPM total, actual limit = 100 RPM).
**Actual Jina plan limit**: 100 RPM, concurrency 2.

### Fix:

1. **Create shared `jinaRateLimiter` singleton** in `jina-client.ts`
   - Change interval from 40ms (1500 RPM) to 600ms (100 RPM)
   - Export alongside `jinaConcurrencyLimiter`

2. **Import in other modules**:
   - `packages/course-gen-platform/src/shared/embeddings/generate.ts` — replace local RateLimiter
   - `packages/course-gen-platform/src/shared/jina/reranker-client.ts` — replace local RateLimiter

3. **SQL: Bulk-resolve Jina 429 errors**
   - Fingerprint `77f32c8b6cc17bcf6d7bd2326da71377`
   - Notes: `Jina 429 rate limit. Fixed: shared rate limiter at 100 RPM.`

### Delegate to: `fullstack-nextjs-specialist`

---

## Step 4: Add auto-mute rule for JSON repair

**File**: `packages/course-gen-platform/src/shared/logger/auto-classification.ts`

Add rule:

```typescript
{
  pattern: /JSON repair failed after all strategies/i,
  reason: 'graceful_fallback',
  description: 'JSON repair exhausted all strategies - LLM output too malformed, will retry with different model',
}
```

**SQL**: Bulk-resolve fingerprint `2c2c3eec0188cee88b17cfd4cfc8d80c`
Notes: `JSON repair exhausted. Added auto-mute rule. Graceful fallback behavior.`

### Also update: `.claude/skills/process-logs/SKILL.md` — add to auto-mute table

---

## Step 5: Bulk-resolve remaining known patterns

Existing auto-mute rules that didn't catch old errors (logged before rules existed):

| Fingerprint                        | Error                               | Notes                                   |
| ---------------------------------- | ----------------------------------- | --------------------------------------- |
| `231621f040fb7822d52666b417e002a8` | tRPC health probe                   | Monitoring probe, auto-mute rule exists |
| `3105f7ed806a9b3c775098566a9a9919` | Job NNN not found                   | Frontend polls, auto-mute rule exists   |
| `1daccd129e171b56faceab3a1f477e6b` | Job NNN not found                   | Same pattern, different fingerprint     |
| `6b8692cbd94a526ff25c89c9ae68d0a3` | tRPC error (various)                | Need to check details                   |
| `b348ce0913e97c84bd6de1fe37ec7702` | ModelConfigBunker DB sync           | Auto-mute rule exists                   |
| `a6ff4e93fa0084f164e5c99e96ec97aa` | Failed to log generation trace      | Auto-mute rule exists                   |
| `0b6019a713d3248f9aa5a82ed880f45e` | ModelConfigBunker Config validation | Check if covered                        |
| `185da3b7cd242545426cff1efe301be8` | Redis SET error                     | Check if covered                        |
| `feed647764bd77fbcd3cbbba89056796` | Patcher REJECTED template markers   | Auto-mute rule exists                   |

---

## Step 6: Verify + Deploy

1. `pnpm type-check` — must pass
2. `pnpm --filter @megacampus/course-gen-platform build` — must pass
3. Re-check error counts: `SELECT COUNT(*) FROM error_logs el LEFT JOIN log_issue_status lis ON el.id = lis.log_id AND lis.log_type = 'error_log' WHERE lis.id IS NULL AND el.environment IS NOT NULL`
4. Deploy workers: `ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.production.yml pull worker-stage7 && docker compose -f docker-compose.production.yml up -d worker-stage7"`

---

## Files to Modify

| File                                                                              | Change                                               |
| --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `packages/course-gen-platform/Dockerfile`                                         | Create `/app/data/enrichments` with nodejs ownership |
| `packages/course-gen-platform/src/stages/stage7-enrichments/worker-entrypoint.ts` | Better EACCES error message with fix instructions    |
| `packages/course-gen-platform/src/shared/embeddings/jina-client.ts`               | Export shared `jinaRateLimiter` (600ms = 100 RPM)    |
| `packages/course-gen-platform/src/shared/embeddings/generate.ts`                  | Import shared `jinaRateLimiter`                      |
| `packages/course-gen-platform/src/shared/jina/reranker-client.ts`                 | Import shared `jinaRateLimiter`                      |
| `packages/course-gen-platform/src/shared/logger/auto-classification.ts`           | Add JSON repair auto-mute rule                       |
| `.claude/skills/process-logs/SKILL.md`                                            | Update auto-mute table                               |

## Beads Tasks to Create

1. `bd create --type=bug --priority=1 --title="Fix: EACCES permission denied on /app/data/enrichments" --files "packages/course-gen-platform/Dockerfile,packages/course-gen-platform/src/stages/stage7-enrichments/worker-entrypoint.ts"`
2. `bd create --type=bug --priority=2 --title="Fix: Jina API 429 rate limit - shared RateLimiter" --files "packages/course-gen-platform/src/shared/embeddings/jina-client.ts,packages/course-gen-platform/src/shared/embeddings/generate.ts,packages/course-gen-platform/src/shared/jina/reranker-client.ts"`
3. `bd create --type=chore --priority=3 --title="Add auto-mute rule for JSON repair failed" --files "packages/course-gen-platform/src/shared/logger/auto-classification.ts"`
