# Plan: Stage 6 Model Updates + kimi-k2 Rename + CLEV Judges

## Context

Stage 6 использует единую модель для генерации всех уроков (`stage_6_refinement`). Нужно:

1. Заменить `moonshotai/kimi-k2-0905` на `moonshotai/kimi-k2-thinking` глобально
2. Внедрить 3-tier routing для Stage 6 по сложности уроков (как в Stage 5)
3. Обновить CLEV-судей и delta-judge на новые модели
4. Обновить документ `llm-model-config.md`

---

## Part 1: Global Rename kimi-k2-0905 → kimi-k2-thinking

### SQL Migration: `supabase/migrations/20260217100000_rename_kimi_k2_to_thinking.sql`

```sql
UPDATE llm_model_config SET model_id = 'moonshotai/kimi-k2-thinking' WHERE model_id = 'moonshotai/kimi-k2-0905';
UPDATE llm_model_config SET fallback_model_id = 'moonshotai/kimi-k2-thinking' WHERE fallback_model_id = 'moonshotai/kimi-k2-0905';
```

### Файлы (замена строки `moonshotai/kimi-k2-0905` → `moonshotai/kimi-k2-thinking`):

| #   | Файл                                                                                         | Строки                     |
| --- | -------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | `packages/shared-types/src/model-defaults.ts`                                                | 36 (CHAT_PRIMARY_MODEL_ID) |
| 2   | `packages/course-gen-platform/src/shared/regeneration/layers/layer-5-emergency.ts`           | 68                         |
| 3   | `packages/course-gen-platform/src/stages/stage5-generation/handler-helpers.ts`               | 113                        |
| 4   | `packages/course-gen-platform/src/shared/llm/langchain-models.ts`                            | 135                        |
| 5   | `packages/course-gen-platform/src/shared/metrics/cost-tracker.ts`                            | 72                         |
| 6   | `packages/course-gen-platform/src/shared/llm/model-selector.ts`                              | 133, 193, 514              |
| 7   | `packages/course-gen-platform/src/shared/llm/model-config-db.ts`                             | 536, 547                   |
| 8   | `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts`      | 81                         |
| 9   | `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/constants.ts` | 23                         |
| 10  | `packages/course-gen-platform/src/server/routers/pipeline-admin/constants.ts`                | 265, 268                   |
| 11  | `packages/course-gen-platform/src/stages/stage6-lesson-content/config/index.ts`              | 59                         |
| 12  | `packages/course-gen-platform/src/config/config-seed.json`                                   | 332, 433, 450              |
| 13  | `packages/course-gen-platform/tests/unit/chat-mutation-helpers.test.ts`                      | ~10 вхождений              |

---

## Part 2: Stage 6 — 3-Tier Content Generation

### Суть

Добавить маршрутизацию модели генерации по `difficulty_level` урока (аналогично Stage 5 `importance`).

**Маппинг:**

- `beginner` → simple → `moonshotai/kimi-k2-thinking`
- `intermediate` → normal → `moonshotai/kimi-k2-thinking`
- `advanced` → complex → `qwen/qwen3.5-plus-02-15`

**Правило первого модуля:** Все уроки модуля 1 (lesson_id `1.*`) → всегда complex tier.

### 2.1 Новый файл: `stage6-lesson-content/nodes/generator/model-selector.ts`

Паттерн: копируем структуру `stage5-generation/utils/section-batch/model-selector.ts`.

```typescript
export interface Stage6ModelTier {
  model: string;
  tier: 'simple' | 'normal' | 'complex';
  reason: string;
}

export async function selectStage6ModelTier(lessonSpec): Promise<Stage6ModelTier> {
  // 1. Extract difficulty_level (default: 'intermediate')
  // 2. Extract module number from lesson_id.split('.')[0]
  // 3. If module === '1' → force 'complex'
  // 4. Else map: beginner→simple, intermediate→normal, advanced→complex
  // 5. Resolve model via createModelConfigService().getModelForPhase(`stage_6_${tier}`)
  // 6. Fallback to STAGE6_TIER_MODELS[tier]
}
```

### 2.2 Modify: `generator-constants.ts`

