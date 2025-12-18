# Feature Specification: Stage 0 - Foundation

**Feature Branch**: `001-stage-0-foundation`
**Created**: 2025-10-10
**Status**: Draft
**Input**: User description: "Stage 0: Foundation - базовая инфраструктура для миграции с n8n на code-based архитектуру"

## Clarifications

### Session 2025-10-10

- Q: What level of observability is required for the BullMQ job processing system? → A: Standard - Structured logging + job metrics (duration, success rate) exposed via BullMQ UI
- Q: What user roles exist in the system and who can create/manage courses? → A: Three+ roles - Admin + Instructor (creates courses) + Student (read-only) with role-based permissions
- Q: What are the primary decision criteria for selecting the RAG library? → A: Quality and cost-effectiveness for production. Selected: Qdrant Cloud (vector storage with HNSW index for 95-99% recall) + Jina-embeddings-v3 (open-source embeddings with superior Russian/English support). Decision based on MVP testing showing pgvector + Gemini insufficient quality.
- Q: Which authentication provider/mechanism will be used? → A: Hybrid - Supabase Auth (primary JWT-based auth) + OAuth providers (Google, GitHub) for flexibility. Supports multiple external clients (LMS, frontend) with centralized user management.
- Q: What are the file upload constraints for document processing? → A: Tier-based limits with 100MB max per file. **Free tier**: 10 MB total, 0 files allowed (files prohibited). **Basic Plus**: 100 MB total, 1 file per course, PDF/TXT/MD only. **Standard**: 1 GB total, 3 files per course, PDF/TXT/MD/DOCX/HTML/PPTX. **Premium**: 10 GB total, 10 files per course, all formats including images (PNG/JPG/GIF/SVG/WebP).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Database Infrastructure Ready (Priority: P1)

As a developer, I need a production-ready database with schema and extensions configured so that I can build data-dependent features in subsequent stages.

**Why this priority**: All stages (1-8) require database access. Without this foundation, no feature development can begin. This is the critical blocking dependency.

**Independent Test**: Can be fully tested by connecting to the new Supabase project, running migrations, inserting test data into each table, and verifying relationships and constraints work correctly.

**Acceptance Scenarios**:

1. **Given** a new Supabase production project is created, **When** migrations are applied, **Then** all tables exist (organizations, users, courses, sections, lessons, lesson_content, file_catalog, course_enrollments) with correct schemas
2. **Given** the database schema is deployed, **When** organizations table is populated with tier data, **Then** tier enum values (free, basic_plus, standard, premium) are enforced with storage quotas
3. **Given** the database is configured with RLS policies, **When** Admin user queries courses, **Then** all organization courses are returned
4. **Given** the database is configured with RLS policies, **When** Instructor user queries courses, **Then** only their own courses are returned
5. **Given** the database is configured with RLS policies, **When** Student user queries courses, **Then** only enrolled courses are returned
6. **Given** test data is inserted, **When** querying course structure, **Then** normalized relationships (organizations → courses → sections → lessons → lesson_content) return correct data

---

### User Story 2 - Orchestration System Ready (Priority: P2)

As a developer, I need a working queue system with job processing capabilities so that I can implement asynchronous workflows in Stage 1 and beyond.

**Why this priority**: Stage 1 (Main Entry orchestrator) and all subsequent workflow stages require job queuing. Must be ready before any workflow implementation begins.

**Independent Test**: Can be fully tested by creating a test job, adding it to the BullMQ queue, processing it in a worker, and verifying job completion with status tracking.

**Acceptance Scenarios**:

1. **Given** Redis is running locally, **When** BullMQ is configured, **Then** a test queue accepts and processes jobs successfully
2. **Given** a job is added to the queue, **When** a worker processes it, **Then** job status updates are tracked and persisted
3. **Given** a job fails, **When** retry logic executes, **Then** the job is retried with exponential backoff up to configured max attempts
4. **Given** a job is cancelled, **When** the cancellation signal is sent, **Then** the job stops processing and updates status to "cancelled"

---

### User Story 3 - Type-Safe API Layer Ready (Priority: P2)

As a developer, I need a functioning tRPC server with type safety so that I can build frontend-backend communication for all features.

**Why this priority**: Frontend integration and API development for all stages require a working API layer. Equal priority with orchestration as they serve different needs.

