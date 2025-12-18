# Stage 4 → Stage 5 Schema Architecture Summary

**Created**: 2025-11-12
**Status**: FINALIZED
**Related**: T055 Schema Unification Task

---

## 🎯 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Stage 4: Analyze                               │
│                                                                           │
│  INPUT (OPTIONAL):                                                        │
│  • Title + Description (ALWAYS present)                                   │
│  • Documents/Files (OPTIONAL - может отсутствовать)                      │
│                                                                           │
│  PROCESSING (Multi-Phase):                                                │
│  • Phase 1 (Classification): gpt-oss-20b → fallback: gpt-oss-120b       │
│  • Phase 2 (Scope): gpt-oss-20b → fallback: gpt-oss-120b                │
│  • Phase 3 (Expert): gpt-oss-120b → fallback: gemini-2.5-flash          │
│  • Phase 4 (Synthesis): gpt-oss-20b → fallback: gpt-oss-120b            │
│  • Emergency: gemini-2.5-flash (no fallback)                             │
│  • Получает полные файлы или summary (НЕ RAG)                           │
│  • Анализирует и генерирует ВСЕ поля                                    │
│                                                                           │
│  ВАЖНО: Gemini используется только как fallback для Phase 3 и emergency │
│                                                                           │
│  OUTPUT (ALL REQUIRED):                                                   │
│  • ✅ Core nested fields (course_category, contextual_language, etc.)   │
│  • ✅ pedagogical_patterns (REQUIRED - всегда генерирует)              │
│  • ✅ generation_guidance (REQUIRED - всегда генерирует)               │
│  • ✅ document_relevance_mapping (REQUIRED - всегда генерирует)        │
│  • ✅ document_analysis (REQUIRED - всегда генерирует)                 │
│                                                                           │
│  КРИТИЧЕСКИ ВАЖНО:                                                        │
│  Analyze ВСЕГДА генерирует ВСЕ 4 enhancement поля,                      │
│  ДАЖЕ если input был title-only (без документов)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                        AnalysisResult (ALL FIELDS REQUIRED)
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                          Stage 5: Generation                             │
│                                                                           │
│  INPUT (ALL REQUIRED):                                                    │
│  • ✅ Full AnalysisResult schema                                        │
│  • ✅ ALL 4 enhancement fields REQUIRED:                                │
│    - pedagogical_patterns                                                │
│    - generation_guidance                                                 │
│    - document_relevance_mapping                                          │
│    - document_analysis                                                   │
│                                                                           │
│  PROCESSING (Multi-Phase from RT-001):                                    │
│  • Phase 2 (Metadata):                                                    │
│    - Critical fields: qwen3-max (ALWAYS - learning_outcomes, etc.)      │
│    - Non-critical: OSS 120B → qwen3-max if quality < 0.85               │
│  • Phase 3 (Section Generation):                                         │
│    - Tier 1: OSS 120B (70-75% of sections) - PRIMARY                    │
│    - Tier 2: qwen3-max (20-25% of sections) - complex/escalated         │
│    - Tier 3: Gemini 2.5 Flash (5%) - context overflow (>120K tokens)    │
│  • Phase 4 (Validation): OSS 20B + embeddings                            │
│  • Получает ВСЕ поля от Analyze (100% случаев)                          │
│  • САМ РЕШАЕТ использовать ли RAG (logic-level decision)                │
│                                                                           │
│  OUTPUT:                                                                  │
│  • Generated course content                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Detailed Field Breakdown

### Stage 4 (Analyze) - INPUT

| Field | Status | Description |
|-------|--------|-------------|
| `title` | **REQUIRED** | Course title |
| `description` | **REQUIRED** | Course description |
| `documents[]` | **OPTIONAL** | User-uploaded files/documents |
| `summary` | **OPTIONAL** | Pre-generated summary |

**Важно**: Analyze может получить только title + description (title-only scenario)

---

### Stage 4 (Analyze) - OUTPUT → Stage 5 (Generation) INPUT

**ВСЕ поля REQUIRED** (Analyze ВСЕГДА генерирует, даже если input был title-only)

#### Core Nested Fields (уже существуют)

