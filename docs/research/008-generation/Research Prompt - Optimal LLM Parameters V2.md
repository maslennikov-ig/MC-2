# Research Question: Optimal LLM Parameters for Multi-Stage Course Generation Pipeline (V2 - Corrected)

## Context

We are building a **three-stage AI course generation system** for **B2B corporate training**:

- **Stage 3 (Document Processing)**: Document classification (HIGH/LOW priority)
- **Stage 4 (Analyze)**: 7-phase analysis extracting course structure from documents
- **Stage 5 (Generation)**: Lesson breakdown with detailed specifications
- **Stage 6 (Lesson Content)**: Parallel content generation (3-5K words per lesson)

Each stage has **different cognitive requirements**:
- Analysis → Pattern recognition, classification, **strategic reasoning**
- Generation → Pedagogical design, structure creation
- Content → Technical explanations, educational prose, compliance accuracy

Currently, we use **default temperature (0.7)** across all stages, which is suboptimal.

---

## CRITICAL CONSTRAINTS (Research Must Address)

### 1. **B2B Educational Content vs Creative Writing**

**IMPORTANT**: This is NOT creative fiction or marketing copywriting.

**Constraints**:
- ✅ **Clarity > Novelty**: B2B customers prioritize understanding over entertainment
- ✅ **Consistency > Variety**: Corporate training needs predictable, professional tone
- ✅ **Accuracy > Engagement**: Technical/compliance content must be factually correct
- ❌ **NOT creative brainstorming**: We're not writing novels or poetry
- ❌ **NOT marketing copy**: We're not creating ad slogans or viral content

**Question for Research**:
- What temperature ranges are used by **educational AI systems** (Khan Academy, Coursera, Duolingo) specifically?
- Are there studies comparing "educational prose" vs "creative writing" temperature requirements?

### 2. **OSS Models vs Commercial Models**

**Our Stack**:
- **Stage 3**: OSS 20B (qwen/llama variants via OpenRouter)
- **Stage 4**: OSS 20B (simple phases) + OSS 120B (Phase 3 reasoning)
- **Stage 5**: qwen3-max (proprietary OSS variant)
- **Stage 6**: TBD (likely OSS models for cost)

**CRITICAL**: OSS models often behave differently than GPT-4/Claude at same temperature.

**Question for Research**:
- Do OSS models (Llama 3, Qwen, Mistral) require **lower temperatures** than GPT-4 for same coherence level?
- Are there model-specific temperature recommendations for **open-source models**?
- Should we adjust commercial model recommendations by -0.1 to -0.2 for OSS?

### 3. **Production Stability vs Experimentation**

**Constraint**: We're building **production B2B platform**, not research prototype.

**Priority**:
- ✅ **Conservative > Aggressive**: Prefer lower risk configurations
- ✅ **Predictable > Novel**: Consistent quality matters more than occasional brilliance
- ✅ **Coherent > Creative**: Better to be slightly boring than confusing

**Question for Research**:
- What are **safe upper bounds** for temperature in production educational systems?
- When does temperature cross from "creative" to "risky incoherence"?

### 4. **Cost-Latency Feasibility**

**Constraint**: Multi-stage generation already complex; avoid over-optimization.

**Concerns**:
- **Section-level dynamic temperature**: Requires 5-7 separate API calls per lesson (high latency + cost)
- **Two-stage generation**: Doubles API calls for single phase (e.g., Stage 5 Phase 3)
- **Retry rates**: Over-optimized configs may INCREASE retries due to edge cases

**Question for Research**:
- Are **section-level dynamic temperatures** worth the latency/cost trade-off?
- What are **realistic retry rate multipliers** for dynamic vs fixed configs?
- Should MVP use **single temperature per stage**, defer per-section optimization?

---

## The Problem

Different tasks require different LLM parameters:
- **Low temperature (0.1-0.3)**: Deterministic tasks (classification, structured output)
- **Medium temperature (0.4-0.7)**: Balanced tasks (**strategic reasoning**, design)
- **High temperature (0.8-1.2)**: Creative tasks (analogies, **fiction writing**)

