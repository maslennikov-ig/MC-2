# Implementation Plan: Open edX LMS Integration

**Branch**: `feature/openedx-integration` | **Date**: 2025-12-11 | **Updated**: 2025-12-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20-openedx-integration/spec.md`
**Reference**: [Original Technical Spec](../../../docs/openEDX/spec-openedx-integration.md)

## Summary

Implement an LMS-agnostic integration module with Open edX as the first adapter. The architecture supports future LMS backends (Moodle, Canvas) through abstract interfaces. The integration converts Stage 5/6 output to OLX format, packages as .tar.gz, uploads via Course Import REST API, and polls for completion.

## Technical Context

**Language/Version**: TypeScript 5.3+ (Strict Mode)
**Primary Dependencies**:
- `archiver` (v7.x) - Generate .tar.gz archives
- `axios` (v1.7.x) - HTTP client with retry support
- `form-data` (v4.x) - Multipart form uploads
- `any-ascii` (v0.3.x) - Unicode to ASCII transliteration (supports all 19 platform languages)
- `zod` (v3.22.x) - Runtime validation
- Existing: pino logger, tRPC, Supabase

**Storage**: PostgreSQL (Supabase) for LMS configurations and import job history
**Testing**: Vitest for unit (100% coverage), integration (mocked API), E2E (real Open edX)
**Target Platform**: Node.js 20+ (backend service within course-gen-platform)
**Project Type**: Backend service module within monorepo

**Performance Goals** (NFRs):
| Metric | Target | Measurement |
|--------|--------|-------------|
| OLX generation (50 units) | <5 seconds | Benchmark test |
| Package upload (5MB) | <10 seconds | Integration test |
| End-to-end pipeline | <30 seconds | E2E test |
| Connection test | <10 seconds | Unit test |

**Constraints**:
- 100MB maximum package size (validated before upload per FR-007)
- Retry failed operations up to 3 times with exponential backoff (1s, 2s, 4s)
- UTF-8 encoding for all content
- Polling interval: 2-5 seconds for import status checks (FR-005)
- OAuth2 token refresh: Proactive refresh before expiry during long-running operations (FR-003)

**Scale/Scope**:
- Support multiple LMS instances per organization
- Concurrent publishing operations (with database-level unique constraint to prevent conflicts)
- Import Job state model: Pending → Processing → Completed / Failed (4-state model)

## Architecture Decision: Package Location

**Decision**: Module within `course-gen-platform` (not separate package)

**Rationale**:
- Tight coupling with existing logger, auth middleware, DB types
- No immediate need for standalone deployment
- Simpler monorepo management
- Future: Extract to `packages/lms-integration/` when Moodle/Canvas needed

**Trade-off**: Less reusable, but faster initial delivery.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Context-First Architecture | PASS | Analyzed existing DB schema, auth patterns, Stage 5/6 output |
| II. Single Source of Truth | PASS | Types in `shared-types`; adapter interface for LMS abstraction |
| III. Strict Type Safety | PASS | Zod schemas, typed error classes, CourseInput adapter |
| IV. Atomic Evolution | PASS | Tasks broken into small units with `/push patch` |
| V. Quality Gates & Security | PASS | RLS policies, role-based permissions, credential encryption |
| VI. Library-First Development | PASS | archiver, axios, cyrillic-to-translit-js; custom OLX (no lib exists) |
| VII. Task Tracking & Artifacts | PASS | tasks.md with artifact paths |

## Project Structure

### Documentation (this feature)

```text
specs/20-openedx-integration/
├── plan.md              # This file
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity definitions, DB schema, error classes
├── quickstart.md        # Developer onboarding guide
├── contracts/           # API specifications
│   └── trpc-routes.md   # tRPC procedure definitions
└── tasks.md             # Implementation tasks (Phase 2)
```

### Source Code (repository root)

```text
packages/
├── shared-types/src/
│   ├── lms/
│   │   ├── index.ts                # Public exports
│   │   ├── adapter.ts              # LMSAdapter abstract interface
│   │   ├── config.ts               # BaseLMSConfig, OpenEdXConfig schemas
│   │   ├── course-input.ts         # CourseInput adapter schema (Stage 5 → LMS)
│   │   ├── errors.ts               # LMSIntegrationError hierarchy
│   │   ├── import-job.ts           # Import job types
│   │   └── olx-types.ts            # OLX structure types (Open edX specific)
│   └── index.ts                    # Re-export lms/*
│
├── course-gen-platform/src/
│   ├── integrations/
│   │   ├── lms/
│   │   │   ├── index.ts            # Factory: createLMSAdapter()
│   │   │   ├── base-adapter.ts     # Abstract LMSAdapter implementation
│   │   │   └── openedx/
│   │   │       ├── index.ts        # OpenEdXAdapter export
│   │   │       ├── adapter.ts      # OpenEdXAdapter class
│   │   │       ├── api-client.ts   # OAuth2 + Import API client
│   │   │       ├── olx/
│   │   │       │   ├── generator.ts      # Course → OLX conversion
│   │   │       │   ├── packager.ts       # OLX → tar.gz
│   │   │       │   ├── validators.ts     # Pre-packaging validation
│   │   │       │   ├── url-name-registry.ts  # Unique url_name tracking
│   │   │       │   └── templates/
│   │   │       │       ├── course.ts
│   │   │       │       ├── chapter.ts
│   │   │       │       ├── sequential.ts
│   │   │       │       ├── vertical.ts
│   │   │       │       ├── html.ts
│   │   │       │       └── policies.ts   # policy.json, grading_policy.json
│   │   │       └── utils/
│   │   │           ├── transliterate.ts
│   │   │           └── xml-escape.ts
│   │   │
│   └── server/routers/
│       └── lms/
│           ├── index.ts              # Router merge
│           ├── config.router.ts      # LMS configuration CRUD
│           ├── publish.router.ts     # Course publishing
│           ├── status.router.ts      # Import status, course status
│           └── history.router.ts     # Import history
│
└── web/
    └── app/[locale]/(dashboard)/courses/[slug]/
        └── lms/
            └── page.tsx              # LMS publishing UI (Phase 2+)

