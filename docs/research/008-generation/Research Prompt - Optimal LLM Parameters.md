# Research Question: Optimal LLM Parameters for Multi-Stage Course Generation Pipeline

## Context

We are building a **three-stage AI course generation system** for B2B corporate training:

- **Stage 3 (Document Processing)**: Document classification (HIGH/LOW priority)
- **Stage 4 (Analyze)**: 7-phase analysis extracting course structure from documents
- **Stage 5 (Generation)**: Lesson breakdown with detailed specifications
- **Stage 6 (Lesson Content)**: Parallel content generation (3-5K words per lesson)

Each stage has **different cognitive requirements**:
- Analysis → Pattern recognition, classification, reasoning
- Generation → Pedagogical design, structure creation
- Content → Creative writing, technical explanations, compliance accuracy

Currently, we use **default temperature (0.7)** across all stages, which is suboptimal.

## The Problem

Different tasks require different LLM parameters:
- **Low temperature (0.1-0.3)**: Deterministic tasks (classification, structured output)
- **Medium temperature (0.5-0.7)**: Balanced tasks (reasoning, design)
- **High temperature (0.8-1.2)**: Creative tasks (writing, analogies)

**Our architecture has diverse task types across stages**, but we lack empirical evidence for optimal parameter settings.

---

## Research Objectives

### 1. **Stage-Specific Parameter Optimization**

For each stage and phase, determine optimal:
- **Temperature** (primary focus)
- **Top-p** (nucleus sampling)
- **Frequency penalty** (repetition control)
- **Presence penalty** (topic diversity)
- **Max tokens** (output length constraints)

### 2. **Task-Type Parameter Mapping**

Identify optimal parameters for task archetypes:
- **Classification tasks** (document priority, category detection)
- **Reasoning tasks** (pedagogical strategy, lesson breakdown)
- **Structured generation** (JSON schemas, metadata)
- **Creative generation** (lesson content, explanations, analogies)
- **Technical generation** (code examples, algorithm explanations)
- **Compliance generation** (legal content, exact citations)

### 3. **Content-Type Parameter Variation**

For Stage 6 lesson content generation, determine parameters by content archetype:
- **Technical content** (coding, algorithms) → Precision-focused
- **Conceptual content** (theory, frameworks) → Creativity-focused
- **Compliance content** (regulations, policies) → Accuracy-focused

### 4. **Quality-Cost Trade-off Analysis**

Balance between:
- **Output quality** (coherence, accuracy, creativity)
- **Token efficiency** (fewer retries, optimal max_tokens)
- **Generation speed** (temperature impact on latency)
- **Consistency** (determinism vs variability)

---

## Detailed Stage Breakdown

### Stage 3: Document Processing (Classification)

**Task**: LLM-based document classification (HIGH/LOW priority)

**Current implementation**:
```typescript
const llm = new ChatOpenAI({
  model: 'openai/gpt-oss-20b',
  temperature: 0.3 // manually set, not validated
});
```

**Question**: What are optimal parameters for classification tasks?
- Should temperature be even lower (0.1)?
- Does top-p improve consistency?
- Should we use frequency_penalty to prevent repetitive reasoning?

**Expected output**: Structured JSON (DocumentClassificationSchema)

---

### Stage 4: Analyze (7 Phases)

**Phase 0**: Pre-flight validation (barrier checks)
- **Task type**: Validation, schema checking
- **Current**: No LLM (pure logic)
- **Question**: N/A

**Phase 1**: Classification (10-20% progress)
- **Task type**: Category classification, audience detection
- **Model**: OSS 20B
- **Current**: Default temperature (0.7)
- **Question**: Should this be lower (0.2-0.3) for determinism?
- **Expected output**: Structured category + audience

**Phase 2**: Scope Analysis (20-35% progress)
- **Task type**: Counting, estimation (total lessons, sections, hours)
- **Model**: OSS 20B
- **Current**: Default temperature (0.7)
- **Question**: Should this be low (0.2) for numerical accuracy?
- **Validation**: Minimum 10 lessons (hard requirement)

