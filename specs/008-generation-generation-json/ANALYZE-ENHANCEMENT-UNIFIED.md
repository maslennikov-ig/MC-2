# UNIFIED: Stage 4 Analyze Enhancement for Generation Phase

**Date Created**: 2025-11-08
**Priority**: HIGH (blocks optimal Generation quality)
**Affects**: Stage 4 (Analyze), Stage 5 (Generation)
**Status**: APPROVED - Ready for Implementation

---

## Executive Summary

Consolidates THREE enhancement tracks for Stage 4 Analyze into a single coordinated implementation:

1. **RT-002 Schema Enhancements** - Improve analysis_result structure for Generation quality
2. **RT-005 JSON Repair Improvements** - Upgrade repair strategies (jsonrepair, multi-step pipeline)
3. **Document Prioritization & RAG Planning** - Smart document classification + RAG mapping for Generation

**Combined Impact**:
- Generation quality: +15-25% improvement
- JSON repair success: 85-90% → 95-97%
- Cost optimization: 60-80% savings on lightweight courses
- RAG quality: +20% (vectors from originals, targeted retrieval)

**Total Effort**: 6-8 days (1 senior developer)

**Blocking**: Stage 5 Generation can work without these enhancements (MVP functional), but production quality requires implementation.

---

## Part 1: RT-002 Schema Enhancements

**Source**: `/docs/FUTURE/enhance-analyze-schema-for-generation.md`
**Priority**: CRITICAL (MUST DO before Production)

### 1.1 Add `pedagogical_patterns` Field

**Why**: Generation needs theory/practice balance for appropriate exercise creation

**Schema Addition** (AnalysisResult interface):
```typescript
export interface AnalysisResult {
  // ... existing fields ...

  // NEW FIELD
  pedagogical_patterns: {
    primary_strategy: 'problem-based learning' | 'lecture-based' | 'inquiry-based' | 'project-based' | 'mixed';
    theory_practice_ratio: string; // e.g., "30:70", "50:50"
    assessment_types: Array<'coding' | 'quizzes' | 'projects' | 'essays' | 'presentations' | 'peer-review'>;
    key_patterns: string[]; // e.g., ["build incrementally", "learn by refactoring"]
  };
}
```

**Impact**: +10% Generation quality (maintains pedagogical consistency)

---

### 1.2 Replace `scope_instructions` with `generation_guidance`

**Why**: Generation needs structured constraints (analogies, jargon, visuals), not free-text

**Schema Replacement**:
```typescript
export interface AnalysisResult {
  // DEPRECATED (keep for backward compatibility)
  scope_instructions?: string;

  // NEW FIELD (replace scope_instructions)
  generation_guidance: {
    tone: 'conversational but precise' | 'formal academic' | 'casual friendly' | 'technical professional';
    use_analogies: boolean;
    specific_analogies?: string[]; // e.g., ["assembly line for data flow"]
    avoid_jargon: string[]; // Terms to avoid or explain
    include_visuals: Array<'diagrams' | 'flowcharts' | 'code examples' | 'screenshots' | 'animations' | 'plots'>;
    exercise_types: Array<'coding' | 'derivation' | 'interpretation' | 'debugging' | 'refactoring' | 'analysis'>;
    contextual_language_hints: string; // Audience assumptions
    real_world_examples?: string[]; // Applications to reference
  };
}
```

**Migration**: Populate both fields (scope_instructions from generation_guidance if new schema)

**Impact**: +15% Generation quality (better constraint adherence)

---

### 1.3 Enhance `sections_breakdown` Fields

**Why**: Generation needs section IDs, duration, difficulty, prerequisites for dependency graph

**Schema Enhancement** (SectionBreakdown interface):
```typescript
export interface SectionBreakdown {
  // EXISTING FIELDS (keep as-is)
  area: string;
  estimated_lessons: number;
  importance: 'core' | 'important' | 'optional';
  learning_objectives: string[];
  key_topics: string[];
  pedagogical_approach: string;
  difficulty_progression: 'flat' | 'gradual' | 'steep';

  // NEW FIELDS (add these)
  section_id: string; // e.g., "1", "2", "3"
  estimated_duration_hours: number; // 0.5-20h
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[]; // section_ids (empty if none)
}
```

**Impact**: +10% Generation quality (dependency handling, adaptive pacing)

---

### 1.4 Add `document_analysis` Top-Level Field (OPTIONAL)

**Why**: Provides Generation with document-level context

