# Research Findings: Stage 4 Analysis

**Date**: 2025-10-31
**Feature**: Course Content Analysis (Stage 4)
**Status**: Research Complete

## Overview

This document captures research decisions and findings for implementing Stage 4 (Course Content Analysis). All unknowns from the Technical Context have been resolved through analysis of existing infrastructure (Stage 0-3) and the n8n MVP workflow.

## 1. Multi-Phase Multi-Model Orchestration Strategy

### Decision: 5-Phase Architecture with Per-Phase Model Selection

**Background**: n8n MVP used single hardcoded model (x-ai/grok-4-fast) for entire analysis. This approach has two problems:
1. **Overuse of expensive models** - simple tasks (classification) don't need powerful models
2. **Underuse of expert models** - critical decisions (pedagogy, research flags) need best models from start

**Research Findings**:

From Stage 3 implementation, we learned:
- Hierarchical chunking with adaptive compression requires ~115K token chunks
- Quality validation via semantic similarity (0.75 threshold) ensures reliable LLM output
- Model escalation (GPT OSS 20B → 120B → Gemini 2.5 Flash) proven effective

From n8n workflow (`DataAnalyze.js`):
- Current analysis produces: `course_category`, `topic_analysis`, `recommended_structure`, `pedagogical_strategy`, `scope_instructions`, `expansion_areas`, `contextual_language`
- Zod schema validation with 2 retry attempts
- No phase separation - everything in one monolithic prompt

**Chosen Approach**: Multi-Phase Multi-Model Orchestration

| Phase | Task | Model | Rationale |
|-------|------|-------|-----------|
| **Phase 0** | Pre-flight validation | No LLM | Check Stage 3 barrier (100% doc completion), validate inputs |
| **Phase 1** | Basic classification | `openai/gpt-oss-20b` | Simple categorization (6 categories), fast & cheap |
| **Phase 2** | Scope analysis | `openai/gpt-oss-20b` | Mathematical estimation (lesson count, hours), doesn't need expertise |
| **Phase 3** | Deep expert analysis | `openai/gpt-oss-120b` ALWAYS | Research flags, pedagogy, expansion areas require nuance |
| **Phase 4** | Document synthesis | Adaptive (20B <3 docs, 120B ≥3 docs) | Complexity depends on document count |
| **Phase 5** | Final assembly | No LLM | Combine all phase outputs into final analysis result |

**Retry Strategy**:
- Cheap phases (1, 2, 4-simple): 2 attempts on primary model → escalate to 120B on failure
- Expensive phase (3): 2 attempts on 120B → escalate to Emergency model (Gemini 2.5 Flash) on failure
- Emergency model: Only for context overflow or Phase 3 failure (<1% expected usage)

**Benefits**:
- ~40-50% cost reduction vs always using 120B
- Critical decisions (pedagogy, research flags) get best model from start (no retry-based escalation)
- Per-phase model configuration in admin panel (global defaults + per-course overrides)
- Pattern extends to Stages 5-7 (same philosophy applies)

**Alternatives Considered & Rejected**:
1. ❌ **Single powerful model for everything** - Expensive, wasteful for simple tasks
2. ❌ **Escalation-only approach** (always start cheap, retry with expensive) - Critical tasks fail first, then retry = quality risk
3. ❌ **Framework-based orchestration** (LangChain, LlamaIndex) - Stage 3 proved Direct OpenAI SDK simpler and faster

## 2. Research Flag Detection Strategy

### Decision: Conservative LLM-Based Detection with 120B Model

**Background**: Research flags mark time-sensitive content requiring web search (future feature). Over-flagging wastes resources; under-flagging misses critical updates.

**Research from n8n MVP**:
- No research flag detection in current workflow
- Specification added this as new requirement (FR-007, FR-009)

**Chosen Approach**: Production-Ready Conservative Detection

**Method**: Use 120B model in Phase 3 (Deep Expert Analysis) with very conservative prompt:
- Flag ONLY if: (1) Information becomes outdated within 6 months AND (2) Explicit references to laws/regulations/tech versions
- Minimize false positives - better to miss a flag than add unnecessary ones (aligns with FR-009)
- Examples of flaggable content:
  - Legal/regulatory: "Постановление 1875", "procurement law", "GDPR compliance"
  - Technology: "React 19 features", "Node.js 22 breaking changes"
