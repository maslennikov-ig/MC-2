# FUTURE-006: Sections → Modules Terminology Refactoring

**Created**: 2025-12-06
**Priority**: Medium
**Complexity**: High (50+ files, database migration)
**Status**: Planned

## Context

Currently the codebase uses `sections` terminology for course structure hierarchy:
- `CourseStructure.sections: Section[]`
- `Section.lessons: Lesson[]`

However, "Module" is the correct pedagogical term for course organization units. The UI already displays "Модуль" (via translations), but the code uses "section" everywhere.

## Current State (Cosmetic Fix Applied)

As of 2025-12-06, a cosmetic fix was applied:
- UI translations show "Модуль" instead of "Секция"
- `useGraphData.ts` maps `sections` → `modules` for Stage 6 graph visualization
- Database and code still use `sections`

## Proposed Changes

### Phase 1: Shared Types (Breaking Change)

**File**: `packages/shared-types/src/generation-result.ts`

```typescript
// Before
export const SectionSchema = z.object({...});
export type Section = z.infer<typeof SectionSchema>;

// After
export const ModuleSchema = z.object({
  module_number: z.number(),  // was: section_number
  module_title: z.string(),   // was: section_title
  module_description: z.string(), // was: section_description
  // ...
});
export type Module = z.infer<typeof ModuleSchema>;

// Backward compatibility (deprecated)
/** @deprecated Use ModuleSchema */
export const SectionSchema = ModuleSchema;
/** @deprecated Use Module */
export type Section = Module;
```

**File**: `packages/shared-types/src/regeneration-types.ts`

```typescript
// Before
'sections[*].section_title',
'sections[*].lessons[*].lesson_title',

// After
'modules[*].module_title',
'modules[*].lessons[*].lesson_title',
```

### Phase 2: Database Migration

**Migration**: `supabase/migrations/YYYYMMDD_rename_sections_to_modules.sql`

```sql
-- Update course_structure JSONB field
UPDATE courses
SET course_structure = jsonb_set(
  course_structure - 'sections',
  '{modules}',
  course_structure->'sections'
)
WHERE course_structure ? 'sections';

-- Update nested field names within each module
UPDATE courses
SET course_structure = (
  SELECT jsonb_set(
    course_structure,
    '{modules}',
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'module_number', m->'section_number',
          'module_title', m->'section_title',
          'module_description', m->'section_description',
          'learning_objectives', m->'learning_objectives',
          'lessons', m->'lessons',
          'estimated_duration_minutes', m->'estimated_duration_minutes'
        )
      )
      FROM jsonb_array_elements(course_structure->'modules') m
    )
  )
)
WHERE course_structure ? 'modules';
```

### Phase 3: Backend Updates

| File | Changes |
|------|---------|
| `course-structure-editor.ts` | `sectionIndex` → `moduleIndex`, path parsing |
| `generation.ts` | Field validation paths |
| Stage 5 prompts | `sections` → `modules` in XML schema |
| All validators | Field name updates |

### Phase 4: Frontend Updates

| Component | Changes |
|-----------|---------|
| `SectionAccordion.tsx` | Rename to `ModuleAccordion.tsx` |
| `CourseStructureView.tsx` | Props, state names |
| `LessonRow.tsx` | `sectionIndex` → `moduleIndex` |
| `useGraphData.ts` | Remove mapping workaround |
| All translations | Already done (shows "Модуль") |

### Phase 5: Cleanup

- Remove deprecated `Section` type aliases
- Update all imports
- Update documentation
- Update tests

## Impact Analysis

### Files to Modify (~50)

```
packages/shared-types/
├── src/generation-result.ts          # Core schema
├── src/regeneration-types.ts         # Editable fields
├── src/index.ts                      # Exports

packages/course-gen-platform/
├── src/stages/stage5-generation/     # All files
├── src/server/routers/generation.ts  # Endpoints
├── src/stages/.../course-structure-editor.ts

packages/web/
├── components/generation-graph/
│   ├── panels/output/SectionAccordion.tsx → ModuleAccordion.tsx
│   ├── panels/output/CourseStructureView.tsx
│   ├── panels/output/LessonRow.tsx
│   ├── hooks/useGraphData.ts
│   └── nodes/ModuleGroup.tsx
├── lib/generation-graph/translations.ts

supabase/migrations/
└── YYYYMMDD_rename_sections_to_modules.sql
```

### Breaking Changes

1. **API Response Structure**: `course_structure.sections` → `course_structure.modules`
2. **Field Paths**: All `sections[*]` paths become `modules[*]`
3. **Type Names**: `Section` → `Module` in TypeScript

### Migration Strategy

1. **Dual Support Period**: Accept both `sections` and `modules` for 2 weeks
2. **Gradual Rollout**: Backend first, then frontend
3. **Feature Flag**: `USE_MODULES_TERMINOLOGY=true`

## Risks

| Risk | Mitigation |
|------|------------|
| Existing courses break | Migration script + dual support |
| Third-party integrations | Versioned API, deprecation notice |
| Developer confusion | Clear commit message, PR description |

## Acceptance Criteria

- [ ] All code uses `Module`/`modules` terminology
- [ ] Database migrated successfully
- [ ] No `section` references in non-deprecated code
- [ ] All tests pass
- [ ] Documentation updated
- [ ] No UI regressions

## Timeline Estimate

- Phase 1 (Types): 2 hours
- Phase 2 (Migration): 1 hour
- Phase 3 (Backend): 4 hours
- Phase 4 (Frontend): 3 hours
- Phase 5 (Cleanup): 2 hours
- Testing: 3 hours

**Total**: ~15 hours (2 developer days)

## References

- Current cosmetic fix: commit after 2025-12-06
- Related: Stage 4/5 schema alignment (SPEC-2025-11-12-001)