**Independent Test**: Can be fully tested by starting the tRPC server, calling a test endpoint from a client, and verifying type-safe request/response handling.

**Acceptance Scenarios**:

1. **Given** the tRPC server is configured, **When** the server starts, **Then** it listens on the configured port and accepts connections
2. **Given** a test router is defined, **When** a client calls a tRPC procedure, **Then** the response is type-safe and matches the defined schema
3. **Given** Supabase Auth is configured, **When** a user authenticates with email/password, **Then** a valid JWT token is returned
4. **Given** OAuth providers are configured, **When** a user authenticates via Google/GitHub, **Then** user is created in Supabase and JWT token is returned
5. **Given** authentication middleware is configured, **When** an unauthenticated request (no JWT) is made to protected endpoint, **Then** the request is rejected with 401 error
6. **Given** a valid JWT is provided, **When** middleware validates the token, **Then** user context (user_id, role, organization_id) is extracted from JWT claims
7. **Given** role-based authorization middleware is configured, **When** a Student user attempts to create a course, **Then** the request is rejected with 403 authorization error
8. **Given** role-based authorization middleware is configured, **When** an Instructor user creates a course, **Then** the course is created with user_id set to the instructor's id
9. **Given** external clients (LMS, frontend) are configured, **When** they send requests with Supabase JWT, **Then** authentication works consistently across all clients
10. **Given** a file upload endpoint is defined, **When** Basic Plus organization uploads a PDF file under 100MB, **Then** the file is accepted and stored
11. **Given** a file upload endpoint is defined, **When** Basic Plus organization uploads a DOCX file, **Then** the upload is rejected with error listing allowed formats (PDF/TXT/MD)
12. **Given** a file upload endpoint is defined, **When** Premium organization uploads an image (PNG), **Then** the file is accepted and stored
13. **Given** a file upload endpoint is defined, **When** any organization uploads a file exceeding 100MB, **Then** the upload is rejected with file size limit error
14. **Given** an organization has consumed 90% of storage quota, **When** uploading a file that would exceed quota, **Then** the upload is rejected with quota exceeded error
15. **Given** a tRPC procedure is called, **When** an error occurs, **Then** the error is properly typed and returned to the client

---

### User Story 4 - Project Structure Established (Priority: P3)

As a developer, I need a well-organized monorepo structure so that I can develop features in parallel with clear module boundaries.

**Why this priority**: Enables parallel development and enforces architecture principles (atomicity, modularity). Not blocking for initial work but critical for scaling development.

**Independent Test**: Can be fully tested by verifying directory structure exists, importing modules across packages, and running build/lint commands successfully.

**Acceptance Scenarios**:

1. **Given** the monorepo structure is created, **When** inspecting the directory tree, **Then** all required packages exist (orchestrator, workers, ai-toolkit, api, database, shared)
2. **Given** TypeScript is configured, **When** building the project, **Then** all packages compile with strict type checking enabled
3. **Given** shared utilities exist, **When** importing from another package, **Then** imports resolve correctly and type information is available
4. **Given** linting is configured, **When** running linters, **Then** code follows consistent style across all packages

---

### User Story 5 - RAG Infrastructure Ready (Priority: P3)

As a developer, I need a production-ready RAG infrastructure (vector storage + embeddings) so that I can implement document processing and semantic search features consistently across stages.

**Why this priority**: Stages 2-6 involve AI/RAG features. Infrastructure setup prevents rework but doesn't block initial database/API development.

**Independent Test**: Can be fully tested by connecting to Qdrant Cloud, generating embeddings with Jina-v3, storing vectors, and performing semantic similarity search with test documents.

**Acceptance Scenarios**:

1. **Given** Qdrant Cloud free tier is provisioned, **When** creating a test collection, **Then** collection is created with HNSW index configuration (768 dimensions, cosine similarity)
2. **Given** Jina-v3 API is configured, **When** generating embeddings for test documents, **Then** embeddings are returned with 768 dimensions and task-specific optimization (retrieval.passage)
3. **Given** test documents are chunked and embedded, **When** uploading vectors to Qdrant, **Then** vectors are stored with metadata (course_id, chunk_text, organization_id)
4. **Given** vectors are stored in Qdrant, **When** performing semantic search with query embedding, **Then** top-K similar chunks are retrieved with >95% recall
5. **Given** multi-tenant data is stored, **When** searching with course_id filter, **Then** only vectors for specified course are returned (tenant isolation)
6. **Given** chunking strategies are tested, **When** processing documents of varying sizes, **Then** optimal chunk size (512-1024 tokens) and overlap (10-20%) are validated
7. **Given** the RAG workflow is complete, **When** testing end-to-end query, **Then** latency is <30ms p95 for vector search

