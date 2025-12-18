# Technical Specification: MVP → Production Migration

**Project:** MegaCampusAI - AI-Powered Educational Course Generation Platform
**Version:** 1.6
**Date:** 2025-11-21
**Status:** In Progress (Stage 5 Complete)

**Related Documents:**
- 📋 [Pricing Tiers & Feature Distribution](PRICING-TIERS.md) - Tier-based feature specifications (TRIAL, FREE, BASIC, STANDARD, PREMIUM)
- 📄 [Implementation Roadmap](IMPLEMENTATION_ROADMAP_EN.md) - Development stages, tasks, and progress tracking
- 📊 [Supabase Database Reference](SUPABASE-DATABASE-REFERENCE.md) - Schema, ENUMs, RLS policies, and RPCs

## 🎉 COMPLETION STATUS

✅ **Stage 0 - Foundation: COMPLETE (100%)**
- All 103 tasks completed
- Production-ready infrastructure deployed
- Full test coverage (70+ integration tests passing)
- Zero security vulnerabilities
- Completed: 2025-10-14

✅ **Stage 1 - Main Entry Orchestrator: COMPLETE (100%)**
- All 37 tasks completed
- n8n Main Entry workflow replaced with backend endpoint
- JWT authentication + concurrency limits operational
- SuperAdmin role + production-grade RLS implemented
- Zero security vulnerabilities
- Completed: 2025-10-22

✅ **Stage 2 - Document Processing: COMPLETE (100%)**
- All infrastructure operational (file upload, vectorization, RAG, Qdrant)
- Worker handler validated (Stage 0 - T074.3, T074.4 - 456 lines)
- Integration tests: 17/17 passing (100% pass rate, 5.3 minutes)
- Database verified: TRIAL tier added, error_logs table created
- Release: v0.12.2
- Completed: 2025-10-27

✅ **Stage 3 - Document Summarization: COMPLETE (100%)**
- LLM-based document summarization with hierarchical chunking (115K tokens, 5% overlap)
- Quality validation via Jina-v3 embeddings (0.75 semantic similarity threshold)
- Cost tracking with 3 tRPC endpoints (getCostAnalytics, getSummarizationStatus, getDocumentSummary)
- Multilingual support (13 languages with language-specific token estimation)
- Small document bypass optimization (<3K tokens, zero LLM cost)
- Stage 4 strict barrier (100% completion enforcement)
- Tests: 41+ passing (29 unit + 10 contract + 2 integration)
- Code review: 8.5/10 - APPROVED FOR PRODUCTION
- Release: v0.13.0
- Completed: 2025-10-29

✅ **Stage 4 - Course Content Analysis: COMPLETE (100%)**
- **All 65 tasks completed** (Phases 0-8: Foundation, Types, Services, Testing, Documentation)
- **LangChain + LangGraph** orchestration (v0.3+, ADR-001: selected from 11 frameworks, scored 8.4/10)
- **Multi-phase analysis pipeline** (6 phases: barrier → classify → scope → expert → synthesis → assembly)
- **Multi-model architecture** (GPT OSS-20B for simple tasks, GPT OSS-120B for expert analysis, adaptive Phase 4)
- **Key metrics** (validated on 3 Russian legal documents):
  - Token usage: 127.1K / 200K budget (63.5%)
  - Quality score: 99.99% average (semantic similarity)
  - Pipeline duration: 56.5s (3 docs), Phase distribution: 33% classify, 34% scope, 15% expert, 6% synthesis
  - Cost savings: 40-50% via multi-model orchestration
- **Security & Quality:**
  - XSS sanitization (DOMPurify for all LLM outputs)
  - Type safety (0 errors, Zod schemas, removed all `as any`)
  - Stage 3 barrier (100% completion enforcement)
  - Research flag detection (<5% false positive rate)
  - Minimum 10 lessons validation (48 generated in test)
- **Testing:** 20/20 contract tests, 5 phase unit tests, T055 E2E (upload→processing→analysis) passing
- **Code quality:** Constitution compliant (max 300 lines), code review 8.5/10
- Completed: 2025-11-04
- Release: v0.14.6

✅ **Stage 5 - Course Structure Generate: COMPLETE (100%)**
- **All 58/65 tasks completed** (Phases 0-8 including research implementation and validation)
- **LangGraph 5-phase orchestration** (validate → metadata → sections → quality → assembly)
- **Intelligent Multi-Model Routing** (RT-001): qwen3-max for critical metadata, OSS 120B for sections, with Gemini 2.5 Flash for overflow. Achieved $0.30-0.40 cost per course.
- **Advanced Quality Gates** (RT-004, RT-006): Jina-v3 semantic similarity (≥0.75 pass), plus Bloom's Taxonomy pedagogical validation (P0-P1 implemented, blocking 55-60% of quality issues).
- **Robust Error Handling** (RT-005): 4-level JSON repair cascade (FSM, manual fixes, field name correction, LLM semantic repair) saving 20-30% on token usage vs. regeneration.
- **Key Features:** Title-only generation, 19 style integrations, and incremental section regeneration via `generation.regenerateSection` tRPC endpoint.
- **Testing:** 624+ tests with 92% average coverage (Unit, Contract, Integration).
- **Database:** `generation_metadata` table for cost/quality tracking and `course_structure` JSONB for final output.
- Completed: 2025-11-12
- Release: v0.16.28

📋 **Stage 6: PLANNED**
- Infrastructure readiness: 70%
- All foundation complete, incremental migration from n8n can proceed