- Examples of NON-flaggable content:
  - General programming concepts (functions, loops, OOP)
  - Timeless skills (communication, leadership)
  - Creative techniques (watercolor painting, Tarot reading)

**Rationale**:
- **120B model from start**: Requires nuanced understanding of time-sensitivity (not a simple keyword match)
- **No hardcoded keywords**: Flexible, adapts to any domain
- **Conservative philosophy**: <5% flag rate expected (success metric SC-004)

**Alternatives Considered & Rejected**:
1. ❌ **Hardcoded keyword list** - Brittle, doesn't scale to all domains
2. ❌ **Always flag legal/regulatory topics** - Over-flagging, wastes resources
3. ❌ **User-specified research requirements** - Adds UX complexity, most users don't know what needs research

## 3. Contextual Language Generation

### Decision: Category-Specific Template Adaptation

**Background**: n8n MVP v6.2 includes `contextual_language` with 6 fields:
- `why_matters_context`
- `motivators`
- `experience_prompt`
- `problem_statement_context`
- `knowledge_bridge`
- `practical_benefit_focus`

From `DataAnalyze.js` (lines 79-122), we have templates for 6 categories:
- `professional`, `personal`, `creative`, `hobby`, `spiritual`, `academic`

**Research Findings**:
- Each category has unique motivators (e.g., "career advancement" for professional, "artistic mastery" for creative)
- Templates need to be adapted to specific course topic (not just copied)
- n8n prompt (lines 273-335) provides detailed examples for each field

**Chosen Approach**: Template-Based Adaptation in Phase 1

**Implementation**:
1. Phase 1 determines course category (primary + optional secondary)
2. Select base template for detected category
3. Adapt each field to specific course topic (e.g., "React Hooks" → "for advancing your career as a modern React developer")
4. Validate field lengths (TARGET: 100-200 chars, MAX: 300-600 chars for flexibility)

**Example Adaptation** (from n8n prompt):
- Topic: "React Hooks"
- Category: `professional` (confidence: 0.95)
- `why_matters_context`: "for advancing your career as a modern React developer"
- `motivators`: "career advancement through modern React expertise, efficient component development with hooks, professional credibility using latest patterns, competitive advantage"

**Rationale**:
- Proven pattern from n8n MVP v6.2
- Category detection = simple task (suitable for 20B model in Phase 1)
- Template adaptation ensures consistency while allowing customization

**Alternatives Considered & Rejected**:
1. ❌ **Freeform LLM generation** - Inconsistent, no structure
2. ❌ **Hardcoded per-topic** - Doesn't scale to unlimited topics
3. ❌ **Skip contextual language** - User experience degradation, less engaging courses

## 4. Minimum Lesson Constraint Enforcement

### Decision: Hard Validation with User-Facing Error (No Retries)

**Background**: Spec requires minimum 10 lessons (FR-015, A-008). If estimated course <10 lessons, job must fail with clear error.

**Research from n8n MVP**:
- No minimum constraint enforced (can generate courses with <10 lessons)
- Specification added this as new requirement

**Chosen Approach**: Hard Validation in Phase 2 (Scope Analysis)

**Implementation**:
1. Phase 2 calculates `total_lessons = Math.ceil((estimated_hours * 60) / lesson_duration_minutes)`
2. If `total_lessons < 10`:
   - Set job status = `failed`
   - Return error: "Insufficient scope for minimum 10 lessons (estimated: {count}). Please expand topic or provide additional requirements."
   - NO RETRIES (not a model quality issue, user must refine input)
3. If `total_lessons >= 10`: Proceed to Phase 3

**Rationale**:
- Clear user feedback (not a technical failure)
- Forces users to provide sufficient scope (improves overall course quality)
- No maximum limit (courses can have 100+ lessons if needed)

**Alternatives Considered & Rejected**:
1. ❌ **Auto-expand to 10 lessons** - Padding with filler content, degrades quality
2. ❌ **Retry with "make it bigger" prompt** - LLM can't invent requirements user didn't provide
3. ❌ **Warning only** - Violates hard constraint (A-008)

## 5. Stage 3 Barrier Enforcement

### Decision: Pre-Flight Check with RPC Validation

**Background**: Stage 3 must be 100% complete before Stage 4 starts (FR-016, A-002). Any failed/missing document summarization = hard failure.

