# Generation Architecture Design (RT-002 Analysis)

**Date**: 2025-11-07
**Status**: Research Complete - Architectural Decisions Made
**Research Source**: RT-002 DeepResearch (2 reports)

---

## Executive Summary

Based on comprehensive research analysis, we adopt a **Hybrid Specialization Model** with clear division of labor between Analyze (Stage 4) and Generation (Stage 5):

- **Analyze extracts structure** → Section-level breakdown, pedagogical patterns, scope constraints
- **Generation creates detail** → Lesson-level specs, exercises, prompts for Stage 6
- **RAG is optional** → Use selectively in Generation for specific detail retrieval only

**Key Finding**: This approach achieves **78.5% production success rate** vs 66.2% for alternative architectures.

---

## 1. Division of Labor: Analyze vs Generation

### 1.1 Analyze Stage Responsibilities (Gemini 2.5 Flash, 1M context)

**Primary Focus**: Comprehensive extraction and structural planning using full document context

#### MUST DO (Leverage Large Context):
1. **Document-level understanding**
   - Process entire uploaded materials (100+ pages) in single pass
   - Capture themes, relationships, cross-references
   - Detect pedagogical patterns across full document

2. **Structured metadata extraction**
   - Course category, difficulty level, prerequisites
   - Estimated duration, target audience
   - Topic and concept mapping with relationships

3. **Pedagogical strategy identification**
   - Learning theory alignment (problem-based, lecture-based, etc.)
   - Instructional approach from source materials
   - Theory vs practice balance observed in documents

4. **Section-level structure** (3-7 sections)
   - High-level learning objectives per section (3-5 objectives)
   - Key topics list (not hierarchical decomposition yet)
   - Suggested content types (video, exercises, projects)
   - Estimated duration per section

5. **Generation guidance** (scope constraints)
   - Tone/voice requirements with evidence from documents
   - Content boundaries (what to include/avoid)
   - Domain-specific terminology and standards
   - Assessment approaches observed

#### MUST NOT DO (Avoid Over-Specification):
- ❌ Detailed lesson-level specifications (too granular)
- ❌ Specific prompt templates for lesson generation (stifles reasoning)
- ❌ Exercise and homework design (creative elaboration, not structural analysis)
- ❌ Schema definitions for Stage 6 (reasoning task)

**Rationale**: Research shows that over-constraining downstream stages reduces quality by **15-30%**. Analyze should provide objectives, constraints, success criteria—the "what," not the "how."

---

### 1.2 Generation Stage Responsibilities (qwen3-max, 128K context)

**Primary Focus**: Intelligent reasoning and detailed content creation based on structured foundation

#### MUST DO (Leverage Reasoning):
1. **Lesson-level elaboration**
   - Expand each section into 3-5 focused lessons
   - Determine optimal lesson granularity based on complexity
   - Create narrative continuity across lessons

2. **Detailed learning objectives** (SMART format)
   - Measurable, action-oriented using Bloom's taxonomy verbs
   - Specific prerequisites and dependencies
   - Appropriate difficulty progression

3. **Topic hierarchies**
   - Expand key topics into subtopic structures
   - Depth adjustment based on complexity flags from Analyze
   - Logical sequencing for progressive difficulty

4. **Exercise generation specifications**
   - Practice problems with solutions and grading rubrics
   - Exercise types aligned to objectives (coding, derivation, interpretation)
   - Difficulty levels (beginner, intermediate, advanced)

5. **Prompt creation for Stage 6**
   - Specific prompts for homework, tests, interactive elements
   - Schema definitions for structured content output
   - Examples and templates ready to execute

6. **Pedagogical reasoning**
   - Adaptive depth based on topic complexity
   - Optimal explanation strategies (analogies, worked examples, visualizations)
   - Assessment strategy per lesson

