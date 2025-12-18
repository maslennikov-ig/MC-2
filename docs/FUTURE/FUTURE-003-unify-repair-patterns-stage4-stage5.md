# FUTURE-003: Unify JSON Repair Patterns Across Stage 4 & Stage 5

**Priority**: LOW (Post-implementation cleanup)
**Effort**: 8-12 hours
**Context**: Create shared repair utilities package after FUTURE-001 & FUTURE-002
**Dependency**: FUTURE-001 ✅, FUTURE-002 ✅

---

## OBJECTIVE

Extract common JSON repair patterns from Stage 4 (Analysis) and Stage 5 (Generation) into shared `@megacampus/json-repair` package to avoid code duplication and ensure consistency.

---

## PROBLEM STATEMENT

After implementing RT-005 in both Stage 4 and Stage 5, we will have:

**Duplicated Code**:
- `json-repair.ts` (FSM strategies + jsonrepair wrapper) - duplicated in both stages
- `field-name-fix.ts` (camelCase ↔ snake_case) - duplicated in both stages
- Multi-step pipeline logic (`regenerateWithCritique`) - potentially duplicated
- Repair metrics tracking - duplicated monitoring code

**Stage-Specific Differences**:
- Stage 4: No token budget constraints, semantic validation for analysis
- Stage 5: RT-003 token budgets (120K total, 90K input), RT-004 quality gates

---

## PROPOSED SOLUTION

### Option 1: Shared Package (RECOMMENDED)

**Create**: `packages/json-repair/` (new package)

**Structure**:
```
packages/json-repair/
├── src/
│   ├── core/
│   │   ├── fsm-repair.ts          # jsonrepair wrapper + custom fallback
│   │   ├── field-name-fix.ts      # camelCase ↔ snake_case
│   │   ├── error-classifier.ts    # Parse, type, missing, constraint, semantic
│   │   └── repair-result.ts       # Common types
│   ├── strategies/
│   │   ├── multi-step-pipeline.ts # regenerateWithCritique
│   │   ├── partial-regeneration.ts # Field-level atomicity (from Stage 4)
│   │   └── llm-semantic-repair.ts # LLM-based repair with prompts
│   ├── monitoring/
│   │   ├── metrics.ts             # Prometheus/Pino metrics
│   │   └── cost-tracking.ts       # Repair cost calculation
│   ├── adapters/
│   │   ├── stage4-adapter.ts      # Analysis-specific config
│   │   └── stage5-adapter.ts      # Generation-specific config (RT-003 budgets)
│   └── index.ts
├── tests/
│   ├── fsm-repair.test.ts
│   ├── multi-step.test.ts
│   └── integration.test.ts
├── package.json
└── README.md
```

**Usage in Stage 4**:
```typescript
import { repairJSON, createStage4Adapter } from '@megacampus/json-repair';

const adapter = createStage4Adapter({
  enableSemanticValidation: true,
  enableMultiStep: true
});

const result = await repairJSON(rawJSON, schema, adapter);
```

**Usage in Stage 5**:
```typescript
import { repairJSON, createStage5Adapter } from '@megacampus/json-repair';

const adapter = createStage5Adapter({
  tokenBudget: { total: 120_000, input: 90_000 }, // RT-003
  qualityThresholds: { metadata: 0.85, sections: 0.75 }, // RT-004
  modelRouting: RT001_CONFIG // RT-001
});

const result = await repairJSON(rawJSON, schema, adapter);
```

**Benefits**:
- ✅ Single source of truth for repair logic
- ✅ Stage-specific adapters for customization
- ✅ Easier to test (isolated package)
- ✅ Reusable for future stages (Stage 6, Stage 7)
- ✅ Clear separation of concerns

**Drawbacks**:
- ⚠️ Additional package complexity (new dependency)
- ⚠️ Migration effort (8-12 hours)

---

### Option 2: Shared Utilities Folder (SIMPLER)

**Create**: `packages/shared-utils/src/json-repair/` (in existing shared-utils)

**Structure**: Same as Option 1, but within `shared-utils` package

**Benefits**:
- ✅ No new package
- ✅ Simpler dependency management

**Drawbacks**:
- ⚠️ Couples repair logic with other utilities
- ⚠️ Less clear ownership

---

## DECISION CRITERIA

**Choose Option 1 IF**:
- Stage 6-7 likely to need JSON repair
- Team wants clear package boundaries
- Willing to invest 8-12 hours in extraction

**Choose Option 2 IF**:
- Only Stage 4-5 need JSON repair
- Prefer simplicity over modularity
- Want quick cleanup (4-6 hours)

---

## IMPLEMENTATION ROADMAP

### Phase 1: Extraction (6 hours)

**Extract Common Code**:
- [ ] Create `@megacampus/json-repair` package
- [ ] Move `fsm-repair.ts` (jsonrepair wrapper + custom fallback)
- [ ] Move `field-name-fix.ts`
- [ ] Extract multi-step pipeline logic
- [ ] Extract repair metrics

### Phase 2: Adapters (4 hours)

**Create Stage-Specific Adapters**:
- [ ] `stage4-adapter.ts`: Semantic validation config, no budget constraints
- [ ] `stage5-adapter.ts`: RT-003 budgets, RT-004 thresholds, RT-001 routing

### Phase 3: Migration (2-4 hours)

**Update Stage 4**:
- [ ] Replace `json-repair.ts` with `@megacampus/json-repair`
- [ ] Use `createStage4Adapter()`
- [ ] Verify tests pass

**Update Stage 5**:
- [ ] Replace `json-repair.ts` with `@megacampus/json-repair`
- [ ] Use `createStage5Adapter()`
- [ ] Verify RT-003/RT-004/RT-001 integration

### Phase 4: Testing (2 hours)

**Comprehensive Testing**:
- [ ] Unit tests for shared package
- [ ] Integration tests for Stage 4 adapter
- [ ] Integration tests for Stage 5 adapter
- [ ] Regression tests (compare old vs new)

---

## SUCCESS CRITERIA

- ✅ Zero code duplication between Stage 4 and Stage 5
- ✅ All existing tests pass (Stage 4 and Stage 5)
- ✅ No performance regression
- ✅ Clear documentation for future stages
- ✅ Adapter pattern allows stage-specific customization

---

## ALTERNATIVES CONSIDERED

**Option 3: Keep Duplicated (NOT RECOMMENDED)**:
- **Pro**: Zero migration effort
- **Con**: Maintenance burden, inconsistency risk, harder to evolve

**Verdict**: Extract is worth the effort for long-term maintainability

---

## REFERENCE

**Existing Implementations**:
- Stage 4: `packages/course-gen-platform/src/orchestrator/services/analysis/json-repair.ts`
- Stage 5: TBD (after FUTURE-002 implementation)

**Patterns to Extract**:
- jsonrepair library wrapper
- Custom FSM fallback strategies
- Field-name auto-fix
- Multi-step pipeline (critique → revise)
- Partial regeneration (field-level atomicity)
- Repair metrics tracking

**Related Research**:
- RT-005: JSON repair strategy (source of shared patterns)
- LLM-VALIDATION-BEST-PRACTICES.md: Layered validation (context for repair)

---

**Status**: PENDING (BLOCKED by FUTURE-001 ✅, FUTURE-002 ✅)
**Created**: 2025-11-08
**Priority**: LOW (cleanup task, not critical path)
**Effort**: 8-12 hours (Option 1) or 4-6 hours (Option 2)
