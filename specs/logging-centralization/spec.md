# Logging Centralization Specification

> **Generated**: 2025-12-19
> **Status**: Ready for Implementation
> **Target**: Unified logging with Axiom integration

## Executive Summary

This specification outlines the complete centralization of logging across the MC2 monorepo. Currently, logging is fragmented across 6+ different implementations with 3,592 console statements spread across 216 files. This document provides detailed technical tasks for unifying all logging through Pino with Axiom as the centralized logging platform.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Problems Identified](#2-problems-identified)
3. [Target Architecture](#3-target-architecture)
4. [Implementation Tasks](#4-implementation-tasks)
5. [File-by-File Changes](#5-file-by-file-changes)
6. [Validation Criteria](#6-validation-criteria)

---

## 1. Current State Analysis

### 1.1 Logger Implementations Found

| File | Type | Description | Status |
|------|------|-------------|--------|
| `packages/course-gen-platform/src/shared/logger/index.ts` | Pino | Main backend logger | **Keep as base** |
| `packages/web/lib/logger.ts` | Custom Console | Simple wrapper around console.* | **Replace with Pino** |
| `packages/course-gen-platform/src/shared/logging/structured-logger.ts` | Pino Child | StructuredLogger class for stages | **Keep, enhance** |
| `packages/course-gen-platform/src/shared/trace-logger.ts` | Supabase | Logs to `generation_trace` table | **Keep** |
| `packages/course-gen-platform/src/shared/logger/error-service.ts` | Supabase | Logs to `error_logs` table | **Keep** |
| `packages/course-gen-platform/src/integrations/lms/logger.ts` | Pino Child | LMS module child logger | **Keep** |

### 1.2 Console Statement Distribution

```
Total: 3,592 console statements across 216 files

By Package:
- packages/web/: 147 console statements
- packages/course-gen-platform/src/: 222 console statements
- Other (configs, scripts, tests): ~3,223 statements
```

### 1.3 Current Backend Logger Configuration

**File**: `packages/course-gen-platform/src/shared/logger/index.ts`

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'course-generator',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '0.0.0',
  },
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export default logger;
```

### 1.4 Current Web Logger Configuration

**File**: `packages/web/lib/logger.ts`

```typescript
// PROBLEM: Does NOT use Pino, just wraps console.*
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development'
  private currentLevel = this.isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN

  debug(...args: unknown[]) {
    if (this.currentLevel <= LOG_LEVELS.DEBUG) {
      console.debug('[DEBUG]', ...args)  // <-- Just console.debug
    }
  }
  // ... etc
}

export const logger = new Logger()
```

### 1.5 StructuredLogger Implementation

**File**: `packages/course-gen-platform/src/shared/logging/structured-logger.ts`

This is a well-designed wrapper around Pino providing:
- Stage lifecycle events (`stageStarted`, `stageCompleted`, `stageFailed`)
- Lesson lifecycle events
- Job lifecycle events
- Metrics logging
- Context enrichment

**Factory functions**:
- `createStageLogger(courseId, stageNumber, stageName)`
- `createLessonLogger(courseId, stageNumber, lessonNumber)`
- `createJobLogger(jobId, jobType)`

---

## 2. Problems Identified

### 2.1 Critical Issues

1. **Web package uses console wrapper, not Pino**
   - No structured logging in web package
   - No JSON format for production
   - No centralized log collection

2. **No centralized logging platform**
   - Logs only go to stdout
   - No persistence in production
   - No search/analysis capability

3. **3,592 raw console statements**
   - Debug code left in production
   - No log levels
   - No structured context

### 2.2 Fragmentation Issues

1. **6 different logger files** with inconsistent APIs
2. **No shared logger package** for monorepo
3. **Different log formats** between packages
4. **No unified child logger pattern** for modules

### 2.3 Missing Features

1. **No Axiom transport** for centralized collection
2. **No request ID correlation** in web package
3. **No browser logging strategy** (client-side)
4. **No log sampling** for high-volume events

---

## 3. Target Architecture

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SHARED LOGGER PACKAGE                      │
│              packages/shared-logger/src/index.ts                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Base Pino   │  │ Child       │  │ Transports              │  │
│  │ Config      │  │ Loggers     │  │ ├─ pino-pretty (dev)    │  │
│  │             │  │ Factory     │  │ ├─ @axiomhq/pino (prod) │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ course-gen-     │ │ web             │ │ other packages  │
│ platform        │ │ (Next.js)       │ │                 │
│                 │ │                 │ │                 │
│ import logger   │ │ import logger   │ │ import logger   │
│ from shared     │ │ from shared     │ │ from shared     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 3.2 Transport Configuration

**Development**:
```typescript
transport: {
  target: 'pino-pretty',
  options: { colorize: true }
}
```

**Production**:
```typescript
transport: {
  targets: [
    {
      target: '@axiomhq/pino',
      options: {
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN,
      },
      level: 'info'
    },
    {
      target: 'pino/file',
      options: { destination: 1 }, // stdout for container logs
      level: 'warn'
    }
  ]
}
```

### 3.3 Child Logger Pattern

```typescript
// Module-specific loggers
const apiLogger = logger.child({ module: 'api' });
const authLogger = logger.child({ module: 'auth' });
const generationLogger = logger.child({ module: 'generation' });

// Request-scoped loggers
const requestLogger = logger.child({
  requestId: req.headers['x-request-id'],
  userId: session?.userId
});
```

### 3.4 Environment Variables

```env
# Axiom Configuration
AXIOM_TOKEN=xaat-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AXIOM_DATASET=mc2-logs
AXIOM_ORG_ID=megacampus  # Optional

# Logger Configuration
LOG_LEVEL=info           # debug | info | warn | error
NODE_ENV=production
```

---

## 4. Implementation Tasks

### Task 1: Create Shared Logger Package

**Priority**: Critical
**Estimated Scope**: New package creation

Create `packages/shared-logger/` with unified Pino configuration.

**Files to Create**:
```
packages/shared-logger/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Main export
│   ├── config.ts          # Pino configuration
│   ├── transports.ts      # Transport setup (Axiom, pretty, file)
│   ├── child-loggers.ts   # Factory functions for child loggers
│   └── types.ts           # TypeScript interfaces
```

**package.json**:
```json
{
  "name": "@megacampus/shared-logger",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "pino": "^9.0.0",
    "@axiomhq/pino": "^1.0.0"
  },
  "devDependencies": {
    "pino-pretty": "^11.0.0"
  }
}
```

**src/index.ts**:
```typescript
import pino from 'pino';
import { getTransportConfig } from './transports';
import type { LoggerOptions, ChildLoggerContext } from './types';

const defaultOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: process.env.SERVICE_NAME || 'megacampus',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '0.0.0',
  },
};