**Research from Stage 3**:
- `stage-barrier.ts` service implemented in Stage 3
- RPC: `validate_stage4_barrier(course_id)` checks all documents have `processing_status = 'completed'`
- Returns: `{ allowed: boolean, failed_documents: [], reason: string }`

**Chosen Approach**: Reuse Stage 3 Barrier Service in Phase 0

**Implementation** (Phase 0 - Pre-Flight Validation):
```typescript
import { validateStage4Barrier } from '@/services/stage-barrier';

// Before starting any LLM work
const barrierCheck = await validateStage4Barrier(courseId);

if (!barrierCheck.allowed) {
  throw new Error(`Stage 3 barrier failed: ${barrierCheck.reason}. ${barrierCheck.failed_documents.length} documents incomplete.`);
}
```

**Rationale**:
- Reuses proven code from Stage 3 (DRY principle)
- Fails fast (before expensive LLM calls)
- Clear error message for user/admin

**Alternatives Considered & Rejected**:
1. ❌ **Skip barrier check, use raw content** - Violates data integrity (Constitution Principle I)
2. ❌ **Soft warning, continue anyway** - Garbage-in-garbage-out scenario
3. ❌ **Implement new barrier logic** - Reinventing wheel, Stage 3 service already exists

## 6. Real-Time Progress Tracking

### Decision: 6-Phase Progress Updates via RPC (30s-10min Window)

**Background**: Analysis takes 30s-10min. User needs real-time feedback. Spec (FR-018) requires multi-stage progress on Course Management Page.

**Research from Stage 1**:
- `update_course_progress` RPC (Stage 1 migration)
- Accepts: `course_id`, `step` (enum), `progress` (0-100), `message` (Russian), `metadata` (JSONB)
- Pattern: Each stage reports progress within its range

**Chosen Approach**: 6-Phase Progress Updates

| Phase | Progress Range | Russian Message | Duration Estimate |
|-------|---------------|-----------------|-------------------|
| Phase 0 | 0-10% | "Проверка документов..." | ~5-10s |
| Phase 1 | 10-25% | "Базовая категоризация курса..." | ~10-20s |
| Phase 2 | 25-45% | "Оценка объема и структуры..." | ~15-30s |
| Phase 3 | 45-75% | "Глубокий экспертный анализ..." | ~30-60s (120B model) |
| Phase 4 | 75-90% | "Синтез документов..." | ~20-40s (depends on doc count) |
| Phase 5 | 90-100% | "Финализация анализа..." | ~5-10s |

**Implementation**:
```typescript
// At start of each phase
await updateCourseProgress(courseId, 'analyzing_task', phaseStartPercent, phaseMessage);

// During phase (if long-running)
await updateCourseProgress(courseId, 'analyzing_task', phaseStartPercent + subProgress, phaseMessage);

// At phase completion
await updateCourseProgress(courseId, 'analyzing_task', phaseEndPercent, phaseMessage);
```

**Rationale**:
- Granular feedback improves UX (users see system is working)
- Matches Stage 3 pattern (proven in production)
- Russian messages align with target audience

**Alternatives Considered & Rejected**:
1. ❌ **Single progress bar (0-100%)** - No visibility into which phase is running
2. ❌ **No progress updates** - Users think system is frozen (10min timeout is long!)
3. ❌ **English messages** - Inconsistent with frontend localization

## 7. Model Configuration Storage

### Decision: Database Table with Global Defaults + Per-Course Overrides

**Background**: Admin panel must allow SuperAdmin to configure models per phase (FR-017). Per-course overrides needed for troubleshooting.

**Chosen Approach**: `llm_model_config` Table

**Schema**:
```sql
CREATE TABLE llm_model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type TEXT NOT NULL, -- 'global' | 'course_override'
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE, -- NULL for global
  phase_name TEXT NOT NULL, -- 'phase_1_classification', 'phase_2_scope', 'phase_3_expert', 'phase_4_synthesis', 'emergency'
  model_id TEXT NOT NULL, -- 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'google/gemini-2.5-flash'
  fallback_model_id TEXT, -- Used if primary fails
  temperature NUMERIC(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_global_phase UNIQUE (config_type, phase_name) WHERE config_type = 'global',
  CONSTRAINT unique_course_phase UNIQUE (course_id, phase_name) WHERE config_type = 'course_override'
);

CREATE INDEX idx_llm_model_config_course ON llm_model_config(course_id) WHERE course_id IS NOT NULL;
```

