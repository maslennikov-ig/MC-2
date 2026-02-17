# RAG Two-Tier Retrieval Optimization

## Context

75% RAG-запросов в Stage 6 впустую: только 257/1045 уроков (24.6%) получают полезный RAG-контент. Каждый урок выполняет до 10 Qdrant-запросов + Jina reranking, даже когда документы нерелевантны.

**Исследования** (4 документа: 2x Deep Research, 1x Architecture Decision, 1x DeepThink) выявили:

- Статический порог 0.35 — ошибка (должен быть НИЖЕ retrieval threshold, не выше)
- Binary skip/no-skip опасен — пропуск RAG отключает Judge factual verification
- Two-Tier Retrieval — консенсусная рекомендация всех исследований
- Early-exit после 1 запроса рискован — нужен "Strike-Two" (2 запроса)

**Цель:** Two-Tier Retrieval в Stage 6 — лёгкий gate (2 запроса) → решение → полный retrieval или exit.

## Approach: Two-Tier Retrieval in Stage 6

**Почему Stage 6, а не Stage 5:**

- Нет риска stale data (документы могут загрузиться между Stage 5 и 6)
- Separation of concerns: Stage 5 = planning, Stage 6 = execution
- 30 probe queries на Qdrant — мгновенно (sub-ms), не нужна pre-computation
- Все решения — ephemeral, но логируются в traces для отладки

### Implementation: Single file change + metrics

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts`

Изменить `retrieveLessonContext()` — ввести Two-Tier логику:

```
Текущий flow:
  checkCourseHasIndexedDocuments() → build 10 queries → execute ALL 10 → rerank → return

Новый flow:
  checkCourseHasIndexedDocuments()
  → build queries
  → TIER 1: execute first 2 queries (broadest), threshold 0.15, NO reranker
  → if Tier 1 returns 0 chunks → EARLY EXIT (log "tier1_exit")
  → TIER 2: execute remaining 8 queries → aggregate → rerank → return
```

**Детали Tier 1 (Light Gate):**

- Выполнить первые 2 запроса из `buildLessonQueries()` (search_queries[0] = section topic, objectives[0])
- Threshold: 0.15 (значительно ниже retrieval threshold 0.25 — safety margin)
- Без reranker (основная экономия — Jina Reranker API)
- Если ОБА запроса вернули 0 результатов → exit ("Strike-Two")
- Если хотя бы один вернул результат → proceed to Tier 2

**Детали Tier 2 (Full Retrieval):**

- Выполнить оставшиеся 8 запросов
- Объединить с Tier 1 результатами (deduplicate)
- Отправить на Jina Reranker
- Применить threshold 0.25 (как сейчас)

### Feature flag

```
RAG_TWO_TIER_ENABLED=true  (env var, default: true)
```

Если `false` → текущее поведение (все 10 запросов + reranking).

### Logging & Traces

Добавить trace events:

- `tier1_exit` — Tier 1 вернул 0, ранний выход
- `tier1_pass` — Tier 1 нашёл chunks, переход к Tier 2
- Log: `tier1_duration_ms`, `tier1_chunks_found`, `tier1_queries_used`

### Constants

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/rag/constants.ts`

```typescript
export const TWO_TIER_CONFIG = {
  /** Number of queries in Tier 1 (light gate) */
  TIER1_QUERY_COUNT: 2,
  /** Score threshold for Tier 1 (very permissive — safety margin) */
  TIER1_SCORE_THRESHOLD: 0.15,
  /** Enable two-tier retrieval */
  enabled: process.env.RAG_TWO_TIER_ENABLED !== 'false',
} as const;
```

## What we DON'T change

- **No type changes** (shared-types untouched) — решение ephemeral
- **No Stage 5 changes** — решение принимается в Stage 6
- **No new files** — всё в существующем retriever.ts + constants.ts
- **No prompt changes** (пока) — Tier 1 exit = empty chunks, система уже это обрабатывает
- **Reranker logic** — не трогаем, он вызывается только для Tier 2

## Expected impact

| Metric                                     | Before                      | After                                 |
| ------------------------------------------ | --------------------------- | ------------------------------------- |
| Qdrant queries (нерелевантные уроки, ~75%) | 10 per lesson               | 2 per lesson                          |
| Jina Reranker calls (нерелевантные)        | 1 per lesson                | 0                                     |
| Qdrant queries (релевантные уроки, ~25%)   | 10 per lesson               | 10 per lesson (unchanged)             |
| Jina Reranker (релевантные)                | 1 per lesson                | 1 (unchanged)                         |
| **Net: course with 40 lessons**            | ~400 queries + ~40 reranker | ~140 queries + ~10 reranker           |
| **Savings**                                | —                           | **~65% queries, ~75% reranker calls** |

## Critical files

| File                                        | Change                                   |
| ------------------------------------------- | ---------------------------------------- |
| `stage6-lesson-content/rag/retriever.ts:25` | Two-Tier logic в retrieveLessonContext() |
| `stage6-lesson-content/rag/constants.ts`    | TWO_TIER_CONFIG constants                |

Reuse as-is:

- `shared/rag/document-availability.ts` — course-level gate
- `shared/qdrant/search.ts` — searchChunks (Redis-cached)
- `stage6-lesson-content/rag/helpers.ts` — buildLessonQueries, createEmptyResult
- `stage6-lesson-content/rag/reranking.ts` — rerankChunks (only Tier 2)

## Verification

1. `pnpm type-check` — no regressions
2. `pnpm build` — builds ok
3. Generate course WITH documents — verify relevant lessons still get full RAG + reranking
4. Generate course WITHOUT documents — verify all lessons exit at course-level gate (existing)
5. Check trace logs for `tier1_exit` and `tier1_pass` events
6. Compare `retrievalDurationMs` before/after
7. Verify Judge system works for Tier 2 lessons (ragChunks.length > 0)
8. Verify Judge system correctly skips factual check for Tier 1 exits (ragChunks.length === 0)

## Rollout

1. Deploy to `develop` with `RAG_TWO_TIER_ENABLED=true`
2. Generate 2-3 test courses, check:
   - Quality unchanged for lessons with documents
   - `tier1_exit` rate ~70-80%
   - No unexpected regressions
3. If stable → `/deploy` to staging
4. Monitor 1 week

## Future phases (after data collection)

Исследования рекомендуют дальнейшие шаги после сбора данных:

1. **Adaptive thresholding** — калибровать TIER1_SCORE_THRESHOLD по реальным данным (probe_score vs final_rerank_score)
2. **Multi-signal probe** — улучшить Tier 1 запросы (area + key_topics + first LO вместо одного)
3. **Prompt polymorphism** — менять промпт для уроков без RAG ("генерируй без внешних данных")
4. **Shadow retrieval** — для 5-10% skipped уроков запускать полный RAG в фоне, сравнивать качество
5. **Classifier** — обучить lightweight классификатор на исторических данных (24.6%/75.4% split)
6. **BM25-only gate** — sub-ms keyword check перед dense search
