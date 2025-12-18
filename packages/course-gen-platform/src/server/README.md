# tRPC Server

**Location**: `packages/course-gen-platform/src/server/`
**Purpose**: tRPC API layer exposing `AppRouter` for client SDK consumption

---

## Architecture Overview

The tRPC server provides a type-safe API surface for the MegaCampusAI platform. It acts as the entry point for all client requests, handling authentication, authorization, rate limiting, and routing to appropriate business logic.

```
                     +-----------------------+
                     |    External Clients   |
                     |  (trpc-client-sdk)    |
                     +-----------+-----------+
                                 |
                                 | HTTP/tRPC
                                 v
+-----------------------------------------------------------------+
|                        src/server/                               |
|  +------------------+  +------------------+  +----------------+  |
|  |   index.ts       |  |   app-router.ts  |  |    trpc.ts     |  |
|  | (Express entry)  |  | (Router combiner)|  | (Context/Init) |  |
|  +------------------+  +------------------+  +----------------+  |
|           |                    |                     |           |
|           v                    v                     v           |
|  +----------------------------------------------------------+   |
|  |                     routers/                              |   |
|  |  generation | regeneration | jobs | admin | billing | ... |   |
|  +----------------------------------------------------------+   |
|           |                                                      |
|           v                                                      |
|  +------------------+  +------------------+  +----------------+  |
|  |   middleware/    |  |     errors/      |  |     utils/     |  |
|  | (auth, rate-lim) |  | (error handling) |  | (helpers)      |  |
|  +------------------+  +------------------+  +----------------+  |
+-----------------------------------------------------------------+
                                 |
                                 v
              +----------------------------------+
              |        Business Logic            |
              |  stages/ | shared/ | orchestrator|
              +----------------------------------+
```

---

## Directory Structure

```
src/server/
|-- index.ts              # Express entrypoint (446 LOC)
|-- app-router.ts         # tRPC app router - combines all feature routers (172 LOC)
|-- trpc.ts               # tRPC context, initialization, base procedures (165 LOC)
|-- procedures.ts         # Pre-configured procedures (instructorProcedure, etc.)
|
|-- routers/              # Feature-specific routers
|   |-- generation.ts     # Course generation operations (~600 LOC after refactor)
|   |-- regeneration.ts   # Section regeneration (FR-026)
|   |-- admin.ts          # Admin router re-export (16 LOC)
|   |-- admin/            # ✅ MODULAR (v0.22.14) - Admin sub-routers
|   |   |-- index.ts      # Main admin router (merges 6 sub-routers)
|   |   |-- shared/
|   |   |   |-- schemas.ts   # Shared Zod schemas (pagination, filters)
|   |   |   +-- types.ts     # Shared TypeScript types
|   |   |-- organizations.ts        # 5 procedures (576 LOC)
|   |   |-- users.ts                # 1 procedure (118 LOC)
|   |   |-- courses.ts              # 1 procedure (127 LOC)
|   |   |-- api-keys.ts             # 3 procedures (259 LOC)
|   |   |-- audit-logs.ts           # 1 procedure (128 LOC)
|   |   +-- generation-monitoring.ts # 7 procedures (372 LOC)
|   |-- pipeline-admin/   # ✅ MODULAR - Pipeline config sub-routers
|   |   |-- index.ts      # Main pipeline-admin router (merges 9 sub-routers)
|   |   +-- stages.ts, stats.ts, model-configs.ts, prompts.ts, etc.
|   |-- analysis.ts       # Stage 4 analysis operations
|   |-- billing.ts        # Usage and quota tracking
|   |-- jobs.ts           # BullMQ job management
|   |-- metrics.ts        # System metrics (public)
|   +-- summarization.ts  # Stage 3 summarization monitoring
|
|-- middleware/           # Request middleware
|   |-- auth.ts           # JWT authentication + protectedProcedure
|   |-- authorize.ts      # Role-based authorization
|   +-- rate-limit.ts     # Rate limiting per endpoint
|
|-- errors/               # Error handling
|   |-- index.ts          # Error exports
|   |-- error-formatter.ts # tRPC error formatter
|   +-- typed-errors.ts   # Custom error types
|
+-- utils/                # Helper utilities
    |-- billing-helpers.ts # Billing calculation helpers
    +-- error-messages.ts  # Standardized error messages
```