**Schema Addition**:
```typescript
export interface AnalysisResult {
  // ... existing fields ...

  // OPTIONAL FIELD (Phase 2)
  document_analysis?: {
    source_materials: string[]; // file_catalog IDs
    main_themes: Array<{
      theme: string;
      importance: 'high' | 'medium' | 'low';
      coverage: string; // e.g., "chapters 1-3"
    }>;
    complexity_assessment: string;
    estimated_total_hours: number;
  };
}
```

**Impact**: +5% Generation quality (coherence, context awareness)

---

### 1.5 Add `document_relevance_mapping` (RAG PLANNING) ⭐ NEW

**Why**: Enable smart RAG retrieval in Generation without extra LLM calls

**Schema Addition**:
```typescript
export interface AnalysisResult {
  // ... existing fields ...

  // NEW FIELD (RAG Planning)
  document_relevance_mapping?: {
    [section_id: string]: {
      primary_documents: string[]; // file_catalog IDs most relevant to this section
      key_search_terms: string[]; // Concepts to query if RAG needed
      expected_topics: string[]; // Topics covered in these docs
      document_processing_methods: {
        [document_id: string]: 'full_text' | 'hierarchical';
      };
    };
  };
}
```

**Example**:
```json
{
  "document_relevance_mapping": {
    "1": {
      "primary_documents": ["file_uuid_1", "file_uuid_2"],
      "key_search_terms": ["blockchain consensus", "proof of work", "SHA-256"],
      "expected_topics": ["mining", "hashing", "consensus mechanisms"],
      "document_processing_methods": {
        "file_uuid_1": "hierarchical",
        "file_uuid_2": "full_text"
      }
    }
  }
}
```

**Impact**:
- +$0.068/course savings (no extra Planning LLM call)
- +20% RAG quality (targeted retrieval)
- Solves full-text document token budget problem

---

## Part 2: RT-005 JSON Repair Improvements

**Source**: `/docs/FUTURE/FUTURE-001-apply-rt005-to-stage4.md`
**Priority**: MEDIUM (nice-to-have)

### 2.1 jsonrepair Library Integration

**Current**: Custom 6-strategy FSM
**New**: `jsonrepair` library + custom fallback

**Files to Modify**:
- `packages/course-gen-platform/src/orchestrator/services/analysis/json-repair.ts`

**Changes**:
```typescript
import { jsonrepair } from 'jsonrepair';

export async function repairJSON(malformedJSON: string): Promise<string> {
  // Step 1: Try jsonrepair library (fast, 95-98% success)
  try {
    const repaired = jsonrepair(malformedJSON);
    logger.info({ strategy: 'jsonrepair' }, 'JSON repaired successfully');
    return repaired;
  } catch (error) {
    logger.warn({ error }, 'jsonrepair failed, trying custom strategies');
  }

  // Step 2: Fallback to custom strategies (existing 6-strategy FSM)
  return await customRepairStrategies(malformedJSON);
}
```

**Impact**: Parse error success 85-90% → 95-98%
**Effort**: 4 hours

---

### 2.2 Field Name Auto-Fix Utility

**Why**: LLMs sometimes output camelCase instead of snake_case

**Files to Create**:
- `packages/course-gen-platform/src/orchestrator/services/analysis/field-name-fix.ts`

**Implementation**:
```typescript
export function fixFieldNames(obj: any, mapping: Record<string, string>): any {
  if (typeof obj !== 'object' || obj === null) return obj;

  const fixed: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const correctKey = mapping[key] || key;
    fixed[correctKey] = fixFieldNames(value, mapping);
  }

  return fixed;
}

// Usage
const ANALYZE_FIELD_MAPPING = {
  'courseCategory': 'course_category',
  'contextualLanguage': 'contextual_language',
  // ... all field mappings
};
```

**Impact**: 100% success, zero cost
**Effort**: 2 hours

---

### 2.3 Multi-Step Regeneration Pipeline

**Why**: Complex errors need critique → revise pattern

**Files to Modify**:
- `packages/course-gen-platform/src/orchestrator/services/analysis/partial-regenerator.ts`

**Implementation**:
```typescript
export async function regenerateWithCritique(
  phase: string,
  previousOutput: string,
  errors: ValidationError[]
): Promise<string> {

  // Step 1: Critique (identify root cause)
  const critique = await llm.invoke(`
    Analyze why this output failed validation:

    Output: ${previousOutput}
    Errors: ${JSON.stringify(errors)}

    Identify root cause and suggest fix strategy.
  `);

  // Step 2: Revise (regenerate with critique context)
  const revised = await llm.invoke(`
    Previous output had issues: ${critique}

    Regenerate ${phase} output addressing these issues.
  `);

  return revised;
}
```