---

## 📋 Table of Contents

1. [System Overview](#1-system-overview)
2. [Current MVP State](#2-current-mvp-state)
3. [Target Production Architecture](#3-target-production-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Development Stages](#5-development-stages)
6. [Future Features (Roadmap)](#6-future-features-roadmap)
7. [Integrations](#7-integrations)
8. [Monetization](#8-monetization)
9. [Quality Requirements](#9-quality-requirements)

---

## 1. System Overview

### 1.1 Purpose

MegaCampusAI - B2B platform for automatic generation of educational courses using AI, designed for corporate employee training.

### 1.2 Target Audience

- **Primary:** Corporate clients for employee training
- **Secondary:** External LMS systems (via integration)

### 1.3 Key Features

**Current (MVP):**

- Generation of text-based educational courses from:
  - Text descriptions
  - Uploaded documents (PDF, DOCX, TXT, etc.)
- Support for various formats: text, audio, video, presentations, quizzes
- Document vectorization for contextual generation
- Multilingual support (primary: Russian)

**Production (added):**

- Two-way integration with external LMS
- Semi-automatic generation with approval stages
- AI assistant for course authors
- Individual learner analytics (roadmap)
- Personalized learning programs (roadmap)

### 1.4 Business Model

**B2B SaaS with tiers:**

- Tiers with included tokens
- Option to purchase additional tokens
- Generation prioritization based on tier
- Learner count limitations

---

## 2. Current MVP State

### 2.1 MVP Architecture

```
┌─────────────────┐
│  Next.js 15     │  ← Frontend (courseai-next)
│  + Supabase     │
└────────┬────────┘
         │ Webhook (HMAC)
         ↓
┌─────────────────┐
│  n8n Workflows  │  ← Orchestration (6 workflows)
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Supabase DB    │  ← PostgreSQL + pgvector
│  Google Drive   │  ← File storage
│  OpenRouter API │  ← AI models (Grok4Fast, ChatGPT OSS120B)
└─────────────────┘
```

### 2.2 n8n Workflows (current)

1. **Main Entry** - Entry point, validation, routing
   - 📄 `workflows n8n/CAI CourseGen - Main Entry (18).json`

2. **Document Processing** - File processing, text extraction, vectorization
   - 📄 `workflows n8n/CAI CourseGen - Document Processing (36).json`

3. **Create Summary** - Document summarization
   - 📄 `workflows n8n/CAI CourseGen - Create Summary (14).json`

4. **Course Structure Analyze** - Task analysis and structure planning
   - 📄 `workflows n8n/CAI CourseGen - Course Structure Analyze (23).json`

5. **Course Structure Generate** - Course structure generation
   - 📄 `workflows n8n/CAI CourseGen - Course Structure generate (27).json`

6. **Text Generation (NEW)** - Lesson content generation
   - 📄 `workflows n8n/CAI CourseGen - Text generation (NEW) (1).json`

**Frontend Integration:**

- 🎨 Course creation: `courseai-next/app/create/page.tsx`
- 🎨 Server Actions: `courseai-next/app/actions/courses.ts`
- 🔗 Webhook endpoint: `courseai-next/app/api/webhooks/coursegen/route.ts`
- 📊 Generation progress: `courseai-next/app/courses/generating/[slug]/page.tsx`

### 2.3 MVP Technologies

**Frontend:**

- Next.js 15.5 (App Router)
- Tailwind CSS v4
- Supabase Client (SSR + Client)
- shadcn/ui

**Backend (n8n):**

- n8n workflows
- Google Drive API
- OpenRouter (Grok4Fast, ChatGPT OSS120B)
- Google text-embedding-004 (embeddings)
- Supabase PostgreSQL + pgvector

**Infrastructure:**

- Supabase (legacy project: mmtpvtoifqpdcgiwwdvj)
  - **MCP access:** `mcp__supabase-legacy__*` (all legacy project functions)
- Google Drive (file storage)
- n8n Cloud (flow8n.ru)
  - **MCP access:** `mcp__n8n-mcp__*` (workflows, nodes, templates management)

### 2.4 MVP Limitations

- ❌ n8n vendor lock-in
- ❌ Google Drive dependency
- ❌ Limited AI model selection
- ❌ No orchestration and queues
- ❌ No external LMS integration
- ❌ No semi-automatic generation
- ❌ No learner analytics
- ❌ Monolithic structure (large files)

---

## 3. Target Production Architecture

### 3.1 General Schema

```
┌──────────────────────────────────────────────────┐
│                   Frontend Layer                  │
│  ┌──────────────┐         ┌──────────────────┐   │
│  │ Next.js App  │         │  External LMS    │   │
│  │ (courseai)   │         │  (Integration)   │   │
│  └──────┬───────┘         └────────┬─────────┘   │
└─────────┼──────────────────────────┼─────────────┘
          │                          │
          ↓                          ↓
┌──────────────────────────────────────────────────┐
│              API Gateway / tRPC Server            │
│  ┌─────────────────────────────────────────┐     │
│  │  Authentication, Rate Limiting, CORS    │     │
│  └─────────────────────────────────────────┘     │
└──────────────────────┬───────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────┐
│            Orchestration Layer (Main Entry)       │
│  ┌──────────────────────────────────────────┐    │
│  │  Queue System (BullMQ / Temporal)        │    │
│  │  - Job scheduling                        │    │
│  │  - Retry logic                           │    │
│  │  - Progress tracking                     │    │
│  │  - Cancellation support                  │    │
│  └──────────────────────────────────────────┘    │
└──────────┬──────────┬──────────┬──────────┬──────┘
           │          │          │          │
           ↓          ↓          ↓          ↓
┌──────────────────────────────────────────────────┐
│              Processing Workers                   │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐ │
│  │Document│  │Summary │  │Analyze │  │Generate│ │
│  │Process │  │Creator │  │Worker  │  │Worker  │ │
│  └────────┘  └────────┘  └────────┘  └────────┘ │
└──────────────────────┬───────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────┐
│                 AI / Services Layer               │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ OpenRouter   │  │  Vector DB (pgvector)    │  │
│  │ (Multi-model)│  │  (Context retrieval)     │  │
│  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ HeyGen API   │  │  File Processing Service │  │
│  │ (Video gen)  │  │  (Extract, chunk, embed) │  │
│  └──────────────┘  └──────────────────────────┘  │
└──────────────────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────────────────┐
│                 Data Layer                        │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Supabase    │  │  Local File Storage      │  │
│  │  (NEW)       │  │  (Server filesystem)     │  │
│  │  - Metadata  │  │  - Uploaded files        │  │
│  │  - Vectors   │  │  - Generated assets      │  │
│  │  - Progress  │  │                          │  │
│  └──────────────┘  └──────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 3.2 Architecture Principles

**1. Atomicity:**

- Each module - separate file (max 200-300 lines)
- Clear separation of concerns
- Reusable components

**2. Incremental Testing:**

- Each workflow tested in isolation
- Unit tests for business logic
- Integration tests for workflows

**3. Scalability:**

- Horizontal worker scaling
- Queues for load management
- Caching where possible

**4. Reliability (priority #1):**

- Retry mechanisms
- Graceful degradation
- Monitoring and alerting
- Detailed logging

---

## 4. Tech Stack

### 4.1 Frontend (no changes)

**Core:**

- Next.js 15.5 (App Router)
- TypeScript (strict mode)
- Tailwind CSS v4

**UI:**

- shadcn/ui
- Radix UI
- Framer Motion

**State & Forms:**

- Zustand (global state)
- React Hook Form + Zod

### 4.2 Backend (NEW - migration from n8n to code)

**Runtime:**

- Node.js 20+
- TypeScript

**API Layer:**

- tRPC (type-safe API)
- Next.js API Routes (webhooks, public endpoints)

**Orchestration:**

- ✅ **CHOSEN: BullMQ** (Redis-based, simple, proven)
  - Implemented in Stage 0-1
  - Job types: TEST_JOB, INITIALIZE, DOCUMENT_PROCESSING, SUMMARY_GENERATION, STRUCTURE_ANALYSIS, STRUCTURE_GENERATION, TEXT_GENERATION, FINALIZATION
  - Exponential backoff: 2^attempt × 1000ms
  - Job cancellation support (database-driven)
  - BullMQ dashboard at `/admin/queues`
- ⏸️ Temporal (complex scenarios, deferred)
- ⏸️ Inngest (event-driven, deferred)

**AI / Embeddings:**

- ✅ **CHOSEN: Direct Jina-v3 API** (no framework overhead)
  - 768-dimensional embeddings
  - 89 language support
  - Late chunking feature (35-49% improvement)
  - Task-specific embeddings: "retrieval.passage" vs "retrieval.query"
  - Advanced RAG: hierarchical + late + BM25 hybrid + structure-aware
  - Content deduplication with reference counting (80% cost savings)

**LLM Orchestration:**

- ✅ **CHOSEN: LangChain + LangGraph** (Stage 4+)
  - @langchain/core v0.3+ (TypeScript-native)
  - @langchain/openai (ChatOpenAI with OpenRouter baseURL)
  - @langchain/langgraph (StateGraph for multi-phase workflows)
  - **Use case:** Complex multi-phase orchestration (5+ phases with dependencies)
  - **Pattern:** Sequential workflow with retry/fallback (20B → 120B → Gemini)
  - **Integration:** OpenRouter API (300+ models, custom baseURL)
  - **Observability:** Custom Supabase metrics (NOT LangSmith - avoiding SaaS dependency)
  - **Decision:** [ADR-001](ADR-001-LLM-ORCHESTRATION-FRAMEWORK.md) - Evaluated 11 frameworks, LangChain scored 8.4/10
- ✅ **Direct OpenAI SDK** (Stage 3 and simple workflows)
  - OpenRouter integration via custom baseURL
  - Manual retry/fallback logic
  - Used for straightforward single-phase LLM calls
- ⏸️ LlamaIndex.js (RAG, deferred)
- ⏸️ Vercel AI SDK (simple, deferred)

### 4.3 Data Layer

**Database:**

- ✅ Supabase PostgreSQL (new project)
  - Course metadata
  - Users and plans
  - Generation progress
  - Vectors (pgvector)
  - **MCP access:** `mcp__supabase__*` (all new project functions)
  - **Legacy reference:** `mcp__supabase-legacy__*` (available for structure study)

**Course Content Storage Solution: PostgreSQL with normalized structure**

**Approach:** Separate metadata and content into different tables for query optimization

**Database Schema:**

```sql
-- Course metadata (lightweight queries for lists and navigation)
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID, -- for multi-tenancy
  status TEXT NOT NULL DEFAULT 'draft', -- draft, generating, ready, published
  settings JSONB, -- generation params, language, difficulty
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB -- additional metadata
);
CREATE INDEX idx_courses_user_id ON courses(user_id);
CREATE INDEX idx_courses_organization_id ON courses(organization_id);
CREATE INDEX idx_courses_status ON courses(status);

-- Course section structure
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  metadata JSONB, -- additional section data
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sections_course_id ON sections(course_id);
CREATE INDEX idx_sections_order ON sections(course_id, order_index);

-- Lesson metadata (WITHOUT heavy content!)
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  duration_minutes INTEGER,
  lesson_type TEXT, -- text, video, audio, quiz, presentation
  status TEXT DEFAULT 'pending', -- pending, generating, ready
  metadata JSONB, -- brief description, keywords, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lessons_section_id ON lessons(section_id);
CREATE INDEX idx_lessons_order ON lessons(section_id, order_index);

-- Lesson CONTENT (separate table - loaded only when needed!)
CREATE TABLE lesson_content (
  lesson_id UUID PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  text_content TEXT, -- main text content
  media_urls JSONB, -- links to video, audio, presentations
  quiz_data JSONB, -- quiz data
  interactive_elements JSONB, -- interactive elements
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Index not needed - always query by PRIMARY KEY
```

**Advantages of this approach:**

1. **Fast structure queries** - get course, section, lesson lists without loading heavy content
2. **Lazy Loading** - content loaded only when specific lesson needed
3. **Memory optimization** - API can return course structure in milliseconds
4. **Scalability** - if content grows, can move `lesson_content` to separate storage
5. **ACID guarantees** - PostgreSQL data integrity and transactions
6. **Simplicity** - no additional infrastructure needed (MongoDB, Redis)

**Typical queries:**

```typescript
// Get course structure (fast!)
const course = await db
  .select()
  .from(courses)
  .leftJoin(sections, eq(sections.courseId, courses.id))
  .leftJoin(lessons, eq(lessons.sectionId, sections.id))
  .where(eq(courses.id, courseId));
// Lesson content NOT loaded!

// Get specific lesson content (on demand)
const content = await db
  .select()
  .from(lessonContent)
  .where(eq(lessonContent.lessonId, lessonId))
  .limit(1);
```

**Future optimization (if needed):**

- Redis caching for frequently requested courses
- CDN for media_urls
- Read replicas for analytics

**File Storage:**

- Local storage on server (initial stage)
- Structure: `/uploads/{userId}/{courseId}/{fileId}`
- Later: S3-compatible (Supabase Storage, Cloudflare R2)

**Vector DB:**

- ✅ **ACTUAL IMPLEMENTATION:** Qdrant Cloud (free tier, 1GB storage)
  - HNSW index (m=16, ef_construct=100)
  - Cosine similarity distance
  - Payload indexes for multi-tenancy (organization_id, course_id)
  - Batch upload (100-500 vectors per batch)
  - Superior performance compared to pgvector
- ⏸️ **ORIGINAL PLAN:** pgvector (extension in Supabase PostgreSQL)
  - Decision: Qdrant chosen for better vector search performance and dedicated infrastructure

### 4.4 AI & External APIs

**OpenRouter:**

- Unified access to models
- **Multi-phase multi-model orchestration** (production-ready architecture)
- Per-phase model configuration via admin panel
- Fallback mechanism with quality-based escalation

**Content Generation (later):**

- HeyGen (video)
- ElevenLabs / OpenAI TTS (audio)
- reveal.js / Slidev (presentations)

### 4.5 Infrastructure

**Environments:**

- Development (local)
- Staging (pre-production tests)
- Production

**CI/CD:**

- GitHub Actions (or GitLab CI)
- Automated tests
- Deploy to VPS / Railway / Vercel

**Monitoring:**

- Sentry (errors)
- Prometheus + Grafana (metrics) OR Upstash (simple solution)
- Custom dashboard in admin panel

---

## 5. Development Stages

### 5.1 Decomposition Principle

Each n8n workflow = separate development stage with its own mini-spec:

```
Main Entry → Document Processing → Create Summary →
Analyze → Generate → Text Generation
```

### 5.2 Workflow 1: Main Entry → Orchestrator ✅ **COMPLETE**

**Goal:** Create orchestrator to replace n8n Main Entry

**Status:** ✅ PRODUCTION-READY (Completed in Stage 1 - 2025-10-22)

**References:**

- 📄 n8n workflow: `workflows n8n/CAI CourseGen - Main Entry (18).json`
- 🎨 Frontend webhook: `courseai-next/app/api/webhooks/coursegen/route.ts`
- 🎨 Server Actions: `courseai-next/app/actions/courses.ts`
- 📋 Specification: `specs/002-main-entry-orchestrator/spec.md`
- 📋 Tasks completed: 37/37 (100%)

**Implemented Features:**

1. ✅ BullMQ + Redis orchestration with job cancellation
2. ✅ 8 job types defined (TEST_JOB, INITIALIZE, DOCUMENT_PROCESSING, etc.)
3. ✅ JWT authentication (replaced HMAC)
4. ✅ Real-time progress tracking via `update_course_progress` RPC
5. ✅ Concurrency limits (per-tier + global)
6. ✅ Full Next.js frontend integration
7. ✅ Saga pattern with compensation (rollback on failures)
8. ✅ SuperAdmin role with audit trail
9. ✅ Production-grade RLS with JWT custom claims

**Additional Achievements:**

- Pino structured logging (10x faster than Winston)
- System metrics table for monitoring and alerting
- Orphan job recovery mechanism
- Retry utility with exponential backoff
- BullMQ dashboard at `/admin/queues`
- Zero security vulnerabilities (comprehensive scan passed)

**Result:**

- ✅ Working orchestrator in production
- ✅ BullMQ dashboard for monitoring
- ✅ API endpoint: `/api/coursegen/generate`
- ✅ tRPC endpoint: `generation.initiate`
- ✅ Comprehensive documentation (quickstart, API contracts, data model)

### 5.3 Workflow 2: Document Processing ✅ **COMPLETE**

**Goal:** Rewrite document processing to code

**Status:** ✅ 100% COMPLETE (All 38 tasks done, v0.12.2 released)
**Completed:** 2025-10-27

**References:**

- 📄 n8n workflow: `workflows n8n/CAI CourseGen - Document Processing (36).json`
- 🎨 Frontend upload: `courseai-next/app/create/page.tsx`

**Infrastructure Completed (Stage 0):**

1. ✅ File upload to local storage (tier-based validation)
2. ✅ Qdrant vector storage with HNSW index
3. ✅ Jina-v3 embeddings (768 dimensions, late chunking)
4. ✅ Advanced RAG: hierarchical + late + BM25 hybrid + structure-aware
5. ✅ Content deduplication with reference counting (80% cost savings)
6. ✅ File catalog table with vector_status tracking

**Workflow Migration Status:**

- ✅ All infrastructure implemented (Stage 0 - T052, T057, T074-T079)
- ✅ BullMQ worker handler complete and validated (Stage 0 - T074.3, T074.4)
  - File: `src/orchestrator/handlers/document-processing.ts` (456 lines)
  - Registered in: `src/orchestrator/worker.ts` (line 24, 45)
  - Full functionality: file retrieval, Docling conversion, chunking, embedding, Qdrant upload, progress tracking
- ✅ Integration tests complete (Stage 2 - T032: 17/17 passing, 100% pass rate)
- ✅ Database verified (Stage 2 - T004-T007: TRIAL tier, error_logs table)
- ✅ n8n workflow can now be replaced (all validation complete)

**AI Decisions Made:**

- ✅ Model for embeddings: Jina-v3 (89 languages, late chunking)
- ✅ Chunking strategy: Hierarchical (parent 1500 tokens, child 400 tokens)
- ✅ Chunk size: Token-aware with sentence boundaries
- ✅ Deduplication: SHA-256 hash with reference counting

**Completed Work (Stage 2 Verification):**

1. **✅ Database Tier Audit** (Phase 0-2):
   - TRIAL tier added to subscription_tier ENUM
   - error_logs table created (13 columns, 4 indexes, RLS policies)
   - Type definitions updated (tier.ts, error-logs.ts)
   - All 5 tiers verified: TRIAL, FREE, BASIC, STANDARD, PREMIUM

2. **✅ Integration Tests** (Phase 3):
   - Test file: `tests/integration/document-processing-worker.test.ts`
   - 17 tests created and passing (100% pass rate)
   - Test coverage:
     - All 5 subscription tiers validated
     - End-to-end BullMQ workflow tested
     - Tier-based file format restrictions verified
     - Chunking, embeddings, error logging, stalled job recovery validated
   - Test execution time: 5.3 minutes

3. **✅ Polish & Documentation** (Phase 4):
   - TypeScript errors fixed (4 unused imports)
   - Type-check: 0 errors, Build: successful
   - Documentation updated (SUPABASE-DATABASE-REFERENCE.md, IMPLEMENTATION_ROADMAP_EN.md)

### 5.4 Workflow 3: Create Summary ✅ **COMPLETE**

**Status:** ✅ COMPLETE (v0.13.0) - n8n workflow replaced with backend service

**Goal:** LLM-based document summarization with quality validation

**Implementation:**

**Architecture:**
- **Framework**: Direct OpenAI SDK (zero vendor lock-in)
- **Models**: OpenRouter integration (GPT OSS 20B/120B, Gemini 2.5 Flash)
- **Strategy**: Hierarchical chunking with adaptive compression
- **Quality Gate**: Jina-v3 embeddings (0.75 semantic similarity threshold)
- **Worker**: BullMQ async processing (concurrency: 5, timeout: 10 minutes)

**Key Features:**
- Hierarchical chunking (115K token chunks, 5% overlap)
- Adaptive compression (DETAILED → BALANCED → AGGRESSIVE, max 5 iterations)
- Small document bypass (<3K tokens, zero LLM cost, 100% fidelity)
- Multilingual support (13 languages with language-specific token estimation)
- Hybrid escalation retry (quality-based model upgrades)
- Stage 4 strict barrier (100% completion enforcement before next stage)

**Cost Tracking:**
- 3 tRPC endpoints: `getCostAnalytics`, `getSummarizationStatus`, `getDocumentSummary`
- Per-document, per-organization, per-model analytics
- Cost efficiency: $0.45-1.00/500 docs (99.8% cheaper than GPT-4)

**Database Changes:**
- Migration: `20251028000000_stage3_summary_metadata.sql`
- New columns: `processed_content`, `processing_method`, `summary_metadata`
- Index: `idx_file_catalog_processing_method` for analytics

**Testing:**
- 41+ tests passing (29 unit + 10 contract + 2 integration)
- Code review: 8.5/10 - APPROVED FOR PRODUCTION

**References:**
- 📄 Specification: `specs/005-stage-3-create/`
- 📄 n8n workflow (deprecated): `workflows n8n/CAI CourseGen - Create Summary (14).json`

### 5.5 Workflow 4: Course Structure Analyze ✅ **COMPLETE**

**Status:** ✅ COMPLETE (v0.14.6) - n8n workflow replaced with backend service

**Goal:** Multi-phase course content analysis with LLM orchestration

**Architecture:**
- **Framework:** LangChain + LangGraph for StateGraph orchestration.
- **Orchestration:** A 6-phase pipeline (barrier → classify → scope → expert → synthesis → assembly) ensures a structured and robust analysis process.
- **Models:** A multi-model strategy uses cost-effective models (GPT OSS-20B) for simple tasks and powerful models (GPT OSS-120B) for critical expert analysis, achieving 40-50% cost savings.
- **Observability:** Custom Supabase integration for token and cost tracking, avoiding vendor lock-in with tools like LangSmith.

**Key Features:**
- **Quality & Security:** Enforces a 100% completion barrier from Stage 3, includes XSS sanitization (DOMPurify), and detects research flags to ensure content quality.
- **Validation:** Enforces a minimum of 10 lessons per course and achieves a 99.99% quality score based on semantic similarity.
- **API:** Provides tRPC endpoints (`start`, `getStatus`, `getResult`) for managing and retrieving analysis results.

**References:**
- 📄 Specification: `specs/007-stage-4-analyze/`
- 📄 n8n workflow (deprecated): `workflows n8n/CAI CourseGen - Course Structure Analyze (23).json`

### 5.6 Workflow 5: Course Structure Generate ✅ **COMPLETE**

**Status:** ✅ COMPLETE (v0.16.28) - n8n workflow replaced with backend service

**Goal:** Generate the final course structure using the analysis from Stage 4.

**Architecture:**
- **Framework:** Reuses the successful LangChain + LangGraph pattern from Stage 4.
- **Orchestration:** A 5-phase pipeline (validate → metadata → sections → quality → assembly) that processes the course in batches.
- **Models:** Employs an intelligent multi-model routing strategy (RT-001) using `qwen3-max` for critical metadata, `OSS 120B` for most sections, and `Gemini 2.5 Flash` for overflow, optimizing for both cost ($0.30-0.40 per course) and quality (85-90% semantic similarity).
- **Quality & Resilience:**
    - **Pedagogical Validation (RT-006):** Integrates Bloom's Taxonomy rules to block non-measurable verbs and placeholders, preventing 55-60% of low-quality drafts.
    - **JSON Repair (RT-005):** A 4-level repair cascade fixes malformed JSON, saving 20-30% in token costs compared to simple regeneration.
    - **Retry Logic (RT-004):** A 10-attempt tiered retry mechanism escalates through different models to ensure successful generation.

**Key Features:**
- **Flexibility:** Supports both title-only generation and generation from a rich `analysis_result` context.
- **Customization:** Integrates 19 different course styles.
- **Interactivity:** Provides a `generation.regenerateSection` tRPC endpoint for incremental, semi-automatic adjustments.
- **Database:** Stores the final output in a `course_structure` JSONB column and tracks all generation metrics (cost, model usage, quality scores) in the `generation_metadata` table.

**References:**
- 📄 Specification: `specs/008-generation-generation-json/`
- 📄 n8n workflow (deprecated): `workflows n8n/CAI CourseGen - Course Structure generate (27).json`

### 5.7 Workflow 6: Text Generation ⏸️ **PLANNED**

**Status:** ⏸️ PLANNED (n8n workflow still active)

**Goal:** Generate lesson content

**References:**

- 📄 n8n workflow: `workflows n8n/CAI CourseGen - Text generation (NEW) (1).json`
- 🎨 Progress UI: `courseai-next/app/courses/generating/[slug]/page.tsx`

**Status:** Infrastructure ready (OpenRouter, RAG, lesson_content table), workflow migration pending

**Note:** AI assistant for course editing requires separate implementation

---

## 6. Future Features (Roadmap)

> **Important:** These features are NOT part of current migration. Planned for later implementation.

### 6.1 Multi-format Generation

**Formats:**

- ✅ Text (implemented)
- ⏳ Audio (TTS via ElevenLabs/OpenAI)
- ⏳ Video (HeyGen API)
- ⏳ Presentations (reveal.js generation)
- ⏳ Quizzes (AI-generated quizzes)

**Approach:**

- Separate workers for each format
- Unified API for LMS
- Tokens charged by content type

### 6.2 Learner Analytics

**Goal:** Learning personalization

**Features:**

- Lesson completion statistics collection
- Quiz result analysis
- Identify strengths/weaknesses
- Learning effectiveness assessment

**AI Workflow:**

- Separate analyzer based on learning history
- Learner profile vectorization
- Course recommendations

### 6.3 Individual Programs

**Concept:** Morning 20-minute lessons

**Personalization:**

- Content selection for weak areas
- Learning style adaptation (based on tests)
- Automatic micro-learning path generation

**Analysis Data:**

- Course completion history
- Test results
- Preferences and feedback

### 6.4 Employee Profile

**Outputs:**

- Current competency level
- Strengths/weaknesses
- Learning progress
- Recommended courses/positions

**Application:**

- HR analytics
- Career planning
- Learning selection

---

## 7. Integrations

### 7.1 LMS Integration

**Type:** Two-way REST API integration

**Direction: LMS → MegaCampusAI**

**Endpoints (we provide):**

```typescript
POST /api/courses/create
{
  topic: string
  description?: string
  documents?: File[]
  settings: {
    mode: 'auto' | 'semi-auto'
    language: string
    difficulty: string
    // ... other params
  }
  callbackUrl?: string // for statuses
}
→ Response: { courseId, status }

GET /api/courses/:courseId/status
→ Response: {
  courseId,
  status,
  progress: { step, percentage, message },
  needsApproval?: { stage, data } // for semi-auto
}

POST /api/courses/:courseId/approve
{
  stage: 'analyze' | 'generate'
  approved: boolean
  changes?: object
}

GET /api/courses/:courseId/export
→ Response: { course data in LMS-compatible format }
```

**Direction: MegaCampusAI → LMS**

**Webhooks (we send):**

```typescript
// Status updated
POST {lms.callbackUrl}/course-status
{
  courseId: string
  status: 'generating' | 'needs_approval' | 'completed' | 'failed'
  progress: { step, percentage }
  data?: object
}

// Approval required (semi-auto)
POST {lms.callbackUrl}/approval-required
{
  courseId: string
  stage: 'analyze' | 'generate'
  data: object // structure for approval
}
```

**Authentication:**

- API Key (Bearer token)
- HMAC signature for webhooks
- Rate limiting

**Course Data Format:**

```typescript
interface CourseExport {
  id: string;
  title: string;
  description: string;
  metadata: {
    language: string;
    difficulty: string;
    estimatedDuration: number;
    // ...
  };
  structure: {
    sections: Array<{
      id: string;
      title: string;
      order: number;
      lessons: Array<{
        id: string;
        title: string;
        order: number;
        content: {
          text?: string;
          audio?: { url: string; duration: number };
          video?: { url: string; duration: number };
          presentation?: { url: string; slides: number };
        };
        quiz?: Quiz;
      }>;
    }>;
  };
}
```

### 7.2 OpenRouter

**Usage:**

- All AI generations via OpenRouter
- **Multi-phase multi-model orchestration** (production-ready architecture, successfully implemented in Stages 4 and 5).
- Per-phase model configuration via admin panel
- Fallback mechanism with quality-based escalation

**Architecture Philosophy - Multi-Phase Multi-Model Orchestration:**

**Principle:** Different analysis tasks require different model capabilities. Use appropriate model for each phase from the start, rather than escalation-based approach.

**Pattern (applies to ALL LLM-powered stages: 4-7):**
- **Simple tasks** → Cheap models (e.g., `openai/gpt-oss-20b`) - fast, cost-effective
- **Expert-level tasks** → Expensive models (e.g., `openai/gpt-oss-120b`) - ALWAYS use best model from start

**Example: Stage 4 Analysis (5 phases)**:
1. **Phase 1 - Basic Classification** → 20B (simple categorization)
2. **Phase 2 - Scope Analysis** → 20B (mathematical estimation)
3. **Phase 3 - Deep Expert Analysis** → 120B ALWAYS (research flags, pedagogy, expansion areas - **no compromise on quality**)
4. **Phase 4 - Document Synthesis** → Adaptive (20B for <3 docs, 120B for ≥3 docs)
5. **Phase 5 - Final Assembly** → No LLM (code logic)

**Benefits:**
- ✅ **Cost optimization**: Use expensive models only where needed (~40-50% cost reduction)
- ✅ **Quality preservation**: Critical decisions get best model from start (no retry-based escalation)
- ✅ **Granular control**: Per-phase model configuration in admin panel
- ✅ **Scalability**: Pattern extends to all stages (5, 6, 7)

**Configuration (admin panel):**

```typescript
interface AIConfig {
  embeddings: {
    provider: 'openai' | 'cohere' | ...
    model: string
  }
  summarization: {
    provider: string
    model: string
    fallback?: string
  }

  // Stage 4: Course Analysis (per-phase model selection)
  courseAnalysis: {
    phase1_model: string  // Basic classification (default: gpt-oss-20b)
    phase2_model: string  // Scope analysis (default: gpt-oss-20b)
    phase3_model: string  // Deep expert analysis (default: gpt-oss-120b - ALWAYS expensive)
    phase4_simple_model: string   // Document synthesis <3 docs (default: gpt-oss-20b)
    phase4_complex_model: string  // Document synthesis ≥3 docs (default: gpt-oss-120b)
    emergency_model: string       // Context overflow (default: gemini-2.5-flash)
    fallback_model: string        // Escalation for cheap phases (default: gpt-oss-120b)
  }

  // Future: Stage 5-7 per-phase models (add as stages implemented)
  // contentGeneration: { structure_model, validation_model, ... }

  contentGeneration: {
    provider: string
    model: string
    temperature: number
    maxTokens: number
  }
}
```

**Retry Logic:**
- Cheap phases (20B): 2 attempts → escalate to 120B
- Expensive phases (120B): 2 attempts → escalate to Emergency model (Gemini)
- If Emergency fails: Job fails with detailed error

**Quality over Speed:**
- Always prioritize quality over processing speed
- Timeouts are technical limits, not performance targets
- Users prefer waiting 5-10 minutes for high-quality results over fast but poor output

---

## 8. Monetization

### 8.1 Pricing Model

**Plan components:**

```typescript
interface Plan {
  id: string;
  name: string;
  price: number; // RUB/month

  // Limits
  maxUsers: number; // learner count
  includedTokens: number; // tokens per month

  // Priorities
  queuePriority: 'low' | 'normal' | 'high';

  // Features
  features: {
    autoGeneration: boolean;
    semiAutoGeneration: boolean;
    aiAssistant: boolean;
    analytics: boolean;
    customBranding: boolean;
  };
}
```

**Tokens:**

- Included in tier (monthly)
- Package purchase option
- Charged per action:
  - Text generation: X tokens/1000 words
  - Vectorization: Y tokens/document
  - Video generation: Z tokens/minute
  - etc.

**Detailed economics:** To be determined later

### 8.2 Usage Tracking

**Tracking:**

- All AI calls logged
- Token counting per organization
- Usage history
- Alerts when approaching limit

---

## 9. Quality Requirements

### 9.1 Priorities

1. **Reliability** 🔴
   - 99.9% uptime (goal)
   - Graceful error handling
   - Data integrity
   - Automatic recovery

2. **Functionality** 🟡
   - Complete feature implementation
   - Extensibility for future capabilities

3. **Speed** 🟢
   - Not critical (educational content)
   - Optimization where possible
   - Progress bars and feedback

### 9.2 Testing

**Unit Tests:**

- Business logic
- Utilities
- Validation

**Integration Tests:**

- Workflow end-to-end
- API endpoints
- Database operations

**E2E Tests:**

- Critical user flows
- LMS integration

**Load Tests:**

- High load readiness
- Bottleneck identification

### 9.3 Monitoring and Logging

**Logging:**

- Structured logs (JSON)
- Levels: debug, info, warn, error
- Correlation IDs for tracing

**Metrics:**

- Queue sizes
- Processing times
- Error rates
- Token usage

**Alerts:**

- Queue overflow
- High error rate
- Token limit approaching
- System health

### 9.4 Security

**Authentication:**

- Supabase Auth for users
- API Keys for LMS integration
- HMAC for webhooks

**Authorization:**

- Row Level Security (Supabase)
- Role-based access
- Multi-tenancy isolation

**Data:**

- Encryption at rest (Supabase)
- HTTPS everywhere
- Secure file uploads

---

## 10. Deployment Plan

### 10.1 Phases

**Phase 1: Foundation (Stage 1-2)**

- Main Entry → Orchestrator
- Document Processing
- Basic admin panel

**Phase 2: Core Workflows (Stage 3-4)**

- Summary Creation
- Course Analysis

**Phase 3: Generation (Stage 5-6)**

- Structure Generation
- Text Generation

**Phase 4: Integration**

- LMS API
- Semi-auto mode
- AI Assistant

**Phase 5: Production Ready**

- Monitoring
- Performance optimization
- Load testing

### 10.2 Parallel System Operation

**Strategy:**

- Old MVP (n8n + old Supabase) → Don't touch
- New Production (code + new Supabase) → Develop
- Parallel operation period for testing
- Gradual user transition

---

## 11. Questions for Joint Resolution

### 11.1 Technical Decisions (per workflow)

**At each workflow stage we decide:**

- [ ] AI model selection for task
- [ ] Prompt engineering
- [ ] Processing strategies (chunking, batching, retry)
- [ ] Performance optimization

### 11.2 Research

**Priority:** Research LangChain alternatives

- **LlamaIndex.js** - for RAG and document work
- Other specialized libraries

**Selection criteria:**

- Flexibility for complex scenarios
- Performance
- Support and ecosystem
- Component atomicity

---

## 12. Next Steps

### 12.1 Immediate Actions

1. ✅ Approve general spec (COMPLETE)
2. ✅ Create detailed spec for **Workflow 1: Main Entry** (COMPLETE - Stage 1)
   - Specification: `specs/002-main-entry-orchestrator/spec.md`
   - Data model: `specs/002-main-entry-orchestrator/data-model.md`
   - API contracts: `specs/002-main-entry-orchestrator/contracts/`
3. ✅ Choose orchestration library (COMPLETE - BullMQ chosen)
   - BullMQ + Redis implemented in Stage 0
   - 8 job types defined with exponential backoff
   - Job cancellation support via database-driven mechanism
4. ✅ Create new Supabase project (COMPLETE)
   - Production project: diqooqbuchsliypgwksu (MegaCampusAI)
   - 20+ migrations applied
   - Production-grade RLS with JWT custom claims
5. ✅ Setup CI/CD pipeline (COMPLETE - Stage 0)
   - GitHub Actions workflows: test, build, deploy-staging
   - Automated tests on push/PR
   - Branch protection rules documented

### 12.2 Workflow-specific Specs

Create separate detailed document for each workflow:

- `SPEC_Workflow_1_Main_Entry.md`
- `SPEC_Workflow_2_Document_Processing.md`
- ...

**Workflow spec structure:**

1. Goals and objectives
2. Input/output data
3. Business logic
4. AI components (models, prompts)
5. Tests
6. Acceptance criteria

---

## Appendices

### A. Current DB Structure (Supabase Legacy)

> See legacy project for table structure reference
>
> **MCP Access:** `mcp__supabase-legacy__*`
>
> - `list_tables()` - table list
> - `execute_sql()` - queries to legacy DB
> - `list_migrations()` - migration history

### B. n8n Workflows JSON

> Saved in `/workflows n8n/` for reference
>
> **MCP Access:** `mcp__n8n-mcp__*`
>
> - `get_node_info()` - node information
> - `search_nodes()` - search nodes by keywords
> - `get_node_documentation()` - node documentation
> - Workflows also available locally in `/workflows n8n/`

### C. API Specifications

> TBD: OpenAPI/Swagger specs for LMS integration

---

**End of Document**

_Version: 1.1_
_Next review: After approval and Workflow 1 start_
