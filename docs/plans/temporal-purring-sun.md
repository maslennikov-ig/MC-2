# Plan: Improve Stage 4 Clarifying Questions Prompt

## Context

Тестеры жалуются, что уточняющие вопросы (Stage 4, Phase 0.5) бывают бессмысленными. Например: "Какие форматы обучения предпочтительны для команды?" с вариантами "видео, онлайн, оффлайн" — хотя платформа MegaCampus всегда создаёт онлайн-курсы с фиксированным форматом.

**Причина**: промпт не сообщает модели контекст платформы — модель не знает, что формат курсов фиксирован.

**Подход**: одна строка контекста. Категории и примеры не трогаем — доверяем модели.

## File to modify

`packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

- Function: `buildClarifyingPrompt()` (line 234)
- Only system prompt text. No schema/DB/frontend changes.

## Change (already applied)

Add 1 line after "Your task is to generate clarifying questions...":

```
PLATFORM: MegaCampus is an online course platform. Courses are always text-based lessons with optional enrichments (quiz, audio, video, presentation). The delivery format is fixed — do not ask about it.
```

Категории, примеры, правила — без изменений.

## Verification

1. `pnpm type-check` — проходит
2. Создать тестовый курс и проверить, что вопросы про формат доставки больше не появляются
