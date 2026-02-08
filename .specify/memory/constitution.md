<!--
Sync Impact Report:
- Version change: 1.1.0 → 1.2.0
- Modified principles:
  - IV. Atomic Evolution (updated for Beads integration)
  - VII. Task Tracking & Artifacts → Task Tracking with Beads
- Added principles:
  - VIII. Test-Driven Development
  - IX. Minimal Documentation
- Templates requiring updates: ✅ None
- Follow-up TODOs: Install Beads CLI (`bd`) for task tracking
-->

# MegaCampusAI Constitution

<!-- Defines the non-negotiable laws and principles for the MegaCampusAI project -->

## Core Principles

### I. Context-First Architecture

Before any implementation or delegation, comprehensive context gathering is **MANDATORY**. Engineers and Agents must read existing code in related files, search for similar patterns, and review relevant documentation (specs, ADRs) before writing a single line of code. Blind implementation is strictly prohibited.

### II. Single Source of Truth

Types, constants, enums, schemas, and shared logic MUST be defined in `packages/shared-types` or designated central files (e.g., `file-upload-constants.ts`). Duplication of business logic or types across packages is forbidden. Consumers must import/re-export from the shared location.

### III. Strict Type Safety (NON-NEGOTIABLE)

TypeScript `strict` mode is enforced. The use of `any` is prohibited; use `unknown` or proper types. Explicit return types are required for all functions. `pnpm type-check` must pass before any commit. Type definitions must reflect the database schema (via `database.generated.ts`) and Zod schemas.

### IV. Atomic Evolution

Work MUST be broken down into small, verifiable tasks. Commits should occur after EACH completed task using `/push patch`. Progress MUST be tracked in Beads (`bd`) with status updates: `in_progress` before starting, `closed` after completion. For big features (>1 day), use Spec-kit planning (`/speckit.specify` → `/speckit.tasks`) then import to Beads.

### V. Quality Gates & Security

Code must pass all quality gates before commitment: Build, Lint, Test, and Type-Check. Security best practices are enforced: Row-Level Security (RLS) for all database access, Zod validation for all inputs, and no hardcoded credentials.

### VI. Library-First Development

Before implementing custom solutions for new functionality, ALWAYS research and evaluate existing libraries or open-source tools. Use `context7` to gather comprehensive documentation and usage examples. Adapt existing solutions rather than writing from scratch whenever possible to reduce maintenance burden and leverage community standards.

### VII. Task Tracking with Beads

All work items MUST be tracked in Beads (`bd`). Update status to `in_progress` before starting, `closed` after completion with reason. Emergent tasks discovered during work MUST be created via `bd create --deps discovered-from:<current-task>`. Mandatory `bd sync` at session end. Use wisps (`bd mol wisp`) for exploratory work.

### VIII. Test-Driven Development

Tests MUST be written or updated alongside code changes. New features require tests before merge. Test coverage must not decrease. Red-Green-Refactor cycle is encouraged for complex logic. Use Vitest for unit tests, pgTAP for database tests.

### IX. Minimal Documentation

Public APIs, complex algorithms, and non-obvious decisions require inline documentation. JSDoc comments for exported functions. README.md for new packages/modules. Architecture Decision Records (ADRs) for significant architectural choices stored in `docs/adr/`.

## Tech Stack & Standards

**Runtime**: Node.js 20+ (LTS), pnpm 8+  
**Language**: TypeScript 5.3+ (Strict Mode)  
**Frameworks**: tRPC 10.x, Supabase (PostgreSQL + Auth), BullMQ, React/Next.js (Frontend)  
**Infrastructure**: Qdrant (Vector DB), Redis, Jina-v3 (Embeddings)  
**Conventions**: Monorepo (pnpm workspaces), Conventional Commits, ESLint + Prettier

## Workflow & Governance

**Agent Orchestration**: Follow the "Orchestrator" pattern defined in `CLAUDE.md`.
**Task Management**: Beads (`bd`) is the primary system for all task tracking. Spec-kit (`/speckit.*`) for planning big features only.
**Planning**: Use `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` for features >1 day, then import to Beads.
**Testing**: Tests (Vitest/pgTAP) are mandatory for new features. TDD encouraged.
**Review**: All changes are subject to automated CI checks and code review standards.

## Governance

This Constitution supersedes all other development practices. Amendments require explicit documentation, justification, and a version bump. Runtime guidance is provided in `CLAUDE.md` (Agent Rules) and `README.md` (Project Overview), but they must align with these core principles.

**Version**: 1.2.0 | **Ratified**: 2025-11-25 | **Last Amended**: 2025-01-08
