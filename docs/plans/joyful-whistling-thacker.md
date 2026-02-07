# Userback: автозаполнение email/имени + фикс CSP для шрифтов

## Задача 1: Автозаполнение email и имени

### Context

Виджет Userback показывает пустые поля "Ваше имя" и "Адрес эл. почты" даже для залогиненных пользователей.

### Root Cause

В `UserbackProvider.tsx` передаётся `user_data` (идентификация), но НЕ `email`/`name` (автозаполнение формы) — это два разных механизма в Userback SDK.

### Fix

**Файл:** `packages/web/components/feedback/UserbackProvider.tsx` (строки 29-41)

Добавить `email` и `name` в опции инициализации:

```ts
Userback(USERBACK_TOKEN, {
  email: user?.email || '',                          // ← ДОБАВИТЬ
  name: user?.user_metadata?.full_name || '',        // ← ДОБАВИТЬ
  user_data: user ? { ... } : undefined,             // без изменений
  widget_settings: { ... },                          // без изменений
})
```

---

## Задача 2: CSP — `font-src` блокирует шрифты Userback

### Context

Ошибка в консоли: `Loading the font 'https://static.userback.io/fonts/inter/...' violates "font-src 'self' https://fonts.gstatic.com"`.

### Root Cause

Виджет Userback загружает шрифт Inter с `static.userback.io`, но `font-src` разрешает только `'self'` и `fonts.gstatic.com`.

### Fix

**Файл:** `packages/web/next.config.ts` (строки 361, 377)

Добавить `https://static.userback.io` в `font-src` в обоих блоках (dev и prod):

```
// Было:
font-src 'self' https://fonts.gstatic.com;

// Стало:
font-src 'self' https://fonts.gstatic.com https://static.userback.io;
```

---

## Verification

1. `pnpm --filter @megacampus/web type-check` — типы
2. Открыть сайт → DevTools → Console — нет ошибок CSP для userback
3. Залогиненный пользователь → виджет Userback → поля email/имя предзаполнены
