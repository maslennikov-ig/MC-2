# План: Настройка eslint лимитов для функций

## Контекст

После коммита media UX stability fixes, lint-staged показывает warnings на `max-lines-per-function` (лимит 150) и `complexity` (лимит 20) в root eslint config. Пакет `web` имеет свой eslint config без этих правил — при `pnpm --filter web lint` warnings нет. Но lint-staged использует root config, поэтому warnings блокируют commit.

Пользователь просит повысить лимит до разумного значения вместо рефакторинга.

## Текущие лимиты (root `eslint.config.mjs`)

| Правило                  | Основной код | Тесты        |
| ------------------------ | ------------ | ------------ |
| `max-lines-per-function` | 150 (warn)   | 200 (warn)   |
| `max-lines`              | 500 (warn)   | 1500 (error) |
| `complexity`             | 20 (warn)    | 30 (warn)    |

## Реальные размеры проблемных функций

| Функция                   | Строк         | Complexity |
| ------------------------- | ------------- | ---------- |
| `useEnrichmentGeneration` | 386           | ~15        |
| `CourseViewerEnhanced`    | 377           | 28         |
| `LessonView`              | 272           | ~10        |
| `EnrichmentsPanel`        | 262           | ~15        |
| Тест describe блоки       | 822, 295, 262 | N/A        |

## Изменение

**Файл:** `eslint.config.mjs` (строки 63-65, 94-96)

### Основной код (строка 64):

```
max-lines-per-function: 150 → 400
```

- 400 покрывает все текущие функции (макс 386)
- Оставляет запас ~15% для роста
- Всё ещё ловит monster-функции (>400 строк)

### Тесты (строка 95):

```
max-lines-per-function: 200 → 1000
```

- 1000 покрывает самые большие describe-блоки (822)
- Тесты по природе длинные — много setup/assert/cleanup

### Complexity (строка 65):

```
complexity: 20 → 30
```

- 30 покрывает CourseViewerEnhanced (28)
- В тестах уже 30

### Также: добавить `no-unsafe-return: 'off'` для тестов (строка ~85):

```
'@typescript-eslint/no-unsafe-return': 'off',
```

- Для mock factory returns — стандартный подход

## Верификация

```bash
# Проверить что lint-staged проходит:
git add eslint.config.mjs
git stash push -m "test-commit" -- eslint.config.mjs
# Или просто: пересоздать коммит с обновлённым конфигом
pnpm --filter web type-check && pnpm --filter web build
```
