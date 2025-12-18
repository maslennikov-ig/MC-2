# Stage 4 Parameters Usage Audit

> **Date**: 2025-11-05
> **Status**: ⚠️ **Issues Found** - See issues in `docs/phases/PHASE_STYLE_INTEGRATION.md`

---

## Summary

Frontend sends 8 parameters to Stage 4, **2 are unused**:

| Parameter | Used | Status |
|-----------|------|--------|
| `topic` | ✅ All phases | ✅ OK |
| `language` | ✅ Phase 1,3,4,5 | ✅ OK |
| `answers` | ✅ All phases | ✅ OK |
| `document_summaries` | ✅ All phases | ✅ OK |
| `target_audience` | ✅ Phase 1* | ✅ OK |
| `lesson_duration_minutes` | ✅ Phase 1* | ✅ OK |
| **`style`** | ❌ **NEVER** | ⚠️ **UNUSED** |
| **`difficulty`** | ❌ **NEVER** | ⚠️ **UNUSED** |

\* Passed to Phase 1, then used from phase outputs

---

## Phase Usage

### Phase 0: Pre-Flight
- No analysis parameters used

### Phase 1: Classification
**Uses**: `topic`, `language`, `target_audience`, `lesson_duration_minutes`, `answers`, `document_summaries`
**Ignores**: `style`, `difficulty`

### Phase 2: Scope Analysis
**Uses**: `topic`, `answers`, `document_summaries`, phase1_output
**Ignores**: `style`, `difficulty`

### Phase 3: Expert Analysis
**Uses**: `topic`, `language`, `answers`, `document_summaries`, phase1/2_output
**Ignores**: `style`, `difficulty`
**Note**: Generates own `teaching_style` (different from input `style`)

### Phase 4: Synthesis
**Uses**: `topic`, `language`, `answers`, `document_summaries`, phase1/2/3_output
**Ignores**: `style`, `difficulty`

### Phase 5: Assembly
**Uses**: All phase outputs
**Ignores**: `style`, `difficulty`

---

## Issues

### Issue 1: `style` Unused
- **Status**: `style` transmitted but never used
- **Reason**: Phase 3 generates `teaching_style` autonomously
- **Fix**: See `docs/phases/PHASE_STYLE_INTEGRATION.md`

### Issue 2: `difficulty` Unused
- **Status**: `difficulty` transmitted but never used
- **Reason**: Phase 1 generates `target_audience` autonomously
- **Decision**: Remove `difficulty` field (redundant with `target_audience`)

---

## References

- **Router**: `packages/course-gen-platform/src/server/routers/analysis.ts:345-354`
- **Phases**: `packages/course-gen-platform/src/orchestrator/services/analysis/`
- **Types**: `packages/shared-types/src/analysis-job.ts`

---
