# Stage Unification - Visual Summary

## Before vs After Architecture

### BEFORE (Current State - Inconsistent)

```
packages/course-gen-platform/src/
├── orchestrator/
│   ├── handlers/
│   │   ├── document-processing.ts      [28KB, 803 lines] 🔴 MONOLITHIC
│   │   ├── stage3-summarization.ts     [11KB, 358 lines] 🟡 HANDLER + SERVICE
│   │   ├── stage4-analysis.ts          [19KB, 515 lines] 🟢 HANDLER + PHASES
│   │   └── stage5-generation.ts        [23KB, 659 lines] 🔴 HANDLER + ORPHANED
│   │
│   └── services/
│       ├── analysis/                    🟢 Stage 4 (structured)
│       │   ├── analysis-orchestrator.ts
│       │   ├── phase-1-classifier.ts
│       │   ├── phase-2-scope.ts
│       │   └── ... (7 phases total)
│       └── summarization-service.ts    🟡 Stage 3 service
│
└── services/                            🔴 WRONG LOCATION!
    └── stage5/                          🔴 ORPHANED!
        ├── generation-orchestrator.ts
        ├── metadata-generator.ts
        └── ... (20+ files)

❌ Problems:
- Stage 5 orphaned outside orchestrator
- Stage 2 monolithic (803 lines)
- Inconsistent naming conventions
- Mixed locations (orchestrator/ vs services/)
- Hard to navigate and discover code
```

---

### AFTER (Target State - Unified)

```
packages/course-gen-platform/src/
├── stages/                             ✅ UNIFIED LOCATION
│   │
│   ├── stage2-document-processing/
│   │   ├── orchestrator.ts             [~200 lines]
│   │   ├── handler.ts                  [~100 lines, thin wrapper]
│   │   ├── phases/
│   │   │   ├── phase-1-docling-conversion.ts
│   │   │   ├── phase-2-markdown-processing.ts
│   │   │   ├── phase-3-image-extraction.ts
│   │   │   ├── phase-4-chunking.ts
│   │   │   ├── phase-5-embedding.ts
│   │   │   └── phase-6-qdrant-upload.ts
│   │   └── README.md
│   │
│   ├── stage3-summarization/
│   │   ├── orchestrator.ts
│   │   ├── handler.ts
│   │   ├── phases/
│   │   │   ├── phase-1-validation.ts
│   │   │   ├── phase-2-summarization.ts
│   │   │   └── phase-3-metadata.ts
│   │   └── README.md
│   │
│   ├── stage4-analysis/
│   │   ├── orchestrator.ts
│   │   ├── handler.ts
│   │   ├── phases/
│   │   │   ├── phase-1-classifier.ts
│   │   │   ├── phase-2-scope.ts
│   │   │   ├── phase-3-expert.ts
│   │   │   ├── phase-4-synthesis.ts
│   │   │   ├── phase-5-assembly.ts
│   │   │   ├── phase-6-rag-planning.ts
│   │   │   └── phase-7-validation.ts
│   │   ├── utils/
│   │   │   ├── langchain-models.ts
│   │   │   ├── workflow-graph.ts
│   │   │   └── field-name-fix.ts
│   │   └── README.md
│   │
│   └── stage5-generation/
│       ├── orchestrator.ts
│       ├── handler.ts
│       ├── phases/
│       │   ├── phase-1-validation.ts
│       │   ├── phase-2-metadata.ts
│       │   ├── phase-3-sections.ts
│       │   ├── phase-4-quality.ts
│       │   └── phase-5-lessons.ts
│       ├── utils/
│       │   ├── metadata-generator.ts
│       │   ├── section-batch-generator.ts
│       │   ├── quality-validator.ts
│       │   ├── cost-calculator.ts
│       │   ├── json-repair.ts
│       │   └── ... (10+ utilities)
│       ├── validators/
│       │   ├── blooms-validators.ts
│       │   ├── duration-validator.ts
│       │   └── placeholder-validator.ts
│       └── README.md
│
└── orchestrator/
    ├── handlers/
    │   ├── base-handler.ts             ✅ KEPT (shared base)
    │   └── error-handler.ts            ✅ KEPT (shared error)
    ├── worker.ts                       ✅ UPDATED (imports from stages/)
    └── queue.ts                        ✅ KEPT (unchanged)

✅ Benefits:
- Consistent structure across all stages
- Easy to discover and navigate
- Clear separation of concerns
- Phases isolated in dedicated files
- All stage code co-located
- READMEs for documentation
```

