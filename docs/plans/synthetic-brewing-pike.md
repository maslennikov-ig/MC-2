# Plan: Migrate env.ts to @t3-oss/env-nextjs (mc2-cguh)

## Context

Задача mc2-cguh из AUDIT_REPORT.md. Текущий `packages/web/lib/env.ts` — ручной класс `EnvironmentConfig` (124 строки) без Zod-валидации. Рядом `env-client.ts` (43 строки) с runtime-логикой определения backend URL. Миграция на `@t3-oss/env-nextjs` даёт:

- **Build-time валидацию** env vars (fail-fast вместо runtime ошибок)
- **Zod-типизацию** с автокомплитом в IDE
- **Двойную защиту** server vars: t3-env Proxy + `import 'server-only'`
- Замену ~170 строк ручного кода на ~50 строк декларативной схемы

**Scope**: Только `packages/web`. Backend `env-validator.ts` не трогаем — это Node.js runtime, @t3-oss/env-nextjs не подходит.

## Предварительно: закрыть mc2-j8i9

mc2-j8i9 (CI/CD lint + Docker limits) уже выполнена — lint отделён в CI, все Docker сервисы имеют resource limits. Закрыть:

```bash
bd close mc2-j8i9 --reason="Already done: lint is a separate CI job, all Docker services have deploy.resources.limits"
```

---

## Phase 1: Core Migration

### Step 1: Install dependency

```bash
pnpm --filter @megacampus/web add @t3-oss/env-nextjs
```

### Step 2: Create `packages/web/lib/env-schema.ts` (NEW)

```typescript
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_JWT_SECRET: z.string().min(1).optional(),
    COURSEGEN_BACKEND_URL: z.string().url().default('http://localhost:3456'),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    NEXT_PUBLIC_COURSEGEN_BACKEND_URL: z.string().optional(),
    NEXT_PUBLIC_FEATURE_USERBACK: z.string().optional(),
    NEXT_PUBLIC_USERBACK_TOKEN: z.string().optional(),
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    COURSEGEN_BACKEND_URL: process.env.COURSEGEN_BACKEND_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_COURSEGEN_BACKEND_URL: process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL,
    NEXT_PUBLIC_FEATURE_USERBACK: process.env.NEXT_PUBLIC_FEATURE_USERBACK,
    NEXT_PUBLIC_USERBACK_TOKEN: process.env.NEXT_PUBLIC_USERBACK_TOKEN,
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
```

### Step 3: Replace `packages/web/lib/env.ts`

```typescript
import 'server-only';
import { env } from './env-schema';

export { env };

// Backward-compatible exports (20+ consumers use ENV.SUPABASE_URL etc.)
export const ENV = {
  SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NODE_ENV: env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
  COURSEGEN_BACKEND_URL: env.COURSEGEN_BACKEND_URL,
} as const;

export function getServerEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getTrpcUrl(): string {
  return `${env.COURSEGEN_BACKEND_URL}/trpc`;
}
```

### Step 4: Replace `packages/web/lib/env-client.ts`

```typescript
import { env } from './env-schema';

export const BACKEND_URL = (() => {
  const url = env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL;
  if (url) return url;

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return '/api';
    }
  }

  return 'http://localhost:3456';
})();

export const TRPC_URL = `${BACKEND_URL}/trpc`;
```

### Step 5: Update `packages/web/vitest.setup.ts`

Добавить в начало файла (до строки 1):

```typescript
process.env.SKIP_ENV_VALIDATION = 'true';
```

Это нужно потому что тесты не устанавливают `SUPABASE_SERVICE_ROLE_KEY` — без skip валидация упадёт.

## Critical Files

| File                             | Action                                                   |
| -------------------------------- | -------------------------------------------------------- |
| `packages/web/lib/env-schema.ts` | CREATE — Zod schema с t3-env                             |
| `packages/web/lib/env.ts`        | REPLACE — compat layer (~20 строк вместо 124)            |
| `packages/web/lib/env-client.ts` | REPLACE — использует env из schema (~15 строк вместо 43) |
| `packages/web/vitest.setup.ts`   | EDIT — добавить SKIP_ENV_VALIDATION                      |
| `packages/web/package.json`      | EDIT — add @t3-oss/env-nextjs dependency                 |

## Consumer Impact

| Импорт                                    | Файлов | Изменения                    |
| ----------------------------------------- | ------ | ---------------------------- |
| `{ ENV } from '@/lib/env'`                | 20     | Нет — backward-compat export |
| `{ getServerEnv } from '@/lib/env'`       | 1-2    | Нет — backward-compat export |
| `{ getTrpcUrl } from '@/lib/env'`         | 1-2    | Нет — backward-compat export |
| `{ TRPC_URL } from '@/lib/env-client'`    | 3      | Нет — тот же export          |
| `{ BACKEND_URL } from '@/lib/env-client'` | 1      | Нет — тот же export          |

**0 потребителей нужно менять.**

## Docker/CI

- Dockerfile передаёт все необходимые build ARGs (строки 50-63)
- `COURSEGEN_BACKEND_URL` не передаётся → schema имеет `.default('http://localhost:3456')`
- `NEXT_PUBLIC_APP_URL` не передаётся → schema имеет `.default('http://localhost:3000')`
- CI pipeline: без изменений, `pnpm build` подхватит валидацию

## Verification

```bash
# 1. Type-check
pnpm --filter @megacampus/web type-check

# 2. Build (validates env at build time)
pnpm --filter @megacampus/web build

# 3. Unit tests
pnpm --filter @megacampus/web test

# 4. Full monorepo check
pnpm type-check && pnpm build
```
