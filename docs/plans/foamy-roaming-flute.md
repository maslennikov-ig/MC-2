# Fix: Log Warnings from QGN-6607 Course Generation

## Context

During local course generation (QGN-6607, course `647803d2`), logs revealed 5 issues. After analysis, **3 are actionable code fixes**, 1 is by-design, 1 is normal restart behavior.

| #   | Issue                                       | Fix?    | Why                                         |
| --- | ------------------------------------------- | ------- | ------------------------------------------- |
| 1   | LKG file ENOENT in stage6 worker            | **Yes** | Missing directory on first run              |
| 2   | Visual style `mood` > 100 chars → fallback  | **Yes** | LLM output truncation instead of fallback   |
| 3   | RT-006: `lesson_objectives` missing → retry | **Yes** | Improve first-attempt prompt                |
| 4   | Quality 0.7173 < 0.75                       | No      | Non-blocking by design (Stage 5 = skeleton) |
| 5   | Orphaned job recovery on restart            | No      | Normal behavior                             |

---

## Fix 1: LKG Directory ENOENT

**Problem:** `worker-stage6` logs `ENOENT` on `rename(.local/data/lkg-config.json.tmp → lkg-config.json)` x3. The `mkdir(dir, { recursive: true })` at line 815 exists but the `.local/data/` directory is missing on fresh clone/first run.

**File:** `packages/course-gen-platform/src/shared/llm/model-config-bunker.ts`

**Root cause:** `__dirname` resolves to `src/shared/llm/` → `../../../../.local/data/` = `packages/.local/data/`. The directory doesn't exist yet. The `mkdir` at line 815 should create it, but the error suggests it fails for the stage6 worker (possibly a race condition between parallel workers or `__dirname` resolving differently in tsx/esbuild).

**Fix:** Add explicit `ensureDirSync` during `ModelConfigBunker` initialization (constructor or `initialize()` method), not just in `updateAllLayers()`. This is a belt-and-suspenders approach — create the dir once at startup.

```typescript
// In initialize() or constructor, add:
import { mkdirSync } from 'fs';
// ...
const dir = path.dirname(LKG_PATH);
mkdirSync(dir, { recursive: true });
```

**Lines to modify:** Near the `initialize()` method (around line 420-430 where cold start logic exists), add `mkdirSync` before any LKG operations.

---

## Fix 2: Visual Style `mood` Limit Too Restrictive

**Problem:** LLM generates `mood` longer than 100 chars → Zod validation fails → entire style falls back to generic "blue and purple gradients". The course loses its unique visual identity.

**File:** `packages/course-gen-platform/src/stages/stage4-analysis/utils/visual-style-generator.ts`

**Fix:** Увеличить лимит поля `mood` в Zod-схеме со 100 до 300 символов. Поле `mood` — текстовое описание для дизайнеров/AI image models, нет причин ограничивать 100 символами. Аналогичный лимит у `visualElements` = 300.

**Изменение (строка 47):**

```typescript
// Было:
mood: z.string().min(5).max(100),

// Стало:
mood: z.string().min(5).max(300),
```

**Также обновить промпт (строка 97):**

```typescript
// Было:
"mood": "string (5-100 chars): Emotional tone of the visuals"

// Стало:
"mood": "string (5-300 chars): Emotional tone of the visuals"
```

---

## Fix 3: Improve First-Attempt Prompt for `lesson_objectives`

**Problem:** On first attempt, LLM sometimes omits `lesson_objectives` (required field). The current prompt (attempt 1, lines 210-232) mentions it as "Must be array of STRINGS" but doesn't emphasize it's **mandatory for every lesson**.

**File:** `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/prompt-builder.ts`

**Fix:** Strengthen the first-attempt prompt (lines 213-226) to explicitly require `lesson_objectives`:

```typescript
// Current (line 213-219):
**CRITICAL Field Type Requirements** (common mistakes to avoid):
- learning_objectives: Must be array of STRINGS (NOT objects with id/text/language)
- lesson_objectives: Must be array of STRINGS (NOT objects)

// Proposed:
**CRITICAL Field Type Requirements** (common mistakes to avoid):
- learning_objectives: REQUIRED, array of STRINGS (NOT objects with id/text/language)
- lesson_objectives: REQUIRED for EVERY lesson, array of 1-5 STRINGS (NOT objects). Each string 10-600 chars.
```

This minor clarification should reduce RT-006 retries, saving ~5-6 seconds and 4000+ tokens per section.

---

## Files to Modify

| File                                                                                              | Change                                             |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `packages/course-gen-platform/src/shared/llm/model-config-bunker.ts`                              | Add `mkdirSync` in `initialize()`                  |
| `packages/course-gen-platform/src/stages/stage4-analysis/utils/visual-style-generator.ts`         | Add field truncation before Zod validation         |
| `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/prompt-builder.ts` | Strengthen lesson_objectives requirement in prompt |

---

## Verification

1. **Fix 1 (LKG):** Delete `packages/.local/data/` → restart server → check no ENOENT warnings in worker-stage6 logs
2. **Fix 2 (mood):** Run course generation → check that visual style uses LLM output (not fallback) even for verbose responses
3. **Fix 3 (prompt):** Run course generation → check worker logs for RT-006 errors — should be fewer/none on first attempt
4. **Type-check:** `pnpm type-check` must pass
5. **Unit tests:** `pnpm --filter course-gen-platform test` must pass
