# MegaCampus Monorepo - Package Architecture

This document defines the module boundaries, responsibilities, and import rules for the MegaCampus monorepo packages.

## Package Overview

```
packages/
├── course-gen-platform/   # Main API server and orchestration
├── shared-types/          # Shared TypeScript types and schemas
└── trpc-client-sdk/       # External client SDK for consuming the API
```

## Package Responsibilities

### 1. `@megacampus/course-gen-platform`

**Purpose**: Main backend application server

**Responsibilities**:

- **API Layer** (`src/server/`):
  - tRPC router definitions and procedures
  - Authentication and authorization middleware
  - Request validation and error handling
  - Rate limiting
  - HTTP server setup (Express)
- **Orchestration** (`src/orchestrator/`):
  - BullMQ queue and worker management
  - Job handlers for async workflows
  - Job status tracking and metrics
  - Bull Board UI for monitoring
- **Shared Utilities** (`src/shared/`):
  - Database clients (Supabase admin, Qdrant)
  - Caching layer (Redis)
  - Logging infrastructure
  - Error classes and formatters
  - Validation utilities (file upload, quota enforcement)
  - Embeddings generation (future: RAG implementation)

**Key Files**:

- `src/server/app-router.ts` - Combined tRPC router
- `src/server/index.ts` - Server entrypoint
- `src/orchestrator/worker.ts` - BullMQ worker
- `src/shared/supabase/admin.ts` - Supabase client
- `src/shared/logger/index.ts` - Structured logging

**Dependencies**:

- `@megacampus/shared-types` - For type definitions and validation schemas
- External packages: `@trpc/server`, `@supabase/supabase-js`, `bullmq`, `ioredis`, `@qdrant/js-client-rest`, `zod`

**File Size Guidelines**:

- Target: 200-300 lines per file
- Maximum: 500 lines (exceptions for complex routers/handlers documented inline)
- Files exceeding 300 lines should have eslint-disable comments explaining complexity

---

### 2. `@megacampus/shared-types`

**Purpose**: Centralized type definitions and validation schemas

**Responsibilities**:

- **Database Types** (`database.generated.ts`):
  - Generated from Supabase schema
  - Table row types, insert types, update types
  - Enum types from PostgreSQL
  - RPC function types
  - **DO NOT EDIT MANUALLY** - Regenerate via `mcp__supabase__generate_typescript_types`
- **BullMQ Job Types** (`bullmq-jobs.ts`):
  - Job data schemas with Zod validation
  - Job type enums (TEST_JOB, INITIALIZE, etc.)
  - Default job options per type
- **Validation Schemas** (`zod-schemas.ts`):
  - Input validation schemas for tRPC procedures
  - Business logic validation (tier restrictions, file limits)
  - Reusable validation rules

**Key Files**:

- `src/database.generated.ts` - Supabase-generated types (auto-generated)
- `src/bullmq-jobs.ts` - Job type definitions
- `src/zod-schemas.ts` - Validation schemas
- `src/index.ts` - Public API exports

**Dependencies**:

- `zod` - Schema validation library

**Regeneration**:

```bash
# Regenerate database types after migrations
pnpm --filter @megacampus/shared-types generate:types
```

---

### 3. `@megacampus/trpc-client-sdk`

**Purpose**: External client SDK for consuming the tRPC API

**Responsibilities**:

- Type-safe tRPC client factory
- Exports `AppRouter` type for external consumers
- Simplifies client-side API calls
- Future: Authentication helpers, retry logic, error handling

**Key Files**:

- `src/index.ts` - Client SDK entrypoint

**Dependencies**:

- `@trpc/client` - tRPC client library
- `@megacampus/shared-types` - For shared type definitions

**Usage Example**:

```typescript
import { createTRPCClient } from '@megacampus/trpc-client-sdk';

const client = createTRPCClient({
  url: 'https://api.megacampus.ai/trpc',
  headers: {
    Authorization: 'Bearer <jwt_token>',
  },
});

const courses = await client.generation.listCourses.query();
```

---

## Import Rules and Dependency Graph

