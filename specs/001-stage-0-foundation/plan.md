# Implementation Plan: Stage 0 - Foundation

**Branch**: `001-stage-0-foundation` | **Date**: 2025-10-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-stage-0-foundation/spec.md`

**Note**: This is Stage 0 ONLY - foundation infrastructure setup. No workflow implementation yet.

## Summary

Stage 0 establishes the foundational infrastructure for migrating from n8n to code-based architecture. This includes:

- **Database**: Supabase PostgreSQL with complete schema (8 tables + RLS policies)
- **Authentication**: Supabase Auth with JWT + OAuth (Google, GitHub)
- **Authorization**: Role-based access control (Admin, Instructor, Student) with RLS enforcement
- **Orchestration**: BullMQ with Redis for async job processing
- **API Layer**: tRPC server with type-safe endpoints
- **RAG Infrastructure**: Qdrant Cloud (vector storage) + Jina-embeddings-v3 (embeddings)
- **File Management**: Tier-based validation (format, size, quota)
- **Monorepo**: TypeScript workspace with strict type checking
- **CI/CD**: GitHub Actions for testing and deployment

This stage is purely infrastructure - no workflow logic from n8n is implemented yet. It establishes the technical foundation required for Stages 1-8.

## Technical Context

**Language/Version**: TypeScript 5.3+ with Node.js 20+
**Primary Dependencies**:

- tRPC 11.x (API layer)
- BullMQ 5.x (job orchestration)
- Supabase client 2.x (database + auth)
- Qdrant client 1.x (vector storage)
- Redis 7.x (queue backend)
- Zod 3.x (schema validation)

**Storage**:

- PostgreSQL via Supabase (course data, user management)
- Redis (BullMQ job queue)
- Qdrant Cloud (vector embeddings)
- Local filesystem (file uploads, will migrate to S3-compatible later)

**Testing**:

- Vitest (unit tests)
- Playwright (E2E tests)
- Supertest (API integration tests)

**Target Platform**: Linux server (Ubuntu 20.04+), Docker containers
**Project Type**: Monorepo (multiple packages)
**Performance Goals**:

- tRPC: <200ms p95 latency
- BullMQ: 100+ jobs/sec throughput
- Vector search: <30ms p95 latency

**Constraints**:

- 100MB max file size
- Qdrant free tier: 1GB (3-5 courses)
- Jina-v3 rate limit: 1500 RPM

**Scale/Scope**:

- Stage 0: 3-5 test courses
- Production target: 50-100 courses, 10-20 organizations

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### ✅ I. Reliability First

- **Status**: PASS (with implementation plan)
- Database migrations include rollback capability
- BullMQ jobs designed with retry + exponential backoff
- RLS policies enforce data integrity at database level
- File validation prevents corrupt uploads
- Error scenarios documented in spec (edge cases section)
- **Action**: Implement graceful degradation for Qdrant/Jina-v3 downtime in Phase 1

### ✅ II. Atomicity & Modularity

- **Status**: PASS (enforced in project structure)
- Monorepo structure separates concerns: orchestrator, workers, ai-toolkit, api, database, shared
- Each package has single responsibility
- 200-300 line file limit enforced via linting rules
- No workflow logic in Stage 0 (pure infrastructure)
- **Action**: Document module boundaries in data-model.md (Phase 1)

### ✅ III. Spec-Driven Development

- **Status**: PASS (following process)
- Detailed spec created: `/specs/001-stage-0-foundation/spec.md`
- This plan document: `plan.md`
- Phase 0: Will generate `research.md` for technology validation
- Phase 1: Will generate `data-model.md`, `contracts/`, `quickstart.md`
- Phase 2: Will generate `tasks.md` via `/speckit.tasks` command
- **Action**: Complete Phase 0 research before any implementation

### ✅ IV. Incremental Testing

- **Status**: PASS (test plan defined)
- Unit tests: All validation logic, utilities
- Integration tests: Database migrations, tRPC endpoints, BullMQ job processing
- Contract tests: Supabase Auth JWT validation, RLS policy enforcement
- E2E tests: File upload → validation → storage workflow
- Test coverage tracked but not blocking
- **Action**: Define test fixtures in Phase 1 (data-model.md)

### ✅ V. Observability & Monitoring

- **Status**: PASS (planned in spec NFR-001 to NFR-004)
- Structured logging: JSON format with contextual fields (jobId, organizationId, timestamp)
- BullMQ metrics: job duration, success/failure rates, retry counts
- BullMQ UI: Real-time queue visualization
- Logs queryable by jobId, organizationId, status, time range
- **Action**: Implement logging utilities in shared package (Phase 1)

### ✅ VI. Multi-Tenancy & Scalability

- **Status**: PASS (core design)
- Database RLS policies enforce organization-level isolation
- File storage structure: `/uploads/{organizationId}/{courseId}/`
- JWT claims include organization_id for request-level filtering
- Qdrant payload filtering by course_id, organization_id
- BullMQ horizontal scaling supported (multiple workers)
- **Action**: Document RLS policy design in data-model.md (Phase 1)

### ✅ VII. AI Model Flexibility

- **Status**: PASS (for Stage 0 scope)
- Jina-embeddings-v3 selected for embeddings (configurable via environment variable)
- Task-specific embeddings: "retrieval.passage" vs "retrieval.query"
- Migration path to self-hosted Jina-v3 documented (FR-020)
- OpenRouter integration planned for Stage 3+ (summarization, generation)
- **Action**: Document embedding configuration in research.md (Phase 0)

### Summary

**All constitution principles PASS** for Stage 0 scope. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```
specs/001-stage-0-foundation/
├── spec.md              # Input specification (DONE)
├── plan.md              # This file (IN PROGRESS)
├── research.md          # Phase 0 output (PENDING)
├── data-model.md        # Phase 1 output (PENDING)
├── quickstart.md        # Phase 1 output (PENDING)
├── contracts/           # Phase 1 output (PENDING)
│   ├── database-schema.sql  # SQL DDL for all tables
│   ├── trpc-routes.ts       # tRPC router type definitions
│   └── bullmq-jobs.ts       # BullMQ job type definitions
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
# Monorepo structure (pnpm workspaces)
packages/
├── course-gen-platform/     # Main API server (tRPC + orchestrator entry)
│   ├── src/
│   │   ├── server/          # tRPC server setup
│   │   │   ├── routers/     # API routers (generation, admin, billing)
│   │   │   ├── middleware/  # Auth, rate limiting
│   │   │   └── trpc.ts      # tRPC context + procedures
│   │   ├── orchestrator/    # BullMQ job orchestration
│   │   │   ├── queue.ts     # Queue setup
│   │   │   ├── worker.ts    # Job worker
│   │   │   └── handlers/    # Job handlers (initialize, error-handler)
│   │   └── shared/          # Shared utilities
│   │       ├── supabase/    # Supabase client
│   │       ├── logger/      # Structured logging
│   │       └── cache/       # Redis caching
│   ├── supabase/
│   │   └── migrations/      # SQL migration files
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── e2e/
│
├── shared-types/            # Shared TypeScript types
│   └── src/
│       ├── database.generated.ts  # Supabase generated types
│       └── zod-schemas.ts         # Zod validation schemas
│
└── trpc-client-sdk/         # tRPC client SDK for external consumers
    └── src/
        └── index.ts         # Exported client + types