**Trigger**: `errorCount >3` OR `semanticValidationFailed >=2`

**Impact**: Complex error success 90-95% → 95-99%
**Effort**: 12 hours

---

### 2.4 Repair Metrics

**Files to Modify**:
- `packages/course-gen-platform/src/orchestrator/services/analysis/langchain-observability.ts`

**Metrics to Add**:
- `json_repair_attempts_total`
- `json_repair_success_total`
- `json_repair_duration_ms`
- `json_repair_cost_usd_total`

**Effort**: 4 hours

---

## Part 3: Document Prioritization & RAG Planning

**Source**: `/docs/FUTURE/FUTURE-ENHANCEMENT-DOCUMENT-PRIORITIZATION.md`
**Priority**: HIGH (significant cost and quality impact)

**⚠️ CRITICAL TIMING**: Document prioritization MUST happen BEFORE summarization (Stage 3), not after!

**Rationale**:
1. HIGH priority documents → saved as full text (if they fit in budget)
2. LOW priority documents → summarized immediately
3. Budget allocation based on classification results
4. Avoid summarizing documents that should be kept in full

### 3.1 Two-Tier Document Classification (STAGE 3 - BEFORE SUMMARIZATION)

**When**: At the START of Stage 3 (Summarization), before any document processing

**Why**: Prioritize core materials (lectures) over reference docs (laws, standards)

**Implementation Location**: Stage 3 Summarization orchestrator (NOT Stage 4 Analyze!)

**Phase 1**: LLM-based classification
```typescript
// NEW: document-classifier.ts

interface DocumentClassification {
  file_id: string;
  priority: 'HIGH' | 'LOW';
  order: number; // 1-N (skvoznaya numeratsiya)
  importance_score: number; // 0.0-1.0
  category: 'course_core' | 'supplementary' | 'reference' | 'regulatory';
  reasoning: string;
}

export async function classifyDocuments(
  files: UploadedFile[],
  courseContext: { title: string; topic?: string }
): Promise<DocumentClassification[]> {

  // Get preview (first 1000 chars) of each document
  const previews = await getDocumentPreviews(files);

  // LLM classification
  const prompt = `
  Course: "${courseContext.title}"

  Classify each document:
  - HIGH: Core materials (lectures, textbooks, syllabus) - importance ≥0.7
  - LOW: Reference materials (laws, standards, supplementary) - importance <0.7

  Return order 1-N by importance (descending).
  `;

  const result = await llm.invoke(prompt);
  return parseClassifications(result);
}
```

**Criteria**:
- **HIGH** (importance ≥0.7): Lectures, textbooks, syllabi, author presentations
- **LOW** (importance <0.7): Laws, standards, regulations, supplementary materials

---

### 3.2 Smart Processing Strategy (STAGE 3 SUMMARIZATION)

**When**: After classification, BEFORE summarization

**Processing Rules**:
```
HIGH priority documents (lectures, textbooks, syllabi):
  IF (HIGH_total_tokens ≤ 80K):
    → Save as FULL TEXT (no summarization)
    → Mark: processing_mode = 'full_text'
  ELSE IF (HIGH_total_tokens > 80K):
    → Apply balanced/detailed summarization
    → Target: Keep all HIGH docs within 80K combined

LOW priority documents (laws, standards, reference):
  → Apply aggressive summarization IMMEDIATELY
  → Target: Minimize token usage
  → Mark: processing_mode = 'aggressive'
```

**Budget Allocation for Analyze Model Selection**:
```
After Stage 3 completes:

IF (HIGH_docs_total ≤ 80K tokens):
  → Analyze uses: OSS 120B (128K context, $0.20/1M)
  → Budget: HIGH=80K, LOW=remainder
  → Cost: Low

ELSE IF (HIGH_docs_total > 80K tokens):
  → Analyze uses: Gemini 2.5 Flash (1M context, $0.15/1M)
  → Budget: HIGH=400K, LOW=remainder
  → Cost: Higher but necessary
```

