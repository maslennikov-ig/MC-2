# Error Log Cleanup + Category Badges in Clarifying Wizard

## Context

After deploying Phase 0.5 clarifying system, analysis of QCV-1695 showed no generation errors. However, `/admin/logs` has **~1,200 unprocessed server errors** (716 dev + 525 stage). Most are auto-mutable but weren't resolved retroactively. Additionally, `question_category` is stored in DB but **not shown in user-facing ClarifyingPanel** — only priority colors are displayed.

User requirements: both tasks in parallel, UI changes must be beautiful/consistent with current design, easy rollback if categories don't work visually.

---

## Task A: Error Log Bulk Processing (orchestrator executes directly)

### A1. Bulk resolve local (NULL environment) errors

```sql
-- ~6,376 local dev errors
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
```

### A2. Bulk resolve auto-mutable server errors by fingerprint

These errors have auto-mute rules that apply to NEW errors, but old ones remain unresolved:

| Fingerprint                   | Error                                         | Count               | Auto-mute rule                                          |
| ----------------------------- | --------------------------------------------- | ------------------- | ------------------------------------------------------- |
| `e41343eb...` + 7 others      | `Job NNN not found` (jobs.getStatus)          | ~230 dev            | `Job \d+ not found` (line ~187)                         |
| `feed6477...`                 | `Patcher: REJECTED - prompt template markers` | 257 stage + 156 dev | `Patcher.*REJECTED.*prompt template markers` (line 199) |
| `49d6bf39...`                 | `ModelConfigBunker LKG file write failing`    | 62 stage + 1 dev    | `ModelConfigBunker.*LKG file`                           |
| `b348ce09...`                 | `ModelConfigBunker DB sync failed`            | 10 dev + 9 stage    | `ModelConfigBunker.*sync.*fail`                         |
| `bce0c572...` + `f1c2f712...` | `Rate limit exceeded` (partialGenerate)       | 2 dev               | Rate limiting = expected behavior                       |

```sql
-- Bulk resolve by fingerprint list
WITH target_fingerprints AS (
  SELECT DISTINCT ON (el.fingerprint) el.id, el.fingerprint
  FROM error_logs el
  LEFT JOIN log_issue_status lis ON lis.fingerprint = el.fingerprint AND lis.log_type = 'error_log'
  WHERE (lis.id IS NULL OR lis.status = 'new')
    AND el.fingerprint IN (
      -- Job not found (all variants)
      'e41343eb36b3b7c945eeb640827f6af5', '2d6beb357182a9e25885c18f32457a3a',
      'aff5a9e3deb2436c45814b62dcd759dd', '7baf4b13e26ae5182c1ca509497c11f1',
      'a72bcd14f87ddbddaa99994da68c1e1b', 'aa66dc378a0683fadeb64b452cd41275',
      'e6f24ede2dcada0f06df596f61be381e', '19a82464d3914e858bef7f27ac04271e',
      -- Patcher REJECTED
      'feed647764bd77fbcd3cbbba89056796',
      -- ModelConfigBunker
      '49d6bf3960ab467bcad18200401ab83d', 'b348ce0913e97c84bd6de1fe37ec7702',
      -- Rate limit
      'bce0c572d6a35c9cfcb0e506ffaecb27', 'f1c2f7122c1379ac3af16a0e756104a0'
    )
  ORDER BY el.fingerprint, el.created_at DESC
)
INSERT INTO log_issue_status (log_type, log_id, status, notes, fingerprint, updated_at)
SELECT 'error_log', tf.id, 'auto_muted', 'Retroactive auto-mute: rule exists in auto-classification.ts', tf.fingerprint, NOW()
FROM target_fingerprints tf
ON CONFLICT (log_type, log_id) DO UPDATE SET status = 'auto_muted', notes = EXCLUDED.notes, updated_at = NOW();
```

### A3. Add new auto-mute rule for rate limiting

File: `packages/course-gen-platform/src/shared/logger/auto-classification.ts`

```typescript
{
  pattern: /Rate limit exceeded/i,
  reason: 'expected_behavior',
  description: 'tRPC rate limiter working as designed',
},
```

### A4. Mark validation errors as resolved

Fingerprint `74442f2a640b7d69e853d021f0d0456d` — "Необходимо выбрать один ключевой документ" (3 dev).
This is BAD_REQUEST from `generation.approveStage` — user validation, not a bug.

```sql
INSERT INTO log_issue_status (log_type, log_id, status, notes, fingerprint, updated_at)
SELECT 'error_log', el.id, 'resolved', 'User validation: user did not select key document. Not a bug.', el.fingerprint, NOW()
FROM error_logs el
LEFT JOIN log_issue_status lis ON lis.fingerprint = el.fingerprint AND lis.log_type = 'error_log'
WHERE el.fingerprint = '74442f2a640b7d69e853d021f0d0456d'
  AND (lis.id IS NULL OR lis.status = 'new')
LIMIT 1
ON CONFLICT (log_type, log_id) DO UPDATE SET status = 'resolved', notes = EXCLUDED.notes, updated_at = NOW();
```

