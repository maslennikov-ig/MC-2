# План: Исправление ошибки локализации в RestartConfirmDialog

## Проблема

В консоли браузера ошибка:

```
INVALID_MESSAGE: MALFORMED_ARGUMENT (Вы собираетесь перезапустить генерацию с этапа {{stageNumber}} ({{stageName}})...)
```

## Анализ кодовой базы

Проверены все компоненты на наличие аналогичной ошибки:

| Ключ перевода с плейсхолдерами         | Файл использования               | Статус                                  |
| -------------------------------------- | -------------------------------- | --------------------------------------- |
| `restart.confirmDescription`           | `RestartConfirmDialog.tsx:65-67` | **ОШИБКА** - использует `.replace()`    |
| `awaitingApproval.default.description` | `MissionControlBanner.tsx:137`   | ✓ Корректно - `t('...', { stageName })` |
| `mobile.stageProgress`                 | —                                | Не используется в коде                  |

**Вывод**: Найдена единственная проблема в `RestartConfirmDialog.tsx`.

## Причина

В файле `RestartConfirmDialog.tsx:65-67` используется неправильный подход:

```tsx
// НЕПРАВИЛЬНО:
{
  t('restart.confirmDescription')
    .replace('{{stageName}}', stageName)
    .replace('{{stageNumber}}', String(stageNumber));
}
```

Библиотека next-intl требует передавать параметры как второй аргумент функции `t()`.

## Решение

Заменить на правильный синтаксис:

```tsx
// ПРАВИЛЬНО:
{
  t('restart.confirmDescription', { stageName, stageNumber });
}
```

## Файлы для изменения

1. `packages/web/components/generation-graph/controls/RestartConfirmDialog.tsx` — строки 65-67

## Проверка

1. `pnpm type-check` — убедиться, что типы корректны
2. `pnpm build --filter=web` — убедиться, что сборка проходит
3. Открыть страницу генерации курса
4. Нажать на кнопку перезапуска этапа
5. Убедиться, что диалог показывает корректный текст без ошибок в консоли