---

### User Story 6 - CI/CD Pipeline Operational (Priority: P4)

As a developer, I need automated testing and deployment pipelines so that I can merge code confidently and deploy changes safely.

**Why this priority**: Important for quality but not blocking initial development. Can be added once code is being written.

**Independent Test**: Can be fully tested by pushing a commit, observing GitHub Actions run tests, and verifying build artifacts are created.

**Acceptance Scenarios**:

1. **Given** GitHub Actions is configured, **When** a commit is pushed, **Then** automated tests run and report pass/fail status
2. **Given** tests pass, **When** the workflow completes, **Then** build artifacts are generated and available
3. **Given** tests fail, **When** the workflow completes, **Then** the commit is blocked from merging and developer is notified
4. **Given** deployment is configured, **When** merging to main branch, **Then** automated deployment to staging environment occurs

---

### Edge Cases

- What happens when Supabase project creation fails during setup? (Rollback procedure, retry logic, manual intervention required)
- How does the system handle Redis connection loss during job processing? (Reconnection attempts, job persistence, graceful degradation)
- What happens when Qdrant Cloud service experiences downtime? (Fallback to cached results, graceful degradation, retry logic with exponential backoff)
- What if Jina-v3 embeddings quality degrades or API becomes unavailable? (Fallback to alternative embedding providers, cached embeddings for existing content, monitoring for quality regression)
- How are vectors synchronized between Qdrant and PostgreSQL metadata? (Event-driven updates, consistency checks, reconciliation jobs)
- How are schema migrations managed when database structure needs updates? (Migration versioning, rollback capability, zero-downtime deployment)
- What happens when organization storage quota is exceeded during file upload? (Reject upload with quota error, notify admin, provide upgrade path)
- What happens when a user attempts to upload a file format not allowed by their tier? (Validate before upload starts, return clear error message with tier-specific allowed formats, suggest tier upgrade)
- How does the system handle tier downgrades when existing files exceed new tier limits? (Grandfather existing files, block new uploads exceeding downgraded tier limits, or force cleanup before downgrade)
- What happens when file storage disk space is exhausted on the server? (Monitoring, cleanup strategies, storage limit alerts, automatic scaling)
- How does the system handle concurrent migrations from multiple developers? (Migration conflict detection, coordination mechanism)
- What happens when an uploaded file is corrupted or unreadable? (Validate file integrity on upload, retry processing, notify user with specific error)
- How are duplicate file uploads detected and handled? (Hash-based deduplication, reference existing file, or allow duplicate based on course isolation)

## Requirements _(mandatory)_

### Functional Requirements

**Infrastructure**

- **FR-001**: System MUST create a new Supabase production project with PostgreSQL database
- **FR-002**: System MUST apply database migrations creating tables: organizations, users, courses, sections, lessons, lesson_content, file_catalog, course_enrollments
- **FR-003**: System MUST provision Qdrant Cloud instance for vector storage (free tier for PoC, production plan for 50+ courses)
- **FR-004**: System MUST configure Redis instance for BullMQ queue management
- **FR-005**: System MUST create local file storage structure: `/uploads/{organizationId}/{courseId}/` with tier-based quota enforcement (Free: 10 MB, Basic Plus: 100 MB, Standard: 1 GB, Premium: 10 GB)
- **FR-006**: System MUST implement Row-Level Security (RLS) policies for organization-level data isolation and role-based access control

**File Upload & Validation**

- **FR-031**: System MUST enforce maximum file size limit of 100MB per uploaded file across all tiers
- **FR-032**: System MUST validate file types based on organization tier: Free tier prohibits all file uploads, Basic Plus allows PDF/TXT/MD only, Standard adds DOCX/HTML/PPTX, Premium allows all formats including images (PNG/JPG/GIF/SVG/WebP)
- **FR-033**: System MUST reject file uploads exceeding tier-specific file count limits per course (Free: 0 files, Basic Plus: 1 file, Standard: 3 files, Premium: 10 files)
- **FR-034**: System MUST enforce tier-specific total storage quota per organization (Free: 10 MB, Basic Plus: 100 MB, Standard: 1 GB, Premium: 10 GB)
- **FR-035**: System MUST calculate and track storage usage per organization in real-time (update storage_used_bytes on file upload/delete) for quota enforcement
- **FR-036**: System MUST validate file MIME types and extensions to prevent upload of disallowed formats for the organization's tier
- **FR-037**: System MUST store tier information in organization configuration for runtime validation

