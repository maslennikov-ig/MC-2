# Data Model: Stage 4-6 Course Generation Pipeline

**Date**: 2025-11-22
**Branch**: `010-stages-456-pipeline`

## Entity Relationship Diagram

```
┌─────────────────────┐
│  UploadedDocument   │
│  (Stage 1 output)   │
└─────────┬───────────┘
          │ 1:1
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│ DocumentPriority    │──────│ BudgetAllocation    │
│ (Stage 2 output)    │      │ (Stage 3 input)     │
└─────────┬───────────┘      └─────────────────────┘
          │ 1:1
          ▼
┌─────────────────────┐
│ ProcessedDocument   │
│ (Stage 3 output)    │──────┐
└─────────┬───────────┘      │ vectorized to
          │                  ▼
          │           ┌─────────────────────┐
          │           │ QdrantChunk         │
          │           │ (Vector storage)    │
          │           └─────────────────────┘
          │ N:1
          ▼
┌─────────────────────┐
│ AnalysisResult      │
│ (Stage 4 output)    │
└─────────┬───────────┘
          │ 1:1 contains
          ▼
┌─────────────────────┐
│ DocumentRelevance   │
│ Mapping (RAG Plan)  │
└─────────┬───────────┘
          │ 1:1
          ▼
┌─────────────────────┐
│ CourseStructure     │
│ (Stage 5 output)    │
└─────────┬───────────┘
          │ 1:N
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│ LessonSpecV2        │──────│ RAGContextCache     │
│ (Semantic Scaffold) │      │ (Pre-retrieved)     │
└─────────┬───────────┘      └─────────────────────┘
          │ 1:1
          ▼
┌─────────────────────┐
│ LessonContent       │
│ (Stage 6 output)    │
└─────────────────────┘
```

---

## Entities

### 1. DocumentPriority (NEW - Stage 2 Enhancement)

**Description**: Classification result for uploaded documents.

**Location**: `packages/shared-types/src/document-prioritization.ts`

```typescript
interface DocumentPriority {
  file_id: string;                    // FK to uploaded_documents
  priority: 'HIGH' | 'LOW';           // Classification result
  importance_score: number;           // 0.0-1.0 (HIGH threshold: >= 0.7)
  order: number;                      // Processing order (1-N)
  category: DocumentCategory;         // See enum below
  classification_rationale: string;   // LLM reasoning
  classified_at: Date;
}

type DocumentCategory =
  | 'course_core'      // Lectures, textbooks, syllabi
  | 'supplementary'    // Presentations, notes
  | 'reference'        // Standards, technical docs
  | 'regulatory';      // Laws, compliance docs

// Validation Rules
// - importance_score must be in [0.0, 1.0]
// - HIGH priority: importance_score >= 0.7
// - LOW priority: importance_score < 0.7
// - order must be unique within course
```

### 2. BudgetAllocation (NEW - Stage 3 Enhancement)

**Description**: Token budget allocation for document processing.

**Location**: `packages/shared-types/src/document-prioritization.ts`

```typescript
interface BudgetAllocation {
  course_id: string;
  total_high_priority_tokens: number;  // Sum of HIGH priority docs
  total_low_priority_tokens: number;   // Sum of LOW priority docs
  selected_model: AnalysisModel;       // Based on 80K threshold
  high_budget: number;                 // Allocated to HIGH docs
  low_budget: number;                  // Allocated to LOW docs
  allocated_at: Date;
}

type AnalysisModel =
  | 'oss-120b'      // If HIGH_total <= 80K (128K context)
  | 'gemini-flash'; // If HIGH_total > 80K (1M context)

// Decision Logic
// IF total_high_priority_tokens <= 80_000:
//   selected_model = 'oss-120b'
//   high_budget = 80_000
// ELSE:
//   selected_model = 'gemini-flash'
//   high_budget = 400_000
```

### 3. ProcessedDocument (Enhanced - Stage 3 Output)

**Description**: Document after prioritization and summarization.

**Location**: `packages/shared-types/src/summarization-result.ts` (enhance)