**Lookup Logic**:
```typescript
async function getModelForPhase(courseId: string, phaseName: string): Promise<ModelConfig> {
  // 1. Check for course-specific override
  const override = await db
    .select()
    .from(llmModelConfig)
    .where(and(
      eq(llmModelConfig.configType, 'course_override'),
      eq(llmModelConfig.courseId, courseId),
      eq(llmModelConfig.phaseName, phaseName)
    ))
    .limit(1);

  if (override.length > 0) return override[0];

  // 2. Fall back to global default
  const global = await db
    .select()
    .from(llmModelConfig)
    .where(and(
      eq(llmModelConfig.configType, 'global'),
      eq(llmModelConfig.phaseName, phaseName)
    ))
    .limit(1);

  if (global.length > 0) return global[0];

  // 3. Fall back to hardcoded defaults
  return PHASE_DEFAULTS[phaseName];
}
```

**Rationale**:
- Flexible (SuperAdmin can change models without code deploy)
- Per-course override for troubleshooting edge cases
- Follows database-driven configuration pattern (proven in Stage 0-1)

**Alternatives Considered & Rejected**:
1. ❌ **Environment variables** - Requires redeploy for changes, no per-course override
2. ❌ **JSON config file** - Requires file system access, no per-course override
3. ❌ **Hardcoded** - No flexibility, violates Constitution Principle VII

## 8. Quality Validation Strategy

### Decision: Reuse Stage 3 Semantic Similarity Patterns

**Background**: Stage 3 implemented quality validation via Jina-v3 embeddings (0.75 semantic similarity threshold). Can we reuse this for Stage 4?

**Research from Stage 3**:
- `quality-validator.ts` service
- Method: `validateQuality(original: string, generated: string): Promise<{ score: number, passed: boolean }>`
- Threshold: 0.75 (adjustable)
- Used for: Validating LLM summaries against original documents

**Chosen Approach**: Phase-Specific Quality Validation

**Implementation**:
```typescript
// Phase 3 (Expert Analysis) - validate research flags
const researchFlagsPrompt = "List topics requiring up-to-date information";
const researchFlagsOutput = await llmClient.invoke(researchFlagsPrompt);
const validationScore = await qualityValidator.validateQuality(researchFlagsPrompt, researchFlagsOutput.research_flags);

if (!validationScore.passed) {
  // Retry with different prompt or escalate model
}
```

**Rationale**:
- Proven pattern from Stage 3
- Ensures LLM output is semantically aligned with expectations
- Prevents hallucinations/off-topic responses

**Alternatives Considered & Rejected**:
1. ❌ **No quality validation** - Risk of hallucinations, low-quality output
2. ❌ **Only Zod schema validation** - Catches structure errors but not semantic quality
3. ❌ **Manual review** - Not scalable, defeats automation purpose

## 9. Cost Tracking Integration

### Decision: Per-Phase Token Tracking with Stage 3 Calculator

**Background**: Stage 3 implemented comprehensive cost tracking (`cost-calculator.ts`, 3 tRPC endpoints). Can we extend this for Stage 4?

**Research from Stage 3**:
- `CostCalculator` class with 5 model pricing profiles
- Methods: `calculateCost(inputTokens, outputTokens, modelId)`
- Already tracks per-document, per-organization, per-model costs

**Chosen Approach**: Extend Cost Tracking for Per-Phase Analytics

**Implementation**:
```typescript
// In each phase
const phaseStart = Date.now();
const response = await llmClient.invoke(prompt, { modelId });
const phaseEnd = Date.now();

await costCalculator.logUsage({
  organizationId,
  courseId,
  phase: 'phase_3_expert',
  modelId: response.modelId,
  inputTokens: response.usage.inputTokens,
  outputTokens: response.usage.outputTokens,
  durationMs: phaseEnd - phaseStart,
  cost: costCalculator.calculateCost(response.usage.inputTokens, response.usage.outputTokens, response.modelId)
});
```

**New Metrics**:
- Cost per phase (breakdown: Phase 1 $0.10, Phase 2 $0.15, Phase 3 $1.20, Phase 4 $0.50)
- Model usage frequency per phase (90% Phase 1 = 20B, 10% Phase 1 = 120B after retry)
- Average duration per phase (helps identify bottlenecks)