**Phase 3**: Expert Analysis (35-60% progress)
- **Task type**: **Advanced reasoning** (pedagogical strategy, teaching style)
- **Model**: OSS 120B (ALWAYS - needs reasoning)
- **Current**: Default temperature (0.7)
- **Question**: Should this be higher (0.8-1.0) for creative pedagogical insights?
- **Expected output**: Strategic recommendations

**Phase 4**: Document Synthesis (60-75% progress)
- **Task type**: Section-level structure creation
- **Model**: Adaptive (OSS 20B if <5 docs, OSS 120B if ≥5 docs)
- **Current**: Default temperature (0.7)
- **Question**: Optimal for structure generation? Need balance between creativity and coherence.
- **Expected output**: sections_breakdown array

**Phase 6**: RAG Planning (75-85% progress) - NEW
- **Task type**: Document-to-section mapping, query generation
- **Model**: OSS 20B
- **Current**: Default temperature (0.7)
- **Question**: Low temperature (0.3) for precise mapping? Or medium for flexible query generation?
- **Expected output**: RAG plan per section

**Phase 5**: Assembly (85-100% progress)
- **Task type**: Data assembly (no LLM)
- **Question**: N/A

**Research Questions**:
1. Should reasoning-heavy phases (Phase 3) use higher temperature?
2. Should structured output phases (Phase 1, 2, 6) use lower temperature?
3. Does top-p (e.g., 0.9) improve Phase 3 creativity without sacrificing coherence?
4. What's the optimal temperature range for Phase 4 (balance structure + creativity)?

---

### Stage 5: Generation (Lesson Breakdown)

**Phase 1**: validate_input
- **Task type**: Schema validation (no LLM)
- **Question**: N/A

**Phase 2**: generate_metadata
- **Task type**: Creative metadata generation (title, description, learning outcomes)
- **Model**: qwen3-max (critical metadata)
- **Current**: Default temperature (0.7)
- **Question**: Should this be medium-high (0.8) for engaging titles and descriptions?
- **Expected output**: CourseMetadata (structured but creative)

**Phase 3**: generate_sections (WITH RAG)
- **Task type**: **Pedagogical reasoning** (lesson breakdown, content structure design)
- **Model**: qwen3-max (primary) + Gemini (context overflow)
- **Current**: Default temperature (0.7)
- **Context**: Section-level RAG chunks (20-30 chunks)
- **Question**:
  - What temperature balances reasoning depth + structural coherence?
  - Should we use lower temperature (0.5) for structured content_structure generation?
  - Or higher temperature (0.8) for creative lesson breakdown reasoning?
- **Expected output**: Lessons array with detailed content_structure

**Phase 4**: validate_quality
- **Task type**: Embedding similarity (Jina-v3) + LLM-as-judge (5%)
- **Model**: OSS 120B (judge)
- **Current**: Default temperature (0.7)
- **Question**: Should LLM-as-judge use low temperature (0.2) for consistent scoring?

**Phase 5**: validate_lessons
- **Task type**: Count validation (no LLM)
- **Question**: N/A

**Research Questions**:
1. Phase 2 (metadata): Higher temperature (0.8-1.0) for engaging titles?
2. Phase 3 (lesson breakdown): What temperature optimizes pedagogical reasoning?
3. Should we use **different temperatures** for different substeps in Phase 3?
   - Lesson breakdown reasoning: Higher (0.8)
   - content_structure generation: Lower (0.5)
4. Does presence_penalty improve topic diversity in lesson breakdown?

---

### Stage 6: Lesson Content Generation (PLANNED)

**Task type**: Long-form content generation (3-5K words per lesson)

**Content Archetypes** (from research):
1. **Technical content** (code_tutorial, algorithm explanations)
2. **Conceptual content** (concept_explainer, theory, frameworks)
3. **Compliance content** (legal_warning, regulations, policies)

**Current design** (from Prompt Specification Research):
- Technical: Low temperature (0.2)
- Conceptual: High temperature (0.7)
- Compliance: Extreme low temperature (0.1)