**Rationale**: Generation should **reason about pedagogy**, not just execute instructions. Production systems (JetBlue's DSPy) show this adaptive approach achieves **2x faster deployment** while maintaining quality.

---

## 2. Document Information Extraction Strategy

### 2.1 Primary Strategy: Full-Context Extraction in Analyze (RECOMMENDED)

**Use Gemini Flash's 1M context for complete document processing**

**Benefits**:
- **Cross-document reasoning**: Detect themes spanning chapters, identify contradictions
- **Relationship preservation**: Maintain concept dependencies, prerequisite chains
- **No chunking artifacts**: Avoid losing context at arbitrary boundaries (20-35% quality improvement)
- **Simpler architecture**: No vector database dependency for core functionality

**What to Extract During Analyze**:
1. Structural information (document hierarchy, section relationships, cross-references)
2. Conceptual information (main ideas, supporting details, examples with context)
3. Pedagogical elements (existing learning objectives, difficulty progression)
4. Contextual metadata (for each section: position in narrative, related concepts, complexity)

**Economics**: Processing 100-page documents costs **$0.10-0.50 per document one-time** vs **$0.01-0.05 per query for RAG**. Break-even is 10-50 queries per document. For course generation (multiple lessons per document), full-context extraction amortizes well.

---

### 2.2 Optional Enhancement: RAG in Generation (SELECTIVE USE)

**When RAG Adds Value**:

| Scenario | Use RAG? | Reason |
|----------|----------|--------|
| Specialized domain terminology | ✅ YES | Ensure accuracy and consistency of technical terms |
| Multiple source documents with overlap | ✅ YES | Avoid duplication, maintain consistency |
| Course references specific standards/frameworks | ✅ YES | Retrieve exact formulations, citations |
| Generation needs specific examples | ✅ YES | Pull relevant, well-formed examples efficiently |
| General education or broad topics | ❌ NO | Analyze already captured essentials |
| First draft generation | ❌ NO | RAG adds latency; iterate on logic first |
| Cost-sensitive environment | ❌ NO | Selective RAG sufficient |

**Implementation Pattern (Lazy Initialization)**:
```
During Analyze:
  - Embed document chunks (semantic double-pass, free)
  - Store in Qdrant with metadata enrichment

During Generation:
  FOR each lesson specification:
    1. Generate high-level topics and objectives
    2. IF explicitly needs specific details:
       - Query: "Find examples of [concept]"
       - Retrieve top-3 relevant chunks
       - Integrate into context
       - Continue generation
    3. ELSE: Continue without retrieval
    4. Cache retrieved chunks
```

**Cost Implications**:
- No RAG: $0.50-1.00 per course for Generation
- Selective RAG (2-5 queries): $0.55-1.15 per course
- Heavy RAG (15+ queries): $0.80-1.50 per course
- Dense proposition-based RAG: $17.80-29.33 per course ❌ **AVOID**

**Decision**: Start WITHOUT RAG. Add selectively only if:
- Source library exceeds 100 documents
- Documents updated frequently (monthly+)
- Need ultra-low-latency detail retrieval
- A/B testing shows measurable quality improvement (>10%)

---

## 3. Prompt Engineering Responsibility

### 3.1 Analyze Provides Structure and Guidance (NOT Prompts)

**What Analyze Outputs for Generation** (Guidance, Not Execution):

```json
"generation_guidance": {
  "section_objective": "Teach forward propagation implementation",
  "key_concepts_to_cover": ["matrix multiplication", "activation", "loss calculation"],
  "pedagogical_approach": "code-first with explanations",
  "success_criteria": [
    "Student can implement forward pass from scratch",
    "Student understands computational graph concept"
  ],
  "constraints": {
    "use_analogies": ["assembly line for data flow"],
    "avoid_complexity": ["backpropagation details (covered later)"],
    "include_elements": ["worked example", "coding exercise", "debugging tips"]
  },
  "contextual_language": "Assume familiarity with matrix operations but not neural networks"
}
```

**Optimal Level of Detail** (Section-Level Guidance):
- ✅ Section should cover X concepts
- ✅ Use Y pedagogical approach
- ✅ Include Z types of exercises
- ✅ Avoid A complexity levels
- ✅ Target B audience assumptions

**Too Detailed (AVOID)**:
- ❌ Paragraph 1 should say exactly...
- ❌ Use phrase "neural network" 3 times
- ❌ Structure lesson as: intro (50 words), explanation (200 words)...

**Too Vague (AVOID)**:
- ❌ "Generate good content for this section"
- ❌ "Make it educational"

**Metaphor**: Scope instructions are **architectural blueprints**, not construction instructions. Specify room sizes and purposes; Generation determines furniture arrangement and decor.

---

### 3.2 Generation Creates Lesson-Specific Prompts

**Generation Stage Creates**:
1. **Lesson prompts** for each learning activity within section
2. **Assessment prompts** for homework questions, test items, rubrics based on objectives
3. **Schema definitions** for Stage 6 content generation
4. **Exercise specifications** with starter code, test cases, solutions

**Example Generation Output**:
```json
{
  "lesson_1": {
    "title": "Forward Propagation Fundamentals",
    "activities": [
      {
        "type": "coding_exercise",
        "prompt": "Implement a forward pass for a 2-layer network that takes a 784-dimensional input and produces 10 class probabilities. Use sigmoid activation in the hidden layer and softmax in the output.",
        "starter_code": "...",
        "test_cases": [...]
      }
    ],
    "homework_prompt": "...[specific assignment]...",
    "self_assessment_questions": [...]
  }
}
```

**Rationale**: Analyze has full document context to determine **what should be taught and in what order**. Generation has reasoning capability to determine **how to teach it effectively** given those constraints. This mirrors Khan Academy's architecture.

---

## 4. Section Breakdown Depth

### 4.1 Analyze Output: Section-Level (3-7 sections)

**Recommended Structure**:
```json
"sections_breakdown": [
  {
    "section_id": "3",
    "title": "Backpropagation and Training",
    "learning_objectives": [
      "Derive the backpropagation algorithm using chain rule",
      "Implement gradient computation for multi-layer networks",
      "Debug common training issues (vanishing gradients, overfitting)"
    ],
    "key_topics": [
      "chain_rule_application",
      "computational_graphs",
      "gradient_checking",
      "optimization_basics"
    ],
    "estimated_duration": "6 hours",
    "difficulty": "high",
    "prerequisites": ["section_1", "section_2"]
  }
]
```

**Why Section-Level is Optimal**:
- Maintains flexibility for Generation to adapt lesson granularity
- Avoids premature decisions about pacing before reasoning about pedagogy
- Enables Generation to adjust depth based on complexity
- Matches production patterns (Duolingo: scenario-level by experts, interactions by AI)

---

### 4.2 Generation Output: Lesson-Level (3-5 lessons per section)

**Generation Creates Granular Structure**:
```json
"section_3_detailed": {
  "lessons": [
    {
      "lesson_1": {
        "title": "The Chain Rule Foundation",
        "duration": "45 minutes",
        "learning_outcome": "Apply chain rule to compute gradients",
        "activities": [...],
        "formative_assessment": [...]
      }
    },
    {
      "lesson_2": {
        "title": "Implementing Backpropagation",
        "duration": "90 minutes",
        "learning_outcome": "Code backward pass from scratch",
        "activities": [...],
        "coding_exercises": [...]
      }
    }
  ],
  "section_assessment": {
    "homework": [...],
    "quiz": [...],
    "rubric": [...]
  }
}
```

**Why Generation Handles Lesson Breakdown**:
1. **Reasoning about pedagogy**: Determines optimal pacing, when to split complex topics
2. **Adaptive depth**: Can adjust lesson granularity based on complexity (simple topics = 1 lesson, complex = multiple)
3. **Coherence**: Ensures lessons flow narratively within section context
4. **Flexibility**: Can generate different structures for different strategies

**Rationale**: Matches DSPy pattern where **signatures define tasks at high level** but **modules reason about execution details**.

---

## 5. Schema Enhancements Required

### 5.1 Analyze Output Schema (`analysis_result`) Enhancements

**NEW FIELDS TO ADD**:

```typescript
interface AnalysisResult {
  // EXISTING FIELDS (keep as-is)
  course_category: string;
  contextual_language: ContextualLanguage;
  topic_analysis: TopicAnalysis;
  recommended_structure: RecommendedStructure;
  pedagogical_strategy: PedagogicalStrategy;
  scope_instructions: ScopeInstructions;

  // NEW FIELD 1: Document-Level Understanding
  document_analysis: {
    source_materials: string[];  // IDs of uploaded documents
    main_themes: Array<{
      theme: string;
      importance: 'high' | 'medium' | 'low';
      coverage: string;  // e.g., "chapters 1-3"
    }>;
    concept_graph?: {  // Optional: concept relationships
      nodes: Array<{ id: string; label: string; }>;
      relationships: Array<{ from: string; to: string; type: 'prerequisite' | 'related' }>;
    };
    complexity_assessment: string;
    estimated_total_hours: number;
  };

  // NEW FIELD 2: Pedagogical Patterns
  pedagogical_patterns: {
    primary_strategy: string;  // e.g., "problem-based learning"
    theory_practice_ratio: string;  // e.g., "30:70"
    assessment_types: string[];  // e.g., ["coding", "quizzes", "projects"]
    key_patterns: string[];  // e.g., ["build incrementally", "learn by refactoring"]
  };

  // ENHANCED FIELD: Section Breakdown (add new properties)
  sections_breakdown: Array<{
    section_id: string;
    title: string;
    learning_objectives: string[];  // 3-5 high-level objectives
    key_topics: string[];  // Topic names only (not hierarchical)
    content_types: string[];  // e.g., ["video", "exercise", "project"]
    estimated_duration_hours: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    prerequisites: string[];  // section_ids of prerequisite sections
  }>;

  // ENHANCED FIELD: Generation Guidance (more detailed)
  generation_guidance: {
    tone: string;
    use_analogies: boolean;
    avoid_jargon: string[];  // Terms to avoid or explain
    include_visuals: string[];  // Types of visuals to include
    exercise_types: string[];  // Types of exercises to create
    contextual_language_hints: string;  // Audience assumptions
  };
}
```

**Rationale**: These enhancements provide Generation with:
- Document-level context without re-processing
- Explicit pedagogical patterns to maintain consistency
- Clear section boundaries with dependencies
- Detailed guidance for lesson creation

---

### 5.2 Generation Output Schema (`course_structure`) - NO CHANGES NEEDED

Current schema already supports lesson-level detail. Verify it includes:
- Lesson-level breakdown (3-5 per section)
- Learning objectives per lesson (SMART format)
- Topic hierarchies with subtopics
- Exercise specifications with difficulty levels
- Prompts for Stage 6 generation

---

## 6. Generation Orchestration Phases

### 6.1 Proposed 5-Phase Architecture (VALIDATED)

Based on research findings and token budget constraints, maintain **5-phase orchestration**:

**Phase 1: Metadata Generation**
- Input: Analyze result (section-level structure)
- Output: Course-level metadata (title, description, learning outcomes)
- Model: TBD (RT-001 will determine: qwen3-max or OSS 120B)

**Phase 2: Section Batch Processing** (Parallel, 1 section per batch)
- Input: Analyze result + section_id
- Output: Lesson-level breakdown for 1 section
- Model: TBD (RT-001 will determine: OSS 20B default, escalate if needed)
- Token Budget: 120K total (90K input, 30K output) per batch
- RAG: Optional, up to 40K tokens if needed (dynamic adjustment)

**Phase 3: Validation & Quality Check**
- Input: Generated lessons for section
- Output: Quality score, alignment check, schema validation
- Model: TBD (RT-004 will determine retry strategy)

**Phase 4: Assembly**
- Input: All validated sections
- Output: Complete course_structure JSON
- Model: Lightweight (no LLM, just JSON merge)

**Phase 5: Final Verification**
- Input: Complete course_structure
- Output: Production-ready JSONB for Stage 6
- Model: Schema validator + quality gate

**Rationale**: 5 phases align with hybrid specialization model (78.5% success rate). Section-level batching with parallel processing balances token budget and production reliability.

---

## 7. Trade-Off Analysis: Chosen Strategy

### 7.1 Strategy A vs Strategy B

**Strategy A: Analyze Does MORE (Detailed Extraction)**
- Analyze extracts comprehensive structured information
- Generation executes against detailed structure
- ✅ More consistent outputs, easier debugging
- ❌ Over-constrains Generation reasoning, less adaptive

**Strategy B: Analyze Does LESS (High-Level Structure)**
- Analyze provides section-level structure only
- Generation has freedom to reason about pedagogy
- ✅ Leverages reasoning fully, more adaptive
- ❌ Less consistency, Generation more expensive

**CHOSEN: Hybrid Approach (Best of Both)**

**Analyze is comprehensive on structure, moderate on detail**:
- ✅ Do extensively: Document analysis, concept extraction, relationship mapping
- ✅ Do moderately: Pedagogical strategy, example identification, difficulty tagging
- ❌ Do minimally: Specific phrasing, detailed instructions, prescriptive sequencing

**Generation reasons actively within constraints**:
- Interpret Analyze structure as architectural guidance
- Apply reasoning to determine lesson breakdown
- Create content adapted to pedagogical strategy
- Generate prompts aligned to objectives

**Result**: Balances consistency (from structured Analyze) with quality (from reasoning Generation). Production systems report **90%+ sufficiency** with this approach.

---

## 8. Production-Ready Validation Strategy

### 8.1 Analyze Stage Quality Gates

**After Analyze Completion**:
- ✅ Schema validation (all required fields present)
- ✅ Section count validation (3-7 sections)
- ✅ Objective quality check (measurable, aligned to Bloom's taxonomy)
- ✅ Prerequisite chain validation (no circular dependencies)
- ✅ Coverage analysis (all key concepts from documents included)

---

### 8.2 Generation Stage Quality Gates

**After Generation Completion**:
- ✅ Objective-content alignment verification
- ✅ Lesson count validation (3-5 per section)
- ✅ Reading level check (Flesch-Kincaid for target audience)
- ✅ Exercise solution verification (for quantitative problems)
- ✅ Schema compliance (JSONB matches expected structure)

**RT-004 will define**: Semantic similarity thresholds, retry logic, model escalation strategy

---

## 9. Key Decisions Summary

### Decision 1: Analyze Output Enhancement
✅ **DECISION**: Add `document_analysis`, `pedagogical_patterns`, enhance `generation_guidance`
- **Rationale**: Provides Generation with document-level context without re-processing
- **Implementation**: Update `analysis_result` schema in Analyze codebase
- **Follow-up Task**: Create migration task for Analyze improvement (separate feature)

---

### Decision 2: Generation Orchestration Phases
✅ **DECISION**: Maintain **5-phase architecture** (Metadata → Section Batch → Validation → Assembly → Verification)
- **Rationale**: Aligns with research findings (78.5% success rate), supports parallel processing
- **Token Budget**: 120K per batch (90K input, 30K output), RAG up to 40K if needed
- **Follow-up**: RT-001 will assign models to each phase

---

### Decision 3: RAG Usage Strategy
✅ **DECISION**: **Start WITHOUT RAG** in Generation. Add selectively only if needed.
- **When to Add**: Source library >100 docs, frequent updates, measurable quality improvement
- **Implementation**: Lazy initialization pattern (embed during Analyze, query during Generation)
- **Cost**: Selective RAG adds ~5% cost for 10-15% quality improvement
- **Follow-up**: Monitor quality metrics; add RAG if A/B testing shows benefit

---

### Decision 4: Granularity Hierarchy
✅ **DECISION**: **Section-level in Analyze (3-7 sections)**, **Lesson-level in Generation (3-5 per section)**
- **Rationale**: Matches natural document structure, avoids over-specification, enables adaptive reasoning
- **Analyze Output**: Section objectives (3-5), key topics (list), content types (suggestions)
- **Generation Output**: Lesson specs (detailed), topic hierarchies (subtopics), exercise specs (rubrics)

---

## 10. Implementation Roadmap

### Phase 0: Schema Enhancement (Analyze Improvement) - SEPARATE FEATURE
- Update `analysis_result` schema with new fields
- Modify Analyze Stage 4 to populate new fields
- Test with sample courses
- **Owner**: Analyze team (NOT this feature)

### Phase 1: Generation Core Architecture (THIS FEATURE)
- Implement 5-phase orchestration (T013-T018)
- Create metadata generator (T019)
- Create section batch generator (T020)
- Implement token budget validation (T003, RT-003)
- **Dependency**: Assumes Analyze outputs enhanced schema

### Phase 2: Model Routing (After RT-001)
- Assign models to each phase (metadata, sections, validation)
- Implement escalation triggers (quality < threshold)
- Implement Gemini fallback (token overflow)

### Phase 3: Quality Validation (After RT-004)
- Implement semantic similarity validation
- Create retry logic (progressive prompts, temperature adjustment, model escalation)
- Define failure handling strategy

### Phase 4: Optional RAG Integration (IF NEEDED)
- Implement Qdrant search utility (T022)
- Add selective RAG querying in section-batch-generator
- Measure quality improvements
- Decision point: Is 10-15% improvement worth 5% cost?

---

## 11. Expected Outcomes

### Success Metrics (Based on Research)
- **Course structure accuracy**: 80-90% (matches source material intent)
- **Learning objective quality**: 75-85% (sufficient for downstream generation)
- **Lesson specifications sufficiency for Stage 6**: >90%
- **Pedagogical consistency**: 80-90% (maintains voice and approach)
- **Zero hallucinated structures**: >95%

### Cost Model (Per Course)
- **Analyze stage**: $0.30-0.60 (one-time, 150-200K tokens)
- **Generation stage**: $0.50-1.50 (50-100K tokens)
- **Optional RAG overhead**: $0.03-0.05 (5% additional)
- **Total per course**: **$0.80-2.10** (highly scalable)

### Optimization Path
- Baseline (Week 1): 70% accuracy
- After prompt iteration (Week 3): 80% accuracy
- With RT-001 model routing (Week 4): 85% accuracy
- With RT-004 retry logic (Week 5): 90%+ accuracy

---

## 12. Next Steps

1. ✅ **RT-002 COMPLETE** - Architecture design finalized
2. ⏭️ **Proceed to RT-001** - Multi-Model Orchestration (assign models to phases)
3. ⏭️ **Proceed to RT-004** - Quality Validation (define retry strategy)
4. ⏭️ **Proceed to RT-006** - Bloom's Taxonomy (validation rules)
5. ⏭️ **Begin Implementation** - Create tasks based on architecture design

---

## References

**Research Sources**:
- RT-002 Report 1: `docs/research/008-generation/Optimal Multi-Stage Architecture for AI Course Generation.md` (~27KB)
- RT-002 Report 2: `docs/research/008-generation/Optimal Multi-Stage Architecture for AI Course Generation 2.md` (~40KB)

**Key Research Findings**:
- Hybrid specialization achieves **78.5% success rate** vs 66.2% for alternatives
- Full-context processing outperforms RAG by **20-40% on multi-hop questions**
- Over-specification reduces quality by **15-30%**
- Section-level granularity in Analyze + lesson-level in Generation = optimal balance

---

**Document Status**: ✅ COMPLETE - Ready for RT-001 Analysis
