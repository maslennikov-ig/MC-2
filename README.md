# MegaCampusAI

**AI-powered course generation platform with advanced RAG capabilities**

MegaCampusAI is a next-generation educational content platform that leverages artificial intelligence, semantic search, and modern cloud infrastructure to transform course creation. Built with TypeScript, tRPC, and a sophisticated RAG (Retrieval-Augmented Generation) pipeline, it provides the foundation for automated, intelligent course generation workflows.

## Overview

MegaCampusAI provides robust infrastructure for building AI-powered educational platforms. With the completion of Stage 5 (Course Structure Generation), the platform now offers end-to-end course creation workflows powered by LangGraph orchestration and multi-model AI routing.

- **Semantic Document Processing**: Convert documents (PDF, DOCX, PPTX, HTML) into structured, searchable content with OCR support
- **Advanced Vector Search**: Hierarchical chunking with BM25 hybrid search for superior retrieval accuracy
- **AI Course Generation**: LangGraph-powered orchestration with multi-model routing and quality validation
- **Multi-tenant Architecture**: Organization-based isolation with tier-based feature gating
- **Type-safe API**: End-to-end type safety with tRPC and TypeScript strict mode
- **Scalable Job Processing**: Async workflow orchestration with BullMQ and Redis
- **Enterprise Security**: Row-level security, JWT authentication, and role-based access control

### Stage 0: Foundation Infrastructure

**What the Platform Provides:**

**Core Infrastructure (Stage 0):**
- Multi-tenant database schema with RLS policies
- Organization and subscription tier management
- User authentication and role-based authorization
- File upload with tier-based validation
- Document processing pipeline (Docling + Markdown conversion)
- Vector database integration (Qdrant + Jina-v3 embeddings)
- Semantic search capabilities (hybrid dense + sparse)
- Job queue infrastructure (BullMQ + Redis)
- tRPC API server with authentication middleware
- CI/CD pipeline with automated testing

**Course Generation (Stage 5 - Complete):**
- LangGraph-powered course structure generation
- Multi-model AI routing (qwen3-max, OSS 120B, Gemini)
- Title-only generation with model knowledge synthesis
- Rich context generation leveraging Stage 4 analysis
- Quality validation with Jina-v3 semantic similarity (≥0.75 threshold)
- 19 style presets (academic, conversational, storytelling, practical, etc.)
- Cost optimization ($0.30-0.40 per course target)
- Incremental section regeneration
- XSS sanitization with DOMPurify

**What the Platform Does NOT Provide:**

- Multi-format lesson content (videos, quizzes, assessments)
- Interactive course player UI
- Progress tracking or analytics dashboards
- Production deployment configurations
- LMS integrations (Canvas, Moodle, etc.)

## Technology Stack

### Core Technologies

- **Runtime**: Node.js 20+ (LTS)
- **Package Manager**: pnpm 8+
- **Language**: TypeScript 5.3+ (strict mode)
- **API Framework**: tRPC 10.x (type-safe RPC)
- **Monorepo**: pnpm workspaces

### Infrastructure Services

- **Database**: Supabase (PostgreSQL 15+ with pgvector)
- **Vector Database**: Qdrant Cloud (HNSW index, 768D)
- **Job Queue**: BullMQ 5.x + Redis 7+
- **Embeddings**: Jina-v3 (768-dimensional, multilingual)
- **Document Processing**: Docling MCP (PDF/DOCX/PPTX conversion)
- **Authentication**: Supabase Auth (JWT + OAuth)

### Development Tools

- **Testing**: Vitest (unit/integration), pgTAP (database)
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier
- **CI/CD**: GitHub Actions
- **Version Control**: Git with conventional commits

### Version Requirements

| Dependency | Minimum Version | Recommended |
|------------|----------------|-------------|
| Node.js | 20.0.0 | 20.11+ (LTS) |
| pnpm | 8.0.0 | 8.15+ |
| TypeScript | 5.3.3 | 5.3+ |
| PostgreSQL | 15.0 | 15.6+ (via Supabase) |
| Redis | 7.0 | 7.2+ |

## Monorepo Structure

