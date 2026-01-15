# ADR-007: Optional Fields Handling Pattern

Date: 2026-01-15
Status: Accepted

## Context

The codebase had inconsistent handling of optional fields, particularly the `style` field in Stage 6 pipeline:

| Location        | Pattern                     |
| --------------- | --------------------------- |
| start.ts        | `course.style ?? undefined` |
| orchestrator.ts | `input.style ?? null`       |
| state.ts        | `default: () => null`       |
| generator.ts    | passed as-is                |

This created confusion about:

1. Where validation/normalization should happen
2. Whether to use `null` or `undefined` for absent values
3. Where to apply default values

## Decision

Adopt a **three-layer pattern** for optional fields:

### Layer 1: Entry Point (Job Creation)

Normalize `undefined` to `null` at the job creation boundary.

```typescript
// start.ts: normalize undefined to null
style: course.style ?? null,
```

### Layer 2: State/Schema (Processing)

Accept `null` in state and schemas. Use `null` as the default.

```typescript
// Zod schema: optional with nullable
style: CourseStyleSchema.optional(),

// LangGraph state: default to null
style: Annotation<CourseStyle | null>({ default: () => null })
```

### Layer 3: Usage Site (Business Logic)

Apply defaults at the point of use, with defensive error handling.

```typescript
// generator-section.ts: apply default at usage
let stylePrompt: string;
try {
  stylePrompt = getStylePrompt(style); // handles null internally
} catch (error) {
  logger.warn({ style, error: error.message }, 'Failed to get style prompt, using default');
  stylePrompt = getStylePrompt(DEFAULT_COURSE_STYLE);
}
```

### Key Principles

1. **Validate early**: Use typed schemas (e.g., `CourseStyleSchema`) at job creation to reject invalid values immediately
2. **Normalize to null**: Prefer `null` over `undefined` for explicit "no value" semantics
3. **Fallback at usage**: Apply defaults at the point of use, not in intermediate layers
4. **Log fallbacks**: Always log when a default is applied for debugging

## Consequences

### Positive

- Clear responsibility boundaries
- Invalid values rejected at entry point
- Consistent `null` semantics throughout pipeline
- Traceable fallback behavior via logs

### Negative

- Requires coordination across layers
- May need migration for existing inconsistent code

### Neutral

- Functions like `getStylePrompt()` must handle `null` gracefully
- Default values defined in single source of truth (`DEFAULT_COURSE_STYLE`)

## Related

- Types: `packages/shared-types/src/style-prompts.ts` (CourseStyleSchema, DEFAULT_COURSE_STYLE)
- Schema: `packages/shared-types/src/bullmq-jobs.ts` (LessonContentJobDataSchema)
- Usage: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-section.ts`
