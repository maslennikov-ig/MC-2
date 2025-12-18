# Stage Unification - Quick Reference

**For:** Developers implementing the refactoring
**Plan:** [STAGE-UNIFICATION-PLAN.md](./STAGE-UNIFICATION-PLAN.md)

---

## Phase Execution Order

1. **Phase 1: Stage 5** (6-8h) - Start here! Highest risk, most dependencies
2. **Phase 2: Stage 4** (4-5h) - Already structured, medium risk
3. **Phase 3: Stage 2** (5-6h) - Monolithic split, medium risk
4. **Phase 4: Stage 3** (3-4h) - Simplest, lowest risk

---

## Pre-Flight Checklist

```bash
# Create baseline
pnpm type-check > baseline-types.log
pnpm test --coverage > baseline-tests.log
git rev-parse HEAD > baseline-commit.txt

# Create feature branch
git checkout -b refactor/stage-unification

# Verify workspace clean
git status
```

---

## Phase 1: Stage 5 (Generation)

### Quick Steps

```bash
# 1. Create structure
mkdir -p src/stages/stage5-generation/{phases,utils,validators}
mkdir -p tests/unit/stages/stage5/{phases,utils,validators}

# 2. Move files
mv src/services/stage5/* src/stages/stage5-generation/utils/
mv src/services/stage5/validators/* src/stages/stage5-generation/validators/

# 3. Update imports (automated)
./scripts/refactor-stage5-imports.sh

# 4. Validate
pnpm type-check
pnpm test tests/unit/stages/stage5/

# 5. Commit
git add src/stages/stage5-generation/ tests/unit/stages/stage5/
git add -u src/services/stage5/ src/orchestrator/handlers/
git commit -m "refactor(stage5): unify Stage 5 Generation structure"
```

### Critical Files to Update

- `src/orchestrator/worker.ts` (handler import)
- `src/shared/regeneration/layers/*.ts` (4 files)
- `src/server/routers/generation.ts` (API router)

### Validation Commands

```bash
# No old imports
! grep -r "services/stage5" src/

# Type-check passes
pnpm type-check

# Tests pass
pnpm test tests/unit/stages/stage5/
```

---

## Phase 2: Stage 4 (Analysis)

### Quick Steps

```bash
# 1. Create structure
mkdir -p src/stages/stage4-analysis/{phases,utils}
mkdir -p tests/unit/stages/stage4/phases/

# 2. Move files
mv src/orchestrator/services/analysis/* src/stages/stage4-analysis/phases/
mv src/orchestrator/handlers/stage4-analysis.ts src/stages/stage4-analysis/handler.ts

# 3. Update imports
find src/ -type f -name "*.ts" -exec sed -i \
  -e "s|orchestrator/services/analysis/|stages/stage4-analysis/phases/|g" {} +

# 4. Validate
pnpm type-check
pnpm test tests/unit/stages/stage4/

# 5. Commit
git commit -m "refactor(stage4): unify Stage 4 Analysis structure"
```

---

## Phase 3: Stage 2 (Document Processing)

### Quick Steps

```bash
# 1. Create structure
mkdir -p src/stages/stage2-document-processing/phases/

# 2. Split monolith (manual)
# Extract 6 phases from document-processing.ts (803 lines)

# 3. Update worker
sed -i "s|handlers/document-processing|stages/stage2-document-processing/handler|" \
  src/orchestrator/worker.ts

# 4. Validate
pnpm type-check
pnpm test

# 5. Commit
git commit -m "refactor(stage2): split monolithic document-processing handler"
```

---

## Phase 4: Stage 3 (Summarization)

### Quick Steps

```bash
# 1. Create structure
mkdir -p src/stages/stage3-summarization/phases/

# 2. Move files
mv src/orchestrator/services/summarization-service.ts \
   src/stages/stage3-summarization/orchestrator.ts
mv src/orchestrator/handlers/stage3-summarization.ts \
   src/stages/stage3-summarization/handler.ts

# 3. Update imports (few files)
sed -i "s|orchestrator/services/summarization-service|stages/stage3-summarization/orchestrator|" \
  src/orchestrator/worker.ts

# 4. Validate
pnpm type-check
pnpm test tests/unit/stages/stage3/

# 5. Commit
git commit -m "refactor(stage3): unify Stage 3 Summarization structure"
```