export const logger = pino({
  ...defaultOptions,
  transport: getTransportConfig(),
});

export function createChildLogger(context: ChildLoggerContext) {
  return logger.child(context);
}

export function createModuleLogger(module: string) {
  return logger.child({ module });
}

export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({ requestId, userId });
}

export type { Logger } from 'pino';
export default logger;
```

**src/transports.ts**:
```typescript
import type { TransportTargetOptions } from 'pino';

export function getTransportConfig(): TransportTargetOptions | undefined {
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      }
    };
  }

  // Production: Axiom + stdout
  const targets: TransportTargetOptions[] = [];

  // Axiom transport (if configured)
  if (process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET) {
    targets.push({
      target: '@axiomhq/pino',
      options: {
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN,
      },
      level: 'info'
    });
  }

  // Always output to stdout for container logs
  targets.push({
    target: 'pino/file',
    options: { destination: 1 },
    level: 'warn'
  });

  if (targets.length === 0) {
    return undefined; // Default Pino behavior
  }

  return {
    targets,
  } as TransportTargetOptions;
}
```

---

### Task 2: Migrate Backend Logger

**Priority**: High
**Files to Modify**:
- `packages/course-gen-platform/src/shared/logger/index.ts`
- `packages/course-gen-platform/package.json`

**Changes**:

1. Update `package.json` to add dependency:
```json
{
  "dependencies": {
    "@megacampus/shared-logger": "workspace:*"
  }
}
```

2. Replace `packages/course-gen-platform/src/shared/logger/index.ts`:
```typescript
// Re-export from shared package
export {
  logger as default,
  logger,
  createChildLogger,
  createModuleLogger,
  createRequestLogger,
} from '@megacampus/shared-logger';