**Questions**:
1. Are these temperature recommendations empirically validated?
2. What about **other parameters** (top-p, frequency_penalty, presence_penalty)?
3. Should we use **dynamic temperature per section** within a single lesson?
   - Intro (hook): High temperature (0.9)
   - Main content (technical): Low temperature (0.2)
   - Examples: Medium temperature (0.6)
   - Exercises: Low temperature (0.3)

**Specific parameters to research**:

**Technical Content** (code_tutorial):
- Temperature: 0.1-0.3 (recommended by research)
- Top-p: ? (should we use 0.9 for diverse code examples?)
- Frequency_penalty: ? (prevent repetitive code patterns?)
- Presence_penalty: ? (ensure diverse error handling examples?)
- Max_tokens: ? (how to handle long code blocks?)

**Conceptual Content** (concept_explainer):
- Temperature: 0.7-0.9 (recommended by research)
- Top-p: ? (higher top-p for creative analogies?)
- Frequency_penalty: ? (avoid repetitive phrasing?)
- Presence_penalty: ? (encourage diverse examples?)
- Max_tokens: ? (balance depth vs verbosity)

**Compliance Content** (legal_warning):
- Temperature: 0.1 (recommended by research)
- Top-p: ? (should this be very low, e.g., 0.5?)
- Frequency_penalty: 0 (allow exact legal phrases?)
- Presence_penalty: 0 (avoid topic drift?)
- Max_tokens: ? (precise vs comprehensive?)

---

## Research Sources to Explore

### 1. **Production Systems**

**OpenAI Cookbook**:
- What temperature does OpenAI recommend for different tasks?
- Do they use top-p for creative tasks?
- Frequency/presence penalty best practices

**Anthropic Documentation (Claude)**:
- Claude's temperature recommendations
- Constitutional AI: parameter settings for safety/compliance
- Structured output: parameter tuning

**Google AI (Gemini)**:
- Temperature for reasoning tasks (Gemini 2.0 Flash Thinking)
- Parameter settings for long-form generation

**Khan Academy (Khanmigo)**:
- What parameters do they use for educational content?
- Persona-based generation: parameter tuning

**Duolingo**:
- Parameters for exercise generation
- Consistency vs creativity balance

### 2. **Academic Research**

**Temperature Studies**:
- "Does Temperature Control Creativity in LLMs?" (arXiv)
- "The Impact of Temperature on Reasoning Tasks" (ACL)
- "Optimal Sampling Strategies for Creative Generation" (NeurIPS)

**Top-p (Nucleus Sampling)**:
- Original paper: "The Curious Case of Neural Text Degeneration" (Holtzman et al.)
- When to use top-p vs temperature?
- Top-p + temperature: complementary or redundant?

**Frequency/Presence Penalty**:
- "Controlling Repetition in Neural Text Generation" (ACL)
- When do penalties hurt coherence?
- Parameter ranges: empirical studies

**Long-Form Generation**:
- "Skeleton-of-Thought: Parameter Tuning for Parallel Generation" (arXiv)
- "Chain of Density: Temperature Impact on Summary Quality" (arXiv)

### 3. **Parameter Trade-offs**

**Quality vs Determinism**:
- When is determinism more valuable than creativity?
- Classification: Always low temperature?
- Reasoning: Higher temperature justified?

**Token Efficiency**:
- Does lower temperature reduce retries?
- Max_tokens optimization: how to avoid truncation?

**Latency**:
- Temperature impact on generation speed
- Top-p overhead: negligible or significant?

---

## Expected Research Output

### 1. **Parameter Matrix by Stage**

**Table format**:

| Stage | Phase | Task Type | Temperature | Top-p | Freq Penalty | Pres Penalty | Max Tokens | Rationale |
|-------|-------|-----------|-------------|-------|--------------|--------------|------------|-----------|
| Stage 3 | Classification | Classification | 0.2 | 0.9 | 0.0 | 0.0 | 500 | Deterministic category assignment |
| Stage 4 | Phase 1 | Classification | 0.3 | ... | ... | ... | ... | ... |
| Stage 4 | Phase 2 | Counting | 0.2 | ... | ... | ... | ... | ... |
| Stage 4 | Phase 3 | Reasoning | 0.8 | ... | ... | ... | ... | ... |
| Stage 4 | Phase 4 | Structure Gen | 0.6 | ... | ... | ... | ... | ... |
| Stage 4 | Phase 6 | RAG Planning | 0.4 | ... | ... | ... | ... | ... |
| Stage 5 | Phase 2 | Metadata Gen | 0.8 | ... | ... | ... | ... | ... |
| Stage 5 | Phase 3 | Lesson Design | 0.7 | ... | ... | ... | ... | ... |
| Stage 6 | Technical | Code Tutorial | 0.2 | ... | ... | ... | ... | ... |
| Stage 6 | Conceptual | Explainer | 0.7 | ... | ... | ... | ... | ... |
| Stage 6 | Compliance | Legal | 0.1 | ... | ... | ... | ... | ... |

### 2. **Content Archetype Parameters** (Stage 6)

For each archetype (technical, conceptual, compliance), provide:
- **Primary temperature** (main content)
- **Secondary temperatures** (intro, examples, exercises)
- **Top-p strategy** (when to use, optimal values)
- **Penalty settings** (frequency/presence)
- **Max tokens** (per section, per lesson)

**Example**:
```typescript
// Technical content (code_tutorial)
const technicalParams = {
  intro: { temperature: 0.5, top_p: 0.9, max_tokens: 300 },
  mainContent: { temperature: 0.2, top_p: 0.8, max_tokens: 1500 },
  codeBlocks: { temperature: 0.1, top_p: 0.7, max_tokens: 800 },
  examples: { temperature: 0.3, top_p: 0.85, max_tokens: 500 },
  exercises: { temperature: 0.2, top_p: 0.8, max_tokens: 600 }
};
```

### 3. **Quality-Cost Analysis**

**Comparison table**:

| Configuration | Output Quality | Retry Rate | Avg Tokens | Cost per Lesson | Recommended Use Case |
|---------------|----------------|------------|------------|-----------------|----------------------|
| Low Temp (0.2) | 3.5/5.0 | 1.1x | 3200 | $0.25 | Technical, Compliance |
| Medium (0.7) | 3.8/5.0 | 1.3x | 3500 | $0.32 | Conceptual, Balanced |
| High Temp (1.0) | 3.4/5.0 | 1.8x | 4200 | $0.45 | Creative, Brainstorming |
| Dynamic (0.2-0.9) | 4.0/5.0 | 1.2x | 3400 | $0.30 | Multi-archetype lessons |

### 4. **Implementation Guidelines**

**Dynamic Parameter Selection**:
```typescript
function selectParameters(
  taskType: 'classification' | 'reasoning' | 'creative' | 'technical' | 'compliance',
  contentArchetype?: 'code_tutorial' | 'concept_explainer' | 'legal_warning'
): LLMParameters {

  // Stage 3-4-5: Task-based
  if (taskType === 'classification') {
    return { temperature: 0.2, top_p: 0.9, frequency_penalty: 0.0, presence_penalty: 0.0 };
  }

  if (taskType === 'reasoning') {
    return { temperature: 0.8, top_p: 0.95, frequency_penalty: 0.1, presence_penalty: 0.1 };
  }

  // Stage 6: Content archetype-based
  if (contentArchetype === 'code_tutorial') {
    return { temperature: 0.2, top_p: 0.8, frequency_penalty: 0.2, presence_penalty: 0.1 };
  }

  if (contentArchetype === 'concept_explainer') {
    return { temperature: 0.7, top_p: 0.95, frequency_penalty: 0.3, presence_penalty: 0.2 };
  }

  if (contentArchetype === 'legal_warning') {
    return { temperature: 0.1, top_p: 0.7, frequency_penalty: 0.0, presence_penalty: 0.0 };
  }

  // Default: balanced
  return { temperature: 0.7, top_p: 0.9, frequency_penalty: 0.1, presence_penalty: 0.1 };
}
```

### 5. **Risk Mitigation Strategies**