### A5. Mark external service errors as to_verify

| Fingerprint   | Error                                      | Count           |
| ------------- | ------------------------------------------ | --------------- |
| `57513fba...` | `Failed to fetch pending jobs from outbox` | 7 stage + 3 dev |
| `8d393f8b...` | `Batch processing failed`                  | 5 stage + 3 dev |
| `7c7957ab...` | `Outbox processor error, retrying in 5s`   | 4 stage + 2 dev |
| `178fbe51...` | `OpenAI API error`                         | 4 dev           |
| `6a46b4d1...` | `LLM request failed after all retries`     | 1 dev           |

Last seen dates are 2026-01-27 to 2026-02-01 (old). Mark as `to_verify` — will auto-resolve in 14d if no recurrence.

### A6. Bulk resolve test environment errors

```sql
-- ~174 test environment errors
WITH test_fingerprints AS (
  SELECT DISTINCT ON (el.fingerprint) el.id, el.fingerprint
  FROM error_logs el
  LEFT JOIN log_issue_status lis ON lis.fingerprint = el.fingerprint AND lis.log_type = 'error_log'
  WHERE (lis.id IS NULL OR lis.status = 'new')
    AND el.environment = 'test'
    AND el.fingerprint IS NOT NULL
  ORDER BY el.fingerprint, el.created_at DESC
)
INSERT INTO log_issue_status (log_type, log_id, status, notes, fingerprint, updated_at)
SELECT 'error_log', tf.id, 'auto_muted', 'Test environment: vitest errors', tf.fingerprint, NOW()
FROM test_fingerprints tf
ON CONFLICT (log_type, log_id) DO UPDATE SET status = 'auto_muted', notes = EXCLUDED.notes, updated_at = NOW();
```

---

## Task B: Category Badges in ClarifyingPanel (delegate to nextjs-ui-designer)

### Goal

Add `question_category` display to the user-facing ClarifyingPanel wizard. Must be:

- Consistent with current design (dark theme, Tailwind, shadcn/ui Badge)
- Non-disruptive — categories are informational, don't change interaction flow
- Rollback-safe — wrapped in a feature check (if category exists, show; if not, hide)

### Files to modify

1. **`packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx`**
   - Add `category?: string` to `Question` interface (line 33-41)
   - Display category badge next to question type/priority badges
   - Reuse `CategoryBadge` pattern from `admin-clarifying-tab.tsx` (lines 407-438)
   - Badge only renders when `category` is truthy (rollback-safe)

2. **`packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`**
   - Map `rawQ.question_category` to `category` field (line 207-222)
   - Add `category: rawQ.question_category || undefined` to Question object

3. **`packages/web/components/generation-graph/panels/clarifying/wizard/WizardSidebar.tsx`**
   - Optionally add small category indicator next to priority dot
   - Only if it doesn't clutter the sidebar (designer decision)

### CategoryBadge design (reuse from admin tab)

Existing color map in `admin-clarifying-tab.tsx:420-428`:

```typescript
const colorMap: Record<string, string> = {
  company_context: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  audience: 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300',
  expected_outcomes: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  content_structure: 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  focus_priorities: 'border-pink-500/20 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  business_goals: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  practical_application: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  constraints: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
};
```

**Also handle old categories** (from existing DB data):

```typescript
// Old categories still in DB
content: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
outcome: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300',
format: 'border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-300',
tool: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
depth: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300',
```

### Rollback strategy

- `category` field is optional in Question interface
- CategoryBadge only renders when `question.category` is truthy
- If visual result is bad → remove badge rendering (1-line change), data flow stays intact
- No DB changes, no backend changes needed

### Designer instructions

The `nextjs-ui-designer` should:

1. Extract `CategoryBadge` to a shared component (`packages/web/components/ui/category-badge.tsx`) — used by both ClarifyingPanel and AdminClarifyingTab
2. Place badge in QuestionCard header area, between type badge and priority indicator
3. Use i18n-friendly labels (Russian translations for category names)
4. Ensure badge doesn't break layout on mobile (truncate if needed)
5. Match current motion/animation patterns (framer-motion)

---

## Verification

### Task A

```sql
-- After processing, check remaining new errors
SELECT environment, COUNT(*) FROM error_logs el
LEFT JOIN log_issue_status lis ON lis.fingerprint = el.fingerprint AND lis.log_type = 'error_log'
WHERE (lis.id IS NULL OR lis.status = 'new') AND el.environment IS NOT NULL
GROUP BY environment;
-- Expected: 0 or near-zero for dev/stage
```

### Task B

- `pnpm type-check` — 0 errors
- `pnpm --filter web build` — successful
- Visual: open any course with clarifying questions → wizard shows category badges
- Rollback: remove CategoryBadge from QuestionCard render → badges disappear, no errors

### Both

- `git push` → auto-deploy to dev
- Check `/admin/logs` → most errors resolved/muted
- Check ClarifyingPanel on any course → categories visible