```
megacampus2/
├── packages/
│   ├── course-gen-platform/       # Main API server and orchestration
│   │   ├── src/
│   │   │   ├── server/           # tRPC API endpoints
│   │   │   ├── orchestrator/     # BullMQ job handlers
│   │   │   ├── services/         # Stage 5 generation services
│   │   │   │   ├── generation/   # LangGraph orchestration, generators, validators
│   │   │   │   └── rag/          # RAG retrieval and document search
│   │   │   └── shared/           # Utilities (embeddings, validation, auth)
│   │   ├── supabase/             # Database migrations and RLS policies
│   │   ├── scripts/              # Seed data and testing scripts
│   │   └── tests/                # Unit and integration tests
│   │
│   ├── shared-types/              # Shared TypeScript types and schemas
│   │   └── src/
│   │       ├── database.generated.ts  # Auto-generated DB types
│   │       ├── zod-schemas.ts         # Validation schemas
│   │       └── bullmq-jobs.ts         # Job type definitions
│   │
│   └── trpc-client-sdk/           # External client SDK (future)
│       └── src/                   # Type-safe API client
│
├── specs/                         # Feature specifications
│   └── 001-stage-0-foundation/
│       ├── spec.md               # Requirements and success criteria
│       ├── plan.md               # Architecture and design
│       ├── tasks.md              # Implementation task breakdown
│       └── research.md           # Technology selection rationale
│
├── docs/                          # Documentation
│   ├── quickstart.md             # Developer onboarding guide
│   ├── release-process.md        # Version management
│   └── jina-v3-migration.md      # Self-hosting embeddings
│
├── .github/                       # CI/CD workflows
│   └── workflows/
│       ├── test.yml              # Automated testing
│       ├── build.yml             # Build verification
│       └── deploy-staging.yml    # Staging deployment
│
├── .claude/                       # Claude Code commands
│   └── commands/
│       └── push.md               # Automated release management
│
└── package.json                   # Root workspace configuration
```

### Package Descriptions

**`packages/course-gen-platform/`**

Main application server providing:
- tRPC API endpoints with authentication
- BullMQ job orchestration and handlers
- Document processing pipeline (Docling integration)
- Vector operations (Qdrant search and indexing)
- Course structure generation (LangGraph orchestration)
- Multi-model AI routing and quality validation
- File upload and validation
- Database access with RLS enforcement

**`packages/shared-types/`**

Centralized type definitions:
- Auto-generated database types (Supabase schema)
- Zod schemas for API input/output validation
- BullMQ job data types
- Shared TypeScript interfaces and enums

**`packages/trpc-client-sdk/`** (Planned)

External client library for consuming the tRPC API:
- Type-safe API client factory
- Authentication helpers
- Error handling utilities
- Ready for npm publishing

## Getting Started

For detailed setup instructions, see the Quick Installation section below. A comprehensive quickstart guide is in development.

### Prerequisites

- Node.js 20+ (LTS)
- pnpm 8+
- Supabase account (free tier sufficient for development)
- Qdrant Cloud account (free 1GB tier)
- Redis instance (local or Upstash)
- Jina AI API key (free tier: 1M tokens/month)

### Quick Installation

```bash
# Clone repository
git clone <repository-url>
cd megacampus2

# Install dependencies
pnpm install

# Setup environment variables
cp packages/course-gen-platform/.env.example packages/course-gen-platform/.env
# Edit .env with your credentials

# Run database migrations
cd packages/course-gen-platform
pnpm supabase db push

# Start development server
pnpm dev
```

### Available Scripts

```bash
# Development
pnpm dev              # Start development server (port 3000)

# Building
pnpm build            # Build all packages
pnpm -r build         # Build packages recursively

# Testing
pnpm test             # Run all TypeScript tests
pnpm test:rls         # Run RLS policy tests (pgTAP)
pnpm test:all         # Run both TypeScript and database tests
pnpm test:watch       # Run tests in watch mode

# Code Quality
pnpm lint             # Lint all packages
pnpm type-check       # TypeScript type checking (strict mode)
pnpm format           # Format code with Prettier
pnpm format:check     # Check code formatting
```

## API Documentation

### tRPC Endpoints

**Authentication**

- `auth.login` - Email/password authentication
- `auth.register` - New user registration
- `auth.logout` - Session termination
- `auth.refresh` - JWT token refresh

**Organizations**

