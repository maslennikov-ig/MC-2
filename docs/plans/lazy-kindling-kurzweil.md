# Plan: Remove Summary/Conclusion section from lesson generation

## Context

Курс "Как стать счастливым", модуль 5, урок 2 "Техники осознанного дыхания" — последние 3 секции повторяют контент секции 2. Расследование показало:

1. **Бюджетная модель** (`xiaomi/mimo-v2-flash`, tier=simple) не удерживает scope секций
2. **Секция "Заключение" — мёртвый код**: Stage 5 добавляет `Conclusion` → Stage 6 фильтрует → промпт просит `## Заключение` → LLM генерирует ~80 слов → парсер извлекает → `extractContentBody()` **выбрасывает** → фронтенд не отображает
3. **COURSE POSITION правила** инструктируют "write a standard lesson conclusion" для обычных уроков

Цель: убрать бесполезную генерацию Заключения, сэкономить ~80 слов word budget, упростить промпт.

## Changes

### 1. `packages/course-gen-platform/src/shared/prompts/stage6-prompts.ts`

**Single-call prompt (STRUCTURE)** — убрать пункт 3 (`## {{summaryHeader}}`), перенумеровать:

- Строка 370: удалить `3. ## {{summaryHeader}} — Bullet-point list...`
- Строка 386: `5. ## {{digestHeader}}` → `4. ## {{digestHeader}}`

**Single-call prompt (CRITICAL RULES)** — убрать правила conclusion:

- Строка 402: убрать "In summary: write ONLY short bullet-point takeaways..."
- Строка 404: "introductions and conclusions" → "introductions"
- Строки 407-409: убрать last_in_module, last_in_course, "For all other lessons" conclusion правила

**Single-call prompt (variables)** — убрать `summaryHeader` из списка переменных (строки 466-469)

**Serial generator prompt** — аналогичная чистка:

- Строка 164: убрать "In conclusion sections..."
- Строка 166: "introductions and conclusions" → "introductions"
- Строки 169-171: убрать conclusion правила

**sectionsWordBudget description** — убрать "summary" из описания (строка 486)

### 2. `packages/course-gen-platform/src/shared/prompts/prompt-contracts.ts`

- Строка 188: удалить `summaryHeader: string;` из интерфейса `SingleCallGeneratorVariables`

### 3. `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-single-call.ts`

- Строка 187: удалить `summaryHeader: labels.summary,` из вызова `renderPrompt`
- Строка 94: `targetWordCount - 300` → `targetWordCount - 200` (нет overhead на summary)
- Строка 151: обновить комментарий к фильтру conclusion (фильтр оставить как safety net)

### 4. `packages/course-gen-platform/src/stages/stage5-generation/phases/phase3-v2-spec-generator.ts`

- Строки 659-666: удалить always-added "Conclusion" секцию. Она всё равно фильтровалась в Stage 6.

### 5. `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/constants.ts`

- Строка 33: `['introduction', 'conclusion', 'exercises']` → `['introduction', 'exercises']`

### 6. `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/types.ts`

- Строка 162: `['introduction', 'conclusion']` → `['introduction']`

### 7. Tests

**`tests/unit/shared/prompts/prompt-contract-validation.test.ts`**:

- Строка 432: удалить `summaryHeader: key,`

**`tests/unit/stages/stage6-lesson-content/nodes/generator.test.ts`**:

- Строка 897: `sectionsWordBudget: '450'` → `'550'` (750 - 200)
- Строка 937: `sectionsWordBudget: '1950'` → `'2050'` (2250 - 200)
- Обновить комментарии на строках 892 и 932

## Files NOT changed (backward compat)

- `markdown-parser.ts` — оставить парсинг summary (для legacy контента)
- `judge-helpers.ts` — оставить fallback `parsedMarkdown.summary || ''`
- `content-utils.ts` — summary и так не рендерится
- `CONTENT_LABELS.summary` в shared-types — используется markdown-parser'ом и экспортом

## Verification

1. `pnpm type-check` — нет TS ошибок после удаления `summaryHeader`
2. `pnpm -F course-gen-platform test` — unit тесты проходят
3. `pnpm build` — полная сборка
4. Проверить что `labels.summary` из shared-types не сломан: `pnpm -F shared-types test`