export type { Logger } from '@megacampus/shared-logger';
```

This maintains backward compatibility while centralizing configuration.

---

### Task 3: Migrate Web Logger

**Priority**: High
**Files to Modify**:
- `packages/web/lib/logger.ts`
- `packages/web/package.json`

**Changes**:

1. Update `packages/web/package.json`:
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
 * Uses shared Pino logger with Axiom transport.
 * Browser-side logging uses console with structured format.
 */
import baseLogger, { createModuleLogger } from '@megacampus/shared-logger';

// Server-side logger (Node.js runtime)
export const logger = createModuleLogger('web');

// API route logger factory
export function createApiLogger(route: string) {
  return logger.child({ route });
}

// Server action logger factory
export function createActionLogger(action: string) {
  return logger.child({ action });
}

// Client-side logger (browser)
// Falls back to structured console for client components
export const clientLogger = {
  debug: (msg: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${msg}`, data);
    }
  },
  info: (msg: string, data?: Record<string, unknown>) => {
    console.info(`[INFO] ${msg}`, data);
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(`[WARN] ${msg}`, data);
  },
  error: (msg: string, error?: Error, data?: Record<string, unknown>) => {
    console.error(`[ERROR] ${msg}`, { error: error?.message, stack: error?.stack, ...data });
  },
};

export default logger;
```

---

### Task 4: Update StructuredLogger

**Priority**: Medium
**File**: `packages/course-gen-platform/src/shared/logging/structured-logger.ts`

**Changes**:

Update imports to use shared logger:

```typescript
// Change from:
import logger from '../logger';

// Change to:
import logger from '@megacampus/shared-logger';
```

Keep all existing functionality - StructuredLogger is already well-designed.

---

### Task 5: Replace Console Statements in Backend

**Priority**: High
**Scope**: 222 console statements in `packages/course-gen-platform/src/`

**Strategy**:
1. Search for `console.log`, `console.error`, `console.warn`, `console.debug`
2. Replace with appropriate logger calls
3. Add context where beneficial

**Replacement Patterns**:

```typescript
// BEFORE
console.log('Processing stage', stageNumber);

// AFTER
logger.info({ stageNumber }, 'Processing stage');

// BEFORE
console.error('Failed to process:', error);

// AFTER
logger.error({ err: error }, 'Failed to process');

// BEFORE
console.debug('Debug info:', data);

// AFTER
logger.debug({ data }, 'Debug info');
```

**Files with Most Console Statements** (prioritize these):
1. `src/stages/` - Stage processing
2. `src/orchestrator/` - Job orchestration
3. `src/shared/` - Utility functions
4. `src/integrations/` - External integrations

---

### Task 6: Replace Console Statements in Web

**Priority**: High
**Scope**: 147 console statements in `packages/web/`

**Strategy**:
1. Server components/actions: Use `logger` from `@/lib/logger`
2. Client components: Use `clientLogger` from `@/lib/logger`
3. API routes: Use `createApiLogger(routeName)`

**Replacement Patterns**:

```typescript
// Server Action - BEFORE
console.error('Failed to fetch:', error);

// Server Action - AFTER
import { logger } from '@/lib/logger';
logger.error({ err: error }, 'Failed to fetch');

// Client Component - BEFORE
console.log('User clicked:', buttonId);

// Client Component - AFTER
import { clientLogger } from '@/lib/logger';
clientLogger.info('User clicked', { buttonId });

// API Route - BEFORE
console.error('[courses/delete] Error:', error);

// API Route - AFTER
import { createApiLogger } from '@/lib/logger';
const log = createApiLogger('courses/delete');
log.error({ err: error }, 'Delete failed');
```

---

### Task 7: Configure Axiom

**Priority**: High
**Scope**: Environment configuration

**Steps**:

1. Create Axiom account at https://axiom.co (free tier: 500GB/month)

2. Create dataset named `mc2-logs`

3. Generate API token with ingest permissions

4. Add to environment files:

**`.env.production`**:
```env
AXIOM_TOKEN=xaat-your-token-here
AXIOM_DATASET=mc2-logs
```

**`.env.local`** (development - optional):
```env
# Uncomment to test Axiom in development
# AXIOM_TOKEN=xaat-your-token-here
# AXIOM_DATASET=mc2-logs-dev
```

5. Add to Docker/deployment configs:
```yaml
environment:
  - AXIOM_TOKEN=${AXIOM_TOKEN}
  - AXIOM_DATASET=${AXIOM_DATASET}
```

---

### Task 8: Add Request ID Middleware

**Priority**: Medium
**File**: Create `packages/web/middleware.ts` (if not exists) or update existing

**Implementation**:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || uuidv4();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('x-request-id', requestId);

  return response;
}

export const config = {
  matcher: ['/api/:path*', '/courses/:path*', '/admin/:path*'],
};
```

---

### Task 9: Update tsconfig.json Files

**Priority**: Low
**Files**:
- `packages/course-gen-platform/tsconfig.json`
- `packages/web/tsconfig.json`

Add path alias for shared logger:

```json
{
  "compilerOptions": {
    "paths": {
      "@megacampus/shared-logger": ["../shared-logger/src"]
    }
  }
}
```

---

