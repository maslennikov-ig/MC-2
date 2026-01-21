# Plan: Process Error Logs - Analysis & Resolution

## Summary

Analyzed 7 error types from last 24 hours. Key finding: **most errors are already fixed** but changes not deployed to Staging.

## Error Analysis

| Error                           | Count | Root Cause                           | Status                                     |
| ------------------------------- | ----- | ------------------------------------ | ------------------------------------------ |
| Schema validation failed (Helm) | 3     | Placeholder validator false positive | **FIXED** (commit 9b22334)                 |
| Job failed (Helm placeholders)  | 3/5   | Same as above                        | **FIXED** (commit 9b22334)                 |
| Job failed (Lock conflict)      | 2/5   | Concurrent processing attempt        | Expected behavior                          |
| Failed to delete vectors        | 7     | Qdrant collection not found          | **FIXED** (mc2-14m2) but NOT DEPLOYED      |
| LLM hallucination               | 62    | Patcher rejects prompt markers       | Working as designed, but needs improvement |
| No RAG chunks                   | 380   | Course without documents             | Expected behavior - auto-mute candidate    |
| Prompt unresolved placeholders  | 22    | Template variable missing            | Needs investigation                        |
| Mermaid pipeline failed         | 14    | LLM fix failed, using fallback       | Expected behavior - auto-mute candidate    |

## Resolution Plan

### Phase 1: Deploy Existing Fixes (Immediate)

**Action:** Run `/deploy` to merge develop → master → Staging

**Fixes included:**

1. ✅ Placeholder validator whitelist for Helm/Go templates (commit 9b22334)
2. ✅ Qdrant delete vectors graceful handling (mc2-14m2)

**Expected result:**

- "Schema validation failed" errors → 0
- "Job failed" from placeholders → 0
- "Failed to delete vectors" severity → WARN (not ERROR)

### Phase 2: Resolve Log Statuses in DB

Mark as resolved (fixed by deployment):

- `73e8395e625e12449e90199d5039a54d` - Schema validation (Helm)
- `a78c1e5a3e1b29845064d64a2ff8dec3` - Job failed (Helm placeholders)
- `19224c126dfa75bd7f68fc6fd5302bb9` - Delete vectors (now WARN)

Add to auto-mute (expected behavior):

- `bcc1220aae27052774b8fb9e1365529d` - No RAG chunks (courses without docs)
- `1a513f33ac138135c3a75d6630ff6706` - Mermaid fallback (graceful degradation)

### Phase 3: Investigate Remaining Issues

#### 3a. LLM Hallucination (62x) - mc2-hr2s follow-up

**Problem:** Patcher correctly detects prompt markers but:

- No retry mechanism after rejection
- Edit count doesn't increment on rejection → section never locks
- Same section retried with identical prompt → infinite loop potential
- Wastes 500-1000 tokens per rejection

**Recommendation:** Create follow-up task:

```bash
bd create --type=bug --priority=2 --title="Improve patcher retry logic after hallucination rejection" \
  --labels "pipeline,stage6"
```

#### 3b. Prompt Unresolved Placeholders (22x)

**Problem:** Template variable `{variable}` not resolved before LLM call

**Action:** Query for specific variable names:

```sql
SELECT el.metadata->>'unresolved' FROM error_logs el
WHERE el.fingerprint = '5c6465f4725216193982115a98b3fa41' LIMIT 5;
```

### Phase 4: Verify After Deployment

1. Wait 1 hour after deploy
2. Check error counts:

```sql
SELECT fingerprint, COUNT(*) as count
FROM error_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND environment = 'stage'
GROUP BY fingerprint
ORDER BY count DESC;
```

3. Confirm Helm-related errors are gone
4. Confirm Qdrant errors are WARN level

## Files Modified (Already Committed)

- `packages/course-gen-platform/src/stages/stage5-generation/validators/placeholder-validator.ts`
- `packages/course-gen-platform/tests/unit/validators/placeholder-validator.test.ts`

## Verification

After `/deploy`:

1. Generate a Kubernetes/Helm course on Staging
2. Verify no "Placeholders detected" errors for `{{ .Values.* }}` patterns
3. Delete a course and verify Qdrant logs are WARN not ERROR
4. Check `/admin/logs` shows reduced error count

## Commands

```bash
# Deploy to staging
/deploy

# Resolve log statuses (after deploy)
# Run SQL to mark fingerprints as resolved

# Create follow-up task for patcher improvement
bd create --type=bug --priority=2 --title="Improve patcher retry logic after hallucination rejection"
```