# Root configuration
pnpm-workspace.yaml          # pnpm workspace config
tsconfig.json                # Root TypeScript config
.github/
└── workflows/
    ├── test.yml             # CI: run tests on PR
    └── deploy.yml           # CD: deploy to staging/production
```

**Structure Decision**: Monorepo with 3 packages chosen because:

1. **course-gen-platform**: Main server combining tRPC API + BullMQ orchestrator (single deployment unit)
2. **shared-types**: Database types + Zod schemas shared across packages (DRY principle)
3. **trpc-client-sdk**: External client library for LMS integration (published separately)

This satisfies the atomicity principle (clear boundaries) while avoiding over-engineering (no unnecessary micro-packages).

## Complexity Tracking

_No constitution violations - this section is empty._

## Phase 0: Technology Decision Research (PREREQUISITE - User Conducted)

**⚠️ IMPORTANT**: This phase is conducted by the user BEFORE implementation begins. Results must be provided in `research.md` before proceeding to Phase 1.

**Goal**: Document technology selection decisions and architectural choices (NOT technical implementation details).

### Research Tasks (User Executes)

These are **strategic technology choices**, not technical "how-to" questions:

1. **Database Provider Selection**
   - **Decision**: Supabase free tier vs paid plan vs alternatives
   - **Considerations**: Budget, resource needs, scalability
   - **Alternatives**: Self-hosted PostgreSQL, Neon, PlanetScale
   - **Outcome**: Document chosen tier and rationale

2. **Vector Storage Selection**
   - **Decision**: Qdrant Cloud free tier (1GB) vs production tier vs alternatives
   - **Considerations**: Stage 0 scope (courses without documents), expected growth
   - **Migration trigger**: When to upgrade to production tier (# of courses, storage)
   - **Alternatives**: Pinecone, Weaviate, pgvector, Chroma
   - **Outcome**: Confirm free tier sufficient for Stage 0, define upgrade criteria

3. **Embeddings Provider Selection**
   - **Decision**: Jina-v3 vs alternatives
   - **Considerations**: Cost ($0.02/M tokens), quality (>95% recall), Russian language support
   - **Alternatives**: Voyage-3.5, OpenAI text-embedding-3, Cohere, self-hosted models
   - **Migration path**: When to self-host (>20GB data, >100K queries/month)
   - **Outcome**: Confirm Jina-v3 API for Stage 0, document migration criteria

4. **Redis Deployment Decision**
   - **Decision**: Local Redis vs managed service (Upstash, Redis Cloud)
   - **Considerations**: Development convenience vs production readiness
   - **Outcome**: Local for Stage 0, managed for production

5. **OAuth Provider Setup**
   - **Decision**: Which OAuth providers to enable (Google, GitHub, others?)
   - **Action**: Obtain OAuth credentials (Client ID/Secret) if enabling
   - **Outcome**: Document enabled providers and credential availability

### Deliverable: research.md (User Provides)

User creates `specs/001-stage-0-foundation/research.md` with format:

```markdown
# Research: Stage 0 - Foundation

