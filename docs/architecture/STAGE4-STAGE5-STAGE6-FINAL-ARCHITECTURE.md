# Stage 4 (Analysis) → Stage 5 (Generation) → Stage 6 (Lesson Content) Architecture Specification

**Version**: 2.2.0 (Aligned with Unified Architecture v0.19.0)
**Date**: 2025-11-21
**Status**: APPROVED - Ready for Implementation
**Priority**: CRITICAL (Blocks Production Launch)
**Last Updated**: 2025-11-21 (Aligned with unified stages/ architecture + corrected stage numbering)

> **Architecture Alignment Note**: This document has been updated to match the unified architecture
> in `packages/course-gen-platform/docs/architecture/ARCHITECTURE.md` (v0.19.0).
> All file paths now follow the `stages/stage{N}-{name}/` pattern.

---

## Executive Summary

### Problem Statement

The current architecture has ambiguity in responsibility distribution between Analyze and Generation stages, particularly regarding:
- Summary vs RAG usage
- RAG access in Analyze stage
- Data passed between stages
- Level of detail in prompts for downstream stages

### Solution

**Three-stage extension architecture with clear separation of concerns**:

> **Current Pipeline (v0.19.0)**: Stage 1 (Upload) → Stage 2 (Document Processing) → Stage 3 (Summarization) → Stage 4 (Analysis) → Stage 5 (Generation)
>
> **This Document Extends**: Stage 4 + Stage 5 enhancements + **NEW Stage 6** (Lesson Content)

1. **Stage 4 (Analysis)**: Pattern detection, section-level structure, RAG planning (6 phases)
2. **Stage 5 (Generation)**: Lesson breakdown, detailed specifications, section-level RAG (5 phases)
3. **Stage 6 (Lesson Content)**: Parallel content generation, lesson-level RAG (**NEW STAGE**)

**Key Decisions**:
- ✅ NO summary passed to Generation (only metadata + RAG plan)
- ✅ NO RAG access in Analysis (Document Prioritization solves large doc problem)
- ✅ Document Prioritization integrated into Stage 2/3, not optional
- ✅ Two-level RAG: Section-level (Generation) + Lesson-level (Stage 6)
- ✅ **Semantic Scaffolding** (not executable prompts) for Stage 6 → NEW
- ✅ **Dynamic temperature** by content archetype (technical 0.2, conceptual 0.7, compliance 0.1) → NEW
- ✅ **Markdown output** for prose, JSON for metadata → NEW

---

## Architecture Principles

### 1. Separation of Concerns

> **Stage Locations** (unified architecture v0.19.0):
> - Stage 4: `stages/stage4-analysis/`
> - Stage 5: `stages/stage5-generation/`
> - Stage 6: `stages/stage6-lesson-content/` (**TO BE CREATED**)

**Stage 4 (Analysis)**: "Extract and Structure"
- **Location**: `stages/stage4-analysis/`
- **Input**: Summaries from Stage 3 (Summarization) + Document metadata
- **Context**: 1M tokens (Gemini 2.5 Flash) OR 128K (OSS 120B)
- **Capability**: Large context window → holistic understanding
- **Output**: Section-level structure + RAG plan (~5-10K tokens)
- **Phases**: 6 phases (see `stages/stage4-analysis/README.md`)
- **NO RAG access**: Document Prioritization ensures right content

**Stage 5 (Generation)**: "Reason and Elaborate"
- **Location**: `stages/stage5-generation/`
- **Input**: analysis_result + QdrantClient
- **Context**: 128K tokens (qwen3-max)
- **Capability**: Advanced reasoning → pedagogical design
- **Output**: Lesson-level specifications (~100-200K tokens)
- **Phases**: 5 phases (see `stages/stage5-generation/README.md`)
- **RAG usage**: Section-level targeted retrieval (20-30 chunks)

**Stage 6 (Lesson Content)**: "Execute and Create" (**NEW STAGE**)
- **Location**: `stages/stage6-lesson-content/`
- **Input**: lesson_spec + QdrantClient + language (ISO 639-1 code)
- **Context**: Model-specific (content type routing)
- **Capability**: Parallel generation → fast execution
- **Output**: Complete lesson content (~3-5K words each) in specified language
- **RAG usage**: Lesson-level specific retrieval (5-10 chunks)
- **Language handling**: Explicit language passing through all nodes (19 languages supported)

### 2. Division of Labor

| Responsibility | Stage 4 (Analysis) | Stage 5 (Generation) | Stage 6 (Content) |
|----------------|-------------------|----------------------|-------------------|
| **Document understanding** | ✅ OWNER (full context) | ❌ NO | ❌ NO |
| **Pattern detection** | ✅ OWNER | ❌ NO | ❌ NO |
| **Section structure** | ✅ OWNER (high-level) | ✅ REFINEMENT | ❌ NO |
| **Lesson breakdown** | ❌ NO | ✅ OWNER | ❌ NO |
| **Exercise specifications** | ❌ NO | ✅ OWNER | ❌ NO |
| **Content generation** | ❌ NO | ❌ NO | ✅ OWNER |
| **RAG planning** | ✅ OWNER (Phase 6) | ❌ NO (uses plan) | ❌ NO (uses spec) |
| **RAG retrieval** | ❌ NO | ✅ Section-level | ✅ Lesson-level |
| **Parallelization** | Sequential (1 course) | Semi-parallel (5-7 sections) | ✅ Fully parallel (30 lessons) |

---

## Document Prioritization (Stage 2 + Stage 3 Enhancement) - Foundation

**CRITICAL**: This is NOT optional. Document Prioritization solves the large document problem BEFORE Analysis.

> **Architecture Note**: Document Prioritization is an **enhancement** to existing stages:
> - **Stage 2** (Document Processing): LLM Classification + Vectorization
> - **Stage 3** (Summarization): Budget Allocation + Adaptive Summarization
>
> Location: `stages/stage2-document-processing/` and `stages/stage3-summarization/`

### Workflow

```
STAGE 2 + STAGE 3: Document Prioritization (BEFORE Analysis)

Step 1: LLM Classification
Input: All uploaded documents
Output: { priority: 'HIGH' | 'LOW', order: 1-N, importance_score: 0.0-1.0 }

Criteria:
- HIGH (≥0.7): Lectures, textbooks, syllabi, author presentations
- LOW (<0.7): Laws, standards, regulations, supplementary materials

Step 2: Budget Allocation
IF (HIGH_total ≤ 80K tokens):
  → Analyze Model: OSS 120B (128K context, $0.20/1M)
  → Budget: HIGH=80K, LOW=remainder
ELSE IF (HIGH_total > 80K tokens):
  → Analyze Model: Gemini 2.5 Flash (1M context, $0.15/1M)
  → Budget: HIGH=400K, LOW=remainder

Step 3: Processing
HIGH priority documents:
  IF (doc_tokens ≤ 50K): Save FULL TEXT → for Analyze
  ELSE: Balanced summary (~10K) → for Analyze

LOW priority documents:
  ALWAYS: Aggressive summary (~5K) → for Analyze
  EXCEPTION: If <3K tokens AND budget available → full text

Step 4: Vectorization (Stage 2)
ALL documents: Vectorize from ORIGINAL text (not summary!)
→ Qdrant storage for RAG retrieval in Stage 5 (Generation) / Stage 6 (Lesson Content)
```

### Example

```typescript
// 3 documents uploaded for "Blockchain Course"

Classification:
1. "Blockchain Lectures.pdf" (18K tokens)
   → HIGH priority, order=1, score=0.95

2. "Crypto Presentation.pptx" (12K tokens)
   → HIGH priority, order=2, score=0.88

3. "Federal Law on Digital Assets.pdf" (150K tokens)
   → LOW priority, order=3, score=0.45

Budget Allocation:
HIGH_total = 18K + 12K = 30K ≤ 80K
→ Analyze Model: OSS 120B (cheap!)
→ HIGH budget: 80K, LOW budget: 50K

Processing:
1. Lectures (18K, HIGH): FULL TEXT ✅ → to Analyze
2. Presentation (12K, HIGH): FULL TEXT ✅ → to Analyze
3. Federal Law (150K, LOW): AGGRESSIVE SUMMARY (5K) ✅ → to Analyze

Vectorization (ALL from originals):
1. Lectures: 18K original → Qdrant
2. Presentation: 12K original → Qdrant
3. Federal Law: 150K original → Qdrant (NOT summary!)

Analyze Input:
- Lectures: full text (18K)
- Presentation: full text (12K)
- Federal Law: summary (5K)
Total: 35K tokens → fits in OSS 120B (128K context)
```

### Why This Works

**For HIGH priority documents**:
- ✅ Analyze sees FULL TEXT (if ≤50K) → accurate understanding
- ✅ Analyze sees BALANCED SUMMARY (if >50K) → enough for structure
- ✅ RAG contains ORIGINAL → Generation gets details

**For LOW priority documents**:
- ✅ Analyze sees AGGRESSIVE SUMMARY → knows what's there
- ✅ Summary identifies key topics → enables RAG planning
- ✅ RAG contains ORIGINAL → Generation can query specifics

**NO RAG access needed in Analyze**:
- Document Prioritization ensures right content in Analyze
- Analyze has enough information to create accurate RAG plan
- Generation does detailed RAG retrieval using the plan

---

## Data Flow Architecture

