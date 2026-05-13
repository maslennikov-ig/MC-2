# Career Playbook — Course Bridge Flow (Phase 9)

Детальный алгоритм перехода Role Guide → автоматически сгенерированный курс.

## Цель

Кнопка "Создать курс" на странице Role Guide создаёт **полноценный course** через существующий Stage 2-6 pipeline, используя:
- Role Guide content как primary domain knowledge
- Auto WebSearch как synthetic source corpus для RAG

## High-level flow

```
[User clicks "Создать курс" on /career-playbook/[id]]
         ↓
[Modal: "Хотите добавить свои материалы?" + optional file upload]
         ↓ (skip OR upload)
[POST /trpc careerPlaybook.createCourseFromPlaybook]
         ↓
[Backend: course-from-playbook.ts service]
         │
         ├─ 1. extractCourseBrief(playbook) → course_brief JSON (LLM)
         │
         ├─ 2. generateSyntheticCorpus(brief.web_search_queries)
         │   → fetch ~5-10 web articles, save as documents
         │
         ├─ 3. createCourse({title, description, course_brief, ...})
         │
         ├─ 4. attachDocuments(courseId, syntheticDocs + userUploads)
         │
         ├─ 5. generation.start(courseId)  ← существующий entry point
         │     (Stage 2 → 3 → 4 → 5 → 6 нормальный pipeline)
         │
         └─ 6. return {courseId, redirectUrl: "/courses/{courseId}"}
                 ↓
[Frontend: redirect to /courses/{courseId}, существующий job tracker UI]
```

## Step-by-step

### Step 1: Modal "Свои материалы?"

```tsx
// packages/web/components/career-playbook/viewer/CreateCourseModal.tsx
<Modal>
  <h2>Создать курс из Role Guide</h2>
  <p>Мы автоматически найдём 5-10 релевантных статей по компетенциям и инструментам
  из Role Guide и создадим курс. Если у вас есть свои материалы, вы можете их добавить.</p>

  <FileUpload optional />

  <Button>Создать курс</Button>
</Modal>
```

### Step 2: tRPC mutation

```typescript
// packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.router.ts
export const courseBridgeRouter = router({
  createCourseFromPlaybook: protectedProcedure
    .input(z.object({
      playbookId: z.string().uuid(),
      uploadedDocumentIds: z.array(z.string().uuid()).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { courseId } = await createCourseFromPlaybook(ctx, input);
      return { courseId, redirectUrl: `/courses/${courseId}` };
    })
});
```

### Step 3: Service implementation

```typescript
// packages/course-gen-platform/src/services/course-from-playbook.ts

export async function createCourseFromPlaybook(
  ctx: TRPCContext,
  input: { playbookId: string; uploadedDocumentIds?: string[] }
): Promise<{ courseId: string }> {
  const { playbookId, uploadedDocumentIds = [] } = input;
  const { userId, organizationId } = ctx.user;

  // 1. Load playbook (RLS check via ctx)
  const playbook = await loadPlaybook(playbookId, userId);
  if (playbook.status !== 'completed') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Playbook не готов' });
  }

  // 2. Extract course_brief через LLM
  const courseBrief = await extractCourseBrief({
    roleGuideMarkdown: playbook.final_markdown,
    contentLanguage: playbook.language
  });
  // → возвращает: { position_title, target_audience, learning_goals,
  //               suggested_modules, course_size, estimated_duration_hours,
  //               web_search_queries }

  // 3. Synthetic corpus from web research
  const syntheticDocs = await generateSyntheticCorpus({
    queries: courseBrief.web_search_queries,
    contentLanguage: playbook.language,
    organizationId
  });
  // → возвращает: documentIds[] (saved to documents table with source='web_research')

  // 4. Create course с prefilled данными
  const course = await createCourse({
    userId,
    organizationId,
    title: courseBrief.position_title === playbook.position_title
      ? `Курс для роли ${playbook.position_title}`
      : courseBrief.position_title,
    description: courseBrief.target_audience,
    language: playbook.language,
    course_brief: courseBrief,
    style: 'professional',
    source_metadata: { from_playbook_id: playbookId }
  });

  // 5. Attach documents (synthetic + user uploads)
  const allDocIds = [...syntheticDocs, ...uploadedDocumentIds];
  if (allDocIds.length === 0) {
    // Edge case: WebSearch fail + no upload → fail-fast
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Не удалось собрать материалы для курса. Попробуйте позже или загрузите свои.'
    });
  }
  await attachDocumentsToCourse(course.id, allDocIds);

  // 6. Trigger pipeline (Stage 2 → ... → Stage 6)
  await ctx.trpc.generation.start({ courseId: course.id });

  return { courseId: course.id };
}
```

