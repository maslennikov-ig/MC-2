# ADR-001: LLM Orchestration Framework for Multi-Phase Course Analysis

**Status**: ACCEPTED
**Date**: 2025-11-01
**Deciders**: Development Team
**Technical Story**: Stage 4 - Course Content Analysis (Multi-Phase LLM Orchestration)

---

## Context and Problem Statement

Stage 4 of the MegaCampus2 platform requires sophisticated multi-phase LLM orchestration to analyze course materials and generate structured output. The workflow consists of 5 sequential phases with complex requirements:

**Workflow Requirements**:
1. **Pre-Flight**: Stage 3 barrier validation (100% document processing completion)
2. **Phase 1**: Course classification (category detection, contextual language generation)
3. **Phase 2**: Scope analysis (lesson count estimation, minimum 10 lessons constraint)
4. **Phase 3**: Deep expert analysis (pedagogical strategy, research flag detection using 120B model)
5. **Phase 4**: Document synthesis (adaptive model selection: 20B for <3 docs, 120B for ≥3 docs)
6. **Phase 5**: Final assembly (no LLM, pure logic)

**Critical Technical Challenges**:
- **Per-phase model selection**: Different complexity levels require different models (20B for simple, 120B for expert, Gemini for emergency)
- **Retry with escalation**: Failed quality checks must retry with progressively expensive models (20B → 120B → Gemini)
- **Quality validation gates**: Semantic similarity checks after each phase (Jina-v3 embeddings)
- **Progress tracking**: Real-time updates (0% → 100%) via Supabase + BullMQ
- **Observability**: Token tracking, cost calculation, error monitoring per phase
- **Execution window**: 30 seconds to 10 minutes per course

**Framework Options Evaluated**:
1. Direct OpenAI SDK + Custom Orchestration
2. LangChain + LangGraph
3. Vercel AI SDK + Langfuse
4. Mastra

---

## Decision Drivers

### Primary Drivers (High Weight)
1. **Orchestration Complexity** (15%): Multi-phase sequential workflow with conditional routing
2. **Retry & Fallback Logic** (20%): Built-in model escalation patterns
3. **Quality Validation** (20%): Integration with semantic similarity checks
4. **Model Routing** (20%): Per-phase model selection with database configuration

### Secondary Drivers (Medium Weight)
5. **Cost Tracking** (15%): Automated token usage and cost calculation
6. **TypeScript Maturity** (10%): First-class TypeScript support, type safety
7. **Observability** (10%): Production-ready monitoring and debugging

### Tertiary Drivers (Low Weight)
8. **Maintainability** (5%): Learning curve, community support, documentation
9. **Performance** (5%): Execution overhead (acceptable for 30s-10min workflows)

---

## Considered Options

### Option 1: Direct OpenAI SDK + Custom Orchestration

**Approach**: Continue Stage 3 pattern - direct SDK calls with manual orchestration.

**Pros**:
- ✅ Zero learning curve (team already experienced from Stage 3)
- ✅ Maximum control and transparency
- ✅ No framework dependencies
- ✅ Perfect TypeScript integration
- ✅ Zero performance overhead

**Cons**:
- ❌ Custom state machine required (~300-400 lines)
- ❌ Manual retry/escalation logic (~100 lines)
- ❌ Repetitive boilerplate for each phase
- ❌ Reinventing solved patterns (conditional routing, fallbacks)
- ❌ Higher maintenance burden

**Score**: 7.5/10 (for long-term perspective)

---

### Option 2: LangChain + LangGraph ✅ SELECTED

**Approach**: Use LangGraph StateGraph for workflow orchestration with LangChain LLM wrappers.

**Pros**:
- ✅ **Perfect architectural match**: StateGraph designed for multi-phase sequential workflows
- ✅ **Built-in retry/escalation**: `withRetry()` + `withFallbacks()` implement 20B→120B→Gemini pattern natively
- ✅ **Conditional routing**: Quality validation gates as conditional edges (native concept)
- ✅ **Production-proven**: Used by LinkedIn, Uber, Klarna, GitLab in production
- ✅ **Native Zod integration**: `withStructuredOutput()` for type-safe validation
- ✅ **Mature ecosystem**: 90k GitHub stars, 200k+ weekly npm downloads
- ✅ **OpenRouter compatibility**: Well-documented ChatOpenAI with custom baseURL
- ✅ **Future-proof**: Checkpoint system for human-in-the-loop, pause/resume (if needed later)
- ✅ **Less code**: 100-200 lines vs 400-600 with custom approach

**Cons**:
- ⚠️ Learning curve: 2-3 days for team onboarding (runnables, chains, graphs)
- ⚠️ Framework overhead: 1-10ms per phase (negligible for 30s-10min workflows)
- ⚠️ Abstraction layer: Less direct control, debugging through framework
- ⚠️ Dependency risk: Breaking changes in future versions (mitigated by maturity)

