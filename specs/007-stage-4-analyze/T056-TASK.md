# T056: Stage 4 Analysis Quality Validation

**Created**: 2025-11-04
**Status**: ⏳ PENDING
**Branch**: `007-stage-4-analyze`
**Prerequisites**: T055 Full Pipeline Test (PASSED ✅)

---

## 🎯 Objective

Validate the quality and correctness of Stage 4 Analysis results produced by the T055 E2E test.

**Goal**: Ensure the analysis phase correctly identifies:
- Research requirements (when documents need expert analysis)
- Content complexity and scope
- Recommended educational approach
- Prerequisite knowledge requirements
- Quality metrics and confidence scores

---

## 📋 Context from T055

### Test Execution Summary

**Status**: ✅ PASSED (All 3 documents processed successfully)

**Test Details**:
- Test File: `packages/course-gen-platform/tests/e2e/t055-full-pipeline.test.ts`
- Course ID: Check latest test run in logs
- Documents Processed: 3 files (PDF + 2 TXT)
- Log File: `/tmp/t055-clean-run.log`

**Test Documents**:
1. `Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf` (636KB)
2. `Постановление Правительства РФ от 23.12.2024 N 1875.txt` (280KB)
3. `Презентация и обучение.txt` (71KB)

**Pipeline Stages Completed**:
- ✅ Stage 2: Document Upload
- ✅ Stage 3: Document Processing (embeddings, summarization)
- ✅ Stage 4: Analysis (FOCUS OF THIS TASK)
- ✅ Phase 2: Course Structure Generation

---

## 🔍 What to Validate

### 1. Research Flag Detection

**Goal**: Verify the `research_required` flag is set correctly

**Check**:
- Query database for `documents.research_required` for each document
- Validate `research_metadata` (if research_required = true):
  ```typescript
  {
    research_query: string,     // Should be < 15K tokens (Fix #1)
    confidence: number,          // [0, 1]
    reasoning: string,
    complexity_indicators: string[]
  }
  ```

**Expected**:
- Russian legal documents (PDF, Government decree) → likely `research_required = true`
- Presentation document → likely `research_required = false`

**SQL Query**:
```sql
SELECT
  file_name,
  research_required,
  research_metadata,
  analysis_completed_at
FROM documents
WHERE course_id = '<COURSE_ID_FROM_TEST>'
ORDER BY created_at;
```

---

### 2. Phase 2 Scope Analysis Results

**Goal**: Verify Phase 2 correctly processed analysis data

