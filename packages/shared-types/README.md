# @megacampus/shared-types

Shared TypeScript types and Zod schemas for the MegaCampusAI platform.

## Contents

- **database.generated.ts** - Auto-generated TypeScript types from Supabase database schema
- **zod-schemas.ts** - Zod validation schemas for API inputs and outputs
- **bullmq-jobs.ts** - Job type definitions and schemas for BullMQ orchestration

## Type Regeneration

### Database Types (database.generated.ts)

Database types are automatically generated from the Supabase schema. To regenerate:

1. **Using MCP Supabase Tool** (Recommended):

   ```typescript
   // In Claude Code or MCP-enabled environment:
   mcp__supabase__generate_typescript_types();
   ```

2. **Manual Regeneration**:
   - Ensure all database migrations are applied
   - Run the MCP Supabase generate types command
   - The tool will output types that should be written to `src/database.generated.ts`

### When to Regenerate

Regenerate database types when:

- New database migrations are applied
- Tables, columns, or enums are added/modified/removed
- New RLS policies are added that affect table relationships
- Database functions or views are added/updated

### Type-Safe Database Access

Import types from this package:

```typescript
import type { Database, Tables, Enums } from '@megacampus/shared-types/database.generated';

// Use table types
type Organization = Tables<'organizations'>;
type Course = Tables<'courses'>;

// Use enum types
type Tier = Enums<'tier'>; // 'free' | 'basic_plus' | 'standard' | 'premium'
type Role = Enums<'role'>; // 'admin' | 'instructor' | 'student'

// Full database type for Supabase client
import { createClient } from '@supabase/supabase-js';
const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
```

## Zod Schemas

Validation schemas for all API inputs:

```typescript
import {
  createCourseInput,
  fileUploadInput,
  listCourses,
} from '@megacampus/shared-types/zod-schemas';

// Validate input
const result = createCourseInput.safeParse(input);
if (result.success) {
  const { title, slug, organizationId } = result.data;
}
```

## BullMQ Job Types

Job schemas for the orchestration system:

```typescript
import { TestJobData, InitializeJobData, JOB_TYPES } from '@megacampus/shared-types/bullmq-jobs';

// Use job types
const job = await queue.add(JOB_TYPES.INITIALIZE, {
  courseId: '...',
  organizationId: '...',
  userId: '...',
} satisfies InitializeJobData);
```

## Development

```bash
# Type check
pnpm type-check

# Build
pnpm build

# Lint
pnpm lint
```

## Notes

- Database types are **read-only** - do not manually edit `database.generated.ts`
- Zod schemas should match database types where applicable
- All schema changes should be accompanied by database migrations
- Type generation uses MCP Supabase (not standard Supabase CLI)