**Score**: 9.5/10 (for long-term perspective)

**Implementation Pattern**:
```typescript
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

// State schema
const WorkflowState = Annotation.Root({
  course_id: Annotation<string>,
  phase1_output: Annotation<Phase1Output | null>,
  phase2_output: Annotation<Phase2Output | null>,
  // ...
  tokens_used: Annotation<Record<string, number>>,
  total_cost: Annotation<number>
});

// Configure models with OpenRouter
const model20B = new ChatOpenAI({
  modelName: "openai/gpt-oss-20b",
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
  apiKey: process.env.OPENROUTER_API_KEY
});

const model120B = new ChatOpenAI({
  modelName: "openai/gpt-oss-120b",
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
  apiKey: process.env.OPENROUTER_API_KEY
});

// Build workflow graph
const workflow = new StateGraph(WorkflowState)
  .addNode("preFlight", preFlightNode)
  .addNode("phase1", phase1Node.withRetry().withFallbacks([model120B]))
  .addNode("phase2", phase2Node.withRetry().withFallbacks([model120B]))
  .addNode("validateMinLessons", validateMinLessonsNode)
  .addNode("phase3", phase3Node) // Always 120B
  .addNode("phase4", adaptivePhase4Node)
  .addNode("phase5", phase5AssemblyNode)
  .addEdge(START, "preFlight")
  .addEdge("preFlight", "phase1")
  .addEdge("phase1", "phase2")
  .addConditionalEdges("phase2",
    (state) => state.phase2_output.total_lessons >= 10 ? "continue" : "reject",
    { continue: "validateMinLessons", reject: END }
  )
  .addEdge("validateMinLessons", "phase3")
  .addEdge("phase3", "phase4")
  .addEdge("phase4", "phase5")
  .addEdge("phase5", END);

const app = workflow.compile();
```

---

### Option 3: Vercel AI SDK + Langfuse

**Approach**: Minimal abstraction with official OpenRouter provider + external observability.

**Pros**:
- ✅ Minimal overhead (~1-2ms)
- ✅ Official OpenRouter support (@openrouter/ai-sdk-provider v1.2.0)
- ✅ Excellent TypeScript DX
- ✅ Native Zod validation
- ✅ Simple mental model

**Cons**:
- ❌ Still requires custom orchestration (state machine)
- ❌ Manual retry/escalation logic
- ❌ External observability dependency
- ❌ Doesn't solve core problem (workflow complexity)

**Score**: 6/10

---

### Option 4: Mastra

**Approach**: Modern TypeScript-first framework with built-in orchestration + observability.

**Pros**:
- ✅ Complete solution (workflow + observability + agents)
- ✅ Modern TypeScript architecture
- ✅ XState-based workflow engine

**Cons**:
- ❌ **Beta status** (launched Oct 2024, only 2 months old)
- ❌ Small community, limited documentation
- ❌ Unproven at production scale
- ❌ API instability risk

**Score**: 4/10 (too early for production)

---

## Decision Outcome

**Chosen option**: **LangChain + LangGraph** (WITHOUT LangSmith for now)

### Rationale

1. **Architectural Alignment**: The 5-phase sequential workflow with dependencies maps perfectly to LangGraph's StateGraph pattern. Each phase becomes a node, transitions become edges, quality validation becomes conditional routing.

2. **Built-in Patterns**: Retry with model escalation (20B → 120B → Gemini) is a core LangChain feature via `withFallbacks()`, eliminating 100+ lines of custom retry logic.

3. **Production Maturity**: Battle-tested by major companies (LinkedIn, Uber, Klarna) with 90k+ GitHub stars and active development. Lower risk than bleeding-edge alternatives.

4. **Long-term Value**: Stage 5-7 may introduce additional complexity (branching logic, human-in-the-loop). LangGraph's checkpoint system and conditional edges provide extensibility without rewriting core orchestration.

5. **Code Reduction**: Estimated 100-200 lines of declarative workflow code vs 400-600 lines of imperative state machine logic with Direct SDK.

### Observability Strategy: Custom Supabase (NOT LangSmith)

**Decision**: Use custom metrics tracking in Supabase instead of LangSmith.

**Reasons**:
- LangSmith FREE tier (5,000 traces/month, 14-day retention) insufficient for production
- LangSmith PAID tier ($39/month) adds SaaS dependency
- Existing Supabase infrastructure already supports metrics tracking
- Full control over observability data

