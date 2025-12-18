# Quickstart: Admin Pipeline Dashboard

**Phase**: 1 - Design | **Date**: 2025-12-03 | **Spec**: [spec.md](./spec.md)

## Overview

Quick reference for implementing the Admin Pipeline Dashboard feature.

---

## Prerequisites

Before starting implementation:

1. **Branch**: `015-admin-pipeline-dashboard`
2. **Dependencies installed**: `@uiw/react-codemirror`, `@codemirror/lang-html`, `fast-xml-parser`
3. **Migrations applied**: `prompt_templates`, `config_backups`, `llm_model_config` extension

---

## File Creation Order

### Phase 1: Database & Types

```
1. packages/course-gen-platform/supabase/migrations/
   └── YYYYMMDDHHMMSS_extend_llm_model_config.sql

2. packages/course-gen-platform/supabase/migrations/
   └── YYYYMMDDHHMMSS_create_prompt_templates.sql

3. packages/course-gen-platform/supabase/migrations/
   └── YYYYMMDDHHMMSS_create_config_backups.sql

4. packages/shared-types/src/
   ├── pipeline-admin.ts
   ├── prompt-template.ts
   └── openrouter-models.ts

5. packages/shared-types/src/index.ts (update exports)
```

### Phase 2: Backend Services

```
6. packages/course-gen-platform/src/services/
   └── openrouter-models.ts

7. packages/course-gen-platform/src/shared/prompts/
   └── prompt-registry.ts

8. packages/course-gen-platform/src/services/
   └── prompt-loader.ts

9. packages/course-gen-platform/src/server/routers/
   └── pipeline-admin.ts

10. packages/course-gen-platform/src/server/routers/index.ts (update)
```

### Phase 3: Frontend Components

```
11. packages/web/app/admin/pipeline/
    └── layout.tsx

12. packages/web/app/admin/pipeline/
    └── page.tsx

13. packages/web/app/admin/pipeline/components/
    ├── pipeline-stats.tsx
    ├── pipeline-overview.tsx
    ├── models-config.tsx
    ├── model-editor-dialog.tsx
    ├── model-selector.tsx
    ├── prompts-editor.tsx
    ├── prompt-editor-dialog.tsx
    ├── settings-panel.tsx
    └── export-import.tsx
```

---

## Key Implementation Patterns

### 1. Versioned Config Update

```typescript
// packages/course-gen-platform/src/server/routers/pipeline-admin.ts

async function createNewVersion<T extends { id: string; version: number }>(
  ctx: Context,
  tableName: string,
  currentId: string,
  updates: Partial<T>
): Promise<T> {
  const { data: current } = await ctx.supabase
    .from(tableName)
    .select('*')
    .eq('id', currentId)
    .eq('is_active', true)
    .single();

  // Deactivate current
  await ctx.supabase
    .from(tableName)
    .update({ is_active: false })
    .eq('id', currentId);

  // Insert new version
  const { data: newVersion } = await ctx.supabase
    .from(tableName)
    .insert({
      ...current,
      ...updates,
      id: undefined, // Generate new UUID
      version: current.version + 1,
      is_active: true,
      created_by: ctx.user.id,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  return newVersion;
}
```

### 2. OpenRouter Cache Service

```typescript
// packages/course-gen-platform/src/services/openrouter-models.ts

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
let cache: { data: OpenRouterModel[]; fetchedAt: number } | null = null;

export async function getOpenRouterModels(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && cache && now - cache.fetchedAt < CACHE_TTL) {
    return { models: cache.data, fromCache: true, cacheAge: now - cache.fetchedAt };
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    const { data } = await res.json();

    // Transform and cache
    const models = data.map(transformOpenRouterModel);
    cache = { data: models, fetchedAt: now };

    return { models, fromCache: false };
  } catch (error) {
    if (cache) {
      return { models: cache.data, fromCache: true, cacheAge: now - cache.fetchedAt };
    }
    throw error;
  }
}
```

### 3. Prompt Fallback Pattern

