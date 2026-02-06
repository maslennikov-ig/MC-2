# Fix: Userback CSP Errors

## Context

При открытии главной страницы на dev-окружении в консоли браузера появляются ошибки CSP:

1. **`style-src`** блокирует `https://static.userback.io/widget/v1.css` — виджет Userback загружает свой CSS с `static.userback.io`, но этот домен указан только в `script-src`, а не в `style-src`
2. **`connect-src`** блокирует `https://static.userback.io/widget/widget.min.js.map` — source map загружается через `connect-src`, но там указан только `api.userback.io`, а не `static.userback.io`

## Root Cause

В CSP-конфигурации (`packages/web/next.config.ts`, строки 354-388) домен `https://static.userback.io` добавлен в `script-src`, но пропущен в `style-src` и `connect-src`. Виджет Userback помимо JS-скриптов также загружает CSS-стили и source maps с `static.userback.io`.

## Fix

**Файл:** `packages/web/next.config.ts`

### Изменение 1: `style-src` (строки 360, 376)

Добавить `https://static.userback.io` в `style-src` в обоих блоках (dev и prod):

```
// Было:
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;

// Стало:
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://static.userback.io;
```

### Изменение 2: `connect-src` (строки 364, 380)

Добавить `https://static.userback.io` в `connect-src` в обоих блоках (dev и prod):

```
// Было (prod):
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://flow8n.ru https://drive.google.com https://api.userback.io wss://api.userback.io;

// Стало (prod):
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://flow8n.ru https://drive.google.com https://static.userback.io https://api.userback.io wss://api.userback.io;
```

Аналогично для dev-блока.

## Verification

1. `pnpm --filter @megacampus/web build` — проверить что билд проходит
2. Открыть страницу в браузере → DevTools → Console — ошибок CSP для userback быть не должно
