# Fix: CI/CD Pipeline Failing on Type Check

## Context

Все 10 последних CI/CD запусков на `develop` падают на этапе **Type Check**. Причина — после миграции tRPC (коммит `ec8c8b6e`) пакет `packages/web` начал импортировать тип `AppRouter` из `@megacampus/course-gen-platform/app-router`. Этот экспорт указывает на `dist/server/app-router.d.ts` — файл, который существует только после сборки `course-gen-platform`.

В CI-воркфлоу job `type-check` собирает только `shared-types` и `shared-logger`, но **не собирает `course-gen-platform`**. Все остальные jobs (unit tests, contract tests, integration tests, build) уже имеют эту сборку.

## Root Cause

`.github/workflows/ci-cd.yml`, строки 162-168:

```yaml
- name: Build shared packages
  run: |
    pnpm --filter @megacampus/shared-types build
    pnpm --filter @megacampus/shared-logger build

- name: Run type check # <-- course-gen-platform NOT built!
  run: pnpm type-check
```

При этом `packages/web/lib/trpc/react.ts` и `server-caller.ts` импортируют:

```typescript
import type { AppRouter } from '@megacampus/course-gen-platform/app-router';
```

А в `package.json` этот export указывает на build-артефакт:

```json
"./app-router": { "types": "./dist/server/app-router.d.ts" }
```

Без сборки `dist/` не существует -> TS2307 -> каскад ~100 ошибок типов.

## Fix

### Шаг 1: Добавить сборку `course-gen-platform` перед type-check

**Файл:** `.github/workflows/ci-cd.yml`

Строки 162-165, изменить:

```yaml
# БЫЛО:
- name: Build shared packages
  run: |
    pnpm --filter @megacampus/shared-types build
    pnpm --filter @megacampus/shared-logger build

# СТАЛО:
- name: Build shared packages
  run: |
    pnpm --filter @megacampus/shared-types build
    pnpm --filter @megacampus/shared-logger build
    pnpm --filter @megacampus/course-gen-platform build
```

Это единственное изменение. Одна строка.

## Why It Works Locally

Локально `dist/` уже существует от предыдущих сборок. В CI workspace чистый — `dist/` нет.

## Verification

1. Закоммитить и запушить изменение
2. Проверить: `gh run watch` — CI должен пройти type-check
3. Убедиться что build и deploy jobs тоже отработают

## Files to Modify

- `.github/workflows/ci-cd.yml` (строка ~164) — добавить 1 строку
