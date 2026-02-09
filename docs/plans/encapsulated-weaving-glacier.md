# Plan: Dependency Cleanup — tRPC Version Alignment

## Context

Из задачи mc2-k8m5 (major dep upgrades) мажорные апгрейды отклонены как нецелесообразные.
Однако аудит выявил расхождение минорных версий tRPC между пакетами:

- `packages/web`: `@trpc/client`, `@trpc/react-query`, `@trpc/server` — все `^11.9.0`
- `packages/course-gen-platform`: `@trpc/server` `^11.8.0`, devDeps `@trpc/client` `^11.8.0`

Это может привести к несовместимости типов между клиентом и сервером.

Остальные пункты аудита оказались уже решены или неактуальны:

- Ghost deps (bcryptjs, @googleapis/drive, web-push) — уже удалены
- ioredis в web — активно используется (rate-limit, draft-session)
- Zod `^3.22.4` — semver уже блокирует v4

## Changes

### 1. Align tRPC versions in course-gen-platform/package.json

**File**: `packages/course-gen-platform/package.json`

- Line 65: `"@trpc/server": "^11.8.0"` → `"@trpc/server": "^11.9.0"`
- Line 99: `"@trpc/client": "^11.8.0"` → `"@trpc/client": "^11.9.0"`

### 2. Run pnpm install

```bash
pnpm install
```

## Verification

```bash
# 1. Type-check both packages
pnpm --filter @megacampus/course-gen-platform type-check
pnpm --filter @megacampus/web type-check

# 2. Build platform (exports types used by web)
pnpm --filter @megacampus/course-gen-platform build

# 3. Run unit tests
pnpm --filter @megacampus/course-gen-platform test
```