```
┌──────────────────────────────────────────────────────────┐
│ USER INPUT (Stage 1: Document Upload)                    │
│ - Course title: "Blockchain Fundamentals"                │
│ - Documents: lectures.pdf, law.pdf, presentation.pptx    │
│ - Location: stages/stage1-document-upload/               │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 2 + 3: DOCUMENT PROCESSING + SUMMARIZATION         │
│ (Document Prioritization Enhancement)                    │
│ Location: stages/stage2-document-processing/             │
│          stages/stage3-summarization/                    │
│                                                           │
│ LLM Classification:                                      │
│ - Lectures (18K): HIGH priority, order=1                 │
│ - Presentation (12K): HIGH priority, order=2             │
│ - Law (150K): LOW priority, order=3                      │
│                                                           │
│ Budget Allocation:                                       │
│ HIGH_total = 30K ≤ 80K → OSS 120B for Analyze           │
│                                                           │
│ Processing:                                              │
│ - Lectures → full text (18K) for Analyze                │
│ - Presentation → full text (12K) for Analyze            │
│ - Law → aggressive summary (5K) for Analyze             │
│                                                           │
│ Vectorization (from originals):                          │
│ - Lectures: 18K → Qdrant chunks                         │
│ - Presentation: 12K → Qdrant chunks                     │
│ - Law: 150K → Qdrant chunks                             │
│                                                           │
│ Output:                                                   │
│ - file_catalog.summary (analyze_content)                 │
│ - qdrant.vectors (from originals)                        │
└────────────────┬─────────────────────────────────────────┘
                 │
                 │ analyze_content (full text or summary)
                 ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 4: ANALYSIS (Gemini 2.5 Flash OR OSS 120B)        │
│ Location: stages/stage4-analysis/                        │
│                                                           │
│ Input: analyze_content from Stage 3                      │
│ - Lectures: full text (18K)                              │
│ - Presentation: full text (12K)                          │
│ - Law: summary (5K)                                      │
│ Total: 35K tokens                                        │
│                                                           │
│ Model: OSS 120B (because HIGH_total ≤ 80K)              │
│ Context: 128K tokens available                           │
│                                                           │
│ Processing: 6 phases (+ Phase 6 TO BE ADDED)            │
│ Phase 0: Barrier validation (Stage 2+3 complete?)        │
│ Phase 1: Classification (category, audience)             │
│ Phase 2: Scope Analysis (min 10 lessons check)           │
│ Phase 3: Expert Analysis (pedagogical strategy)          │
│ Phase 4: Document Synthesis                              │
│ Phase 5: Assembly (final AnalysisResult)                 │
│ Phase 6: RAG Planning (TO BE ADDED - critical!)          │
│   - Map sections to documents                            │
│   - Create search queries per section                    │
│   - Mark confidence (high/medium)                        │
│                                                           │
│ Output: analysis_result (~5-10K tokens)                  │
│ {                                                         │
│   course_metadata: { category, audience, strategy },     │
│   sections_breakdown: [                                  │
│     {                                                     │
│       section_id: "1",                                   │
│       title: "Blockchain Consensus",                     │
│       learning_objectives: [...],                        │
│       rag_plan: {                                        │
│         primary_documents: ["lectures.pdf"],             │
│         search_queries: ["consensus mechanisms", "PoW"], │
│         expected_topics: ["mining", "hashing"],          │
│         confidence: "high" // Saw full text              │
│       }                                                   │
│     },                                                    │
│     {                                                     │
│       section_id: "2",                                   │
│       title: "Legal Framework",                          │
│       rag_plan: {                                        │
│         primary_documents: ["law.pdf"],                  │
│         search_queries: ["article 34", "digital assets"],│
│         expected_topics: ["regulations", "compliance"],  │
│         confidence: "medium" // Saw summary only         │
│       }                                                   │
│     }                                                     │
│   ],                                                      │
│   generation_guidance: {                                 │
│     tone: "technical professional",                      │
│     use_analogies: true,                                 │
│     include_visuals: ["diagrams", "code examples"]       │
│   }                                                       │
│ }                                                         │
│                                                           │
│ NO SUMMARY CONTENT transmitted! Only metadata + RAG plan │
└────────────────┬─────────────────────────────────────────┘
                 │
                 │ analysis_result
                 ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 5: GENERATION (qwen3-max 128K)                    │
│ Location: stages/stage5-generation/                      │
│                                                           │
│ Input: analysis_result + QdrantClient                    │
│                                                           │
│ Processing: 5 phases (see stages/stage5-generation/README.md)
│ Phase 1: validate_input                                  │
│ Phase 2: generate_metadata                               │
│ Phase 3: generate_sections (WITH RAG)                    │
│   For each section:                                      │
│     1. Read section.rag_plan from analysis_result        │
│     2. Execute section-level RAG queries:                │
│        IF (confidence === "high"):                       │
│          → Targeted search (limit: 20 chunks)            │
│        ELSE:                                             │
│          → Broader search (limit: 30 chunks)             │
│                                                           │
│     Example RAG query for section 1:                     │
│     qdrant.search({                                      │
│       query: "consensus mechanisms proof of work",       │
│       limit: 20,                                         │
│       filter: {                                          │
│         document_ids: ["lectures.pdf"],                  │
│         topics: ["mining", "hashing"]                    │
│       }                                                   │
│     })                                                    │
│     → Returns chunks from ORIGINAL 18K lectures          │
│                                                           │
│     3. Context = RAG chunks + section guidance           │
│     4. Reasoning: Break section into 3-5 lessons         │
│     5. For each lesson: Create detailed spec             │
│                                                           │
│ Phase 4: validate_quality (0.75 threshold)               │
│ Phase 5: validate_lessons (min 10 lessons)               │
│                                                           │
│ Output: course_structure (~100-200K tokens)              │
│ {                                                         │
│   title, description, learning_outcomes,                 │
│   sections: [                                            │
│     {                                                     │
│       section_id: "1",                                   │
│       title: "Blockchain Consensus Mechanisms",          │
│       lessons: [                                         │
│         {                                                 │
│           lesson_id: "1.1",                              │
│           title: "Introduction to Consensus",            │
│           learning_objectives: [                         │
│             {                                             │
│               verb: "explain",                           │
│               content: "the need for consensus in distributed systems",│
│               bloom_level: "understand"                  │
│             }                                             │
│           ],                                              │
│           content_structure: {                           │
│             intro: {                                     │
│               hook: "Why do 1000 computers agree?",      │
│               context: "Building on distributed systems" │
│             },                                            │
│             main_sections: [                             │
│               {                                           │
│                 section: "What is Consensus?",           │
│                 rag_query: "distributed consensus definition",│
│                 expected_content_type: "conceptual explanation",│
│                 word_count: 300-400                      │
│               },                                          │
│               {                                           │
│                 section: "Byzantine Generals Problem",   │
│                 rag_query: "Byzantine fault tolerance",  │
│                 expected_content_type: "analogy + technical",│
│                 word_count: 400-500                      │
│               }                                           │
│             ],                                            │
│             examples: [                                  │
│               {                                           │
│                 type: "real_world",                      │
│                 topic: "Bitcoin network consensus",      │
│                 rag_query: "Bitcoin consensus example",  │
│                 format: "narrative + diagram"            │
│               }                                           │
│             ],                                            │
│             exercises: [                                 │
│               {                                           │
│                 type: "conceptual",                      │
│                 difficulty: "medium",                    │
│                 specification: "Compare PoW vs PoS",     │
│                 rag_query: "proof of work stake comparison",│
│                 grading_rubric: "accuracy: 60%, depth: 40%"│
│               }                                           │
│             ]                                             │
│           },                                              │
│           rag_context: {                                 │
│             primary_documents: ["lectures.pdf"],         │
│             search_queries: [                            │
│               "distributed consensus",                   │
│               "Byzantine fault tolerance",               │
│               "Bitcoin consensus"                        │
│             ],                                            │
│             expected_chunks: 8-12                        │
│           },                                              │
│           estimated_duration_minutes: 15                 │
│         }                                                 │
│         // ... more lessons                              │
│       ]                                                   │
│     }                                                     │
│     // ... more sections                                 │
│   ],                                                      │
│   generation_metadata: {                                 │
│     total_tokens, cost_usd, quality_scores, model_used   │
│   }                                                       │
│ }                                                         │
└────────────────┬─────────────────────────────────────────┘
                 │
                 │ course_structure (with lesson specs)
                 ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 6: LESSON CONTENT GENERATION (Parallel) **NEW**   │
│ Location: stages/stage6-lesson-content/ (TO BE CREATED) │
│                                                           │
│ Input: lesson_spec + QdrantClient                        │
│ Model: Content-type routing (varies by content)          │
│                                                           │
│ For each lesson (PARALLEL execution):                    │
│                                                           │
│   1. Read lesson_spec.content_structure                  │
│   2. Execute lesson-level RAG queries (targeted):        │
│                                                           │
│      Example for lesson 1.1 intro:                       │
│      qdrant.search({                                     │
│        query: "distributed consensus definition",        │
│        limit: 5-10, // Specific, not broad               │
│        filter: {                                         │
│          document_ids: ["lectures.pdf"],                 │
│          section_keywords: ["consensus", "distributed"]  │
│        }                                                  │
│      })                                                   │
│      → Returns specific chunks about consensus           │
│                                                           │
│   3. Generate content sections:                          │
│      - Intro (hook + context)                            │
│      - Main content (with RAG context)                   │
│      - Examples (from RAG chunks + citations)            │
│      - Exercises (with solutions)                        │
│                                                           │
│   4. Quality validation                                  │
│   5. XSS sanitization                                    │
│                                                           │
│ Output: Complete lesson (3-5K words)                     │
│ {                                                         │
│   lesson_id: "1.1",                                      │
│   content: {                                             │
│     intro: "Imagine 1000 computers...",                  │
│     sections: [                                          │
│       {                                                   │
│         title: "What is Consensus?",                     │
│         content: "In distributed systems, consensus...", │
│         citations: ["lectures.pdf:page_12"]             │
│       }                                                   │
│     ],                                                    │
│     examples: [...],                                     │
│     exercises: [...]                                     │
│   },                                                      │
│   metadata: { tokens, cost, quality_score }              │
│ }                                                         │
│                                                           │
│ Parallelization: 10-30 lessons generated simultaneously  │
└──────────────────────────────────────────────────────────┘
```