---

## Common Validation Steps

After each phase:

```bash
# 1. Type-check
pnpm type-check || { echo "❌ Type errors!"; exit 1; }

# 2. Run stage-specific tests
pnpm test tests/unit/stages/stage{N}/

# 3. Run integration tests
pnpm test tests/integration/

# 4. Check for orphaned imports
grep -r "services/stage5" src/ && echo "❌ Old imports!" || echo "✅ Clean"
grep -r "orchestrator/services/analysis" src/ && echo "❌ Old imports!" || echo "✅ Clean"

# 5. Verify no duplicate files
find src/ -name "*.ts.backup" -o -name "*.ts.old"
```

---

## Emergency Rollback

If a phase fails:

```bash
# Abort and restore
git reset --hard HEAD

# Or selective restore
git checkout HEAD -- src/services/stage5/
git checkout HEAD -- src/orchestrator/services/analysis/
rm -rf src/stages/stage{N}-*/

# Verify restoration
pnpm type-check && pnpm test
```

---

## Import Update Patterns

### Stage 5 (Generation)

```typescript
// Before
import { GenerationOrchestrator } from '../../services/stage5/generation-orchestrator';
import { QualityValidator } from '../../services/stage5/quality-validator';

// After
import { GenerationOrchestrator } from '../../stages/stage5-generation/orchestrator';
import { QualityValidator } from '../../stages/stage5-generation/utils/quality-validator';
```

### Stage 4 (Analysis)

```typescript
// Before
import { runAnalysisOrchestration } from '../services/analysis/analysis-orchestrator';
import { phase1Classifier } from '../services/analysis/phase-1-classifier';

// After
import { runAnalysisOrchestration } from '../../stages/stage4-analysis/orchestrator';
import { phase1Classifier } from '../../stages/stage4-analysis/phases/phase-1-classifier';
```

---

## Worker Registry Update

**Final state after all phases:**

```typescript
// src/orchestrator/worker.ts
import { stage2Handler } from '../stages/stage2-document-processing/handler';
import { stage3Handler } from '../stages/stage3-summarization/handler';
import { stage4Handler } from '../stages/stage4-analysis/handler';
import { stage5Handler } from '../stages/stage5-generation/handler';

const jobHandlers = {
  [JobType.DOCUMENT_PROCESSING]: stage2Handler,
  [JobType.STAGE_3_SUMMARIZATION]: stage3Handler,
  [JobType.STRUCTURE_ANALYSIS]: stage4Handler,
  [JobType.STRUCTURE_GENERATION]: stage5Handler,
};
```

---

## Success Indicators

After all phases complete:

- [ ] All stages in `src/stages/{stage-name}/` structure
- [ ] All handlers follow thin wrapper pattern
- [ ] All orchestrators have consistent interface
- [ ] All phases in dedicated files (<200 lines each)
- [ ] Zero TypeScript errors (`pnpm type-check`)
- [ ] 100% test pass rate (`pnpm test`)
- [ ] No orphaned files in old locations
- [ ] Worker registry updated with new paths
- [ ] All git commits follow conventional commits format

---

## Timeline

- **Day 1-2:** Phase 1 (Stage 5) - 12h
- **Day 3:** Phase 2 (Stage 4) - 4h
- **Day 4-5:** Phase 3 (Stage 2) - 10h
- **Day 6:** Phase 4 (Stage 3) - 4h
- **Day 7:** Full validation + documentation - 4h

**Total:** ~34 hours over 7 days (part-time)

---

## Help & References

- **Full Plan:** [STAGE-UNIFICATION-PLAN.md](./STAGE-UNIFICATION-PLAN.md)
- **Questions:** See Appendix D in full plan
- **Scripts:** See Appendix C in full plan
- **Dependencies:** See Appendix B (Import Graph)

---

*Quick reference for [STAGE-UNIFICATION-PLAN.md](./STAGE-UNIFICATION-PLAN.md)*