**Rationale**:
- Reuses Stage 3 infrastructure (DRY)
- Per-phase breakdown enables ROI analysis (is Phase 3's 120B worth the cost?)
- Alerts if Phase 3 frequently requires Emergency model (indicates 120B insufficient)

**Alternatives Considered & Rejected**:
1. ❌ **No cost tracking** - Can't optimize costs without data
2. ❌ **Total cost only** - Can't identify which phases are expensive
3. ❌ **Manual tracking** - Error-prone, not real-time

## 10. Testing Strategy

### Decision: 3-Layer Testing (Unit, Contract, Integration)

**Background**: Stage 3 achieved 41+ tests (29 unit + 10 contract + 2 integration). Can we replicate this pattern?

**Chosen Approach**: Incremental Testing per Layer

**Unit Tests** (6-8 tests per phase):
- `phase-1-classifier.test.ts`: Category detection accuracy (professional, creative, hobby, etc.)
- `phase-2-scope.test.ts`: Lesson count calculation, minimum constraint enforcement
- `phase-3-expert.test.ts`: Research flag detection (legal content → flagged, general content → not flagged)
- `phase-4-synthesis.test.ts`: Adaptive model selection (<3 docs → 20B, ≥3 docs → 120B)
- `research-flag-detector.test.ts`: Conservative flagging logic
- `contextual-language.test.ts`: Template adaptation per category

**Contract Tests** (3-5 tests):
- `analysis.contract.test.ts`: tRPC endpoint schemas (start, getStatus, getResult)

**Integration Tests** (3-5 tests):
- `stage4-analysis.test.ts`: End-to-end BullMQ workflow (job creation → all phases → completion)
- `stage3-barrier.test.ts`: Barrier enforcement (incomplete docs → job fails)
- `minimum-lesson-constraint.test.ts`: <10 lessons → job fails with clear error
- `model-escalation.test.ts`: Phase 1 20B fails → retries with 120B → succeeds

**Rationale**:
- Proven pattern from Stage 3 (8.5/10 code review score)
- Isolates failures (unit tests catch phase logic bugs, integration tests catch workflow issues)
- Constitution Principle IV compliance

**Alternatives Considered & Rejected**:
1. ❌ **Integration tests only** - Slow, hard to debug failures
2. ❌ **No tests** - Violates constitution, high regression risk
3. ❌ **Manual testing only** - Not repeatable, not CI-friendly

## Summary of Research Decisions

| Topic | Decision | Inherited From | New Implementation |
|-------|----------|----------------|-------------------|
| **Multi-Phase Orchestration** | 5-phase architecture with per-phase models | Concept from spec | Phase services (1-5) + orchestrator |
| **Research Flag Detection** | Conservative LLM-based (120B in Phase 3) | Spec requirement | `research-flag-detector.ts` |
| **Contextual Language** | Category-specific template adaptation | n8n MVP v6.2 | `contextual-language.ts` |
| **Minimum Lesson Constraint** | Hard validation with user-facing error | Spec requirement | Validation in Phase 2 |
| **Stage 3 Barrier** | Pre-flight RPC check | Stage 3 `stage-barrier.ts` | Reuse existing service |
| **Progress Tracking** | 6-phase updates via RPC | Stage 1 `update_course_progress` | Phase-specific messages |
| **Model Configuration** | Database table with global + course overrides | Pattern from Stage 0-1 | `llm_model_config` table |
| **Quality Validation** | Semantic similarity (Jina-v3, 0.75 threshold) | Stage 3 `quality-validator.ts` | Reuse with phase-specific prompts |
| **Cost Tracking** | Per-phase token tracking + analytics | Stage 3 `cost-calculator.ts` | Extend with phase metadata |
| **Testing Strategy** | 3-layer (unit, contract, integration) | Stage 3 pattern | ~15-20 new tests |

## Next Steps

1. ✅ Research complete - all NEEDS CLARIFICATION resolved
2. **Phase 2 (Design)**: Generate `data-model.md`, `contracts/`, `quickstart.md`
3. **Phase 3 (Tasks)**: Run `/speckit.tasks` to generate implementation tasks
4. **Phase 4 (Implementation)**: Execute tasks using subagents + MAIN session
