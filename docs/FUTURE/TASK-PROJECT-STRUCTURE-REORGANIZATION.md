# Project Structure Reorganization - Course Generation Platform

**Status**: 📋 SPECIFICATION (Not Started)
**Priority**: P2 - High Impact, Medium Urgency
**Estimated Effort**: 16-24 hours
**Risk Level**: HIGH (affects 200+ files, requires careful import updates)

---

## Problem Statement

The current project structure (`packages/course-gen-platform/src/`) has files for 5 different stages scattered across multiple directories, making it difficult to:

1. **Navigate**: Files for Stage 0, 1, 2, 3, 4, 5 are mixed together in `orchestrator/`, `server/`, `services/`, and `shared/`
2. **Understand**: No clear separation between stage-specific logic and shared infrastructure
3. **Maintain**: Modifications to one stage require searching across multiple folders
4. **Scale**: Adding new stages or modifying existing ones is error-prone

### Current 5 Stages

1. **Stage 0 (Initialize)**: Course creation, initial setup
2. **Stage 1 (Document Processing)**: Upload documents, create file catalog
3. **Stage 2 (Vectorization)**: Create vector database (Qdrant), embeddings (Jina)
4. **Stage 3 (Summarization)**: Generate document summaries
5. **Stage 4 (Analysis)**: Analyze course requirements, generate analysis result
6. **Stage 5 (Generation)**: Generate course structure JSON

---

## Current Structure Analysis

### Current Directory Layout

```
src/
├── orchestrator/               # BullMQ orchestration layer
│   ├── handlers/              # Job handlers for each stage (mixed)
│   │   ├── initialize.ts             # Stage 0
│   │   ├── document-processing.ts    # Stage 1
│   │   ├── stage3-summarization.ts   # Stage 3
│   │   ├── stage4-analysis.ts        # Stage 4
│   │   └── (missing stage5-generation.ts)
│   ├── services/              # Stage-specific business logic (mixed)
│   │   ├── analysis/                 # Stage 4 only
│   │   ├── generation/               # Stage 5 only
│   │   ├── llm-client.ts             # Shared
│   │   ├── quality-validator.ts      # Stage 5
│   │   ├── summarization-service.ts  # Stage 3
│   │   └── token-estimator.ts        # Shared
│   ├── strategies/            # Stage-specific strategies
│   │   └── hierarchical-chunking.ts  # Stage 3
│   └── workers/               # Background workers
│       └── stage3-summarization.worker.ts
├── server/                    # tRPC API layer
│   ├── routers/               # API endpoints per stage (mixed)
│   │   ├── analysis.ts               # Stage 4
│   │   ├── generation.ts             # Stage 5
│   │   ├── summarization.ts          # Stage 3
│   │   └── jobs.ts                   # All stages
│   └── services/              # Server-side services
│       └── generation/               # Stage 5 validators
├── services/                  # Stage-specific services (NEW, only Stage 5)
│   └── stage5/
│       ├── metadata-generator.ts
│       ├── section-batch-generator.ts
│       ├── json-repair.ts
│       └── validators/
├── shared/                    # Truly shared infrastructure
│   ├── cache/                 # Redis cache (shared)
│   ├── concurrency/           # Tier limits (shared)
│   ├── config/                # Environment config (shared)
│   ├── docling/               # Stage 1 (should move)
│   ├── embeddings/            # Stage 2 (should move)
│   ├── logger/                # Shared
│   ├── qdrant/                # Stage 2 (should move)
│   ├── regeneration/          # Stage 4/5 (should move)
│   ├── supabase/              # Shared
│   ├── types/                 # Shared types
│   ├── utils/                 # Shared utilities
│   └── validation/            # Shared validation
└── types/                     # Global types
```

### Problems Identified

1. **❌ Scattered Stage Files**: Stage logic split across `orchestrator/handlers/`, `orchestrator/services/`, `server/routers/`, `services/`
2. **❌ Inconsistent Naming**: `stage3-`, `stage4-`, but Stage 5 uses `generation/` folder
3. **❌ Misplaced Shared Code**: Docling, embeddings, Qdrant in `/shared/` but stage-specific
4. **❌ Duplicate `services/` Folders**: Three different `services/` directories
5. **❌ No Clear Stage Ownership**: Hard to see what files belong to each stage

---

## Proposed Target Structure

### New Directory Layout (Stage-Based Architecture)

