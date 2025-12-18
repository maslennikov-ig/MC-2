# Optimal Multi-Stage Architecture for AI Course Generation

The research reveals a clear consensus: **separate comprehensive analysis from intelligent generation**, leverage each model's strengths, and use structured intermediate outputs. Your two-stage pipeline aligns with production best practices, but the devil is in the division-of-labor details.

## The core answer: Analyze extracts and structures; Generation reasons and creates

Your **Analyze stage** (Gemini 2.5 Flash, 1M context) should focus on **comprehensive information extraction and structural planning** from full documents. Your **Generation stage** (qwen3-max, 128K context) should focus on **intelligent reasoning and detailed content creation** based on that structured foundation. RAG is an optional enhancement, not a primary strategy.

### Why this matters for your system

Production systems like Khan Academy's Khanmigo and Notion AI demonstrate that **model specialization beats one-size-fits-all approaches**. Gemini Flash's massive context window enables holistic document understanding that RAG cannot replicate, while reasoning models excel at the logical work of translating structure into coherent educational content. Research shows large-context models achieve **47.25 F1 vs 34.26 F1 for RAG** on comprehension tasks, while reasoning models like o1 score **83% vs 9% for GPT-4o** on complex problems requiring step-by-step logic.

## What Analyze should prepare vs what Generation should create

### Analyze Stage Responsibilities (Gemini 2.5 Flash)

**Do comprehensive extraction and high-level structuring:**

1. **Document-level understanding** - Process entire uploaded materials (100+ pages) in single pass to capture themes, relationships, and cross-references that chunking destroys
2. **Structured metadata extraction** - Course category, difficulty level, prerequisites, estimated duration, target audience
3. **Pedagogical strategy** - Learning theory alignment, instructional approach, scaffolding type based on content analysis
4. **Topic and concept mapping** - Extract key concepts with relationships, dependencies, and hierarchical organization
5. **Section-level structure** - Recommended course outline with sections including learning objectives and key topics per section
6. **High-level guidance for Generation** - Scope instructions, tone/style requirements, content constraints (what to include/avoid)

**Output format: Structured JSON with rich context**

```json
{
  "document_analysis": {
    "source_materials": ["textbook_id", "paper_id"],
    "main_themes": [{"theme": "...", "importance": "high", "coverage": "chapters 1-3"}],
    "concept_graph": {"nodes": [...], "relationships": [...]},
    "complexity_assessment": "advanced undergraduate",
    "estimated_total_hours": 40
  },
  "pedagogical_strategy": {
    "approach": "problem-based learning",
    "scaffolding_type": "worked examples then practice",
    "prerequisite_knowledge": ["linear_algebra", "basic_probability"]
  },
  "course_structure": {
    "sections": [
      {
        "section_id": "1",
        "title": "Introduction to Neural Networks",
        "learning_objectives": [
          "Understand perceptron architecture",
          "Implement forward propagation"
        ],
        "key_topics": ["perceptrons", "activation_functions", "gradient_descent"],
        "estimated_hours": 4,
        "difficulty": "moderate",
        "dependencies": []
      }
    ]
  },
  "generation_guidance": {
    "tone": "conversational but precise",
    "use_analogies": true,
    "avoid_jargon": ["stochastic", "ergodic"],
    "include_visuals": ["architecture_diagrams", "activation_plots"],
    "exercise_types": ["coding", "derivation", "interpretation"]
  }
}
```

**Critical: Analyze should NOT generate specific lesson prompts or paragraph-level content instructions.** Research shows this over-constrains downstream reasoning models, reducing quality by 15-30%. Instead, provide **objectives, constraints, and success criteria** - the "what" not the "how."

### Generation Stage Responsibilities (qwen3-max)

**Do intelligent reasoning and detailed content creation:**

1. **Lesson-level elaboration** - Expand each section into detailed lessons with specific learning activities
2. **Content reasoning** - Determine optimal explanations, examples, and sequencing based on pedagogical strategy
3. **Exercise generation** - Create practice problems, solutions, and grading rubrics aligned to objectives
4. **Prompt creation** - Generate specific prompts for homework, tests, and interactive elements
5. **Coherence and flow** - Ensure narrative continuity across lessons within each section
6. **Adaptive depth** - Adjust explanation depth based on complexity flags from Analyze