**Check**:
- Course structure was generated
- `phase_metadata` exists (Fix #10)
- Quality scores are valid

**SQL Query**:
```sql
SELECT
  generation_status,
  recommended_structure,
  phase_metadata
FROM courses
WHERE id = '<COURSE_ID_FROM_TEST>';
```

**Expected**:
```json
{
  "generation_status": "structure_generated" or "generating_lessons",
  "recommended_structure": {
    "total_lessons": 48,
    "total_sections": 10,
    "estimated_hours": 12,
    "sections": [...]
  },
  "phase_metadata": {
    "duration_ms": number,
    "model_used": "openai/gpt-oss-20b",
    "tokens": { input, output, total },
    "quality_score": number [0, 1],  // Fix #6 validation
    "retry_count": 0
  }
}
```

---

### 3. Analysis Quality Metrics

**Goal**: Validate analysis produced meaningful insights

**Check for Each Document**:

1. **Completeness**:
   - All documents have `analysis_completed_at` timestamp
   - No documents stuck in "analyzing" state

2. **Data Integrity**:
   - `embedding_count > 0` for all documents
   - `summary_text` is not null and not empty
   - Token counts are reasonable (not 0, not excessive)

3. **Research Metadata Quality** (if applicable):
   - `research_query` is coherent and relevant
   - `confidence` score is reasonable (typically > 0.5 for true positives)
   - `complexity_indicators` array is not empty
   - `reasoning` explains why research is needed

**SQL Query**:
```sql
SELECT
  file_name,
  embedding_count,
  summary_text IS NOT NULL as has_summary,
  char_length(summary_text) as summary_length,
  research_required,
  (research_metadata->>'confidence')::numeric as research_confidence,
  jsonb_array_length(research_metadata->'complexity_indicators') as indicator_count
FROM documents
WHERE course_id = '<COURSE_ID_FROM_TEST>';
```

---

### 4. Vector Search Integration

**Goal**: Verify Qdrant collections were created and populated

**Check**:
- Documents have embeddings stored in Qdrant
- Vector search would return relevant results

**Note**: This requires access to Qdrant or checking logs for embedding operations.

**Expected in logs** (`/tmp/t055-clean-run.log`):
```
"msg":"Embedding batch cache status"
"cacheHits": number
"cacheMisses": number
```

---

## 📊 Success Criteria

### ✅ PASS if:

1. **All documents analyzed**: 3/3 documents have `analysis_completed_at`
2. **Research flags set**: At least 1 document correctly flagged for research
3. **Phase 2 completed**: Course has valid `recommended_structure`
4. **Metadata present**: `phase_metadata` exists with all required fields (Fix #10)
5. **Quality scores valid**: All scores ∈ [0, 1] (Fix #6)
6. **No token overflows**: `research_query` < 15K tokens (Fix #1)
7. **Embeddings created**: All documents have `embedding_count > 0`
8. **Summaries exist**: All documents have non-empty `summary_text`

### ❌ FAIL if:

- Any document missing analysis data
- Invalid `phase_metadata` structure
- Quality scores out of range
- Empty or null critical fields
- Research metadata malformed

---

## 🛠️ How to Execute Validation

### Step 1: Get Course ID from Test Logs

```bash
# Extract course ID from latest test run
grep "Created test course:" /tmp/t055-clean-run.log | tail -1
# Output: [T055] Created test course: <COURSE_ID>
```

### Step 2: Connect to Database

```bash
# Using Supabase CLI or psql
supabase db remote connect
```

### Step 3: Run Validation Queries

```sql
-- Set course ID variable
\set course_id '<COURSE_ID_FROM_STEP_1>'

-- Query 1: Document Analysis Status
SELECT
  file_name,
  research_required,
  (research_metadata->>'confidence')::numeric as confidence,
  analysis_completed_at IS NOT NULL as analyzed,
  embedding_count,
  char_length(summary_text) as summary_len
FROM documents
WHERE course_id = :'course_id'
ORDER BY created_at;

-- Query 2: Phase 2 Results
SELECT
  generation_status,
  (recommended_structure->>'total_lessons')::int as lessons,
  (recommended_structure->>'total_sections')::int as sections,
  (phase_metadata->>'duration_ms')::int as duration,
  phase_metadata->>'model_used' as model,
  (phase_metadata->>'quality_score')::numeric as quality
FROM courses
WHERE id = :'course_id';

-- Query 3: Research Metadata Detail (if research_required = true)
SELECT
  file_name,
  research_metadata->>'research_query' as query_preview,
  char_length(research_metadata->>'research_query') as query_length,
  research_metadata->'complexity_indicators' as indicators
FROM documents
WHERE course_id = :'course_id'
  AND research_required = true;
```

### Step 4: Analyze Results

Document findings in validation report format:

```markdown
## T056 Validation Report

**Date**: YYYY-MM-DD
**Course ID**: <ID>
**Test Log**: /tmp/t055-clean-run.log

### Results Summary

| Criterion | Status | Details |
|-----------|--------|---------|
| Documents Analyzed | ✅/❌ | 3/3 completed |
| Research Flags | ✅/❌ | 2/3 flagged correctly |
| Phase 2 Complete | ✅/❌ | Structure generated |
| Metadata Present | ✅/❌ | All fields valid |
| Quality Scores | ✅/❌ | Range [0, 1] |
| Token Limits | ✅/❌ | All < 15K |
| Embeddings | ✅/❌ | All > 0 |
| Summaries | ✅/❌ | All non-empty |

### Detailed Findings

#### Document 1: Письмо Минфина...
- Research Required: true/false
- Confidence: 0.XX
- Query Length: XXXX chars
- Indicators: [...]
- Assessment: ...

#### Document 2: Постановление...
- ...

#### Document 3: Презентация...
- ...

### Overall Assessment

**Status**: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL

**Issues Found**: ...
**Recommendations**: ...
```

---

## 📁 Files to Review

1. **Test Logs**: `/tmp/t055-clean-run.log`
   - Search for: "Phase 2: Completed", "Stage 4", "research_required"

2. **Source Code** (for reference):
   - `src/orchestrator/services/analysis/research-flag-detector.ts` (Fix #1)
   - `src/orchestrator/services/analysis/phase-2-scope.ts` (Fix #6, #10)
   - `src/orchestrator/handlers/stage4-analysis.ts` (Fix #5-8)

3. **Database Schema**:
   - `documents` table: research fields
   - `courses` table: phase_metadata, recommended_structure

---

## 🎯 Expected Outcomes

### For Russian Legal Documents (PDF, Decree):

**High probability of research_required = true** because:
- Specialized legal terminology
- Regulatory content requiring expert interpretation
- Complex hierarchical structure
- Domain-specific context needed

**Expected research_metadata**:
```json
{
  "research_query": "Detailed analysis of Russian financial regulations...",
  "confidence": 0.75-0.95,
  "reasoning": "Legal terminology, regulatory framework, specialist knowledge required",
  "complexity_indicators": [
    "legal_terminology",
    "regulatory_framework",
    "specialized_domain",
    "hierarchical_structure"
  ]
}
```

### For Presentation Document:

**Likely research_required = false** because:
- Educational/training content
- More general language
- Simpler structure
- Less specialized terminology

---

## 📝 Deliverables

1. **Validation Report** (create: `T056-VALIDATION-REPORT.md`)
2. **SQL Query Results** (screenshots or text export)
3. **Quality Assessment** (PASS/FAIL/PARTIAL with reasoning)
4. **Recommendations** (if issues found)

---

## 🔗 Related Tasks

- **T055**: Full Pipeline E2E Test (prerequisite)
- **007**: Stage 4 Analysis Implementation (parent epic)

---

## ⚠️ Important Notes

1. **Course ID**: Must extract from test logs - it's generated dynamically
2. **Database Access**: Requires Supabase connection (credentials in `.env.local`)
3. **Test Environment**: Validation should be done on test database, not production
4. **Cleanup**: Test course can be deleted after validation if needed

---

**Next Session Prompt**:

```
Read: /home/me/code/megacampus2/specs/007-stage-4-analyze/T056-TASK.md

Task: Validate Stage 4 Analysis quality from T055 test run

Steps:
1. Extract course ID from /tmp/t055-clean-run.log
2. Connect to Supabase database
3. Run validation SQL queries
4. Analyze research_required flags and metadata
5. Verify phase_metadata structure (Fix #10)
6. Check quality_score ranges (Fix #6)
7. Validate token limits (Fix #1)
8. Generate T056-VALIDATION-REPORT.md with findings

Context: T055 E2E test passed successfully (3/3 documents).
Now need to validate the QUALITY of analysis results.
```

---

**Status**: ⏳ Ready for execution in new context