**Our architecture has diverse task types across stages**, but we lack empirical evidence for optimal parameter settings **FOR EDUCATIONAL CONTENT SPECIFICALLY**.

---

## Research Objectives

### 1. **Stage-Specific Parameter Optimization**

For each stage and phase, determine optimal:
- **Temperature** (primary focus)
- **Top-p** (nucleus sampling)
- **Frequency penalty** (repetition control)
- **Presence penalty** (topic diversity)
- **Max tokens** (output length constraints)

**CRITICAL**: Prioritize **conservative recommendations** suitable for production B2B platform.

### 2. **Task-Type Parameter Mapping**

Identify optimal parameters for task archetypes:
- **Classification tasks** (document priority, category detection)
- **Strategic reasoning** (pedagogical strategy, curriculum design) ← **NOT creative brainstorming**
- **Structured generation** (JSON schemas, metadata)
- **Educational prose** (lesson content, explanations) ← **NOT creative fiction**
- **Technical generation** (code examples, algorithm explanations)
- **Compliance generation** (legal content, exact citations)

**NEW: Distinguish between**:
- **Strategic reasoning** (curriculum design, pedagogical strategy) → Requires coherence + novel insights, but NOT wild creativity
- **Creative brainstorming** (fiction, marketing) → Can tolerate incoherence for novelty

### 3. **Content-Type Parameter Variation**

For Stage 6 lesson content generation, determine parameters by content archetype:
- **Technical content** (coding, algorithms) → Precision-focused
- **Conceptual content** (theory, frameworks) → **Educational clarity-focused** (NOT creative fiction)
- **Compliance content** (regulations, policies) → Accuracy-focused

**CRITICAL QUESTION**:
- What temperature is optimal for **educational analogies** (pedagogical tool) vs **creative fiction analogies** (entertainment)?
- Should educational analogies use temp=0.7-0.8 instead of 1.0?

### 4. **Quality-Cost Trade-off Analysis**

Balance between:
- **Output quality** (coherence, accuracy, **pedagogical effectiveness**)
- **Token efficiency** (fewer retries, optimal max_tokens)
- **Generation speed** (temperature impact on latency)
- **Consistency** (determinism vs variability)

**NEW: Realistic Expectations**:
- What are **realistic retry rate multipliers** for dynamic configs in production?
- Should we expect 1.18x (optimistic) or 1.3-1.4x (conservative)?

---

## Detailed Stage Breakdown

### Stage 3: Document Processing (Classification)

**Task**: LLM-based document classification (HIGH/LOW priority)

**Current implementation**:
```typescript
const llm = new ChatOpenAI({
  model: 'openai/gpt-oss-20b',  // OSS model (qwen/llama variant)
  temperature: 0.3 // manually set, not validated
});
```

**Questions**:
- Should temperature be even lower (0.0-0.1) for **binary classification**?
- For OSS models: Is top_p=0.1 too wide? Should it be 0.05?
- Should we use frequency_penalty to prevent repetitive reasoning?

**Expected output**: Structured JSON (DocumentClassificationSchema)

**CRITICAL**: This is **binary decision** (HIGH vs LOW), not multi-class with nuance.

---

### Stage 4: Analyze (7 Phases)

#### Phase 0: Pre-flight validation (barrier checks)
- **Task type**: Validation, schema checking
- **Current**: No LLM (pure logic)
- **Question**: N/A

#### Phase 1: Classification (10-20% progress)
- **Task type**: Category classification, audience detection
- **Model**: OSS 20B (qwen/llama variant)
- **Current**: Default temperature (0.7)
- **Question**: Should this be lower (0.2-0.3) for determinism with **OSS models**?
- **Expected output**: Structured category + audience

**CRITICAL**: Multi-label classification, but still needs consistency.

#### Phase 2: Scope Analysis (20-35% progress)
- **Task type**: **Numerical estimation** (total lessons, sections, hours)
- **Model**: OSS 20B
- **Current**: Default temperature (0.7)
- **Question**:
  - Should this be **very low** (0.1) for numerical accuracy?
  - Should **top_p be narrow** (0.5) for counting tasks (not 0.7)?