**Implementation**:
```typescript
// NEW: Stage 3 Summarization - document-prioritization.ts

export async function processWithPrioritization(
  classifications: DocumentClassification[],
  files: UploadedFile[]
): Promise<ProcessedDocument[]> {

  const highDocs = classifications.filter(c => c.priority === 'HIGH');
  const lowDocs = classifications.filter(c => c.priority === 'LOW');

  const highTokensEstimate = calculateTotalTokens(highDocs);

  let processedDocs: ProcessedDocument[] = [];

  // HIGH priority: keep full text if possible
  if (highTokensEstimate <= 80000) {
    // Save HIGH docs as full text
    for (const doc of highDocs) {
      processedDocs.push({
        ...doc,
        content: await readFullText(doc.file_id),
        processing_mode: 'full_text',
        priority: 'HIGH'
      });
    }
  } else {
    // Summarize HIGH docs but use balanced mode
    for (const doc of highDocs) {
      processedDocs.push({
        ...doc,
        content: await summarize(doc.file_id, 'balanced'),
        processing_mode: 'balanced',
        priority: 'HIGH'
      });
    }
  }

  // LOW priority: always aggressive summarization
  for (const doc of lowDocs) {
    processedDocs.push({
      ...doc,
      content: await summarize(doc.file_id, 'aggressive'),
      processing_mode: 'aggressive',
      priority: 'LOW'
    });
  }

  return processedDocs;
}
```

**Cost Impact**:
- 90%+ courses: HIGH docs fit in 80K → full text → Analyze uses OSS 120B
- 10% courses: HIGH docs >80K → Analyze uses Gemini
- Savings: 60-80% on lightweight courses vs always using Gemini

---

### 3.3 RAG Plan Generation in Analyze

**Why**: Analyze already sees all documents, can create mapping for Generation

**Implementation** (add to Analyze Phase 6 - Synthesis):
```typescript
// In analyze-orchestrator.ts Phase 6

async function generateRagPlan(
  sections: SectionBreakdown[],
  documents: ProcessedDocument[]
): Promise<DocumentRelevanceMapping> {

  const prompt = `
  You analyzed these documents:
  ${documents.map(d => `- ${d.filename} (${d.priority}, ${d.token_count} tokens)`).join('\n')}

  You created these sections:
  ${sections.map(s => `- Section ${s.section_id}: ${s.area} (topics: ${s.key_topics.join(', ')})`).join('\n')}

  For Generation phase, create RAG retrieval plan:
  - Which documents are most relevant for each section?
  - What search terms should be used?
  - What topics are covered in each document?

  Return JSON mapping section_id → {primary_documents, key_search_terms, expected_topics}
  `;

  const ragPlan = await llm.invoke(prompt);
  return parseRagPlan(ragPlan);
}
```

**Output** (stored in analysis_result.document_relevance_mapping):
```json
{
  "1": {
    "primary_documents": ["blockchain_whitepaper.pdf", "crypto_intro.pdf"],
    "key_search_terms": ["blockchain consensus", "proof of work"],
    "expected_topics": ["mining", "hashing"]
  }
}
```

**Cost**: ~$0.0015/course (extra 2-5K output tokens in existing Gemini call)

---

### 3.4 Vectorization from Original Documents

**CRITICAL**: Vectors always created from original text, NOT from summary

**Why**:
- Analyze uses summaries (token efficiency)
- Generation RAG uses vectors from originals (detail retrieval)

**Implementation** (modify document-processing worker):
```typescript
async function processDocument(job: DocumentProcessingJob) {
  const fullText = await readOriginalDocument(job.file_id);

  // Determine what to save for Analyze context
  let analyzeContent: string;
  if (job.priority === 'HIGH' && fullText.tokens <= 50000) {
    analyzeContent = fullText; // full text
  } else {
    analyzeContent = await createSummary(fullText); // summary
  }

  // VECTORIZE FROM ORIGINAL (not summary!)
  const vectors = await vectorize({
    text: fullText, // ← ORIGINAL
    chunkSize: 400,
    parentChunkSize: 1500
  });

  // Save both
  await saveToDB({
    analyze_content: analyzeContent, // for Analyze Stage
    vectors: vectors // for Generation RAG
  });
}
```

**Impact**: +20% RAG quality (detailed chunks, not compressed summary)

---

## Implementation Roadmap

### 🎯 IMPLEMENTATION STRATEGY: Pipeline Approach

**Decision Date**: 2025-11-08
**Rationale**: Avoid throwaway code, optimize development flow, leverage task independence

