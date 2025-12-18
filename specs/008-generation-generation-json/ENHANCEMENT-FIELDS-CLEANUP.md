# Enhancement Fields: Production-Ready Cleanup

**Created**: 2025-11-16
**Status**: Ready for Implementation
**Priority**: High
**Objective**: Clean up enhancement fields implementation - remove deprecated fields, make required fields REQUIRED

---

## Investigation Summary

**Investigation Report**: `docs/investigations/INV-2025-11-16-003-enhancement-fields-current-state.md`

**Current State**:
- ✅ `pedagogical_patterns` - Generated (Phase 1), consumed (Stage 5), schema exists - STATUS: OPTIONAL (should be REQUIRED)
- ✅ `generation_guidance` - Generated (Phase 4), consumed (Stage 5), schema exists - STATUS: OPTIONAL (should be REQUIRED)
- ✅ `document_relevance_mapping` - Generated (Phase 6), consumed (Stage 5 RAG), schema exists - STATUS: OPTIONAL (should be REQUIRED)
- ❌ `scope_instructions` - DEPRECATED field, replaced by generation_guidance - REMOVE COMPLETELY
- ❌ `document_analysis` - Never implemented, no consumption logic - REMOVE COMPLETELY

---

## Tasks

### Task 1: Fix pedagogical_patterns Schema (REQUIRED)

**File**: `packages/shared-types/src/analysis-schemas.ts:186`

**Current**:
```typescript
// Phase1OutputSchema (line 186)
pedagogical_patterns: PedagogicalPatternsSchema.optional(),
```

**Change to**:
```typescript
// Phase1OutputSchema (line 186)
pedagogical_patterns: PedagogicalPatternsSchema,
```

**Verification**: Already REQUIRED in `generation-job.ts:122` ✅

**Estimate**: 2 minutes

---

### Task 2: Fix generation_guidance Schema (REQUIRED)

**File**: `packages/shared-types/src/generation-job.ts:124-127`

**Current**:
```typescript
generation_guidance: GenerationGuidanceSchema.extend({
  specific_analogies: z.array(z.string()),
  real_world_examples: z.array(z.string()),
}).optional(),
```

**Change to**:
```typescript
generation_guidance: GenerationGuidanceSchema.extend({
  specific_analogies: z.array(z.string()),
  real_world_examples: z.array(z.string()),
}),
```

**Estimate**: 2 minutes

---

### Task 3: Fix document_relevance_mapping Schema (REQUIRED with default)

**File**: `packages/shared-types/src/generation-job.ts:129`

**Current**:
```typescript
document_relevance_mapping: DocumentRelevanceMappingSchema.optional(),
```

**Change to**:
```typescript
document_relevance_mapping: DocumentRelevanceMappingSchema.default({}),
```

**Note**: Default is `{}` (empty object) when no documents, NOT `{lessons: []}` (follows current schema structure using section_id as record key)

**Estimate**: 2 minutes

---

### Task 4: Remove scope_instructions Field (DEPRECATED)

**Files to modify**:
1. `packages/shared-types/src/generation-job.ts:112` - Remove from schema
2. `packages/course-gen-platform/src/orchestrator/services/analysis/phase-4-synthesis.ts` - Remove generation logic
3. `packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts` - Remove from assembly (lines 208-210, line 235)

**Changes**:

**File 1**: `generation-job.ts:112`
```typescript
// REMOVE THIS LINE:
scope_instructions: z.string().min(100),
```

**File 2**: `phase-4-synthesis.ts`
- Remove `scope_instructions` generation logic from LLM prompt (lines 356-392 section 2)
- Remove from Phase4Output schema

**File 3**: `phase-5-assembly.ts`
- Remove sanitization (lines 208-210):
```typescript
// REMOVE:
const sanitizedScopeInstructions = input.phase4_output.scope_instructions
  ? sanitizeLLMOutput(input.phase4_output.scope_instructions)
  : '';
```
- Remove from result object (line 235):
```typescript
// REMOVE:
scope_instructions: sanitizedScopeInstructions,
```

**Estimate**: 15 minutes

---

### Task 5: Remove document_analysis Field (Never Implemented)

**Files to modify**:
1. `packages/shared-types/src/analysis-schemas.ts:233-244` - Remove DocumentAnalysisSchema
2. `packages/shared-types/src/generation-job.ts:130` - Remove from AnalysisResultSchema

**Changes**:

**File 1**: `analysis-schemas.ts:233-244`
```typescript
// REMOVE ENTIRE SCHEMA:
export const DocumentAnalysisSchema = z.object({
  source_materials: z.array(z.string()),
  main_themes: z.array(
    z.object({
      theme: z.string(),
      importance: z.enum(['high', 'medium', 'low']),
      coverage: z.string(),
    })
  ),
  complexity_assessment: z.string(),
  estimated_total_hours: z.number().min(0.5),
});
```

**File 2**: `generation-job.ts:130`
```typescript
// REMOVE THIS LINE:
document_analysis: DocumentAnalysisSchema.optional(),
```

**Estimate**: 5 minutes

---

### Task 6: Run Type-Check Validation

**Command**:
```bash
pnpm type-check:shared-types
pnpm type-check:course-gen-platform
```

**Expected Result**: No type errors

**Estimate**: 2 minutes

---

### Task 7: Update AnalysisResult Type Export

**File**: `packages/shared-types/src/index.ts`

**Verify** that DocumentAnalysisSchema is not exported (if it was exported, remove the export)

**Estimate**: 1 minute

---

## Summary

**Total Tasks**: 7
**Estimated Total Time**: 30 minutes

**Changes Summary**:
- ✅ Fix 3 fields: OPTIONAL → REQUIRED (pedagogical_patterns, generation_guidance, document_relevance_mapping)
- ❌ Remove 2 deprecated fields: scope_instructions, document_analysis
- ✅ Validate: type-check passes

**Risk**: LOW - All changes are schema-only, no runtime logic changes needed (generation already works correctly)

---

## Success Criteria

1. ✅ `pedagogical_patterns` is REQUIRED in Phase1OutputSchema
2. ✅ `generation_guidance` is REQUIRED in AnalysisResultSchema
3. ✅ `document_relevance_mapping` is REQUIRED with default `{}`
4. ❌ `scope_instructions` removed from schema, Phase 4, Phase 5
5. ❌ `document_analysis` removed from schema
6. ✅ Type-check passes for shared-types and course-gen-platform
7. ✅ No breaking changes (generation logic already handles all fields correctly)

---

## Next Steps After Implementation

1. Update documentation: `docs/SUPABASE-DATABASE-REFERENCE.md` (remove scope_instructions, document_analysis)
2. Update specification: `ANALYZE-ENHANCEMENT-UNIFIED.md` (mark deprecated fields as removed)
3. Commit changes: `/push patch` with message "chore(schema): cleanup enhancement fields - remove deprecated fields, make required fields REQUIRED"
