# Logging Centralization - Implementation Tasks

> **Spec**: [spec.md](./spec.md)
> **Status**: Ready for Implementation
> **Estimated Tasks**: 10

---

## Task Execution Instructions

**For Implementing Agent**:
1. Execute tasks in order (dependencies exist)
2. After each task: run `pnpm type-check` and `pnpm build`
3. Mark task with `[x]` when complete
4. Add artifacts as `-> Artifacts: [file](path)`
5. If blocked: document issue and continue to next independent task

---

## Tasks

### [ ] Task 1: Create shared-logger package structure

**Priority**: Critical (Blocking)
**Dependencies**: None

**Actions**:
1. Create directory: `packages/shared-logger/`
2. Create `package.json`:
```json
{
  "name": "@megacampus/shared-logger",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "pino": "^9.6.0",
    "@axiomhq/pino": "^1.2.0"
  },
  "devDependencies": {
    "pino-pretty": "^13.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0"
  }
}
```

3. Create `tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"]
}
```

4. Create `src/types.ts`:
```typescript
export interface LoggerOptions {
  level?: string;
  service?: string;
  environment?: string;
  version?: string;
}

export interface ChildLoggerContext {
  module?: string;
  requestId?: string;
  userId?: string;
  courseId?: string;
  jobId?: string;
  stageNumber?: number;
  [key: string]: unknown;
}
```

5. Run `pnpm install` from root

**Validation**:
- `packages/shared-logger/` exists
- `pnpm install` completes without errors

---

### [ ] Task 2: Implement shared logger core

**Priority**: Critical (Blocking)
**Dependencies**: Task 1

**Actions**:
1. Create `packages/shared-logger/src/transports.ts`:
```typescript
import type { TransportTargetOptions } from 'pino';

export function getTransportConfig(): TransportTargetOptions | undefined {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (isDevelopment) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  const targets: TransportTargetOptions['targets'] = [];

  // Axiom transport (production only, if configured)
  if (process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET) {
    targets.push({
      target: '@axiomhq/pino',
      options: {
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN,
      },
      level: 'info',
    });
  }

  // Always log to stdout for container logs
  targets.push({
    target: 'pino/file',
    options: { destination: 1 },
    level: 'info',
  });

  return targets.length > 0 ? { targets } : undefined;
}
```

2. Create `packages/shared-logger/src/index.ts`:
```typescript
import pino, { Logger } from 'pino';
import { getTransportConfig } from './transports';
import type { ChildLoggerContext } from './types';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: process.env.SERVICE_NAME || 'megacampus',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '0.0.0',
  },
  transport: getTransportConfig(),
});

export function createChildLogger(context: ChildLoggerContext): Logger {
  return logger.child(context);
}

export function createModuleLogger(module: string): Logger {
  return logger.child({ module });
}

export function createRequestLogger(requestId: string, userId?: string): Logger {
  return logger.child({ requestId, userId });
}

export { logger };
export default logger;
export type { Logger } from 'pino';
export type { ChildLoggerContext, LoggerOptions } from './types';
```

3. Build package: `cd packages/shared-logger && pnpm build`

**Validation**:
- `pnpm build` succeeds in shared-logger
- `dist/` contains `.js`, `.mjs`, and `.d.ts` files

---

### [ ] Task 3: Migrate backend to shared logger

**Priority**: High
**Dependencies**: Task 2

**Actions**:
1. Add dependency in `packages/course-gen-platform/package.json`:
```json
{
  "dependencies": {
    "@megacampus/shared-logger": "workspace:*"
  }
}
```

2. Replace `packages/course-gen-platform/src/shared/logger/index.ts`:
```typescript
/**
 * Logger for course-gen-platform
 * Re-exports from shared logger package for centralized configuration.
 */
export {
  logger as default,
  logger,
  createChildLogger,
  createModuleLogger,
  createRequestLogger,
} from '@megacampus/shared-logger';

export type { Logger, ChildLoggerContext } from '@megacampus/shared-logger';
```

3. Run `pnpm install` from root

**Validation**:
- `pnpm type-check` passes for course-gen-platform
- Existing imports still work (`import logger from '../shared/logger'`)

---

### [ ] Task 4: Migrate web logger

**Priority**: High
**Dependencies**: Task 2

**Actions**:
1. Add dependency in `packages/web/package.json`:
```json
{
  "dependencies": {
    "@megacampus/shared-logger": "workspace:*"
  }
}
```

2. Replace `packages/web/lib/logger.ts`:
```typescript
/**
 * Logger for Next.js web application
 *
 * Server-side: Uses Pino with Axiom transport
 * Client-side: Uses structured console logging
 */
import baseLogger, { createModuleLogger } from '@megacampus/shared-logger';
import type { Logger } from '@megacampus/shared-logger';

// Server-side module logger
export const logger: Logger = createModuleLogger('web');

// API route logger factory
export function createApiLogger(route: string): Logger {
  return logger.child({ route });
}

// Server action logger factory
export function createActionLogger(action: string): Logger {
  return logger.child({ action });
}

// Client-side logger (safe for browser)
export const clientLogger = {
  debug: (msg: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${msg}`, data ?? '');
    }
  },
  info: (msg: string, data?: Record<string, unknown>) => {
    console.info(`[INFO] ${msg}`, data ?? '');
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(`[WARN] ${msg}`, data ?? '');
  },
  error: (msg: string, error?: Error, data?: Record<string, unknown>) => {
    console.error(`[ERROR] ${msg}`, {
      error: error?.message,
      stack: error?.stack,
      ...data,
    });
  },
};

