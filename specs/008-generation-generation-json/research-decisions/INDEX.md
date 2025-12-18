# Research Decisions Index - Quick Navigation

**Location**: `specs/008-generation-generation-json/research-decisions/`

---

## Quick Start Guide

**New to the project?** Start here:
1. Read `README.md` for overview
2. Read `rt-002-architecture-balance.md` for key decisions
3. Read `rt-003-token-budget.md` for constants

**Implementing specific task?** Jump to:
- **T019** (metadata-generator) → `rt-002-architecture-balance.md` (Division of Labor)
- **T020** (section-batch-generator) → `rt-002-architecture-balance.md` + `rt-002-rag-decision.md` (RAG integration)
- **T021** (buildBatchPrompt) → `rt-002-architecture-balance.md` (Prompt Engineering)
- **T022** (qdrant-search) → `rt-002-rag-decision.md` (Tool-calling interface)
- **T029-A/B/C** (orchestration) → `rt-002-architecture-balance.md` (5-phase workflow)

---

## Document Map

### 📋 Entry Points

| File | Size | Purpose | Read Time |
|------|------|---------|-----------|
| `README.md` | 6KB | Directory overview, document structure | 3 min |
| `INDEX.md` | This file | Quick navigation guide | 1 min |

### 🎯 Quick References (Start Here)

| File | Size | Purpose | Read Time |
|------|------|---------|-----------|
| `rt-002-architecture-balance.md` | 9KB | **4 key decisions** (Division of Labor, 5-Phase, RAG, Granularity) | 10 min |
| `rt-003-token-budget.md` | 11KB | **Token budget constants** (MUST use in implementations) | 10 min |

### 📖 Full Analysis (Deep Dive)

| File | Size | Purpose | Read Time |
|------|------|---------|-----------|
| `rt-002-full-analysis.md` | 24KB | Complete research findings (565 lines) | 30 min |
| `rt-002-rag-decision.md` | 27KB | RAG pros/cons, scenarios, cost-benefit (850 lines) | 40 min |

### 📊 Implementation Tracking

| File | Size | Purpose | Read Time |
|------|------|---------|-----------|
| `rt-002-tasks-updated-summary.md` | 13KB | Tasks updated log, references audit | 15 min |

---

## By Research Task

### RT-002: Architecture Balance
**Status**: ✅ COMPLETE

**Documents**:
- Quick: `rt-002-architecture-balance.md` (9KB)
- Full: `rt-002-full-analysis.md` (24KB)
- RAG: `rt-002-rag-decision.md` (27KB)
- Summary: `rt-002-tasks-updated-summary.md` (13KB)

**Key Decisions**:
1. Division of Labor: Analyze (section-level) → Generation (lesson-level)
2. 5-Phase Architecture: Metadata → Section Batch → Validation → Assembly → Verification (78.5% success rate)
3. Optional RAG: LLM autonomy via `search_documents` tool (2-5 queries optimal)
4. Granularity: Section-level in Analyze (3-7 sections), Lesson-level in Generation (3-5 per section)

**Referenced in**: T002-R, T019, T020, T021, T022, T029-A, T029-B, T029-C (8 tasks)

---

### RT-003: Token Budget Allocation
**Status**: ✅ COMPLETE

**Documents**:
- `rt-003-token-budget.md` (11KB)

**Key Constants** (MUST use):
```typescript
const TOKEN_BUDGET = {
  TOTAL_BUDGET: 120_000,           // Input + output combined
  INPUT_BUDGET_MAX: 90_000,        // 75% for input
  RAG_MAX_TOKENS: 40_000,          // Maximum RAG context
  GEMINI_TRIGGER_INPUT: 108_000,   // 90% threshold
  GEMINI_TRIGGER_TOTAL: 115_000,   // 96% threshold
};
```

**Referenced in**: T003-R, T019, T020, T022 (4 tasks)

---

### RT-001: Multi-Model Orchestration
**Status**: ⏭️ PENDING ANALYSIS

**DeepResearch**: ✅ COMPLETE (3 reports, ~90KB in `docs/research/008-generation/`)

**Goal**: Determine when to use qwen3-max vs OSS models per phase

**Will Define**:
- Model selection per phase (metadata, sections, validation)
- qwen3-max invocation triggers
- Escalation chain (OSS 20B → OSS 120B → qwen3-max → Gemini)
- Cost optimization rules

**Will Update**: T019 (model selection), T020 (escalation triggers), T029-B (phase models)

---

### RT-004: Quality Validation and Retry Logic
**Status**: ⏭️ PENDING ANALYSIS

**DeepResearch**: ✅ COMPLETE (1 report, ~40KB in `docs/research/008-generation/`)

