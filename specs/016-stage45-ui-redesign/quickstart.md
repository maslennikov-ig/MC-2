# Quickstart: Stage 4-5 UI Redesign

**Date**: 2025-12-05
**Branch**: `016-stage45-ui-redesign`

## Prerequisites

1. Node.js 20+
2. pnpm 8+
3. Running Supabase instance
4. Environment variables configured

## Setup

### 1. Install new dependency

```bash
pnpm add @tanstack/react-virtual -F @megacampus/web
```

### 2. Create new type files

```bash
# Create regeneration types
touch packages/shared-types/src/regeneration-types.ts
touch packages/shared-types/src/dependency-graph.ts

# Create phase names
touch packages/web/lib/generation-graph/phase-names.ts

# Create output components directory
mkdir -p packages/web/components/generation-graph/panels/output

# Create regeneration service directory
mkdir -p packages/course-gen-platform/src/shared/regeneration
```

### 3. Export new types from shared-types

Add to `packages/shared-types/src/index.ts`:

```typescript
export * from './regeneration-types';
export * from './dependency-graph';
```

## Development Workflow

### Running the app

```bash
# Start backend
pnpm --filter @megacampus/course-gen-platform dev

# Start frontend
pnpm --filter @megacampus/web dev
```

### Type checking

```bash
pnpm type-check
```

### Testing

```bash
# Unit tests
pnpm --filter @megacampus/web test

# Integration tests
pnpm --filter @megacampus/course-gen-platform test:integration
```

## Key Files to Modify

### Frontend

| File | Changes |
|------|---------|
| `packages/web/components/generation-graph/panels/OutputTab.tsx` | Replace JsonViewer with AnalysisResultView/CourseStructureView |
| `packages/web/components/generation-graph/panels/AttemptSelector.tsx` | Rename to PhaseSelector, use PHASE_NAMES |
| `packages/web/components/generation-graph/GraphView.tsx` | Add auto-open logic for Stage 4/5 |

### Backend

| File | Changes |
|------|---------|
| `packages/course-gen-platform/src/server/routers/generation.ts` | Add updateField, regenerateBlock, getBlockDependencies, cascadeUpdate |

### New Components

| Component | Purpose |
|-----------|---------|
| `AnalysisResultView.tsx` | Human-readable Stage 4 output |
| `CourseStructureView.tsx` | Human-readable Stage 5 output |
| `EditableField.tsx` | Inline editing with autosave |
| `EditableChips.tsx` | Add/remove list items |
| `InlineRegenerateChat.tsx` | Mini-chat for block regeneration |
| `SemanticDiff.tsx` | Show conceptual changes |
| `StaleDataIndicator.tsx` | Yellow/red dependency status |
| `ImpactAnalysisModal.tsx` | Cascade change warning |

## Testing New Features

### Manual Testing

1. **Phase names**: Open any Stage 4/5 node, verify phases show semantic names
2. **Editable fields**: Click on a field, verify inline editing works
3. **Autosave**: Edit a field, verify "Saving..." → "Saved" appears
4. **Regeneration**: Click regenerate button, verify mini-chat opens
5. **Auto-open**: Complete Stage 4, verify panel opens automatically

### Automated Tests

```bash
# Test new components
pnpm --filter @megacampus/web test -- EditableField
pnpm --filter @megacampus/web test -- AnalysisResultView

# Test API endpoints
pnpm --filter @megacampus/course-gen-platform test -- generation.updateField
```

## Troubleshooting

### "Field not saving"

1. Check browser console for errors
2. Verify course ownership (must be owner)
3. Check network tab for API response

### "Regeneration fails"

1. Check token balance (if implemented)
2. Verify context tier detection
3. Check LLM response format

### "Stale indicators not showing"

1. Verify dependency graph is built
2. Check lastModified timestamps
3. Ensure parent-child relationships are correct