- **Validation**: Minimum 10 lessons (hard requirement)

**CRITICAL**: This is **counting/arithmetic**, NOT code generation. What temperature do LLMs use for **numerical reasoning** specifically?

**Research Sources to Check**:
- Math problem-solving LLMs (what temperature for arithmetic?)
- Quantitative analysis tasks (finance, analytics)

#### Phase 3: Expert Analysis (35-60% progress) ← **MOST CRITICAL PHASE**

- **Task type**: **STRATEGIC PEDAGOGICAL REASONING** (NOT creative brainstorming)
- **Model**: OSS 120B (ALWAYS - qwen/llama reasoning model)
- **Current**: Default temperature (0.7)
- **Question**:

**CRITICAL DISTINCTION**:
```
This is NOT:
❌ Creative fiction writing (temp 0.9-1.0)
❌ Marketing brainstorming (temp 0.8-1.0)
❌ Artistic generation (temp 1.0+)

This IS:
✅ Curriculum design strategy (structured reasoning)
✅ Pedagogical approach selection (evidence-based)
✅ Teaching style recommendation (professional)
✅ Strategic decision-making (coherent, not chaotic)
```

**Comparison to Other Reasoning Tasks**:
- **Chain-of-Thought mathematical reasoning**: Uses temp=0.0-0.4
- **Tree of Thoughts strategic reasoning**: Uses temp=0.7 for generation, 0.0 for evaluation
- **Legal strategic analysis**: Uses temp=0.3-0.5

**Question for Research**:
- What temperature do **instructional design AIs** use for curriculum strategy?
- Is temp=0.85 too high for **strategic reasoning** that needs coherence?
- Should "pedagogical strategy" use temp=0.5-0.7 (strategic) instead of 0.8-0.9 (creative)?

**Expected output**: Strategic recommendations (coherent, evidence-based, professional)

**CRITICAL CONSTRAINT**: OSS 120B reasoning model - may need **lower temperature** than GPT-4o for same coherence.

#### Phase 4: Document Synthesis (60-75% progress)
- **Task type**: Section-level structure creation
- **Model**: Adaptive (OSS 20B if <5 docs, OSS 120B if ≥5 docs)
- **Current**: Default temperature (0.7)
- **Question**: Optimal for structure generation? Need balance between creativity and coherence.
- **Expected output**: sections_breakdown array

**Adaptive Logic Question**:
- Should temperature ALSO be adaptive (0.5 for <5 docs, 0.6 for ≥5 docs)?

#### Phase 6: RAG Planning (75-85% progress) - NEW
- **Task type**: Document-to-section mapping, RAG query generation
- **Model**: OSS 20B
- **Current**: Default temperature (0.7)
- **Question**:
  - Low temperature (0.3-0.4) for precise mapping?
  - OR medium (0.5) for flexible query generation?
  - How does **presence_penalty** affect query diversity?
- **Expected output**: RAG plan per section

**CRITICAL**: RAG queries need **diversity** (multiple search strategies) but **precision** (relevant results).

#### Phase 5: Assembly (85-100% progress)
- **Task type**: Data assembly (no LLM)
- **Question**: N/A

---

### Stage 5: Generation (Lesson Breakdown)

#### Phase 1: validate_input
- **Task type**: Schema validation (no LLM)
- **Question**: N/A

#### Phase 2: generate_metadata
- **Task type**: Creative metadata generation (title, description, learning outcomes)
- **Model**: qwen3-max (critical metadata)
- **Current**: Default temperature (0.7)
- **Question**:
  - Should this be medium-high (0.7-0.8) for engaging titles?
  - OR too risky for B2B professional context?
- **Expected output**: CourseMetadata (structured but engaging)

**CRITICAL**: B2B course titles are **professional**, not clickbait. What temperature for **professional engaging** vs **creative viral**?

#### Phase 3: generate_sections (WITH RAG) ← **MOST COMPLEX PHASE**

