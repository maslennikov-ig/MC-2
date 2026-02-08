# Plan: Консолидация дублированных unit-тестов

## Проблема

В `packages/course-gen-platform` unit-тесты хранятся в **двух местах**:
- `tests/unit/` — отдельная директория (56 файлов, ~26K строк)
- `src/**/__tests__/` — co-located рядом с исходниками (83 файла, ~42K строк)

**42 файла дублируются** по имени между этими двумя локациями.
Из них только **3 идентичны**, а **39 разошлись** по содержанию (правки вносились независимо в оба места).

### Влияние
- Разработчик не знает, какой файл редактировать — правки теряются
- До исправления (mc2-u6ro) `vitest.config.unit.ts` включал оба паттерна, и все 42 дубля запускались **дважды**
- Текущий workaround: `vitest.config.unit.ts` включает только `tests/unit/`, но **39 уникальных тестов** из `src/__tests__/` не запускаются unit-конфигом

## Статистика

| Категория | Файлов | Строк |
|-----------|--------|-------|
| `tests/unit/` ONLY | 14 | ~5K |
| `src/__tests__/` ONLY | 39 | ~20K |
| Дублированные | 42 | ~43K (суммарно обе копии) |
| **Итого** | 95 уникальных | ~68K |

### Уникальные файлы в tests/unit/ (14)
```
auth-middleware.test.ts
authorize-middleware.test.ts
block-regeneration-handler.test.ts
concurrency-limiter.test.ts
course-structure-editor.test.ts
generation-progress.schema.test.ts
init.test.ts
jina-reranker-client.test.ts
llm-client.test.ts
orchestrator-error-handling.test.ts
pipeline-errors.test.ts
redis-retry-strategy.test.ts
stage7-retry.test.ts
trpc-context.test.ts
```

### Уникальные файлы в src/__tests__/ (39)
```
analysis-formatters.test.ts        markdown-structure-filter.test.ts
arbiter.test.ts                    metadata-generator.test.ts
audio-prompt.test.ts               minimum-lessons-validation.test.ts
authorize.test.ts                  minimum-lessons-validator.test.ts
backward-compat.test.ts            partial-regenerator.test.ts
best-effort-selector.test.ts       patcher.test.ts
classifier.test.ts                 phase-1-classifier.test.ts
client.test.ts                     phase-5-assembly.test.ts
course-structure-editor-move.test.ts  qdrant-search.test.ts
duration-validator.test.ts         quality-validator.test.ts
dynamic-context-window.test.ts     quota-enforcer.test.ts
field-name-fix.test.ts             qwen3-section-generation.test.ts
iteration-controller.test.ts       revision-chain.test.ts
json-repair.test.ts                router.test.ts
lesson-context.test.ts             sanitize-course-structure.test.ts
lifecycle.test.ts                  self-reviewer-cjk.test.ts
markdown-converter.test.ts         structure-extractor.test.ts
target-resolver.test.ts            token-estimator.test.ts
tournament-classification.test.ts  trpc.test.ts
verifier.test.ts
```

### Дублированные файлы (42, из них 39 разошлись)
```
adapter.test.ts               packager.test.ts
api-key-service.test.ts       permission-errors.test.ts
auth.test.ts                  phase-2-scope.test.ts
auto-classification*.test.ts  phase-3-expert.test.ts
build-minimal-lesson-spec.test.ts  phase-4-synthesis.test.ts
chapter.test.ts               placeholder-validator.test.ts
config.test.ts                policies.test.ts
content-validation.test.ts    poller.test.ts
context-assembler.test.ts     research-flag-detector.test.ts
context-overflow-handler.test.ts  semantic-diff-generator.test.ts
contextual-language.test.ts   sequential.test.ts
cost-calculator.test.ts       size-validation.test.ts
course.test.ts                smart-context-router.test.ts
dependency-graph-builder.test.ts  timeouts.test.ts
generate-on-demand.test.ts    translator.test.ts
generator.test.ts             transliterate.test.ts
get-generation-status.test.ts url-name-registry.test.ts
history.test.ts               validators.test.ts
html.test.ts                  vertical.test.ts
messages.test.ts              xml-escape.test.ts
```

## Решение: единый каноничный путь `tests/unit/`

### Выбор в пользу `tests/unit/`
1. Чёткое разделение: `tests/unit/`, `tests/integration/`, `tests/contract/`, `tests/e2e/`
2. Не загромождает `src/` тестовыми файлами
3. Уже используется в `vitest.config.unit.ts`
4. Легче настраивать include/exclude в vitest

### Шаги

#### Phase 1: Merge 42 дублей (выбрать лучшую версию)
Для каждого из 42 дублированных файлов:
1. Сравнить `tests/unit/X.test.ts` и `src/.../X.test.ts`
2. Выбрать версию с **большим покрытием** (больше тестов, актуальнее)
3. Скопировать лучшую версию в `tests/unit/` (с правильным путём)
4. Удалить `src/__tests__/` копию

Для 3 идентичных — просто удалить `src/__tests__/` копию.

#### Phase 2: Переместить 39 уникальных из src/__tests__/
Для каждого файла из `src/**/__tests__/`, не имеющего пары в `tests/unit/`:
1. Определить правильную поддиректорию в `tests/unit/` (по модулю)
2. Переместить файл
3. Обновить импорты если нужно (алиас `@/` должен работать из обоих мест)

#### Phase 3: Запретить `src/__tests__/` для новых тестов
1. Добавить eslint rule или `.gitignore` pattern
2. Обновить CONTRIBUTING.md / README

#### Phase 4: Верификация
1. `pnpm --filter course-gen-platform test` — все unit тесты проходят
2. `pnpm type-check` — без ошибок
3. Количество тестов >= количества до миграции

## Риски
- **Разошедшиеся версии**: 39 файлов эволюционировали независимо. Нужно ручное слияние для каждого.
- **Импорты**: если тесты в `src/__tests__/` используют относительные импорты `../`, нужно заменить на `@/`
- **Время**: ~42 файла ручного diff + merge. Оценка: 2-4 часа.

## Acceptance Criteria
- [ ] Все тесты из `src/**/__tests__/` перенесены в `tests/unit/`
- [ ] Директории `src/**/__tests__/` удалены
- [ ] `vitest.config.unit.ts` include = `['tests/unit/**/*.test.ts']`
- [ ] `pnpm test` проходит без ошибок
- [ ] Количество уникальных тестов >= 95 (текущее total)