```
src/
├── stages/                           # NEW: All stage-specific code
│   ├── stage0-initialize/
│   │   ├── handlers/
│   │   │   └── initialize.handler.ts
│   │   ├── services/
│   │   │   └── course-initializer.ts
│   │   ├── routers/
│   │   │   └── initialize.router.ts  # tRPC endpoints
│   │   └── types/
│   │       └── initialize.types.ts
│   │
│   ├── stage1-document-processing/
│   │   ├── handlers/
│   │   │   └── document-processing.handler.ts
│   │   ├── services/
│   │   │   ├── docling-client.ts     # MOVE FROM shared/docling/
│   │   │   └── file-catalog.ts
│   │   ├── routers/
│   │   │   └── documents.router.ts
│   │   └── types/
│   │
│   ├── stage2-vectorization/
│   │   ├── handlers/
│   │   │   └── vectorization.handler.ts
│   │   ├── services/
│   │   │   ├── embeddings/           # MOVE FROM shared/embeddings/
│   │   │   │   ├── jina-client.ts
│   │   │   │   ├── generate.ts
│   │   │   │   └── markdown-chunker.ts
│   │   │   ├── qdrant/               # MOVE FROM shared/qdrant/
│   │   │   │   ├── client.ts
│   │   │   │   ├── lifecycle.ts
│   │   │   │   └── upload.ts
│   │   │   └── vectorization-orchestrator.ts
│   │   ├── routers/
│   │   │   └── vectorization.router.ts
│   │   └── types/
│   │
│   ├── stage3-summarization/
│   │   ├── handlers/
│   │   │   └── summarization.handler.ts
│   │   ├── services/
│   │   │   ├── summarization-service.ts  # MOVE FROM orchestrator/services/
│   │   │   └── hierarchical-chunking.ts  # MOVE FROM orchestrator/strategies/
│   │   ├── workers/
│   │   │   └── summarization.worker.ts
│   │   ├── routers/
│   │   │   └── summarization.router.ts
│   │   └── types/
│   │
│   ├── stage4-analysis/
│   │   ├── handlers/
│   │   │   └── analysis.handler.ts
│   │   ├── services/
│   │   │   ├── analysis-orchestrator.ts  # MOVE FROM orchestrator/services/analysis/
│   │   │   ├── phase-1-classifier.ts
│   │   │   ├── phase-2-scope.ts
│   │   │   ├── phase-3-expert.ts
│   │   │   ├── phase-4-synthesis.ts
│   │   │   ├── phase-5-assembly.ts
│   │   │   ├── phase-6-rag-planning.ts
│   │   │   ├── workflow-graph.ts
│   │   │   ├── analysis-validators.ts
│   │   │   ├── field-name-fix.ts
│   │   │   ├── contextual-language.ts
│   │   │   └── research-flag-detector.ts
│   │   ├── routers/
│   │   │   └── analysis.router.ts
│   │   ├── types/
│   │   └── __tests__/
│   │       ├── json-repair.test.ts
│   │       ├── partial-regenerator.test.ts
│   │       └── revision-chain.test.ts
│   │
│   └── stage5-generation/
│       ├── handlers/
│       │   └── generation.handler.ts
│       ├── services/
│       │   ├── generation-orchestrator.ts   # MOVE FROM orchestrator/services/generation/
│       │   ├── generation-phases.ts
│       │   ├── metadata-generator.ts        # MOVE FROM services/stage5/
│       │   ├── section-batch-generator.ts
│       │   ├── json-repair.ts
│       │   ├── field-name-fix.ts
│       │   ├── sanitize-course-structure.ts
│       │   └── validators/
│       │       ├── blooms-validators.ts
│       │       ├── duration-validator.ts
│       │       ├── placeholder-validator.ts
│       │       ├── minimum-lessons-validator.ts
│       │       └── topic-specificity-validator.ts
│       ├── routers/
│       │   └── generation.router.ts
│       ├── types/
│       │   └── generation-state.ts
│       └── __tests__/
│
├── infrastructure/                   # RENAMED FROM orchestrator/
│   ├── queue/                        # BullMQ queue management
│   │   ├── queue.ts                  # MOVE FROM orchestrator/queue.ts
│   │   ├── worker.ts                 # MOVE FROM orchestrator/worker.ts
│   │   ├── job-status-tracker.ts     # MOVE FROM orchestrator/job-status-tracker.ts
│   │   └── metrics.ts
│   ├── handlers/                     # Base handler infrastructure only
│   │   ├── base-handler.ts
│   │   ├── error-handler.ts
│   │   └── test-handler.ts
│   ├── services/                     # Shared orchestration services
│   │   ├── llm-client.ts             # Shared LLM client
│   │   ├── token-estimator.ts        # Shared token estimation
│   │   ├── cost-calculator.ts        # Shared cost calculation
│   │   ├── quality-validator.ts      # Shared quality validation
│   │   ├── stage-barrier.ts          # Stage transition barriers
│   │   └── langchain/
│   │       ├── models.ts
│   │       └── observability.ts
│   └── types/
│       ├── tier.ts
│       └── error-logs.ts
│
├── api/                              # RENAMED FROM server/
│   ├── routers/
│   │   ├── index.ts                  # Aggregates all stage routers
│   │   ├── admin.router.ts
│   │   ├── billing.router.ts
│   │   └── jobs.router.ts            # Cross-stage job queries
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── authorize.ts
│   │   └── rate-limit.ts
│   ├── procedures.ts                 # tRPC procedure definitions
│   ├── trpc.ts                       # tRPC setup
│   ├── app-router.ts                 # Express app
│   ├── index.ts                      # Server entry point
│   └── errors/
│       ├── error-formatter.ts
│       ├── typed-errors.ts
│       └── index.ts
│
├── shared/                           # CLEANED: Only truly shared code
│   ├── cache/                        # Redis cache
│   ├── concurrency/                  # Tier limits
│   ├── config/                       # Environment validation
│   ├── logger/                       # Pino logger
│   ├── supabase/                     # Supabase client
│   ├── types/                        # Shared types
│   ├── utils/                        # Shared utilities
│   └── validation/                   # Shared validators
│
└── types/                            # Global type definitions
    └── index.ts
```

