# Implementation Plan: Admin Monitoring Page

**Branch**: `feature/admin-monitoring-page` | **Date**: 2025-11-25 | **Spec**: [specs/011-admin-monitoring-page/spec.md](specs/011-admin-monitoring-page/spec.md)
**Input**: Feature specification from `specs/011-admin-monitoring-page/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a comprehensive Admin Monitoring Page to visualize and control the course generation process. This includes a real-time dashboard, trace viewer for debugging, and manual controls for Stage 6 (Lesson Content Generation) with refinement capabilities. The system will leverage Supabase for storage and real-time updates.

## Technical Context

**Language/Version**: TypeScript 5.3+ (Strict Mode)
**Primary Dependencies**: tRPC 10.x, React 18+, Supabase JS Client, BullMQ
**Storage**: Supabase (PostgreSQL 15+)
**Testing**: Vitest (Unit/Integration)
**Target Platform**: Web (Next.js)
**Project Type**: Web application (Monorepo: packages/web + packages/course-gen-platform)
**Performance Goals**: < 100ms UI interaction latency, < 500ms real-time delay
**Constraints**: 90-day trace retention, strict RLS policies

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Context-First**: Spec includes detailed tech decisions and context.
- [x] **Single Source of Truth**: shared-types will be used for schemas.
- [x] **Strict Type Safety**: Project uses strict mode.
- [x] **Atomic Evolution**: Roadmap broken down into phases.
- [x] **Quality Gates**: Tests included in roadmap.

## Project Structure

### Documentation (this feature)

```text
specs/011-admin-monitoring-page/
├── plan.md              # This file
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
packages/course-gen-platform/
├── src/
│   ├── server/
│   │   └── routers/
│   │       └── admin.ts  # New tRPC router
│   └── shared/
│       └── trace-logger.ts # Trace logging utility
└── supabase/
    └── migrations/       # New tables and RLS policies

packages/web/
├── src/
│   ├── app/
│   │   └── admin/
│   │       └── generation/
│   │           └── [courseId]/
│   │               └── page.tsx # Main dashboard
│   ├── components/
│   │   └── generation-monitoring/
│   │       ├── generation-timeline.tsx
│   │       ├── trace-viewer.tsx
│   │       └── manual-stage6-panel.tsx
│   └── lib/
│       └── supabase/     # Realtime hooks
└── tests/
```

**Structure Decision**: Standard monorepo structure with `course-gen-platform` for backend logic/API and `web` for the Next.js frontend dashboard.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | | |
