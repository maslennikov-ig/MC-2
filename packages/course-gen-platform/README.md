# Course Generation Platform

A multi-tenant course generation platform built with tRPC, Supabase, and BullMQ.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Docker (for local Supabase)
- Supabase CLI

### Installation

```bash
# Install dependencies
pnpm install

# Start local Supabase
supabase start

# Run migrations
supabase db reset
```

## Development

### Running the Development Server

```bash
pnpm dev
```

### Testing

#### TypeScript Tests (Unit & Integration)

```bash
pnpm test          # Run all TypeScript tests
pnpm test:watch    # Watch mode
```

#### RLS Policy Tests (pgTAP)

```bash
pnpm test:rls      # Run RLS policy tests
```

**Test Coverage:**

- ✅ Multi-tenant data isolation (organizations)
- ✅ Role-based access control (admin/instructor/student)
- ✅ Cross-organization data protection
- ✅ CRUD permissions per role
- ✅ Enrollment access controls

**Test Scenarios (24 total):**

1. **Admin Access** (3 tests)
   - Admin sees all courses in their organization
   - Admin cannot see other organization courses
   - Admin sees all users in their organization

2. **Instructor Read Access** (2 tests)
   - Instructor can read all organization courses
   - Instructor cannot see other organization courses

3. **Instructor Write Access** (4 tests)
   - Instructor can update own courses
   - Instructor cannot update other instructor's courses
   - Instructor can delete own courses
   - Instructor cannot delete other instructor's courses

4. **Student Read Access** (3 tests)
   - Student sees only enrolled courses
   - Student cannot see non-enrolled courses (same org)
   - Student cannot see other organization courses

5. **Student Cannot Create Courses** (2 tests)
   - Student INSERT is blocked (RLS violation)
   - Student cannot impersonate instructor role

6. **Student Cannot Modify Courses** (2 tests)
   - Student UPDATE affects 0 rows
   - Student DELETE affects 0 rows

7. **Organization Data Isolation** (4 tests)
   - Org 1 admin cannot see Org 2 courses
   - Org 1 instructor cannot see Org 2 courses
   - Org 1 student cannot see Org 2 courses
   - Org 2 user cannot see Org 1 courses

8. **Cross-Organization Enforcement** (4 tests)
   - Student from Org 2 cannot see Org 1 courses
   - Org 2 student cannot see Org 1 course by ID
   - Instructor from Org 1 cannot modify Org 2 courses
   - Admin from Org 1 cannot delete Org 2 courses

**Test Files:**

- `supabase/tests/database/000-setup-test-helpers.sql` - pgTAP setup and utilities
- `supabase/tests/database/001-rls-policies.test.sql` - Main RLS test suite (24 tests)

**Test Execution:**

- All tests run in transactions with automatic ROLLBACK
- Test execution time: < 1 second
- Uses JWT claims mocking for authentication context

### Run All Tests

```bash
pnpm test:all      # Run both TypeScript and pgTAP tests
```

## Project Structure

```
packages/course-gen-platform/
├── src/
│   ├── orchestrator/       # BullMQ job orchestration
│   ├── server/             # tRPC API server
│   └── shared/             # Shared utilities
├── supabase/
│   ├── migrations/         # Database migrations
│   └── tests/             # pgTAP RLS tests
├── tests/                  # TypeScript tests
└── package.json
```

## Database

### Migrations

Run migrations:

```bash
supabase db reset          # Reset and run all migrations
supabase migration new <name>  # Create new migration
```

### Row Level Security (RLS)

All tables have RLS policies enforcing multi-tenant isolation and role-based access control.

**Security Model:**

- **Organizations**: Tenant isolation boundary
- **Roles**: `admin`, `instructor`, `student`
- **JWT Claims**: `organization_id`, `role`, `user_id`

**Key Tables:**

- `organizations` - Multi-tenant organizations
- `users` - User profiles with roles
- `courses` - Courses owned by instructors
- `course_enrollments` - Student enrollments
- `sections`, `lessons`, `lesson_content` - Course structure
- `file_catalog` - File metadata
- `job_status` - Generation job tracking

### Testing RLS Policies

See `supabase/tests/README.md` for detailed testing documentation.

## Architecture

### tRPC API (Multi-Client Ready)

**Primary API**: tRPC provides type-safe endpoints accessible from any HTTP client.

**Key Endpoints:**
- `generation.initiate` - Start course generation (T011-T019 orchestration)
- `generation.uploadFile` - Upload files with tier validation
- `jobs.getStatus` - Query job progress
- `jobs.cancel` - Cancel running job
- `jobs.list` - List user's jobs

**TypeScript Client Example:**
```typescript
import { trpc } from '@/lib/trpc';

const result = await trpc.generation.initiate.mutate({
  courseId: 'uuid-here',
  webhookUrl: 'https://example.com/webhook'
});
// { success: true, jobId: '...', message: '...', courseId: '...' }
```

**Non-TypeScript Client Example (PHP):**
```php
$ch = curl_init('https://api.megacampus.ai/trpc/generation.initiate');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $jwt_token,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'courseId' => $uuid,
    'webhookUrl' => 'https://lms.example.com/webhook'
]));
$response = curl_exec($ch);
```

**Documentation:**
- **Full API Reference**: `../../docs/API.md`
- **LMS Integration Guide**: `../../docs/LMS-INTEGRATION-ROADMAP.md`

**Why tRPC for Multi-Client?**
- tRPC endpoints are standard HTTP POST requests
- Works with any language (PHP, Python, Ruby, Java, Go, etc.)
- TypeScript clients get bonus type inference
- No special protocol or build-time coupling required

### BullMQ Orchestration

- Multi-step job orchestration
- Progress tracking
- Error handling and retry logic (Saga pattern)
- Status updates via SSE

### Supabase

- PostgreSQL database with RLS
- Authentication via Supabase Auth (JWT tokens)
- Storage for generated content
- Cloud deployment (diqooqbuchsliypgwksu project)

## Environment Variables

```bash
# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `pnpm test:all`
6. Submit a pull request

## License

MIT