---

## Reorganization Principles

### 1. Stage-Based Organization

Each stage becomes a self-contained module with all its code co-located:

```
stages/stageN-name/
├── handlers/        # BullMQ job handlers (orchestrator layer)
├── services/        # Business logic (service layer)
├── routers/         # tRPC endpoints (API layer)
├── types/           # Stage-specific types
└── __tests__/       # Stage-specific tests
```

**Benefits**:
- ✅ All Stage N code in one place
- ✅ Easy to understand stage boundaries
- ✅ Clear ownership and responsibilities
- ✅ Easier to modify/extend individual stages

### 2. Layer Separation

Within each stage, maintain clear layer separation:

- **Handlers**: Orchestration layer (BullMQ job processing)
- **Services**: Business logic layer (core stage logic)
- **Routers**: API layer (tRPC endpoints)
- **Types**: Type definitions for this stage

### 3. Shared Infrastructure

Move truly shared code to `/shared/`:
- ✅ Keep: logger, cache, config, supabase, validation, utils
- ❌ Move out: docling (Stage 1), embeddings (Stage 2), qdrant (Stage 2), regeneration (Stage 4/5)

### 4. Naming Consistency

- Stage folders: `stageN-descriptive-name/`
- Handlers: `*.handler.ts`
- Routers: `*.router.ts`
- Services: descriptive names without "stage" prefix

---

## Migration Strategy

### Phase 1: Preparation (2 hours)

**Goal**: Understand dependencies and create migration plan

1. **Audit Current Imports**
   ```bash
   # Find all imports across the codebase
   grep -r "from.*orchestrator" src/ > imports-audit.txt
   grep -r "from.*server" src/ >> imports-audit.txt
   grep -r "from.*services" src/ >> imports-audit.txt
   grep -r "from.*shared" src/ >> imports-audit.txt
   ```

2. **Create Import Mapping**
   - Document all current import paths
   - Map to new import paths
   - Identify circular dependencies

3. **Backup Current State**
   ```bash
   git checkout -b backup/pre-reorganization
   git commit -m "backup: snapshot before structure reorganization"
   git checkout -b feature/project-reorganization
   ```

### Phase 2: Infrastructure Layer (4 hours)

**Goal**: Rename `orchestrator/` → `infrastructure/` and clean up

1. **Move Core Orchestration**
   ```bash
   mkdir -p src/infrastructure/queue
   mv src/orchestrator/queue.ts src/infrastructure/queue/
   mv src/orchestrator/worker.ts src/infrastructure/queue/
   mv src/orchestrator/job-status-tracker.ts src/infrastructure/queue/
   mv src/orchestrator/metrics.ts src/infrastructure/queue/
   ```

