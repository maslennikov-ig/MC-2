# Implementation Plan: Generation Progress Page Redesign

**Branch**: `012-celestial-redesign` | **Date**: 2025-11-27 | **Spec**: [link](./spec.md)
**Input**: Feature specification from `/specs/012-celestial-redesign/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement the "Celestial Mission" concept for the course generation progress page. This involves replacing the existing linear progress bar and tabbed interface with a vertical, space-themed timeline where each stage is represented as a planet. The redesign includes a new "Mission Control" banner for stage approvals, detailed results drawers, and real-time status updates using Supabase Realtime.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 15
**Primary Dependencies**: Framer Motion (animations), Tailwind CSS 4 (styling), Lucide React (icons), Supabase Client (realtime)
**Storage**: Existing Supabase `courses` and `generation_trace` tables (read-only for this feature)
**Testing**: Vitest (unit/component tests)
**Target Platform**: Web (Responsive Mobile/Desktop)
**Project Type**: Web Application (Next.js App Router)
**Performance Goals**: Real-time updates < 2s latency, smooth animations (60fps)
**Constraints**: Must maintain existing admin monitoring tools, strict adherence to "Celestial" design theme
**Scale/Scope**: Single page redesign (`app/courses/generating/[slug]/page.tsx` and children)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Context-First Architecture**: ✅ Existing code analysis (page.tsx, GenerationProgressContainerEnhanced.tsx) completed.
- **II. Single Source of Truth**: ✅ Using shared types from `@megacampus/shared-types` (or `web/types` if specific to frontend).
- **III. Strict Type Safety**: ✅ Strict mode enforced, full typing for props and state.
- **IV. Atomic Evolution**: ✅ Plan broken down into component-based tasks.
- **V. Quality Gates & Security**: ✅ No new sensitive data exposure; existing RLS applies.
- **VI. Library-First Development**: ✅ Using Framer Motion for complex animations instead of custom CSS/JS.
- **VII. Task Tracking & Artifacts**: ✅ Tasks will be tracked in `tasks.md`.

## Project Structure

### Documentation (this feature)

```text
specs/012-celestial-redesign/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/web/
├── app/
│   └── courses/
│       └── generating/
│           └── [slug]/
│               ├── page.tsx                          # Server component (No change)
│               └── GenerationProgressContainerEnhanced.tsx # Main client container (Refactor)
├── components/
│   ├── generation-celestial/                 # NEW: Celestial theme components
│   │   ├── index.ts
│   │   ├── utils.ts
│   │   ├── CelestialHeader.tsx
│   │   ├── CelestialJourney.tsx
│   │   ├── PlanetNode.tsx
│   │   ├── ActiveStageCard.tsx
│   │   ├── PhaseProgress.tsx
│   │   ├── MissionControlBanner.tsx
│   │   ├── StageResultsDrawer.tsx
│   │   ├── TrajectoryLine.tsx
│   │   └── SpaceBackground.tsx
│   └── generation-monitoring/                # EXISTING: Admin tools (Keep)
├── types/
│   └── course-generation.ts                  # EXISTING: Types
└── app/actions/
    └── admin-generation.ts                   # EXISTING: Server actions
```

**Structure Decision**: Feature-specific components grouped in `components/generation-celestial` to avoid polluting the global namespace and allow for clean replacement of the old UI.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None      |            |                                     |