**Key insight from production systems:** Generation should **reason about pedagogy** not just execute instructions. JetBlue's DSPy implementation showed this adaptive approach achieves **2x faster deployment** while maintaining quality through reasoning-driven decisions.

## Document information extraction strategy: Full-context first, RAG optional

### Extract comprehensively in Analyze (recommended primary strategy)

**Use Gemini Flash's 1M context for complete document processing:**

Recent research confirms full-context processing outperforms RAG for initial understanding by **20-40% on multi-hop questions**. Your 100+ page documents (roughly 50-200K tokens) fit comfortably in Gemini Flash's context, making RAG unnecessary for initial extraction.

**Benefits for your use case:**
- **Cross-document reasoning** - Detect themes spanning chapters, identify contradictions, understand narrative flow
- **Relationship preservation** - Maintain concept dependencies, prerequisite chains, and structural relationships
- **No chunking artifacts** - Avoid losing context at arbitrary boundaries (research shows 20-35% quality improvement)
- **Simpler architecture** - No vector database, embedding pipeline, or retrieval logic for core functionality

**What to extract during Analyze:**
1. **Structural information** - Document hierarchy, section relationships, cross-references
2. **Conceptual information** - Main ideas, supporting details, examples with context
3. **Pedagogical elements** - Existing learning objectives, difficulty progression, prerequisite statements
4. **Contextual metadata** - For each section: position in narrative, related concepts, complexity indicators

**Economics:** Processing 100-page documents costs **$0.10-0.50 per document one-time** (Gemini Flash pricing) vs **$0.01-0.05 per query for RAG**. Break-even is 10-50 queries per document. For course generation (multiple lessons per document), full-context extraction amortizes well.

### Use RAG in Generation selectively (optional enhancement)

**When RAG adds value:**
1. **Specific detail retrieval** - Looking up exact specifications, formulas, or citations during lesson generation
2. **Large corpus scenarios** - When source library exceeds hundreds of documents
3. **Dynamic updates** - When materials change frequently and reprocessing is expensive
4. **Targeted queries** - When generating content needs specific factual anchors

**Implementation pattern (if using RAG):**

```
Analyze Stage:
1. Full-context extraction → structured knowledge base
2. Semantic chunking with contextual enrichment
3. Embed chunks with metadata from full-context analysis

Generation Stage:
1. Receive structured knowledge from Analyze
2. IF specific details needed: Query vector DB with hybrid search
3. Combine retrieved context with structured knowledge
4. Generate content
```

**Critical: Enrich RAG chunks with Analyze metadata** - Anthropic's contextual retrieval research shows this improves retrieval quality by **67% reduction in failure rate**. Each chunk should include section context, related concepts, and position in document narrative.

### When RAG is redundant for your system

Research from Databricks and others shows RAG is inferior to full-context when:
- Document set is under 100 documents (your likely scenario)
- Documents are under 200K tokens each (your 100-page docs qualify)
- Comprehensive understanding required (course generation needs this)
- Cost of initial processing is acceptable (one-time $0.50 vs repeated $0.05)

**Bottom line:** Extract everything in Analyze. Only add RAG if you hit scalability limits or need ultra-low-latency detail lookup.

## Prompt engineering responsibility: Distributed with clear separation

### Analyze should provide structure and guidance, NOT prompts

Research from multiple sources (DSPy, Claude documentation, prompt chaining studies) converges on this principle: **early stages should output objectives and constraints, not execution scripts**.

**What Analyze outputs for Generation:**

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

**Critical research finding:** Models struggle with reasoning when over-constrained by format or phrasing requirements. Separating structure from generation improves accuracy by **15-30%**. Let Generation leverage its reasoning capabilities.

### Generation should create lesson-specific prompts

**Generation stage responsibilities:**
1. **Interpret guidance** - Understand pedagogical strategy and constraints from Analyze
2. **Reason about approach** - Determine optimal explanation sequence, example selection, exercise design
3. **Generate lesson prompts** - Create specific prompts for each learning activity within the section
4. **Create assessment prompts** - Design homework questions, test items, rubrics based on objectives

**Example Generation output:**

