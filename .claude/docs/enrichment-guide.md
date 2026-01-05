# Enrichment (Activity) Implementation Guide

> Checklist for adding new enrichment types to Stage 7 activities system

## Quick Reference

| Item | Location |
|------|----------|
| Type Definition | `packages/shared-types/src/lesson-enrichment.ts` |
| Content Schema | `packages/shared-types/src/enrichment-content.ts` |
| UI Config | `packages/web/lib/generation-graph/enrichment-config.ts` |
| Translations | `packages/web/messages/{en,ru}/enrichments.json` |
| Handler | `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/` |
| Prompt Service | `packages/course-gen-platform/src/shared/prompts/prompt-service.ts` |
| Prompt Registry | `packages/course-gen-platform/src/shared/prompts/prompt-registry.ts` |
| DB Migration | `packages/course-gen-platform/supabase/migrations/` |
| Phase Names | `packages/shared-types/src/model-config.ts` |
| Admin Pipeline | `packages/web/app/[locale]/admin/pipeline/components/stage-detail-sheet.tsx` |

## Checklist: Adding New Enrichment Type

### 1. Database & Types (Backend)

- [ ] **DB Migration**: Add enum value
  ```sql
  ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'new_type';
  ```

- [ ] **shared-types/lesson-enrichment.ts**:
  - Add to `enrichmentTypeSchema` enum
  - Update `requiresAsset()` if type needs asset
  - Update `getDefaultEnrichmentTitle()` with translations

- [ ] **shared-types/enrichment-content.ts**:
  - Create `newTypeEnrichmentContentSchema` with Zod
  - Add to `enrichmentContentSchema` discriminated union

### 2. Backend Handler

- [ ] **Create handler**: `handlers/new-type-handler.ts`
  - Implement `EnrichmentHandler` interface
  - Use `createPromptService()` for DB-driven prompts (see Section 8)
  - Handle generation logic

- [ ] **Add prompt to database** (if LLM-based):
  - Create migration for `prompt_templates` table
  - Add to `PROMPT_REGISTRY` for fallback (see Section 8)
  - Add to `linkedPrompts` in `PIPELINE_STAGES`

- [ ] **Register handler**: `services/enrichment-router.ts`
  - Import handler
  - Add to `handlers` registry

- [ ] **Export**: `handlers/index.ts`

### 3. Frontend UI (6 locations)

| Component | File | What to Add |
|-----------|------|-------------|
| Node Hover Toolbar | `components/EnrichmentNodeToolbar.tsx` | Button in `TOOLBAR_BUTTONS[]` |
| Empty State Cards | `views/RootView.tsx` → `EmptyState` | `DiscoveryCard` in grid |
| Add Grid | `views/RootView.tsx` → `EnrichmentAddGrid` | Item in `enrichmentTypes[]` |
| Add Popover | `components/EnrichmentAddPopover.tsx` | Option in `ENRICHMENT_OPTIONS[]` |
| Create Form | `views/CreateView.tsx` | Form component + switch case |
| Inspector Panel | `EnrichmentInspectorPanel.tsx` | Add to `SUPPORTED_CREATE_TYPES` |

### 4. Configuration & Types

- [ ] **enrichment-config.ts**:
  ```typescript
  new_type: {
    icon: IconComponent,
    color: 'text-xxx-500 dark:text-xxx-400',
    bgColor: 'bg-xxx-100 dark:bg-xxx-900/30',
    label: 'New Type',
    labelRu: 'Новый тип',
    twoStage: false, // or true if needs draft review
    order: 6,
  }
  ```
  - Add to `ENRICHMENT_TYPES_ORDERED[]`

- [ ] **enrichment-inspector-store.ts**:
  - Add to `CreateEnrichmentType` union

- [ ] **enrichment-actions.ts**:
  - Add to `createEnrichmentSchema` enum
  - Add to `CreateEnrichmentInput` interface

### 5. Translations

- [ ] **messages/en/enrichments.json**:
  ```json
  {
    "types": { "new_type": "New Type" },
    "typeDescriptions": { "new_type": "Description..." }
  }
  ```

- [ ] **messages/ru/enrichments.json**:
  ```json
  {
    "types": { "new_type": "Новый тип" },
    "typeDescriptions": { "new_type": "Описание..." }
  }
  ```

### 6. Viewer (Display in Course Viewer)

- [ ] **EnrichmentsPanel.tsx** (if type needs special display)
- [ ] **Lesson content component** (if hero/special placement)

## File Locations Summary

```
packages/
├── shared-types/src/
│   ├── lesson-enrichment.ts      # Type enum, helpers
│   ├── enrichment-content.ts     # Content Zod schemas
│   └── prompt-template.ts        # PromptStage type (includes 'stage_7')
│
├── course-gen-platform/
│   ├── supabase/migrations/      # DB migrations (incl. prompt_templates)
│   └── src/
│       ├── shared/prompts/
│       │   ├── prompt-service.ts   # createPromptService() - DB + fallback
│       │   └── prompt-registry.ts  # PROMPT_REGISTRY hardcoded fallback
│       └── stages/stage7-enrichments/
│           ├── handlers/           # Generation handlers (use promptService)
│           └── services/
│               └── enrichment-router.ts  # Handler registry
│
└── web/
    ├── messages/{en,ru}/enrichments.json  # Translations
    ├── app/actions/enrichment-actions.ts  # Server actions
    ├── lib/generation-graph/
    │   └── enrichment-config.ts           # UI config (icons, colors)
    └── components/generation-graph/
        ├── stores/enrichment-inspector-store.ts  # Type definitions
        ├── components/EnrichmentNodeToolbar.tsx  # Hover menu
        └── panels/stage7/
            ├── EnrichmentInspectorPanel.tsx      # Inspector router
            ├── views/
            │   ├── RootView.tsx                  # Empty state + add grid
            │   └── CreateView.tsx                # Creation forms
            └── components/
                └── EnrichmentAddPopover.tsx      # Dropdown menu
```