**Sequence**:
```
Week 1-1.5: Generation Core (T019-T021) ← START HERE
    ↓ (Context switch - Generation "cools down")
Week 2-3: Analyze Enhancement (This spec)
    ↓ (Return to Generation with fresh perspective)
Week 3.5-4: Generation Complete (T022-T029)
```

**Why this order**:
1. T019-T021 are independent of Analyze enhancement (can start immediately)
2. T022 (RAG) benefits from completed Analyze enhancement (no NAIVE fallback needed)
3. Context switch between 007/008 reduces "tunnel vision"
4. Avoids writing throwaway code (saves 2-3 days)
5. T022 implemented correctly from the start (SMART mode only)

**Blocking Status**:
- ⚠️ T022 (qdrant-search.ts) BLOCKED by Part 1 & Part 3 of this spec
- ✅ T019-T021 NOT BLOCKED (can proceed immediately)
- ✅ T023-T029 CAN PROCEED after T022 (tests, validators, orchestration)

**See**: `specs/008-generation-generation-json/tasks.md` for detailed Generation task sequence

---

### Phase 0: Schema Design & Approval ✅ COMPLETE
**Duration**: 1 day (completed 2025-11-08)
**Deliverables**: ✅ This document, schema definitions, stakeholder approval

---

### Phase 1: Core Schema Enhancements (CRITICAL)
**Duration**: 2-3 days
**Priority**: MUST DO before Production

**Tasks**:
1. Update `AnalysisResult` TypeScript interface
2. Add Zod schemas for new fields
3. Update Analyze prompts to generate new fields:
   - pedagogical_patterns
   - generation_guidance
   - sections_breakdown enhancements
   - document_relevance_mapping (RAG plan)
4. Migrate scope_instructions → generation_guidance (backward compatible)
5. Test with 10 sample courses
6. Update Stage 5 Generation to consume new fields

**Files to Modify**:
- `packages/shared-types/src/analysis-result.ts`
- `packages/course-gen-platform/src/orchestrator/services/analysis/*.ts`
- `specs/007-stage-4-analyze/data-model.md`

**Success Criteria**:
- ✅ All test courses generate valid new schema
- ✅ Generation quality improves ≥10% (A/B test)
- ✅ Backward compatibility maintained (old courses work)

---

### Phase 2: JSON Repair Improvements (NICE-TO-HAVE)
**Duration**: 1.5 days
**Priority**: SHOULD DO after Phase 1

**Tasks**:
1. Install jsonrepair library
2. Integrate into json-repair.ts
3. Create field-name-fix.ts utility
4. Add repair metrics (Prometheus/Pino)
5. Test with 100 courses (injected errors)

**Success Criteria**:
- ✅ Parse success 95-98%
- ✅ Cost: no increase
- ✅ All existing tests pass

---

### Phase 3: Document Prioritization (HIGH IMPACT)
**Duration**: 2-3 days
**Priority**: HIGH (significant cost/quality impact)

**Tasks**:
1. Create document-classifier.ts (LLM + heuristics)
2. Create budget-allocator.ts (80K threshold logic)
3. Integrate RAG plan generation into Analyze Phase 6
4. Modify document-processing worker (vectorize from originals)
5. Update Analyze orchestrator (use selected model)
6. Test with courses having 5-20 documents

**Success Criteria**:
- ✅ 90%+ courses use cheap model
- ✅ RAG quality +20%
- ✅ Cost savings 60-80% on lightweight courses

---

### Phase 4: Multi-Step Regeneration (ADVANCED)
**Duration**: 1-2 days
**Priority**: OPTIONAL (marginal improvement)

**Tasks**:
1. Implement regenerateWithCritique() in partial-regenerator.ts
2. Add trigger logic (errorCount >3)
3. Test with intentionally broken outputs

**Success Criteria**:
- ✅ Complex error success 95-99%
- ✅ Cost: acceptable (<20% increase for retries)

---

## Testing Strategy

### Unit Tests
- New schema fields validation (Zod)
- Document classification logic
- Budget allocation logic
- Field name fix utility
- jsonrepair integration

### Integration Tests
- End-to-end Analyze with new schema
- Generation consuming enhanced analysis_result
- Document prioritization workflow
- RAG plan usage in Generation

### A/B Testing
**Cohort A** (control): Old schema, naive RAG, no prioritization
**Cohort B** (treatment): New schema, RAG plan, prioritization

**Metrics**:
- Generation quality (semantic similarity)
- Analyze cost (USD per course)
- Generation cost (USD per course)
- RAG retrieval accuracy
- User satisfaction (if available)