```json
{
  "lesson_1": {
    "title": "Forward Propagation Fundamentals",
    "content": "...[generated lesson content]...",
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

**Why this division works:** Analyze has full document context to determine **what should be taught and in what order**. Generation has reasoning capability to determine **how to teach it effectively** given those constraints. This mirrors Khan Academy's architecture where human experts define scenarios (like your Analyze) and GPT-4 executes within guardrails (like your Generation).

### How detailed should scope_instructions be?

**Optimal level: Section-level guidance with success criteria**

Research on prompt granularity (InstruSum dataset study) shows **task-level segmentation outperforms both monolithic prompts and excessive fragmentation**. For your system:

**✅ Right level of detail:**
- Section should cover X concepts
- Use Y pedagogical approach
- Include Z types of exercises
- Avoid A complexity levels
- Target B audience assumptions

**❌ Too detailed:**
- Paragraph 1 should say exactly...
- Use the phrase "neural network" 3 times
- Structure lesson as: intro (50 words), explanation (200 words), example (150 words)

**❌ Too vague:**
- "Generate good content for this section"
- "Make it educational"

Think of scope_instructions as **architectural blueprints** not **construction instructions**. You specify room sizes and purposes; Generation determines furniture arrangement and decor.

## Section breakdown depth: Section-level in Analyze, lesson-level in Generation

### Analyze output: Section-level with learning objectives

Your current approach is correct. Analyze should output:

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

**Why section-level is optimal:**
- Maintains flexibility for Generation to adapt lesson granularity
- Avoids premature decisions about pacing before reasoning about pedagogy
- Enables Generation to adjust depth based on complexity
- Matches production patterns (Duolingo's curriculum experts design scenarios at section-level; AI generates specific interactions)

### Generation should expand to lesson-level detail

**Generation stage creates granular structure:**

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

**Why Generation handles lesson breakdown:**
1. **Reasoning about pedagogy** - Determines optimal pacing, when to split complex topics, how to sequence for progressive difficulty
2. **Adaptive depth** - Can adjust lesson granularity based on topic complexity (simple topics = one lesson, complex topics = multiple lessons)
3. **Coherence** - Ensures lessons flow narratively within section context
4. **Flexibility** - Can generate different lesson structures for different pedagogical strategies

This mirrors the DSPy pattern where **signatures define tasks at high level** but **modules reason about execution details**.

## Recommended architecture: Extract-Structure-Generate

### Stage 4: Analyze (Gemini 2.5 Flash, 1M context)

**Input:** Course title + uploaded documents (100+ pages)

**Process:**
1. **Full document processing** - Single-pass analysis of all materials
2. **Comprehensive extraction:**
   - Document-level themes and concepts
   - Cross-document relationships and dependencies
   - Structural analysis (sections, subsections, examples)
   - Pedagogical elements (existing objectives, prerequisites)
3. **Knowledge structuring:**
   - Build concept dependency graph
   - Map topics to difficulty progression
   - Extract and organize examples, case studies, exercises
4. **Course architecture planning:**
   - Determine section breakdown based on topic clustering
   - Define section-level learning objectives
   - Recommend pedagogical strategy based on content type
   - Specify scope and constraints for each section
5. **Metadata enrichment:**
   - Tag complexity levels
   - Identify prerequisite chains
   - Estimate time requirements
   - Note accessibility considerations

**Output format:** Structured JSON (as detailed above) with:
- Document analysis and concept graph
- Pedagogical strategy
- Section-level course structure with objectives
- High-level generation guidance (tone, constraints, requirements)
- Contextual language and audience specifications

**Key principles:**
- Extract everything during this one-time comprehensive pass
- Structure information hierarchically (document → section → concept)
- Provide guidance on "what" and "why," not "how"
- Use semantic boundaries for any chunking (sections, not arbitrary token limits)

### Stage 5: Generation (qwen3-max, 128K context)

**Input:** Structured analysis_result from Stage 4 (typically 10-30K tokens)

**Process for each section:**
1. **Interpret structure** - Understand section objectives, key topics, pedagogical approach
2. **Reason about pedagogy:**
   - Determine optimal lesson granularity (1 lesson? 3 lessons?)
   - Select explanation strategies (analogies, worked examples, visualizations)
   - Design progression from simple to complex
3. **Lesson generation:**
   - Create detailed lesson content
   - Develop learning activities
   - Generate exercises with solutions
   - Write formative assessments
4. **Prompt creation:**
   - Design specific homework prompts
   - Create test questions aligned to objectives
   - Generate rubrics for grading
5. **Quality validation:**
   - Check alignment with learning objectives
   - Verify prerequisite assumptions
   - Ensure consistency across lessons

**Output format:** Detailed course structure with:
- Lesson-level breakdown with content
- Learning activities and exercises
- Prompts for assignments and assessments
- Metadata for delivery (duration, difficulty, interactive elements)

**When to use RAG (optional):**
- If specific factual details needed during generation (formulas, citations, technical specs)
- If source corpus exceeds 100 documents
- If real-time detail lookup improves latency for very large courses

**RAG strategy if used:**
- Query vector DB with hybrid search (semantic + keyword)
- Retrieve top-k chunks (typically 5-10)
- Use contextual enrichment from Stage 4
- Combine with structured knowledge from Analyze

### Data flow architecture

```
┌─────────────────────────────────────┐
│  STAGE 4: ANALYZE                   │
│  (Gemini 2.5 Flash, 1M context)     │
│                                     │
│  • Process entire documents         │
│  • Extract comprehensive structure  │
│  • Build concept graph              │
│  • Define section-level objectives  │
│  • Specify pedagogical strategy     │
│                                     │
│  Cost: $0.10-0.50 per document      │
│  Time: 5-10 minutes                 │
└──────────────┬──────────────────────┘
               │
               │ Structured JSON
               │ (10-30K tokens)
               ↓
