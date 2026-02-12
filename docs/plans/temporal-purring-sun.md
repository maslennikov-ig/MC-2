# Plan: Improve Stage 4 Clarifying Questions

## Context

Две проблемы с уточняющими вопросами (Stage 4, Phase 0.5):

1. **Формат** — модель спрашивает про формат доставки (онлайн/оффлайн), хотя платформа всегда онлайн.
   **Фикс (уже применён)**: добавлена строка контекста платформы в промпт.

2. **Документы не видны модели** (ECN-3813) — модель спрашивает "Какие продукты/услуги продаёт отдел продаж?", хотя пользователь загрузил документ с этой информацией. `buildCondensedContext()` передаёт только метаданные ("1 document, 355 tokens"), содержимое документов в промпт не попадает.

## Root cause

`buildCondensedContext()` строит строку только из budget metadata. Фактическое содержимое документов никогда не попадает в промпт Phase 0.5, хотя `document_summaries` уже доступны в памяти оркестратора.

## Подход

**Переиспользуем `document_summaries`** которые уже есть в оркестраторе (никаких лишних запросов в БД). Передаём их в Phase 0.5 с маленьким token budget (~4K вместо ~25K у Phase 1). Паттерн truncation тот же, что у Phase 1 и Phase 4.

Для ECN-3813 (355 токенов) — overhead почти нулевой.
Для 10 документов по 50K — truncate до ~400 токенов/док = ~4K total.

## Files to modify

1. `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`
2. `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts` (1 строка)

## Changes

### 1. Add document_summaries to Phase05Input (phase-0.5-clarifying.ts)

Add optional field to `Phase05InputSchema` (after `language`):

```typescript
document_summaries: z.array(z.object({
  file_name: z.string(),
  processed_content: z.string(),
})).optional(),
```

### 2. Add truncateContent helper (phase-0.5-clarifying.ts)

Same pattern as `phase-1-classifier.ts:106`:

```typescript
function truncateContent(content: string, maxTokens: number): string {
  const estimatedTokens = Math.ceil(content.length / 4);
  if (estimatedTokens <= maxTokens) return content;
  const maxChars = maxTokens * 4;
  return `${content.substring(0, maxChars)}\n[... truncated ...]`;
}
```

### 3. Modify buildCondensedContext (phase-0.5-clarifying.ts)

Add second parameter + document content section after existing metadata:

```typescript
function buildCondensedContext(
  budgetAllocation: Stage4BudgetAllocation | null,
  documentSummaries?: Array<{ file_name: string; processed_content: string }>
): string {
  // ... existing metadata code stays unchanged ...

  // Add document contents with small token budget
  if (documentSummaries && documentSummaries.length > 0) {
    const tokensPerDoc = Math.floor(4000 / documentSummaries.length);
    contextParts.push('\nDOCUMENT CONTENTS:');
    for (const doc of documentSummaries) {
      contextParts.push(
        `\n[${doc.file_name}]\n${truncateContent(doc.processed_content, tokensPerDoc)}`
      );
    }
  }

  return contextParts.join('\n');
}
```

### 4. Update buildClarifyingPrompt call (phase-0.5-clarifying.ts)

Pass `input.document_summaries` to `buildCondensedContext`:

```typescript
const condensedContext = buildCondensedContext(budgetAllocation, input.document_summaries);
```

### 5. Pass document_summaries from orchestrator (orchestrator.ts, ~line 354)

Add one field to the existing call:

```typescript
await runPhase05Clarifying({
  course_id: courseId,
  budgetAllocation: budgetAllocation,
  courseContext: { ... },
  language: input.language,
  document_summaries: input.document_summaries?.map(ds => ({
    file_name: ds.file_name,
    processed_content: ds.processed_content,
  })),
});
```

## Что НЕ меняется

- Существующая логика budget allocation
- Логика full_text / summary / chunks (решается в Stage 3 и handler)
- Token budgets других фаз
- Никаких новых запросов в БД — данные уже в памяти

## Verification

1. `pnpm type-check`
2. `pnpm --filter @megacampus/course-gen-platform build`
3. Проверить в `generation_trace` что prompt_text теперь содержит текст документов