### Task 10: Update pnpm-workspace.yaml

**Priority**: Critical (prerequisite for Task 1)
**File**: `pnpm-workspace.yaml`

Ensure shared-logger is included:

```yaml
packages:
  - 'packages/*'
```

Should already include `packages/*` glob, no changes needed if so.

---

## 5. File-by-File Changes

### New Files

| File | Description |
|------|-------------|
| `packages/shared-logger/package.json` | Package manifest |
| `packages/shared-logger/tsconfig.json` | TypeScript config |
| `packages/shared-logger/src/index.ts` | Main logger export |
| `packages/shared-logger/src/transports.ts` | Transport configuration |
| `packages/shared-logger/src/types.ts` | TypeScript interfaces |

### Modified Files

| File | Changes |
|------|---------|
| `packages/course-gen-platform/package.json` | Add shared-logger dependency |
| `packages/course-gen-platform/src/shared/logger/index.ts` | Re-export from shared |
| `packages/course-gen-platform/src/shared/logging/structured-logger.ts` | Update import |
| `packages/web/package.json` | Add shared-logger dependency |
| `packages/web/lib/logger.ts` | Replace with Pino implementation |
| `packages/web/middleware.ts` | Add request ID |
| `.env.example` | Add Axiom variables |
| `docker-compose.yml` | Add Axiom env vars |

### Files with Console Replacements

**Backend** (222 statements):
- `packages/course-gen-platform/src/stages/**/*.ts`
- `packages/course-gen-platform/src/orchestrator/**/*.ts`
- `packages/course-gen-platform/src/shared/**/*.ts`
- `packages/course-gen-platform/src/integrations/**/*.ts`

**Web** (147 statements):
- `packages/web/app/**/*.ts`
- `packages/web/components/**/*.tsx`
- `packages/web/lib/**/*.ts`

---

## 6. Validation Criteria

### 6.1 Type Check

```bash
pnpm type-check
# Must pass with 0 errors
```

### 6.2 Build Check

```bash
pnpm build
# Must complete successfully
```

### 6.3 Logger Functionality

```bash
# Development: Logs should appear with colors in terminal
LOG_LEVEL=debug pnpm dev

# Production: Logs should be JSON format
NODE_ENV=production pnpm start
```

### 6.4 Axiom Integration

1. Configure Axiom credentials
2. Generate some log events
3. Verify logs appear in Axiom dashboard within 30 seconds

### 6.5 Console Statement Audit

```bash
# After migration, this should return minimal results
# (only allowed in test files and build scripts)
grep -r "console\." packages/course-gen-platform/src/ packages/web/app packages/web/lib | wc -l
# Target: < 20 remaining (tests, intentional debug)
```

### 6.6 No Regression

- All existing tests pass
- Application starts without errors
- Log output matches expected format

---

## Appendix A: Pino Axiom Transport Documentation

From official `@axiomhq/pino` package:

```typescript
import pino from 'pino';

const logger = pino(
  { level: 'info' },
  pino.transport({
    target: '@axiomhq/pino',
    options: {
      dataset: process.env.AXIOM_DATASET,
      token: process.env.AXIOM_TOKEN,
    },
  }),
);

logger.info('Hello from Pino!');
```

**Multi-transport configuration**:

```typescript
const transport = pino.transport({
  targets: [
    {
      target: '@axiomhq/pino',
      options: { dataset: 'my-dataset', token: 'my-token' },
      level: 'info'
    },
    {
      target: 'pino-pretty',
      options: {},
      level: 'debug'
    }
  ]
});

const logger = pino(transport);
```

---

## Appendix B: Implementation Order

**Phase 1: Foundation**
1. Task 10: Verify workspace config
2. Task 1: Create shared-logger package
3. Task 9: Update tsconfig paths

**Phase 2: Migration**
4. Task 2: Migrate backend logger
5. Task 3: Migrate web logger
6. Task 4: Update StructuredLogger

**Phase 3: Console Cleanup**
7. Task 5: Replace backend console statements
8. Task 6: Replace web console statements

**Phase 4: Production Setup**
9. Task 7: Configure Axiom
10. Task 8: Add request ID middleware

---

## Appendix C: Rollback Plan

If issues arise:

1. **Shared logger package issues**: Revert to direct Pino usage in each package
2. **Axiom transport issues**: Remove Axiom transport, keep stdout only
3. **Console replacement issues**: `git checkout` affected files

All changes are backward-compatible; original functionality can be restored.

---

**Document Version**: 1.0
**Author**: Claude Code Orchestrator
**Review Required**: Yes - verify Axiom account setup before implementation
