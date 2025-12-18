# Задача: Исправить ошибку импорта fixtures в E2E тесте T053

## Описание проблемы

E2E тест `tests/e2e/t053-synergy-sales-course.test.ts` падает с ошибкой:

```
TypeError: __vite_ssr_import_6__.TEST_USERS.find is not a function
❯ tests/e2e/t053-synergy-sales-course.test.ts:415:33
    413|     const supabase = getSupabaseAdmin();
    414|     const testOrg = TEST_ORGS[0];
    415|     const testUser = TEST_USERS.find(u => u.organizationId === testOrg.id)!;
        |                                 ^
```

## Контекст

1. **Текущее состояние:**
   - Ветка: `008-generation-generation-json`
   - Релиз: v0.17.1 (успешно создан и опубликован)
   - Критические баги исправлены: Phase 6 JSON parsing, Redis offline queue, Docling health checks

2. **Предыдущая работа в этой сессии:**
   - Исправили неразрывный пробел в имени файла `Модуль 1_Продажа_билетов...pdf`
   - Все 4 тестовых файла теперь найдены: ✅
   - Тест запустился, но упал на импорте fixtures

3. **Симптомы:**
   - `TEST_USERS.find is not a function` означает, что `TEST_USERS` либо:
     - Не является массивом
     - Импортируется неправильно
     - Имеет другую структуру после rebase

## Предположение о причине

Похоже, что проблема связана с **несовместимостью версий теста после git rebase**. Возможно:
- Fixtures изменились в remote branch
- Импорты обновились, но тест использует старый формат
- Vitest кэш содержит старую версию fixtures

**ВАЖНО:** Пользователь упомянул, что мы, вероятно, уже сталкивались с подобной проблемой в документации.

## Что нужно сделать

### Шаг 1: Поиск в документации
- [ ] Поискать в `docs/` информацию о проблемах с fixtures в E2E тестах
- [ ] Поискать упоминания `TEST_USERS.find is not a function`
- [ ] Проверить investigation reports на похожие ошибки
- [ ] Проверить README или troubleshooting guides для E2E тестов

### Шаг 2: Диагностика импортов
- [ ] Прочитать `tests/fixtures/index.ts` (или аналогичный файл)
- [ ] Проверить экспорт `TEST_USERS` и `TEST_ORGS`
- [ ] Убедиться, что это массивы, а не объекты
- [ ] Проверить, изменился ли формат после rebase

### Шаг 3: Проверка версий
- [ ] Сравнить текущую версию теста с remote branch
- [ ] Проверить, есть ли breaking changes в fixtures
- [ ] Проверить git log для fixtures файла

### Шаг 4: Исправление
- [ ] Применить найденное решение из документации ИЛИ
- [ ] Обновить импорты в соответствии с новой структурой ИЛИ
- [ ] Исправить exports в fixtures файле

### Шаг 5: Валидация
- [ ] Очистить vitest кэш: `rm -rf packages/course-gen-platform/node_modules/.vite`
- [ ] Запустить тест: `pnpm --filter course-gen-platform test tests/e2e/t053-synergy-sales-course.test.ts`
- [ ] Убедиться, что Scenario 2 запускается без ошибок

## Файлы для проверки

1. **Тест:** `packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts` (строка 415)
2. **Fixtures:** `packages/course-gen-platform/tests/fixtures/index.ts` (вероятное расположение)
3. **Документация:**
   - `docs/investigations/`
   - `docs/test/`
   - `README.md` в tests/
   - Любые troubleshooting guides

## Ожидаемый результат

После исправления тест должен:
- ✅ Найти все 4 файла (уже работает)
- ✅ Импортировать fixtures корректно
- ✅ Запустить Scenario 2: Full Analyze + Style
- ✅ Пройти без ошибок импорта

## Дополнительная информация

**Текущая ошибка (полный вывод):**
```
FAIL tests/e2e/t053-synergy-sales-course.test.ts > T053: Stage 5 Generation - Synergy Sales Course E2E > Scenario 2: Full Analyze Results + Style (US2)
TypeError: __vite_ssr_import_6__.TEST_USERS.find is not a function
 ❯ tests/e2e/t053-synergy-sales-course.test.ts:415:33
```

**Git rebase info:**
- Последний rebase: успешно выполнен (6/6 commits rebased)
- Новые коммиты в remote были подтянуты
- Возможно, fixtures обновились в remote branch

**Vitest cache:**
- Кэш очищен: `rm -rf packages/course-gen-platform/node_modules/.vite`
- Проблема осталась после очистки кэша

## Следующие шаги

**НАЧАТЬ С ПОИСКА В ДОКУМЕНТАЦИИ** - пользователь уверен, что мы уже сталкивались с этим.

Паттерны для поиска:
- `TEST_USERS.find`
- `fixtures error`
- `is not a function`
- `E2E test import`
- `vitest import error`