---

## Stage Responsibilities (Detailed)

### Stage 4: Analysis

**Location**: `stages/stage4-analysis/`
**Philosophy**: "Extract comprehensive structure from full documents"

**Input**:
```typescript
interface AnalyzeInput {
  course_id: string;
  organization_id: string;
  user_id: string;
  topic: string;
  language: 'en' | 'ru';
  target_audience: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  // From Stage 2 (Document Processing) + Stage 3 (Summarization)
  document_summaries: Array<{
    file_id: string;
    filename: string;
    summary: string; // Full text OR summary (based on priority)
    token_count: number;
    priority: 'HIGH' | 'LOW';
    order: number; // 1-N
    importance_score: number;
    category: 'course_core' | 'supplementary' | 'reference' | 'regulatory';
    processing_mode: 'full_text' | 'summary';
  }>;
}
```

**Processing**: 6 phases (see `stages/stage4-analysis/README.md` for current implementation)

> **Note**: Current implementation has 6 phases. RAG Planning (Phase 6 below) is an enhancement to be added.

```typescript
Phase 0: Pre-Flight Validation
- Stage 2+3 barrier check (all documents processed and summarized?)
- Input validation

Phase 1: Classification (10-20% progress)
- Model: OSS 20B
- Output: course_category, target_audience, contextual_language

Phase 2: Scope Analysis (20-35% progress)
- Model: OSS 20B
- Output: total_lessons, total_sections, estimated_hours
- Validation: Minimum 10 lessons (hard requirement)

Phase 3: Expert Analysis (35-60% progress)
- Model: OSS 120B (ALWAYS - needs reasoning)
- Output: pedagogical_strategy, teaching_style, assessment_approach

Phase 4: Document Synthesis (60-75% progress)
- Model: Adaptive (OSS 20B if <5 docs, OSS 120B if ≥5 docs)
- Output: sections_breakdown (section-level structure)

Phase 5: Assembly (75-85% progress)
- Combine all phase outputs into AnalysisResult
- NO LLM calls (pure data assembly)

Phase 6: RAG Planning (TO BE ADDED) ⭐ NEW & CRITICAL
- Model: OSS 20B
- Input: sections_breakdown + document_summaries
- Output: document_relevance_mapping (RAG plan per section)
- Logic:
  ```typescript
  for (const section of sections_breakdown) {
    // Identify which documents contain info for this section
    const relevantDocs = findRelevantDocuments(
      section.key_topics,
      document_summaries
    );

    // Create search queries for RAG retrieval
    const searchQueries = generateSearchQueries(
      section.learning_objectives,
      section.key_topics
    );

    // Determine confidence level
    const confidence = relevantDocs.every(d => d.processing_mode === 'full_text')
      ? 'high'
      : 'medium';

    rag_plan[section.section_id] = {
      primary_documents: relevantDocs.map(d => d.file_id),
      search_queries: searchQueries,
      expected_topics: section.key_topics,
      confidence: confidence,
      note: confidence === 'medium'
        ? 'Some documents summarized. Use broader RAG search.'
        : 'All documents seen in full. Targeted search recommended.'
    };
  }
  ```
```

**Output**:
```typescript
interface AnalysisResult {
  course_category: {
    primary: string;
    secondary: string[];
    rationale: string;
  };

  contextual_language: {
    primary_language: 'en' | 'ru';
    formality: 'formal' | 'conversational';
    technical_level: 'basic' | 'intermediate' | 'advanced';
  };

  pedagogical_strategy: {
    teaching_style: string;
    interaction_type: string;
    content_delivery: string;
    assessment_approach: string;
  };

  recommended_structure: {
    total_lessons: number; // ≥10 (validated)
    total_sections: number; // 3-7
    estimated_content_hours: number;
    difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  };

  sections_breakdown: Array<{
    section_id: string; // "1", "2", "3"
    area: string; // Section title
    estimated_lessons: number; // 3-5 lessons per section
    importance: 'core' | 'important' | 'optional';
    learning_objectives: string[];
    key_topics: string[];
    pedagogical_approach: string;
    difficulty_progression: 'flat' | 'gradual' | 'steep';

    // NEW: Enhanced fields for Generation
    estimated_duration_hours: number; // 0.5-20h
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    prerequisites: string[]; // section_ids (empty if none)
  }>;

  // NEW: RAG Planning (Phase 6 output) ⭐
  document_relevance_mapping?: {
    [section_id: string]: {
      primary_documents: string[]; // file_ids
      search_queries: string[]; // Queries for RAG retrieval
      expected_topics: string[]; // Topics covered
      confidence: 'high' | 'medium';
      note?: string;
    };
  };

  // NEW: Structured guidance (replaces deprecated scope_instructions)
  generation_guidance: {
    tone: 'conversational but precise' | 'formal academic' | 'casual friendly' | 'technical professional';
    use_analogies: boolean;
    specific_analogies?: string[];
    avoid_jargon: string[];
    include_visuals: Array<'diagrams' | 'flowcharts' | 'code examples' | 'screenshots'>;
    exercise_types: Array<'coding' | 'conceptual' | 'case_study' | 'debugging'>;
    contextual_language_hints: string;
    real_world_examples?: string[];
  };

  expansion_areas?: string[];
  research_flags?: string[];

  metadata: {
    total_tokens: { phase_1: number; phase_2: number; ... };
    total_cost_usd: number;
    model_usage: { phase_1: string; phase_2: string; ... };
    duration_ms: number;
  };
}
```

**Size**: ~5-10K tokens (NO summary content, only metadata + RAG plan)

