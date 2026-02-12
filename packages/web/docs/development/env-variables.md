# Environment Variables Guide

This project uses [@t3-oss/env-nextjs](https://env.t3.gg/) for type-safe environment variable validation with Zod schemas.

## Architecture

```
packages/web/lib/
  env-schema.ts   -- Zod schema (source of truth for all env vars)
  env.ts          -- Server-only exports (ENV, getServerEnv, getTrpcUrl)
  env-client.ts   -- Client-safe exports (BACKEND_URL, TRPC_URL)
```

## Adding a New Environment Variable

### 1. Add to schema (`lib/env-schema.ts`)

**Server-only var** (NOT available in client code):

```typescript
const serverSchema = {
  // ...existing vars...
  /** Description of what this var does */
  MY_SECRET_KEY: z.string().min(1),
}
```

**Client var** (available everywhere, MUST use `NEXT_PUBLIC_` prefix):

```typescript
const clientSchema = {
  // ...existing vars...
  /** Description of what this var does */
  NEXT_PUBLIC_MY_FEATURE: z.string().optional(),
}
```

**Also add to `experimental__runtimeEnv`** (only for client vars):

```typescript
experimental__runtimeEnv: {
  // ...existing vars...
  NEXT_PUBLIC_MY_FEATURE: process.env.NEXT_PUBLIC_MY_FEATURE,
},
```

### 2. Update Dockerfile (`packages/web/Dockerfile`)

If the var needs to be available at **build time** (inlined into client bundle):

```dockerfile
# Builder stage
ARG NEXT_PUBLIC_MY_FEATURE
ENV NEXT_PUBLIC_MY_FEATURE=${NEXT_PUBLIC_MY_FEATURE}
```

If the var is **server-only** and only needed at runtime, add to docker-compose only.

### 3. Update docker-compose

Add to `docker-compose.production.yml` (or `docker-compose.app.yml`):

```yaml
services:
  web:
    build:
      args:
        - NEXT_PUBLIC_MY_FEATURE=${NEXT_PUBLIC_MY_FEATURE}
    environment:
      - MY_SECRET_KEY=${MY_SECRET_KEY}
```

### 4. Add to .env files

- `.env.local` (development)
- `.env.production.example` (documentation)

### 5. Use in code

```typescript
// Server-side (server components, API routes, server actions)
import { env } from '@/lib/env-schema'
console.log(env.MY_SECRET_KEY)

// Client-side (client components, hooks)
import { env } from '@/lib/env-schema'
console.log(env.NEXT_PUBLIC_MY_FEATURE)
```

Or via backward-compatible exports:

```typescript
import { ENV } from '@/lib/env' // server-only
import { TRPC_URL } from '@/lib/env-client' // client-safe
```

## Validation Behavior

| Environment  | Behavior                                                           |
| ------------ | ------------------------------------------------------------------ |
| Development  | Validates on first import. Missing optional vars use defaults.     |
| Production   | Validates at build time (via `next.config.ts` import). Fails fast. |
| Test         | Skipped (`SKIP_ENV_VALIDATION=true` in `vitest.setup.ts`).         |
| Docker build | Validates with build ARGs. Missing optional vars use defaults.     |

## Common Pitfalls

1. Forgetting `NEXT_PUBLIC_` prefix for client vars (t3-env will throw a type error)
2. Accessing server vars on client (t3-env Proxy throws at runtime)
3. Missing Dockerfile ARG for `NEXT_PUBLIC_` vars (value won't be inlined in client bundle)
4. Empty string vs undefined: `emptyStringAsUndefined: true` converts `""` to `undefined`
5. Adding to schema but forgetting `experimental__runtimeEnv` (client var won't be bundled)
