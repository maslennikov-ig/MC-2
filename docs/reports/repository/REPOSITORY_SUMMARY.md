# Repository Analysis: MegaCampusAI

## Executive Summary

MegaCampusAI is a pnpm-managed TypeScript monorepo that delivers an AI-powered, multi-tenant course generation platform spanning a Next.js 15 experience layer and a Supabase-backed orchestration core. The system combines LangGraph-driven generation workflows, Docling-based document processing, and Qdrant vector search to produce structured course outlines with enterprise security controls.

## Overview

The repository houses all source needed to intake instructor material, convert it into retrieval-friendly embeddings, and orchestrate five-stage course generation jobs. Stage 0 infrastructure (multi-tenant Supabase schema, RLS enforcement, BullMQ queues) and Stage 5 capabilities (structure generation, incremental regeneration, cost validation) are complete, providing a foundation that future content and LMS integrations can build on.

## Architecture

- **Workspace layout**: Defined by `pnpm-workspace.yaml`, the repo includes the Next.js frontend (`courseai-next`), the tRPC/BullMQ backend (`packages/course-gen-platform`), shared contract packages, infra services, and a large `docs/` + `specs/` knowledge base.
- **Frontend layer**: `courseai-next` is a React 19 + Next.js 15 app using the App Router, Tailwind, shadcn UI, Supabase SSR helpers, and dynamic shader-heavy hero experiences. It exposes creation flows, course dashboards, and feature catalogs while handling auth/session management.
- **API & orchestration layer**: `packages/course-gen-platform` exposes a tRPC server, schedules work with BullMQ on Redis, and contains LangGraph/LangChain-based Stage 5 services plus Supabase migrations/tests. Job status, validation, and incremental regeneration live here.
- **Intelligence layer**: Docling MCP microservice (`services/docling-mcp`) converts uploads into structured Markdown/JSON, Jina-v3 embeddings feed Qdrant Cloud, and hybrid BM25 + dense retrieval drives the RAG context consumed by multi-model OpenRouter calls.
- **Data & security layer**: Supabase provides PostgreSQL with 100% RLS coverage, JWT auth, storage buckets, and tier-aware quotas. Shared Zod + generated Supabase types enforce contract fidelity across packages.

## Key Components

- **`courseai-next/`**: Next.js portal with shader-based marketing pages, authenticated dashboards, profile flows, `/app/create` course builder, `/app/actions` server utilities, and Playwright/Jest coverage for UI and accessibility.
- **`packages/course-gen-platform/`**: tRPC API, BullMQ orchestrators, LangGraph generation services, Supabase migrations/tests, and extensive Stage 5 docs for schema unification, metadata generation, and cost calculators.
- **`packages/shared-types/`**: Centralized Supabase-generated types, BullMQ job schemas, and Zod validators consumed by both server and clients.
- **`packages/trpc-client-sdk/`**: Typed SDK that wraps MegaCampus tRPC routers with batching, JWT handling, and framework-agnostic utilities for partner integrations.
- **`services/docling-mcp/`**: Containerized Docling MCP server exposing streamable HTTP transport for large document conversion, tuned for BullMQ workers.
- **`docs/` & `specs/`**: Architecture diagrams, ADRs, pricing tiers, Stage-by-stage requirements, and investigation reports that capture decision context; high-churn spec files (e.g., `specs/008-generation-generation-json/tasks.md`) show where planning evolves fastest.

## Technologies Used

- **Languages & runtimes**: TypeScript 5.9, Node.js 20+, React 19, Next.js 15, pnpm workspaces.
- **Frameworks & libs**: tRPC, BullMQ, LangGraph/LangChain, Supabase SSR helpers, Tailwind CSS 4, shadcn/ui, Radix UI primitives, Zustand state, React Hook Form, Playwright, Jest, Vitest, ESLint 9, Prettier 3.
- **Platforms & data stores**: Supabase PostgreSQL (pgvector), Qdrant Cloud for vectors, Redis 7 for queues, Docling MCP service, OpenRouter multi-model inference, Jina-v3 embeddings, Dockerized Docling stack.
- **Tooling & workflows**: GitHub Actions CI, Supabase CLI, MCP profiles (`mcp/.mcp.*`), n8n automation workflows, comprehensive documentation inside `docs/` and `specs/`.

## Data Flow

1. Authenticated instructors use `courseai-next` to upload content and configure generation, with Supabase SSR ensuring fresh session state (`app/page.tsx` enforces `dynamic = 'force-dynamic'`).
2. The frontend calls the tRPC API via `@megacampus/trpc-client-sdk`, passing validated payloads generated from `@megacampus/shared-types`.
3. API procedures enqueue BullMQ jobs; workers orchestrate five phases (doc ingestion, summarization, structure analysis, structure generation, optional content) through LangGraph state machines.
4. Workers call the Docling MCP service for OCR/conversion, generate embeddings (Jina-v3), push vectors into Qdrant, issue hybrid retrieval queries, and route prompts through OpenRouter’s large models.
5. Supabase stores course metadata, job status, organization tiers, and file catalogs with RLS enforcing org-wide isolation. Results sync back to the frontend via polling/SSE endpoints, and analytics feed docs/tests for compliance.

## Team and Ownership

- **Igor Maslennikov (124 commits in the past year)** – principal architect driving Stage 5 services, schema unification (`feat(schema)`), large-scale test repairs, and weekly releases.
- **`maslennikov-ig` alias (9 commits)** – handles branch merges (`Merge pull request #5/#4`) and targeted fixes while keeping release automation in sync.
- **Dahgoth (1 commit)** – local maintainer for developer-environment adjustments and CLI orchestration.

Ownership aligns with package boundaries: Igor leads backend/orchestration and documentation; the alias account manages merges and infrastructure; frontend work is consolidated under the same author, evidenced by synchronized version bumps across `courseai-next`, shared packages, and root `package.json`.

## Development Velocity

- **Commit volume**: 246 commits overall, with 134 dated within the last year (`git rev-list --all --count`, `git log --oneline --since="1 year ago"`). Activity is concentrated in **Nov 2025 (111 commits)** and **Oct 2025 (23 commits)**.
- **Recent cadence**: The last 30 days delivered 30+ commits covering v0.16.14 → v0.16.32 releases, massive test stabilization efforts (`fix(tests)`, `test(stage5)`), and production readiness work such as Qwen-3 Max pricing updates (`bd8da79`).
- **Work focus**: File-frequency analysis shows `packages/course-gen-platform/package.json` (46 touches), `CHANGELOG.md` (44), and per-package `package.json` files (~39 each) being updated in lockstep, reflecting the monorepo release cadence. High-spec churn (`specs/008-generation-generation-json/tasks.md`, 28 touches) highlights ongoing planning for generation JSON contracts.
- **Collaboration style**: Only two merge commits landed in the past year (`git log --merges --since="1 year ago"`), indicating a mostly linear history managed by a single core contributor who pushes cohesive batches rather than multi-branch integration.
- **Quality investment**: More than a third of recent commits explicitly target test reliability (`fix(tests)`, `test: fix 533+ tests`) and schema validation, aligning with the Supabase RLS and Stage 5 stability emphasis documented in `docs/ARCHITECTURE-DIAGRAM.md`.

Overall, MegaCampusAI ships in tightly scoped release trains, with detailed documentation and synchronized package publishing ensuring the frontend, backend, and client SDKs evolve together.
