# Stage Unification Refactoring Plan

**Project:** MegaCampus Course Generation Platform
**Module:** course-gen-platform
**Target:** Unified stage architecture (Stage 2, 3, 4, 5)
**Date:** 2025-11-20
**Version:** 1.0

---

## Executive Summary

This plan details the refactoring of the course-gen-platform orchestrator to achieve a unified, consistent structure across all pipeline stages (2-5). The current architecture has significant inconsistencies:

- **Stage 2** (Document Processing): Monolithic 803-line handler with embedded phases
- **Stage 3** (Summarization): Handler + separate service
- **Stage 4** (Analysis): Handler + well-structured 7-phase orchestrator in `orchestrator/services/analysis/`
- **Stage 5** (Generation): Handler + **orphaned** services in `services/stage5/` (outside orchestrator!)

**Target Architecture:** Unified `src/stages/{stage-name}/` structure with:
- Dedicated orchestrator per stage
- Isolated phase modules
- Consistent handler interface
- Co-located tests

**Benefits:**
- Eliminates architectural inconsistencies
- Improves code navigation and discoverability
- Reduces coupling between stages
- Simplifies testing and maintenance
- Enables parallel stage development

**Estimated Effort:** 16-24 hours (4 phases × 4-6 hours each)

**Risk Level:** Medium (many import dependencies, but test coverage is good)

---

## Current State Analysis

### Directory Structure (As-Is)

```
packages/course-gen-platform/src/
├── orchestrator/
│   ├── handlers/
│   │   ├── document-processing.ts         (28KB, 803 lines - MONOLITHIC)
│   │   ├── stage3-summarization.ts        (11KB, 358 lines)
│   │   ├── stage4-analysis.ts             (19KB, 515 lines)
│   │   ├── stage5-generation.ts           (23KB, 659 lines)
│   │   └── base-handler.ts                (Base class)
│   ├── services/
│   │   ├── analysis/                       (Stage 4 - WELL STRUCTURED)
│   │   │   ├── analysis-orchestrator.ts
│   │   │   ├── phase-1-classifier.ts
│   │   │   ├── phase-2-scope.ts
│   │   │   ├── phase-3-expert.ts
│   │   │   ├── phase-4-synthesis.ts
│   │   │   ├── phase-5-assembly.ts
│   │   │   ├── phase-6-rag-planning.ts
│   │   │   ├── langchain-models.ts
│   │   │   ├── workflow-graph.ts
│   │   │   └── __tests__/
│   │   └── summarization-service.ts       (Stage 3 service)
│   ├── workers/
│   │   └── stage3-summarization.worker.ts
│   ├── worker.ts                          (Main worker registry)
│   └── queue.ts                           (BullMQ queue config)
└── services/
    └── stage5/                            (Stage 5 - ORPHANED!)
        ├── generation-orchestrator.ts
        ├── metadata-generator.ts
        ├── section-batch-generator.ts
        ├── generation-phases.ts
        ├── quality-validator.ts
        ├── qdrant-search.ts
        ├── cost-calculator.ts
        ├── json-repair.ts
        ├── field-name-fix.ts
        ├── analysis-formatters.ts
        ├── sanitize-course-structure.ts
        ├── section-regeneration-service.ts
        └── validators/
            ├── validation-orchestrator.ts
            ├── blooms-validators.ts
            ├── duration-validator.ts
            ├── placeholder-validator.ts
            └── blooms-whitelists.ts
```

### Test Structure (As-Is)

```
packages/course-gen-platform/tests/
├── unit/
│   ├── stage5/                            (15+ test files)
│   │   ├── metadata-generator.test.ts
│   │   ├── section-batch-generator.test.ts
│   │   ├── cost-calculator.test.ts
│   │   └── ...
│   └── orchestrator/
│       └── services/
│           └── analysis/                   (Stage 4 tests)
│               ├── phase-1-classifier.test.ts
│               └── backward-compat.test.ts
├── integration/
│   ├── stage3-cost-tracking.test.ts
│   └── stage4-research-flag-detection.test.ts
└── e2e/
    └── stage3-real-documents.test.ts
```

### Key Problems

1. **Inconsistent Location:** Stage 5 services are in `services/stage5/`, not `orchestrator/services/`
2. **Monolithic Handler:** Stage 2 has 803 lines of embedded logic (no phase separation)
3. **Naming Inconsistency:** Stage 3/4/5 use "stage{N}" prefix, but Stage 2 uses "document-processing"
4. **Test Organization:** Stage 5 tests in `unit/stage5/`, Stage 4 in `unit/orchestrator/services/analysis/`
5. **Import Complexity:** Cross-cutting imports from multiple locations

### Import Dependency Analysis

**Stage 2 (document-processing.ts) imported by:**
- `orchestrator/worker.ts` (handler registration)
- No other direct imports (self-contained)

**Stage 3 (stage3-summarization.ts) imported by:**
- `orchestrator/worker.ts` (handler registration)
- `orchestrator/services/summarization-service.ts` (service import)

**Stage 4 (stage4-analysis.ts) imported by:**
- `orchestrator/worker.ts` (handler registration)
- `orchestrator/services/analysis/analysis-orchestrator.ts` (imports all phases)

**Stage 5 (stage5-generation.ts) imported by:**
- `orchestrator/worker.ts` (handler registration)
- `services/stage5/generation-orchestrator.ts` (orchestrator)
- `services/stage5/*.ts` (14+ service files)
- `shared/regeneration/layers/*.ts` (4 files: layer-2,3,4,5)
- `server/routers/generation.ts` (API router)

**High-Risk Files (>5 dependents):**
- `services/stage5/generation-orchestrator.ts`
- `services/stage5/section-batch-generator.ts`
- `services/stage5/quality-validator.ts`

---

## Target State Architecture

### Directory Structure (To-Be)

