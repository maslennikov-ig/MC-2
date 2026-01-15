# MegaCampus Course Generator - Project Context

> **ВАЖНО**: Этот файл содержит инструкции для AI-агента. Следуй им строго.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.x strict mode
- **Backend**: tRPC + BullMQ workers
- **Database**: Supabase (PostgreSQL + Realtime)
- **Monorepo**: pnpm workspaces
- **Packages**: `packages/web`, `packages/course-gen-platform`, `packages/shared-types`

## Issue Tracking with Beads

Этот проект использует **Beads (bd)** для трекинга задач. Hooks автоматически инжектируют контекст при старте сессии через `bd prime`.

### Основные команды

```bash
bd prime                              # Полный workflow контекст
bd ready                              # Задачи без блокеров (готовые к работе)
bd show <id>                          # Детали задачи (например: bd show mc2-o38)
bd update <id> --status=in_progress   # Взять задачу в работу
bd close <id> --reason="..."          # Закрыть задачу
bd sync                               # Синхронизация с git
```

### Workflow

```
bd ready → bd update --status=in_progress → работа → bd close → git commit → git push
```

## Code Standards

- **Type-check + build** должны проходить перед коммитом
- Используй `pnpm type-check` и `pnpm build` для проверки
- Нет hardcoded credentials
- Используй Zod для валидации схем
- Prefer async/await over callbacks

## Project Structure

```
packages/
├── web/                    # Next.js frontend
├── course-gen-platform/    # Backend: tRPC, BullMQ workers, LLM services
└── shared-types/           # Shared TypeScript types and Zod schemas
```

## Single Source of Truth

НИКОГДА не дублируй типы — всегда импортируй из `@megacampus/shared-types`:

| Type             | File                                   |
| ---------------- | -------------------------------------- |
| Database types   | `shared-types/src/database.types.ts`   |
| Analysis schemas | `shared-types/src/analysis-schemas.ts` |
| Common enums     | `shared-types/src/common-enums.ts`     |

## Branches & Deployment

| Branch    | Environment | URL                          |
| --------- | ----------- | ---------------------------- |
| `develop` | Dev         | https://dev.ai.megacampus.ru |
| `master`  | Staging     | https://ai.megacampus.ru     |

- Работаем на `develop`
- `git push` → автодеплой на Dev
- Merge в `master` → автодеплой на Staging

## Session Close Protocol

Перед завершением работы:

```bash
git status                    # Проверить изменения
git add <files>               # Добавить файлы
git commit -m "..."           # Закоммитить
git push                      # Запушить
bd close <id> --reason="..."  # Закрыть задачу в Beads
```

## Common Commands

```bash
pnpm type-check               # Проверка TypeScript
pnpm build                    # Сборка всех пакетов
pnpm test                     # Запуск тестов
pnpm dev                      # Запуск dev сервера
```
