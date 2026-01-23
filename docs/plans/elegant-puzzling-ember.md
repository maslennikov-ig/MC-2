# План: Исправление CSP ошибки для enrichment генерации

## Проблема

На staging сервере (ai.megacampus.ru) генерация обложек уроков не работает из-за CSP ошибки:

```
Connecting to 'http://localhost:3456/trpc/enrichment.generateOnDemand' violates CSP
```

## Справка: Next.js Environment Variables

> **NEXT*PUBLIC*** переменные инлайнятся в JavaScript bundle во время `next build`.
> Они **не доступны** на клиенте если не были установлены при сборке.
> [Документация Next.js](https://nextjs.org/docs/app/guides/environment-variables)

```typescript
// Это заменяется на hard-coded значение при сборке:
const url = process.env.NEXT_PUBLIC_API_URL; // → '/api' или undefined
```

## Корневая причина

1. **`useEnrichmentGeneration.ts`** (строка 8):

   ```typescript
   const BACKEND_URL = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL || 'http://localhost:3456';
   ```

2. **`CourseVisualsManager.tsx`** (строка 33):

   ```typescript
   const BACKEND_URL = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL || 'http://localhost:3456';
   ```

3. **CI/CD workflow** устанавливает `COURSEGEN_BACKEND_URL` (без `NEXT_PUBLIC_` префикса), поэтому:
   - Серверные route handlers работают
   - Клиентский код не видит переменную → fallback к `localhost:3456`

4. **`useAutoCard.ts`** имеет умный fallback к `/api` в production, но другие файлы — нет.

## Решение: Комбинированный подход ✅

Используем **оба механизма** для максимальной надёжности:

1. **NEXT*PUBLIC*\* в CI/CD** — явная конфигурация при сборке (best practice)
2. **Runtime detection fallback** — страховка если переменная не установлена

### Приоритеты

```typescript
const BACKEND_URL = (() => {
  // 1. Если есть NEXT_PUBLIC_* → используем (CI/CD установил при сборке)
  const url = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL;
  if (url) return url; // → '/api' для production builds

  // 2. Fallback: runtime detection по hostname
  if (typeof window !== 'undefined') {
    const isProduction =
      window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    if (isProduction) return '/api';
  }

  // 3. Development fallback
  return 'http://localhost:3456';
})();
```

### Как это работает в разных окружениях

| Окружение                     | NEXT*PUBLIC*\* | hostname               | Результат           |
| ----------------------------- | -------------- | ---------------------- | ------------------- |
| Production (ai.megacampus.ru) | `/api`         | `ai.megacampus.ru`     | `/api` ✅           |
| Dev (dev.ai.megacampus.ru)    | `/api`         | `dev.ai.megacampus.ru` | `/api` ✅           |
| Локально (pnpm dev)           | undefined      | `localhost`            | `localhost:3456` ✅ |
| Локально + .env.local         | `/api`         | `localhost`            | `/api` ✅           |

## Файлы для изменения

### Клиентский код (умный fallback)

1. **`packages/web/lib/hooks/useEnrichmentGeneration.ts`**
   - Строка 8: Заменить простой fallback на умную логику

2. **`packages/web/components/course/CourseVisualsManager.tsx`**
   - Строка 33: Аналогичное изменение

### CI/CD (явная конфигурация)

3. **`.github/workflows/ci-cd.yml`**
   - Строка ~368 (build-args для web image): добавить `NEXT_PUBLIC_COURSEGEN_BACKEND_URL=/api`
   - Строки 431 и 575 (.env.production и .env.dev): добавить ту же переменную

### Документация

4. **`.claude/docs/deployment-guide.md`**
   - Добавить секцию "Environment Variables" с объяснением

## Реализация

### Изменение 1: useEnrichmentGeneration.ts

```typescript
// Backend URL for tRPC calls (client-side)
// In production: uses '/api' (nginx proxies /api/trpc to API server)
// In development: uses env var or localhost:3456
const BACKEND_URL = (() => {
  const url = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL;
  if (url) return url;

  // In browser, detect production by hostname
  if (typeof window !== 'undefined') {
    const isProduction =
      window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    if (isProduction) {
      return '/api'; // Relative URL - nginx proxies /api/trpc to API
    }
  }
  return 'http://localhost:3456';
})();
const TRPC_URL = `${BACKEND_URL}/trpc`;
```

**Результат**: В production запрос пойдёт на `/api/trpc/enrichment.generateOnDemand`, Next.js route проксирует на API.

### Изменение 2: CourseVisualsManager.tsx

Аналогичное изменение строки 33 — та же IIFE логика.

### Изменение 3: CI/CD workflow (.github/workflows/ci-cd.yml)

**Build args для Docker (строка ~368)**:

```yaml
build-args: |
  NODE_VERSION=20
  # ... existing args ...
  ${{ matrix.image == 'web' && 'NEXT_PUBLIC_COURSEGEN_BACKEND_URL=/api' || '' }}
```

**В .env.production (строка ~444)**:

```bash
NEXT_PUBLIC_COURSEGEN_BACKEND_URL=/api
```

**В .env.dev (строка ~588)**:

```bash
NEXT_PUBLIC_COURSEGEN_BACKEND_URL=/api
```

### Изменение 4: deployment-guide.md

Добавить новую секцию:

```markdown
## Environment Variables

### Client-Side Variables (NEXT*PUBLIC*\*)

Variables prefixed with `NEXT_PUBLIC_` are embedded into the JavaScript bundle at **build time**.

**Important**: Changing these variables requires rebuilding the Docker image.

| Variable                            | Description          | Default         |
| ----------------------------------- | -------------------- | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL`          | Supabase project URL | Required        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Supabase anon key    | Required        |
| `NEXT_PUBLIC_COURSEGEN_BACKEND_URL` | API backend URL      | Auto-detected\* |

\*Auto-detection: In production (non-localhost), uses relative URL which nginx proxies to API.

### Server-Side Variables

These are read at runtime and can be changed without rebuilding:

| Variable                    | Description                    | Default           |
| --------------------------- | ------------------------------ | ----------------- |
| `COURSEGEN_BACKEND_URL`     | API URL for server-side calls  | `http://api:4000` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) | Required          |
```

## Архитектура проксирования

```
Клиент (браузер)
    ↓ /api/trpc/enrichment.generateOnDemand
Next.js API Route (/app/api/trpc/[...path]/route.ts)
    ↓ ${BACKEND_URL}/trpc/enrichment.generateOnDemand
    ↓ (BACKEND_URL = http://api:4000 из .env.production)
API сервер (Express + tRPC на /trpc)
```

Next.js route использует серверную переменную `COURSEGEN_BACKEND_URL` (без NEXT*PUBLIC*),
поэтому проксирование работает корректно. Проблема только в клиентском коде.

## Верификация

1. После деплоя на staging:
   - Открыть DevTools → Network
   - Нажать "Сгенерировать обложку"
   - Проверить что запрос идёт на `/api/trpc/enrichment.generateOnDemand`
   - Убедиться что нет CSP ошибок
   - Проверить что ответ приходит (не 502/504)

2. Локально:
   - Запустить `pnpm dev`
   - Проверить что запросы идут на `http://localhost:3456/trpc/...`
   - Работает как раньше

## Риски

- **Низкий**: Изменение затрагивает только URL формирование
- Паттерн уже работает в `useAutoCard.ts`
- Комбинированный подход обеспечивает fallback

## Порядок деплоя

1. **Merge код** → runtime fallback сразу заработает
2. **CI/CD пересоберёт image** → NEXT*PUBLIC*\* будет инлайнен
3. **Следующий деплой** → оба механизма работают