## Two-Stage vs Single-Stage

| Type | twoStage | Description |
|------|----------|-------------|
| `video` | `true` | Draft → Review → Generate |
| `presentation` | `true` | Draft → Review → Generate |
| `audio` | `false` | Direct generation |
| `quiz` | `false` | Direct generation |
| `document` | `false` | Direct generation |
| `cover` | `false` | Direct generation |

## Common Patterns

### Icon Colors (Tailwind)
- Video: `text-red-500`
- Audio: `text-purple-500`
- Presentation: `text-orange-500`
- Quiz: `text-green-500`
- Document: `text-blue-500`
- Cover: `text-cyan-500`

### Form Template (CreateView.tsx)
```typescript
function NewTypeCreateForm({ onSubmit, onCancel, onDirtyChange, isSubmitting }: FormProps) {
  const locale = useLocale();
  // ... state

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ /* settings */ });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Form fields */}
      <div className="flex gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          {locale === 'ru' ? 'Отмена' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {locale === 'ru' ? 'Создать' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
```

### 7. Admin Pipeline Configuration

Configure model/prompt management in admin panel (`/admin/pipeline`).

- [ ] **shared-types/model-config.ts**:
  - Add phase name to `PhaseName` type:
  ```typescript
  | 'stage_7_new_type'
  ```

- [ ] **stage-detail-sheet.tsx**:
  - Add to `ENRICHMENT_ACTIVITIES` constant:
  ```typescript
  { key: 'new_type', label: 'New Type', labelRu: 'Новый тип', icon: IconComponent }
  ```

- [ ] **prompts-editor.tsx**:
  - Stage 7 prompts auto-grouped by `stage_7_` prefix (no changes needed if phase name follows convention)

**Admin Pipeline Files:**
| File | What to Update |
|------|----------------|
| `packages/shared-types/src/model-config.ts` | Add `stage_7_new_type` to PhaseName |
| `packages/web/app/[locale]/admin/pipeline/components/stage-detail-sheet.tsx` | Add to ENRICHMENT_ACTIVITIES array |

**Phase Name Convention:**
- Format: `stage_7_{activity_type}` (e.g., `stage_7_cover`, `stage_7_video`)
- Used for filtering models and prompts in admin UI
- Stored in `llm_model_config.phase_name` and `prompt_templates.prompt_key`

### 8. Prompt Templates (Admin-Editable)

Stage 7 prompts are stored in `prompt_templates` table and editable via admin panel.
Handlers use `createPromptService()` to load prompts from DB with PROMPT_REGISTRY fallback.

**How Handlers Use Prompts:**
```typescript
import { createPromptService } from '@/shared/prompts/prompt-service';

// In handler function:
const promptService = createPromptService();

// Option 1: Render prompt with variables (DB → fallback)
const prompt = await promptService.renderPrompt('stage7_card_course', {
  courseTitle: course.title,
  courseTopic: course.course_description,
  // ... other variables
});

// Option 2: Get raw prompt template (for system prompts)
const result = await promptService.getPrompt('stage7_cover_system');
const systemPrompt = result?.promptTemplate ?? getDefaultFallback();
```

**Existing Stage 7 Prompts:**
| prompt_key | Description |
|------------|-------------|
| `stage7_card_course` | Course catalog thumbnail (1:1 square) |
| `stage7_card_lesson` | Lesson navigation thumbnail (1:1 square) |
| `stage7_cover_system` | Cover generation system prompt (16:9) |
| `stage7_cover_user` | Cover generation user context |

**Adding New Prompts:**

1. **Database migration**:
   ```sql
   INSERT INTO prompt_templates (stage, prompt_key, prompt_name, ...)
   VALUES ('stage_7', 'stage7_new_type', 'Stage 7 - New Type', ...);
   ```

2. **PROMPT_REGISTRY fallback** (`prompt-registry.ts`):
   - Add to `stage7Prompts` array for offline fallback
   - Use same structure as existing Stage 7 prompts

3. **linkedPrompts** (`constants.ts` → `PIPELINE_STAGES`):
   - Add prompt_key to Stage 7's `linkedPrompts` array

4. **Handler code**:
   - Use `promptService.renderPrompt()` or `promptService.getPrompt()`
   - Add inline fallback for edge cases

**Prompt Variables (Mustache syntax):**
- Use `{{variableName}}` placeholders
- Define in `variables` JSONB column
- Example: `[{"name": "courseTitle", "description": "...", "required": true}]`

**Files:**
| File | Purpose |
|------|---------|
| `prompt_templates` table | Database storage (admin-editable) |
| `prompt-registry.ts` | PROMPT_REGISTRY hardcoded fallback |
| `prompt-service.ts` | `createPromptService()` - DB with fallback |
| `constants.ts` → `linkedPrompts` | Admin UI linking |
| `shared-types/prompt-template.ts` | `PromptStage` type definition |

## Verification

After implementation, verify:
1. `pnpm type-check` passes
2. `pnpm build` passes
3. UI shows new type in all 6 locations
4. Creation flow works end-to-end
5. Viewer displays generated content correctly
6. Admin pipeline shows activity tab for new type