- **Task type**: **Pedagogical reasoning + structured content design** (hybrid task)
- **Model**: qwen3-max (primary) + Gemini (context overflow)
- **Current**: Default temperature (0.7)
- **Context**: Section-level RAG chunks (20-30 chunks)
- **Question**:

**CRITICAL TWO-PART QUESTION**:

**Option A: Single-stage generation** (recommended for MVP):
```typescript
{
  temperature: 0.6,  // Balanced compromise
  top_p: 0.9,
  frequency_penalty: 0.2,
  presence_penalty: 0.15,
  max_tokens: 4000
}
```
- **Pros**: Simple, fast, cost-effective
- **Cons**: Compromise between reasoning (needs higher) and structure (needs lower)

**Option B: Two-stage generation**:
```typescript
// Stage 1: Pedagogical reasoning
{ temperature: 0.75, max_tokens: 1200 }

// Stage 2: Content structure generation
{ temperature: 0.5, max_tokens: 3000 }
```
- **Pros**: Optimized for each substep
- **Cons**: **Doubles API calls**, +80% cost, higher latency

**Question for Research**:
- Do production educational systems use **two-stage generation** for lesson breakdown?
- Is the quality improvement worth **2x API calls**?
- What is **realistic ROI** for two-stage vs single-stage?

**RAG-Specific Question**:
- With RAG context (20-30 chunks), should temperature be **lower** (0.5 for grounding) or **medium** (0.6-0.7 for synthesis)?
- What do RAG educational systems use for **synthesis temperature** (not just retrieval)?

**Expected output**: Lessons array with detailed content_structure

#### Phase 4: validate_quality
- **Task type**: Embedding similarity (Jina-v3) + LLM-as-judge (5%)
- **Model**: OSS 120B (judge)
- **Current**: Default temperature (0.7)
- **Question**: Should LLM-as-judge use low temperature (0.1-0.2) for consistent scoring?

**CRITICAL**: Evaluation consistency is paramount. Temp should be near-zero.

#### Phase 5: validate_lessons
- **Task type**: Count validation (no LLM)
- **Question**: N/A

---

### Stage 6: Lesson Content Generation (PLANNED)

**Task type**: Long-form **educational content** generation (3-5K words per lesson)

**Content Archetypes** (from research):
1. **Technical content** (code_tutorial, algorithm explanations)
2. **Conceptual content** (concept_explainer, theory, frameworks)
3. **Compliance content** (legal_warning, regulations, policies)

**CRITICAL QUESTIONS PER ARCHETYPE**:

#### Archetype 1: Technical Content (code_tutorial)

**Current design** (from prior research): temp=0.2 (main), 0.1 (code blocks), 0.3 (examples)

**Questions**:
- Are these temperatures empirically validated for **OSS models**?
- Should **frequency_penalty** be higher (0.3) to prevent repetitive code patterns?
- What about **top_p**? Should it be narrow (0.7-0.8) for code accuracy?
- **Max_tokens**: How to handle long code blocks without truncation?

**Section-Level Dynamic Temperature Question** ← **CRITICAL FEASIBILITY**:
```typescript
// Requires 5-7 separate API calls per lesson
const technicalParams = {
  intro: { temperature: 0.5, max_tokens: 300 },      // Call 1
  mainContent: { temperature: 0.2, max_tokens: 1500 }, // Call 2
  codeBlocks: { temperature: 0.1, max_tokens: 800 },   // Call 3
  examples: { temperature: 0.3, max_tokens: 500 },     // Call 4
  exercises: { temperature: 0.2, max_tokens: 600 }     // Call 5
};
```

**Question for Research**:
- Do production systems use **per-section temperature** or **single temperature per lesson**?
- What is **latency impact** of 5-7 API calls vs 1 call?
- Is quality improvement worth **5-7x cost/latency**?
- Should MVP use **single temp per archetype**, defer section-level to Phase 2?

#### Archetype 2: Conceptual Content (concept_explainer) ← **CRITICAL OVER-OPTIMIZATION RISK**

**Current design** (from prior research): temp=0.75 (main), **1.0 (analogies)**