---

## Migration Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         PHASE 1: Stage 5                        │
│  services/stage5/* → stages/stage5-generation/                  │
│  Risk: HIGH | Duration: 6-8h | Dependencies: 6 files            │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                         PHASE 2: Stage 4                        │
│  orchestrator/services/analysis/* → stages/stage4-analysis/     │
│  Risk: MEDIUM | Duration: 4-5h | Dependencies: 5 files          │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                         PHASE 3: Stage 2                        │
│  Split document-processing.ts → stages/stage2-*/phases/         │
│  Risk: MEDIUM | Duration: 5-6h | Dependencies: 1 file           │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                         PHASE 4: Stage 3                        │
│  orchestrator/services/summarization* → stages/stage3-*/        │
│  Risk: LOW | Duration: 3-4h | Dependencies: 2 files             │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                      ✅ UNIFIED STRUCTURE                       │
│  All stages in consistent src/stages/{stage-name}/ structure    │
│  Total Duration: 18-23 hours over 4 phases                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Risk Heat Map

```
         LOW RISK              MEDIUM RISK             HIGH RISK
    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
    │              │      │              │      │              │
    │   Phase 4    │      │   Phase 2    │      │   Phase 1    │
    │   Stage 3    │      │   Stage 4    │      │   Stage 5    │
    │              │      │              │      │              │
    │  3-4 hours   │      │   4-5 hours  │      │  6-8 hours   │
    │  2 files     │      │   5 files    │      │  6 files     │
    │              │      │              │      │              │
    └──────────────┘      └──────────────┘      └──────────────┘
          ✅                     ⚠️                     🔴

    ┌──────────────┐
    │              │
    │   Phase 3    │
    │   Stage 2    │
    │              │
    │  5-6 hours   │
    │  1 file      │
    │              │
    └──────────────┘
         ⚠️
```

---

## Code Organization Pattern (All Stages)

```
src/stages/{stage-name}/
├── orchestrator.ts          ← Main orchestration logic
│   └── execute(input) → result
│
├── handler.ts               ← BullMQ job handler (thin wrapper)
│   └── process(job) → orchestrator.execute()
│
├── phases/                  ← Phase implementations
│   ├── phase-1-*.ts
│   ├── phase-2-*.ts
│   └── phase-N-*.ts
│
├── utils/                   ← Stage-specific utilities
│   └── *.ts
│
├── validators/              ← Stage-specific validators (if needed)
│   └── *.ts
│
├── types.ts                 ← Stage-specific types (if needed)
└── README.md                ← Stage documentation

tests/unit/stages/{stage-name}/
├── orchestrator.test.ts
├── handler.test.ts
├── phases/
│   └── phase-*.test.ts
└── utils/
    └── *.test.ts
```

---

## Import Flow (Before vs After)

### BEFORE (Inconsistent)

```typescript
// Stage 5 imports (ORPHANED)
import { GenerationOrchestrator } from '../../services/stage5/generation-orchestrator';
import { QualityValidator } from '../../services/stage5/quality-validator';

// Stage 4 imports (Inside orchestrator)
import { runAnalysis } from '../orchestrator/services/analysis/analysis-orchestrator';

// Stage 2 imports (Monolithic)
import { DocumentProcessingHandler } from '../orchestrator/handlers/document-processing';

// Stage 3 imports (Mixed)
import { summarize } from '../orchestrator/services/summarization-service';
```

### AFTER (Consistent)