### Allowed Import Directions

```
┌─────────────────────────────┐
│ course-gen-platform         │
│ (Main API Server)           │
│                             │
│ ✅ CAN import from:         │
│    - shared-types           │
│                             │
│ ❌ CANNOT import from:       │
│    - trpc-client-sdk        │
└─────────────────────────────┘
              │
              │ depends on
              ▼
┌─────────────────────────────┐
│ shared-types                │
│ (Type Definitions)          │
│                             │
│ ✅ CAN import from:         │
│    - zod only               │
│                             │
│ ❌ CANNOT import from:       │
│    - course-gen-platform    │
│    - trpc-client-sdk        │
└─────────────────────────────┘
              ▲
              │ depends on
              │
┌─────────────────────────────┐
│ trpc-client-sdk             │
│ (Client SDK)                │
│                             │
│ ✅ CAN import from:         │
│    - shared-types           │
│                             │
│ ❌ CANNOT import from:       │
│    - course-gen-platform    │
└─────────────────────────────┘
```

### Dependency Rules

1. **`shared-types` is the foundation**:

   - No dependencies on other workspace packages
   - Only imports from `zod` for validation
   - Acts as the shared contract between server and client

2. **`course-gen-platform` depends on `shared-types`**:

   - Imports types, enums, and validation schemas
   - Uses generated database types
   - Exports tRPC router type (`AppRouter`)

3. **`trpc-client-sdk` depends on `shared-types`**:

   - Imports shared types for type inference
   - Re-exports `AppRouter` type from `course-gen-platform`
   - Client-side only - never imported by server

4. **Circular dependencies are PROHIBITED**:
   - TypeScript project references enforce this
   - Build will fail if circular dependencies are detected

### Import Path Conventions

```typescript
// ✅ CORRECT: Import from shared-types
import type { Database } from '@megacampus/shared-types';
import { createCourseInput } from '@megacampus/shared-types';

// ✅ CORRECT: Import from same package (relative)
import { logger } from '../shared/logger';
import { getAdminClient } from '../shared/supabase/admin';

// ❌ WRONG: Don't import across package boundaries except via workspace packages
import { logger } from '../../course-gen-platform/src/shared/logger'; // NEVER
```

---

## Atomicity Principles

### File Size Guidelines

**Target**: 200-300 lines per file

**Rationale**:

- Easier code review and maintenance
- Single Responsibility Principle
- Reduces merge conflicts
- Improves testability

**Maximum**: 500 lines

**Exceptions** (must be documented with eslint-disable comments):

- Complex routers with multiple procedures (e.g., `admin.ts`, `generation.ts`)
- Job handlers with extensive logic (e.g., `worker.ts`, `job-status-tracker.ts`)
- Integration test files with comprehensive scenarios (e.g., `bullmq.test.ts`)

### Breaking Down Large Files

When a file exceeds 300 lines, consider:

1. **Extract utilities** to separate files (e.g., `billing-helpers.ts`)
2. **Split routers** by resource (e.g., `courses.ts`, `lessons.ts`)
3. **Extract middleware** to `middleware/` directory
4. **Create subdirectories** for related modules (e.g., `orchestrator/handlers/`)

### Single Responsibility

Each file should have **one primary responsibility**:

- ✅ `supabase/admin.ts` - Supabase admin client singleton
- ✅ `cache/redis.ts` - Redis caching utility
- ✅ `logger/index.ts` - Logging infrastructure
- ✅ `routers/admin.ts` - Admin-only tRPC procedures
- ✅ `handlers/test-handler.ts` - Test job handler
- ❌ `utils.ts` - Avoid generic utility files (split by domain)

### Code Organization Within Packages