---

## Middleware Chain

Requests flow through middleware in this order:

```
Request
   |
   v
+------------------+
| Express (CORS,   |  <- index.ts
| body-parser)     |
+------------------+
   |
   v
+------------------+
| tRPC Context     |  <- trpc.ts (createContext)
| (JWT parsing)    |
+------------------+
   |
   v
+------------------+
| Rate Limiter     |  <- middleware/rate-limit.ts
| (per-endpoint)   |
+------------------+
   |
   v
+------------------+
| Auth Middleware  |  <- middleware/auth.ts
| (publicProcedure |    (protectedProcedure, instructorProcedure, adminProcedure)
|  or protected)   |
+------------------+
   |
   v
+------------------+
| Authorization    |  <- middleware/authorize.ts
| (role-based)     |
+------------------+
   |
   v
+------------------+
| Router Handler   |  <- routers/*.ts
| (business logic) |
+------------------+
   |
   v
Response
```

---

## How to Add New Routers

### Step 1: Create Router File

Create a new file in `routers/`:

```typescript
// routers/my-feature.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rate-limit';

export const myFeatureRouter = router({
  // Query example (read operation)
  getData: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Access user from context
      const userId = ctx.user?.id;

      // Your logic here
      return { data: 'result' };
    }),

  // Mutation example (write operation)
  createData: protectedProcedure
    .use(createRateLimiter({ requests: 10, window: 60 }))
    .input(z.object({ name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Your logic here
      return { success: true };
    }),
});

export type MyFeatureRouter = typeof myFeatureRouter;
```

### Step 2: Register in App Router

Add import and registration in `app-router.ts`:

```typescript
import { myFeatureRouter } from './routers/my-feature';

export const appRouter = router({
  // ... existing routers
  myFeature: myFeatureRouter,
});
```

### Step 3: Update Documentation

Add documentation in the JSDoc header of `app-router.ts`:

```typescript
/**
 * ### myFeature
 * Description of your feature.
 *
 * Procedures:
 * - `myFeature.getData` - Description (auth required)
 * - `myFeature.createData` - Description (auth required)
 */
```

---

## Available Procedures

### Base Procedures (trpc.ts)

| Procedure | Auth Required | Description |
|-----------|--------------|-------------|
| `publicProcedure` | No | No authentication required |
| `protectedProcedure` | Yes | Requires valid JWT |

### Pre-configured Procedures (procedures.ts)

| Procedure | Auth Required | Role Required | Description |
|-----------|--------------|---------------|-------------|
| `instructorProcedure` | Yes | instructor/admin | For instructor operations |
| `adminProcedure` | Yes | admin | For admin-only operations |

---

## Relationship with trpc-client-sdk

The `packages/trpc-client-sdk/` package consumes `AppRouter` type for full type safety:

```typescript
// In trpc-client-sdk/src/client.ts
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';
import { createTRPCClient } from '@trpc/client';

export const createClient = (url: string) => {
  return createTRPCClient<AppRouter>({
    url,
  });
};
```

### Type Export Pattern

The `AppRouter` type is exported from `app-router.ts`:

```typescript
// app-router.ts
export const appRouter = router({ /* ... */ });

// Type export for SDK consumers
export type AppRouter = typeof appRouter;
```

This enables:
- Full autocomplete in client code
- Compile-time type checking
- Automatic input/output type inference

---

## Error Handling

### Standard tRPC Error Codes

| Code | HTTP Status | When to Use |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid/missing JWT |
| `FORBIDDEN` | 403 | User lacks permission |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `BAD_REQUEST` | 400 | Invalid input |
| `CONFLICT` | 409 | Resource state conflict |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected errors |

### Error Response Format

```typescript
throw new TRPCError({
  code: 'NOT_FOUND',
  message: 'Course not found',
  // Optional: include cause for debugging
  cause: originalError,
});
```

---

## Rate Limiting

Each endpoint can have custom rate limits:

```typescript
// In router file
.use(createRateLimiter({ requests: 10, window: 60 })) // 10 requests per 60 seconds
```

### Default Limits by Router

| Router | Endpoint | Limit |
|--------|----------|-------|
| generation | uploadFile | 5/min |
| generation | initiate | 10/min |
| generation | generate | 10/min |
| generation | getStatus | 30/min |
| regeneration | regenerateSection | 10/min |
| regeneration | batchRegenerateSections | 5/min |

