# Phase 0.5: Unit Tests + Admin Clarifying Tab

## Context

Phase 0.5 multi-round clarification system implemented and reviewed. Code review fixes applied (CRITICAL-002, HIGH-001, HIGH-003, MEDIUM-002). Now need:

1. **Unit tests** for `analyzeSufficiency()`, `storeQuestions()`, category validation
2. **Admin panel tab** showing clarifying Q&A for course monitoring

Рефакторинг context builders отклонён — не оправдан при 3 функциях по 5 строк.

---

## Task 1: Unit Tests (test-writer subagent)

### File

`packages/course-gen-platform/tests/unit/stages/stage4-analysis/phases/phase-05-clarifying.test.ts`

### Mocking Strategy

Следуем паттерну из `tests/unit/stages/stage4-analysis/phases/phase-1-classifier.test.ts`:

```typescript
// 1. Mock LLM: getModelForPhase → controlled invoke()
vi.mock('@/shared/llm/langchain-models', () => ({
  getModelForPhase: vi.fn().mockResolvedValue({
    model: 'test-model',
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({ is_sufficient: true, confidence: 0.85, gaps: [] }),
    }),
  }),
}));

// 2. Mock Supabase: chainable .from().insert()
vi.mock('@/shared/supabase/admin', () => {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  return {
    getSupabaseAdmin: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    }),
  };
});

// 3. Mock trace logger
vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

// 4. Mock safeJSONParse (delegate to JSON.parse by default)
vi.mock('@/shared/utils/json-repair', () => ({
  safeJSONParse: vi.fn((input: string) => JSON.parse(input)),
}));

// 5. Mock logger (suppress output)
vi.mock('@/shared/logger', ...);
```

### Test Cases (~18 tests)

```
describe('analyzeSufficiency')
  describe('sufficient verdict')
    ✓ returns is_sufficient: true when LLM says sufficient
    ✓ returns no follow_up_questions when sufficient

  describe('insufficient verdict')
    ✓ returns is_sufficient: false with follow_up_questions when gaps exist
    ✓ includes gaps array from LLM response

  describe('JSON parse failure graceful degradation')
    ✓ defaults to sufficient with confidence 0.3 on parse failure
    ✓ calls logTrace with sufficiency_parse_failure_round_N step

  describe('Zod validation failure')
    ✓ defaults to sufficient on schema mismatch (e.g. is_sufficient: "yes")

  describe('CRITICAL-002: confidence threshold')
    ✓ overrides to sufficient when confidence >= 0.6 and LLM says not sufficient
    ✓ preserves not-sufficient when confidence < 0.6

  describe('HIGH-003: follow-up truncation')
    ✓ truncates to max 20 in round 1
    ✓ truncates to max 10 in round 2
    ✓ sorts by priority (critical first) when truncating

  describe('trace logging')
    ✓ calls logTrace with sufficiency_analysis_round_N on success

describe('storeQuestions')
  ✓ inserts questions with correct iteration_round and order_index
  ✓ handles empty array without error
  ✓ throws on Supabase insert error

describe('category validation')
  ✓ ClarifyingQuestionSchema accepts all 8 valid categories
  ✓ rejects invalid/old categories
```

### Run

```bash
pnpm --filter course-gen-platform test  # vitest.config.unit.ts includes tests/unit/**
```

---

## Task 2: Admin Clarifying Q&A Tab (nextjs-ui-designer subagent)

### Изменяемые файлы

| Файл                                                                             | Изменение                         |
| -------------------------------------------------------------------------------- | --------------------------------- |
| `packages/web/app/[locale]/admin/generation/[courseId]/page.tsx`                 | Добавить 3-й таб "Clarifying Q&A" |
| **NEW** `packages/web/components/generation-monitoring/admin-clarifying-tab.tsx` | Новый компонент                   |

### Изменение page.tsx

Добавить таб в существующий `<TabsList>` (строка 78):

```tsx
<TabsList>
  <TabsTrigger value="traces">Trace Viewer</TabsTrigger>
  <TabsTrigger value="clarifying">Clarifying Q&A</TabsTrigger> {/* NEW */}
  <TabsTrigger value="stage6">Stage 6 Control</TabsTrigger>
</TabsList>
```

Добавить `<TabsContent>`:

```tsx
<TabsContent value="clarifying" className="mt-0 min-h-0 flex-1">
  <AdminClarifyingTab />
</TabsContent>
```

