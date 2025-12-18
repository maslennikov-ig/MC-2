# Research: Admin Pipeline Dashboard

**Phase**: 0 - Research | **Date**: 2025-12-03 | **Spec**: [spec.md](./spec.md)

## Summary

Research findings for implementing the Admin Pipeline Dashboard feature, covering CodeMirror integration, OpenRouter API, versioned configuration patterns, and XML validation.

---

## 1. CodeMirror 6 Integration with React

### Recommendation: `@uiw/react-codemirror`

**Package**: [@uiw/react-codemirror](https://www.npmjs.com/package/@uiw/react-codemirror)
**Version**: 4.x (stable)
**Weekly Downloads**: 700k+

### Why This Package

1. **Official React wrapper** - Well-maintained, actively developed
2. **Full CodeMirror 6 support** - Modern architecture, extensible
3. **Bundled themes** - Dark/light themes included
4. **Extension support** - Easy to add language modes, keymaps

### Implementation

```tsx
import CodeMirror from '@uiw/react-codemirror';
import { xml } from '@codemirror/lang-xml';

function PromptEditor({ value, onChange }: Props) {
  return (
    <CodeMirror
      value={value}
      height="400px"
      extensions={[xml()]} // Pure XML highlighting
      onChange={(value) => onChange(value)}
      theme="dark" // or use @uiw/codemirror-theme-* packages
    />
  );
}
```

### Required Packages

```bash
pnpm add @uiw/react-codemirror @codemirror/lang-xml
```

### Notes

- `@codemirror/lang-xml` provides pure XML highlighting without HTML-specific autocomplete (no `div`, `class`, `style` suggestions)
- Better for custom XML tags in prompts (`<system>`, `<instruction>`, `<context>`)
- Supports read-only mode for version history viewing

---

## 2. OpenRouter API Integration

### Endpoint

```
GET https://openrouter.ai/api/v1/models
```

### Response Schema

```typescript
interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

interface OpenRouterModel {
  id: string;                    // e.g., "openai/gpt-4-turbo"
  name: string;                  // e.g., "GPT-4 Turbo"
  description?: string;
  context_length: number;        // e.g., 128000
  architecture: {
    modality: string;            // "text->text", "text+image->text"
    tokenizer: string;           // "GPT", "Claude", etc.
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;              // Cost per token (string, e.g., "0.00001")
    completion: string;          // Cost per token (string, e.g., "0.00003")
    image?: string;              // Cost per image if multimodal
    request?: string;            // Fixed cost per request
  };
  top_provider: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
```

### Caching Strategy

1. **Cache duration**: 1 hour (as per spec)
2. **Storage**: In-memory Map with TTL (no Redis dependency)
3. **Fallback**: Return cached data with warning when API fails
4. **Refresh**: Manual refresh button + auto-refresh on cache expiry

### Implementation Pattern

```typescript
// packages/course-gen-platform/src/services/openrouter-models.ts

interface CachedModels {
  data: OpenRouterModel[];
  fetchedAt: number;
}

let cache: CachedModels | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getOpenRouterModels(forceRefresh = false): Promise<{
  models: OpenRouterModel[];
  fromCache: boolean;
  cacheAge?: number;
}> {
  const now = Date.now();

  if (!forceRefresh && cache && (now - cache.fetchedAt) < CACHE_TTL) {
    return {
      models: cache.data,
      fromCache: true,
      cacheAge: now - cache.fetchedAt,
    };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    const { data } = await response.json();
    cache = { data, fetchedAt: now };
    return { models: data, fromCache: false };
  } catch (error) {
    if (cache) {
      return {
        models: cache.data,
        fromCache: true,
        cacheAge: now - cache.fetchedAt,
      };
    }
    throw error;
  }
}
```

### Filtering Requirements

Per FR-017, support filtering by:
- **Provider**: Extract from model ID (e.g., "openai/gpt-4" → "openai")
- **Context size range**: Filter by `context_length`
- **Price range**: Filter by `pricing.prompt` (convert string to number)

---

## 3. Versioned Configuration Tables in PostgreSQL

### Chosen Pattern: Version Column with Active Flag

Based on research from [PostgreSQL Wiki](https://wiki.postgresql.org/wiki/Audit_trigger) and [CYBERTEC](https://www.cybertec-postgresql.com/en/row-change-auditing-options-for-postgresql/).

### Pattern

```sql
-- Each row is a version, only one active per config_type+phase_name
CREATE TABLE llm_model_config (
  id uuid PRIMARY KEY,
  config_type text NOT NULL,
  phase_name text NOT NULL,
  -- ... config columns ...
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),

  -- Only one active version per config
  UNIQUE (config_type, phase_name, version)
);

CREATE UNIQUE INDEX idx_active_config
  ON llm_model_config(config_type, phase_name)
  WHERE is_active = true;
```

### Version Update Flow

```typescript
async function updateModelConfig(configId: string, updates: Partial<Config>) {
  // 1. Get current active config
  const current = await db.query(
    `SELECT * FROM llm_model_config WHERE id = $1 AND is_active = true`,
    [configId]
  );

  // 2. Deactivate current version
  await db.query(
    `UPDATE llm_model_config SET is_active = false WHERE id = $1`,
    [configId]
  );

  // 3. Insert new version
  await db.query(
    `INSERT INTO llm_model_config (...) VALUES (...)`,
    { ...current, ...updates, version: current.version + 1, is_active: true }
  );
}
```

### Revert Flow

```typescript
async function revertToVersion(configType: string, phaseName: string, targetVersion: number) {
  // 1. Deactivate current
  await db.query(
    `UPDATE llm_model_config SET is_active = false
     WHERE config_type = $1 AND phase_name = $2 AND is_active = true`,
    [configType, phaseName]
  );

  // 2. Copy target version as new version
  await db.query(
    `INSERT INTO llm_model_config (...)
     SELECT ..., (SELECT MAX(version) + 1 FROM llm_model_config
                  WHERE config_type = $1 AND phase_name = $2), true
     FROM llm_model_config
     WHERE config_type = $1 AND phase_name = $2 AND version = $3`,
    [configType, phaseName, targetVersion]
  );
}
```

### Audit Trail Integration

The project already has `admin_audit_logs` table. All config changes log to this table via superadminProcedure pattern in existing admin router.

---

## 4. XML Syntax Validation

### Recommendation: `fast-xml-parser`

**Package**: [fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser)
**Version**: 4.x (stable)
**Weekly Downloads**: 8M+

### Why This Package

1. **Pure JavaScript** - No native dependencies, works in Node.js and browser
2. **Fast performance** - Handles large files efficiently
3. **Validation mode** - Can validate without full parsing
4. **Active maintenance** - Regular updates, good TypeScript support

### Implementation

```typescript
import { XMLValidator } from 'fast-xml-parser';

export function validatePromptXml(template: string): {
  isValid: boolean;
  error?: { line: number; message: string };
} {
  const result = XMLValidator.validate(template, {
    allowBooleanAttributes: true,
  });

  if (result === true) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: {
      line: result.err.line,
      message: result.err.msg,
    },
  };
}
```

### Required Packages

```bash
pnpm add fast-xml-parser
```

### Browser Alternative

For client-side validation (immediate feedback in editor), can use DOMParser:

```typescript
function validateXmlClient(xml: string): boolean {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  return doc.documentElement.nodeName !== 'parsererror';
}
```

### Validation Strategy

1. **Client-side**: Immediate feedback using DOMParser (no extra bundle)
2. **Server-side**: Full validation using fast-xml-parser before save
3. **Editor integration**: Show validation errors inline in CodeMirror

---

## 5. Admin UI Components (Library-First Approach)

### Data Tables: TanStack Table + shadcn/ui

**Recommendation**: Use existing [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table) component.

The project already has shadcn/ui installed. The Data Table is built on [TanStack Table](https://tanstack.com/table) and provides:
- Sorting, filtering, pagination out of the box
- Column visibility toggles
- Row selection
- Server-side data fetching support

**Usage Pattern**:
```bash
# Already available via shadcn/ui - no extra install needed
# Just use the existing Table component with TanStack Table
```

```tsx
// packages/web/app/admin/pipeline/components/models-config.tsx
import { DataTable } from '@/components/ui/data-table';
import { columns } from './model-columns';

export function ModelsConfig() {
  const { data } = trpc.pipelineAdmin.listModelConfigs.useQuery();
  return <DataTable columns={columns} data={data?.configs ?? []} />;
}
```

### Version Diff Viewer: json-diff-kit

**Package**: [json-diff-kit](https://www.npmjs.com/package/json-diff-kit)
**Why**: TypeScript-native, LCS algorithm for arrays, distinguishes "modification" from "add/remove"

```bash
pnpm add json-diff-kit
```

```tsx
// For showing diff between config versions (FR-12a)
import { Differ, Viewer } from 'json-diff-kit';
import 'json-diff-kit/dist/viewer.css';

const differ = new Differ({
  detectCircular: true,
  maxDepth: Infinity,
  showModifications: true,
  arrayDiffMethod: 'lcs',
});

function VersionDiffDialog({ oldVersion, newVersion }) {
  const diff = differ.diff(oldVersion, newVersion);
  return <Viewer diff={diff} />;
}
```

### Prompt Preview: Template Variable Substitution

For FR-21 (preview with test data), use simple string interpolation:

```typescript
// No library needed - use native template literals
function renderPromptPreview(template: string, testData: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => testData[key] ?? `{{${key}}}`);
}
```

### Existing shadcn/ui Components to Use

| Component | Use Case |
|-----------|----------|
| `Tabs` | Main navigation (Overview/Models/Prompts/Settings) |
| `Card` | Stats cards, stage cards |
| `Dialog` | Edit modals |
| `Form` | Model/prompt edit forms (react-hook-form + zod) |
| `Table` / `DataTable` | Models list, prompts list |
| `Select` | Model picker, stage filter |
| `Slider` | Temperature (0-2) |
| `Input` | Max tokens, search |
| `Textarea` | Prompt preview |
| `Badge` | Status indicators |
| `Toast` | Success/error notifications |
| `AlertDialog` | Confirmation for destructive actions |
| `Skeleton` | Loading states |

---

## 6. Dependencies Summary

### New Dependencies to Add

```json
{
  "dependencies": {
    "@uiw/react-codemirror": "^4.23.0",
    "@codemirror/lang-xml": "^6.1.0",
    "fast-xml-parser": "^4.5.0",
    "json-diff-kit": "^1.0.0",
    "react-diff-viewer-continued": "^4.0.0"
  }
}
```

### Existing Dependencies (No Changes)

- `@supabase/supabase-js` - Already in project
- `trpc` - Already in project
- `zod` - Already in project
- `shadcn/ui` - Already in project

---

## 6. Risk Assessment Updates

| Risk | Research Finding | Mitigation |
|------|------------------|------------|
| CodeMirror bundle size | ~200KB gzipped | Acceptable for admin page, lazy load |
| OpenRouter rate limits | No documented limits for /models | Cache aggressively, manual refresh |
| XML validation edge cases | fast-xml-parser handles most cases | Fallback to hardcoded prompts on error |
| Version history queries | Simple indexed queries | Pagination if needed (unlikely with ~12 configs) |

---

## 8. Gap Analysis: Original Requirements vs Plan

### Items Added to MVP (from "nice-to-have"):

| Item | Original Status | Updated Status | Reason |
|------|-----------------|----------------|--------|
| FR-12a: Diff between versions | Nice-to-have | **MVP** | `json-diff-kit` makes this trivial |
| FR-21: Preview with test data | Nice-to-have | **MVP** | Simple string replace, no library |

### Items Requiring Clarification:

| Item | Issue | Resolution |
|------|-------|------------|
| Stage 2 prompts | ТЗ says stage_2-6, but Stage 2 is document processing (no LLM) | **Confirmed: stage_3-6 only** (Stage 2 uses Docling, not LLM prompts) |
| `platform_version` in export | Missing in export schema | **Add to `configExportSchema`** |
| FR-10: Course-specific override UI | Not detailed in plan | **Add dialog for course selection** |

### Schema Update Needed (configExportSchema):

```typescript
export const configExportSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().datetime(),
  exportedBy: z.string().uuid(),
  platformVersion: z.string(), // ← ADD THIS (from package.json)
  data: z.object({
    modelConfigs: z.array(modelConfigSchema),
    promptTemplates: z.array(promptTemplateSchema),
    globalSettings: globalSettingsSchema,
  }),
});
```

---

## Sources

- [CodeMirror Documentation](https://codemirror.net/docs/)
- [@uiw/react-codemirror](https://uiwjs.github.io/react-codemirror/)
- [OpenRouter API](https://openrouter.ai/docs/api-reference/models-list)
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)
- [PostgreSQL Audit Trigger Wiki](https://wiki.postgresql.org/wiki/Audit_trigger)
- [CYBERTEC Row Change Auditing](https://www.cybertec-postgresql.com/en/row-change-auditing-options-for-postgresql/)
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table)
- [TanStack Table](https://tanstack.com/table)
- [json-diff-kit](https://github.com/RexSkz/json-diff-kit)