**Core Stack**

- **FR-007**: System MUST configure tRPC server with TypeScript strict mode
- **FR-008**: System MUST integrate BullMQ with job types for workflow stages
- **FR-009**: System MUST create monorepo structure with packages: orchestrator, workers, ai-toolkit, api, database, shared
- **FR-010**: System MUST configure TypeScript project references for cross-package type safety
- **FR-011**: System MUST implement JWT-based authentication middleware for tRPC endpoints using Supabase Auth
- **FR-012**: System MUST configure environment variables for Supabase connection, Redis URL, Qdrant Cloud URL/API key, Jina-v3 API key, file storage paths, and OAuth provider credentials

**Authentication & Authorization**

- **FR-021**: System MUST configure Supabase Auth with email/password authentication as primary method
- **FR-022**: System MUST enable OAuth providers (Google, GitHub) in Supabase Auth for alternative authentication
- **FR-023**: System MUST configure Supabase Auth to include custom JWT claims: user_id, role, organization_id
- **FR-024**: System MUST implement tRPC authentication middleware that validates Supabase JWT tokens and extracts user context
- **FR-025**: System MUST support authentication from multiple external clients (LMS, frontend) using the same Supabase project
- **FR-026**: System MUST define three user roles: Admin (full organization access), Instructor (create and manage own courses), Student (read-only access to enrolled courses)
- **FR-027**: System MUST implement RLS policies enforcing: Admins can access all organization data, Instructors can create/update/delete only their own courses, Students can only read courses they are enrolled in
- **FR-028**: System MUST store user role assignments in database with organization_id scoping
- **FR-029**: System MUST validate user role on every tRPC procedure call requiring authorization using JWT claims
- **FR-030**: System MUST return 401 Unauthorized for missing/invalid JWT tokens and 403 Forbidden for insufficient role permissions

**RAG Infrastructure (Vector Storage & Embeddings)**

- **FR-013**: System MUST configure Qdrant Cloud collection with HNSW index parameters:
  - Vector dimensions: 768 (Jina-v3 with Matryoshka)
  - Distance metric: Cosine similarity
  - HNSW parameters: m=16, ef_construct=100 for optimal recall (95-99%)
  - Collection sharding: single shard for Stage 0 (<5M vectors)

- **FR-014**: System MUST implement multi-tenant isolation in Qdrant using payload filtering:
  - Required filters: course_id, organization_id
  - Optional filters: tier, document_type, chunk_type
  - Payload indexing on course_id for fast filtering

- **FR-015**: System MUST integrate Jina-embeddings-v3 API for vector generation:
  - API endpoint: https://api.jina.ai/v1/embeddings
  - Model: jina-embeddings-v3
  - Task-specific embeddings: "retrieval.passage" for documents, "retrieval.query" for search queries
  - Output dimensions: 768 (Matryoshka optimization)
  - Rate limiting: respect 1500 RPM limit with exponential backoff

- **FR-016**: System MUST implement document chunking strategy:
  - Chunk size: 512-1024 tokens (adjustable per document type)
  - Overlap: 10-20% (50-100 tokens)
  - Splitting method: sentence-aware splitting preserving semantic boundaries
  - Metadata: course_id, organization_id, chunk_index, document_type

- **FR-017**: System MUST implement vector lifecycle management:
  - Upload: batch upload to Qdrant (100-500 vectors per batch)
  - Update: regenerate embeddings on content change, upsert to Qdrant
  - Delete: remove vectors on course/document deletion (cascade from PostgreSQL)
  - Synchronization: track vector status in PostgreSQL file_catalog (indexed, failed, pending)

- **FR-018**: System MUST implement semantic search with query optimization:
  - Generate query embedding with Jina-v3 (task: "retrieval.query")
  - Top-K retrieval: 10-20 candidates from Qdrant
  - Score threshold: configurable minimum similarity (default 0.7)
  - Response format: chunk_text, similarity_score, metadata