export default logger;
```

3. Run `pnpm install` from root

**Validation**:
- `pnpm type-check` passes for web package
- Logger can be imported: `import { logger } from '@/lib/logger'`

---

### [ ] Task 5: Update StructuredLogger import

**Priority**: Medium
**Dependencies**: Task 3

**Actions**:
1. Edit `packages/course-gen-platform/src/shared/logging/structured-logger.ts`
2. Find line: `import logger from '../logger';`
3. Change to: `import logger from '@megacampus/shared-logger';`

**Validation**:
- `pnpm type-check` passes
- StructuredLogger still works (factory functions export correctly)

---

### [ ] Task 6: Replace console statements in backend (batch 1)

**Priority**: High
**Dependencies**: Task 3
**Scope**: `packages/course-gen-platform/src/orchestrator/`

**Actions**:
1. Find all `console.log`, `console.error`, `console.warn` in orchestrator directory
2. Replace with logger calls:
   - `console.log(msg, data)` → `logger.info({ ...data }, msg)`
   - `console.error(msg, error)` → `logger.error({ err: error }, msg)`
   - `console.warn(msg)` → `logger.warn(msg)`
   - `console.debug(msg)` → `logger.debug(msg)`
3. Add import if not present: `import logger from '../shared/logger';`

**Example Transformations**:
```typescript
// BEFORE
console.log('Job started:', jobId);
console.error('Job failed:', error);

// AFTER
logger.info({ jobId }, 'Job started');
logger.error({ err: error, jobId }, 'Job failed');
```

**Validation**:
- `pnpm type-check` passes
- No console statements remain in `src/orchestrator/`

---

### [ ] Task 7: Replace console statements in backend (batch 2)

**Priority**: High
**Dependencies**: Task 3
**Scope**: `packages/course-gen-platform/src/stages/`

**Actions**:
1. Find all console statements in stages directory
2. Replace with logger calls (same pattern as Task 6)
3. Use StructuredLogger where available (stage processing contexts)

**Validation**:
- `pnpm type-check` passes
- No console statements remain in `src/stages/`

---

### [ ] Task 8: Replace console statements in web

**Priority**: High
**Dependencies**: Task 4
**Scope**: `packages/web/app/`, `packages/web/lib/`

**Actions**:
1. Find all console statements in server components, actions, API routes
2. Replace with appropriate logger:
   - Server code: `import { logger } from '@/lib/logger'`
   - Client code: `import { clientLogger } from '@/lib/logger'`
3. Use specific loggers where helpful:
   - API routes: `const log = createApiLogger('route-name')`
   - Actions: `const log = createActionLogger('action-name')`

**Validation**:
- `pnpm type-check` passes
- Minimal console statements remain (only in client components if necessary)

---

### [ ] Task 9: Add environment variables

**Priority**: Medium
**Dependencies**: None (can run in parallel with Tasks 6-8)

**Actions**:
1. Update `.env.example` (or create if not exists):
```env
# Logging Configuration
LOG_LEVEL=info
SERVICE_NAME=megacampus

# Axiom (Production logging platform)
AXIOM_TOKEN=
AXIOM_DATASET=mc2-logs
```

2. Update `docker-compose.yml` (if exists) to include:
```yaml
services:
  backend:
    environment:
      - AXIOM_TOKEN=${AXIOM_TOKEN}
      - AXIOM_DATASET=${AXIOM_DATASET}
      - LOG_LEVEL=${LOG_LEVEL:-info}
```

3. Update any deployment configurations to include Axiom variables

**Validation**:
- `.env.example` contains Axiom variables
- Docker configs include environment variables

---

### [ ] Task 10: Final validation and documentation

**Priority**: High
**Dependencies**: All previous tasks

**Actions**:
1. Run full validation:
```bash
pnpm type-check  # Must pass
pnpm build       # Must pass
```

2. Count remaining console statements:
```bash
grep -r "console\." packages/course-gen-platform/src/ packages/web/app packages/web/lib --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
# Target: < 20 (only tests/scripts)
```

3. Test logger output:
```bash
# Development mode - should see colorized output
LOG_LEVEL=debug pnpm --filter course-gen-platform dev
```

4. Update README or add LOGGING.md with:
   - How to configure log levels
   - How to add Axiom credentials
   - How to create child loggers

**Validation**:
- Type-check passes
- Build passes
- Console statement count < 20
- Logger outputs correctly in dev mode

---

## Completion Checklist

- [ ] shared-logger package created and builds
- [ ] Backend migrated to shared logger
- [ ] Web migrated to shared logger
- [ ] StructuredLogger updated
- [ ] Console statements replaced in backend
- [ ] Console statements replaced in web
- [ ] Environment variables documented
- [ ] Full type-check passes
- [ ] Full build passes
- [ ] README/documentation updated

---

## Notes for Implementing Agent

1. **Do NOT modify test files** - console statements in tests are acceptable
2. **Preserve existing child logger patterns** - like LMS logger
3. **Keep error-service.ts and trace-logger.ts** - they log to Supabase, not stdout
4. **If Axiom credentials not available**, logger still works (stdout only)
5. **Client components can use clientLogger** - Pino doesn't work in browser