```typescript
interface ProcessedDocument {
  file_id: string;
  filename: string;

  // From DocumentPriority
  priority: 'HIGH' | 'LOW';
  importance_score: number;
  order: number;
  category: DocumentCategory;

  // Processing result
  processing_mode: 'full_text' | 'summary';
  content_for_analysis: string;        // Full text OR summary
  content_token_count: number;

  // Original preserved for vectorization
  original_token_count: number;
  vectorization_status: 'pending' | 'completed' | 'failed';

  processed_at: Date;
}

// Processing Rules
// HIGH + <=50K tokens → full_text
// HIGH + >50K tokens → summary (~10K balanced)
// LOW (any size) → summary (~5K aggressive)
// EXCEPTION: LOW + <3K + budget available → full_text
```

### 4. DocumentRelevanceMapping (NEW - Stage 4 Phase 6)

**Description**: RAG plan mapping sections to documents.

**Location**: `packages/shared-types/src/analysis-result.ts` (enhance)

```typescript
interface DocumentRelevanceMapping {
  [section_id: string]: SectionRAGPlan;
}

interface SectionRAGPlan {
  primary_documents: string[];         // file_ids ranked by relevance
  search_queries: string[];            // Queries for RAG retrieval
  expected_topics: string[];           // Topics to find in chunks
  confidence: 'high' | 'medium';       // Based on processing_mode
  note?: string;                       // Guidance for Generation
}

// Confidence Rules
// 'high': All primary_documents have processing_mode='full_text'
// 'medium': Any primary_document has processing_mode='summary'
```

### 5. GenerationGuidance (Enhanced - Stage 4 Output)

**Description**: Structured generation guidance replacing deprecated scope_instructions.

**Location**: `packages/shared-types/src/analysis-result.ts` (enhance)

```typescript
interface GenerationGuidance {
  tone: ToneType;
  use_analogies: boolean;
  specific_analogies?: string[];       // Optional suggested analogies
  avoid_jargon: string[];              // Terms to avoid
  include_visuals: VisualType[];
  exercise_types: ExerciseType[];
  contextual_language_hints: string;   // Language-specific guidance
  real_world_examples?: string[];      // Suggested example domains
}

type ToneType =
  | 'conversational but precise'
  | 'formal academic'
  | 'casual friendly'
  | 'technical professional';

type VisualType = 'diagrams' | 'flowcharts' | 'code examples' | 'screenshots';
type ExerciseType = 'coding' | 'conceptual' | 'case_study' | 'debugging' | 'design';
```

### 6. LessonSpecificationV2 (NEW - Semantic Scaffolding)

**Description**: V2 lesson specification with semantic scaffolding approach.

**Location**: `packages/shared-types/src/lesson-specification-v2.ts`

```typescript
interface LessonSpecificationV2 {
  lesson_id: string;                   // e.g., "1.1"
  title: string;
  description: string;

  metadata: LessonMetadata;
  learning_objectives: LearningObjective[];
  intro_blueprint: IntroBlueprint;
  sections: SectionSpecV2[];
  exercises: ExerciseSpecV2[];
  rag_context: LessonRAGContext;

  estimated_duration_minutes: number;
  difficulty_level: DifficultyLevel;
}

interface LessonMetadata {
  target_audience: 'executive' | 'practitioner' | 'novice';
  tone: 'formal' | 'conversational-professional';
  compliance_level: 'strict' | 'standard';
  content_archetype: ContentArchetype;  // For temperature routing
}

type ContentArchetype =
  | 'code_tutorial'      // temp 0.2-0.3
  | 'concept_explainer'  // temp 0.6-0.7
  | 'case_study'         // temp 0.5-0.6
  | 'legal_warning';     // temp 0.0-0.1

interface IntroBlueprint {
  hook_strategy: 'analogy' | 'statistic' | 'challenge' | 'question';
  hook_topic: string;                  // e.g., "The cost of downtime"
  key_learning_objectives: string;     // Summary of LOs
}

interface SectionSpecV2 {
  title: string;
  content_archetype: ContentArchetype; // Per-section archetype
  rag_context_id: string;              // ID of pre-retrieved context

  constraints: SectionConstraints;
  key_points_to_cover: string[];       // The "skeleton"
  analogies_to_use?: string;           // Optional: specific analogy
}

interface SectionConstraints {
  depth: 'summary' | 'detailed_analysis' | 'comprehensive';
  required_keywords: string[];         // SEO + learning alignment
  prohibited_terms: string[];          // Compliance terms to avoid
}

interface ExerciseSpecV2 {
  type: ExerciseType;
  difficulty: 'easy' | 'medium' | 'hard';
  learning_objective_id: string;       // Links to specific LO
  structure_template: string;          // e.g., 'scenario_problem_solution'
  rubric_criteria: RubricCriterion[];
}

interface RubricCriterion {
  criteria: string[];
  weight: number;                      // 0-100, sum to 100
}

interface LessonRAGContext {
  primary_documents: string[];         // file_ids
  search_queries: string[];            // Lesson-specific queries
  expected_chunks: number;             // 5-10 typical
}
```

