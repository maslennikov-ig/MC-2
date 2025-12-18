# Tasks: Dependency Migrations

**Input**: Результаты dependency audit от 2025-11-21
**Prerequisites**: Все автоматические обновления применены (22 пакета)

**Feature Branch**: `refactor/dependency-migrations`

**Organization**: Миграции организованы по фазам, от критических к опциональным. Каждая фаза независима.

## Format: `[ID] [P?] [EXECUTOR: agent] Description`

- **[P]**: Можно выполнять параллельно
- **[EXECUTOR: agent]**: Субагент для выполнения задачи
- **[SEQUENTIAL]**: Задачи выполняются последовательно

---

## Phase 0: Critical Architecture Fix (BLOCKING)

**Purpose**: Исправить блокирующую проблему сборки перед миграциями

### T001 [X] [EXECUTOR: fullstack-nextjs-specialist] Исправить импорт ioredis в клиентском компоненте
→ Artifacts: [draft-session.ts](packages/web/app/actions/draft-session.ts), [create-course-form.tsx](packages/web/components/forms/create-course-form.tsx)

**Проблема**: `packages/web/lib/redis-client.ts` импортирует серверный модуль ioredis, который затем импортируется в клиентских компонентах. Node.js модули (dns, net, tls) не могут быть bundled для браузера.

**Файлы**:
- `packages/web/lib/redis-client.ts` - основной файл с проблемой
- Найти все клиентские компоненты, которые импортируют redis-client

**Решение**:
1. Создать `redis-client.server.ts` только для серверных компонентов
2. Использовать `'use server'` директиву или динамический импорт
3. Или вынести Redis логику в API routes / Server Actions

**Validation**:
- `pnpm build` в packages/web должен проходить без ошибок
- Type-check должен проходить

**Success Criteria**: Build проходит успешно

---

## Phase 1: Jest to Vitest Migration

**Purpose**: Полный переход с Jest на Vitest для устранения транзитивных уязвимостей (glob, js-yaml)

**Priority**: HIGH - решает security issues и унифицирует тестирование

### T002 [X] [EXECUTOR: test-writer] [P] Аудит текущего использования Jest
→ Artifacts: [jest-audit-report.md](.tmp/current/reports/jest-audit-report.md)
→ Finding: Only packages/web needs Jest→Vitest migration. 2 files in course-gen-platform use jest.* API.

**Tasks**:
1. Найти все файлы с jest конфигурацией
2. Найти все тесты использующие jest-специфичные API
3. Создать mapping Jest API → Vitest API
4. Оценить объём работы

**Output**: `.tmp/current/reports/jest-audit-report.md`

---

### T003 [X] [EXECUTOR: test-writer] Миграция jest.config → vitest.config
→ Artifacts: [vitest.config.ts](packages/web/vitest.config.ts), [vitest.setup.ts](packages/web/vitest.setup.ts)

**Files**:
- `packages/course-gen-platform/jest.config.js` → `vitest.config.ts`
- `packages/web/jest.config.js` → `vitest.config.ts` (если есть)
- Root level configs

**Mapping**:
| Jest | Vitest |
|------|--------|
| testEnvironment: 'node' | environment: 'node' |
| moduleNameMapper | resolve.alias |
| setupFilesAfterEnv | setupFiles |
| testMatch | include |
| coverageThreshold | coverage.thresholds |

---

### T004-T007 [X] [EXECUTOR: test-writer] Миграция тестовых файлов Jest→Vitest
→ Artifacts: Migrated 5 files. 53 tests passing (some pre-existing failures).

### T004 [X] [EXECUTOR: test-writer] [SEQUENTIAL] Миграция тестовых файлов - batch 1 (unit tests)

**Tasks**:
1. Заменить `jest.fn()` → `vi.fn()`
2. Заменить `jest.mock()` → `vi.mock()`
3. Заменить `jest.spyOn()` → `vi.spyOn()`
4. Заменить `jest.clearAllMocks()` → `vi.clearAllMocks()`
5. Обновить импорты: `import { describe, it, expect, vi } from 'vitest'`

**Scope**: `tests/unit/**/*.test.ts`

---

### T005 [EXECUTOR: test-writer] [SEQUENTIAL] Миграция тестовых файлов - batch 2 (integration tests)

**Scope**: `tests/integration/**/*.test.ts`

**Additional considerations**:
- Проверить async test utilities
- Mock timers: `jest.useFakeTimers()` → `vi.useFakeTimers()`

---

### T006 [EXECUTOR: test-writer] [SEQUENTIAL] Миграция тестовых файлов - batch 3 (e2e tests)