- `organizations.create` - Create new organization (admin only)
- `organizations.get` - Get organization details
- `organizations.update` - Update organization settings
- `organizations.getTier` - Get subscription tier info

**Courses**

- `courses.list` - List accessible courses (role-filtered)
- `courses.get` - Get course details
- `courses.create` - Create course (instructor/admin)
- `courses.update` - Update course (owner only)
- `courses.delete` - Delete course (owner only)

**Files**

- `files.upload` - Upload document (tier-validated)
- `files.list` - List course files
- `files.delete` - Delete file (updates storage quota)
- `files.getMetadata` - Get file processing status

**Vector Search**

- `search.semantic` - Semantic search within course
- `search.hybrid` - Hybrid dense + sparse search

**Course Generation** (Stage 5)

- `generation.generate` - Queue course structure generation job
- `generation.getStatus` - Get generation status and progress
- `generation.regenerateSection` - Regenerate specific section

For complete API documentation, see [packages/course-gen-platform/README.md](packages/course-gen-platform/README.md).

### Authentication Flow

1. User authenticates via Supabase Auth (email/password or OAuth)
2. Supabase returns JWT with custom claims: `user_id`, `role`, `organization_id`
3. Client includes JWT in `Authorization: Bearer <token>` header
4. tRPC middleware validates JWT and extracts user context
5. Role-based authorization enforces access control per endpoint

### Error Codes

| Code | Description | Response |
|------|-------------|----------|
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Insufficient role permissions |
| 422 | Validation Error | Invalid input (Zod schema failure) |
| 413 | Payload Too Large | File exceeds 100MB limit |
| 507 | Storage Quota Exceeded | Organization storage quota exceeded |

## Features

### Current (Stage 0 - Foundation)

- ✅ **Database Infrastructure**
  - PostgreSQL schema with Supabase
  - Row-Level Security (RLS) policies
  - Multi-tenant organization isolation
  - Tier-based feature gating

- ✅ **Authentication & Authorization**
  - JWT-based authentication
  - OAuth providers (Google, GitHub)
  - Role-based access control (Admin, Instructor, Student)
  - Custom JWT claims injection

- ✅ **File Management**
  - Tier-based file upload validation
  - Storage quota enforcement
  - MIME type and size validation
  - Content deduplication (reference counting)

- ✅ **Document Processing**
  - Multi-format conversion (PDF, DOCX, PPTX, HTML)
  - Markdown normalization
  - OCR support (Tesseract/EasyOCR)
  - Image extraction with metadata

- ✅ **Document Summarization** (v0.13.0)
  - LLM-based hierarchical chunking (115K tokens, 5% overlap)
  - Adaptive compression (DETAILED→BALANCED→AGGRESSIVE)
  - Quality validation (Jina-v3, 0.75 semantic similarity)
  - Small document bypass (<3K tokens, zero cost)
  - Multilingual support (13 languages)
  - Cost tracking with tRPC analytics endpoints
  - OpenRouter integration (GPT OSS 20B/120B, Gemini 2.5 Flash)

- ✅ **RAG Infrastructure**
  - Hierarchical chunking (parent-child)
  - Jina-v3 embeddings (768D, multilingual)
  - Qdrant vector storage (HNSW index)
  - Hybrid search (semantic + BM25)
  - Late chunking for context-aware embeddings

- ✅ **Job Orchestration**
  - BullMQ queue with Redis
  - Job retry with exponential backoff
  - Progress tracking
  - BullMQ UI for monitoring

- ✅ **API Layer**
  - tRPC server with type safety
  - Authentication middleware
  - Authorization middleware
  - Input validation (Zod schemas)

- ✅ **CI/CD Pipeline**
  - Automated testing (GitHub Actions)
  - Build verification
  - Linting and type checking
  - pgTAP database tests

### Stage 5: Course Structure Generation (Complete)

- ✅ **LangGraph Orchestration** (v0.16.28)
  - 5-phase StateGraph: validate → metadata → sections → quality → assembly
  - Per-batch processing (SECTIONS_PER_BATCH=1, independent 120K token budgets)
  - Reactive quality escalation (similarity <0.75 → retry with qwen3-max)
  - State tracking with comprehensive error handling