## 1. Database Provider Selection

**Decision**: Supabase [free tier / paid plan]
**Rationale**: [Budget constraints, sufficient for Stage 0 development]
**Alternatives Considered**: Self-hosted PostgreSQL (too much ops overhead), Neon (no RLS), PlanetScale (MySQL not PostgreSQL)

## 2. Vector Storage Selection

**Decision**: Qdrant Cloud free tier (1GB)
**Rationale**: Stage 0 will have courses without documents, 1GB sufficient
**Upgrade Trigger**: When reaching 50+ courses or 1M+ vectors
**Alternatives Considered**: Pinecone (expensive), Weaviate (complex), pgvector (insufficient recall)

## 3. Embeddings Provider Selection

**Decision**: Jina-embeddings-v3 API
**Rationale**: Best cost ($0.02/M tokens), quality (>95% recall), Russian support
**Self-hosting Trigger**: >20GB indexed data or >100K queries/month
**Alternatives Considered**: Voyage-3.5 (3x more expensive), OpenAI (no Russian optimization)

## 4. Redis Deployment Decision

**Decision**: Local Redis for Stage 0, Upstash for production
**Rationale**: Fast local development, managed service for production reliability

## 5. OAuth Provider Setup

**Decision**: Enable Google + GitHub OAuth
**Status**: Credentials obtained [YES/NO - provide if YES]
**Google Client ID**: [if available]
**GitHub OAuth App**: [if available]
```

**Note**: Technical implementation details (RLS setup, JWT configuration, BullMQ setup) will be researched by agent using Context7 in Phase 1.

## Phase 0.5: Subagent Orchestration Setup

**Prerequisites**: research.md complete with technology decisions

**Role Definition**: Main agent acts as **orchestrator**, delegating specialized tasks to subagents.

### 1. Subagent Analysis & Creation (T-001, T-001.1)

**Goal**: Identify and create specialized subagents needed for Stage 0 implementation.

**Process**:

1. Main agent analyzes all 97 tasks in tasks.md
2. Identifies task categories requiring specialization:
   - Database schema design & migrations
   - API development & authentication
   - Infrastructure setup (Supabase, Qdrant, Redis)
   - Testing & validation
   - Documentation writing
3. Checks existing subagents in `.claude/agents/`
4. Uses meta-agent to create missing subagents:
   - `database-architect` - Schema design, migrations, RLS policies
   - `api-builder` - tRPC routers, auth middleware
   - `infrastructure-specialist` - Service setup, config
   - `integration-tester` - Acceptance tests
   - `technical-writer` - Documentation

**Orchestration Principle**: Main agent delegates to subagents, reviews outputs, ensures integration. Simple/coordination tasks executed directly.

**Duration**: 1-2 hours
**Output**: All required subagents created and ready

---

## Phase 1: Design & Contracts

**Prerequisites**:

1. research.md complete with technology decisions
2. All required subagents created (Phase 0.5 complete)

### 0. Technical Implementation Research (Orchestrator Executes via Context7 MCP)

Before design, agent researches technical "how-to" questions using Context7 MCP:

**Supabase Documentation:**

- RLS policy syntax and best practices
- JWT custom claims configuration in Supabase Auth
- OAuth provider setup (Google, GitHub)
- Database migration patterns

**BullMQ Documentation:**

- Queue setup with Redis
- Worker configuration
- Retry mechanisms and exponential backoff
- BullMQ UI integration

**Qdrant Documentation:**

- Collection creation with HNSW index
- Payload filtering for multi-tenancy
- Batch vector upload

**General:**

- MIME type validation best practices
- Rate limiting patterns with Redis

**Duration**: 1-2 hours
**Output**: Implementation knowledge for design phase (not separate document)

### 1. Data Model Design (data-model.md)

Extract entities from spec and design database schema:

**Core Entities**:

- Organization (tenant root)
- User (with role enum: admin, instructor, student)
- Course → Section → Lesson → LessonContent (normalized hierarchy)
- FileCatalog (uploaded documents with vector_status tracking)
- CourseEnrollment (student-course relationships)

**Vector Storage**:

- Qdrant collection schema (payload structure, index config)
- Synchronization strategy between PostgreSQL and Qdrant

**RLS Policies**:

- Admin: full organization access
- Instructor: own courses only
- Student: enrolled courses only

### 2. API Contracts (contracts/)

Generate API contracts from functional requirements:

**contracts/database-schema.sql**:

- SQL DDL for all tables
- RLS policy definitions
- Indexes for query optimization
- Triggers for audit logging

**contracts/trpc-routes.ts**:

- tRPC router type definitions
- Input validation schemas (Zod)
- Output types
- Authentication middleware requirements

**contracts/bullmq-jobs.ts**:

- Job type definitions (for future stages)
- Job data schemas
- Queue configuration

### 3. Quickstart Guide (quickstart.md)

Developer onboarding document:

- Prerequisites (Node.js 20+, pnpm, Docker)
- Local setup steps
- Environment variable configuration
- Running migrations
- Starting development servers
- Running tests

### 4. Agent Context Update

Run agent context update script to preserve AI assistant knowledge:

```bash
.specify/scripts/bash/update-agent-context.sh claude
```

This updates `.specify/memory/agent-context-claude.md` with:

- New technologies: Qdrant, Jina-v3, Supabase Auth, BullMQ
- Architecture patterns: monorepo, RLS, multi-tenancy
- Preserves manual additions between markers

### Deliverables (Phase 1)

- ✅ data-model.md
- ✅ contracts/database-schema.sql
- ✅ contracts/trpc-routes.ts
- ✅ contracts/bullmq-jobs.ts
- ✅ quickstart.md
- ✅ Updated agent context file

## Phase 2: Task Generation (BLOCKED - requires /speckit.tasks command)

**This phase is NOT executed by /speckit.plan**. After Phase 1 completes, run:

```bash
/speckit.tasks
```

This will generate `tasks.md` with concrete implementation tasks organized by priority.

## Post-Phase 1: Constitution Re-Check

After design artifacts are complete, re-evaluate constitution compliance:

### Expected Changes:

- **Atomicity verified**: Each package has clear responsibility, file size limits enforced
- **Data model normalized**: Course hierarchy prevents duplication
- **Testing strategy defined**: Unit, integration, contract, E2E test boundaries clear
- **Observability implemented**: Logging utilities in shared package

### Potential Issues:

- **None anticipated** - Stage 0 is pure infrastructure with no complex workflows

## Implementation Blockers

### Critical (must resolve before Phase 0):

- None - all prerequisites available

### Important (resolve during Phase 0):

- Google OAuth Client ID/Secret (requires Google Cloud Console access)
- GitHub OAuth App credentials (requires GitHub organization admin)
- Qdrant Cloud account creation
- Supabase project creation (requires credit card for paid plan if needed)

### Nice-to-have (can defer):

- Production Redis instance (use local for now)
- S3-compatible storage (use local filesystem for Stage 0)

## Success Criteria Validation

This plan addresses all 24 success criteria from spec.md:

**Database (SC-001 to SC-005)**: Phase 1 data-model.md + contracts/database-schema.sql
**Auth (SC-006 to SC-014)**: Phase 0 research + Phase 1 tRPC auth middleware design
**Orchestration (SC-015)**: Phase 1 BullMQ job type definitions
**Monorepo (SC-016)**: Project structure documented above
**RAG (SC-017 to SC-020)**: Phase 0 Qdrant/Jina-v3 research + Phase 1 vector schema design
**CI/CD (SC-021)**: Phase 1 GitHub Actions workflow design
**File Management (SC-022, SC-023)**: Phase 1 file validation logic design
**Readiness (SC-024)**: Validated by passing all acceptance scenarios in spec

## Timeline Estimate

**Phase 0 (Technology Decisions)**: 0.5-1 day (User)

- Document strategic technology choices (not technical implementation)
- Obtain OAuth credentials if enabling providers
- Define upgrade/migration triggers

**Phase 0.5 (Subagent Setup)**: 1-2 hours (Orchestrator)

- Analyze required subagents (T-001): 30 min
- Create missing subagents via meta-agent (T-001.1): 30-90 min
- Verify subagents ready: 15 min

**Phase 1 (Design)**: 2-3 days (Orchestrator + Subagents)

- Orchestrator Context7 research (T000): 1-2 hours
- Design artifacts: 2-3 days (delegated to subagents)
- data-model.md: 1 day
- contracts/: 1 day
- quickstart.md: 0.5 day

**Phase 2 (Task Generation)**: 0.5 day

- Run /speckit.tasks command
- Review and adjust task breakdown

**Total Planning Time**: 4-6 days before implementation begins

## Notes

- **Stage 0 is infrastructure only** - no workflow logic from n8n stages 1-8
- **All implementation happens in /speckit.implement** - this command stops after planning
- **Next steps**: Complete Phase 0 research → Phase 1 design → /speckit.tasks → /speckit.implement