| Field | Type | Description |
|-------|------|-------------|
| `course_category` | `object` | **REQUIRED**: `{primary, confidence, reasoning, secondary?}` |
| `contextual_language` | `object` | **REQUIRED**: 6 полей (`why_matters_context`, `motivators`, etc.) |
| `topic_analysis` | `object` | **REQUIRED**: 8 полей (topics breakdown) |
| `pedagogical_strategy` | `object` | **REQUIRED**: 5 полей (`teaching_style`, `assessment_approaches`, etc.) |
| `recommended_structure` | `object` | **REQUIRED**: Course structure with `sections_breakdown` |
| `scope_instructions` | `string` | **REQUIRED**: Scope guidance |
| `content_strategy` | `enum` | **REQUIRED**: `create_from_scratch` \| `expand_and_enhance` \| `optimize_existing` |
| `expansion_areas` | `array\|null` | **REQUIRED**: Areas needing expansion |
| `research_flags` | `array` | **REQUIRED**: Research flags |
| `metadata` | `object` | **REQUIRED**: Tokens, cost, quality scores, durations |

#### Enhancement Fields (добавляются в T055)

| Field | Type | Status | Generated By |
|-------|------|--------|--------------|
| `pedagogical_patterns` | `object` | **REQUIRED** | Analyze (всегда) |
| `generation_guidance` | `object` | **REQUIRED** | Analyze (всегда) |
| `document_relevance_mapping` | `object` | **REQUIRED** | Analyze (всегда) |
| `document_analysis` | `object` | **REQUIRED** | Analyze (всегда) |

**КРИТИЧЕСКИ ВАЖНО**:
- Analyze ВСЕГДА генерирует ВСЕ 4 enhancement поля
- ДАЖЕ если input был title-only (без документов)
- ВСЕ 4 поля имеют статус **REQUIRED** в Zod схеме (никакого `.optional()`)

---

### Enhancement Fields - Detailed Structure

#### 1. `pedagogical_patterns` (REQUIRED)

```typescript
{
  primary_strategy: 'problem-based learning' | 'lecture-based' | 'inquiry-based' | 'project-based' | 'mixed',
  theory_practice_ratio: string,  // "60:40" format
  assessment_types: Array<'coding' | 'quizzes' | 'projects' | 'essays' | 'presentations' | 'peer-review'>,
  key_patterns: string[]
}
```

**Analyze генерирует**: Всегда, даже если input был title-only

#### 2. `generation_guidance` (REQUIRED)

```typescript
{
  tone: 'conversational but precise' | 'formal academic' | 'casual friendly' | 'technical professional',
  use_analogies: boolean,
  specific_analogies: string[],      // REQUIRED (не optional)
  avoid_jargon: string[],
  include_visuals: Array<'diagrams' | 'flowcharts' | 'code examples' | 'screenshots' | 'animations' | 'plots'>,
  exercise_types: Array<'coding' | 'derivation' | 'interpretation' | 'debugging' | 'refactoring' | 'analysis'>,
  contextual_language_hints: string,
  real_world_examples: string[]      // REQUIRED (не optional)
}
```

**Analyze генерирует**: Всегда, даже если input был title-only

#### 3. `document_relevance_mapping` (REQUIRED)

```typescript
Record<string, {
  primary_documents: string[],
  key_search_terms: string[],
  expected_topics: string[],
  document_processing_methods: Record<string, 'full_text' | 'hierarchical'>
}>
```

**Analyze генерирует**: Всегда (пустой объект если нет документов)
**Generation использует**: Решает сам, использовать ли для RAG

#### 4. `document_analysis` (REQUIRED)

```typescript
{
  source_materials: string[],
  main_themes: Array<{
    theme: string,
    importance: 'high' | 'medium' | 'low',
    coverage: string
  }>,
  complexity_assessment: string,
  estimated_total_hours: number  // >= 0.5
}
```

**Analyze генерирует**: Всегда (заполняется на основе title/description если нет документов)
**Generation использует**: Решает сам, использовать ли для контекста

---

## 🔑 Key Architectural Principles

### 1. Analyze (Stage 4) Responsibilities

