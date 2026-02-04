# Auto Memory

## Key Patterns & Lessons

### RefinementChat Architecture

- `useRefinement` hook (useRefinement.ts) manages chat state, `RefinementChat` component renders it
- `useRefinement.refine()` adds BOTH user + assistant messages atomically to chatHistory
- Pending messages in RefinementChat are optimistic UI - must be cleared when history grows
- Use `useRef` to track previous length for clearing, NOT role-based comparison
- Event `course-data-updated` must use `createCourseDataUpdatedEvent()` from shared-types for type safety
- `isCourseDataUpdatedEvent()` validates: courseId, updatedFields[], source ('manual'|'realtime'|'polling')
- `getUpdatedFieldsForProposal()` maps Proposal type → affected DB fields for GraphView refresh

### Proposal Types → DB Fields

- `field_updates` + `stage_4` → `['analysis_result']`
- `field_updates` + `stage_5` → `['course_structure']`
- `lesson_patch` → `['course_structure']`
- `direct_action` → `['analysis_result', 'course_structure']` (conservative)

### Testing Patterns (packages/web)

- Use vitest + @testing-library/react
- Mock `next-intl` with `useTranslations: () => (key) => translations[key] || key`
- Mock `Element.prototype.scrollIntoView = vi.fn()` for jsdom
- Run tests: `cd packages/web && pnpm test path/to/test.ts`
- Test files: `__tests__/` directories co-located with source

### Git/Deploy Workflow

- Working branch: `develop` (auto-deploy to dev.ai.megacampus.ru)
- git add specific files > git commit from project root (/home/me/code/mc2)
- `pnpm type-check` verifies all 5 workspace packages
- lint-staged runs eslint + prettier on commit

### Common Gotchas

- `git status --short` from packages/web shows relative paths; always `git add` from project root
- Subagent test-writer creates files in correct location but verify paths before committing
- NEVER trust subagent reports - always read files and run tests yourself