**CRITICAL CONCERN**: Temperature 1.0 for analogies - is this too high for **educational analogies**?

**Distinction**:
```
Creative Fiction Analogies (temp 1.0 OK):
- "Love is like a battlefield" (song lyrics)
- "Time is a flat circle" (philosophical poetry)
- Artistic metaphors, entertainment value

Educational Pedagogical Analogies (temp ???):
- "HTTP requests are like ordering at a restaurant"
- "Blockchain is like a shared ledger"
- Must be CLEAR, ACCURATE, HELPFUL (not just creative)
```

**Questions for Research**:
- What temperature do **educational content generators** (Khan Academy, Coursera) use for analogies?
- Is temp=1.0 too risky for **pedagogical analogies** (risk: confusing, inaccurate)?
- Should educational analogies use temp=0.7-0.85 instead of 1.0?
- Do B2B customers prefer **clear analogies** (temp 0.7) over **creative analogies** (temp 1.0)?

**Recommended Research Sources**:
- Khan Academy Khanmigo: What parameters for explanatory analogies?
- Duolingo: How do they generate educational examples?
- Academic papers on "AI-generated educational analogies" quality

**Expected output**: Conceptual lessons with **clear, accurate, helpful** analogies (NOT artistic creativity)

#### Archetype 3: Compliance Content (legal_warning)

**Current design** (from prior research): temp=0.05, top_p=0.5, NO penalties

**Questions**:
- Is temp=0.05 vs 0.0 meaningful? Or should we use pure greedy decoding (0.0)?
- Should top_p be even lower (0.3)?
- Confirmed: NO penalties (allow exact legal phrases) ✅

**CRITICAL**: Legal compliance - zero tolerance for errors.

---

## Research Sources to Explore

### 1. **Production Educational AI Systems** ← **PRIMARY FOCUS**

**Khan Academy (Khanmigo)**:
- What parameters do they use for **educational explanations**?
- What temperature for **pedagogical analogies**?
- Do they use **dynamic temperature** per content type?

**Coursera / edX**:
- AI-generated course content: What temperature ranges?
- Professional/academic tone: How achieved?

**Duolingo**:
- Exercise generation parameters
- Balance consistency vs creativity

**Corporate Training AI**:
- LinkedIn Learning, Udemy Business: Any public info on content generation params?

**Question**: Are there **public case studies** or **whitepapers** from these platforms?

### 2. **Academic Research** ← **SPECIFIC GAPS TO FILL**

**Temperature Studies** (EXISTING):
- "Does Temperature Control Creativity in LLMs?" (arXiv)
- "The Impact of Temperature on Reasoning Tasks" (ACL)

**NEW FOCUS AREAS**:
- **Pedagogical content generation**: Any studies on optimal temperature for **educational prose**?
- **Strategic reasoning**: Temperature for **curriculum design**, **instructional strategy** (not creative fiction)
- **OSS model behavior**: Do Llama 3, Qwen, Mistral require lower temps than GPT-4?
- **Educational analogies**: Quality vs temperature correlation

**Top-p (Nucleus Sampling)**:
- Original paper: "The Curious Case of Neural Text Degeneration" (Holtzman et al.)
- When to use top-p vs temperature?
- **NEW**: Interaction with OSS models vs commercial models

**Frequency/Presence Penalty** ← **UNDER-RESEARCHED IN V1**:
- "Controlling Repetition in Neural Text Generation" (ACL)
- When do penalties hurt coherence?
- **NEW**: Penalty impact on **educational content** specifically

**RAG Integration** ← **CRITICAL GAP IN V1**:
- **"Generate-then-Ground in RAG"**: Uses temp=0 for grounding
- **QUESTION**: Is temp=0 too restrictive for **pedagogical synthesis** from RAG chunks?
- What temperature for **creative synthesis** while maintaining **factual grounding**?

### 3. **Model-Specific Behavior** ← **NEW CRITICAL AREA**