```
packages/course-gen-platform/src/stages/
├── stage2-document-processing/
│   ├── orchestrator.ts                    (Main orchestrator)
│   ├── handler.ts                         (BullMQ handler - thin wrapper)
│   ├── phases/
│   │   ├── phase-1-docling-conversion.ts
│   │   ├── phase-2-markdown-processing.ts
│   │   ├── phase-3-image-extraction.ts
│   │   ├── phase-4-chunking.ts
│   │   ├── phase-5-embedding.ts
│   │   └── phase-6-qdrant-upload.ts
│   ├── types.ts                           (Stage-specific types)
│   ├── utils.ts                           (Helper functions)
│   └── README.md                          (Stage documentation)
│
├── stage3-summarization/
│   ├── orchestrator.ts                    (Main orchestrator)
│   ├── handler.ts                         (BullMQ handler)
│   ├── phases/
│   │   ├── phase-1-validation.ts
│   │   ├── phase-2-summarization.ts
│   │   └── phase-3-metadata.ts
│   ├── types.ts
│   ├── utils.ts
│   └── README.md
│
├── stage4-analysis/
│   ├── orchestrator.ts                    (Refactored from analysis-orchestrator.ts)
│   ├── handler.ts                         (Refactored from stage4-analysis.ts)
│   ├── phases/
│   │   ├── phase-1-classifier.ts          (MOVE from orchestrator/services/analysis/)
│   │   ├── phase-2-scope.ts
│   │   ├── phase-3-expert.ts
│   │   ├── phase-4-synthesis.ts
│   │   ├── phase-5-assembly.ts
│   │   ├── phase-6-rag-planning.ts
│   │   └── phase-7-validation.ts
│   ├── types.ts
│   ├── utils/
│   │   ├── langchain-models.ts
│   │   ├── workflow-graph.ts
│   │   └── field-name-fix.ts
│   └── README.md
│
└── stage5-generation/
    ├── orchestrator.ts                    (MOVE from services/stage5/)
    ├── handler.ts                         (Refactored from stage5-generation.ts)
    ├── phases/
    │   ├── phase-1-validation.ts
    │   ├── phase-2-metadata.ts            (MOVE from metadata-generator.ts)
    │   ├── phase-3-sections.ts            (MOVE from section-batch-generator.ts)
    │   ├── phase-4-quality.ts             (MOVE from quality-validator.ts)
    │   └── phase-5-lessons.ts
    ├── types.ts
    ├── utils/
    │   ├── cost-calculator.ts             (MOVE from services/stage5/)
    │   ├── json-repair.ts
    │   ├── field-name-fix.ts
    │   ├── analysis-formatters.ts
    │   ├── sanitize.ts
    │   └── qdrant-search.ts
    ├── validators/                        (MOVE from services/stage5/validators/)
    │   ├── blooms-validators.ts
    │   ├── duration-validator.ts
    │   ├── placeholder-validator.ts
    │   └── blooms-whitelists.ts
    └── README.md

packages/course-gen-platform/tests/
├── unit/
│   ├── stages/
│   │   ├── stage2/
│   │   │   ├── orchestrator.test.ts
│   │   │   └── phases/
│   │   │       └── phase-1-docling.test.ts
│   │   ├── stage3/
│   │   ├── stage4/
│   │   │   └── phases/
│   │   │       ├── phase-1-classifier.test.ts (MOVE)
│   │   │       └── ...
│   │   └── stage5/
│   │       ├── orchestrator.test.ts
│   │       └── phases/
│   │           ├── phase-2-metadata.test.ts (RENAME)
│   │           └── ...
│   └── shared/
│       └── (shared utilities)
├── integration/
│   ├── stage2-embedding-pipeline.test.ts
│   ├── stage3-cost-tracking.test.ts       (UPDATE imports)
│   ├── stage4-research-flags.test.ts      (UPDATE imports)
│   └── stage5-generation-flow.test.ts
└── e2e/
    └── full-pipeline.test.ts

packages/course-gen-platform/src/orchestrator/
├── handlers/
│   ├── base-handler.ts                    (KEEP - base class)
│   ├── error-handler.ts                   (KEEP)
│   └── initialize.ts                      (KEEP)
├── worker.ts                              (UPDATE imports)
├── queue.ts                               (KEEP)
└── (other orchestrator utilities)
```

### Handler Pattern (Unified)

Each stage follows this pattern:

```typescript
// src/stages/stage{N}-{name}/handler.ts
import { Job } from 'bullmq';
import { BaseJobHandler, JobResult } from '../../orchestrator/handlers/base-handler';
import { {Stage}Orchestrator } from './orchestrator';
import type { {Stage}JobData } from '@megacampus/shared-types';

export class {Stage}Handler extends BaseJobHandler<{Stage}JobData> {
  private orchestrator: {Stage}Orchestrator;

  constructor() {
    super(JobType.{STAGE_TYPE});
    this.orchestrator = new {Stage}Orchestrator();
  }

  async execute(jobData: {Stage}JobData, job: Job): Promise<JobResult> {
    const result = await this.orchestrator.execute(jobData);
    return {
      success: true,
      message: 'Stage {N} completed',
      data: result,
    };
  }
}

export const stage{N}Handler = new {Stage}Handler();
```

### Orchestrator Pattern (Unified)

Each orchestrator implements phase execution:

```typescript
// src/stages/stage{N}-{name}/orchestrator.ts
export class {Stage}Orchestrator {
  async execute(input: {Stage}Input): Promise<{Stage}Result> {
    // Phase 1: Validation
    const validated = await phase1Validate(input);

    // Phase 2: Processing
    const processed = await phase2Process(validated);

    // Phase 3: Finalization
    const result = await phase3Finalize(processed);

    return result;
  }
}
```

---

## Refactoring Phases

### Overview

1. **Phase 1:** Stage 5 (Generation) - Most complex, highest risk
2. **Phase 2:** Stage 4 (Analysis) - Already structured, medium risk
3. **Phase 3:** Stage 2 (Document Processing) - Monolithic split, medium risk
4. **Phase 4:** Stage 3 (Summarization) - Simplest, lowest risk

**Rationale:** Start with highest-risk phase (Stage 5) to fail fast. Stage 5 has the most dependencies and is currently orphaned.

---

## Phase 1: Refactor Stage 5 (Generation)

**Duration:** 6-8 hours
**Risk Level:** HIGH (15+ service files, 6+ dependent files)
**Priority:** CRITICAL (currently orphaned outside orchestrator)

### Step 1.1: Create Directory Structure

```bash
mkdir -p src/stages/stage5-generation/{phases,utils,validators}
touch src/stages/stage5-generation/{orchestrator,handler,types,README}.ts
mkdir -p tests/unit/stages/stage5/{phases,utils,validators}
```

### Step 1.2: Move Core Files

| From | To | Size | Notes |
|------|----|----|-------|
| `services/stage5/generation-orchestrator.ts` | `stages/stage5-generation/orchestrator.ts` | 14KB | Main orchestrator |
| `orchestrator/handlers/stage5-generation.ts` | `stages/stage5-generation/handler.ts` | 23KB | Thin wrapper only |
| `services/stage5/generation-phases.ts` | `stages/stage5-generation/phases/index.ts` | 27KB | Phase definitions |

### Step 1.3: Split Phase Files

Extract from `generation-phases.ts` → individual phase files:

| Target File | Extracted Function | Lines |
|------------|-------------------|-------|
| `phases/phase-1-validation.ts` | `validateInputPhase()` | ~50 |
| `phases/phase-2-metadata.ts` | `generateMetadataPhase()` | ~100 |
| `phases/phase-3-sections.ts` | `generateSectionsPhase()` | ~150 |
| `phases/phase-4-quality.ts` | `validateQualityPhase()` | ~80 |
| `phases/phase-5-lessons.ts` | `validateLessonsPhase()` | ~60 |

**Extraction Pattern:**
```typescript
// Before (generation-phases.ts):
export const generateMetadataPhase = async (state: GenerationState) => { ... }

// After (phases/phase-2-metadata.ts):
export async function executeMetadataGeneration(state: GenerationState): Promise<...> {
  // ... extracted logic
}
```