- **FR-019**: System MUST implement caching layer for vector search:
  - Cache query embeddings (1-hour TTL)
  - Cache search results for common queries (semantic similarity matching)
  - Cache hit rate monitoring (target 40-60%)

- **FR-020**: System MUST document migration path to self-hosted Jina-v3:
  - Trigger: >20GB indexed data or >100K queries/month
  - Infrastructure: Docker container, 8GB RAM, 4 vCPU
  - API compatibility: maintain same interface for zero-downtime migration

**Quality & CI/CD**

- **FR-038**: System MUST configure GitHub Actions workflow for automated testing
- **FR-039**: System MUST configure linting (ESLint) and formatting (Prettier) tools
- **FR-040**: System MUST implement pre-commit hooks for code quality checks
- **FR-041**: System MUST configure build pipeline producing deployable artifacts

### Non-Functional Requirements

**Observability**

- **NFR-001**: BullMQ job processing MUST implement structured logging with contextual fields (jobId, jobType, organizationId, timestamp, duration)
- **NFR-002**: BullMQ MUST expose job metrics including: job duration (histogram), success rate (counter), failure rate (counter), retry count (gauge)
- **NFR-003**: BullMQ MUST integrate with BullMQ UI for real-time queue visualization, failed job inspection, and retry management
- **NFR-004**: Job logs MUST be queryable by jobId, organizationId, status, and time range for debugging

### Key Entities

**Database Schema**

- **Organization**: Represents tenant organization (id, name, tier, storage_quota_bytes, storage_used_bytes, created_at, updated_at)
- **Tier**: Organization tier enum (free, basic_plus, standard, premium) defining allowed file formats, storage quotas, and file count limits
- **User**: Represents system user (id, email, organization_id, role, created_at, updated_at)
- **Role**: User role enum (admin, instructor, student)
- **Course**: Represents educational course metadata (id, title, slug, user_id, organization_id, status, settings, created_at, updated_at)
- **Section**: Represents course structure division (id, course_id, title, description, order_index, metadata)
- **Lesson**: Represents lesson metadata without content (id, section_id, title, order_index, duration_minutes, lesson_type, status, metadata)
- **LessonContent**: Represents heavy lesson content loaded on-demand (lesson_id, text_content, media_urls, quiz_data, interactive_elements)
- **FileCatalog**: Represents uploaded document metadata (id, organization_id, course_id, filename, file_type, file_size, storage_path, hash, mime_type, vector_status, created_at, updated_at)
  - vector_status enum: pending, indexing, indexed, failed
- **CourseEnrollment**: Represents student enrollment in courses (id, user_id, course_id, enrolled_at, status)

**Infrastructure Components**