2. **Move Shared Services**
   ```bash
   mkdir -p src/infrastructure/services
   mv src/orchestrator/services/llm-client.ts src/infrastructure/services/
   mv src/orchestrator/services/token-estimator.ts src/infrastructure/services/
   mv src/orchestrator/services/cost-calculator.ts src/infrastructure/services/
   mv src/orchestrator/services/quality-validator.ts src/infrastructure/services/
   mv src/orchestrator/services/stage-barrier.ts src/infrastructure/services/
   ```

3. **Update Imports**
   ```bash
   # Use find-and-replace in VS Code:
   # from '@/orchestrator/queue' → from '@/infrastructure/queue/queue'
   # from '@/orchestrator/worker' → from '@/infrastructure/queue/worker'
   ```

4. **Verify Build**
   ```bash
   pnpm type-check
   pnpm build
   ```

### Phase 3: API Layer (3 hours)

**Goal**: Rename `server/` → `api/` and extract stage routers

1. **Rename Server Directory**
   ```bash
   mv src/server src/api
   ```

2. **Update Package Imports**
   ```bash
   # Update all @/server/* imports to @/api/*
   find src/ -type f -name "*.ts" -exec sed -i 's|from "@/server/|from "@/api/|g' {} +
   find src/ -type f -name "*.ts" -exec sed -i "s|from '@/server/|from '@/api/|g" {} +
   ```

3. **Verify Build**
   ```bash
   pnpm type-check
   pnpm build
   ```

### Phase 4: Create Stage Directories (2 hours)

**Goal**: Create all stage folder structures

```bash
# Create all stage directories
for stage in stage0-initialize stage1-document-processing stage2-vectorization stage3-summarization stage4-analysis stage5-generation; do
  mkdir -p src/stages/$stage/{handlers,services,routers,types,__tests__}
done
```

### Phase 5: Migrate Stages One-by-One (12 hours total, 2h per stage)

**Goal**: Move each stage independently, validate after each

#### Stage 0 - Initialize (2 hours)

1. **Move Handler**
   ```bash
   mv src/infrastructure/handlers/initialize.ts src/stages/stage0-initialize/handlers/initialize.handler.ts
   ```

2. **Update Imports in Handler**
   - Update relative imports to new paths
   - Update exports

3. **Update Worker Registration**
   ```typescript
   // src/infrastructure/queue/worker.ts
   import { handleInitialize } from '@/stages/stage0-initialize/handlers/initialize.handler'
   ```

4. **Verify Build**
   ```bash
   pnpm type-check
   ```

#### Stage 1 - Document Processing (2 hours)

1. **Move Files**
   ```bash
   # Handler
   mv src/infrastructure/handlers/document-processing.ts \
      src/stages/stage1-document-processing/handlers/document-processing.handler.ts

   # Services (from shared)
   mv src/shared/docling src/stages/stage1-document-processing/services/
   ```

2. **Update Imports**
   ```typescript
   // Old: from '@/shared/docling/client'
   // New: from '@/stages/stage1-document-processing/services/docling/client'
   ```

3. **Verify Build**

#### Stage 2 - Vectorization (3 hours)

1. **Move Files**
   ```bash
   # Services (from shared)
   mv src/shared/embeddings src/stages/stage2-vectorization/services/
   mv src/shared/qdrant src/stages/stage2-vectorization/services/
   ```

2. **Update Imports**
   ```typescript
   // Old: from '@/shared/embeddings/generate'
   // New: from '@/stages/stage2-vectorization/services/embeddings/generate'

   // Old: from '@/shared/qdrant/client'
   // New: from '@/stages/stage2-vectorization/services/qdrant/client'
   ```

3. **Create Handler** (if missing)
   ```typescript
   // src/stages/stage2-vectorization/handlers/vectorization.handler.ts
   export async function handleVectorization(job: Job) {
     // Implement handler
   }
   ```

4. **Verify Build**

#### Stage 3 - Summarization (2 hours)

1. **Move Files**
   ```bash
   # Handler
   mv src/infrastructure/handlers/stage3-summarization.ts \
      src/stages/stage3-summarization/handlers/summarization.handler.ts

   # Services
   mv src/infrastructure/services/summarization-service.ts \
      src/stages/stage3-summarization/services/

   mv src/infrastructure/strategies/hierarchical-chunking.ts \
      src/stages/stage3-summarization/services/

   # Worker
   mv src/infrastructure/workers/stage3-summarization.worker.ts \
      src/stages/stage3-summarization/workers/summarization.worker.ts

   # Router
   mv src/api/routers/summarization.ts \
      src/stages/stage3-summarization/routers/summarization.router.ts
   ```

2. **Update Imports**