### Step 1.4: Move Service Files

| From | To | Notes |
|------|----|----|
| `services/stage5/metadata-generator.ts` | `stages/stage5-generation/utils/metadata-generator.ts` | Keep as utility |
| `services/stage5/section-batch-generator.ts` | `stages/stage5-generation/utils/section-batch-generator.ts` | Keep as utility |
| `services/stage5/quality-validator.ts` | `stages/stage5-generation/utils/quality-validator.ts` | Keep as utility |
| `services/stage5/cost-calculator.ts` | `stages/stage5-generation/utils/cost-calculator.ts` | Move entire file |
| `services/stage5/json-repair.ts` | `stages/stage5-generation/utils/json-repair.ts` | Move entire file |
| `services/stage5/field-name-fix.ts` | `stages/stage5-generation/utils/field-name-fix.ts` | Move entire file |
| `services/stage5/analysis-formatters.ts` | `stages/stage5-generation/utils/analysis-formatters.ts` | Move entire file |
| `services/stage5/sanitize-course-structure.ts` | `stages/stage5-generation/utils/sanitize.ts` | Rename for brevity |
| `services/stage5/qdrant-search.ts` | `stages/stage5-generation/utils/qdrant-search.ts` | Move entire file |
| `services/stage5/validators/*` | `stages/stage5-generation/validators/*` | Move entire directory |

### Step 1.5: Update Import Paths

**Search Pattern:** `from.*services/stage5/`

**Files to Update (6 files):**
1. `shared/regeneration/layers/layer-2-critique-revise.ts`
2. `shared/regeneration/layers/layer-3-partial-regen.ts`
3. `shared/regeneration/layers/layer-4-model-escalation.ts`
4. `shared/regeneration/layers/layer-5-emergency.ts`
5. `server/routers/generation.ts`
6. `orchestrator/worker.ts`

**Example Update:**
```typescript
// Before:
import { GenerationOrchestrator } from '../../services/stage5/generation-orchestrator';
import { QualityValidator } from '../../services/stage5/quality-validator';

// After:
import { GenerationOrchestrator } from '../../stages/stage5-generation/orchestrator';
import { QualityValidator } from '../../stages/stage5-generation/utils/quality-validator';
```

**Automated Update Command:**
```bash
# Update all imports in one pass
find src/ -type f -name "*.ts" -exec sed -i \
  -e "s|services/stage5/generation-orchestrator|stages/stage5-generation/orchestrator|g" \
  -e "s|services/stage5/metadata-generator|stages/stage5-generation/utils/metadata-generator|g" \
  -e "s|services/stage5/section-batch-generator|stages/stage5-generation/utils/section-batch-generator|g" \
  -e "s|services/stage5/quality-validator|stages/stage5-generation/utils/quality-validator|g" \
  -e "s|services/stage5/|stages/stage5-generation/utils/|g" \
  {} +
```

### Step 1.6: Update Worker Registry

**File:** `orchestrator/worker.ts`

```typescript
// Before:
import { stage5GenerationHandler } from './handlers/stage5-generation';

// After:
import { stage5GenerationHandler } from '../stages/stage5-generation/handler';
```

### Step 1.7: Move Tests

| From | To |
|------|-------|
| `tests/unit/stage5/metadata-generator.test.ts` | `tests/unit/stages/stage5/utils/metadata-generator.test.ts` |
| `tests/unit/stage5/section-batch-generator.test.ts` | `tests/unit/stages/stage5/utils/section-batch-generator.test.ts` |
| `tests/unit/stage5/cost-calculator.test.ts` | `tests/unit/stages/stage5/utils/cost-calculator.test.ts` |
| `tests/unit/stage5/*.test.ts` | `tests/unit/stages/stage5/**/*.test.ts` |

**Update Test Imports:**
```bash
find tests/unit/stages/stage5/ -type f -name "*.test.ts" -exec sed -i \
  -e "s|../../../src/services/stage5/|../../../../../src/stages/stage5-generation/utils/|g" \
  {} +
```

### Step 1.8: Validation Checklist

- [ ] All imports resolve (no red squiggles in IDE)
- [ ] `pnpm type-check` passes in `course-gen-platform`
- [ ] Unit tests pass: `pnpm test tests/unit/stages/stage5/`
- [ ] Integration tests pass: `pnpm test tests/integration/`
- [ ] No orphaned files remain in `services/stage5/`
- [ ] Worker registry updated and imports resolve
- [ ] Git commit created with detailed message

### Step 1.9: Git Commit

```bash
git add src/stages/stage5-generation/ tests/unit/stages/stage5/
git add -u src/services/stage5/ src/orchestrator/handlers/stage5-generation.ts
git commit -m "$(cat <<'EOF'
refactor(stage5): unify Stage 5 Generation structure

BREAKING CHANGE: Stage 5 services moved from services/stage5/ to stages/stage5-generation/

Changes:
- Move generation-orchestrator.ts → stages/stage5-generation/orchestrator.ts
- Split generation-phases.ts into individual phase files (phases/*.ts)
- Move all service files to stages/stage5-generation/utils/
- Move validators to stages/stage5-generation/validators/
- Refactor handler.ts to thin wrapper pattern
- Update 6 dependent files with new import paths
- Move 15+ test files to tests/unit/stages/stage5/

Affected modules:
- src/stages/stage5-generation/ (NEW)
- src/services/stage5/ (DELETED)
- src/orchestrator/handlers/stage5-generation.ts (REFACTORED)
- src/shared/regeneration/layers/*.ts (4 files updated)
- src/server/routers/generation.ts (updated)
- tests/unit/stages/stage5/ (NEW)
- tests/unit/stage5/ (DELETED)

Validation:
✅ All imports resolve
✅ pnpm type-check passes
✅ Unit tests pass (15+ test files)
✅ Integration tests pass
✅ No duplicate code

See: docs/refactoring/STAGE-UNIFICATION-PLAN.md (Phase 1)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Step 1.10: Rollback Strategy

If Phase 1 fails:

```bash
# Restore original structure
git checkout HEAD -- src/services/stage5/
git checkout HEAD -- src/orchestrator/handlers/stage5-generation.ts
git checkout HEAD -- tests/unit/stage5/

# Remove new structure
rm -rf src/stages/stage5-generation/
rm -rf tests/unit/stages/stage5/

# Restore dependent files
git checkout HEAD -- src/shared/regeneration/layers/
git checkout HEAD -- src/server/routers/generation.ts
git checkout HEAD -- src/orchestrator/worker.ts