**Goal**: Define quality thresholds, retry strategies, failure handling

**Will Define**:
- Quality threshold per phase (0.75 for all or vary?)
- Max retry attempts (2-3?)
- Retry parameter adjustments (prompt, temperature, model)
- Failure handling (hard fail, partial results, manual review)

**Will Update**: T026 (QualityValidator), T029-B (validateQuality phase)

---

### RT-006: Bloom's Taxonomy Validation
**Status**: ⏭️ PENDING ANALYSIS

**DeepResearch**: ✅ COMPLETE (1 report, ~26KB in `docs/research/008-generation/`)

**Goal**: Extract action verbs whitelist, topic specificity rules, duration formula

**Will Define**:
- Bloom's verbs whitelist (EN + RU)
- Generic topics blacklist
- Minimum duration per topic
- Implementation location (Zod refine vs utility)

**Will Update**: T017 (MinimumLessonsValidator), lesson validation schemas

---

## By Implementation Task

### T002-R: Architecture Design
**Read**: `rt-002-architecture-balance.md`
**Status**: ✅ COMPLETE

### T019: metadata-generator.ts
**Read**:
- `rt-002-architecture-balance.md` (Division of Labor)
- `rt-003-token-budget.md` (Token limits)

**Key Points**:
- Generation creates course-level metadata from Analyze's section-level structure
- Model selection: RT-001 pending (sparse Analyze output from minimal user input: qwen3-max, rich Analyze output: OSS 120B/20B)

### T020: section-batch-generator.ts
**Read**:
- `rt-002-architecture-balance.md` (Lesson-level expansion)
- `rt-002-rag-decision.md` (RAG integration)
- `rt-003-token-budget.md` (Token limits)

**Key Points**:
- Expand sections → 3-5 lessons (adaptive based on complexity)
- OPTIONAL `qdrantClient?: QdrantClient` parameter
- LLM autonomy: 2-5 queries optimal

### T021: buildBatchPrompt()
**Read**: `rt-002-architecture-balance.md` (Prompt Engineering section)

**Key Points**:
- Let reasoning models reason - provide constraints, NOT instructions
- Over-specification reduces quality by 15-30%

### T022: qdrant-search.ts
**Read**: `rt-002-rag-decision.md` (full document)

**Key Points**:
- Tool-calling interface: `createSearchDocumentsTool()`
- Tool name: `search_documents`
- When enabled: Specialized/compliance courses
- Cost: +5-12% | Quality: +10-15% specialized, +30-50% compliance

### T029-A: generation-state.ts
**Read**: `rt-002-architecture-balance.md` (5-Phase section)

**Key Points**:
- 5 phases: validate_input, generate_metadata, generate_sections, validate_quality, validate_lessons
- `current_phase` type: explicit union of 5 values

### T029-B: generation-phases.ts
**Read**:
- `rt-002-architecture-balance.md` (5-Phase workflow)
- `rt-002-rag-decision.md` (Optional RAG parameter)

**Key Points**:
- Constructor: add `QdrantClient?` parameter
- generateSections: pass `qdrantClient` if available

### T029-C: generation-orchestrator.ts
**Read**: `rt-002-architecture-balance.md` (Orchestration section)

**Key Points**:
- LangGraph StateGraph coordinating 5-phase workflow
- `execute()` signature: add `qdrantClient?: QdrantClient` parameter

---

## Navigation Tips

**Finding Specific Topics**:
- **Division of Labor**: `rt-002-architecture-balance.md` → Section 1
- **5-Phase Architecture**: `rt-002-architecture-balance.md` → Section 2
- **RAG Strategy**: `rt-002-rag-decision.md` → Full document
- **Prompt Engineering**: `rt-002-architecture-balance.md` → Section 3
- **Token Budget**: `rt-003-token-budget.md` → Section 4
- **Schema Changes**: `rt-002-architecture-balance.md` → Section 5

**By Question**:
- "What does Analyze output?" → `rt-002-architecture-balance.md` (Division of Labor)
- "What does Generation create?" → `rt-002-architecture-balance.md` (Division of Labor)
- "When should I use RAG?" → `rt-002-rag-decision.md` (Scenarios section)
- "How many lessons per section?" → `rt-002-architecture-balance.md` (Granularity section)
- "What are the token limits?" → `rt-003-token-budget.md` (Constants section)
- "How does LLM decide to use RAG?" → `rt-002-rag-decision.md` (Tool-calling section)

---

## Version History

- **2025-11-07**: Initial creation
  - RT-002 complete (4 documents)
  - RT-003 complete (1 document)
  - 8 tasks updated in tasks.md
  - 15+ references to research-decisions/

---

**Last Updated**: 2025-11-07