**Implementation**:
```typescript
async function trackPhase(phase: string, fn: () => Promise<any>) {
  const startTime = Date.now();
  try {
    const result = await fn();
    await supabase.from('llm_phase_metrics').insert({
      course_id: state.course_id,
      phase,
      model_used: result.model,
      tokens_input: result.usage.prompt_tokens,
      tokens_output: result.usage.completion_tokens,
      tokens_total: result.usage.total_tokens,
      cost_usd: calculateCost(result.usage, result.model),
      latency_ms: Date.now() - startTime,
      success: true,
      quality_score: await validateSemantic(result.content),
      created_at: new Date()
    });
    return result;
  } catch (error) {
    await supabase.from('llm_phase_metrics').insert({
      course_id: state.course_id,
      phase,
      success: false,
      error_message: error.message,
      latency_ms: Date.now() - startTime,
      created_at: new Date()
    });
    throw error;
  }
}
```

---

## Positive Consequences

1. **Faster Development**: Declarative workflow definition reduces boilerplate by 60-70%
2. **Built-in Resilience**: Native retry/fallback mechanisms improve reliability
3. **Industry Standard**: Easier to onboard developers familiar with LangChain ecosystem
4. **Future Extensibility**: Checkpoint system, human-in-the-loop support ready when needed
5. **Quality Gates**: Conditional edges provide clean abstraction for validation logic

---

## Negative Consequences

1. **Learning Curve**: Team needs 2-3 days to learn LangChain/LangGraph concepts
2. **Framework Lock-in**: Migration to alternative orchestration would require rewrite
3. **Debugging Complexity**: Errors pass through framework abstraction layers
4. **Dependency Risk**: Breaking changes in future LangChain versions (mitigated by semver)
5. **Performance Overhead**: 1-10ms per phase (acceptable for 30s-10min workflows)

---

## Validation & Rollback Strategy

### Phased Rollout
1. **Week 1-2**: Implement Stage 4 with LangGraph behind feature flag
2. **Week 3**: Run parallel implementations (LangGraph + Direct SDK for comparison)
3. **Week 4**: Gradual traffic shift (10% → 25% → 50% → 100%)
4. **Week 5**: Deprecate Direct SDK fallback

### Success Metrics
- ✅ All 5 phases execute correctly (100% test coverage)
- ✅ Cost tracking matches OpenRouter billing (±5% accuracy)
- ✅ Quality scores match Direct SDK baseline (>0.95 correlation)
- ✅ Execution time within ±10% of Direct SDK
- ✅ Zero data loss or corruption

### Rollback Trigger
- Feature flag: `ENABLE_LANGGRAPH_WORKFLOW=false`
- Automatic rollback if error rate >5% for 1 hour
- Manual rollback if critical bugs discovered

---

## Implementation Timeline

**Phase 0: Foundation** (COMPLETE ✅)
- Database migrations (llm_model_config, analysis_result)
- TypeScript types and Zod schemas
- OpenRouter integration verified

**Phase 1: LangChain Setup** (3-4 days)
- Install dependencies (@langchain/core, @langchain/openai, @langchain/langgraph)
- Team onboarding (LangChain concepts, graph patterns)
- OpenRouter model configuration (20B, 120B, Gemini)
- Custom observability wrapper (Supabase metrics tracking)

**Phase 2: Workflow Implementation** (4-6 days)
- Build StateGraph with 6 nodes (pre-flight + 5 phases)
- Implement retry/fallback chains
- Add conditional validation edges
- BullMQ worker integration

**Phase 3: Testing & Validation** (2-3 days)
- Unit tests (phase services, quality validation)
- Integration tests (full workflow, barrier enforcement)
- Regression tests (compare outputs vs Direct SDK)

**Total**: 9-13 days (within acceptable range for Stage 4 complexity)

---

## Alternatives Considered for Future Stages

**Stage 5-7 Considerations**:
- If workflow complexity remains similar → Keep LangChain
- If complexity decreases significantly → Consider migrating back to Direct SDK
- If observability needs grow → Evaluate LangSmith PAID tier or self-hosted Langfuse
- If team prefers minimal abstraction → Vercel AI SDK remains viable alternative

---

## References

- [LangChain Documentation](https://js.langchain.com/docs/introduction/)
- [LangGraph Tutorials](https://langchain-ai.github.io/langgraphjs/)
- [OpenRouter Integration Guide](https://openrouter.ai/docs/frameworks)
- [Research Document](../research/LLM%20Orchestration%20Frameworks.md)
- [Stage 4 Technical Specification](../specs/007-stage-4-analyze/plan.md)

---

**Decision Log**:
- 2025-11-01: ADR created and ACCEPTED
- 2025-11-01: Research completed (11 frameworks evaluated, LangChain scored 8.4/10)
- 2025-11-01: Custom observability strategy defined (Supabase instead of LangSmith)