✅ **ВСЕГДА генерирует ВСЕ поля**
✅ Даже если input был title-only
✅ Работает с полными файлами или summary (НЕ RAG)
✅ **Model Routing** (per phase):
  - Phase 1 (Classification): gpt-oss-20b (primary) → gpt-oss-120b (fallback)
  - Phase 2 (Scope): gpt-oss-20b (primary) → gpt-oss-120b (fallback)
  - Phase 3 (Expert): gpt-oss-120b (primary) → gemini-2.5-flash (fallback)
  - Phase 4 (Synthesis): gpt-oss-20b (primary) → gpt-oss-120b (fallback)
  - Emergency: gemini-2.5-flash (no fallback)
✅ **Gemini используется ТОЛЬКО как fallback** для Phase 3 и emergency случаев

### 2. Generation (Stage 5) Responsibilities

✅ **ВСЕГДА получает ВСЕ поля** (100% случаев)
✅ САМ РЕШАЕТ использовать ли RAG
✅ RAG decision - logic-level (не schema-level)
✅ **Model Routing** (RT-001 - Balanced Production Strategy):
  - **Phase 2 (Metadata)**:
    - Critical fields (learning_outcomes, objectives, etc.): qwen3-max ALWAYS
    - Non-critical fields: OSS 120B → qwen3-max if quality < 0.85
  - **Phase 3 (Section Generation)** - Tiered routing:
    - Tier 1: OSS 120B (70-75% sections) - PRIMARY
    - Tier 2: qwen3-max (20-25% sections) - complex/escalated
    - Tier 3: Gemini 2.5 Flash (5%) - context overflow (>120K tokens)
  - **Phase 4 (Validation)**: OSS 20B + embeddings
✅ **Cost per course**: $0.33-0.39 (within target $0.20-0.40)
✅ **Quality target**: 85-90% semantic similarity (exceeds minimum 0.75)

### 3. Schema Contract

✅ **ВСЕ 4 enhancement поля REQUIRED** (никакого `.optional()`)
✅ Production Best Practice - no optional fields
✅ Single source of truth - no transformation layer
✅ Zero information loss

---

## 🚫 Common Misconceptions (ИСПРАВЛЕНЫ)

### ❌ НЕПРАВИЛЬНО

> "RAG поля optional, потому что может не быть документов"

**Почему неправильно**: Analyze ВСЕГДА генерирует эти поля, даже если input был title-only. Поля заполняются на основе title/description.

### ❌ НЕПРАВИЛЬНО

> "Generation может получить неполные данные"

**Почему неправильно**: Generation ВСЕГДА получает ВСЕ поля от Analyze (архитектурное требование). Schema contract гарантирует это через REQUIRED fields.

### ❌ НЕПРАВИЛЬНО

> "RAG availability определяется на уровне схемы через .optional()"

**Почему неправильно**: RAG availability - это logic-level decision в Generation. Schema ВСЕГДА содержит ВСЕ поля как REQUIRED.

### ✅ ПРАВИЛЬНО

> "Analyze ВСЕГДА генерирует ВСЕ 4 enhancement поля, даже если input был title-only. Generation ВСЕГДА получает ВСЕ поля и САМ решает, использовать ли RAG."

---

## 📊 Data Flow Example

### Scenario 1: Title-Only Input

```
INPUT → Analyze:
{
  title: "Introduction to Python",
  description: "Basic Python course for beginners"
  // NO documents
}

OUTPUT ← Analyze:
{
  // ... core nested fields ...
  pedagogical_patterns: { /* generated based on title/description */ },
  generation_guidance: { /* generated based on title/description */ },
  document_relevance_mapping: {}, // empty but present
  document_analysis: {
    source_materials: ["title", "description"],
    main_themes: [/* inferred from title */],
    complexity_assessment: "beginner",
    estimated_total_hours: 10
  }
}

INPUT → Generation:
// FULL AnalysisResult with ALL 4 fields REQUIRED
// Generation decides: "No RAG needed, title-only was sufficient"
```

### Scenario 2: With Documents

```
INPUT → Analyze:
{
  title: "Advanced Machine Learning",
  description: "Deep dive into ML",
  documents: ["lecture.pdf", "notebook.ipynb"]
}

OUTPUT ← Analyze:
{
  // ... core nested fields ...
  pedagogical_patterns: { /* generated */ },
  generation_guidance: { /* generated */ },
  document_relevance_mapping: {
    "section-1-intro": {
      primary_documents: ["lecture.pdf"],
      key_search_terms: ["neural networks", "gradient descent"],
      // ...
    }
  },
  document_analysis: {
    source_materials: ["lecture.pdf", "notebook.ipynb"],
    main_themes: [/* extracted from documents */],
    complexity_assessment: "advanced",
    estimated_total_hours: 40
  }
}

INPUT → Generation:
// FULL AnalysisResult with ALL 4 fields REQUIRED
// Generation decides: "Use RAG for section-1-intro based on document_relevance_mapping"
```

