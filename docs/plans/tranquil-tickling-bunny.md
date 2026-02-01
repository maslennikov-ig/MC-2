# Plan: Task Cleanup Session

## Completed

1. ✅ Отложены LanguageTool задачи на 3 месяца (8 задач)
2. ✅ Отложена mc2-wb5p (Leaked Password Protection) — бесплатный Supabase
3. ✅ Обновлён SKILL.md с документацией про defer

## Next Action

Закрыть mc2-npu (WebSocket/SSE) как won't fix:

```bash
bd close mc2-npu --reason="Won't fix: Polling работает хорошо (2 сек не критично для генерации которая идёт минуты). ROI низкий — много работы, мало пользы для UX."
```

## Then: Choose Next Task

После закрытия — выбрать следующую задачу из списка:

| Приоритет | ID | Тип | Описание |
|-----------|-----|-----|----------|
| P3 | mc2-ec3f | bug | 200 usages of `any` type |
| P3 | mc2-8uyu | bug | 63 `@ts-expect-error` |
| P3 | mc2-imib | bug | 38 TODO comments |
| P3 | mc2-3nbi | bug | Console statements |
| P4 | mc2-gcat | task | Исследование поля answers |
| P4 | mc2-v90d | bug | Fast Refresh баг |
| P4 | mc2-rin6 | bug | Duplicate test files |