Добавить import:

```tsx
import { AdminClarifyingTab } from '@/components/generation-monitoring/admin-clarifying-tab';
```

### Компонент AdminClarifyingTab

**Паттерн**: аналогично `ManualStage6Panel` — `'use client'`, `useGenerationRealtime()` для courseId, `useSupabase()` для прямых запросов.

**Два запроса при mount:**

```typescript
// 1. Вопросы (все колонки)
supabase
  .from('clarifying_questions')
  .select('*')
  .eq('course_id', courseId)
  .order('iteration_round')
  .order('order_index');

// 2. Sufficiency verdicts из generation_trace
supabase
  .from('generation_trace')
  .select('step_name, output_data, created_at, duration_ms')
  .eq('course_id', courseId)
  .eq('stage', 'stage_4')
  .eq('phase', 'stage_4_clarifying')
  .like('step_name', 'sufficiency%')
  .order('created_at');
```

**UI структура:**

```
┌─ Summary Card ──────────────────────────────────┐
│ 11 вопросов | 10 отвечено | 1 пропущено         │
│ Раунды: 2 из 3 max                               │
└──────────────────────────────────────────────────┘

┌─ Accordion: Round 1 (8/8 answered) ─────────────┐
│ Table:                                            │
│ # | Category         | Priority | Question | Answer | Source     │
│ 1 | audience         | critical | Кто ЦА.. | IT..   | suggested  │
│ 2 | content_structure| important| Модули.. | 7 м..  | custom     │
│ 3 | constraints      | nice_to  | Огран..  | (skip) | —          │
└──────────────────────────────────────────────────┘

┌─ Accordion: Round 2 (3/3 answered) ─────────────┐
│ Table: ...                                        │
└──────────────────────────────────────────────────┘

┌─ Sufficiency Verdicts ──────────────────────────┐
│ ⚠ Round 1 → insufficient (confidence: 0.42)     │
│   Gaps: ["audience unclear", "no constraints"]   │
│ ✓ Round 2 → sufficient (confidence: 0.85)        │
└──────────────────────────────────────────────────┘
```

**UI компоненты (уже в проекте):**

- shadcn: `Table`, `Badge`, `Card`, `Accordion`, `ScrollArea`
- Иконки: `CheckCircle`, `AlertCircle`, `MessageSquare`, `Loader2` из lucide-react

**Цвета бейджей категорий:**

| Категория             | Цвет   |
| --------------------- | ------ |
| company_context       | blue   |
| audience              | green  |
| expected_outcomes     | purple |
| content_structure     | orange |
| focus_priorities      | pink   |
| business_goals        | cyan   |
| practical_application | amber  |
| constraints           | red    |

**Хелпер displayAnswer:**

```typescript
function displayAnswer(userAnswer: unknown, status: string): string {
  if (status === 'skipped') return '(пропущен)';
  if (status === 'pending') return '(ожидает ответа)';
  if (!userAnswer) return '(нет ответа)';
  if (typeof userAnswer === 'string') return userAnswer;
  if (typeof userAnswer === 'object' && userAnswer !== null) {
    const a = userAnswer as Record<string, unknown>;
    if (typeof a.value === 'string') return a.value;
    if (Array.isArray(a.values)) return a.values.join(', ');
  }
  return '(неизвестный формат)';
}
```

**Состояния:**

- Loading: `Loader2` spinner в центре
- Empty: "Для этого курса не генерировались уточняющие вопросы"
- Error: Card с сообщением + кнопка "Повторить"

---

## Параллелизация

Задачи полностью независимы:

- Task 1 → `test-writer` subagent (packages/course-gen-platform/tests/)
- Task 2 → `nextjs-ui-designer` subagent (packages/web/)

Запускаются параллельно, не разделяют файлов.

---

## Verification

```bash
# Task 1
pnpm --filter course-gen-platform test           # unit tests pass
pnpm type-check                                    # 0 errors

# Task 2
pnpm type-check                                    # 0 errors
pnpm --filter web build                            # Next.js build OK

# Manual QA (Task 2)
# 1. Открыть /admin/generation/[courseId]
# 2. Кликнуть "Clarifying Q&A" tab
# 3. Проверить: вопросы сгруппированы по раундам
# 4. Проверить: ответы отображаются корректно
# 5. Проверить: sufficiency verdicts внизу
# 6. Проверить: пустой state для курса без вопросов
```