3. **Verify Build**

#### Stage 4 - Analysis (2 hours)

1. **Move Files**
   ```bash
   # Handler
   mv src/infrastructure/handlers/stage4-analysis.ts \
      src/stages/stage4-analysis/handlers/analysis.handler.ts

   # Services (entire folder)
   mv src/infrastructure/services/analysis/* \
      src/stages/stage4-analysis/services/

   # Router
   mv src/api/routers/analysis.ts \
      src/stages/stage4-analysis/routers/analysis.router.ts
   ```

2. **Update Imports**

3. **Verify Build**

#### Stage 5 - Generation (2 hours)

1. **Move Files**
   ```bash
   # Services from orchestrator
   mv src/infrastructure/services/generation/* \
      src/stages/stage5-generation/services/

   # Services from services/stage5
   mv src/services/stage5/* \
      src/stages/stage5-generation/services/

   # Router
   mv src/api/routers/generation.ts \
      src/stages/stage5-generation/routers/generation.router.ts

   # Validators from server
   mv src/api/services/generation/validators/* \
      src/stages/stage5-generation/services/validators/
   ```

2. **Update Imports**

3. **Create Handler** (if missing)

4. **Verify Build**

### Phase 6: Cleanup & Validation (3 hours)

1. **Remove Empty Directories**
   ```bash
   find src/ -type d -empty -delete
   ```

2. **Remove Old Folders**
   ```bash
   rm -rf src/services  # Should be empty now
   rm -rf src/orchestrator  # Should be empty now
   ```

3. **Update Path Aliases**
   ```json
   // tsconfig.json
   {
     "paths": {
       "@/*": ["./src/*"],
       "@/stages/*": ["./src/stages/*"],
       "@/infrastructure/*": ["./src/infrastructure/*"],
       "@/api/*": ["./src/api/*"],
       "@/shared/*": ["./src/shared/*"]
     }
   }
   ```

4. **Run Full Test Suite**
   ```bash
   pnpm type-check
   pnpm lint
   pnpm test:unit
   pnpm test:integration
   pnpm build
   ```

5. **Update Documentation**
   - Update README.md with new structure
   - Update CLAUDE.md with new paths
   - Update architecture diagrams

---

## Import Path Examples

### Before → After

```typescript
// Stage 0
- from '@/orchestrator/handlers/initialize'
+ from '@/stages/stage0-initialize/handlers/initialize.handler'

// Stage 1
- from '@/shared/docling/client'
+ from '@/stages/stage1-document-processing/services/docling/client'

// Stage 2
- from '@/shared/embeddings/generate'
+ from '@/stages/stage2-vectorization/services/embeddings/generate'

- from '@/shared/qdrant/client'
+ from '@/stages/stage2-vectorization/services/qdrant/client'

// Stage 3
- from '@/orchestrator/services/summarization-service'
+ from '@/stages/stage3-summarization/services/summarization-service'

- from '@/server/routers/summarization'
+ from '@/stages/stage3-summarization/routers/summarization.router'

// Stage 4
- from '@/orchestrator/services/analysis/analysis-orchestrator'
+ from '@/stages/stage4-analysis/services/analysis-orchestrator'

- from '@/server/routers/analysis'
+ from '@/stages/stage4-analysis/routers/analysis.router'

// Stage 5
- from '@/services/stage5/metadata-generator'
+ from '@/stages/stage5-generation/services/metadata-generator'

- from '@/orchestrator/services/generation/generation-orchestrator'
+ from '@/stages/stage5-generation/services/generation-orchestrator'

- from '@/server/routers/generation'
+ from '@/stages/stage5-generation/routers/generation.router'

// Infrastructure
- from '@/orchestrator/queue'
+ from '@/infrastructure/queue/queue'

- from '@/orchestrator/worker'
+ from '@/infrastructure/queue/worker'

- from '@/orchestrator/services/llm-client'
+ from '@/infrastructure/services/llm-client'

// API
- from '@/server/middleware/auth'
+ from '@/api/middleware/auth'

- from '@/server/routers/admin'
+ from '@/api/routers/admin.router'
```

---

## Risk Mitigation

### High-Risk Areas

1. **Circular Dependencies**
   - **Risk**: Stages depend on each other
   - **Mitigation**: Audit dependencies first, extract shared interfaces to `/shared/types/`

2. **Import Path Updates**
   - **Risk**: Missing or incorrect import updates (200+ files)
   - **Mitigation**: Use automated find-replace, verify with TypeScript compiler after each phase