# Verify restoration
pnpm type-check && pnpm test
```

### Risk Mitigation

- **High Import Count:** Use automated sed script (Step 1.5)
- **Test Failures:** Run tests after each file move, not at the end
- **Breaking Changes:** Create feature branch, merge after full validation
- **Service Downtime:** Zero (refactoring only, no logic changes)

---

## Phase 2: Refactor Stage 4 (Analysis)

**Duration:** 4-5 hours
**Risk Level:** MEDIUM (already structured, but 7 phase files)
**Priority:** HIGH (good structure but wrong location)

### Step 2.1: Create Directory Structure

```bash
mkdir -p src/stages/stage4-analysis/{phases,utils}
touch src/stages/stage4-analysis/{orchestrator,handler,types,README}.ts
mkdir -p tests/unit/stages/stage4/phases/
```

### Step 2.2: Move Core Files

| From | To | Notes |
|------|----|----|
| `orchestrator/services/analysis/analysis-orchestrator.ts` | `stages/stage4-analysis/orchestrator.ts` | Main orchestrator |
| `orchestrator/handlers/stage4-analysis.ts` | `stages/stage4-analysis/handler.ts` | Refactor to thin wrapper |

### Step 2.3: Move Phase Files

| From | To |
|------|-------|
| `orchestrator/services/analysis/phase-1-classifier.ts` | `stages/stage4-analysis/phases/phase-1-classifier.ts` |
| `orchestrator/services/analysis/phase-2-scope.ts` | `stages/stage4-analysis/phases/phase-2-scope.ts` |
| `orchestrator/services/analysis/phase-3-expert.ts` | `stages/stage4-analysis/phases/phase-3-expert.ts` |
| `orchestrator/services/analysis/phase-4-synthesis.ts` | `stages/stage4-analysis/phases/phase-4-synthesis.ts` |
| `orchestrator/services/analysis/phase-5-assembly.ts` | `stages/stage4-analysis/phases/phase-5-assembly.ts` |
| `orchestrator/services/analysis/phase-6-rag-planning.ts` | `stages/stage4-analysis/phases/phase-6-rag-planning.ts` |

### Step 2.4: Move Utility Files

| From | To |
|------|-------|
| `orchestrator/services/analysis/langchain-models.ts` | `stages/stage4-analysis/utils/langchain-models.ts` |
| `orchestrator/services/analysis/workflow-graph.ts` | `stages/stage4-analysis/utils/workflow-graph.ts` |
| `orchestrator/services/analysis/field-name-fix.ts` | `stages/stage4-analysis/utils/field-name-fix.ts` |
| `orchestrator/services/analysis/contextual-language.ts` | `stages/stage4-analysis/utils/contextual-language.ts` |
| `orchestrator/services/analysis/research-flag-detector.ts` | `stages/stage4-analysis/utils/research-flag-detector.ts` |
| `orchestrator/services/analysis/analysis-validators.ts` | `stages/stage4-analysis/utils/validators.ts` |
| `orchestrator/services/analysis/langchain-observability.ts` | `stages/stage4-analysis/utils/observability.ts` |

### Step 2.5: Update Import Paths

**Search Pattern:** `from.*orchestrator/services/analysis/`

**Files to Update (fewer than Stage 5):**
1. `orchestrator/worker.ts`
2. `shared/regeneration/layers/layer-2-critique-revise.ts`
3. `shared/regeneration/layers/layer-3-partial-regen.ts`
4. `shared/regeneration/layers/layer-4-model-escalation.ts`
5. `shared/regeneration/layers/layer-5-emergency.ts`

**Automated Update:**
```bash
find src/ -type f -name "*.ts" -exec sed -i \
  -e "s|orchestrator/services/analysis/analysis-orchestrator|stages/stage4-analysis/orchestrator|g" \
  -e "s|orchestrator/services/analysis/phase-|stages/stage4-analysis/phases/phase-|g" \
  -e "s|orchestrator/services/analysis/langchain-models|stages/stage4-analysis/utils/langchain-models|g" \
  -e "s|orchestrator/services/analysis/workflow-graph|stages/stage4-analysis/utils/workflow-graph|g" \
  -e "s|orchestrator/services/analysis/|stages/stage4-analysis/utils/|g" \
  {} +