Добавить в конец файла:

```typescript
export const STAGE6_TIER_MODELS = {
  simple: 'moonshotai/kimi-k2-thinking',
  normal: 'moonshotai/kimi-k2-thinking',
  complex: 'qwen/qwen3.5-plus-02-15',
} as const;
```

### 2.3 Modify: `generator-single-call.ts` (строки 208-212)

**Было:**

```typescript
const modelConfigService = createModelConfigService();
const modelId =
  modelOverride ?? (await modelConfigService.getModelForPhase('stage_6_refinement')).modelId;
```

**Стало:**

```typescript
let modelId: string;
if (modelOverride) {
  modelId = modelOverride;
} else {
  const tierResult = await selectStage6ModelTier(lessonSpec);
  modelId = tierResult.model;
}
```

Добавить import `selectStage6ModelTier`. Убрать неиспользуемый import `createModelConfigService` из этого файла.

### 2.4 Modify: `stage6-lesson-content/config/index.ts`

Обновить `MODEL_FALLBACK`:

```typescript
export const MODEL_FALLBACK = {
  primary: {
    ru: 'moonshotai/kimi-k2-thinking',
    en: 'moonshotai/kimi-k2-thinking',
  },
  fallback: 'qwen/qwen3.5-plus-02-15',
  maxPrimaryAttempts: 2,
} as const;
```

### 2.5 Modify: `shared-types/src/model-config.ts`

Добавить в `PhaseName` union (после строки 56, перед Stage 7):

```typescript
  // Stage 6: 3-tier generation routing
  | 'stage_6_simple'
  | 'stage_6_normal'
  | 'stage_6_complex'
```

### 2.6 Modify: `shared/llm/model-config-db.ts` (~строка 570)

Добавить hardcoded fallback записи в `DEFAULT_PHASE_CONFIGS`:

```typescript
stage_6_simple: { modelId: 'moonshotai/kimi-k2-thinking', fallbackModelId: 'google/gemini-2.5-flash', ... },
stage_6_normal: { modelId: 'moonshotai/kimi-k2-thinking', fallbackModelId: 'google/gemini-2.5-flash', ... },
stage_6_complex: { modelId: 'qwen/qwen3.5-plus-02-15', fallbackModelId: 'moonshotai/kimi-k2-thinking', ... },
```

### 2.7 Modify: `server/routers/pipeline-admin/constants.ts`

- Добавить `stage_6_simple`, `stage_6_normal`, `stage_6_complex` в `linkedPhases` Stage 6
- Добавить записи в `DEFAULT_MODEL_CONFIGS`

### 2.8 SQL Migration: `supabase/migrations/20260217100100_stage6_3tier_routing.sql`

1. DROP + re-ADD CHECK constraint с новыми phase names
2. INSERT 6 записей (3 tier x 2 context_tier):
   - `stage_6_simple` standard/extended
   - `stage_6_normal` standard/extended
   - `stage_6_complex` standard/extended

### 2.9 Modify: `config/config-seed.json`

Добавить 6 записей для stage_6_simple/normal/complex (по аналогии с stage_5_simple/normal/complex).

---

## Part 3: CLEV Judges + Delta Judge

### Новые модели судей:

| Role        | Old Model                                         | New Model               |
| ----------- | ------------------------------------------------- | ----------------------- |
| primary     | deepseek/deepseek-v3.2 (ru) / qwen3-235b (en,any) | minimax/minimax-m2.5    |
| secondary   | moonshotai/kimi-k2-0905                           | z-ai/glm-5              |
| tiebreaker  | minimax/minimax-m2.1                              | qwen/qwen3.5-plus-02-15 |
| delta judge | xiaomi/mimo-v2-flash                              | qwen/qwen3.5-plus-02-15 |

### 3.1 SQL Migration: `supabase/migrations/20260217100200_update_stage6_judges.sql`