- ✅ **Multi-Model AI Routing**
  - qwen3-max: Critical metadata generation (course title, description, objectives)
  - OSS 120B: Primary section expansion (cost-optimized)
  - Gemini 2.5 Flash: Overflow handling and fallback
  - Dynamic model selection based on task complexity

- ✅ **Generation Modes**
  - Title-only generation (FR-003): Synthesize from model knowledge without documents
  - Rich context generation: Leverage full Stage 4 analysis results with RAG
  - Optional RAG integration: LLM-driven document search
  - Constraints-based prompt engineering for precise control

- ✅ **Quality Validation**
  - Jina-v3 semantic similarity validation (≥0.75 threshold)
  - Automated retry with premium models on quality failure
  - XSS sanitization with DOMPurify
  - Schema validation with Zod

- ✅ **API Endpoints** (tRPC)
  - `generation.generate` - Queue course structure generation
  - `generation.getStatus` - Poll generation progress with detailed state
  - `generation.regenerateSection` - Regenerate single section (FR-026)

- ✅ **Cost Optimization**
  - Target: $0.30-0.40 per course (achieved)
  - Token budget management: 120K total per batch (90K input + 30K output)
  - OpenRouter pricing tracking with cost calculator service
  - 19 style presets for fine-tuned generation

- ✅ **Architecture**
  - 9 services (~4500 lines): metadata-generator, section-batch-generator, quality-validator, generation-orchestrator, cost-calculator, etc.
  - 5 utilities (~2000 lines): prompt-builder, section-expander, rag-retriever, sanitizer, validators
  - 624+ tests (92% coverage): unit, contract, integration
  - Comprehensive error handling with typed exceptions

### Planned (Future Stages)

- ⏳ **Stage 6**: Multi-format lesson content (videos, quizzes, assessments)
- ⏳ **Stage 7**: Interactive course player UI
- ⏳ **Stage 8**: Progress tracking and analytics
- ⏳ **Stage 9**: External API integrations (LMS)
- ⏳ **Stage 10**: Advanced AI features (adaptive learning paths)

## Subscription Tiers

MegaCampusAI supports four subscription tiers with graduated feature access:

| Tier | File Uploads | Allowed Formats | Storage Quota | File Count/Course |
|------|-------------|-----------------|---------------|-------------------|
| **FREE** | Prohibited | None | 10 MB | 0 |
| **BASIC** | Allowed | TXT, MD | 100 MB | 1 |
| **STANDARD** | Allowed | PDF, DOCX, PPTX, HTML, TXT, MD | 1 GB | 3 |
| **PREMIUM** | Allowed | All formats + images (PNG, JPG, GIF, SVG, WebP) | 10 GB | 10 |

**Additional Constraints:**

- Maximum file size: 100MB per file (all paid tiers)
- Storage quota enforced in real-time
- File format validation via MIME type and extension
- Tier upgrades enable additional features immediately

## Security

### Multi-tenancy Isolation

- **Organization-level isolation**: All data scoped to `organization_id`
- **Row-Level Security (RLS)**: Database-enforced access control
- **JWT claims validation**: Every request validates user context
- **Payload filtering**: Vector search filtered by course/organization

### Role-based Access Control

| Role | Permissions |
|------|-------------|
| **Admin** | Full organization access, user management, tier configuration |
| **Instructor** | Create/update/delete own courses, upload files, manage enrollments |
| **Student** | Read-only access to enrolled courses, no file uploads |

### Authentication

- JWT tokens issued by Supabase Auth
- Custom claims: `user_id`, `role`, `organization_id`
- OAuth support: Google, GitHub
- Token refresh mechanism
- Secure password hashing (bcrypt via Supabase)

### File Upload Security

- MIME type validation
- File size limits (100MB max)
- Tier-based format restrictions
- Virus scanning (future)
- Pre-signed URLs for downloads (future)

## Testing

### Test Coverage

**TypeScript Tests** (Vitest)

- Unit tests: Utilities, validators, parsers
- Integration tests: tRPC endpoints, BullMQ jobs, Qdrant search
- Coverage target: 80%+

**Database Tests** (pgTAP)

- RLS policy verification (24 test scenarios)
- Multi-tenant isolation
- Role-based access control
- Schema constraints and relationships

### Running Tests