**If parameters produce low-quality output**:
- Symptoms: Repetitive phrasing, shallow reasoning, off-topic content
- Diagnosis: Which parameter caused the issue?
- Corrective actions: Parameter adjustment matrix

**Example**:
```
Problem: Technical content is too verbose and repetitive
Diagnosis: frequency_penalty too low
Solution: Increase frequency_penalty from 0.1 → 0.3
Expected impact: -15% redundancy, +10% conciseness
```

---

## Success Criteria

Research is successful if it provides:

1. ✅ **Clear parameter recommendations** for each stage and phase
2. ✅ **Empirical evidence** from production systems (Khan Academy, OpenAI, etc.)
3. ✅ **Academic backing** for parameter choices (papers, studies)
4. ✅ **Content archetype mapping** for Stage 6
5. ✅ **Quality-cost trade-off analysis** with metrics
6. ✅ **Implementation-ready code** (parameter selection logic)
7. ✅ **Risk mitigation strategies** for low-quality outputs

---

## Special Considerations

### 1. **Model-Specific Behavior**

Different models may require different parameters:
- **OpenAI (GPT-4, o1-mini)**: Temperature behavior?
- **Anthropic (Claude Sonnet)**: Recommended settings?
- **Google (Gemini 2.0 Flash)**: Thinking mode parameters?
- **OSS models (Qwen, Llama)**: Do they behave differently?

**Question**: Should we provide model-specific parameter matrices?

### 2. **Context Window Impact**

Does temperature interact with context size?
- Small context (<10K): Lower temperature for stability?
- Large context (>100K): Higher temperature to prevent "context forgetting"?

### 3. **RAG Integration**

When using RAG (Stage 5 Phase 3, Stage 6):
- Should temperature be lower (grounding to RAG chunks)?
- Or higher (creative synthesis of RAG data)?

### 4. **Parallel Generation** (Stage 6)

Skeleton-of-Thought (parallel lesson generation):
- Should sections generated in parallel use **same or different** temperatures?
- Does parallel generation require lower temperature for consistency?

---

## Deliverable Format

A comprehensive research report answering:

### Section 1: Executive Summary
- Key findings (1 paragraph per stage)
- Recommended default parameters
- Expected quality/cost improvements

### Section 2: Stage-Specific Recommendations
- Stage 3: Classification parameters
- Stage 4: Phase-by-phase parameters (7 phases)
- Stage 5: Generation parameters (5 phases)
- Stage 6: Content archetype parameters (3 types + dynamic)

### Section 3: Production Evidence
- OpenAI Cookbook findings
- Khan Academy parameters
- Duolingo strategies
- Other production systems

### Section 4: Academic Research
- Temperature studies (key papers)
- Top-p research (nucleus sampling)
- Penalty research (repetition control)
- Long-form generation studies

### Section 5: Implementation Guide
- TypeScript code for parameter selection
- Configuration files
- A/B testing strategy
- Rollout plan

### Section 6: Quality-Cost Analysis
- Metrics table (quality, cost, retries)
- ROI calculation
- Trade-off recommendations

### Section 7: Risk Mitigation
- Common problems and solutions
- Parameter tuning guidelines
- Debugging checklist

---

## Context for Perplexity AI Research

**Project**: MegaCampusAI B2B course generation platform

**Architecture**: Multi-stage pipeline (Document Processing → Analyze → Generation → Lesson Content)

**Goal**: Optimize LLM parameters (temperature, top-p, penalties, max_tokens) for each stage and task type to maximize:
- Output quality (coherence, accuracy, creativity)
- Token efficiency (fewer retries)
- Cost optimization

**Current state**: Default temperature (0.7) across all stages (suboptimal)

**Target**: Evidence-based parameter recommendations with production examples and academic backing

**Deliverable**: Implementation-ready parameter matrix + code + trade-off analysis

**Priority**: HIGH (blocks production optimization, directly impacts quality and cost)

---

**Research Question**: What are the optimal LLM parameters (temperature, top-p, frequency_penalty, presence_penalty, max_tokens) for each stage, phase, and content archetype in our multi-stage course generation pipeline, based on production evidence and academic research?