**OSS Models (Llama 3, Qwen, Mistral)**:
- Do they behave differently than GPT-4/Claude at same temperature?
- Should recommendations be adjusted by -0.1 to -0.2 for OSS?
- Are there **model-specific temperature guides** for open-source models?

**Question for Research**:
- Find benchmarks comparing **OSS vs Commercial** models at various temperatures
- Look for **Llama 3 temperature recommendations**, **Qwen parameter guides**

---

## Expected Research Output

### 1. **Parameter Matrix by Stage** (CONSERVATIVE RECOMMENDATIONS)

**Table format**:

| Stage | Phase | Task Type | Temperature | Top-p | Freq Penalty | Pres Penalty | Max Tokens | Rationale |
|-------|-------|-----------|-------------|-------|--------------|--------------|------------|-----------|
| Stage 3 | Classification | Classification | **0.0** | **0.05** | 0.0 | 0.0 | 100 | Binary decision - extreme determinism |
| Stage 4 | Phase 1 | Classification | **0.2** | **0.8** | 0.0 | 0.0 | 200 | Multi-label classification (OSS model) |
| Stage 4 | Phase 2 | Counting | **0.1** | **0.5** | 0.0 | 0.0 | 300 | Numerical accuracy - narrow sampling |
| Stage 4 | Phase 3 | **Strategic Reasoning** | **0.5-0.7** | 0.9 | 0.2 | 0.2 | 1500 | **NOT 0.85+** - needs coherence |
| Stage 4 | Phase 4 | Structure Gen | 0.6 | 0.9 | 0.15 | 0.1 | 2000 | Balanced structure + creativity |
| Stage 4 | Phase 6 | RAG Planning | 0.4 | 0.85 | 0.1 | 0.15 | 1000 | Precise mapping + creative queries |
| Stage 5 | Phase 2 | Metadata Gen | 0.7-0.8 | 0.95 | 0.3 | 0.2 | 800 | Professional engaging (not viral) |
| Stage 5 | Phase 3 | Lesson Design | **0.5-0.65** | 0.9 | 0.2 | 0.15 | 4000 | RAG synthesis (not 0.75 two-stage) |
| Stage 5 | Phase 4 | LLM Judge | **0.1** | 0.7 | 0.0 | 0.0 | 500 | Consistent scoring |
| Stage 6 | Technical | Code Tutorial | 0.2 | 0.8 | 0.25 | 0.1 | 2000 | Code precision |
| Stage 6 | Conceptual | Explainer | 0.7 | 0.9 | 0.3 | 0.25 | 2500 | **Educational** clarity |
| Stage 6 | Conceptual | **Analogies** | **0.7-0.85** | 0.9 | 0.3 | 0.25 | 600 | **NOT 1.0** - pedagogical tool |
| Stage 6 | Compliance | Legal | **0.0-0.05** | 0.5 | 0.0 | 0.0 | 1200 | Legal accuracy |

**CRITICAL CORRECTIONS FROM V1**:
- ✅ Phase 3: **0.5-0.7** (not 0.85) - strategic reasoning needs coherence
- ✅ Phase 5.3: **0.5-0.65** (not 0.75 two-stage) - RAG synthesis + cost efficiency
- ✅ Analogies: **0.7-0.85** (not 1.0) - pedagogical clarity over wild creativity
- ✅ Top_p Phase 2: **0.5** (not 0.7) - narrow for counting tasks

### 2. **OSS Model Adjustments** (NEW SECTION)

If research confirms OSS models need lower temps:

```typescript
// Commercial model recommendations
const commercialParams = { temperature: 0.7 };

// OSS model adjustments
const ossParams = {
  temperature: commercialParams.temperature - 0.15  // Conservative adjustment
};
```

**Question for Research**: What is typical adjustment factor? -0.1? -0.2?

### 3. **Quality-Cost Analysis** (REALISTIC EXPECTATIONS)

**Comparison table**:

| Configuration | Output Quality | Retry Rate | Avg Tokens | Cost per Lesson | Use Case |
|---------------|----------------|------------|------------|-----------------|----------|
| Low Temp (0.2) | 4.0/5.0 | 1.1x | 3200 | $0.25 | Technical, Compliance |
| Medium (0.6) | 4.2/5.0 | 1.25x | 3500 | $0.30 | Strategic, Balanced |
| High Temp (0.8) | 3.9/5.0 | 1.4x | 4000 | $0.38 | Creative (rare) |
| **Dynamic (0.0-0.85)** | **4.3/5.0** | **1.25-1.35x** | **3400** | **$0.32** | **RECOMMENDED** - realistic |

**CRITICAL CHANGE**: Retry rate **1.25-1.35x** (not 1.18x optimistic from V1)

**Question for Research**:
- What are **actual production retry rates** for dynamic configs?
- Are there case studies with **real numbers**?

### 4. **Implementation Guidelines** (PHASED APPROACH)

**Phase 1 (MVP - Week 1-2)**: Single temperature per stage
```typescript
// Simple, proven approach
const params = selectStageParameters(stage, phase);
```

**Phase 2 (Optimization - Month 2-3)**: Content archetype routing
```typescript
// Stage 6 only - technical vs conceptual vs compliance
const params = selectContentArchetypeParameters(archetype);
```

**Phase 3 (Advanced - Month 4+)**: Section-level dynamic (if ROI justified)
```typescript
// Only if research shows clear ROI
const params = selectSectionParameters(archetype, sectionType);
```

**Question for Research**:
- Should we **defer section-level optimization** to Phase 3?
- What is **minimum quality threshold** to justify per-section API calls?

### 5. **Risk Mitigation Strategies** (NEW SECTION)

**If parameters produce low-quality output**:

| Problem | Symptoms | Diagnosis | Solution | Expected Impact |
|---------|----------|-----------|----------|-----------------|
| **Incoherent reasoning** | Contradictory strategy, illogical flow | Temp too high | Reduce temp by 0.1-0.2 | +25% coherence |
| **Generic content** | Boring, repetitive | Temp too low OR penalties too low | Increase temp +0.1 OR presence_penalty +0.1 | +15% engagement |
| **Counting errors** | Wrong lesson count, bad estimates | Temp too high | Reduce to 0.1 OR top_p to 0.5 | +40% accuracy |
| **Code hallucinations** | Invalid syntax, wrong libraries | Temp too high | Reduce to 0.1-0.2 | +30% code accuracy |
| **Confusing analogies** | Incorrect, misleading comparisons | Temp too high (1.0) | Reduce to 0.7-0.85 | +20% clarity |

---

## Success Criteria

Research is successful if it provides:

1. ✅ **Conservative parameter recommendations** for production B2B platform
2. ✅ **OSS model-specific guidance** (Llama 3, Qwen, Mistral)
3. ✅ **Educational content evidence** (Khan Academy, Coursera, not just creative writing studies)
4. ✅ **Strategic reasoning temps** (curriculum design, not creative brainstorming)
5. ✅ **RAG synthesis temperatures** (grounding + creativity balance)
6. ✅ **Realistic cost-quality trade-offs** (not overly optimistic)
7. ✅ **Phased implementation roadmap** (MVP → Optimization → Advanced)
8. ✅ **Risk mitigation for over-optimization** (when temps too high cause problems)

---

## Special Considerations

### 1. **Model-Specific Behavior** ← **CRITICAL NEW FOCUS**

**Question for Research**:
- **Llama 3**: Recommended temperature ranges for educational content?
- **Qwen**: Does it behave like GPT-4 or need lower temps?
- **Mistral**: Any parameter guides for reasoning vs creative tasks?
- **General**: Should we apply **-0.1 to -0.2 adjustment** for OSS models?

### 2. **RAG Integration** ← **CRITICAL GAP FROM V1**

**Question for Research**:
- RAG grounding research uses temp=0 (deterministic)
- BUT: Educational content needs **synthesis**, not verbatim copying
- **What temperature balances grounding + pedagogical synthesis?**
- Are there studies on **"creative RAG"** (not just factoid retrieval)?

**Specific Scenarios**:

**Scenario A: Factoid Retrieval** (temp=0 OK):
```
Question: "What is the capital of France?"
RAG chunk: "Paris is the capital of France."
Output: "Paris" (verbatim OK)
```

**Scenario B: Pedagogical Synthesis** (temp=0 too restrictive?):
```
RAG chunks: [Technical spec 1, Technical spec 2, Example code]
Task: "Explain OAuth2 flow for beginners using analogy"
Output: ??? (needs synthesis + analogy creation from chunks)
```

**Question**: Should Scenario B use temp=0.5-0.6 for synthesis?

### 3. **Section-Level Dynamic Temperature Feasibility** ← **NEW CRITICAL ANALYSIS**

**Research Question**:
- Do production systems (Khan Academy, Duolingo) use **per-section temperatures**?
- If YES: What is their architecture? (Pre-generate all sections separately?)
- If NO: Why not? (Cost/latency not worth quality gain?)

**Cost-Benefit Analysis Request**:
```
Single-temp approach:
- 1 API call per lesson
- Cost: $0.30 per lesson
- Quality: 4.2/5.0

Per-section dynamic:
- 5-7 API calls per lesson
- Cost: $0.30 × 6 = $1.80 per lesson (6x cost)
- Quality: 4.4/5.0 (hypothetical +5% improvement)

Question: Is +5% quality worth 6x cost?
```

### 4. **Pedagogical Analogies vs Creative Fiction** ← **NEW CRITICAL DISTINCTION**

**Research Question**:
- Are there studies comparing **educational analogy quality** at different temperatures?
- What temperature do teachers/instructional designers prefer for analogies?
- Do students learn better from **clear analogies** (temp 0.7) vs **creative analogies** (temp 1.0)?

**Hypothesis to Validate**:
```
Educational Analogy Quality = Clarity × Accuracy × Helpfulness

High temp (1.0):
+ Higher creativity/novelty
- Lower accuracy (confusing)
- Lower clarity (complex)
→ Net: Worse for learning

Medium temp (0.7-0.85):
+ Good creativity (fresh angles)
+ High accuracy (correct comparisons)
+ High clarity (understandable)
→ Net: Better for learning
```

**Question**: Does research support this hypothesis?

---

## Context for Perplexity AI Research

**Project**: MegaCampusAI B2B course generation platform

**Architecture**: Multi-stage pipeline (Document Processing → Analyze → Generation → Lesson Content)

**Stack**: Primarily OSS models (qwen, llama variants) via OpenRouter

**Customer**: B2B corporate training (NOT creative fiction, NOT marketing)

**Goal**: Optimize LLM parameters for **production educational content** to maximize:
- Output quality (**coherent, accurate, pedagogically effective**)
- Token efficiency (fewer retries, realistic retry rates)
- Cost optimization (avoid over-optimization that increases retries)

**Current state**: Default temperature (0.7) across all stages (suboptimal)

**Target**: **Conservative, evidence-based** parameter recommendations suitable for:
- Production B2B platform (not research prototype)
- OSS models (not just GPT-4/Claude)
- Educational prose (not creative fiction)
- Strategic reasoning (not creative brainstorming)

**Deliverable**: Implementation-ready parameter matrix + realistic cost-quality trade-offs + phased rollout plan

**Priority**: HIGH (blocks production optimization, directly impacts quality and cost)

**CRITICAL**: Prioritize **conservative recommendations** (avoid over-optimization risks)

---

**Research Question**:

What are the optimal LLM parameters (temperature, top-p, frequency_penalty, presence_penalty, max_tokens) for each stage, phase, and content archetype in our multi-stage course generation pipeline, specifically for:
1. **B2B educational content** (not creative fiction)
2. **OSS models** (Llama 3, Qwen, Mistral)
3. **Strategic pedagogical reasoning** (not creative brainstorming)
4. **RAG-based synthesis** (grounding + creativity balance)
5. **Production stability** (conservative, proven approaches)

Based on production evidence from **educational AI systems** (Khan Academy, Coursera, Duolingo), academic research on **pedagogical content generation**, and **OSS model behavior** studies.