```sql
-- Primary judges → minimax/minimax-m2.5
UPDATE llm_model_config SET model_id='minimax/minimax-m2.5', weight=0.76, primary_display_name='Minimax M2.5'
WHERE phase_name='stage_6_judge' AND judge_role='primary' AND is_active=true;

-- Secondary judges → z-ai/glm-5
UPDATE llm_model_config SET model_id='z-ai/glm-5', weight=0.74, primary_display_name='GLM-5'
WHERE phase_name='stage_6_judge' AND judge_role='secondary' AND is_active=true;

-- Tiebreaker → qwen/qwen3.5-plus-02-15
UPDATE llm_model_config SET model_id='qwen/qwen3.5-plus-02-15', weight=0.75, primary_display_name='Qwen3.5 Plus'
WHERE phase_name='stage_6_judge' AND judge_role='tiebreaker' AND is_active=true;

-- Delta judge → qwen/qwen3.5-plus-02-15
UPDATE llm_model_config SET model_id='qwen/qwen3.5-plus-02-15', primary_display_name='Qwen3.5 Plus'
WHERE phase_name='stage_6_delta_judge' AND is_active=true;
```

### 3.2 Modify: `judge/clev-voter.ts` (строки 538-543)

Обновить fallback weight mapping (новые модели ДО generic family match):

```typescript
if (modelId.includes('minimax-m2.5')) return 0.76;
if (modelId.includes('qwen3.5') || modelId.includes('qwen/qwen3.5')) return 0.75;
if (modelId.includes('qwen3') || modelId.includes('qwen/qwen3')) return 0.75;
if (modelId.includes('glm-5') || modelId.includes('z-ai/glm-5')) return 0.74;
if (modelId.includes('deepseek')) return 0.74;
if (modelId.includes('kimi')) return 0.73;
if (modelId.includes('minimax')) return 0.72;
if (modelId.includes('glm')) return 0.71;
if (modelId.includes('gemini')) return 0.68;
```

Обновить JSDoc комментарии (строки 12-13, 120-122).

### 3.3 Modify: `shared/metrics/cost-tracker.ts`

Добавить pricing для новых моделей:

```typescript
'moonshotai/kimi-k2-thinking': { input: 0.55, output: 2.25 },  // renamed from kimi-k2-0905
'minimax/minimax-m2.5': { input: 0.35, output: 1.4 },
'z-ai/glm-5': { input: 0.25, output: 1.0 },
'qwen/qwen3.5-plus-02-15': { input: 0.15, output: 0.7 },
```

### 3.4 Modify: `config/config-seed.json`

Заменить 3 записи `stage_6_judge` на новые модели (minimax-m2.5, glm-5, qwen3.5-plus).

---

## Part 4: Update Documentation

### Modify: `.claude/docs/llm-model-config.md`

Полное обновление:

1. Все упоминания `kimi-k2-0905` → `kimi-k2-thinking` в таблицах Stage 4, 5, Chat
2. Новая секция Stage 6 с 3-tier таблицей
3. Новая таблица CLEV Judges с minimax-m2.5 / glm-5 / qwen3.5-plus
4. Delta judge → qwen/qwen3.5-plus-02-15
5. Model Aliases: добавить Kimi K2 Thinking, Minimax M2.5, GLM-5, Qwen3.5 Plus
6. Убрать старый alias Kimi K2 (kimi-k2-0905)

---

## Порядок выполнения

1. **Part 1** — Global rename kimi → kimi-k2-thinking (prerequisite для всего)
2. **Part 2** — Stage 6 3-tier routing (новый функционал)
3. **Part 3** — CLEV judges update (зависит от Part 1)
4. **Part 4** — Documentation update

## Verification

1. `pnpm type-check` — TypeScript ошибки
2. `pnpm build` — полная сборка
3. `pnpm test --filter=course-gen-platform` — тесты (chat-mutation-helpers.test.ts)
4. `grep -r "kimi-k2-0905" packages/ --include="*.ts" --include="*.json"` → 0 результатов в src
5. SQL: `SELECT * FROM llm_model_config WHERE model_id LIKE '%kimi-k2-0905%' OR fallback_model_id LIKE '%kimi-k2-0905%'` → 0 строк
6. SQL: `SELECT * FROM llm_model_config WHERE phase_name IN ('stage_6_simple','stage_6_normal','stage_6_complex')` → 6 строк
