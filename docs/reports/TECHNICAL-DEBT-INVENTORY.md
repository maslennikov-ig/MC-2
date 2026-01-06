# Technical Debt Inventory

**Generated**: 2026-01-06
**Last Updated**: 2026-01-06
**Status**: Active Tracking Document

---

## Executive Summary

| Category | Count | Status |
|----------|-------|--------|
| **Resolved this session** | 16 | ✅ Fixed |
| **Remaining - Future Features** | ~25 | Documented |
| **Remaining - Real Debt** | 3 | To address |

---

## ✅ RESOLVED (This Session)

### Dead Code Removed
| Item | Description |
|------|-------------|
| `workflow-graph.ts` | 445 lines of unused LangGraph STUB code deleted |
| `getUntypedClient()` | Removed from 4 organization API routes |

### TODOs Fixed
| TODO | Fix Applied |
|------|-------------|
| Hardcoded `locale: 'ru'` (7 files, 8 locations) | Now reads from `course.language` with fallback |
| `organization_members` type workaround | Deleted - types already available in shared-types |
| `platformVersion: '0.22.3'` hardcoded | Now reads dynamically from package.json |
| Stage 7 `llm_model_config` lookup (3 handlers) | Implemented ModelConfigService integration |

---

## 🔶 REMAINING: Real Technical Debt

These require actual implementation work:

### DEBT-001: Token-Aware Embedding Batching
**Priority**: HIGH
**File**: `packages/course-gen-platform/src/shared/embeddings/generate.ts:369`

```typescript
// TEMPORARY FIX: Reduced batch size to avoid Jina API 8194 token limit
const BATCH_SIZE = 5;
// TODO: Implement token-aware batching (see docs/Future/TOKEN-AWARE-BATCHING.md)
```

**Impact**: Suboptimal performance - each batch processes only 5 chunks regardless of token count.

---

### DEBT-002: Graceful Shutdown Cleanup
**Priority**: MEDIUM
**File**: `packages/course-gen-platform/src/server/index.ts:435`

```typescript
// TODO: Add cleanup for:
// - Supabase client connections
// - Redis connections
// - BullMQ worker instances
```

**Impact**: Server shutdown may leave dangling connections.

---

### DEBT-003: Docling Client Document Retrieval
**Priority**: LOW
**File**: `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts:312`

```typescript
// TODO: Implement proper DoclingDocument retrieval
```

**Investigate**: Verify if current implementation is sufficient.

---

## 📋 REMAINING: Planned Future Features

These are legitimate future work items, NOT debt:

### Backend Features
| File | Description |
|------|-------------|
| `summarization.ts:190` | SuperAdmin cross-org analytics |
| `error-handler.ts:199,222,244` | Job notifications, stalled recovery, timeout handling |
| `dependencies.router.ts:300` | BullMQ regeneration job queuing |
| `cascade-evaluator.ts:208` | Exercise validation (needs smoother implementation) |
| `user-preferences.ts:71,130` | Supabase user_preferences table integration |

### UI Features (Not Started)
| Component | Feature |
|-----------|---------|
| `EnrichmentsPanel.tsx:376` | Video playback URL storage helper |
| `stage-detail-sheet.tsx:112` | Document handler not implemented |
| `ModuleDashboard.tsx:127-164` | Retry/pause/play actions, model tier from settings |
| `NodeDetailsDrawer.tsx` | Edit mode, retry failed, export, regenerate, improve quality |
| `Stage6InspectorContent.tsx:243` | Diff support for content comparison |

### Tests
| File | Feature |
|------|---------|
| `lms-status.test.ts:899` | Multi-org test fixtures |
| `t053-synergy-sales-course.test.ts` | Style comparison, RAG tests |
| `test-orgs.ts:166,176` | Qdrant vectors & storage cleanup |

---

## 🚫 SKIPPED: LMS Integration (Per User Request)

These TODO items in LMS integration files are excluded from cleanup:
- `openedx/adapter.ts:281` - Open edX Course API
- `course-mapper.ts:259` - Asset extraction
- `history.router.ts:221` - RLS policies

---

## 📝 Best Practice Observations

Issues noticed during audit that should be addressed:

### OBS-001: Inconsistent Locale Pattern
**Severity**: LOW
**Location**: Multiple routers

Some files use `course.language`, others use `settings.language`. Should standardize on one pattern.

**Recommendation**: Always use `course.language` as primary source.

---

### OBS-002: Mixed Import Patterns
**Severity**: LOW
**Location**: `export-import.ts`

Using `createRequire` for JSON import works but could use native JSON import with assertion:
```typescript
import packageJson from '../../../../package.json' with { type: 'json' };
```

**Note**: Current approach is fine, just not the latest ESM pattern.

---

### OBS-003: Stage 7 Handlers Duplicate Pattern
**Severity**: LOW
**Location**: `video-handler.ts`, `presentation-handler.ts`, `quiz-handler.ts`

All three handlers have identical model config fetching logic. Could be extracted to shared utility.

**Recommendation**: Create `getStage7ModelConfig(phaseName, courseId)` helper.

---

## Validation Status

```
✅ pnpm type-check - PASSED
✅ pnpm build - PASSED
```

---

## Files Changed This Session

```
 .../server/routers/admin/generation-monitoring.ts  |   4 +-
 .../src/server/routers/document-processing.ts      |  10 +-
 .../server/routers/generation/lifecycle.router.ts  |   8 +-
 .../lesson-content/procedures/partial-generate.ts  |   2 +-
 .../lesson-content/procedures/retry-lesson.ts      |   2 +-
 .../routers/lesson-content/procedures/start.ts     |   2 +-
 .../server/routers/pipeline-admin/export-import.ts |   8 +-
 .../stages/stage4-analysis/utils/workflow-graph.ts | 444 - (DELETED)
 .../handlers/presentation-handler.ts               |  21 +-
 .../stage7-enrichments/handlers/quiz-handler.ts    |  21 +-
 .../stage7-enrichments/handlers/video-handler.ts   |  21 +-
 .../[orgId]/members/[userId]/route.ts              |  10 +-
 .../app/api/organizations/[orgId]/members/route.ts |  14 +-
 .../web/app/api/organizations/[orgId]/route.ts     |  14 +-
 packages/web/app/api/organizations/route.ts        |  10 +-
```

**Lines removed**: ~511
**Lines added**: ~240
**Net reduction**: ~271 lines

---

*Document maintained as part of technical debt tracking*
