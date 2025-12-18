# Tasks: Admin Pipeline Dashboard

**Input**: Design documents from `/specs/015-admin-pipeline-dashboard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested in specification - omitting test tasks

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **packages/web/**: Next.js frontend
- **packages/course-gen-platform/**: tRPC backend
- **packages/shared-types/**: Shared TypeScript types

---

## Library Decisions

Based on research from `/specs/015-admin-pipeline-dashboard/research.md` and `/docs/research/UX Patterns for Workflow Data Editing.md`:

| Component | Library | Status | Rationale |
|-----------|---------|--------|-----------|
| **Code Editor** | `@uiw/react-codemirror` + `@codemirror/lang-xml` | ✅ Confirmed | Pure XML syntax highlighting (no HTML autocomplete noise), 10K+ chars performance |
| **XML Validation** | `fast-xml-parser` | ✅ Confirmed | Server-side validation, 8M+ weekly downloads |
| **JSON Diff** | `json-diff-kit` | ✅ Confirmed | Model config version diff, LCS algorithm |
| **Text Diff** | `react-diff-viewer-continued` | ✅ Confirmed | Prompt template version diff, dark theme support |
| **Data Tables** | shadcn/ui DataTable (@tanstack/react-table) | ✅ Already in project | No extra install |
| **Pipeline Visualization** | Custom component (shadcn/ui Card + flexbox) | ✅ Decided | Simple linear flow, no need for @xyflow/react |
| **Forms** | shadcn/ui Form (react-hook-form + zod) | ✅ Already in project | No extra install |

**UX Patterns Applied** (from `/docs/research/UX Patterns for Workflow Data Editing.md`):
- Inspector pattern for complex config editing (Sidebar/Dialog)
- Optimistic updates for immediate feedback
- Confirmation dialogs for destructive actions
- Toast notifications for success/error states
- Skeleton loaders for loading states

---

## Phase 0: Planning

**Purpose**: Analyze tasks, identify required agents, resolve research

- [x] P001 Analyze tasks and identify required agent types for implementation
- [x] P002 ~~Create required agents via meta-agent-v3~~ (SKIPPED - all required agents exist)
- [x] P003 Assign executors to all tasks (see annotations below)
- [x] P004 ~~Resolve any remaining research questions~~ (COMPLETED - see Library Decisions above)

### Executor Assignments

| Task Range | Executor | Rationale |
|------------|----------|-----------|
| T001-T003 | MAIN | Trivial npm install commands |
| T004-T007 | database-architect | SQL migrations, RLS, indexes |
| T008-T012 | typescript-types-specialist | TypeScript interfaces, Zod schemas |
| T013 | MAIN | Trivial MCP command |
| T014-T019 | fullstack-nextjs-specialist | Backend services + frontend layout |
| T020-T060 | fullstack-nextjs-specialist | tRPC + React components |
| T061-T070 | MAIN / fullstack-nextjs-specialist | Integration + polish |

---

## Phase 1: Setup

**Purpose**: Install dependencies and configure project structure

- [x] T001 [P] Install CodeMirror packages in packages/web: `@uiw/react-codemirror @codemirror/lang-xml`
  → Artifacts: [@codemirror/lang-xml@6.1.0](packages/web/package.json), [@uiw/react-codemirror@4.25.3](packages/web/package.json)
- [x] T002 [P] Install `fast-xml-parser` in packages/course-gen-platform
  → Artifacts: [fast-xml-parser@5.3.2](packages/course-gen-platform/package.json)
- [x] T003 [P] Install diff viewer packages in packages/web: `json-diff-kit react-diff-viewer-continued`
  → Artifacts: [json-diff-kit@1.0.34](packages/web/package.json), [react-diff-viewer-continued@3.4.0](packages/web/package.json)
  → Note: Peer dependency warning for React 19 (expected, works correctly)

---

## Phase 2: Foundational (Database & Types)

**Purpose**: Database migrations and shared types that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

### Database Migrations (Sequential)

- [x] T004 Create migration to extend llm_model_config with versioning columns (version, is_active, created_by) + update phase_name constraint in packages/course-gen-platform/supabase/migrations/
  → Artifacts: [20251203140000_extend_llm_model_config_versioning.sql](../../packages/course-gen-platform/supabase/migrations/20251203140000_extend_llm_model_config_versioning.sql)
- [x] T005 Create migration for prompt_templates table with versioning in packages/course-gen-platform/supabase/migrations/
  → Artifacts: [20251203140100_create_prompt_templates.sql](../../packages/course-gen-platform/supabase/migrations/20251203140100_create_prompt_templates.sql)
- [x] T006 Create migration for config_backups table in packages/course-gen-platform/supabase/migrations/
  → Artifacts: [20251203140200_create_config_backups.sql](../../packages/course-gen-platform/supabase/migrations/20251203140200_create_config_backups.sql)
- [x] T007 Create migration for pipeline_global_settings table (RAG budget, quality threshold, feature flags) in packages/course-gen-platform/supabase/migrations/
  → Artifacts: [20251203140300_create_pipeline_global_settings.sql](../../packages/course-gen-platform/supabase/migrations/20251203140300_create_pipeline_global_settings.sql)

### Shared Types (Parallel)

- [x] T008 [P] Create pipeline-admin types in packages/shared-types/src/pipeline-admin.ts:
  - PhaseName enum (all 12+ phases from spec)
  - PipelineStage interface
  - PipelineStats interface
  - ModelConfigWithHistory interface
  - GlobalSettings interface (RAG budget, quality threshold, retry attempts, timeout, feature flags)
  - ConfigExport/ConfigBackup interfaces
  → Artifacts: [pipeline-admin.ts](../../packages/shared-types/src/pipeline-admin.ts)
- [x] T009 [P] Create prompt-template types in packages/shared-types/src/prompt-template.ts:
  - PromptStage enum (stage_3, stage_4, stage_5, stage_6)
  - PromptVariable interface
  - PromptTemplateWithHistory interface
  - PromptsByStage grouped type
  → Artifacts: [prompt-template.ts](../../packages/shared-types/src/prompt-template.ts)
- [x] T010 [P] Create openrouter-models types in packages/shared-types/src/openrouter-models.ts:
  - OpenRouterModel interface (from research.md spec)
  - OpenRouterModelsResponse interface
  - ModelFilter interface (provider, context_size, price range)
  → Artifacts: [openrouter-models.ts](../../packages/shared-types/src/openrouter-models.ts)
- [x] T011 [P] Create Zod validation schemas in packages/shared-types/src/pipeline-admin-schemas.ts:
  - modelConfigUpdateSchema
  - promptTemplateUpdateSchema
  - globalSettingsSchema
  - configExportSchema (with platformVersion field)
  - configImportSchema
  → Artifacts: [pipeline-admin-schemas.ts](../../packages/shared-types/src/pipeline-admin-schemas.ts)
- [x] T012 Update exports in packages/shared-types/src/index.ts to include new type files
  → Artifacts: [index.ts](../../packages/shared-types/src/index.ts)
- [x] T013 Regenerate database types via mcp__supabase__generate_typescript_types and update packages/shared-types/src/database.types.ts
  → Artifacts: [database.types.ts](../../packages/shared-types/src/database.types.ts)

### Backend Services (Shared)

- [x] T014 Create OpenRouter models service with 1-hour in-memory caching in packages/course-gen-platform/src/services/openrouter-models.ts (pattern from research.md)
  → Artifacts: [openrouter-models.ts](../../packages/course-gen-platform/src/services/openrouter-models.ts)
- [x] T015 Create hardcoded prompt registry (18 prompts) in packages/course-gen-platform/src/shared/prompts/prompt-registry.ts - extract from existing stage files
  → Artifacts: [prompt-registry.ts](../../packages/course-gen-platform/src/shared/prompts/prompt-registry.ts)
- [x] T016 Create prompt loader service with DB-first + fallback logic in packages/course-gen-platform/src/services/prompt-loader.ts
  → Artifacts: [prompt-loader.ts](../../packages/course-gen-platform/src/services/prompt-loader.ts)
- [x] T017 Create audit logging utility for pipeline-admin mutations in packages/course-gen-platform/src/services/pipeline-audit.ts (uses existing admin_audit_logs table)
  → Artifacts: [pipeline-audit.ts](../../packages/course-gen-platform/src/services/pipeline-audit.ts)

### Frontend Layout

- [x] T018 Create superadmin-protected layout in packages/web/app/admin/pipeline/layout.tsx (check role === 'superadmin', redirect on failure)
  → Artifacts: [layout.tsx](../../packages/web/app/admin/pipeline/layout.tsx)
- [x] T019 Create main page with tabs structure (Overview, Models, Prompts, Settings) in packages/web/app/admin/pipeline/page.tsx
  → Artifacts: [page.tsx](../../packages/web/app/admin/pipeline/page.tsx)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - View Pipeline Overview (Priority: P1)

**Goal**: Superadmins can see a visual overview of all 6 pipeline stages with statistics

**FR Coverage**: FR-4, FR-5, FR-6

**Independent Test**: Log in as superadmin, navigate to /admin/pipeline, verify all 6 stages displayed with stats

### Backend for US1

- [x] T020 [US1] Implement getStagesInfo procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts:
  - Static stage definitions (name, description, handler file path)
  - Linked models (from llm_model_config)
  - Linked prompts (from prompt_templates)
  - Aggregated stats from generation_trace (avg time, avg cost per stage)
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T021 [US1] Implement getPipelineStats procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts:
  - Total generations (period filter)
  - Success/failure rate
  - Total cost
  - Average full pipeline time
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)

### Frontend for US1

- [x] T022 [P] [US1] Create PipelineStats component (4 stat cards with skeleton loaders) in packages/web/app/admin/pipeline/components/pipeline-stats.tsx
  → Artifacts: [pipeline-stats.tsx](../../packages/web/app/admin/pipeline/components/pipeline-stats.tsx)
- [x] T023 [P] [US1] Create PipelineOverview component (6 stage cards in horizontal flow with CSS flexbox) in packages/web/app/admin/pipeline/components/pipeline-overview.tsx:
  - Card per stage with number, name, description
  - Status badge (active/inactive)
  - Links to Models/Prompts tabs with stage filter
  - Avg time and cost display
  → Artifacts: [pipeline-overview.tsx](../../packages/web/app/admin/pipeline/components/pipeline-overview.tsx)
- [x] T024 [US1] Wire Overview tab in page.tsx to display PipelineStats and PipelineOverview components
  → Artifacts: [page.tsx](../../packages/web/app/admin/pipeline/page.tsx)

**Checkpoint**: User Story 1 complete - superadmins can view pipeline overview and statistics

---

## Phase 4: User Story 2 - Configure LLM Models (Priority: P1)

**Goal**: Superadmins can view and edit LLM model configurations with versioning

**FR Coverage**: FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-12a, FR-12b, FR-13, FR-14, FR-15

**Independent Test**: View Models tab, edit a model config, verify new version created and change logged in audit

### Backend for US2

- [x] T025 [US2] Implement listModelConfigs procedure (active configs with version info) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T026 [US2] Implement updateModelConfig procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts:
  - Validate model_id exists in OpenRouter (FR-12)
  - Create new version (deactivate old, insert new with is_active=true)
  - Support course_id for course-specific override (FR-10)
  - Log to admin_audit_logs
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T027 [US2] Implement getModelConfigHistory procedure (all versions for a phase) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T028 [US2] Implement revertModelConfigToVersion procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T029 [US2] Implement resetModelConfigToDefault procedure (restore hardcoded defaults) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T030 [US2] Implement listOpenRouterModels procedure (cached, with filtering by provider/context/price) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T031 [US2] Implement refreshOpenRouterModels procedure (force cache refresh) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)

### Frontend for US2

- [x] T032 [P] [US2] Create ModelsConfig component (DataTable with columns: phase, model, fallback, temp, tokens, version, actions) in packages/web/app/admin/pipeline/components/models-config.tsx:
  - Skeleton loader during fetch
  - Row click opens editor dialog
  → Artifacts: [models-config.tsx](../../packages/web/app/admin/pipeline/components/models-config.tsx)
- [x] T033 [P] [US2] Create ModelSelector component (searchable combobox with OpenRouter models) in packages/web/app/admin/pipeline/components/model-selector.tsx:
  - Provider filter
  - Context size filter (min/max)
  - Price range filter
  - Display: name, provider, context, pricing
  → Artifacts: [model-selector.tsx](../../packages/web/app/admin/pipeline/components/model-selector.tsx)
- [x] T034 [US2] Create ModelEditorDialog component in packages/web/app/admin/pipeline/components/model-editor-dialog.tsx:
  - Form with react-hook-form + zod validation
  - ModelSelector for primary model
  - ModelSelector for fallback model
  - Temperature slider (0-2)
  - Max tokens input with validation
  - Optional course selector for override (FR-10)
  - Save/Cancel buttons with confirmation
  - Toast on success/error
  → Artifacts: [model-editor-dialog.tsx](../../packages/web/app/admin/pipeline/components/model-editor-dialog.tsx)
- [x] T035 [US2] Create ConfigHistoryDialog component in packages/web/app/admin/pipeline/components/config-history-dialog.tsx:
  - Version list with dates and authors
  - DiffViewer component for comparing versions (json-diff-kit)
  - Revert to version button with confirmation
  → Artifacts: [config-history-dialog.tsx](../../packages/web/app/admin/pipeline/components/config-history-dialog.tsx)
- [x] T036 [US2] Create DiffViewer component (wrapper around json-diff-kit) in packages/web/app/admin/pipeline/components/diff-viewer.tsx
  → Artifacts: [diff-viewer.tsx](../../packages/web/app/admin/pipeline/components/diff-viewer.tsx)
- [x] T037 [US2] Wire Models tab in page.tsx to display ModelsConfig with edit/history functionality
  → Artifacts: [page.tsx](../../packages/web/app/admin/pipeline/page.tsx)

**Checkpoint**: User Stories 1 & 2 complete - Pipeline overview and model configuration

---

## Phase 5: User Story 3 - Edit Prompt Templates (Priority: P2)

**Goal**: Superadmins can view and edit prompt templates with CodeMirror editor and versioning

**FR Coverage**: FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-22, FR-23

**Independent Test**: View Prompts tab grouped by stage, edit a prompt, verify version created

### Backend for US3

- [x] T038 [US3] Implement listPromptTemplates procedure (grouped by stage, active only) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T039 [US3] Implement getPromptTemplate procedure (single prompt with variables) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T040 [US3] Implement updatePromptTemplate procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts:
  - Validate XML structure with fast-xml-parser
  - Create new version (versioning pattern)
  - Log to admin_audit_logs
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T041 [US3] Implement getPromptHistory procedure (all versions for a prompt) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T042 [US3] Implement revertPromptToVersion procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)

### Frontend for US3

- [x] T043 [P] [US3] Create PromptsEditor component (accordion grouped by stage) in packages/web/app/admin/pipeline/components/prompts-editor.tsx:
  - Expandable stage sections
  - List of prompts per stage with name, version, last updated
  - Click opens editor dialog
  → Artifacts: [prompts-editor.tsx](../../packages/web/app/admin/pipeline/components/prompts-editor.tsx)
- [x] T044 [US3] Create PromptEditorDialog component in packages/web/app/admin/pipeline/components/prompt-editor-dialog.tsx:
  - CodeMirror editor with XML/HTML highlighting (@uiw/react-codemirror)
  - Variables panel (right side) showing available {{variables}}
  - Preview tab with test data substitution (simple string replace pattern from research.md)
  - XML validation feedback (client-side DOMParser for instant feedback)
  - Save/Cancel with confirmation
  - Toast on success/error
  → Artifacts: [prompt-editor-dialog.tsx](../../packages/web/app/admin/pipeline/components/prompt-editor-dialog.tsx)
- [x] T045 [US3] Create PromptHistoryDialog component in packages/web/app/admin/pipeline/components/prompt-history-dialog.tsx:
  - Version list with dates and authors
  - TextDiffViewer component (react-diff-viewer-continued)
  - Revert button with confirmation
  → Artifacts: [prompt-history-dialog.tsx](../../packages/web/app/admin/pipeline/components/prompt-history-dialog.tsx)
- [x] T046 [US3] Create TextDiffViewer component (wrapper around react-diff-viewer-continued) in packages/web/app/admin/pipeline/components/text-diff-viewer.tsx
  → Artifacts: [text-diff-viewer.tsx](../../packages/web/app/admin/pipeline/components/text-diff-viewer.tsx)
- [x] T047 [US3] Wire Prompts tab in page.tsx to display PromptsEditor with edit/history functionality
  → Artifacts: [page.tsx](../../packages/web/app/admin/pipeline/page.tsx)

**Checkpoint**: User Stories 1-3 complete - Core functionality with prompt editing

---

## Phase 6: User Story 4 - Manage Global Pipeline Settings (Priority: P2)

**Goal**: Superadmins can configure global settings and feature flags

**FR Coverage**: FR-24, FR-25

**Independent Test**: View Settings tab, modify RAG token budget and feature flags, verify changes persist

### Backend for US4

- [x] T048 [US4] Implement getGlobalSettings procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T049 [US4] Implement updateGlobalSettings procedure (partial update, validation, audit log) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)

### Frontend for US4

- [x] T050 [US4] Create SettingsPanel component in packages/web/app/admin/pipeline/components/settings-panel.tsx:
  - RAG token budget input (default: 20000)
  - Quality threshold slider (0-1)
  - Retry attempts per phase input
  - Timeout per phase input (ms)
  - Feature flags section:
    - use_database_prompts toggle
    - enable_quality_validation toggle
    - enable_cost_tracking toggle
  - Save button with optimistic update
  - Toast on success/error
  → Artifacts: [settings-panel.tsx](../../packages/web/app/admin/pipeline/components/settings-panel.tsx)
- [x] T051 [US4] Wire Settings tab in page.tsx to display SettingsPanel
  → Artifacts: [page.tsx](../../packages/web/app/admin/pipeline/page.tsx)

**Checkpoint**: User Stories 1-4 complete - Full configuration capability

---

## Phase 7: User Story 5 - Export/Import Configuration (Priority: P3)

**Goal**: Superadmins can export and import pipeline configurations with backup capability

**FR Coverage**: FR-26, FR-27, FR-28, FR-29

**Independent Test**: Export config to JSON, import it back, verify backup created and config restored

### Backend for US5

- [x] T052 [US5] Implement exportConfiguration procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts:
  - Include all active model configs
  - Include all active prompt templates
  - Include global settings
  - Add export metadata (version, date, user, platformVersion from package.json)
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T053 [US5] Implement validateImport procedure (schema validation, preview changes) in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T054 [US5] Implement importConfiguration procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts:
  - Auto-create backup before import (createBackup: true)
  - Selective import (importModels, importPrompts, importSettings flags)
  - Audit log for import action
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T055 [US5] Implement listBackups procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)
- [x] T056 [US5] Implement restoreFromBackup procedure in packages/course-gen-platform/src/server/routers/pipeline-admin.ts
  → Artifacts: [pipeline-admin.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin.ts)

### Frontend for US5

- [x] T057 [US5] Create ExportImportPanel component in packages/web/app/admin/pipeline/components/export-import.tsx:
  - Export button (downloads JSON file)
  - Import section:
    - File upload (JSON)
    - Validation result display
    - Preview of changes
    - Checkboxes: Import Models / Import Prompts / Import Settings
    - Create Backup checkbox (default: true)
    - Import button with confirmation dialog
  - Backup list with restore buttons
  - Toast notifications
  → Artifacts: [export-import.tsx](../../packages/web/app/admin/pipeline/components/export-import.tsx)
- [x] T058 [US5] Add ExportImportPanel to Settings tab in page.tsx
  → Artifacts: [page.tsx](../../packages/web/app/admin/pipeline/page.tsx)

**Checkpoint**: User Stories 1-5 complete - Backup and recovery capability

---

## Phase 8: User Story 6 - Browse OpenRouter Models (Priority: P3)

**Goal**: Superadmins can browse available OpenRouter models with detailed information and filters

**FR Coverage**: FR-13, FR-14, FR-15 (enhanced)

**Independent Test**: View model browser, apply filters, verify cached data shown when API unavailable

### Frontend for US6

- [x] T059 [US6] Create ModelBrowser component in packages/web/app/admin/pipeline/components/model-browser.tsx:
  - Full DataTable with all OpenRouter models
  - Columns: ID, Name, Provider, Context, Pricing (input/output), Features
  - Filters: Provider, Context range, Price range, Text search
  - Sorting by any column
  - Cache status indicator (fresh/stale + age)
  - Refresh button
  - "Use this model" action that opens ModelEditorDialog
  → Artifacts: [model-browser.tsx](../../packages/web/app/admin/pipeline/components/model-browser.tsx)
- [x] T060 [US6] Add ModelBrowser to Models tab as expandable section or Dialog in page.tsx
  → Artifacts: [page.tsx](../../packages/web/app/admin/pipeline/page.tsx)

**Checkpoint**: All user stories complete - full feature set

---

## Phase 9: Router Integration & Polish

**Purpose**: Final integration, seeding, and cross-cutting improvements

### Integration

- [x] T061 Register pipelineAdminRouter in main router in packages/course-gen-platform/src/server/app-router.ts
  → Artifacts: [app-router.ts](../../packages/course-gen-platform/src/server/app-router.ts) (already done)
- [ ] T062 Create seed script for prompt_templates (18 prompts from hardcoded registry) in packages/course-gen-platform/scripts/seed-prompts.ts
  → Note: Not critical for MVP - prompts can be added via UI or migration
- [ ] T063 Create seed script for initial global_settings with default values
  → Note: Not critical - defaults handled by migration INSERT

### UX Polish

- [x] T064 Add skeleton loaders to all data-fetching components (PipelineStats, ModelsConfig, PromptsEditor)
  → Artifacts: All components already include Skeleton loaders
- [x] T065 Add confirmation dialogs (AlertDialog) for all destructive actions:
  - Reset to default
  - Revert to version
  - Import configuration
  - Restore from backup
  → Artifacts: [models-config.tsx](../../packages/web/app/admin/pipeline/components/models-config.tsx), [config-history-dialog.tsx](../../packages/web/app/admin/pipeline/components/config-history-dialog.tsx), [prompt-history-dialog.tsx](../../packages/web/app/admin/pipeline/components/prompt-history-dialog.tsx), [export-import.tsx](../../packages/web/app/admin/pipeline/components/export-import.tsx)
- [ ] T066 Add error boundaries with graceful degradation for OpenRouter API failures (show cached data with warning)
  → Note: Deferred to future iteration - current fallback shows error toast
- [ ] T070 Verify responsive design for tablet viewports (≥768px) in all pipeline admin components (NFR-9)
  → Note: Deferred - can test during QA phase

### Quality Gates

- [x] T067 Run type-check across all packages to verify no TypeScript errors
  → Result: All 4 packages pass type-check
- [x] T068 Run build to verify no compilation errors
  → Result: Build successful for all packages
- [ ] T069 Manual validation: test all user stories as superadmin
  → Note: User task - requires deployed environment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0 (Planning)**: First - identify agents before starting
- **Phase 1 (Setup)**: Dependencies install - no blockers
- **Phase 2 (Foundational)**: BLOCKS all user stories - must complete first
- **Phases 3-8 (User Stories)**: All depend on Phase 2 completion
- **Phase 9 (Polish)**: After all desired user stories

### User Story Dependencies

- **US1 (P1)**: After Phase 2 - Overview and stats
- **US2 (P1)**: After Phase 2 - Model configuration (uses OpenRouter service)
- **US3 (P2)**: After Phase 2 - Prompt editing (uses prompt-loader)
- **US4 (P2)**: After Phase 2 - Global settings
- **US5 (P3)**: After Phase 2 - Export/import (uses all entity types)
- **US6 (P3)**: After Phase 2 - Model browser (uses OpenRouter service)

### Parallel Opportunities

**Phase 1** (all in parallel):
- T001, T002, T003

**Phase 2 - Types** (all in parallel):
- T008, T009, T010, T011

**Phase 3-4 - Frontend** (parallel within story):
- T022, T023 (US1)
- T032, T033 (US2)

**Cross-Story Parallelism** (different stories in parallel after Phase 2):
- US1 (T020-T024) || US2 (T025-T037)
- US3 (T038-T047) || US4 (T048-T051)
- US5 (T052-T058) || US6 (T059-T060)

---

## Implementation Notes

### Patterns from Stage 3 Classification (Reference)

The existing `/packages/course-gen-platform/src/stages/stage3-classification/` implementation demonstrates patterns that may be useful for prompt preview feature:

1. **Structured Output**: Use `model.withStructuredOutput(ZodSchema)` for reliable JSON responses
2. **Explicit Signals**: In prompt editor preview, show detected variables with highlighting
3. **Fallback Logic**: Prompt loader should fallback to hardcoded prompts if DB fails

### Commit Strategy

Run `/push patch` after EACH completed task:
- Mark task [X] in tasks.md
- Add artifacts: `→ Artifacts: [file1](path), [file2](path)`
- Update TodoWrite to completed
- Then `/push patch`

---

## Phase 10: Tech Debt - Router Refactoring

**Purpose**: Refactor oversized `pipeline-admin.ts` (3444 lines, 26 procedures) into modular structure

**Problem**: File violates SRP and is 2.6x larger than the second largest router. Hard to maintain and test.

**Analysis** (from Explore agent):
- Types already in `shared-types` ✅ (PipelineStage, PhaseName, ModelConfigWithVersion, etc.)
- Constants (PIPELINE_STAGES, DEFAULT_MODEL_CONFIGS) should stay in routers - local configs
- No existing precedent for nested routers in project - this will be first

### Target Structure

```
packages/course-gen-platform/src/server/routers/
├── pipeline-admin/                    # NEW folder
│   ├── index.ts                       # Main export, merges all sub-routers
│   ├── constants.ts                   # PIPELINE_STAGES, DEFAULT_MODEL_CONFIGS (~180 lines)
│   ├── stages.ts                      # getStagesInfo (~150 lines)
│   ├── stats.ts                       # getPipelineStats (~100 lines)
│   ├── model-configs.ts               # list, update, history, reset, revert (~550 lines)
│   ├── openrouter-models.ts           # list, refresh (~150 lines)
│   ├── prompts.ts                     # list, get, update, history, revert (~450 lines)
│   ├── global-settings.ts             # get, update (~250 lines)
│   ├── export-import.ts               # export, validate, import (~600 lines)
│   ├── backups.ts                     # list, restore (~200 lines)
│   └── api-keys.ts                    # status, test, update (~250 lines)
└── pipeline-admin.ts                  # DELETE after migration
```

### Tasks

- [x] T071 [P] Create `routers/pipeline-admin/constants.ts` - extract PIPELINE_STAGES and DEFAULT_MODEL_CONFIGS
  → Artifacts: [constants.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/constants.ts) (200 lines)
- [x] T072 [P] Create `routers/pipeline-admin/stages.ts` - extract getStagesInfo procedure
  → Artifacts: [stages.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/stages.ts) (164 lines)
- [x] T073 [P] Create `routers/pipeline-admin/stats.ts` - extract getPipelineStats procedure
  → Artifacts: [stats.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/stats.ts) (139 lines)
- [x] T074 Create `routers/pipeline-admin/model-configs.ts` - extract 5 model config procedures
  → Artifacts: [model-configs.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/model-configs.ts) (714 lines)
- [x] T075 [P] Create `routers/pipeline-admin/openrouter-models.ts` - extract 2 procedures
  → Artifacts: [openrouter-models.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/openrouter-models.ts) (150 lines)
- [x] T076 Create `routers/pipeline-admin/prompts.ts` - extract 5 prompt procedures
  → Artifacts: [prompts.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/prompts.ts) (629 lines)
- [x] T077 [P] Create `routers/pipeline-admin/global-settings.ts` - extract 2 procedures
  → Artifacts: [global-settings.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/global-settings.ts) (251 lines)
- [x] T078 Create `routers/pipeline-admin/export-import.ts` - extract 3 procedures
  → Artifacts: [export-import.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/export-import.ts) (742 lines)
- [x] T079 [P] Create `routers/pipeline-admin/backups.ts` - extract 2 procedures
  → Artifacts: [backups.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/backups.ts) (348 lines)
- [x] T080 [P] Create `routers/pipeline-admin/api-keys.ts` - extract 3 procedures
  → Artifacts: [api-keys.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/api-keys.ts) (333 lines)
- [x] T081 Create `routers/pipeline-admin/index.ts` - merge all sub-routers, export pipelineAdminRouter
  → Artifacts: [index.ts](../../packages/course-gen-platform/src/server/routers/pipeline-admin/index.ts) (75 lines)
- [x] T082 Update `app-router.ts` import path (works automatically with index.ts)
  → Note: No changes needed - import `./routers/pipeline-admin` resolves to folder's index.ts
- [x] T083 Delete old `routers/pipeline-admin.ts` after verification
  → Note: Deleted 3444-line monolithic file
- [x] T084 Run type-check and build to verify no regressions
  → Result: All 4 packages pass type-check and build

### Results Summary

**Before**: 1 file × 3444 lines
**After**: 11 files × 75-742 lines each (total: 3745 lines)

| File | Lines | Procedures |
|------|-------|------------|
| constants.ts | 200 | - |
| stages.ts | 164 | 1 |
| stats.ts | 139 | 1 |
| model-configs.ts | 714 | 5 |
| openrouter-models.ts | 150 | 2 |
| prompts.ts | 629 | 5 |
| global-settings.ts | 251 | 2 |
| export-import.ts | 742 | 3 |
| backups.ts | 348 | 2 |
| api-keys.ts | 333 | 3 |
| index.ts | 75 | - |

**API contract preserved**: `trpc.pipelineAdmin.*` calls work unchanged

---

## Notes

- **[P]** = parallelizable (different files, no dependencies)
- **[Story]** = maps task to user story
- All tRPC procedures in same file (pipeline-admin.ts) but can be implemented sequentially
- Migrations must run in sequence: T004 → T005 → T006 → T007
- Frontend components can be developed in parallel within same story
- Each story should be independently testable after completion