- **Queue**: BullMQ job queue for asynchronous workflow processing
- **Worker**: Job processor handling specific workflow stages
- **tRPC Router**: Type-safe API endpoint collection for frontend-backend communication
- **Storage**: Local filesystem organization for uploaded files and generated assets
- **Vector Store**: Qdrant Cloud collection storing document embeddings with metadata
  - Vectors: 768-dimensional embeddings from Jina-v3
  - Index: HNSW (Hierarchical Navigable Small World) for fast approximate nearest neighbor search
  - Payload: course_id, organization_id, chunk_text, chunk_index, document_type

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: New Supabase project is operational and database migrations execute successfully within 5 minutes
- **SC-002**: All 8 database tables (organizations, users, courses, sections, lessons, lesson_content, file_catalog, course_enrollments) accept test data and enforce relationships correctly
- **SC-003**: Organization tier configuration (free, basic_plus, standard, premium) correctly enforces allowed file formats, storage quotas, and file count limits
- **SC-004**: RLS policies enforce role-based access: Admin queries return all org courses, Instructor queries return only own courses, Student queries return only enrolled courses
- **SC-005**: Qdrant Cloud collection is provisioned and accepts test vectors with HNSW index configuration (768 dimensions, cosine similarity)
- **SC-006**: Supabase Auth is configured and accepts email/password authentication, returning valid JWT tokens with custom claims (user_id, role, organization_id)
- **SC-007**: OAuth providers (Google, GitHub) are enabled in Supabase Auth and successfully authenticate test users
- **SC-008**: tRPC server starts successfully and handles 100 concurrent test requests without errors
- **SC-009**: tRPC authentication middleware validates Supabase JWT tokens and correctly extracts user context for authorized requests
- **SC-010**: tRPC authorization middleware correctly blocks Student from creating courses (403) and allows Instructor to create courses
- **SC-011**: File upload validation correctly accepts Basic Plus PDF uploads and rejects Basic Plus DOCX uploads with clear error messages
- **SC-012**: File upload validation correctly accepts Premium image uploads (PNG/JPG) and enforces 100MB file size limit across all paid tiers
- **SC-013**: Storage quota enforcement rejects uploads when organization exceeds allocated storage limit
- **SC-014**: External clients (LMS simulation, frontend simulation) successfully authenticate and make authorized API calls using Supabase JWT
- **SC-015**: BullMQ processes test jobs with 100% success rate, including retry scenarios
- **SC-016**: Monorepo builds successfully with TypeScript strict mode across all packages in under 30 seconds
- **SC-017**: Jina-v3 embeddings API successfully generates 768-dimensional vectors for test documents with task-specific optimization (retrieval.passage)
- **SC-018**: Vector search in Qdrant returns top-K similar chunks with <30ms p95 latency and >95% recall for test queries
- **SC-019**: Multi-tenant isolation works correctly: searches filtered by course_id return only vectors for specified course
- **SC-020**: End-to-end RAG workflow (document upload → chunking → embedding → storage → search) completes successfully for 5 test courses
- **SC-021**: CI/CD pipeline executes tests on every commit and completes within 5 minutes
- **SC-022**: File storage structure allows upload and retrieval of test files with correct organization-level and tier-based isolation
- **SC-023**: BullMQ UI is accessible and displays job metrics (duration, success/failure rates) for test job executions with structured logs queryable by jobId
- **SC-024**: Development team confirms all blocking dependencies (P1-P2 stories) are resolved and Stage 1 can begin

### Assumptions

- Redis will be run locally during development, with production deployment using managed Redis service (e.g., Upstash, Redis Cloud)
- Supabase free tier or paid plan provides sufficient resources for development and testing
- Supabase Auth supports custom JWT claims for role and organization_id
- External clients (custom LMS, current frontend) will integrate with Supabase using @supabase/supabase-js SDK or direct JWT token management
- OAuth provider credentials (Google OAuth Client ID/Secret, GitHub OAuth App) are available for configuration
- All external clients will operate under the same Supabase project for centralized user management
- Four organization tiers are defined (free, basic_plus, standard, premium) with tier-specific constraints:
  - **Free**: 10 MB storage quota, 0 files per course (file uploads prohibited)
  - **Basic Plus**: 100 MB storage quota, 1 file per course, PDF/TXT/MD only
  - **Standard**: 1 GB storage quota, 3 files per course, PDF/TXT/MD/DOCX/HTML/PPTX
  - **Premium**: 10 GB storage quota, 10 files per course, all formats including images (PNG/JPG/GIF/SVG/WebP)
- File size limit of 100MB per file is enforced across all paid tiers (Free tier prohibits uploads) for Stage 0; may be adjusted in future stages
- Storage usage is calculated in real-time (update on file upload/delete) to enforce quotas accurately
- File format detection will use MIME type validation combined with file extension checks for security
- **RAG Infrastructure assumptions**:
  - Qdrant Cloud free tier (1GB) sufficient for PoC with 3-5 courses
  - Qdrant Cloud production plan ($50-100/month) scales to 50-100 courses (1-2M vectors)
  - Jina-embeddings-v3 API access available with rate limit 1500 RPM (sufficient for Stage 0)
  - Jina-v3 cost: $0.02/M tokens (3x cheaper than Voyage-3.5, comparable quality)
  - Migration to self-hosted Jina-v3 considered when >20GB indexed data or >100K queries/month
  - Vector search latency <30ms p95 acceptable for educational use case (students don't notice)
  - HNSW index provides 95-99% recall (better than pgvector IVFFLAT 85-90% recall observed in MVP)
- Development environment has Node.js 20+ and npm/pnpm installed
- GitHub repository has Actions enabled for CI/CD
- Team has access to create new Supabase projects and Qdrant Cloud accounts
- File storage will use local filesystem initially, with migration to S3-compatible storage (Supabase Storage, Cloudflare R2) planned for production
