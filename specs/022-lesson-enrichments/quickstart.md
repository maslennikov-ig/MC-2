# Quickstart: Lesson Enrichments (Stage 7)

**Date**: 2025-12-24
**Branch**: `022-lesson-enrichments`
**Estimated Setup**: 15 minutes

This guide helps developers get started with the Stage 7 enrichments feature.

---

## Prerequisites

- Node.js 20+
- pnpm 8+
- Supabase project access
- Redis instance (for BullMQ)
- OpenAI API key (for TTS)

---

## 1. Database Setup

### Apply Migration

```bash
# From project root
cd packages/course-gen-platform

# Apply the enrichments migration
pnpm supabase db push
```

### Verify Tables

```sql
-- Check table exists
SELECT * FROM information_schema.tables
WHERE table_name = 'lesson_enrichments';

-- Check enums
SELECT enum_range(NULL::enrichment_type);
SELECT enum_range(NULL::enrichment_status);
```

---

## 2. Type Generation

After migration, regenerate TypeScript types:

```bash
# Generate Supabase types
pnpm supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > packages/shared-types/src/database.types.ts

# Verify exports
pnpm -F @megacampus/shared-types build
```

---

## 3. Environment Variables

Add to `.env.local`:

```env
# OpenAI TTS (required for audio enrichments)
OPENAI_API_KEY=sk-...

# Existing variables (should already be set)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
REDIS_URL=redis://localhost:6379
```

---

## 4. Start Development Servers

```bash
# Terminal 1: Web app
pnpm dev:web

# Terminal 2: Course generation platform (includes workers)
pnpm dev:platform

# Terminal 3: Watch for changes
pnpm -F course-gen-platform dev:worker
```

---

## 5. Test Basic Flow

### 5.1 Create Test Enrichment (via tRPC)

```typescript
// In any client component or test file
import { trpc } from '@/lib/trpc';

// Create a quiz enrichment for a lesson
const result = await trpc.enrichment.create.mutate({
  lessonId: 'your-lesson-uuid',
  enrichmentType: 'quiz',
  settings: {
    question_count: 5,
  },
});

console.log('Created:', result.enrichmentId);
```

### 5.2 Check Status via Database

```sql
SELECT id, enrichment_type, status, created_at
FROM lesson_enrichments
WHERE lesson_id = 'your-lesson-uuid'
ORDER BY created_at DESC
LIMIT 5;
```

### 5.3 Verify Real-time Updates

```typescript
// Subscribe to enrichment updates
const channel = supabase
  .channel('enrichment-test')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'lesson_enrichments',
    },
    (payload) => {
      console.log('Update:', payload.new);
    }
  )
  .subscribe();
```

---

## 6. Key Files to Know

| Purpose | File Path |
|---------|-----------|
| Types | `packages/shared-types/src/lesson-enrichment.ts` |
| Content Types | `packages/shared-types/src/enrichment-content.ts` |
| tRPC Router | `packages/course-gen-platform/src/server/routers/enrichment/router.ts` |
| BullMQ Worker | `packages/course-gen-platform/src/stages/stage7-enrichments/factory.ts` |
| Quiz Handler | `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/quiz-handler.ts` |
| LessonNode UI | `packages/web/components/generation-graph/nodes/LessonNode.tsx` |
| AssetDock UI | `packages/web/components/generation-graph/nodes/AssetDock.tsx` |
| Inspector Panel | `packages/web/components/generation-graph/panels/stage7/EnrichmentInspectorPanel.tsx` |

---

## 7. Common Tasks

### Add a New Enrichment Type

1. Add value to `enrichment_type` enum (migration)
2. Add TypeScript type to `enrichment-content.ts`
3. Create handler in `handlers/` directory
4. Create prompt in `prompts/` directory
5. Add to router in `enrichment-router.ts`
6. Add icon and translations

### Test Quiz Generation

```bash
# Run the quiz handler test
pnpm -F course-gen-platform test --grep "quiz-handler"
```

### Check Worker Logs

```bash
# View BullMQ worker logs
pnpm -F course-gen-platform logs:worker | grep stage7
```

---

## 8. Troubleshooting

### "Enrichment stuck in pending"

1. Check Redis connection:
   ```bash
   redis-cli ping
   ```

2. Check worker is running:
   ```bash
   ps aux | grep stage7
   ```

3. Check BullMQ dashboard (if configured):
   ```
   http://localhost:3000/admin/queues
   ```

### "TTS generation failed"

1. Verify OpenAI API key:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

2. Check character limit (max 4096 chars per request)

3. Check error_details in database:
   ```sql
   SELECT error_message, error_details
   FROM lesson_enrichments
   WHERE status = 'failed'
   ORDER BY updated_at DESC
   LIMIT 1;
   ```

### "Asset Dock not showing"

1. Verify zoom level (> 0.5 for icons)
2. Check enrichment data in node:
   ```typescript
   console.log(node.data.enrichmentsSummary);
   ```
3. Verify Realtime subscription is connected

---

## 9. Next Steps

After basic setup:

1. Review [plan.md](./plan.md) for full implementation phases
2. Review [data-model.md](./data-model.md) for schema details
3. Review [research.md](./research.md) for library decisions
4. Run `/speckit.tasks` to generate task breakdown

---

*Happy coding!*