```bash
# All tests
pnpm test:all

# TypeScript tests only
pnpm test

# Database/RLS tests only
pnpm test:rls

# Watch mode (TypeScript)
pnpm test:watch

# Specific test file
pnpm test tests/integration/qdrant.test.ts
```

### Test Files

- `packages/course-gen-platform/tests/integration/` - Integration tests
- `packages/course-gen-platform/supabase/tests/` - pgTAP database tests
- `packages/course-gen-platform/scripts/` - Manual testing scripts

## Contributing

### Development Workflow

1. **Fork and clone** the repository
2. **Create feature branch** from `main`
3. **Make changes** with tests
4. **Run tests** (`pnpm test:all`)
5. **Lint and format** (`pnpm lint && pnpm format`)
6. **Commit** using conventional commits
7. **Submit pull request**

### Commit Convention

We use conventional commits for automated changelog generation:

```
type(scope): subject

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Test additions or updates
- `chore`: Maintenance tasks

**Example:**
```
feat(api): add semantic search endpoint

Implements hybrid dense + sparse search with Qdrant.
Includes BM25 for lexical matching and RRF fusion.

Closes #123
```

### Release Management

Use the `/push` command for automated releases:

```bash
# Interactive release
/push

# Specific version type
/push patch   # 0.1.0 → 0.1.1
/push minor   # 0.1.0 → 0.2.0
/push major   # 0.1.0 → 1.0.0
```

See [docs/release-process.md](docs/release-process.md) for details.

### Code Style

- **TypeScript strict mode** enabled
- **ESLint** for linting
- **Prettier** for formatting
- **No any types** (use unknown or proper types)
- **Explicit return types** for functions
- **Comprehensive JSDoc** for public APIs

## Documentation

### For Developers

- [docs/release-process.md](docs/release-process.md) - Version management workflow
- [packages/course-gen-platform/README.md](packages/course-gen-platform/README.md) - API server details
- [packages/shared-types/README.md](packages/shared-types/README.md) - Type generation guide

### Design Specifications

- [specs/001-stage-0-foundation/spec.md](specs/001-stage-0-foundation/spec.md) - Requirements and acceptance criteria
- [specs/001-stage-0-foundation/plan.md](specs/001-stage-0-foundation/plan.md) - Architecture and design decisions
- [specs/001-stage-0-foundation/tasks.md](specs/001-stage-0-foundation/tasks.md) - Implementation task breakdown
- [specs/001-stage-0-foundation/research.md](specs/001-stage-0-foundation/research.md) - Technology selection rationale

### Infrastructure Guides

- [packages/course-gen-platform/docs/jina-v3-migration.md](packages/course-gen-platform/docs/jina-v3-migration.md) - Self-hosting embeddings model
- [packages/course-gen-platform/docs/AUTH_CONFIGURATION.md](packages/course-gen-platform/docs/AUTH_CONFIGURATION.md) - Authentication setup
- [packages/course-gen-platform/docs/OAUTH_CONFIGURATION.md](packages/course-gen-platform/docs/OAUTH_CONFIGURATION.md) - OAuth provider setup

## Project Status

**Current Release**: v0.16.28 - Course Structure Generation

**Latest Feature**: Stage 5 Course Structure Generation (Complete)
- LangGraph 5-phase orchestration (validate → metadata → sections → quality → assembly)
- Multi-model AI routing (qwen3-max, OSS 120B, Gemini)
- Quality validation with Jina-v3 semantic similarity (≥0.75 threshold)
- 19 style presets with cost optimization ($0.30-0.40 per course)
- 624+ tests passing (92% coverage)
- 9 services (~4500 lines) + 5 utilities (~2000 lines)

**Completed Stages**:
- ✅ Stage 0: Foundation Infrastructure
- ✅ Stage 1: Document Upload and Processing
- ✅ Stage 2: Vector Database Integration
- ✅ Stage 3: Document Summarization
- ✅ Stage 4: Course Structure Analysis
- ✅ Stage 5: Course Structure Generation

**Next Steps**:
- Stage 6: Multi-format lesson content generation
- Stage 7: Interactive course player UI
- Enhanced analytics dashboard

**Last Updated**: 2025-11-12

## License

Proprietary - All rights reserved

Copyright (c) 2025 MegaCampusAI

---

**Built with modern TypeScript tools and Claude Code**