**Sample Size**: 50 courses per cohort
**Duration**: 1 week

**Success Criteria**: Cohort B shows ≥10% improvement in quality OR ≥50% cost savings

---

## Migration & Backward Compatibility

### Existing Courses
- ✅ Continue working with old analysis_result
- ✅ No reprocessing required
- ✅ Optional: reprocess for quality improvement

### New Courses
- ✅ Automatically use new schema
- ✅ Fall back to old schema if LLM fails

### Generation Code
```typescript
// In Generation services

const guidance = input.analysis_result.generation_guidance || {
  tone: 'conversational but precise',
  use_analogies: true,
  avoid_jargon: [],
  include_visuals: ['diagrams', 'code examples'],
  exercise_types: ['coding'],
  contextual_language_hints: input.analysis_result.scope_instructions || ''
};

const patterns = input.analysis_result.pedagogical_patterns || {
  primary_strategy: 'mixed',
  theory_practice_ratio: '50:50',
  assessment_types: ['coding'],
  key_patterns: []
};

const ragPlan = input.analysis_result.document_relevance_mapping?.[sectionId];
if (ragPlan) {
  // Use smart RAG
} else {
  // Fall back to naive RAG
}
```

---

## Expected Outcomes

### Quality Improvements
- ✅ Generation quality: +15-25% (structured guidance + RAG plan)
- ✅ JSON repair success: 85-90% → 95-97%
- ✅ RAG retrieval accuracy: +20% (vectors from originals)
- ✅ Pedagogical consistency: +15% (patterns field)

### Cost Optimizations
- ✅ 60-80% savings on lightweight courses (OSS 120B vs Gemini)
- ✅ $0.068/course savings (no extra RAG Planning call)
- ✅ Transparent cost tracking (model selection logged)

### Developer Experience
- ✅ Structured schema (easier to work with than free-text)
- ✅ Better debugging (explicit RAG plan, repair metrics)
- ✅ Clear separation of concerns (Analyze = planning, Generation = execution)

---

## Risks & Mitigations

### Risk 1: Schema Changes Break Generation
**Mitigation**: Backward compatibility, graceful degradation, A/B testing

### Risk 2: LLM Classification Errors
**Mitigation**: Heuristic fallback, manual override UI (future), logging for tuning

### Risk 3: Increased Analyze Cost (extra output tokens)
**Mitigation**: Extra cost (~$0.0015/course) offset by Generation savings ($0.068/course)

### Risk 4: Implementation Complexity
**Mitigation**: Phased rollout (trial → free → premium), continuous monitoring

---

## Dependencies

### Upstream
- RT-002 research complete ✅
- RT-005 research complete ✅
- Stage 4 Analyze MVP working ✅

### Downstream
- Stage 5 Generation implementation (T022 qdrant-search.ts)
- Stage 5 tasks.md update (RAG plan dependency)
- Stage 5 plan.md update (Analyze schema dependency)

---

## References

**Research Documents**:
- `specs/008-generation-generation-json/research-decisions/rt-002-full-analysis.md`
- `specs/008-generation-generation-json/research-decisions/rt-005-pragmatic-hybrid.md`

**FUTURE Tasks Consolidated**:
- `docs/FUTURE/enhance-analyze-schema-for-generation.md`
- `docs/FUTURE/FUTURE-001-apply-rt005-to-stage4.md`
- `docs/FUTURE/FUTURE-ENHANCEMENT-DOCUMENT-PRIORITIZATION.md`

**Stage 4 Specs**:
- `specs/007-stage-4-analyze/data-model.md`
- `specs/007-stage-4-analyze/plan.md`

---

## Next Actions

1. ✅ **Approval**: Review this document with stakeholders
2. ⏭️ **Phase 1 Implementation**: Start core schema enhancements (2-3 days)
3. ⏭️ **Update Stage 5**: Modify Generation tasks.md and plan.md to reference new schema
4. ⏭️ **Testing**: A/B test with 50 courses per cohort
5. ⏭️ **Production**: Gradual rollout (trial → all tiers)

---

**Status**: ✅ READY FOR IMPLEMENTATION
**Owner**: Backend Team (Analyze + Generation collaboration)
**Created**: 2025-11-08
**Approved By**: [Pending]

**Total Effort**: 6-8 days
**Expected ROI**: +15-25% quality, 60-80% cost savings on 90% of courses
