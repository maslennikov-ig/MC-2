# Plan: Stage 5 Models Configurable via Admin Panel

**Task:** Убрать hardcoded модели из Stage 5 и сделать их настраиваемыми через админку
**Status:** Ready for approval

---

## Problem

Stage 5 использует hardcoded модели в `constants.ts`:

```typescript
export const MODELS = {
  tier1_oss120b: 'openai/gpt-oss-120b',
  ru_lessons_primary: 'qwen/qwen3-235b-a22b-2507',
  en_lessons_primary: 'deepseek/deepseek-v3.1-terminus',
  lessons_fallback: 'moonshotai/kimi-k2-0905',
  tier3_gemini: 'google/gemini-2.5-flash',
};
```

Эти модели используются в 3 местах:

1. `model-selector.ts:167` - Tier 1 для простых секций
2. `model-selector.ts:155` - Fallback при ошибке БД
3. `generator-core.ts:385` - Escalation при retry

**Stage 4 и Stage 6 уже читают модели из БД** через `getModelForPhase()`.

---

## Solution

### 1. SQL Migration - Добавить записи в `llm_model_config`

```sql
-- Tier 1: Standard complexity sections
INSERT INTO llm_model_config (config_type, phase_name, stage_number, language, context_tier, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active)
VALUES
  ('global', 'stage_5_tier1', 5, 'any', 'standard', 'openai/gpt-oss-120b', 'moonshotai/kimi-k2-0905', 0.7, 30000, 128000, true),
  ('global', 'stage_5_tier1', 5, 'any', 'extended', 'google/gemini-2.5-flash', 'openai/gpt-oss-120b', 0.7, 30000, 128000, true);

-- Escalation: Language-specific models for retry
INSERT INTO llm_model_config (config_type, phase_name, stage_number, language, context_tier, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active)
VALUES
  ('global', 'stage_5_escalation', 5, 'ru', 'standard', 'qwen/qwen3-235b-a22b-2507', 'moonshotai/kimi-k2-0905', 0.7, 30000, 128000, true),
  ('global', 'stage_5_escalation', 5, 'en', 'standard', 'deepseek/deepseek-v3.1-terminus', 'moonshotai/kimi-k2-0905', 0.7, 30000, 128000, true),
  ('global', 'stage_5_escalation', 5, 'any', 'standard', 'moonshotai/kimi-k2-0905', 'google/gemini-2.5-flash', 0.7, 30000, 128000, true);

-- Language-specific for stage_5_sections (high complexity)
INSERT INTO llm_model_config (config_type, phase_name, stage_number, language, context_tier, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active)
VALUES
  ('global', 'stage_5_sections', 5, 'ru', 'standard', 'qwen/qwen3-235b-a22b-2507', 'moonshotai/kimi-k2-0905', 0.7, 30000, 128000, true),
  ('global', 'stage_5_sections', 5, 'en', 'standard', 'deepseek/deepseek-v3.1-terminus', 'moonshotai/kimi-k2-0905', 0.7, 30000, 128000, true)
ON CONFLICT (phase_name, language, context_tier) DO NOTHING;
```

### 2. Update PhaseName Type

**File:** `packages/shared-types/src/model-config.ts`

Add:

```typescript
| 'stage_5_tier1'        // Standard complexity tier
| 'stage_5_escalation'   // Escalation/retry tier
```

### 3. Update model-selector.ts

**File:** `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/model-selector.ts`

**Replace Tier 1 selection (lines 166-170):**

```typescript
// BEFORE:
return {
  model: MODELS.tier1_oss120b,
  tier: 'tier1_oss120b',
  reason: `Standard section...`,
};

// AFTER:
try {
  const tier1Config = await getModelForPhase(
    'stage_5_tier1',
    undefined,
    estimatedContextLength,
    langCode
  );
  return {
    model: tier1Config.model || MODELS.tier1_oss120b,
    tier: 'tier1_oss120b',
    reason: `Standard section (model from DB: ${tier1Config.model})`,
  };
} catch (error) {
  logger.warn({ msg: 'getModelForPhase failed for tier1, using hardcoded fallback' });
  return {
    model: MODELS.tier1_oss120b,
    tier: 'tier1_oss120b',
    reason: `Standard section (hardcoded fallback)`,
  };
}
```