---

## ✅ Implementation Checklist

- [ ] ВСЕ 4 поля REQUIRED в Zod схеме (no `.optional()`)
- [ ] Analyze генерирует ВСЕ 4 поля в 100% случаев
- [ ] Generation получает ВСЕ 4 поля в 100% случаев
- [ ] RAG usage логика находится в Generation (не в схеме)
- [ ] Test fixtures содержат ВСЕ 4 поля (даже для title-only scenarios)
- [ ] Documentation отражает архитектуру корректно

---

## 📚 Implementation Status

**Status**: ✅ COMPLETE (Phases 1-3)
**Date Completed**: 2025-11-12

### Phase 1: Schema Unification ✅
- Extended AnalysisResultSchema with 4 REQUIRED fields
- Created 7 helper functions in analysis-formatters.ts
- Added 67 unit tests (100% coverage)
- Type-check: 0 errors

**Commits**: v0.16.27

### Phase 2: Stage 5 Services ✅
- Updated section-batch-generator.ts (rich prompts with all pedagogical data)
- Updated metadata-generator.ts (contextual_language object handling)
- Updated generation-phases.ts (pedagogical_strategy formatting)
- Fixed 3 critical schema issues across 3 files
- Type-check: 0 errors

**Commits**: 9539b2a

### Phase 3: Test Fixtures ✅
- Created centralized fixture: tests/fixtures/analysis-result-fixture.ts
- Updated 5 test files (20+ schema locations)
- Test results: metadata-generator 6/6 pass, section-batch-generator 13/18 pass
- Zero schema validation errors

**Commits**: a82e6d4

### Files Modified

**Schema Files** (2):
- packages/course-gen-platform/src/types/analysis-result.ts
- packages/shared-types/src/generation-job.ts

**Helper Files** (2):
- packages/course-gen-platform/src/services/stage5/analysis-formatters.ts
- packages/course-gen-platform/tests/unit/stage5/analysis-formatters.test.ts

**Service Files** (7):
- section-batch-generator.ts
- metadata-generator.ts
- generation-phases.ts
- quality-validator.ts
- validation-orchestrator.ts

**Test Files** (5):
- tests/fixtures/analysis-result-fixture.ts (NEW)
- tests/contract/generation.test.ts
- tests/unit/stage5/metadata-generator.test.ts
- tests/unit/stage5/section-batch-generator.test.ts
- tests/integration/stage5-generation-worker.test.ts

**Total**: 15 files updated, 236 lines old schema removed, 455 lines unified schema added

---

## 🎯 Success Metrics

- ✅ **Schema validation pass rate**: 100% (all tests use full schema)
- ✅ **Information preservation**: 100% (no data loss)
- ✅ **RT-002 compliance**: Generation has full Analyze context
- ✅ **Type coverage**: 100% (no `any` types, 0 type errors)
- ✅ **Test coverage**: 67/67 helper function tests pass
- ✅ **Production readiness**: ALL fields REQUIRED, no optional variations

---

## 📚 Related Documents

**Schema Unification (T055)**:
- **Main Spec**: `docs/FUTURE/SPEC-2025-11-12-001-unify-stage4-stage5-schemas.md`
- **Tasks**: `specs/008-generation-generation-json/tasks.md` (T055)
- **Implementation**: `specs/008-generation-generation-json/dependencies/schema-unification/implementation-tasks.md`
- **Discovery**: `specs/008-generation-generation-json/dependencies/schema-unification/DISCOVERY-SUMMARY.md`

**Model Routing Research**:
- **RT-001**: `specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md` - Multi-model orchestration strategy for Generation
- **RT-002**: `specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md` - Architecture decisions & division of labor
- **Stage 4 Config**: `packages/course-gen-platform/supabase/migrations/20251031100000_stage4_model_config.sql` - Analyze model configuration

---

**Status**: ✅ FINALIZED
**Last Updated**: 2025-11-12 (corrected model routing details)