### 7. RAGContextCache (NEW - Stage 6 Support)

**Description**: Pre-retrieved RAG chunks stored for retry consistency.

**Location**: `packages/shared-types/src/lesson-content.ts`

```typescript
interface RAGContextCache {
  context_id: string;                  // UUID
  course_id: string;
  lesson_id: string;

  chunks: RAGChunk[];
  query_params: RAGQueryParams;        // Persisted long-term

  created_at: Date;
  expires_at: Date;                    // course_completed_at + 1 hour
}

interface RAGChunk {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  page_or_section?: string;
  relevance_score: number;
  metadata: Record<string, unknown>;
}

interface RAGQueryParams {
  queries: string[];
  filters: RAGFilter;
  limit: number;
  search_type: 'similarity' | 'mmr';
}

interface RAGFilter {
  file_ids?: string[];
  topics?: string[];
  section_keywords?: string[];
}

// Lifecycle
// Created: Before lesson generation starts
// Expires: 1 hour after course generation completes
// query_params persisted indefinitely for reproducibility
```

### 8. LessonContent (NEW - Stage 6 Output)

**Description**: Generated lesson content from Stage 6.

**Location**: `packages/shared-types/src/lesson-content.ts`

```typescript
interface LessonContent {
  lesson_id: string;
  course_id: string;

  content: LessonContentBody;
  metadata: LessonContentMetadata;

  status: LessonStatus;
  created_at: Date;
  updated_at: Date;
}

interface LessonContentBody {
  intro: string;                       // Markdown

  sections: ContentSection[];
  examples: ContentExample[];
  exercises: ContentExercise[];

  interactive_elements?: InteractiveElement[];
}

interface ContentSection {
  title: string;
  content: string;                     // Markdown (3-5K words total)
  citations?: Citation[];
}

interface Citation {
  document: string;                    // document name
  page_or_section: string;             // e.g., "page 12" or "Section 3.2"
}

interface ContentExample {
  title: string;
  content: string;                     // Markdown
  code?: string;                       // If code example
  citations?: string[];                // Document references
}

interface ContentExercise {
  question: string;                    // Markdown
  hints?: string[];
  solution: string;                    // Markdown (hidden by default)
  grading_rubric?: GradingRubric;
}

interface GradingRubric {
  criteria: string;
  points: number;
}

interface LessonContentMetadata {
  total_words: number;
  total_tokens: number;
  cost_usd: number;
  quality_score: number;               // 0.0-1.0
  rag_chunks_used: number;
  generation_duration_ms: number;
  model_used: string;
  archetype_used: ContentArchetype;
  temperature_used: number;
}

type LessonStatus =
  | 'pending'           // Queued for generation
  | 'generating'        // In progress
  | 'completed'         // Successfully generated
  | 'failed'            // All retries exhausted
  | 'review_required';  // Partial success, manual review needed
```

### 9. Stage6Job (NEW - BullMQ Job Type)

**Description**: BullMQ job definition for Stage 6 lesson generation.

**Location**: `packages/shared-types/src/bullmq-jobs.ts` (enhance)

```typescript
interface Stage6Job {
  type: 'stage6-lesson-content';
  course_id: string;
  lesson_id: string;

  input: Stage6JobInput;

  retry_count: number;
  max_retries: number;                 // Default: 3
  model_fallback_index: number;        // 0=primary, 1=fallback
}

interface Stage6JobInput {
  lesson_spec: LessonSpecificationV2;
  course_context: CourseContext;
  rag_context_id: string;              // Pre-retrieved context
}

interface CourseContext {
  title: string;
  difficulty_level: DifficultyLevel;
  generation_guidance: GenerationGuidance;
  language: 'en' | 'ru';               // For model routing
}

// Retry Strategy
// Retry 1: Same model, adjusted temperature (+0.1)
// Retry 2: Same model, simplified prompt
// Retry 3: Fallback model (Kimi K2)
// After all retries: status='failed' or 'review_required'
```

---

## State Transitions

