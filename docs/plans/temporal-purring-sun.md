# Plan: Improve Stage 4 Clarifying Questions Prompt

## Context

Тестеры жалуются, что уточняющие вопросы (Stage 4, Phase 0.5) бывают бессмысленными. Например: "Какие форматы обучения предпочтительны для команды?" с вариантами "видео, онлайн, оффлайн" — хотя платформа MegaCampus всегда создаёт онлайн-курсы с фиксированным форматом.

**Причина**: промпт не сообщает модели контекст платформы — модель не знает, что формат курсов фиксирован.

**Подход**: минимальные изменения — добавить 2-3 строки контекста + заменить категорию. Без длинных списков запретов и self-check.

## File to modify

`packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

- Function: `buildClarifyingPrompt()` (lines 224-305)
- Only system prompt text. No schema/DB/frontend changes.

## Changes

### 1. Add platform context (2-3 lines, after line 232)

Insert right after "Your task is to generate clarifying questions...":

```
PLATFORM: MegaCampus is an online course platform. Courses are always text-based lessons with optional enrichments (quiz, audio, video, presentation). The delivery format is fixed — do not ask about it.
```

One concise sentence that gives the model enough context without over-constraining it.

### 2. Replace "format" category with "context" (line 246)

```diff
- "question_category": "audience|content|depth|format|outcome|tool"
+ "question_category": "audience|content|depth|outcome|tool|context"
```

"context" = learner environment, constraints, prerequisites.
Removing "format" eliminates the nudge to ask about delivery format.

### Total: ~2 lines of prompt text added + 1 word changed in category list

## Verification

1. `pnpm type-check` — типы не должны сломаться
2. `pnpm --filter @megacampus/course-gen-platform build` — билд
3. Создать тестовый курс и проверить, что нет вопросов про формат/доставку
