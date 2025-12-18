<!--
Sync Impact Report:
- Version change: (new) → 1.0.0
- Added principles: Context-First Architecture, Single Source of Truth, Strict Type Safety, Atomic Evolution, Quality Gates
- Added sections: Tech Stack & Standards, Workflow & Governance
- Templates requiring updates: ✅ None (Plan/Spec/Tasks templates are compatible)
- Follow-up TODOs: None
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
Work must be broken down into small, verifiable tasks. Commits should occur after EACH completed task using the `/push` command (typically `/push patch`). Progress must be tracked in a task list (`tasks.md`), with items marked `in_progress` before starting and `completed` after verification.

### V. Quality Gates & Security
Code must pass all quality gates before commitment: Build, Lint, Test, and Type-Check. Security best practices are enforced: Row-Level Security (RLS) for all database access, Zod validation for all inputs, and no hardcoded credentials.

### VI. Library-First Development
Before implementing custom solutions for new functionality, ALWAYS research and evaluate existing libraries or open-source tools. Use `context7` to gather comprehensive documentation and usage examples. Adapt existing solutions rather than writing from scratch whenever possible to reduce maintenance burden and leverage community standards.

### VII. Task Tracking & Artifacts
ALWAYS mark tasks as completed in `tasks.md` immediately upon finishing them. Append a list of created/modified file paths (Artifacts) to the task entry for traceability. Keep updates concise to conserve tokens.

## Tech Stack & Standards

**Runtime**: Node.js 20+ (LTS), pnpm 8+  
**Language**: TypeScript 5.3+ (Strict Mode)  
**Frameworks**: tRPC 10.x, Supabase (PostgreSQL + Auth), BullMQ, React/Next.js (Frontend)  
**Infrastructure**: Qdrant (Vector DB), Redis, Jina-v3 (Embeddings)  
**Conventions**: Monorepo (pnpm workspaces), Conventional Commits, ESLint + Prettier

## Workflow & Governance

**Agent Orchestration**: Follow the "Orchestrator" pattern defined in `CLAUDE.md`.  
**Planning**: Use `/speckit` commands (`plan`, `spec`, `tasks`) to structure feature development.  
**Testing**: Tests (Vitest/pgTAP) are mandatory for new features.  
**Review**: All changes are subject to automated CI checks and code review standards.

## Governance

This Constitution supersedes all other development practices. Amendments require explicit documentation, justification, and a version bump. Runtime guidance is provided in `CLAUDE.md` (Agent Rules) and `README.md` (Project Overview), but they must align with these core principles.

**Version**: 1.1.0 | **Ratified**: 2025-11-25 | **Last Amended**: 2025-11-25