### Lesson Generation State Machine

```
[pending] ──start──► [generating] ──success──► [completed]
    │                     │
    │                     ├──retry (1-3)──► [generating]
    │                     │
    │                     ├──partial_success──► [review_required]
    │                     │
    │                     └──all_retries_failed──► [failed]
    │
    └──skip (if manual)──► [review_required]
```

### Document Processing State Machine

```
[uploaded] ──classify──► [classified] ──budget──► [allocated]
     │                        │                      │
     │                        │                      ▼
     │                        │               [summarized]
     │                        │                      │
     │                        ▼                      ▼
     │                  [vectorized] ◄──────── [processed]
     │                        │
     └────────────────────────┴──────────► [ready_for_analysis]
```

---

## Validation Rules Summary

| Entity | Field | Rule |
|--------|-------|------|
| DocumentPriority | importance_score | 0.0-1.0, HIGH if >= 0.7 |
| DocumentPriority | order | Unique within course |
| BudgetAllocation | selected_model | Based on 80K threshold |
| LessonSpecificationV2 | sections | Min 1, typical 3-5 |
| LessonSpecificationV2 | exercises | Min 1 per lesson |
| LessonContent | quality_score | Must be >= 0.75 |
| RAGContextCache | expires_at | course_completed_at + 1h |
| Stage6Job | max_retries | Default 3, max 5 |

---

## Index Recommendations

### PostgreSQL (Supabase)

```sql
-- Document prioritization lookup
CREATE INDEX idx_doc_priority_course ON document_priorities(course_id);
CREATE INDEX idx_doc_priority_importance ON document_priorities(importance_score DESC);

-- Lesson content status tracking
CREATE INDEX idx_lesson_content_status ON lesson_contents(course_id, status);
CREATE INDEX idx_lesson_content_course ON lesson_contents(course_id);

-- RAG context cache cleanup
CREATE INDEX idx_rag_cache_expires ON rag_context_cache(expires_at);
```

### Qdrant

```typescript
// Collection: course_documents
// Indexed fields: file_id, topics, section_keywords
// Vector: 1024-dim (Jina-v3)
```

---

## Prompt Architecture (Stage 6)

### Context-First XML Strategy

Based on Anthropic/Claude research, use XML tags for semantic boundaries:

```typescript
interface Stage6PromptStructure {
  system_role: string;      // Expert B2B Instructional Designer
  critical_instructions: {
    grounding: 'Use ONLY <rag_context>. No hallucinations.';
    tone: string;           // From LessonMetadata
    format: 'Markdown (## sections, ### subsections)';
    refusal: 'If RAG insufficient, output "INSUFFICIENT_CONTEXT"';
  };
  lesson_blueprint: LessonSpecificationV2;  // JSON from Stage 5
  rag_context: RAGChunk[];                  // Retrieved docs
  generation_steps: string[];               // ANALYZE → OUTLINE → DRAFT → REVIEW
  output_format: 'Markdown only. No JSON wrapper.';
}
```

### INSUFFICIENT_CONTEXT Refusal Logic

```typescript
interface RefusalResult {
  status: 'INSUFFICIENT_CONTEXT';
  missing_topics: string[];
  suggested_queries: string[];
  partial_content?: string;  // If any sections could be generated
}

// Triggered when:
// - RAG returns <3 relevant chunks
// - No chunks match required_keywords
// - Confidence score <0.5 for critical sections
```

---

## Research Evidence (Perplexity)

### Success Rate by Architecture

| Approach | Success Rate | Source |
|----------|--------------|--------|
| Single-stage | 29.2% | Perplexity research |
| LLM-only multi-stage | 66.2% | Perplexity research |
| **Hybrid (our approach)** | **78.5%** | Perplexity research |

### Quality Improvement from Semantic Scaffolding

| Approach | Quality Score | Retries | Cost/Lesson |
|----------|---------------|---------|-------------|
| Over-Specified (Mad Libs) | 3.2/5.0 | 1.8x | $0.45 |
| **Optimal (Semantic Scaffolding)** | **3.8/5.0** | 1.2x | $0.32 |
| Under-Specified (High-level) | 2.9/5.0 | 2.4x | $0.52 |

**ROI per 50 lessons**: $6.50 + 65 hours saved (29% efficiency gain)

**Source**: `docs/research/008-generation/Optimizing AI Lesson Content Prompts.md`