```
course-gen-platform/
├── src/
│   ├── orchestrator/        # BullMQ queue and workers
│   │   ├── handlers/        # Job handlers (one per file)
│   │   ├── queue.ts         # Queue setup
│   │   ├── worker.ts        # Worker setup
│   │   ├── metrics.ts       # Metrics collection
│   │   └── ui.ts            # Bull Board UI
│   ├── server/              # tRPC API layer
│   │   ├── routers/         # tRPC routers (one per domain)
│   │   ├── middleware/      # Authentication, authorization, rate limiting
│   │   ├── errors/          # Error classes and formatters
│   │   ├── procedures.ts    # Pre-configured procedures
│   │   ├── trpc.ts          # tRPC context and setup
│   │   ├── app-router.ts    # Combined router
│   │   └── index.ts         # Server entrypoint
│   └── shared/              # Shared utilities
│       ├── cache/           # Redis caching
│       ├── embeddings/      # Jina-v3 embeddings (future)
│       ├── logger/          # Structured logging
│       ├── qdrant/          # Qdrant client (future)
│       ├── supabase/        # Supabase client and migrations
│       └── validation/      # File and quota validation
├── scripts/                 # Utility scripts
├── tests/                   # Test files (mirrors src/ structure)
│   ├── integration/         # Integration tests
│   └── unit/                # Unit tests
└── supabase/
    └── migrations/          # Database migrations
```

---

## Testing Strategy

### Test File Location

- **Integration tests**: `tests/integration/`
- **Unit tests**: `tests/unit/`
- **Test files mirror source structure**: `src/server/routers/admin.ts` → `tests/unit/admin.test.ts`

### Test File Size

- Target: 200-500 lines per test file
- Comprehensive scenarios can exceed 500 lines (e.g., `bullmq.test.ts` with 680+ lines)
- Use `describe` blocks to organize related tests

---

## Security Principles

### Never Import Secrets Across Boundaries

- Environment variables loaded **only** in `course-gen-platform`
- Secrets never passed through `shared-types` or `trpc-client-sdk`
- Use dependency injection for clients requiring secrets

### Type Safety First

- All API inputs validated with Zod schemas
- Database types generated from source of truth (PostgreSQL)
- No `any` types except where absolutely necessary (Bull Board integration)

---

## Build and Deployment

### Build Order

TypeScript project references ensure correct build order:

1. `shared-types` (foundation)
2. `trpc-client-sdk` (depends on shared-types)
3. `course-gen-platform` (depends on shared-types)

### Build Commands

```bash
# Build all packages in correct order
pnpm build

# Build specific package
pnpm --filter @megacampus/course-gen-platform build

# Type check all packages
pnpm type-check

# Lint all packages
pnpm lint

# Format all packages
pnpm format
```

---

## Stage 0 Architecture Notes

**Current State** (Stage 0 - Foundation):

- Infrastructure is operational and validated
- API endpoints are type-safe and tested
- Orchestration system (BullMQ) is functional
- Database schema with RLS policies is deployed
- **No workflow logic implemented yet** - Stage 1+ will add course generation workflows

**Next Steps** (Stage 1+):

- Implement n8n workflow equivalents (Document Processing, Summary Generation, etc.)
- Add RAG infrastructure (Qdrant + Jina-v3 embeddings)
- Create course generation job handlers
- Build frontend UI for course generation

---

## Maintenance

### When to Update This Document

- Adding a new package to the monorepo
- Changing import rules or dependencies
- Refactoring file structure within packages
- After significant architecture changes

### Verification

Run the structure verification script:

```bash
pnpm --filter @megacampus/course-gen-platform verify:structure
```

---

## Summary

| Package                  | Responsibility              | Can Import From     | Imported By                   |
| ------------------------ | --------------------------- | ------------------- | ----------------------------- |
| `shared-types`           | Type definitions & schemas  | `zod` only          | All other packages            |
| `course-gen-platform`    | Main API server             | `shared-types`      | None (server entrypoint)      |
| `trpc-client-sdk`        | External client SDK         | `shared-types`      | External clients (frontends)  |

**Golden Rules**:

1. ✅ `shared-types` is the source of truth for types
2. ✅ Import direction: `course-gen-platform` → `shared-types` ← `trpc-client-sdk`
3. ✅ No circular dependencies allowed
4. ✅ Target 200-300 lines per file (max 500)
5. ✅ One responsibility per file
6. ✅ Type safety everywhere - use Zod for validation
