# Plan: Audit Remediation — Remaining 5% (Follow-up Tasks)

## Context

Из 16 задач аудита все закрыты, но 4 задачи имеют незавершённые scope items. Это финальные follow-up задачи для полного закрытия аудита.

---

## Task A — Update lucide-react to latest (2 мин)

**Из плана**: Task 13, пункт lucide-react 0.554→0.563
**Текущее состояние**: `^0.554.0` в package.json (caret range, но lockfile зафиксирован на 0.554)

**Действия**:
1. `pnpm --filter @megacampus/web update lucide-react`
2. Проверить `pnpm --filter @megacampus/web type-check`

**Файлы**: `packages/web/package.json`, `pnpm-lock.yaml`

---

## Task B — Add @next/bundle-analyzer (5 мин)

**Из плана**: Task 14, пункт 3 — настроить bundle-analyzer для on-demand анализа
**Текущее состояние**: Не установлен

**Действия**:
1. `pnpm --filter @megacampus/web add -D @next/bundle-analyzer`
2. Добавить в `next.config.ts`:
   ```ts
   const withBundleAnalyzer = require('@next/bundle-analyzer')({
     enabled: process.env.ANALYZE === 'true',
   })
   ```
3. Обернуть экспорт: `module.exports = withNextIntl(withPWA(withBundleAnalyzer(nextConfig)))`
4. Добавить npm script: `"analyze": "ANALYZE=true pnpm build"`
5. Type-check

**Файлы**: `packages/web/package.json`, `packages/web/next.config.ts`

---

## Task C — Reduce deviceSizes (2 мин)

**Из плана**: Task 14, пункт 4 — уменьшить deviceSizes с 8 до 5
**Текущее**: `[640, 750, 828, 1080, 1200, 1920, 2048, 3840]` (8 шт)

**Действия**:
1. Убрать 3 редко используемых размера: `750` (близок к 640/828), `2048` (близок к 1920), `3840` (ultra-wide, ~0.1% трафика)
2. Результат: `[640, 828, 1080, 1200, 1920]` (5 шт)
3. Это уменьшает количество вариантов изображений, ускоряет first-load

**Файл**: `packages/web/next.config.ts`

---

## Task D — Pre-commit hook: блокировать @ts-ignore (5 мин)

**Из плана**: Task 16, пункт 3 — pre-commit hook против новых @ts-ignore
**Текущее**: Husky v9.1.7 установлен, lint-staged работает. 0 `@ts-ignore` в коде (все уже очищены).

**Действия**:
1. Добавить в lint-staged конфиг для `*.{ts,tsx}` скрипт-проверку:
   ```json
   "*.{ts,tsx}": [
     "bash -c 'grep -rn @ts-ignore $0 && echo \"ERROR: @ts-ignore is banned. Use @ts-expect-error instead.\" && exit 1 || true'",
     "eslint --fix",
     "prettier --write"
   ]
   ```
   Или проще — добавить ESLint правило `@typescript-eslint/ban-ts-comment` с `"error"` для `ts-ignore` в `eslint.config.mjs`.

**Рекомендация**: Использовать ESLint правило (уже в lint-staged pipeline) — надёжнее и понятнее:
```js
'@typescript-eslint/ban-ts-comment': ['error', {
  'ts-ignore': true,        // Ban @ts-ignore
  'ts-expect-error': 'allow-with-description',  // Allow @ts-expect-error with reason
  'ts-nocheck': true,       // Ban @ts-nocheck
}],
```

**Файл**: `eslint.config.mjs`

---

## Task E — ESLint: promote critical warn→error (10 мин)

**Из плана**: Task 9, фаза 2 — промоутить ESLint warn→error
**Текущее**: 16 правил на warn, 36 нарушений `no-explicit-any` в 19 файлах

**Стратегия**: Промоутить поэтапно — сначала правила с 0 нарушениями, потом критические.

**Фаза 1** — Правила с 0 нарушений (безопасное промоутирование):
- `no-floating-promises` → `error` (0 нарушений, критично для Node.js)
- `require-await` → `error`
- `no-base-to-string` → `error`

**Фаза 2** — Оценить и решить для каждого:
- `no-explicit-any` (36 шт) — оставить `warn`, создать отдельную задачу на постепенное исправление
- `no-unsafe-*` (assignment, member-access, call, return, argument) — оставить `warn`
- `restrict-template-expressions` — оставить `warn`
- `max-lines`, `max-lines-per-function`, `complexity` — оставить `warn` (code style, не безопасность)
- `no-case-declarations`, `no-useless-escape` — проверить количество нарушений, промоутить если 0

**Файл**: `eslint.config.mjs`

---

## Порядок выполнения

```
Task A (lucide-react) ──┐
Task B (bundle-analyzer)──┤── параллельно, независимые
Task C (deviceSizes)   ──┤
Task D (ts-ignore hook)──┤
Task E (ESLint promote)──┘
```

Все 5 задач независимы, можно выполнить за один коммит.

## Верификация

1. `pnpm --filter @megacampus/web type-check` — после всех изменений
2. `pnpm --filter @megacampus/web build` — проверить bundle-analyzer интеграцию
3. `echo "// @ts-ignore" > /tmp/test.ts && pnpm eslint /tmp/test.ts` — проверить ban-ts-comment
4. `git diff --stat` — убедиться что только ожидаемые файлы изменены