packages/course-gen-platform/tests/
├── unit/
│   └── integrations/lms/openedx/
│       ├── olx-generator.test.ts
│       ├── olx-packager.test.ts
│       ├── transliterate.test.ts
│       ├── url-name-registry.test.ts
│       └── validators.test.ts
├── integration/
│   ├── lms-api-client.test.ts    # Mocked HTTP
│   └── lms-full-pipeline.test.ts # JSON → OLX → tar.gz
└── e2e/
    └── openedx-import.test.ts    # Real Open edX (CI optional)
```

**Structure Decision**: Module in `course-gen-platform` with LMS adapter interface in `shared-types` for future extensibility.

## Key Design Elements

### 1. LMS Adapter Interface (Future-Proof)

```typescript
// packages/shared-types/src/lms/adapter.ts
abstract class LMSAdapter<TConfig extends BaseLMSConfig> {
  abstract get type(): string;
  abstract publishCourse(input: CourseInput): Promise<PublishResult>;
  abstract getCourseStatus(courseId: string): Promise<CourseStatus>;
  abstract deleteCourse(courseId: string): Promise<boolean>;
  abstract validateConfig(): Promise<boolean>;
  abstract testConnection(): Promise<TestConnectionResult>;
}
```

### 2. CourseInput Adapter (Stage 5/6 → LMS)

```typescript
// packages/shared-types/src/lms/course-input.ts
CourseInputSchema = z.object({
  courseId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string(),
  description: z.string().optional(),
  org: z.string(),
  run: z.string(),
  startDate: z.string().datetime().optional(),
  enrollmentStart: z.string().datetime().optional(),
  language: languageSchema.default('ru'), // From @megacampus/shared-types (19 languages)
  chapters: z.array(ChapterInputSchema),
});
```

### 3. Error Class Hierarchy

```typescript
// packages/shared-types/src/lms/errors.ts
LMSIntegrationError (base)
├── OLXValidationError      // Invalid OLX structure
├── OpenEdXAuthError        // OAuth2 failure
├── OpenEdXImportError      // Import process failed
├── LMSNetworkError         // Connection issues
└── LMSTimeoutError         // Operation timeout
```

### 4. OLX Policy Files

Generated files in `policies/{run}/`:
- `policy.json` - Course policies (enrollment dates, visibility)
- `grading_policy.json` - Grading configuration (pass/fail for now)

### 5. Static Assets Support

- Images referenced via absolute URLs (no local upload)
- Validation warns on relative paths or broken references
- Future: Static file upload to Open edX storage

### 6. Role-Based Permissions

| Operation | Required Role | Middleware |
|-----------|---------------|------------|
| Publish Course | instructor+ | `requireInstructor` |
| View Import Status | instructor+ | `requireInstructor` |
| Get Course Status (LMS) | instructor+ | `requireInstructor` |
| Configure LMS | admin+ | `requireAdmin` |
| Delete from LMS | admin+ | `requireAdmin` |

### 7. Unsupported Content Handling

- System MUST fail entire import if unsupported content types detected (video, quizzes)
- Error message MUST list all unsupported elements clearly
- Prevents partial course publication (FR-007)

## Supported OLX Elements

| Element | Open edX Name | MegaCampus Mapping |
|---------|---------------|-------------------|
| Course Shell | `<course>` | Course metadata |
| Chapter | `<chapter>` | Section |
| Sequential | `<sequential>` | Lesson (subsection) |
| Vertical | `<vertical>` | Unit container |
| HTML Component | `<html>` | Lesson content |
| Policies | `policy.json` | Course settings |

**Out of Scope (Phase 1)**:
- Video components
- Problem/Quiz (Capa)
- Discussion forums
- Advanced grading
- LTI integrations

## Complexity Tracking

| Violation | Why Needed | Alternative Rejected |
|-----------|------------|---------------------|
| Abstract LMSAdapter | Future Moodle/Canvas support | Direct OpenEdX-only implementation - no extensibility |
| any-ascii library | Platform supports 19 languages (Cyrillic, Arabic, CJK, Thai, Devanagari, Bengali, Latin+diacritics) | Custom transliteration - impossible to maintain for 19 languages |

## Implementation Phases

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1: Foundation** | 2 days | Package setup, logger integration, transliteration, url_name utilities, unit tests |
| **Phase 2: OLX Generator** | 2 days | XML templates, OLXGenerator, packager, validators, policy templates |
| **Phase 3: API Client** | 2 days | OAuth2 auth, import API, polling, error handling |
| **Phase 4: Adapter & Integration** | 2 days | LMSAdapter interface, OpenEdXAdapter, factory, tRPC routes |
| **Phase 5: E2E & Docs** | 1 day | E2E tests, benchmarks, documentation |

**Total Estimated**: 7-9 days

## Acceptance Criteria

| ID | Criterion | Validation |
|----|-----------|------------|
| AC-001 | Unit tests pass (100% coverage core) | `pnpm test` |
| AC-002 | Integration tests pass | `pnpm test:integration` |
| AC-003 | TypeScript strict compiles | `pnpm type-check` |
| AC-004 | Cyrillic content → valid OLX | Fixture tests |
| AC-005 | Generated OLX imports via Studio UI | Manual E2E |
| AC-006 | Performance meets NFRs | Benchmark tests |
| AC-007 | Errors logged to DB | Error service test |
| AC-008 | Role-based auth enforced | Auth middleware tests |
| AC-009 | LMSAdapter interface supports future LMS | Code review |