3. **Test Failures**
   - **Risk**: Tests break due to path changes
   - **Mitigation**: Update test imports alongside source imports, run tests after each stage

4. **Runtime Errors**
   - **Risk**: Dynamic imports or require() not caught by TypeScript
   - **Mitigation**: Run integration tests after each phase, test all job handlers

### Safety Measures

1. **Git Branch Strategy**
   ```bash
   backup/pre-reorganization  # Snapshot before changes
   feature/project-reorganization  # Working branch
   ```

2. **Incremental Validation**
   - Run `pnpm type-check` after each file move
   - Run `pnpm build` after each phase
   - Run tests after each stage migration

3. **Rollback Plan**
   ```bash
   git checkout backup/pre-reorganization
   git branch -D feature/project-reorganization
   ```

---

## Success Criteria

### Functional Requirements

- ✅ All TypeScript compilation passes (`pnpm type-check`)
- ✅ All linting passes (`pnpm lint`)
- ✅ All unit tests pass (`pnpm test:unit`)
- ✅ All integration tests pass (`pnpm test:integration`)
- ✅ Production build succeeds (`pnpm build`)
- ✅ No runtime errors in development (`pnpm dev`)

### Structural Requirements

- ✅ All stage files co-located in `src/stages/stageN-name/`
- ✅ No stage-specific code in `/shared/` (only truly shared infrastructure)
- ✅ Consistent naming: `*.handler.ts`, `*.router.ts`, `*.service.ts`
- ✅ Clear layer separation: handlers, services, routers, types
- ✅ No empty directories remaining

### Documentation Requirements

- ✅ README.md updated with new structure
- ✅ CLAUDE.md updated with new file paths
- ✅ Architecture diagrams reflect new organization
- ✅ Migration guide document created (this file)

---

## Timeline Estimate

| Phase | Description | Time | Cumulative |
|-------|-------------|------|------------|
| 1 | Preparation & Audit | 2h | 2h |
| 2 | Infrastructure Layer | 4h | 6h |
| 3 | API Layer | 3h | 9h |
| 4 | Create Stage Directories | 2h | 11h |
| 5.1 | Stage 0 Migration | 2h | 13h |
| 5.2 | Stage 1 Migration | 2h | 15h |
| 5.3 | Stage 2 Migration | 3h | 18h |
| 5.4 | Stage 3 Migration | 2h | 20h |
| 5.5 | Stage 4 Migration | 2h | 22h |
| 5.6 | Stage 5 Migration | 2h | 24h |
| 6 | Cleanup & Validation | 3h | 27h |

**Total Estimated Time**: 24-27 hours (3-4 full work days)

**Recommended Approach**:
- **Option A**: 2 developers × 2 days (parallel stage migration)
- **Option B**: 1 developer × 3-4 days (sequential migration with breaks for validation)

---

## Post-Migration Benefits

### Developer Experience

1. **Faster Navigation**
   - "Where is Stage 4 analysis logic?" → `src/stages/stage4-analysis/`
   - "Where is the summarization router?" → `src/stages/stage3-summarization/routers/`

2. **Clearer Dependencies**
   - Stage boundaries explicit
   - Shared infrastructure clearly separated

3. **Easier Onboarding**
   - New developers can understand structure immediately
   - Documentation matches code organization

### Maintenance

1. **Isolated Changes**
   - Modify Stage 3 without affecting Stage 4
   - Add new stages without disrupting existing ones

2. **Safer Refactoring**
   - Clear boundaries reduce risk of unintended changes
   - Easier to identify breaking changes

3. **Better Testing**
   - Co-located tests with stage code
   - Stage-specific test suites

### Scalability

1. **Easy to Add Stages**
   - New stage = new folder in `src/stages/`
   - Copy structure from existing stage

2. **Microservice Ready**
   - Each stage could become independent service
   - Clear API boundaries (routers)

3. **Team Ownership**
   - Assign teams to specific stages
   - Clear ownership and responsibilities

---

## Notes

- **Priority**: This is a P2 task - high impact but not blocking current development
- **Timing**: Best done between major features or before v1.0 release
- **Preparation**: Requires full test coverage before starting (currently ~60% coverage)
- **Communication**: Coordinate with team to avoid conflicts during migration
- **Testing**: Manual QA testing recommended after completion to catch any runtime issues

---

## References

- Current structure audit: See "Current Structure Analysis" section above
- Similar patterns: NestJS modules, Django apps, Rails engines
- Best practices: Domain-driven design, feature-based architecture