---

## Testing

### Unit Tests

Test individual procedures in isolation:

```typescript
// tests/unit/server/routers/generation.test.ts
import { appRouter } from '@/server/app-router';
import { createContext } from '@/server/trpc';

describe('generation router', () => {
  it('should return operational status from test endpoint', async () => {
    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.generation.test({ message: 'hello' });
    expect(result.message).toBe('tRPC server is operational');
  });
});
```

### Integration Tests

Test with actual HTTP requests:

```typescript
// tests/integration/server.test.ts
import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@/server/app-router';

const client = createTRPCClient<AppRouter>({ url: 'http://localhost:3000/trpc' });

it('should upload file successfully', async () => {
  const result = await client.generation.uploadFile.mutate({
    courseId: testCourseId,
    filename: 'test.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    fileContent: base64Content,
  });

  expect(result.fileId).toBeDefined();
});
```

---

## Recent Changes

### v0.22.14 (2025-12-05) - Admin Router Refactoring

**Admin router modularized into sub-routers:**
- Split monolithic `admin.ts` (1,734 LOC) into 6 focused sub-routers
- Created `routers/admin/` directory following `pipeline-admin/` pattern
- Main router file now 16 LOC (re-export wrapper)
- Maintains API compatibility via `router._def.procedures` spreading

**Sub-routers:**
- `organizations.ts` - 5 procedures (listOrganizations, getOrganization, createOrganization, updateOrganization, getStatistics)
- `users.ts` - 1 procedure (listUsers)
- `courses.ts` - 1 procedure (listCourses)
- `api-keys.ts` - 3 procedures (listApiKeys, revokeApiKey, regenerateApiKey)
- `audit-logs.ts` - 1 procedure (listAuditLogs)
- `generation-monitoring.ts` - 7 procedures (getGenerationTrace, getCourseGenerationDetails, triggerStage6ForLesson, etc.)

**Shared modules:**
- `shared/schemas.ts` - Pagination, filters, and validation schemas
- `shared/types.ts` - Shared TypeScript types for admin operations

**Benefits:**
- Improved maintainability: each sub-router focuses on one domain
- Better testability: sub-routers can be tested in isolation
- Clearer code organization: follows established patterns
- Backwards compatible: existing API surface unchanged

---

### v0.18.18 (2025-11-21) - Server Refactoring

**Router Split**:
- Extracted `regenerateSection` from `generation.ts` to `regeneration.ts`
- Added `batchRegenerateSections` endpoint for bulk operations
- Reduced `generation.ts` from ~1,434 LOC to ~600 LOC

**Upload Simplification**:
- Simplified `uploadFile` procedure to delegate to Stage 1 orchestrator
- Business logic now in `stages/stage1-document-upload/`
- Router focuses on HTTP concerns (auth, rate-limit, error mapping)

**Documentation**:
- Added this README.md
- Updated app-router.ts JSDoc with all procedures

---

## Key Files

| File | LOC | Description |
|------|-----|-------------|
| `index.ts` | 446 | Express server, health checks, graceful shutdown |
| `app-router.ts` | ~190 | Router composition, AppRouter type export |
| `trpc.ts` | 165 | Context creation, tRPC initialization |
| `procedures.ts` | 97 | Pre-configured procedure builders |
| `routers/generation.ts` | ~600 | Core generation endpoints |
| `routers/regeneration.ts` | ~350 | Section regeneration (FR-026) |
| `routers/admin.ts` | 16 | Admin router re-export (wrapper) |
| `routers/admin/index.ts` | 66 | Admin sub-router merger |
| `routers/admin/*.ts` | ~1,700 | Admin sub-routers (6 modules) |

---

## Dependencies

### Internal

- `shared/supabase/admin` - Database client
- `shared/logger` - Logging
- `shared/concurrency/tracker` - Concurrency limits
- `stages/stage1-document-upload/handler` - Upload delegation
- `stages/stage5-generation/utils/*` - Regeneration services

### External

- `@trpc/server` - tRPC server framework
- `zod` - Input validation
- `express` - HTTP server
- `nanoid` - Request ID generation

---

**Last Updated**: 2025-12-05
**Version**: 0.22.14