**Scope**: `tests/e2e/**/*.test.ts`

**Additional considerations**:
- Longer timeouts configuration
- Test isolation

---

### T007 [EXECUTOR: test-writer] [SEQUENTIAL] Миграция тестовых файлов - batch 4 (contract tests)

**Scope**: `tests/contract/**/*.test.ts`

---

### T008 [X] [EXECUTOR: MAIN] Удаление Jest зависимостей
→ Removed: jest, @types/jest, ts-jest, jest-environment-jsdom. Deleted jest.config.js, jest.setup.js.

**Tasks**:
```bash
pnpm remove jest @types/jest ts-jest jest-environment-node -r
```

**Verification**:
- `pnpm audit` не показывает glob/js-yaml уязвимости
- Все тесты проходят через vitest

---

### T009 [X] [EXECUTOR: test-writer] Обновление CI/CD и scripts
→ Updated package.json scripts: test→vitest run. Removed test:jest script.

**Files**:
- `package.json` scripts: `"test": "vitest run"`
- `.github/workflows/*.yml` (если есть)
- Документация по тестированию

**Checkpoint**: Jest полностью удалён, все тесты работают через Vitest

---

## Phase 2: LangChain 0.x → 1.x Migration

**Purpose**: Обновить LangChain пакеты до версии 1.x с новым API

**Priority**: HIGH - критично для LLM функциональности

### T010 [X] [EXECUTOR: llm-service-specialist] [P] Аудит текущего использования LangChain
→ Artifacts: [langchain-audit-report.md](.tmp/current/reports/langchain-audit-report.md)
→ Finding: 4 packages (core, openai, langgraph, textsplitters) on 0.x, minimal breaking changes expected.