**What Analyze does NOT do**:
- ❌ Generate lesson-level structures (Generation's job)
- ❌ Create specific exercise prompts (Generation's job)
- ❌ Generate content templates (Stage 6's job)
- ❌ Access RAG (Document Prioritization solves large doc problem)
- ❌ Pass summary content to Generation (only metadata + RAG plan)

---

### Stage 5: Generation

**Location**: `stages/stage5-generation/`
**Philosophy**: "Reason about pedagogy and elaborate structure into detailed lessons"

**Input**:
```typescript
interface GenerationInput {
  course_id: string;
  organization_id: string;
  user_id: string;

  // From Stage 4 (Analysis)
  analysis_result: AnalysisResult; // ~5-10K tokens

  // From Stage 2 (Document Processing) - for RAG metadata
  vectorized_documents?: Array<{
    file_id: string;
    filename: string;
    priority: 'HIGH' | 'LOW';
    category: string;
  }>;

  // QdrantClient for RAG retrieval (Qdrant vectors from Stage 2)
  qdrant_collection: string;
}
```

**Processing**: 5 phases (see `stages/stage5-generation/README.md`)

```typescript
Phase 1: validate_input
- Validate AnalysisResult schema
- Check minimum data requirements
- Verify Qdrant connection (if RAG enabled)

Phase 2: generate_metadata
- Model: qwen3-max (critical metadata)
- Input: analysis_result.course_metadata + generation_guidance
- Output: CourseMetadata (title, description, learning_outcomes, prerequisites)
- NO RAG (high-level metadata doesn't need document details)

Phase 3: generate_sections ⭐ WITH RAG
- Model: qwen3-max (primary) + Gemini (context overflow)
- For each section in analysis_result.sections_breakdown:

  Step 1: Section-level RAG retrieval
  const ragPlan = analysis_result.document_relevance_mapping[section.section_id];

  if (ragPlan) {
    // Targeted retrieval based on Analyze's plan
    const searchLimit = ragPlan.confidence === 'high' ? 20 : 30;

    const ragChunks = await qdrant.search({
      query: ragPlan.search_queries,
      limit: searchLimit,
      filter: {
        file_id: { $in: ragPlan.primary_documents },
        topics: { $in: ragPlan.expected_topics }
      }
    });

    sectionContext = {
      analyze_guidance: section,
      rag_chunks: ragChunks, // From ORIGINAL documents
      rag_confidence: ragPlan.confidence
    };
  } else {
    // Fallback: no RAG plan (rare case)
    sectionContext = { analyze_guidance: section };
  }

  Step 2: Lesson breakdown reasoning
  const lessons = await breakdownIntoLessons(section, sectionContext);
  // Returns 3-5 lessons with:
  // - lesson_id, title, objectives
  // - content_structure (intro, main_sections, examples, exercises)
  // - rag_queries (refined from section queries)

  Step 3: Validate lessons
  - Check lesson count (3-5 per section)
  - Validate objectives (Bloom's taxonomy)
  - Ensure RAG queries are specific

Phase 4: validate_quality
- Model: Jina-v3 embeddings (95%) + OSS 120B LLM-as-judge (5%)
- Threshold: 0.75 minimum
- Metrics: coherence, alignment, completeness

Phase 5: validate_lessons
- Check total lessons ≥ 10 (hard requirement)
- Validate lesson specs completeness
- Ensure all lessons have RAG queries
```

**Output**:
```typescript
interface CourseStructure {
  title: string;
  description: string;
  learning_outcomes: string[];
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  estimated_duration_hours: number;
  prerequisites: string[];
  target_audience: string;

  sections: Array<{
    section_id: string;
    title: string;
    description: string;

    lessons: Array<{
      lesson_id: string; // "1.1", "1.2", etc.
      title: string;
      description: string;

      learning_objectives: Array<{
        verb: string; // "explain", "implement", "analyze"
        content: string;
        bloom_level: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
      }>;

      topics: string[];
      estimated_duration_minutes: number; // 10-30 minutes
      difficulty_level: 'beginner' | 'intermediate' | 'advanced';

      // Detailed specification for Stage 6 ⭐
      content_structure: {
        intro: {
          hook: string; // Engaging opening question/statement
          context: string; // Connection to previous lessons
        };

        main_sections: Array<{
          section: string; // Section title
          rag_query: string; // Specific query for Stage 6 RAG
          expected_content_type: 'conceptual' | 'technical' | 'practical' | 'mixed';
          word_count: number; // 200-500
        }>;

        examples: Array<{
          type: 'real_world' | 'worked_example' | 'case_study' | 'code_demo';
          topic: string;
          rag_query: string;
          format: string; // "step-by-step", "narrative", "code walkthrough"
        }>;

        exercises: Array<{
          type: 'coding' | 'conceptual' | 'case_study' | 'debugging' | 'design';
          difficulty: 'easy' | 'medium' | 'hard';
          specification: string; // What to do
          rag_query: string; // For reference materials
          grading_rubric?: string;
        }>;
      };

      // RAG context for Stage 6
      rag_context: {
        primary_documents: string[]; // file_ids
        search_queries: string[]; // Lesson-specific queries
        expected_chunks: number; // 5-10 (more focused than section-level)
      };

      interactive_elements?: Array<{
        type: string;
        description: string;
      }>;
    }>;

    section_metadata: {
      estimated_duration_hours: number;
      prerequisites: string[];
      difficulty_progression: string;
    };
  }>;
}

interface GenerationMetadata {
  total_tokens: {
    metadata: number;
    sections: number;
    validation: number;
    total: number;
  };

  cost_usd: number;

  quality_scores: {
    metadata_similarity?: number;
    sections_similarity: number[];
    overall: number;
  };

  model_used: {
    metadata: string;
    sections: string;
    validation?: string;
  };

  batch_count: number;
  retry_count: {
    metadata: number;
    sections: number[];
  };

  rag_usage?: {
    sections_with_rag: number;
    total_chunks_retrieved: number;
    avg_chunks_per_section: number;
  };
}

interface GenerationResult {
  course_structure: CourseStructure;
  generation_metadata: GenerationMetadata;
}
```

**Size**: ~100-200K tokens (detailed lesson specifications)

**What Generation does NOT do**:
- ❌ Generate actual lesson content (Stage 6's job)
- ❌ Create exercise solutions (Stage 6's job)
- ❌ Generate code examples (Stage 6's job)
- ❌ Full document analysis (Analyze already did this)

---

### Stage 6: Lesson Content Generation (**NEW STAGE**)

**Location**: `stages/stage6-lesson-content/`
**Philosophy**: "Execute detailed specifications and generate actual content"

**Status**: ✅ IMPLEMENTED (v0.22.60+)
**Pattern**: Follows unified stage pattern using LangGraph orchestration

**Input**:
```typescript
interface LessonContentInput {
  lesson_spec: CourseStructure['sections'][0]['lessons'][0]; // From Generation
  course_context: {
    title: string;
    difficulty_level: string;
    generation_guidance: AnalysisResult['generation_guidance'];
  };
  qdrant_collection: string;
  language: string; // ISO 639-1 code (e.g., 'ru', 'en', 'zh')
}
```

**Language Handling** (Added in v0.22.60):
- Language retrieved from `courses.language` database column
- Defaults to English ('en') if NULL or invalid
- Converted to full language names in prompts using `getLanguageName()` from `common-enums.ts`
- Each pipeline node (planner, expander, assembler, smoother) includes explicit instruction:
  ```
  CRITICAL: Write ALL content in {LanguageName}. Every word must be in {LanguageName}.
  ```
- **Why full names**: Some models (DeepSeek V3.2) ignore ISO codes in RAG context; full names provide stronger signal
- **Supported languages (19)**: Russian, English, Chinese, Spanish, French, German, Japanese, Korean, Arabic, Portuguese, Italian, Turkish, Vietnamese, Thai, Indonesian, Malay, Hindi, Bengali, Polish
- See `packages/course-gen-platform/src/stages/stage6-lesson-content/README.md` for details

**Processing**: Parallel execution

```typescript
For each lesson (PARALLEL):

  Step 1: Lesson-level RAG retrieval (targeted)
  const ragQueries = lesson_spec.rag_context.search_queries;
  const chunks = [];

  for (const query of ragQueries) {
    const results = await qdrant.search({
      query: query,
      limit: 5-10, // Focused retrieval
      filter: {
        file_id: { $in: lesson_spec.rag_context.primary_documents }
      }
    });
    chunks.push(...results);
  }

  Step 2: Generate intro
  - Use lesson_spec.content_structure.intro.hook
  - Context from previous lessons
  - Word count: 100-200

  Step 3: Generate main sections
  for (const section of lesson_spec.content_structure.main_sections) {
    // Execute section-specific RAG query
    const sectionChunks = await qdrant.search({
      query: section.rag_query,
      limit: 3-5
    });

    // Generate content with RAG context
    const content = await generateSectionContent({
      section_spec: section,
      rag_chunks: sectionChunks,
      expected_type: section.expected_content_type,
      word_count: section.word_count
    });
  }

  Step 4: Generate examples
  - Use lesson_spec.content_structure.examples
  - Include citations from RAG chunks
  - Format according to type (narrative, code, step-by-step)

  Step 5: Generate exercises
  - Use lesson_spec.content_structure.exercises
  - Create solutions with grading rubrics
  - Include hints from RAG chunks

  Step 6: Quality validation
  - Check completeness
  - Validate citations
  - XSS sanitization
```

**Output**:
```typescript
interface LessonContent {
  lesson_id: string;

  content: {
    intro: string; // HTML/Markdown

    sections: Array<{
      title: string;
      content: string; // HTML/Markdown (3-5K words total)
      citations?: Array<{
        document: string;
        page_or_section: string;
      }>;
    }>;

    examples: Array<{
      title: string;
      content: string;
      code?: string; // If code example
      citations?: string[];
    }>;

    exercises: Array<{
      question: string;
      hints?: string[];
      solution: string;
      grading_rubric?: {
        criteria: string;
        points: number;
      }[];
    }>;

    interactive_elements?: Array<{
      type: string;
      config: any;
    }>;
  };

  metadata: {
    total_words: number;
    total_tokens: number;
    cost_usd: number;
    quality_score: number;
    rag_chunks_used: number;
    generation_duration_ms: number;
  };
}
```

**Parallelization**: 10-30 lessons generated simultaneously (BullMQ workers)

---

## RAG Strategy (Two-Level)

### Level 1: Section-Level RAG (Stage 5 - Generation)

**Purpose**: Broad context for lesson breakdown reasoning

**When**: During section processing in Phase 3

**Logic**:
```typescript
const ragPlan = analysis_result.document_relevance_mapping[section.section_id];

if (ragPlan) {
  const limit = ragPlan.confidence === 'high' ? 20 : 30;

  const chunks = await qdrant.search({
    collection: course.qdrant_collection,
    query: ragPlan.search_queries, // From Analyze Phase 6
    limit: limit,
    filter: {
      file_id: { $in: ragPlan.primary_documents },
      topics: { $in: ragPlan.expected_topics }
    }
  });

  return chunks; // 20-30 chunks for section context
}
```

**Use case**: Understanding what content is available, how to break down into lessons

### Level 2: Lesson-Level RAG (Stage 6 - Lesson Content)

**Purpose**: Specific details for content generation

**When**: During lesson content generation

**Logic**:
```typescript
// For each content section in lesson
const section = lesson_spec.content_structure.main_sections[i];

const chunks = await qdrant.search({
  collection: course.qdrant_collection,
  query: section.rag_query, // Refined query from Generation
  limit: 3-5, // Focused
  filter: {
    file_id: { $in: lesson_spec.rag_context.primary_documents },
    section_keywords: extractKeywords(section.section)
  }
});

// Use chunks for content generation with citations
const content = generateContent(section, chunks);
```

**Use case**: Getting exact paragraphs, code examples, definitions from original documents

### RAG vs No RAG Decision

```typescript
function shouldUseRAG(
  section: SectionBreakdown,
  analysis_result: AnalysisResult
): boolean {

  // Check if RAG plan exists
  const ragPlan = analysis_result.document_relevance_mapping?.[section.section_id];
  if (!ragPlan) {
    return false; // No documents identified for this section
  }

  // Check if documents were vectorized
  if (!vectorized_documents || vectorized_documents.length === 0) {
    return false; // No RAG infrastructure
  }

  // Use RAG if:
  // - Have RAG plan
  // - Have vectorized documents
  // - Section requires document-based content
  return true;
}
```

**Fallback (no RAG)**:
- Generation proceeds without RAG context
- Uses only analysis_result guidance
- Quality: Acceptable but not optimal
- Use case: Courses without uploaded documents (topic-only generation)

---

## Implementation Tasks

### Priority 1: Document Prioritization (Stage 2 + Stage 3 Enhancement) - FOUNDATION

**Status**: Specified in `docs/FUTURE/FUTURE-ENHANCEMENT-DOCUMENT-PRIORITIZATION.md`

**Timeline**: 3-4 days

**Tasks**:
1. Implement LLM-based document classification (Stage 2)
2. Implement budget allocation logic (Stage 3)
3. Integrate into document processing pipeline
4. Update vectorization to use originals (not summaries)
5. Test with diverse document sets

**Deliverables**:
- `stages/stage2-document-processing/phases/phase-classification.ts`
- `stages/stage3-summarization/phases/budget-allocator.ts`
- Updated `stages/stage2-document-processing/orchestrator.ts`
- Tests in `tests/unit/stages/stage2/` and `tests/unit/stages/stage3/`

### Priority 2: Analysis Phase 6 (RAG Planning)

**Timeline**: 1-2 days

**Tasks**:
1. Implement Phase 6 in analysis orchestrator
2. Create document-to-section mapping logic
3. Generate search queries from section objectives
4. Mark confidence levels (high/medium)
5. Update AnalysisResult schema

**Deliverables**:
- `stages/stage4-analysis/phases/phase-6-rag-planning.ts`
- Updated `AnalysisResult` interface in `@megacampus/shared-types`
- Tests in `tests/unit/stages/stage4/`

### Priority 3: Generation RAG Integration

**Timeline**: 2-3 days

**Tasks**:
1. Implement section-level RAG retrieval in Phase 3
2. Confidence-based search strategies
3. Create refined lesson-level RAG queries
4. Update CourseStructure schema with rag_context
5. Test retrieval quality

**Deliverables**:
- Updated `stages/stage5-generation/utils/section-batch-generator.ts`
- RAG retrieval utilities in `stages/stage5-generation/utils/`
- Updated `CourseStructure` interface in `@megacampus/shared-types`
- E2E tests in `tests/e2e/`

### Priority 4: Stage 6 Design & Specification

**Timeline**: 2-3 days

**Tasks**:
1. Design Stage 6 architecture (BullMQ workers)
2. Define lesson content generation pipeline
3. Specify lesson-level RAG retrieval
4. Define parallelization strategy
5. Create acceptance criteria

**Deliverables**:
- `specs/009-stage-6-lesson-content/spec.md`
- Architecture diagrams
- API contracts
- Performance requirements

### Priority 5: Stage 6 Implementation

**Timeline**: 5-7 days

**Tasks**:
1. Create `stages/stage6-lesson-content/` directory (follow unified pattern)
2. Implement lesson content generator
3. Implement lesson-level RAG retrieval
4. Create BullMQ job handlers
5. Parallel processing infrastructure
6. Quality validation
7. XSS sanitization
8. E2E testing

**Deliverables**:
- `stages/stage6-lesson-content/orchestrator.ts`
- `stages/stage6-lesson-content/handler.ts`
- `stages/stage6-lesson-content/phases/` (4-6 phase files)
- `stages/stage6-lesson-content/README.md`
- Tests in `tests/unit/stages/stage6/`
- E2E tests in `tests/e2e/`

---

## Success Criteria

### Document Prioritization (Stage 2 + Stage 3 Enhancement)

✅ **90%+ courses** use cheap model (HIGH_total ≤ 80K)
✅ **100% HIGH priority docs** (≤50K) saved as full text
✅ **All vectorization** from originals (not summaries)
✅ **Cost savings**: 60-80% on lightweight courses

### Analysis (Stage 4)

✅ **NO RAG access** needed (Document Prioritization solves large doc problem)
✅ **Phase 6 RAG Planning** creates accurate document-to-section mapping
✅ **Confidence levels** correctly assigned (high for full text, medium for summary)
✅ **Output size**: 5-10K tokens (no summary content)

### Generation (Stage 5)

✅ **Section-level RAG** retrieves 20-30 relevant chunks per section
✅ **Targeted search** when confidence=high (better precision)
✅ **Lesson specs** contain detailed content_structure + rag_queries
✅ **Quality threshold**: ≥0.75 overall score

### Stage 6 (Lesson Content)

✅ **Parallel generation**: 10-30 lessons simultaneously
✅ **Lesson-level RAG**: 5-10 specific chunks per lesson
✅ **Content quality**: Coherent, cited, XSS-safe
✅ **Generation speed**: <2 minutes per lesson (on average)

### Overall System

✅ **Success rate**: 95%+ end-to-end (Document → Analyze → Generation → Content)
✅ **Cost efficiency**: Average $0.20-0.50 per course (all stages)
✅ **Quality**: User satisfaction >90% (post-launch metric)

---

## Schema Definitions

### AnalysisResult (Updated)

```typescript
// packages/shared-types/src/analysis-result.ts

export interface AnalysisResult {
  // Existing fields...
  course_category: { primary: string; secondary: string[]; rationale: string };
  contextual_language: { primary_language: string; formality: string; technical_level: string };
  pedagogical_strategy: { teaching_style: string; interaction_type: string; content_delivery: string; assessment_approach: string };
  recommended_structure: { total_lessons: number; total_sections: number; estimated_content_hours: number; difficulty_level: string };

  sections_breakdown: Array<{
    section_id: string;
    area: string;
    estimated_lessons: number;
    importance: 'core' | 'important' | 'optional';
    learning_objectives: string[];
    key_topics: string[];
    pedagogical_approach: string;
    difficulty_progression: 'flat' | 'gradual' | 'steep';

    // NEW fields
    estimated_duration_hours: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    prerequisites: string[];
  }>;

  // NEW: RAG Planning (Phase 6)
  document_relevance_mapping?: {
    [section_id: string]: {
      primary_documents: string[];
      search_queries: string[];
      expected_topics: string[];
      confidence: 'high' | 'medium';
      note?: string;
    };
  };

  // NEW: Structured guidance (replaces scope_instructions)
  generation_guidance: {
    tone: 'conversational but precise' | 'formal academic' | 'casual friendly' | 'technical professional';
    use_analogies: boolean;
    specific_analogies?: string[];
    avoid_jargon: string[];
    include_visuals: Array<'diagrams' | 'flowcharts' | 'code examples' | 'screenshots'>;
    exercise_types: Array<'coding' | 'conceptual' | 'case_study' | 'debugging'>;
    contextual_language_hints: string;
    real_world_examples?: string[];
  };

  expansion_areas?: string[];
  research_flags?: string[];
  metadata: AnalysisMetadata;
}

// DEPRECATED (keep for backward compatibility)
export interface AnalysisResultLegacy extends AnalysisResult {
  scope_instructions?: string;
}
```

### CourseStructure (Updated)

```typescript
// packages/shared-types/src/generation-result.ts

export interface CourseStructure {
  title: string;
  description: string;
  learning_outcomes: string[];
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  estimated_duration_hours: number;
  prerequisites: string[];
  target_audience: string;

  sections: Array<{
    section_id: string;
    title: string;
    description: string;

    lessons: Array<{
      lesson_id: string;
      title: string;
      description: string;

      learning_objectives: Array<{
        verb: string;
        content: string;
        bloom_level: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
      }>;

      topics: string[];
      estimated_duration_minutes: number;
      difficulty_level: 'beginner' | 'intermediate' | 'advanced';

      // NEW: Detailed specification for Stage 6
      content_structure: {
        intro: {
          hook: string;
          context: string;
        };

        main_sections: Array<{
          section: string;
          rag_query: string;
          expected_content_type: 'conceptual' | 'technical' | 'practical' | 'mixed';
          word_count: number;
        }>;

        examples: Array<{
          type: 'real_world' | 'worked_example' | 'case_study' | 'code_demo';
          topic: string;
          rag_query: string;
          format: string;
        }>;

        exercises: Array<{
          type: 'coding' | 'conceptual' | 'case_study' | 'debugging' | 'design';
          difficulty: 'easy' | 'medium' | 'hard';
          specification: string;
          rag_query: string;
          grading_rubric?: string;
        }>;
      };

      // NEW: RAG context for Stage 6
      rag_context: {
        primary_documents: string[];
        search_queries: string[];
        expected_chunks: number;
      };

      interactive_elements?: Array<{
        type: string;
        description: string;
      }>;
    }>;

    section_metadata: {
      estimated_duration_hours: number;
      prerequisites: string[];
      difficulty_progression: string;
    };
  }>;
}
```

---

## Stage 5 → Stage 6 Interface Enhancement (Semantic Scaffolding)

**Research Source**: `docs/research/008-generation/Optimizing AI Lesson Content Prompts.md`

**Problem**: Current `content_structure` schema over-specifies (reduces quality -15-30%) or under-specifies (inconsistent output, high retry rates).

**Solution**: **Semantic Scaffolding** — Specify WHAT to achieve and WHERE to source info, leave HOW to express it to model reasoning.

### Critical vs Optional Specification (Evidence-Based)

**MUST SPECIFY (Critical Elements)**:
- ✅ Learning objectives (exact outcomes, Bloom's level, success criteria)
- ✅ Target audience persona (executive/practitioner/novice)
- ✅ RAG context (source material IDs, not queries)
- ✅ Output format structure (headers, code block tags, XML delimiters)
- ✅ Negative constraints ("do not mention competitors", "no emojis", "no legal advice")
- ✅ Depth guidance (word count RANGES, not exact numbers)

**FLEXIBLE (Constraint-Guided)**:
- ⚠️ Tone/voice (adjectives: "authoritative yet accessible", not syntax rules)
- ⚠️ Analogy domain (e.g., "use cooking analogy", not exact narrative)
- ⚠️ Example topic (e.g., "FinTech fraud detection", not full scenario)

**LEAVE TO MODEL (Open Elements)**:
- ❌ Sentence structure (no "start every sentence with verb")
- ❌ Exact transitions (no "use 'Furthermore' between paragraphs")
- ❌ Hook phrasing (provide strategy, not exact text)

### Updated Schema (LessonSpecification V2)

**Key Changes from V1**:
1. `hook: string` → `hook_strategy: "analogy" | "statistic" | "challenge"` + `hook_topic: string`
2. `word_count: number` → `depth: "summary" | "detailed" | "comprehensive"`
3. `rag_query: string` → `rag_context_id: string` (results, not query)
4. Added `content_archetype` for dynamic temperature routing
5. Structured `rubric_criteria` (not string)

```typescript
// ENHANCED Stage 5 → Stage 6 Interface
interface LessonSpecification {
  metadata: {
    target_audience: "executive" | "practitioner" | "novice";
    tone: "formal" | "conversational-professional";
    compliance_level: "strict" | "standard";
  };

  learning_objectives: {
    objective: string;
    bloom_level: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
    success_criteria: string[];
  };

  intro_blueprint: {
    hook_strategy: "analogy" | "statistic" | "challenge" | "question"; // NOT exact text
    hook_topic: string; // e.g., "The cost of downtime"
    key_learning_objectives: string;
  };

  sections: Array<{
    title: string;
    content_archetype: "concept_explainer" | "code_tutorial" | "case_study" | "legal_warning"; // For temp routing
    rag_context_id: string; // ID of RAG results, NOT query string

    constraints: {
      depth: "summary" | "detailed_analysis" | "comprehensive"; // NOT exact word_count
      required_keywords: string[]; // SEO + learning alignment
      prohibited_terms: string[]; // Compliance
    };

    key_points_to_cover: string[]; // The "Skeleton"
    analogies_to_use?: string; // Optional: "Use traffic light analogy"
  }>;

  exercises: Array<{
    type: "multiple_choice" | "coding" | "short_answer";
    difficulty: "easy" | "hard";
    learning_objective_id: string; // Links to specific LO
    structure_template: "scenario_problem_solution"; // High specificity OK
    rubric_criteria: { // Structured, not string
      criteria: string[];
      weight: number;
    }[];
  }>;
}
```

### Content Type Variation (Dynamic Temperature)

**Research Finding**: Optimal specification level varies by content type (Technical vs Conceptual vs Compliance).

**Technical Content** (code_tutorial, algorithms):
- **Specification Level**: HIGH (precision paramount)
- **Temperature**: 0.2 (low)
- **Must Specify**: Input/output pairs, specific libraries (e.g., "PyTorch 2.0"), error handling
- **Prompt Technique**: Few-Shot Prompting (provide example code block)
- **Constraint**: "Code must be commented. Follow What-Why-How structure."

**Conceptual Content** (theory, frameworks):
- **Specification Level**: MEDIUM (reasoning encouraged)
- **Temperature**: 0.7 (medium-high)
- **Must Specify**: Key definitions, framework name (e.g., "Porter's Five Forces"), learning outcome
- **Freedom**: Narrative bridge between concepts, metaphor selection
- **Prompt Technique**: Chain-of-Thought ("First explain concept, then counter-intuitive example")

**Compliance Content** (legal, regulatory):
- **Specification Level**: EXTREME (liability risk)
- **Temperature**: 0.1 (very low)
- **Must Specify**: "Use exact terminology from document", "Quote clauses, do not summarize", "Cite Section X.Y"
- **Prompt Technique**: Grounding ("Answer solely using RAG context. If info not in context, state 'INSUFFICIENT_CONTEXT'")
- **Risk**: Under-specification → hallucinated regulations (dangerous)

### Prompt Architecture Strategy

**Context-First XML Strategy** (Evidence: Anthropic/Claude research):
- Use XML tags to structure prompt (reduces context bleeding)
- Semantic boundaries: `<lesson_blueprint>`, `<rag_context>`, `<generation_steps>`

**Output Format Strategy**:
- **Markdown for prose** (not JSON) → Avoids "cognitive tax" on model
- **JSON for metadata** (exercises, structured data)
- **Why**: Forcing 3K-5K words inside JSON string degrades quality (-15-30%)

**Template Structure**:
```
<system_role>
Expert B2B Instructional Designer specializing in {topic}.
Goal: Write comprehensive lesson for {target_audience}.
</system_role>

<critical_instructions>
1. GROUNDING: Use ONLY <rag_context>. No hallucinations.
2. TONE: {tone}
3. FORMAT: Markdown (## sections, ### subsections)
4. REFUSAL: If RAG insufficient, output "INSUFFICIENT_CONTEXT"
</critical_instructions>

<lesson_blueprint>{JSON_FROM_STAGE_5}</lesson_blueprint>
<rag_context>{RETRIEVED_DOCS}</rag_context>

<generation_steps>
1. ANALYZE: Cross-reference blueprint + RAG
2. OUTLINE: Plan logical flow
3. DRAFT: Write sections (hook_strategy, key_points, constraints)
4. REVIEW: Check required_keywords, prohibited_terms
</generation_steps>

<output_format>Markdown only. No JSON wrapper.</output_format>
```

### Skeleton-of-Thought Architecture (Parallel Generation)

**Problem**: Generating 5K words in one pass is slow (~2-3 min) and prone to "context forgetting" (end contradicts beginning).

**Solution**: Two-step generation:
1. **Skeleton** (Stage 5): Generate section titles + key_points (the "outline")
2. **Expansion** (Stage 6): Generate Section 1, 2, 3 **in parallel**

**Benefit**: 5K-word lesson in time of 1K words (~30-45 sec per section × parallel)

**Risk**: Sections might not reference each other perfectly
**Mitigation**: Final "Smoothing Pass" (Stage 7?) adds transitional phrases between parallel-generated blocks

**Implementation**:
```typescript
// Stage 5 output: Skeleton
sections: [
  { title: "Intro to Consensus", key_points: ["distributed systems", "Byzantine problem"] },
  { title: "PoW Mechanics", key_points: ["mining", "difficulty", "51% attack"] },
  { title: "PoS Alternative", key_points: ["staking", "slashing", "energy efficiency"] }
]

// Stage 6: Parallel expansion
Promise.all([
  generateSection(sections[0]), // Parallel
  generateSection(sections[1]), // Parallel
  generateSection(sections[2])  // Parallel
])

// Optional Stage 7: Smoothing
addTransitions(generatedSections); // "Building on the consensus foundation..."
```

### Quality-Cost Trade-off (Evidence-Based)

**Research Data** (ASU Instructional Agents study):

| Approach | Quality | Retries | Cost/Lesson | Development Time |
|----------|---------|---------|-------------|------------------|
| **Over-Specified** (Mad Libs) | 3.2/5.0 | 1.8x | $0.45 | 4.5 hrs |
| **Optimal (Semantic Scaffolding)** | 3.8/5.0 | 1.2x | $0.32 | 3.2 hrs |
| **Under-Specified** (High-level) | 2.9/5.0 | 2.4x | $0.52 | 5.8 hrs |

**ROI** (per 50 lessons):
- Optimal: $16 cost, 160 hrs
- Over-specified: $22.50, 225 hrs
- **Savings**: $6.50 + 65 hours (29% efficiency gain)

### Migration Strategy (V1 → V2)

**Schema Transformation**:
```typescript
function transformV1toV2(v1: LessonSpecV1): LessonSpecification {
  return {
    metadata: {
      target_audience: inferAudience(v1.difficulty_level),
      tone: "conversational-professional", // Default
      compliance_level: "standard"
    },
    intro_blueprint: {
      hook_strategy: extractStrategy(v1.content_structure.intro.hook), // Parse text → strategy
      hook_topic: extractTopic(v1.content_structure.intro.hook),
      key_learning_objectives: v1.learning_objectives[0].content
    },
    sections: v1.content_structure.main_sections.map(s => ({
      title: s.section,
      content_archetype: mapContentType(s.expected_content_type),
      rag_context_id: executeAndStoreRAG(s.rag_query), // Execute query, store results
      constraints: {
        depth: mapWordCountToDepth(s.word_count), // 200-400 → "summary"
        required_keywords: extractKeywords(s.section),
        prohibited_terms: []
      },
      key_points_to_cover: [s.section] // Fallback
    })),
    exercises: v1.content_structure.exercises.map(e => ({
      ...e,
      rubric_criteria: parseRubric(e.grading_rubric) // string → structured
    }))
  };
}
```

**Backward Compatibility**:
- V1 schema still supported (automatic transformation)
- New courses use V2
- A/B test: V1 vs V2 (quality metrics)

---

## LLM Parameters Optimization (Multi-Stage)

**Research Source**: `docs/research/008-generation/Research Prompt - Optimal LLM Parameters.md` (PENDING)

**Problem**: Currently use default temperature (0.7) across all stages/phases, which is suboptimal for diverse task types.

**Solution**: Task-specific parameter tuning (temperature, top-p, frequency_penalty, presence_penalty, max_tokens).

### Parameter Strategy by Stage

**Stage 3 (Document Classification)**:
- **Task Type**: Binary classification (HIGH/LOW priority)
- **Temperature**: **0.0-0.1** (extreme determinism)
- **Top-p**: 0.7-0.8 (truncate unreliable tail)
- **Frequency Penalty**: 0.0
- **Presence Penalty**: 0.0
- **Max Tokens**: 10-20 (minimal output needed)
- **Rationale**: Binary decision requires maximum determinism. B2B has zero tolerance for misclassification. Temperature 0.0 eliminates sampling randomness.

**Stage 4 (Analyze) - Phase-Specific**:

| Phase | Task Type | Temperature | Top-p | Freq Pen | Pres Pen | Max Tokens | Rationale |
|-------|-----------|-------------|-------|----------|----------|------------|-----------|
| Phase 1 | Multi-label Classification | **0.1-0.2** | 0.8 | 0.0-0.1 | 0.0 | 50-100 | Calibrated probabilities for multi-class |
| Phase 2 | Counting/Estimation | **0.0-0.2** | 0.7 | 0.0 | 0.0 | 100-200 | Arithmetic accuracy critical |
| **Phase 3** | **Strategic Reasoning** | **0.4-0.5** | 0.9 | 0.2 | 0.1 | 1500-2500 | **Evidence-based pedagogy, NOT creative brainstorming** |
| Phase 4 | Document Synthesis | **0.3-0.4** | 0.9 | 0.2 | 0.1 | 800-1200 | Structural coherence with flexibility |
| Phase 6 | RAG Planning | **0.4-0.5** | 0.9 | 0.3 | 0.2 | 600-1000 | Query diversity + precision balance |

**CRITICAL CHANGE (Phase 3)**: V1 recommended 0.8-0.85 (too high!). Research shows pedagogical strategy = **strategic reasoning** (0.4-0.5), NOT creative fiction (0.9-1.0). Medical strategic analysis uses 0.0-0.5; business strategy uses 0.3-0.5. Educational curriculum design requires coherent, evidence-based decisions with pedagogical flexibility.

**Stage 5 (Generation) - Phase-Specific**:

| Phase | Task Type | Temperature | Top-p | Freq Pen | Pres Pen | Max Tokens | Rationale |
|-------|-----------|-------------|-------|----------|----------|------------|-----------|
| Phase 2 | Metadata Gen | **0.6-0.7** | 0.9 | 0.4 | 0.2 | 50-100 | **Professional engaging (NOT clickbait)** |
| **Phase 3** | **RAG Synthesis** | **0.4-0.5** | 0.9 | 0.2 | 0.1 | 2000-3000 | **Grounded pedagogical synthesis (single-stage)** |
| Phase 4 | LLM Judge | **0.0** | 1.0 | 0.0 | 0.0 | 200-400 | **Consistency via 3x voting** |

**CRITICAL CHANGES**:
1. **Phase 2 (Metadata)**: 0.8 → **0.6-0.7**. Research shows B2B professional engagement ≠ consumer marketing. Frequency penalty 0.4 prevents repetitive title patterns ("Introduction to..."). Lower than V1 but higher than pure factual (allows engaging professional titles).

2. **Phase 3 (Lesson Breakdown)**: 0.7 → **0.4-0.5**. WITH RAG (20-30 chunks) requires factual grounding + pedagogical synthesis. Google Vertex recommends temp 0.0 for RAG retrieval, BUT educational content needs synthesis (not verbatim copying). CoT-RAG study found **temp 0.4 optimal** for "balance determinism + diversity" in RAG reasoning. Single-stage preferred over two-stage for MVP (simpler, lower latency). Two-stage option: Stage 1 (outline) 0.4 + Stage 2 (content) 0.5 = 1.12x cost (NOT 2.0x).

3. **Phase 4 (Judge)**: 0.2 → **0.0**. Industry consensus: **temp 0.0 for LLM judges**. Google docs: "evaluations don't need creativity—set low temp." Research shows even at temp 0.0, LLMs have variance (40% score spread). **Mitigation: 3x voting** (run evaluation 3 times, use majority/median).

**Stage 6 (Lesson Content) - Content Archetype**:

| Archetype | Temperature | Top-p | Freq Pen | Pres Pen | Max Tokens | Rationale |
|-----------|-------------|-------|----------|----------|------------|-----------|
| **code_tutorial** | **0.2-0.3** | 0.6-0.7 | 0.0-0.1 | 0.0-0.1 | 2000-3000 | Syntax precision (Llama 3 official: 0.2-0.3, top-k 5-10) |
| **concept_explainer + analogies** | **0.6-0.7** | 0.9-0.95 | 0.3 | 0.2 | 2500-3500 | **Educational clarity (NOT temp 1.0!)** |
| **case_study** | **0.5-0.6** | 0.9 | 0.2 | 0.15 | 1800-2200 | Narrative coherence + realism |
| **legal_warning** | **0.0-0.1** | 0.7-0.8 | 0.0 | 0.0 | 2000-3000 | Zero error tolerance (compliance) |

**CRITICAL CHANGE (Educational Analogies)**: V1 recommended temp **1.0** for analogies (too risky!). Research from Harper et al. (ITiCSE 2024) and "Unlocking Scientific Concepts" (CHI 2025) shows:
- **Educational analogy quality = Clarity × Accuracy × Helpfulness**
- Temperature 1.0 sacrifices accuracy/clarity for novelty (creates confusing/inaccurate metaphors)
- Educational analogies ≠ creative fiction analogies (entertainment vs pedagogy)
- **Optimal: 0.6-0.7** provides creative yet pedagogically sound analogies
- Examples: "HTTP = restaurant ordering", "Blockchain = shared ledger" require **structural alignment + accuracy**

Khan Academy's Khanmigo emphasizes "carefully adapted prompts to avoid errors" (suggests conservative temps). While specific parameters undisclosed, focus on error prevention implies **lower temps than creative applications**.

### Per-Section Dynamic Temperature: NOT RECOMMENDED ❌

**V1 Hypothesis**: Single lesson with multiple archetypes → dynamic temperature per section.

**V2 Research Finding**: Production systems have **ZERO ADOPTION** of per-section temperature strategies.

**Why Production Rejects This**:
1. **Cost**: 5-7 API calls per lesson = **5-7x base cost** (5 sections × $0.30 = $1.50 vs $0.30 single-stage)
2. **Latency**: Sequential calls add 10-20 seconds; parallel adds complexity
3. **No proven ROI**: No case studies show quality improvement justifies 5-7x cost
4. **Better alternative exists**: **Model routing** delivers 40-60% cost reduction with proven results

**What Production Does Instead**:
```typescript
// Model routing (not per-section temperature)
function selectModel(lessonComplexity: 'simple' | 'complex'): ModelConfig {
  if (lessonComplexity === 'simple') {
    return { model: 'llama-3-8b-instruct', temperature: 0.5 };  // 70% of lessons, cheaper
  }
  return { model: 'qwen-2.5-120b', temperature: 0.5 };  // 30% of lessons, complex only
}
```

**Recommendation for MVP**: Use **single temperature per lesson** based on dominant content archetype. Reserve per-section optimization for Phase 3 (only if volume >1M tokens/day and clear ROI demonstrated).

**Implementation (Single Temp Per Lesson)**:
```typescript
function selectLessonParameters(dominantArchetype: string): LLMParameters {
  const paramMap = {
    code_tutorial: { temperature: 0.25, top_p: 0.7, frequency_penalty: 0.1, presence_penalty: 0.1, max_tokens: 2500 },
    concept_explainer: { temperature: 0.65, top_p: 0.9, frequency_penalty: 0.3, presence_penalty: 0.2, max_tokens: 3000 },
    case_study: { temperature: 0.55, top_p: 0.9, frequency_penalty: 0.2, presence_penalty: 0.15, max_tokens: 2200 },
    legal_warning: { temperature: 0.05, top_p: 0.7, frequency_penalty: 0.0, presence_penalty: 0.0, max_tokens: 2500 }
  };
  return paramMap[dominantArchetype] || { temperature: 0.5, top_p: 0.9, frequency_penalty: 0.2, presence_penalty: 0.1, max_tokens: 2500 };
}
```

### Research Results Integrated (V2 - Production-Ready)

**Status**: ✅ COMPLETE (research integrated 2025-11-20)

**Sources**:
- `docs/research/008-generation/Optimal LLM Parameters for B2B Educational Course Generation Production-Ready Recommendations.md`
- `docs/research/008-generation/Research Prompt - Optimal LLM Parameters V2.md`

**Critical Findings**:
1. ✅ **Educational content requires temps 0.2-0.4 lower** than creative writing
2. ✅ **OSS models (Llama 3, Qwen, Mistral) need NO universal adjustment** from commercial baselines
3. ✅ **Realistic retry rates: 15-30%** (1.15-1.3x multiplier), NOT optimistic 1.18x
4. ✅ **Production cost multipliers: 2-5x base tokens** (retries + QA + infrastructure)
5. ✅ **Per-section dynamic temp: REJECTED** (5-7x cost, zero production adoption)
6. ✅ **Model routing delivers 40-60% cost reduction** (proven ROI vs temperature tuning)
7. ✅ **Two-stage generation: 1.12x cost** (NOT 2.0x - Stage 1 uses only 11.9% tokens)

---

## Implementation Priorities (Updated)

### Priority 0: Stage 5 → Stage 6 Interface Refactoring (BLOCKING)

**Duration**: 2-3 days

**Tasks**:
1. Update `LessonSpecification` schema in `packages/shared-types/src/generation-result.ts`
   - Replace `hook: string` with `hook_strategy` + `hook_topic`
   - Replace `word_count: number` with `depth: enum`
   - Add `content_archetype` field
   - Add `rag_context_id` (replace `rag_query`)
   - Structured `rubric_criteria`
2. Update Stage 5 Phase 3 (generate_sections) to produce V2 schema
3. Create V1→V2 transformation utility (backward compatibility)
4. Update all TypeScript interfaces and Zod schemas

**Deliverables**:
- `packages/shared-types/src/lesson-specification-v2.ts`
- `stages/stage5-generation/utils/transform-lesson-spec.ts`
- Migration guide in `docs/migration/V1-TO-V2-LESSON-SPEC.md`

### Priority 1: Document Prioritization (Stage 2 + Stage 3 Enhancement) - FOUNDATION

**Duration**: 3-4 days (FULLY SPECIFIED)

**Spec**: `docs/FUTURE/FUTURE-ENHANCEMENT-DOCUMENT-PRIORITIZATION.md`

**Tasks**: (Already detailed in spec, integrated into Stage 2 + Stage 3)

### Priority 2: Analysis Phase 6 (RAG Planning)

**Duration**: 1-2 days

**Tasks**: (No changes, already specified - see Implementation Tasks section)

### Priority 3: Generation RAG Integration + Semantic Scaffolding

**Duration**: 3-4 days (extended from 2-3)

**Tasks**:
1. Implement section-level RAG retrieval (unchanged)
2. **NEW**: Update Phase 3 to generate V2 LessonSpecification
   - Implement `hook_strategy` detection (analyze content → classify strategy)
   - Implement `depth` calculation (estimate content density)
   - Add `content_archetype` inference (technical vs conceptual vs compliance)
3. **NEW**: Execute RAG queries during Phase 3, store results (not queries)
   - Create `rag_context_cache` in database
   - Link via `rag_context_id`

**Deliverables**:
- Updated `stages/stage5-generation/utils/section-batch-generator.ts`
- `stages/stage5-generation/utils/semantic-scaffolding-builder.ts` (NEW)
- RAG context caching logic in `shared/qdrant/`

### Priority 4: Stage 6 Prompt Template + Dynamic Temperature

**Duration**: 2-3 days

**Tasks**:
1. Create Context-First XML prompt template
2. Implement dynamic temperature selection (content_archetype → params)
3. Markdown output parser (not JSON)
4. INSUFFICIENT_CONTEXT refusal logic

**Deliverables**:
- `stages/stage6-lesson-content/utils/prompt-template-builder.ts`
- `stages/stage6-lesson-content/utils/parameter-selector.ts`
- `stages/stage6-lesson-content/utils/markdown-parser.ts`

### Priority 5: LLM Parameters Implementation (AFTER RESEARCH)

**Duration**: 2 days (after research complete)

**Tasks**:
1. Integrate research results into parameter selector
2. Update all stages (2, 3, 4, 5, 6) with optimal parameters
3. A/B testing framework (default vs optimized)

**Deliverables**:
- `shared/llm/llm-parameters.ts` (centralized config)
- Updated orchestrators with parameter injection
- A/B test tracking in metadata

### Priority 6: Skeleton-of-Thought Parallel Generation (OPTIMIZATION)

**Duration**: 3-4 days

**Tasks**: (No changes, already specified as optional - applies to Stage 6)

---

## References

### Research & Decisions

- **Perplexity Research (Architecture)**: `docs/research/008-generation/Optimal Multi-Stage Architecture for AI Course Generation.md`
- **Perplexity Research (Prompt Specification)**: `docs/research/008-generation/Optimizing AI Lesson Content Prompts.md` (Semantic Scaffolding)
- **Perplexity Research (LLM Parameters V2)**: `docs/research/008-generation/Optimal LLM Parameters for B2B Educational Course Generation Production-Ready Recommendations.md` ✅ COMPLETE
- **Research Prompt (LLM Parameters V2)**: `docs/research/008-generation/Research Prompt - Optimal LLM Parameters V2.md` (Corrected with constraints)
- **Architecture Analysis**: `docs/ANALYZE-GENERATION-RESPONSIBILITY-DISTRIBUTION.md`
- **Document Prioritization**: `docs/FUTURE/FUTURE-ENHANCEMENT-DOCUMENT-PRIORITIZATION.md`
- **Regeneration Strategy**: `docs/REGENERATION-STRATEGY.md`
- **Model Selection**: `docs/MODEL-SELECTION-DECISIONS.md`

### Implementation Specs

- **Stage 4 Spec**: `specs/007-stage-4-analyze/spec.md`
- **Stage 5 Spec**: `specs/008-generation-generation-json/spec.md`
- **Analyze Enhancement**: `specs/008-generation-generation-json/ANALYZE-ENHANCEMENT-UNIFIED.md`

### Code References (Updated for Unified Architecture v0.19.0)

- **Stage 2 Orchestrator**: `packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts`
- **Stage 3 Orchestrator**: `packages/course-gen-platform/src/stages/stage3-summarization/orchestrator.ts`
- **Stage 4 Orchestrator**: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`
- **Stage 5 Orchestrator**: `packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts`
- **Stage 6 (TO BE CREATED)**: `packages/course-gen-platform/src/stages/stage6-lesson-content/`
- **BullMQ Worker**: `packages/course-gen-platform/src/orchestrator/worker.ts`
- **Shared Utilities**: `packages/course-gen-platform/src/shared/`

---

## Migration & Backward Compatibility

### Existing Courses

✅ Continue working with current analysis_result
✅ No reprocessing required
✅ Optional: Reprocess for quality improvement

### New Courses

✅ Automatically use new architecture
✅ Document Prioritization enabled by default
✅ RAG Planning in Analyze Phase 6
✅ Generation uses RAG retrieval
✅ **LessonSpecification V2** (Semantic Scaffolding) → NEW
✅ **Dynamic temperature** by content archetype → NEW

### Gradual Rollout

**Week 1**: Document Prioritization (Stage 2 + Stage 3 Enhancement)
- Deploy to TRIAL tier
- Monitor classification accuracy
- Validate cost savings

**Week 2**: Analysis Phase 6 (RAG Planning)
- Deploy to TRIAL + FREE tiers
- Monitor RAG plan quality
- A/B test: with RAG plan vs without

**Week 3**: Generation RAG Integration (Stage 5)
- Deploy to all tiers
- Monitor retrieval quality
- Track success rates

**Week 4+**: Stage 6 (Lesson Content) Implementation
- Create `stages/stage6-lesson-content/` directory
- Parallel development
- Internal testing
- Gradual rollout

---

## Acceptance Criteria

### For Sign-Off

Before considering this architecture complete:

1. ✅ **Priority 0**: LessonSpecification V2 schema implemented (Semantic Scaffolding) → NEW
2. ✅ Document Prioritization (Stage 2 + Stage 3) implemented and tested
3. ✅ Analysis Phase 6 (RAG Planning) implemented
4. ✅ Generation (Stage 5) RAG integration + V2 schema generation complete
5. ✅ E2E tests passing (Stage 2 → Stage 3 → Stage 4 → Stage 5 with V2)
6. ✅ Cost metrics validated (60-80% savings on lightweight courses)
7. ✅ Quality metrics validated (95%+ success rate, V2 vs V1 A/B test)
8. ✅ Stage 6 spec approved and implementation planned
9. ✅ **LLM Parameters research completed and integrated** → NEW (after research)

### For Production Launch

1. ✅ All stages (2, 3, 4, 5, 6) implemented with unified pattern
2. ✅ Full test coverage (unit + integration + E2E)
3. ✅ Performance benchmarks met
4. ✅ Monitoring & alerting configured
5. ✅ Documentation complete (README.md in each stage directory)
6. ✅ User acceptance testing passed

---

**Status**: APPROVED - Ready for Implementation (V2.2 Aligned)
**Next Steps**:
1. **Priority 0**: Implement LessonSpecification V2 schema (2-3 days) → BLOCKING
2. **Priority 1**: Implement Document Prioritization in Stage 2 + Stage 3 (3-4 days) → FOUNDATION
3. Complete LLM Parameters research via Perplexity (PENDING)
4. Create implementation tasks in project management system
5. Assign engineers to Priority 0-3 tasks
6. Schedule weekly progress reviews

**Version**: 2.2.0
**Last Updated**: 2025-11-21 (Aligned with unified stages/ architecture v0.19.0)
**Approved By**: [Pending stakeholder approval]