```

### Step 2.6: Move Tests

| From | To |
|------|-------|
| `tests/unit/orchestrator/services/analysis/phase-1-classifier.test.ts` | `tests/unit/stages/stage4/phases/phase-1-classifier.test.ts` |
| `tests/unit/orchestrator/services/analysis/backward-compat.test.ts` | `tests/unit/stages/stage4/backward-compat.test.ts` |
| `tests/unit/orchestrator/services/analysis/__tests__/*` | `tests/unit/stages/stage4/utils/*` |

### Step 2.7: Validation Checklist

- [ ] All imports resolve
- [ ] `pnpm type-check` passes
- [ ] Unit tests pass: `pnpm test tests/unit/stages/stage4/`
- [ ] Integration tests pass: `pnpm test tests/integration/stage4-*`
- [ ] No orphaned files in `orchestrator/services/analysis/`
- [ ] Worker registry updated
- [ ] Git commit created

### Step 2.8: Git Commit

```bash
git commit -m "$(cat <<'EOF'
refactor(stage4): unify Stage 4 Analysis structure

Changes:
- Move analysis-orchestrator.ts → stages/stage4-analysis/orchestrator.ts
- Move 6 phase files to stages/stage4-analysis/phases/
- Move 7 utility files to stages/stage4-analysis/utils/
- Refactor handler.ts to thin wrapper pattern
- Update 5 dependent files with new import paths
- Move test files to tests/unit/stages/stage4/

Affected modules:
- src/stages/stage4-analysis/ (NEW)
- src/orchestrator/services/analysis/ (DELETED)
- src/orchestrator/handlers/stage4-analysis.ts (REFACTORED)

Validation:
✅ All imports resolve
✅ pnpm type-check passes
✅ Unit tests pass
✅ Integration tests pass

See: docs/refactoring/STAGE-UNIFICATION-PLAN.md (Phase 2)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Rollback Strategy

```bash
git checkout HEAD -- src/orchestrator/services/analysis/
git checkout HEAD -- src/orchestrator/handlers/stage4-analysis.ts
git checkout HEAD -- tests/unit/orchestrator/services/analysis/
rm -rf src/stages/stage4-analysis/
rm -rf tests/unit/stages/stage4/
git checkout HEAD -- src/shared/regeneration/layers/
pnpm type-check && pnpm test
```

---

## Phase 3: Refactor Stage 2 (Document Processing)

**Duration:** 5-6 hours
**Risk Level:** MEDIUM (monolithic split, but low coupling)
**Priority:** MEDIUM (self-contained, few dependents)

### Step 3.1: Create Directory Structure

```bash
mkdir -p src/stages/stage2-document-processing/phases/
touch src/stages/stage2-document-processing/{orchestrator,handler,types,README}.ts
mkdir -p tests/unit/stages/stage2/phases/
```

### Step 3.2: Analyze Monolithic Handler

**Current Structure (document-processing.ts - 803 lines):**
- Lines 1-93: Imports, types, class declaration
- Lines 94-429: `execute()` method (main orchestration)
- Lines 430-461: `processDocumentByTier()` (tier routing)
- Lines 462-513: `processBasicTier()` (BASIC tier logic)
- Lines 519-558: `processStandardTier()` (STANDARD tier logic)
- Lines 565-585: `processPremiumTier()` (PREMIUM tier logic)
- Lines 590-803: `processWithDocling()` (Docling processing + 6 sub-phases)

**Embedded Phases (lines 590-803):**
1. Docling conversion (lines 595-620)
2. Markdown processing (lines 625-650)
3. Image extraction (lines 655-680)
4. Chunking (lines 685-720)
5. Embedding generation (lines 725-760)
6. Qdrant upload (lines 765-803)

### Step 3.3: Split Handler into Orchestrator + Phases

**New Orchestrator:**
```typescript
// stages/stage2-document-processing/orchestrator.ts
export class DocumentProcessingOrchestrator {
  async execute(input: DocumentProcessingInput): Promise<DocumentProcessingResult> {
    // Phase 0: Tier detection
    const tier = await detectOrganizationTier(input.fileId);

    // Phase 1: Docling conversion
    const doclingDoc = await executeDoclingConversion(input.filePath, tier);

    // Phase 2: Markdown processing
    const markdown = await executeMarkdownProcessing(doclingDoc);

    // Phase 3: Image extraction (if PREMIUM)
    const images = tier === 'premium'
      ? await executeImageExtraction(doclingDoc)
      : [];

    // Phase 4: Chunking
    const chunks = await executeChunking(markdown);

    // Phase 5: Embedding generation
    const embeddings = await executeEmbedding(chunks);

    // Phase 6: Qdrant upload
    await executeQdrantUpload(embeddings, input.fileId);

    return { markdown, images, stats: { ... } };
  }
}
```

### Step 3.4: Extract Phase Files

| Target File | Extracted From | Lines | Logic |
|------------|----------------|-------|-------|
| `phases/phase-1-docling-conversion.ts` | Lines 595-620 | ~80 | Docling MCP call |
| `phases/phase-2-markdown-processing.ts` | Lines 625-650 | ~60 | Markdown conversion |
| `phases/phase-3-image-extraction.ts` | Lines 655-680 | ~70 | OCR + image metadata |
| `phases/phase-4-chunking.ts` | Lines 685-720 | ~80 | Hierarchical chunking |
| `phases/phase-5-embedding.ts` | Lines 725-760 | ~80 | Late chunking embeddings |
| `phases/phase-6-qdrant-upload.ts` | Lines 765-803 | ~90 | Vector DB upload |

**Example Extraction:**
```typescript
// phases/phase-4-chunking.ts
import { chunkMarkdown, DEFAULT_CHUNKING_CONFIG } from '../../../shared/embeddings/markdown-chunker';

export async function executeChunking(markdown: string): Promise<ChunkResult[]> {
  const chunks = await chunkMarkdown(markdown, DEFAULT_CHUNKING_CONFIG);
  return chunks;
}
```

### Step 3.5: Refactor Handler to Thin Wrapper

```typescript
// stages/stage2-document-processing/handler.ts
import { BaseJobHandler, JobResult } from '../../orchestrator/handlers/base-handler';
import { DocumentProcessingOrchestrator } from './orchestrator';

export class DocumentProcessingHandler extends BaseJobHandler<DocumentProcessingJobData> {
  private orchestrator: DocumentProcessingOrchestrator;

  constructor() {
    super(JobType.DOCUMENT_PROCESSING);
    this.orchestrator = new DocumentProcessingOrchestrator();
  }

  async execute(jobData: DocumentProcessingJobData, job: Job): Promise<JobResult> {
    const result = await this.orchestrator.execute(jobData);
    return {
      success: true,
      message: 'Document processing completed',
      data: result,
    };
  }
}
```

### Step 3.6: Update Worker Registry

```typescript
// orchestrator/worker.ts
// Before:
import { documentProcessingHandler } from './handlers/document-processing';

// After:
import { documentProcessingHandler } from '../stages/stage2-document-processing/handler';
```

### Step 3.7: Create Tests

```bash
# Create phase tests
touch tests/unit/stages/stage2/phases/phase-1-docling.test.ts
touch tests/unit/stages/stage2/phases/phase-4-chunking.test.ts
touch tests/unit/stages/stage2/phases/phase-5-embedding.test.ts
```

### Step 3.8: Validation Checklist

- [ ] All imports resolve
- [ ] `pnpm type-check` passes
- [ ] No logic changes (pure refactoring)
- [ ] Handler still extends BaseJobHandler
- [ ] Worker registry updated
- [ ] Git commit created

### Step 3.9: Git Commit

```bash
git commit -m "$(cat <<'EOF'
refactor(stage2): split monolithic document-processing handler

Changes:
- Split 803-line handler into orchestrator + 6 phase files
- Create stages/stage2-document-processing/ directory
- Extract phase-1-docling-conversion.ts (Docling MCP)
- Extract phase-2-markdown-processing.ts (MD conversion)
- Extract phase-3-image-extraction.ts (OCR + images)
- Extract phase-4-chunking.ts (hierarchical chunking)
- Extract phase-5-embedding.ts (late chunking embeddings)
- Extract phase-6-qdrant-upload.ts (vector DB)
- Refactor handler to thin wrapper pattern

Affected modules:
- src/stages/stage2-document-processing/ (NEW)
- src/orchestrator/handlers/document-processing.ts (DELETED)
- src/orchestrator/worker.ts (updated)

Validation:
✅ All imports resolve
✅ pnpm type-check passes
✅ No logic changes (pure refactoring)

See: docs/refactoring/STAGE-UNIFICATION-PLAN.md (Phase 3)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Rollback Strategy

```bash
git checkout HEAD -- src/orchestrator/handlers/document-processing.ts
rm -rf src/stages/stage2-document-processing/
git checkout HEAD -- src/orchestrator/worker.ts
pnpm type-check
```

---

## Phase 4: Refactor Stage 3 (Summarization)

**Duration:** 3-4 hours
**Risk Level:** LOW (simplest stage, fewest files)
**Priority:** LOW (already reasonably structured)

### Step 4.1: Create Directory Structure

```bash
mkdir -p src/stages/stage3-summarization/phases/
touch src/stages/stage3-summarization/{orchestrator,handler,types,README}.ts
mkdir -p tests/unit/stages/stage3/phases/
```

### Step 4.2: Move Core Files

| From | To | Notes |
|------|----|----|
| `orchestrator/services/summarization-service.ts` | `stages/stage3-summarization/orchestrator.ts` | Rename + refactor |
| `orchestrator/handlers/stage3-summarization.ts` | `stages/stage3-summarization/handler.ts` | Already thin wrapper |
| `orchestrator/workers/stage3-summarization.worker.ts` | `stages/stage3-summarization/worker.ts` | Move worker config |

### Step 4.3: Extract Phases

Currently `summarization-service.ts` contains all logic in one function. Split into:

| Phase File | Logic |
|-----------|-------|
| `phases/phase-1-validation.ts` | Input validation |
| `phases/phase-2-summarization.ts` | LLM summarization |
| `phases/phase-3-metadata.ts` | Token counting + cost calculation |

### Step 4.4: Update Import Paths

**Files to Update:**
1. `orchestrator/worker.ts` (handler registration)
2. `orchestrator/handlers/stage3-summarization.ts` → `stages/stage3-summarization/handler.ts`

### Step 4.5: Move Tests

```bash
mv tests/e2e/stage3-real-documents.test.ts tests/unit/stages/stage3/
mv tests/integration/stage3-cost-tracking.test.ts tests/integration/stages/stage3-cost-tracking.test.ts
```

### Step 4.6: Validation Checklist

- [ ] All imports resolve
- [ ] `pnpm type-check` passes
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Worker registry updated
- [ ] Git commit created

### Step 4.7: Git Commit

```bash
git commit -m "$(cat <<'EOF'
refactor(stage3): unify Stage 3 Summarization structure

Changes:
- Move summarization-service.ts → stages/stage3-summarization/orchestrator.ts
- Split service into 3 phase files (validation, summarization, metadata)
- Move stage3-summarization.ts → stages/stage3-summarization/handler.ts
- Move worker to stages/stage3-summarization/worker.ts
- Update worker registry with new paths

Affected modules:
- src/stages/stage3-summarization/ (NEW)
- src/orchestrator/services/summarization-service.ts (DELETED)
- src/orchestrator/handlers/stage3-summarization.ts (MOVED)
- src/orchestrator/workers/stage3-summarization.worker.ts (MOVED)

Validation:
✅ All imports resolve
✅ pnpm type-check passes
✅ E2E tests pass
✅ Integration tests pass

See: docs/refactoring/STAGE-UNIFICATION-PLAN.md (Phase 4)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Rollback Strategy

```bash
git checkout HEAD -- src/orchestrator/services/summarization-service.ts
git checkout HEAD -- src/orchestrator/handlers/stage3-summarization.ts
git checkout HEAD -- src/orchestrator/workers/stage3-summarization.worker.ts
rm -rf src/stages/stage3-summarization/
pnpm type-check
```

---

## Cross-Phase Concerns

### Worker Registry Consolidation

After all 4 phases, update `orchestrator/worker.ts`:

```typescript
// orchestrator/worker.ts (FINAL STATE)
import { stage2Handler } from '../stages/stage2-document-processing/handler';
import { stage3Handler } from '../stages/stage3-summarization/handler';
import { stage4Handler } from '../stages/stage4-analysis/handler';
import { stage5Handler } from '../stages/stage5-generation/handler';

const jobHandlers: Record<string, BaseJobHandler<JobData>> = {
  [JobType.DOCUMENT_PROCESSING]: stage2Handler,
  [JobType.STAGE_3_SUMMARIZATION]: stage3Handler,
  [JobType.STRUCTURE_ANALYSIS]: stage4Handler,
  [JobType.STRUCTURE_GENERATION]: stage5Handler,
  // ... other handlers
};
```

### Test Organization

All stage tests should follow this structure:

```
tests/unit/stages/{stage-name}/
├── orchestrator.test.ts          (High-level orchestration tests)
├── handler.test.ts               (BullMQ handler tests)
├── phases/
│   ├── phase-1-*.test.ts
│   ├── phase-2-*.test.ts
│   └── ...
└── utils/
    ├── utility-1.test.ts
    └── ...
```

### Documentation Standards

Each stage must have a `README.md` with:

```markdown
# Stage {N}: {Name}

## Overview
Brief description of stage purpose.

## Architecture
- **Orchestrator:** Main entry point
- **Handler:** BullMQ job handler (thin wrapper)
- **Phases:** {N} phases listed

## Phase Breakdown
1. **Phase 1:** Description
2. **Phase 2:** Description
...

## Dependencies
- External: (e.g., Docling MCP, OpenRouter API)
- Internal: (e.g., shared/embeddings, shared/qdrant)

## Testing
- Unit tests: `tests/unit/stages/stage{N}/`
- Integration tests: `tests/integration/stage{N}-*.test.ts`

## Cost Tracking
- Model: {model name}
- Avg cost: ${cost} per run
```

---

## Validation & Testing Strategy

### Pre-Refactoring Baseline

Before starting any phase:

```bash
# Capture baseline metrics
pnpm type-check > baseline-types.log
pnpm test --coverage > baseline-tests.log
git rev-parse HEAD > baseline-commit.txt
```

### Per-Phase Validation

After each phase completes:

```bash
# Type-check
pnpm type-check

# Unit tests (fast feedback)
pnpm test tests/unit/stages/stage{N}/

# Integration tests (stage-specific)
pnpm test tests/integration/stage{N}-*

# E2E tests (if applicable)
pnpm test tests/e2e/stage{N}-*

# Check for orphaned imports
grep -r "services/stage5" src/ && echo "ERROR: Old imports found!" || echo "✅ No old imports"
grep -r "orchestrator/services/analysis" src/ && echo "ERROR: Old imports found!" || echo "✅ No old imports"
```

### Post-Refactoring Full Suite

After all 4 phases complete:

```bash
# Full test suite
pnpm test --coverage

# Ensure coverage didn't drop
diff baseline-tests.log current-tests.log

# Check for duplicate code
pnpm lint

# Verify no dead code
pnpm build
```

---

## Risk Matrix

| Phase | Risk Level | Impact | Probability | Mitigation |
|-------|-----------|--------|-------------|------------|
| Phase 1 (Stage 5) | HIGH | HIGH | MEDIUM | Automated sed, incremental testing |
| Phase 2 (Stage 4) | MEDIUM | MEDIUM | LOW | Already structured, fewer deps |
| Phase 3 (Stage 2) | MEDIUM | LOW | MEDIUM | Self-contained, low coupling |
| Phase 4 (Stage 3) | LOW | LOW | LOW | Simplest stage, clear boundaries |

### Risk Factors

**High-Risk Indicators:**
- ❌ >10 files importing from target module
- ❌ Monolithic file >500 lines
- ❌ Complex cross-module dependencies
- ❌ Shared state or singletons

**Medium-Risk Indicators:**
- ⚠️ 5-10 files importing from target module
- ⚠️ Files 200-500 lines
- ⚠️ Some cross-module dependencies

**Low-Risk Indicators:**
- ✅ <5 files importing from target module
- ✅ Files <200 lines
- ✅ Clear module boundaries

### Contingency Plans

**If Phase 1 (Stage 5) fails:**
- Rollback using Git (Step 1.10)
- Re-assess risk factors
- Consider alternative approach: incremental file-by-file moves
- Engage senior developer for code review

**If any phase takes >2x estimated time:**
- Pause and assess blockers
- Document unexpected complexity
- Consider splitting into sub-phases
- Update plan with new estimates

---

## Success Criteria

### Functional Requirements

- [ ] All handlers extend BaseJobHandler or implement compatible interface
- [ ] All orchestrators follow consistent pattern (execute method)
- [ ] All phases are in dedicated files (no monolithic handlers)
- [ ] Worker registry imports from `stages/` only
- [ ] No orphaned files in old locations

### Code Quality Requirements

- [ ] `pnpm type-check` passes (zero TypeScript errors)
- [ ] `pnpm lint` passes (zero ESLint errors)
- [ ] `pnpm build` succeeds
- [ ] Test coverage ≥90% (no drop from baseline)
- [ ] All tests pass (unit, integration, e2e)

### Documentation Requirements

- [ ] Each stage has README.md
- [ ] Each phase has JSDoc comments
- [ ] Architecture diagrams updated (if applicable)
- [ ] This refactoring plan updated with actuals
- [ ] Git commit messages follow conventional commits

### Performance Requirements

- [ ] No performance regression (test execution time ±5%)
- [ ] Bundle size unchanged (±2%)
- [ ] No new circular dependencies
- [ ] Import depth ≤4 levels

---

## Timeline & Milestones

### Week 1: Planning & Phase 1
- **Day 1 (4h):** Planning, document creation, baseline metrics
- **Day 2-3 (12h):** Phase 1 (Stage 5) execution + validation

### Week 2: Phases 2-3
- **Day 4 (4h):** Phase 2 (Stage 4) execution + validation
- **Day 5-6 (10h):** Phase 3 (Stage 2) execution + validation

### Week 3: Phase 4 & Finalization
- **Day 7 (4h):** Phase 4 (Stage 3) execution + validation
- **Day 8 (4h):** Full test suite, documentation, cleanup

### Total: 38 hours over 3 weeks (part-time allocation)

---

## Monitoring & Metrics

### Pre-Refactoring Metrics (Baseline)

```bash
# Capture before starting
cloc src/orchestrator/handlers/ src/orchestrator/services/ src/services/stage5/ > baseline-cloc.txt
find src/ -name "*.ts" | wc -l > baseline-file-count.txt
grep -r "from.*handlers/" src/ | wc -l > baseline-handler-imports.txt
```

### Post-Refactoring Metrics (Target)

| Metric | Baseline | Target | Actual |
|--------|---------|--------|--------|
| Total TypeScript files | TBD | TBD | |
| Lines of code (handlers) | ~2100 | ~1200 | |
| Average file size | ~400 lines | <200 lines | |
| Import depth (max) | 5 levels | 4 levels | |
| Test coverage | ~85% | ≥90% | |
| Duplicate code % | ~12% | <5% | |

### Success Metrics

- **Discoverability:** Developers can find stage code in <30 seconds
- **Maintainability:** Adding new phase takes <2 hours
- **Testability:** Writing new tests takes <1 hour
- **Consistency:** All stages follow identical patterns

---

## Appendix A: File Inventory

### Stage 2 Files (Current)

**Handlers:**
- `orchestrator/handlers/document-processing.ts` (28KB, 803 lines)

**Dependencies:**
- `shared/embeddings/index.js` (markdown conversion)
- `shared/docling/types.js` (Docling types)
- `shared/embeddings/markdown-chunker.js` (chunking)
- `shared/embeddings/generate.js` (embeddings)
- `shared/qdrant/upload.js` (vector DB)

**Tests:**
- None (to be created)

### Stage 3 Files (Current)

**Handlers:**
- `orchestrator/handlers/stage3-summarization.ts` (11KB, 358 lines)

**Services:**
- `orchestrator/services/summarization-service.ts`

**Workers:**
- `orchestrator/workers/stage3-summarization.worker.ts`

**Tests:**
- `tests/e2e/stage3-real-documents.test.ts`
- `tests/integration/stage3-cost-tracking.test.ts`

### Stage 4 Files (Current)

**Handlers:**
- `orchestrator/handlers/stage4-analysis.ts` (19KB, 515 lines)

**Services:**
- `orchestrator/services/analysis/analysis-orchestrator.ts` (18KB)
- `orchestrator/services/analysis/phase-1-classifier.ts` (10KB)
- `orchestrator/services/analysis/phase-2-scope.ts` (21KB)
- `orchestrator/services/analysis/phase-3-expert.ts` (15KB)
- `orchestrator/services/analysis/phase-4-synthesis.ts` (18KB)
- `orchestrator/services/analysis/phase-5-assembly.ts` (23KB)
- `orchestrator/services/analysis/phase-6-rag-planning.ts` (17KB)
- `orchestrator/services/analysis/langchain-models.ts` (8KB)
- `orchestrator/services/analysis/workflow-graph.ts` (13KB)
- `orchestrator/services/analysis/field-name-fix.ts` (7KB)
- `orchestrator/services/analysis/contextual-language.ts` (6KB)
- `orchestrator/services/analysis/research-flag-detector.ts` (7KB)
- `orchestrator/services/analysis/analysis-validators.ts` (10KB)
- `orchestrator/services/analysis/langchain-observability.ts` (14KB)

**Tests:**
- `tests/unit/orchestrator/services/analysis/phase-1-classifier.test.ts`
- `tests/unit/orchestrator/services/analysis/backward-compat.test.ts`
- `tests/unit/orchestrator/services/analysis/__tests__/*` (3+ files)
- `tests/integration/stage4-research-flag-detection.test.ts`

### Stage 5 Files (Current)

**Handlers:**
- `orchestrator/handlers/stage5-generation.ts` (23KB, 659 lines)

**Services (ORPHANED):**
- `services/stage5/generation-orchestrator.ts` (14KB)
- `services/stage5/metadata-generator.ts` (25KB)
- `services/stage5/section-batch-generator.ts` (37KB)
- `services/stage5/generation-phases.ts` (27KB)
- `services/stage5/generation-state.ts` (20KB)
- `services/stage5/quality-validator.ts` (18KB)
- `services/stage5/qdrant-search.ts` (15KB)
- `services/stage5/cost-calculator.ts` (18KB)
- `services/stage5/json-repair.ts` (11KB)
- `services/stage5/field-name-fix.ts` (6KB)
- `services/stage5/analysis-formatters.ts` (9KB)
- `services/stage5/sanitize-course-structure.ts` (8KB)
- `services/stage5/section-regeneration-service.ts` (15KB)
- `services/stage5/validators/validation-orchestrator.ts`
- `services/stage5/validators/blooms-validators.ts`
- `services/stage5/validators/duration-validator.ts`
- `services/stage5/validators/placeholder-validator.ts`
- `services/stage5/validators/blooms-whitelists.ts`

**Tests:**
- `tests/unit/stage5/` (15+ test files)

---

## Appendix B: Import Graph

### Stage 5 Dependency Graph (Critical)

```
orchestrator/worker.ts
  └─> orchestrator/handlers/stage5-generation.ts
        ├─> services/stage5/generation-orchestrator.ts
        │     ├─> services/stage5/metadata-generator.ts
        │     ├─> services/stage5/section-batch-generator.ts
        │     ├─> services/stage5/quality-validator.ts
        │     └─> services/stage5/generation-phases.ts
        ├─> services/stage5/sanitize-course-structure.ts
        └─> services/stage5/cost-calculator.ts

shared/regeneration/layers/layer-2-critique-revise.ts
  └─> services/stage5/quality-validator.ts

shared/regeneration/layers/layer-3-partial-regen.ts
  └─> services/stage5/section-batch-generator.ts

shared/regeneration/layers/layer-4-model-escalation.ts
  └─> services/stage5/section-batch-generator.ts

shared/regeneration/layers/layer-5-emergency.ts
  └─> services/stage5/section-batch-generator.ts

server/routers/generation.ts
  └─> services/stage5/generation-orchestrator.ts
```

**Total Import Sites:** 6 files (HIGH RISK)

### Stage 4 Dependency Graph

```
orchestrator/worker.ts
  └─> orchestrator/handlers/stage4-analysis.ts
        └─> orchestrator/services/analysis/analysis-orchestrator.ts
              ├─> orchestrator/services/analysis/phase-1-classifier.ts
              ├─> orchestrator/services/analysis/phase-2-scope.ts
              ├─> orchestrator/services/analysis/phase-3-expert.ts
              ├─> orchestrator/services/analysis/phase-4-synthesis.ts
              ├─> orchestrator/services/analysis/phase-5-assembly.ts
              └─> orchestrator/services/analysis/phase-6-rag-planning.ts

shared/regeneration/layers/layer-*.ts (4 files)
  └─> orchestrator/services/analysis/* (various phases)
```

**Total Import Sites:** 5 files (MEDIUM RISK)

---

## Appendix C: Automated Scripts

### Import Update Script (Stage 5)

```bash
#!/bin/bash
# scripts/refactor-stage5-imports.sh

set -e

echo "Updating Stage 5 imports..."

# Update main imports
find src/ -type f -name "*.ts" -print0 | xargs -0 sed -i \
  -e "s|services/stage5/generation-orchestrator|stages/stage5-generation/orchestrator|g" \
  -e "s|services/stage5/metadata-generator|stages/stage5-generation/utils/metadata-generator|g" \
  -e "s|services/stage5/section-batch-generator|stages/stage5-generation/utils/section-batch-generator|g" \
  -e "s|services/stage5/quality-validator|stages/stage5-generation/utils/quality-validator|g" \
  -e "s|services/stage5/cost-calculator|stages/stage5-generation/utils/cost-calculator|g" \
  -e "s|services/stage5/json-repair|stages/stage5-generation/utils/json-repair|g" \
  -e "s|services/stage5/field-name-fix|stages/stage5-generation/utils/field-name-fix|g" \
  -e "s|services/stage5/analysis-formatters|stages/stage5-generation/utils/analysis-formatters|g" \
  -e "s|services/stage5/sanitize-course-structure|stages/stage5-generation/utils/sanitize|g" \
  -e "s|services/stage5/qdrant-search|stages/stage5-generation/utils/qdrant-search|g" \
  -e "s|services/stage5/validators/|stages/stage5-generation/validators/|g"

# Update test imports
find tests/ -type f -name "*.test.ts" -print0 | xargs -0 sed -i \
  -e "s|../../../src/services/stage5/|../../../../../src/stages/stage5-generation/utils/|g" \
  -e "s|../../src/services/stage5/|../../../../src/stages/stage5-generation/utils/|g"

echo "✅ Stage 5 imports updated"
echo "Run: pnpm type-check to verify"
```

### Validation Script

```bash
#!/bin/bash
# scripts/validate-refactoring.sh

set -e

echo "Running refactoring validation..."

# Check for orphaned imports
echo "Checking for old imports..."
if grep -r "services/stage5" src/ 2>/dev/null; then
  echo "❌ ERROR: Old Stage 5 imports found!"
  exit 1
fi

if grep -r "orchestrator/services/analysis" src/ 2>/dev/null; then
  echo "❌ ERROR: Old Stage 4 imports found!"
  exit 1
fi

echo "✅ No orphaned imports"

# Type-check
echo "Running type-check..."
pnpm type-check || { echo "❌ Type-check failed!"; exit 1; }
echo "✅ Type-check passed"

# Run tests
echo "Running tests..."
pnpm test || { echo "❌ Tests failed!"; exit 1; }
echo "✅ Tests passed"

echo "✅ All validations passed!"
```

---

## Appendix D: Questions & Decisions Log

**Q1: Should we keep base-handler.ts in orchestrator/?**
**A1:** Yes. It's a shared base class used by all handlers. Keep in `orchestrator/handlers/base-handler.ts`.

**Q2: Should each stage have its own queue?**
**A2:** No. Keep single `course-generation` queue. Stages are just job types.

**Q3: Should we create stage-specific types in shared-types package?**
**A3:** No immediate change. Keep types in `@megacampus/shared-types` for now. Future refactor can move stage-specific types to stage directories.

**Q4: Should we move shared utilities (embeddings, qdrant) to stages/?**
**A4:** No. Keep in `shared/`. They're used across multiple stages.

**Q5: Should we consolidate stage5/field-name-fix and stage4/field-name-fix?**
**A5:** Yes, in future refactor. For now, keep duplicates to avoid scope creep.

**Q6: Should tests mirror src/ structure exactly?**
**A6:** Yes. `tests/unit/stages/{stage}/` mirrors `src/stages/{stage}/`.

---

## Appendix E: Lessons Learned (Post-Refactoring)

*To be filled after completion*

**What went well:**
- TBD

**What went poorly:**
- TBD

**Unexpected challenges:**
- TBD

**Time estimates vs actuals:**
- Phase 1: Est. 6-8h, Actual: ___h
- Phase 2: Est. 4-5h, Actual: ___h
- Phase 3: Est. 5-6h, Actual: ___h
- Phase 4: Est. 3-4h, Actual: ___h

**Recommendations for future refactors:**
- TBD

---

## Appendix F: References

### Internal Documentation
- `CLAUDE.md` - Agent orchestration rules
- `docs/Agents Ecosystem/AGENT-ORCHESTRATION.md` - Orchestration patterns
- `docs/Agents Ecosystem/ARCHITECTURE.md` - System architecture

### Relevant Specs
- `specs/008-generation-generation-json/` - Stage 5 specs
- `specs/T074-T075-RAG-integration/` - Stage 2 specs

### External Resources
- [BullMQ Best Practices](https://docs.bullmq.io/patterns/producer-consumer)
- [LangGraph State Management](https://langchain-ai.github.io/langgraphjs/how-tos/state-model/)
- [Clean Architecture (Martin, 2017)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

---

**End of Refactoring Plan**

*This document is a living plan. Update as execution progresses.*