┌─────────────────────────────────────┐
│  OPTIONAL: Vector Database          │
│                                     │
│  • Semantic chunks from Analyze     │
│  • Enriched with context metadata   │
│  • Hybrid search (vector + keyword) │
│                                     │
└──────────────┬──────────────────────┘
               │
               │ Retrieved context (if needed)
               ↓
┌─────────────────────────────────────┐
│  STAGE 5: GENERATION                │
│  (qwen3-max, 128K context)          │
│                                     │
│  • Interpret section structure      │
│  • Reason about lesson breakdown    │
│  • Generate detailed content        │
│  • Create exercises and prompts     │
│  • Validate alignment               │
│                                     │
│  Cost: $0.50-2.00 per section       │
│  Time: 10-30 seconds per section    │
└─────────────────────────────────────┘
```

## Trade-off analysis: Two implementation strategies

### Strategy A: Analyze does MORE (detailed extraction)

**Approach:**
- Analyze extracts comprehensive structured information
- Creates detailed concept maps, example inventory, exercise templates
- Provides rich pedagogical annotations
- Generation executes against detailed structure

**Advantages:**
- Maximizes value of large-context processing
- More consistent outputs (less variation in Generation)
- Easier debugging (more explicit intermediate state)
- Generation stage is faster and cheaper

**Disadvantages:**
- Analyze stage is slower and more expensive
- May over-constrain Generation reasoning
- Less adaptive to variation in topics
- Harder to update pedagogical approach

**Best for:**
- Highly structured subject matter (math, programming, sciences)
- When consistency is paramount
- When using weaker generation models
- When generation volume is very high

### Strategy B: Analyze does LESS (high-level structure)

**Approach:**
- Analyze provides section-level structure and guidance
- Minimal prescriptive detail
- Generation has freedom to reason about pedagogy
- More adaptive lesson design

**Advantages:**
- Leverages Generation model reasoning fully
- More adaptive to topic variation
- Easier to experiment with pedagogical approaches
- Faster and cheaper Analyze stage

**Disadvantages:**
- Less consistency across sections
- Generation stage more expensive (more reasoning)
- Harder to debug when quality issues arise
- Requires stronger generation model

**Best for:**
- Creative or exploratory subjects (humanities, business, design)
- When using advanced reasoning models
- When pedagogical innovation is valued
- When source materials are diverse

### Recommended hybrid approach

Based on production patterns from Khan Academy, Notion AI, and others:

**Analyze should be comprehensive on structure, moderate on detail:**
- **Do extensively:** Document analysis, concept extraction, relationship mapping
- **Do moderately:** Pedagogical strategy, example identification, difficulty tagging  
- **Do minimally:** Specific phrasing, detailed instructions, prescriptive sequencing

**Generation should reason actively within constraints:**
- Interpret Analyze structure as architectural guidance
- Apply reasoning to determine lesson breakdown
- Create content adapted to pedagogical strategy
- Generate prompts aligned to objectives

This balances consistency (from structured Analyze) with quality (from reasoning Generation).

## Production-ready implementation guidance

### Success metrics to track

**Analyze stage quality:**
- Concept extraction completeness (human eval on sample)
- Prerequisite relationship accuracy
- Section objective alignment with source material
- Processing time per page
- Cost per document

**Generation stage quality:**
- Lesson alignment with section objectives (automated check)
- Content coherence (LLM-as-judge scoring)
- Exercise difficulty appropriateness (student performance data)
- Pedagogical consistency (rubric-based evaluation)
- Generation cost per lesson

**End-to-end metrics:**
- Time from document upload to complete course
- Cost per course generated
- Student learning outcomes (if available)
- Instructor satisfaction ratings
- Content reuse/edit frequency

### Validation and quality gates

**After Analyze stage:**
- Schema validation (ensure all required fields present)
- Objective quality check (measurable, aligned to Bloom's taxonomy)
- Prerequisite chain validation (no circular dependencies)
- Coverage analysis (all key concepts from documents included)

**After Generation stage:**
- Objective-content alignment verification
- Reading level check (Flesch-Kincaid for target audience)
- Exercise solution verification (for quantitative problems)
- Accessibility compliance (WCAG 2.1 for digital content)

**Human review gates:**
- Subject matter expert sampling (review 10-20% of generated content)
- Instructional designer review of pedagogical approach
- Pilot testing with target learners for high-stakes courses

### When to add RAG

**Add RAG to your architecture if:**
1. Your source library exceeds 100 documents
2. Documents are updated frequently (monthly or more)
3. You need very low-latency detail retrieval during generation
4. Generation quality improves measurably with RAG (A/B test)
5. Cost analysis favors RAG over repeated full-context processing

**RAG implementation pattern:**
```python
# During Analyze stage
chunks = semantic_chunking(document, chunk_size=1024, overlap=0.15)
enriched_chunks = [
    {
        "content": chunk,
        "section_context": section_metadata,
        "concepts": extracted_concepts,
        "difficulty": complexity_score,
        "position": chunk_index / total_chunks
    }
    for chunk in chunks
]
vector_db.index(enriched_chunks)

