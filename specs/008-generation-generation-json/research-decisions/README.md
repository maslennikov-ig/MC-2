# Research Decisions - Stage 5 Generation Phase

**Purpose**: Permanent storage for research findings and architectural decisions for Feature 008 (Generation Phase).

**Location**: `specs/008-generation-generation-json/research-decisions/`

---

## Document Structure

### RT-002: Architecture Balance (Analyze-Generation Division of Labor)

**Status**: ✅ COMPLETE (2025-11-07)

**Documents**:
1. **`rt-002-architecture-balance.md`** (Quick Reference - 180 lines)
   - 4 key decisions (Division of Labor, Orchestration Phases, RAG Strategy, Granularity)
   - Schema enhancements required
   - Implementation priorities
   - Prompt engineering guidelines
   - References for task execution

2. **`rt-002-full-analysis.md`** (Full Analysis - 565 lines)
   - Complete research findings from 2 DeepResearch reports (~67KB)
   - Division of labor (Analyze section-level, Generation lesson-level)
   - Document extraction strategy (full-context vs RAG)
   - Prompt engineering responsibility
   - 5-phase orchestration architecture
   - Production validation (78.5% success rate)

3. **`rt-002-rag-decision.md`** (RAG Decision Analysis - 850 lines)
   - Context flow: How Generation receives information
   - 4 scenarios (when RAG needed vs not needed)
   - Optional RAG architecture (LLM autonomy via tool calling)
   - Cost-benefit analysis (+5-12% cost, +10-50% quality)
   - Pros/cons comparison (14 pros, 6 cons)
   - Final recommendation: Enable optional RAG

**Key Findings**:
- **Division of Labor**: Analyze → section-level (3-7 sections), Generation → lesson-level (3-5 per section)
- **5-Phase Architecture**: Metadata → Section Batch → Validation → Assembly → Verification (78.5% success rate)
- **Optional RAG**: LLM autonomy via `search_documents` tool (2-5 queries optimal, NOT 20+)
- **Prompt Engineering**: Let reasoning models reason - provide constraints, NOT instructions (over-specification reduces quality by 15-30%)

**Research Source**: 2 DeepResearch reports (total ~67KB), production system validation (Khan Academy, Notion AI, RudderStack)

---

### RT-003: Token Budget Allocation

**Status**: ✅ COMPLETE (2025-11-07)

**Documents**:
1. **`rt-003-token-budget.md`** (Token Budget Validation - 11KB)
   - Finalized constants (MUST use in all implementations):
     ```typescript
     const TOKEN_BUDGET = {
       TOTAL_BUDGET: 120_000,           // Input + output combined
       INPUT_BUDGET_MAX: 90_000,        // 75% for input
       RAG_MAX_TOKENS: 40_000,          // Maximum RAG context per batch
       GEMINI_TRIGGER_INPUT: 108_000,   // 90% threshold (trigger Gemini)
       GEMINI_TRIGGER_TOTAL: 115_000,   // 96% threshold (safety margin)
     };
     ```
   - 4 validation scenarios tested and passed
   - Dynamic RAG adjustment strategy
   - Gemini fallback triggers

**Key Findings**:
- Per-batch architecture: 120K total (90K input, 30K output)
- RAG max: 40K tokens (validated in Scenario 2)
- Gemini fallback: >108K input OR >115K total
- Validation results: Standard (37% usage), RAG-heavy (74% usage), Overflow (97% → Gemini)

**Integration Points**: metadata-generator.ts, section-batch-generator.ts, qdrant-search.ts

---

## Pending Research Tasks

### RT-001: Multi-Model Orchestration Strategy
**Status**: ⏭️ PENDING ANALYSIS
**DeepResearch**: ✅ COMPLETE (3 reports, 2 systems, ~90KB)
**Location**: `docs/research/008-generation/`
**Goal**: Determine when to use qwen3-max vs OSS models per phase

### RT-004: Quality Validation and Retry Logic
**Status**: ⏭️ PENDING ANALYSIS
**DeepResearch**: ✅ COMPLETE (1 report, ~40KB)
**Location**: `docs/research/008-generation/`
**Goal**: Define quality thresholds, retry strategies, failure handling

### RT-006: Bloom's Taxonomy Validation
**Status**: ⏭️ PENDING ANALYSIS
**DeepResearch**: ✅ COMPLETE (1 report, ~26KB)
**Location**: `docs/research/008-generation/`
**Goal**: Extract action verbs whitelist, topic specificity rules, duration formula

---

## Usage in Tasks

**Referenced in tasks.md** (15+ references):
- T002-R: Architecture design (marked complete with decisions)
- T019: metadata-generator.ts (division of labor context)
- T020: section-batch-generator.ts (RAG integration, lesson-level expansion)
- T021: buildBatchPrompt() (prompt engineering guidelines)
- T022: qdrant-search.ts (RAG strategy, tool-calling interface)
- T029-A: generation-state.ts (5-phase types)
- T029-B: generation-phases.ts (phase implementations with RAG)
- T029-C: generation-orchestrator.ts (StateGraph with optional RAG)

**How to Use**:
1. **Quick Reference**: Start with `rt-002-architecture-balance.md` or `rt-003-token-budget.md`
2. **Deep Dive**: Read full analysis if implementing specific decisions
3. **RAG Decision**: Consult `rt-002-rag-decision.md` for pros/cons when enabling RAG
4. **Constants**: Use exact values from `rt-003-token-budget.md` (no modifications)

---

## Document Maintenance

**Creation**: Documents created after DeepResearch analysis completes
**Updates**: Append new findings, mark sections as UPDATED with date
**Deprecation**: Mark outdated sections with ~~strikethrough~~ and date
**Archive**: Move superseded documents to `archive/` subdirectory if needed

**Version History**:
- 2025-11-07: RT-002 complete (3 documents), RT-003 complete (1 document)
- Pending: RT-001, RT-004, RT-006 analysis

---

## Related Locations

**DeepResearch Reports** (raw research outputs):
- `docs/research/008-generation/` - All research reports from external systems

**Temporary Planning** (ephemeral):
- `.tmp/current/plans/` - Temporary decision documents (DO NOT reference in tasks)

**Spec Documents** (feature specification):
- `specs/008-generation-generation-json/spec.md` - Feature requirements
- `specs/008-generation-generation-json/plan.md` - Implementation plan
- `specs/008-generation-generation-json/tasks.md` - Task breakdown

**Implementation Code** (when complete):
- `packages/course-gen-platform/src/services/stage5/` - Stage 5 services

---

**Document Status**: ✅ Active - Reference these documents during implementation