### Step 4: extractCourseBrief LLM call

См. `03-prompts-structure.md` → `career_playbook_course_brief_extractor`.

### Step 5: generateSyntheticCorpus

```typescript
// packages/course-gen-platform/src/services/synthetic-corpus.ts

interface SyntheticCorpusParams {
  queries: string[];
  contentLanguage: string;
  organizationId: string;
}

export async function generateSyntheticCorpus(
  params: SyntheticCorpusParams
): Promise<string[]> {
  const documentIds: string[] = [];
  const MAX_PARALLEL = 3;
  const QUERY_TIMEOUT_MS = 10_000;
  const TOTAL_TIMEOUT_MS = 30_000;

  // WebSearch implementation:
  // Option 1: OpenRouter web tool (если модель поддерживает tools)
  // Option 2: Tavily / Serper API через axios (recommended for predictability)
  // Option 3: SearXNG self-hosted (если есть infrastructure)

  // Decision для MVP: Tavily / Serper API
  // Env: WEB_SEARCH_API_KEY, WEB_SEARCH_PROVIDER ('tavily' | 'serper')

  const chunks = chunk(params.queries, MAX_PARALLEL);
  const startTime = Date.now();

  for (const queryBatch of chunks) {
    if (Date.now() - startTime > TOTAL_TIMEOUT_MS) break;

    const results = await Promise.allSettled(
      queryBatch.map(q => searchWeb(q, { timeout: QUERY_TIMEOUT_MS, language: params.contentLanguage }))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        // Каждый result.value = { url, title, snippet, full_content }
        // Сохраняем как document
        for (const article of r.value.slice(0, 3)) {  // top 3 на query
          const docId = await saveAsDocument({
            content: article.full_content,
            title: article.title,
            url: article.url,
            language: params.contentLanguage,
            organizationId: params.organizationId,
            source_type: 'web_research'  // новый тип? или 'pdf'+url metadata
          });
          documentIds.push(docId);
        }
      }
    }
  }

  // Если совсем ничего — fallback: использовать сам Role Guide как single document
  if (documentIds.length === 0) {
    // Caller (createCourseFromPlaybook) обработает это — fail-fast если нет materials.
    // Альтернативно — здесь можно сохранить Role Guide markdown как document.
  }

  return documentIds;
}
```

### Step 6: Documents table integration

Проверить current schema `documents` table — есть ли нужные поля:
- `source_type` или `source` — нужен enum value для 'web_research'
- `source_url` — для аудита
- `language` — должен быть
- `organization_id` — должен быть

Если `source_type` не позволяет 'web_research' — добавить в Phase 9 migration:

```sql
ALTER TYPE document_source_type ADD VALUE 'web_research';
-- Или, если varchar — просто use string.
```

## Cost considerations

- LLM extractCourseBrief: 1 call, ~2000 tokens input + ~500 output = ~$0.01 (Sonnet)
- WebSearch: 5-10 queries × $0.001-0.005 per query (Tavily/Serper) = $0.01-0.05
- Stage 2-6 pipeline: существующие costs (зависит от course size, обычно $0.5-2)

Итого create-course-from-playbook: ~$0.5-2 (доминирует обычный course pipeline).

## Error handling

| Сценарий | Поведение |
|---|---|
| extractCourseBrief LLM fail | Retry 1 раз. Если опять — fallback: hardcoded brief из playbook.role_profile_spec |
| WebSearch API down | Continue без synthetic corpus. Если есть uploaded docs — proceed. Иначе — fail с понятной ошибкой |
| All WebSearch queries timeout | Same as above |
| Course creation failure | Транзакционно откатить — удалить synthetic docs если course не создался |
| generation.start failure | Course remains с status='failed', можно retry через существующий UI |
| User cancels modal | Никаких side effects, ничего не списано |

## Future iterations (out of MVP)

- WebSearch quality scoring (выбрать top 5 из 20 found, не первые 5)
- Cache WebSearch результаты (если 10 пользователей делают course для "Sales Manager B2B" — не делать 10 раз поиск)
- Manual review before generation: показать список найденных статей пользователю, дать выбрать/удалить
- Альтернативные источники: Notion, Confluence через API connectors
- Multi-language WebSearch: если content_language = 'es', искать на испанском + английском
