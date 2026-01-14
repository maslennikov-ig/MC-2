# ADR-006: Course Size 'Auto' Option

Date: 2026-01-14
Status: Accepted

## Context

When creating a course, users must select a course size (mini, compact, standard, comprehensive). However:
1. Many users don't know the optimal size for their topic
2. The "correct" size depends on topic complexity and available materials
3. Forcing a choice adds friction to course creation

We needed a way to reduce decision burden while still allowing explicit control when users want it.

## Decision

Add an 'auto' option as the default course size selection where the LLM analyzes the topic and determines the optimal structure without preset constraints.

### Key Design Choices

1. **'auto' as default**: Reduces decision burden for new users
2. **LLM decides without guidance**: When 'auto' is selected, no size_guidance is sent to Stage 4 analysis
3. **Visual differentiation**: 'auto' uses cyan gradient (vs purple for presets) to indicate "AI decides"
4. **Midpoint cost estimate**: For cost preview, 'auto' uses 30 lessons (midpoint between mini=10 and comprehensive=80)
5. **Explicit presets available**: Users can still select mini/compact/standard/comprehensive for explicit control

### Implementation

- **Types**: `CourseSize = 'auto' | 'mini' | 'compact' | 'standard' | 'comprehensive'`
- **Backend**: `getCourseSizePreset('auto')` returns `undefined`, skipping size guidance in prompt
- **Frontend**: 'auto' card displayed prominently at top with helper text explaining behavior
- **Database**: `course_size` column allows 'auto' value

## Consequences

### Positive
- Reduced decision burden for users
- Better course structures (LLM optimizes for topic)
- Simpler onboarding experience
- Still allows explicit control when needed

### Negative
- Less predictable cost estimates (mitigated by midpoint estimate)
- Users have less control over exact size (mitigated by preset options)
- LLM may choose unexpected sizes (acceptable - LLM analyzes topic)

### Neutral
- Requires clear UI feedback when 'auto' is selected
- Backend must handle undefined size gracefully

## Related

- Code review: docs/reports/code-review/2026-01/course-size-auto-review.md
- Types: packages/shared-types/src/course-size.ts
- UI: packages/web/components/forms/create-course/components/CourseSizeSelector.tsx
- Backend: packages/course-gen-platform/src/stages/stage4-analysis/handler.ts