```typescript
// packages/course-gen-platform/src/services/prompt-loader.ts

import { HARDCODED_PROMPTS } from '../shared/prompts/prompt-registry';

export async function loadPrompt(
  supabase: SupabaseClient,
  stage: PromptStage,
  promptKey: string,
  featureFlags: { useDatabasePrompts: boolean }
): Promise<string> {
  // Check feature flag
  if (!featureFlags.useDatabasePrompts) {
    return HARDCODED_PROMPTS[stage][promptKey];
  }

  // Try database
  const { data, error } = await supabase
    .from('prompt_templates')
    .select('prompt_template')
    .eq('stage', stage)
    .eq('prompt_key', promptKey)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.warn(`Falling back to hardcoded prompt: ${stage}/${promptKey}`);
    return HARDCODED_PROMPTS[stage][promptKey];
  }

  return data.prompt_template;
}
```

### 4. CodeMirror Prompt Editor

```tsx
// packages/web/app/admin/pipeline/components/prompt-editor-dialog.tsx

'use client';

import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { useState, useCallback } from 'react';

interface PromptEditorDialogProps {
  prompt: PromptTemplate;
  onSave: (template: string) => Promise<void>;
  onClose: () => void;
}

export function PromptEditorDialog({ prompt, onSave, onClose }: PromptEditorDialogProps) {
  const [value, setValue] = useState(prompt.promptTemplate);
  const [error, setError] = useState<string | null>(null);

  const validateXml = useCallback((xml: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const parseError = doc.querySelector('parsererror');
    return parseError ? parseError.textContent : null;
  }, []);

  const handleChange = useCallback((val: string) => {
    setValue(val);
    setError(validateXml(val));
  }, [validateXml]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{prompt.promptName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <CodeMirror
              value={value}
              height="400px"
              extensions={[html()]}
              onChange={handleChange}
              theme="dark"
            />
            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Variables</h4>
            {prompt.variables.map((v) => (
              <div key={v.name} className="text-sm">
                <code>{`{{${v.name}}}`}</code>
                <p className="text-muted-foreground">{v.description}</p>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(value)} disabled={!!error}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 5. Audit Logging

```typescript
// Use existing pattern from admin.ts

async function logAuditEvent(
  ctx: Context,
  action: string,
  entityType: string,
  entityId: string,
  changes: { before: unknown; after: unknown }
) {
  await ctx.supabase.from('admin_audit_logs').insert({
    action,
    entity_type: entityType,
    entity_id: entityId,
    changes,
    user_id: ctx.user.id,
    created_at: new Date().toISOString(),
  });
}
```

---

## Testing Checklist

### Unit Tests (Vitest)

- [ ] `openrouter-models.ts`: Cache TTL, fallback behavior
- [ ] `prompt-loader.ts`: Database load, fallback to hardcoded
- [ ] Type validation with Zod schemas

### Integration Tests

- [ ] tRPC router procedures with superadmin context
- [ ] Version creation on update
- [ ] Revert to previous version
- [ ] Export/import round-trip

### E2E Tests (Playwright)

- [ ] Navigate to `/admin/pipeline` as superadmin
- [ ] Edit model configuration
- [ ] Edit prompt template
- [ ] Export and import configuration

---

## Common Issues

### 1. "Cannot find module '@megacampus/shared-types'"

Ensure `packages/shared-types/src/index.ts` exports the new types:

```typescript
export * from './pipeline-admin';
export * from './prompt-template';
export * from './openrouter-models';
```

### 2. "RLS policy violation"

Check user has `role = 'superadmin'` in the `users` table.

### 3. "OpenRouter API error"

The service should return cached data. Check:
- API key in environment (if required)
- Network connectivity
- Cache state in service

### 4. "XML validation fails"

Ensure prompt uses valid XML. Common issues:
- Unclosed tags
- Invalid attribute values
- Unescaped `<` or `&` characters

---

## Related Documents

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Research](./research.md)
- [Data Model](./data-model.md)
- [tRPC Contract](./contracts/pipeline-admin-router.md)