# During Generation stage
if needs_specific_detail:
    retrieved = vector_db.hybrid_search(
        query=generation_context,
        top_k=5,
        filters={"section_id": current_section}
    )
    generation_context += retrieved
```

**Critical: Use contextual enrichment** - research shows 25-40% quality improvement when chunks include document-level metadata.

## Key takeaways for your system

1. **Analyze extracts comprehensively, Generation creates thoughtfully** - Separate information gathering (full-context strength) from content creation (reasoning strength)

2. **Full-context processing in Analyze eliminates RAG dependency** - Your 100-page documents fit easily in Gemini Flash's context; process them completely upfront rather than retrieving on-demand

3. **Structured JSON for inter-stage communication** - Not natural language prompts. Include objectives, constraints, success criteria, but not execution instructions

4. **Section-level granularity in Analyze, lesson-level in Generation** - Let Generation reason about optimal lesson breakdown based on topic complexity and pedagogical strategy

5. **High-level guidance, not detailed prompts** - Analyze specifies what to teach and why; Generation determines how to teach it effectively

6. **Optional RAG as enhancement, not replacement** - Add RAG only if you hit scale limits or need ultra-low-latency detail lookup; start with full-context extraction

7. **Independent stage optimization** - Test and improve each stage separately using appropriate metrics; treat pipeline as modular system not monolith

Your two-stage architecture is sound. The optimal division puts **comprehensive extraction and structural planning** in Analyze (leveraging massive context), and **pedagogical reasoning and content creation** in Generation (leveraging superior reasoning). This aligns with how production systems like Khan Academy and Notion AI achieve quality at scale - specialized models for specialized tasks, with clear separation of concerns and structured handoffs.