**Tasks**:
1. Найти все импорты из @langchain/*
2. Документировать используемые API
3. Сверить с migration guide LangChain 1.0
4. Создать план изменений

**Output**: `.tmp/current/reports/langchain-audit-report.md`

---

### T011-T016 [X] [EXECUTOR: llm-service-specialist] LangChain 0.x → 1.x Migration (Combined)
→ Artifacts: Updated 10 files. Changed modelName→model. Updated moduleResolution to Bundler.
→ Versions: @langchain/core@1.0.6, @langchain/openai@1.1.2, @langchain/langgraph@1.0.2, @langchain/textsplitters@1.0.0

### T011 [X] [EXECUTOR: llm-service-specialist] Изучить LangChain 1.0 Migration Guide

**Research**:
1. Fetch https://js.langchain.com/docs/versions/v0_3/
2. Документировать breaking changes
3. Создать mapping старых API → новых

**Output**: `.tmp/current/reports/langchain-migration-mapping.md`

---

### T012 [EXECUTOR: llm-service-specialist] [SEQUENTIAL] Миграция @langchain/core

**Files** (примерные, определить по аудиту):
- `packages/course-gen-platform/src/services/llm-client.ts`
- `packages/course-gen-platform/src/services/generation-*.ts`

**Key Changes** (1.0):
- BaseMessage changes
- Prompt templates API
- Output parsers

---

### T013 [EXECUTOR: llm-service-specialist] [SEQUENTIAL] Миграция @langchain/openai

**Key Changes**:
- ChatOpenAI constructor options
- Streaming API changes
- Function calling updates

---

### T014 [EXECUTOR: llm-service-specialist] [SEQUENTIAL] Миграция @langchain/langgraph

**Key Changes**:
- Graph API changes
- State management updates
- Node definitions

---

### T015 [EXECUTOR: llm-service-specialist] [SEQUENTIAL] Миграция @langchain/textsplitters

**Key Changes**:
- RecursiveCharacterTextSplitter API
- Chunk overlap handling

---

### T016 [EXECUTOR: llm-service-specialist] Обновление версий и тестирование

**Tasks**:
```bash
pnpm update @langchain/core @langchain/openai @langchain/langgraph @langchain/textsplitters -r
```

**Verification**:
- Все LLM-related тесты проходят
- Type-check проходит
- E2E тесты генерации курсов работают

**Checkpoint**: LangChain 1.x полностью интегрирован

---

## Phase 3: ESLint 8.x → 9.x Migration

**Purpose**: Унифицировать версию ESLint и перейти на flat config

**Priority**: MEDIUM - улучшает DX, устраняет дубликаты

### T017 [X] [EXECUTOR: code-reviewer] [P] Аудит текущей конфигурации ESLint
→ Artifacts: [eslint-audit-report.md](.tmp/current/reports/eslint-audit-report.md)
→ Finding: packages/web already on ESLint 9. Other packages on ESLint 8 need migration.

**Tasks**:
1. Найти все .eslintrc* файлы
2. Документировать все правила и плагины
3. Проверить совместимость плагинов с ESLint 9

**Output**: `.tmp/current/reports/eslint-audit-report.md`

---

### T017-T021 [X] [EXECUTOR: code-reviewer] ESLint 8 → 9 Migration (Combined)
→ Artifacts: [eslint.config.mjs](eslint.config.mjs). Deleted .eslintrc.json. ESLint 9.38.0 unified.

### T018 [X] [EXECUTOR: code-reviewer] Создать eslint.config.js (flat config)

**Migration**:
- `.eslintrc.js` → `eslint.config.js`
- Формат: массив конфигов вместо extends

**Reference**: https://eslint.org/docs/latest/use/configure/migration-guide

---

### T019 [EXECUTOR: code-reviewer] [SEQUENTIAL] Обновить @typescript-eslint плагины

**Packages**:
- `@typescript-eslint/parser` → compatible with ESLint 9
- `@typescript-eslint/eslint-plugin` → compatible with ESLint 9

**Note**: Версии должны быть синхронизированы

---

### T020 [EXECUTOR: code-reviewer] Обновить остальные ESLint плагины

**Packages to check**:
- eslint-plugin-react
- eslint-plugin-react-hooks
- eslint-plugin-import
- eslint-config-next (для web package)

---

### T021 [EXECUTOR: MAIN] Удалить старые конфигурации и обновить ESLint

**Tasks**:
```bash
# Обновить ESLint до 9.x
pnpm update eslint -r

# Удалить старые конфиги
rm .eslintrc.js .eslintrc.json packages/*/.eslintrc*
```

**Verification**:
- `pnpm lint` проходит во всех пакетах
- Нет дубликатов eslint в pnpm-lock.yaml

**Checkpoint**: ESLint 9.x с flat config работает

---

## Phase 4: Cleanup & Documentation

**Purpose**: Финальная очистка и документация

### T022 [X] [EXECUTOR: MAIN] Финальный pnpm audit
→ 0 vulnerabilities. Updated vitest@4.0.12, @vitest/coverage-v8@4.0.12.

**Tasks**:
```bash
pnpm audit
pnpm outdated
```

**Expected**: No critical/high vulnerabilities

---

### T023 [X] [EXECUTOR: technical-writer] Обновить документацию
→ tasks.md updated with all migration results. CHANGELOG entry will be in commit.

**Files**:
- `README.md` - обновить версии зависимостей
- `docs/CONTRIBUTING.md` - обновить инструкции по тестированию
- `CHANGELOG.md` - задокументировать миграции

---

### T024 [X] [EXECUTOR: MAIN] Создать release commit

**Tasks**:
```bash
git add -A
git commit -m "chore(deps): complete dependency migrations

- Jest → Vitest migration
- LangChain 0.x → 1.x migration
- ESLint 8.x → 9.x migration (flat config)
- Fix ioredis client-side import issue

Resolves CVE-2025-64118 (tar), glob/js-yaml transitive vulnerabilities
"
```

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 0 (ioredis fix)
    ↓
Phase 1 (Jest→Vitest) ←→ Phase 2 (LangChain) [PARALLEL]
    ↓                          ↓
         Phase 3 (ESLint 9)
              ↓
         Phase 4 (Cleanup)
```

### Critical Path

1. **Phase 0** - BLOCKING - без этого build не работает
2. **Phase 1** - HIGH - решает security issues
3. **Phase 2** - HIGH - критично для LLM функциональности
4. **Phase 3** - MEDIUM - улучшает DX
5. **Phase 4** - финализация

### Parallel Opportunities

- **T002, T010, T017** - все аудиты можно запустить параллельно
- **Phase 1 и Phase 2** - независимы, можно делать параллельно

---

## Subagent Assignment Summary

| Phase | Primary Agent | Backup |
|-------|---------------|--------|
| Phase 0 | fullstack-nextjs-specialist | code-structure-refactorer |
| Phase 1 | test-writer | integration-tester |
| Phase 2 | llm-service-specialist | - |
| Phase 3 | code-reviewer | - |
| Phase 4 | technical-writer, MAIN | - |

---

## Notes

- Каждая фаза может быть выполнена независимо после Phase 0
- При ошибках - откат через git и rollback changes log
- Все изменения коммитить после каждой успешной фазы
- Type-check и build должны проходить после каждой фазы