```typescript
// All stages follow same pattern
import { Stage2Orchestrator } from '../stages/stage2-document-processing/orchestrator';
import { Stage3Orchestrator } from '../stages/stage3-summarization/orchestrator';
import { Stage4Orchestrator } from '../stages/stage4-analysis/orchestrator';
import { Stage5Orchestrator } from '../stages/stage5-generation/orchestrator';

// Phases follow predictable paths
import { phase1Validate } from '../stages/stage5-generation/phases/phase-1-validation';
import { phase2Metadata } from '../stages/stage5-generation/phases/phase-2-metadata';

// Utilities follow consistent structure
import { calculateCost } from '../stages/stage5-generation/utils/cost-calculator';
import { repairJSON } from '../stages/stage5-generation/utils/json-repair';
```

---

## Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| **File Locations** | 4 different | 1 unified | 1 |
| **Largest Handler** | 803 lines | <200 lines | <200 |
| **Import Consistency** | 30% | 100% | 100% |
| **Discoverability Time** | ~5 min | <30 sec | <60 sec |
| **Phase Isolation** | 25% | 100% | 100% |
| **Documentation** | Sparse | Complete | Complete |

---

## Execution Roadmap

```
Week 1: Planning + Phase 1
┌──────────────────────────────────────────────────┐
│ Mon    │ Tue       │ Wed       │ Thu  │ Fri      │
├────────┼───────────┼───────────┼──────┼──────────┤
│ Plan   │ Phase 1   │ Phase 1   │ Rest │ Review   │
│ 4h     │ Part 1/2  │ Part 2/2  │      │ 2h       │
│        │ 6h        │ 6h        │      │          │
└────────┴───────────┴───────────┴──────┴──────────┘

Week 2: Phases 2-3
┌──────────────────────────────────────────────────┐
│ Mon    │ Tue       │ Wed       │ Thu  │ Fri      │
├────────┼───────────┼───────────┼──────┼──────────┤
│ Phase 2│ Review    │ Phase 3   │ Phase│ Review   │
│ 4-5h   │ Tests 2h  │ Part 1/2  │ 3    │ Tests 2h │
│        │           │ 5h        │ 5h   │          │
└────────┴───────────┴───────────┴──────┴──────────┘

Week 3: Phase 4 + Finalization
┌──────────────────────────────────────────────────┐
│ Mon    │ Tue       │ Wed       │ Thu  │ Fri      │
├────────┼───────────┼───────────┼──────┼──────────┤
│ Phase 4│ Review    │ Full Test │ Docs │ Deploy   │
│ 3-4h   │ 2h        │ Suite 4h  │ 4h   │ Done!    │
└────────┴───────────┴───────────┴──────┴──────────┘

Total: ~38 hours over 3 weeks (part-time)
```

---

## Quick Decision Tree

```
Start Refactoring
    │
    ├─→ High-risk first? ──YES─→ Phase 1 (Stage 5)
    │                             ↓
    ├─→ Already structured? ─YES→ Phase 2 (Stage 4)
    │                             ↓
    ├─→ Need to split? ──────YES→ Phase 3 (Stage 2)
    │                             ↓
    └─→ Simplest last ──────YES─→ Phase 4 (Stage 3)
                                  ↓
                             ✅ Done!
```

---

## File Counts

| Stage | Before Files | After Files | Change |
|-------|-------------|-------------|--------|
| Stage 2 | 1 (monolithic) | 8 (split) | +700% |
| Stage 3 | 3 (scattered) | 5 (unified) | +67% |
| Stage 4 | 15 (nested) | 15 (flat) | 0% (moved) |
| Stage 5 | 20 (orphaned) | 20 (unified) | 0% (moved) |
| **Total** | **39** | **48** | **+23%** |

*Note: More files, but each <200 lines (was: 803 lines max)*

---

## Related Documentation

- **Full Plan:** [STAGE-UNIFICATION-PLAN.md](./STAGE-UNIFICATION-PLAN.md) (1500 lines)
- **Quick Reference:** [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) (290 lines)
- **README:** [README.md](./README.md) (110 lines)

---

*Visual summary for [STAGE-UNIFICATION-PLAN.md](./STAGE-UNIFICATION-PLAN.md)*