### 4. Update generator-core.ts

**File:** `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/generator-core.ts`

**Replace escalation logic (lines 384-391):**

```typescript
// BEFORE:
const escalationModel = isRussian ? MODELS.ru_lessons_primary : MODELS.en_lessons_primary;

// AFTER:
let escalationModel: string;
try {
  const escalationConfig = await getModelForPhase(
    'stage_5_escalation',
    undefined,
    undefined,
    langCode
  );
  escalationModel = escalationConfig.model || MODELS.lessons_fallback;
} catch {
  escalationModel = isRussian ? MODELS.ru_lessons_primary : MODELS.en_lessons_primary;
}
```

### 5. Update Fallback Configs

**File:** `packages/course-gen-platform/src/shared/llm/model-config-service.ts`

Add to `DEFAULT_PHASE_CONFIGS`:

```typescript
stage_5_tier1: {
  modelId: 'openai/gpt-oss120b',
  fallbackModelId: 'moonshotai/kimi-k2-0905',
  temperature: 0.7,
  maxTokens: 30000,
  maxContextTokens: 128000,
  tier: 'standard',
  source: 'hardcoded',
},
stage_5_escalation: {
  modelId: 'moonshotai/kimi-k2-0905',
  fallbackModelId: 'google/gemini-2.5-flash',
  temperature: 0.7,
  maxTokens: 30000,
  maxContextTokens: 128000,
  tier: 'standard',
  source: 'hardcoded',
},
```

### 6. Update constants.ts Comments

**File:** `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/constants.ts`

```typescript
/**
 * LAST-RESORT FALLBACK MODELS
 *
 * Primary model selection uses getModelForPhase() from database.
 * These constants are only used when database is completely unavailable.
 *
 * To change models, update llm_model_config table via admin panel.
 */
export const MODELS = { ... }
```

---

## Files to Modify

| File                                                        | Changes                                     |
| ----------------------------------------------------------- | ------------------------------------------- |
| `supabase/migrations/XXXXXX_stage5_configurable_models.sql` | NEW: Add DB records                         |
| `packages/shared-types/src/model-config.ts`                 | Add `stage_5_tier1`, `stage_5_escalation`   |
| `.../section-batch/model-selector.ts`                       | Replace hardcoded with `getModelForPhase()` |
| `.../section-batch/generator-core.ts`                       | Replace escalation with DB lookup           |
| `.../section-batch/constants.ts`                            | Update comments                             |
| `.../llm/model-config-service.ts`                           | Add DEFAULT_PHASE_CONFIGS                   |

---

## Verification

1. **Type-check & Build:**

   ```bash
   pnpm type-check && pnpm build
   ```

2. **Run existing tests:**

   ```bash
   pnpm --filter course-gen-platform test section-batch-generator
   ```

3. **Apply migration:**

   ```bash
   pnpm supabase db push
   ```

4. **Verify in admin panel:**
   - Open admin → LLM Config
   - Check `stage_5_tier1` and `stage_5_escalation` records exist
   - Try changing model for `stage_5_sections` → verify Stage 5 uses new model

5. **Manual test:**
   - Create course, run Stage 5
   - Check logs for "model from DB" messages
   - Verify correct model is used based on language

---

## Backward Compatibility

- Existing `stage_5_sections` and `stage_5_metadata` records preserved
- Hardcoded fallbacks remain for DB unavailability
- Tier names unchanged (`tier1_oss120b`, `tier2_en_lessons`, etc.)
- Tests should pass without modification
