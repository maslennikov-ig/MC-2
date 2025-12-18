# Data Model: Generation Phase

**Feature**: Stage 5 - Course Structure JSON Generation
**Date**: 2025-11-05
**Status**: Phase 2 Complete

## 1. Overview

This document defines the data structures for Stage 5 course structure generation, including:
- Course structure JSON schema (output)
- Generation job parameters (input)
- Generation metadata tracking
- Database schema changes

All schemas use Zod for runtime validation and TypeScript type generation.

---

## 2. Course Structure Schema (Output)

### 2.1 Core Types

**Location**: `packages/shared-types/src/generation-result.ts`

```typescript
import { z } from 'zod';

// ============================================================================
// EXERCISE TYPES (FR-010)
// ============================================================================

export const EXERCISE_TYPES = [
  'self_assessment',
  'case_study',
  'hands_on',
  'discussion',
  'quiz',
  'simulation',
  'reflection',
] as const;

export const ExerciseTypeSchema = z.enum(EXERCISE_TYPES);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

export const PracticalExerciseSchema = z.object({
  exercise_type: ExerciseTypeSchema,
  exercise_title: z.string().min(5).max(300),  // FR-022: max increased 3x (was 100)
  exercise_description: z.string().min(10).max(1500),  // FR-022: max increased 3x (was 500)
});

export type PracticalExercise = z.infer<typeof PracticalExerciseSchema>;

// ============================================================================
// LESSON SCHEMA (FR-011 - Technical Specifications)
// ============================================================================

export const LessonSchema = z.object({
  // Identification
  lesson_number: z.number().int().positive(),
  lesson_title: z.string().min(5).max(500),  // FR-022: max increased 2.5x (was 200)

  // Technical specifications for Stage 6 lesson generation (FR-011)
  lesson_objectives: z.array(z.string().min(15).max(600)).min(1).max(5)  // FR-022: max increased 3x (was 200)
    .describe('Specific learning objectives for this lesson (1-5 items)'),

  key_topics: z.array(z.string().min(5).max(300)).min(2).max(10)  // FR-022: max increased 3x (was 100)
    .describe('Key topics covered in this lesson (2-10 items)'),

  estimated_duration_minutes: z.number().int().min(3).max(45)
    .describe('Estimated time to complete this lesson (3-45 minutes)'),

  // Practical exercises (FR-010)
  practical_exercises: z.array(PracticalExerciseSchema).min(3).max(5)
    .describe('3-5 practical exercises per lesson'),
});

export type Lesson = z.infer<typeof LessonSchema>;

// ============================================================================
// SECTION SCHEMA (FR-012 - Learning Objectives)
// ============================================================================

export const SectionSchema = z.object({
  // Identification
  section_number: z.number().int().positive(),
  section_title: z.string().min(10).max(600),  // FR-022: max increased 3x (was 200)
  section_description: z.string().min(20).max(2000),  // FR-022: max increased ~3.3x (was 600)

  // Pedagogical structure (FR-012)
  learning_objectives: z.array(z.string().min(20).max(600)).min(1).max(5)  // FR-022: max increased 3x (was 200)
    .describe('Section-level learning objectives (1-5 items)'),

  estimated_duration_minutes: z.number().int().positive()
    .describe('Total estimated duration for all lessons in this section'),

  // Nested lessons
  lessons: z.array(LessonSchema).min(1)
    .describe('Lessons within this section (minimum 1)'),
});

export type Section = z.infer<typeof SectionSchema>;

// ============================================================================
// COURSE METADATA (FR-007, FR-012)
// ============================================================================

export const DifficultyLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>;

export const AssessmentStrategySchema = z.object({
  quiz_per_section: z.boolean().describe('Include quiz at end of each section'),
  final_exam: z.boolean().describe('Include comprehensive final exam'),
  practical_projects: z.number().int().min(0).max(10).describe('Number of practical projects'),
  assessment_description: z.string().min(50).max(1500)  // FR-022: max increased 3x (was 500)
    .describe('Description of assessment approach'),
});

export type AssessmentStrategy = z.infer<typeof AssessmentStrategySchema>;

// ============================================================================
// FULL COURSE STRUCTURE (FR-007)
// ============================================================================

export const CourseStructureSchema = z.object({
  // ========== METADATA ==========

  course_title: z.string().min(10).max(1000)  // FR-022: max increased ~3.3x (was 300)
    .describe('Course title (10-1000 characters)'),

  course_description: z.string().min(50).max(3000)  // FR-022: max increased 3x (was 1000)
    .describe('Short course description, elevator pitch (50-3000 chars)'),

  course_overview: z.string().min(100).max(10000)  // FR-022: max increased ~3.3x (was 3000)
    .describe('Comprehensive course overview (100-10000 chars)'),

  target_audience: z.string().min(20).max(1500)  // FR-022: max increased 3x (was 500)
    .describe('Description of target audience (20-1500 chars)'),

  estimated_duration_hours: z.number().positive()
    .describe('Total estimated duration in hours'),

  difficulty_level: DifficultyLevelSchema
    .describe('Overall difficulty level'),

  prerequisites: z.array(z.string().min(10).max(600)).min(0).max(10)  // FR-022: max increased 3x (was 200)
    .describe('List of prerequisites (0-10 items, 10-600 chars each)'),

  learning_outcomes: z.array(z.string().min(30).max(600)).min(3).max(15)  // FR-022: max increased 3x (was 200)
    .describe('Course-level learning outcomes (FR-012: 3-15 items)'),

  assessment_strategy: AssessmentStrategySchema
    .describe('Assessment approach and strategy'),

  course_tags: z.array(z.string().min(3).max(150)).min(5).max(20)  // FR-022: max increased 3x (was 50)
    .describe('Descriptive tags for course (5-20 tags)'),

  // ========== HIERARCHY ==========

  sections: z.array(SectionSchema).min(1)
    .describe('Course sections containing lessons'),

}).refine(
  (data) => {
    // FR-015: Validate minimum 10 lessons total across all sections
    const totalLessons = data.sections.reduce(
      (sum, section) => sum + section.lessons.length,
      0
    );
    return totalLessons >= 10;
  },
  {
    message: 'Course must have minimum 10 lessons total across all sections (FR-015)',
  }
);

export type CourseStructure = z.infer<typeof CourseStructureSchema>;

// ============================================================================
// GENERATION METADATA (FR-025)
// ============================================================================

export const ModelUsageSchema = z.object({
  metadata: z.string().describe('Model used for metadata generation (e.g., qwen/qwen3-max)'),
  sections: z.string().describe('Model used for section generation (e.g., openai/gpt-oss-20b)'),
  validation: z.string().optional().describe('Model used for validation (if applicable)'),
});

export const TokenUsageSchema = z.object({
  metadata: z.number().int().min(0).describe('Tokens used for metadata phase'),
  sections: z.number().int().min(0).describe('Tokens used for all section batches'),
  validation: z.number().int().min(0).describe('Tokens used for validation phase'),
  total: z.number().int().min(0).describe('Total tokens used'),
});

export const DurationSchema = z.object({
  metadata: z.number().int().min(0).describe('Duration of metadata phase (ms)'),
  sections: z.number().int().min(0).describe('Duration of section batches (ms)'),
  validation: z.number().int().min(0).describe('Duration of validation phase (ms)'),
  total: z.number().int().min(0).describe('Total pipeline duration (ms)'),
});

export const QualityScoresSchema = z.object({
  metadata_similarity: z.number().min(0).max(1)
    .describe('Semantic similarity score for metadata (Jina-v3)'),

  sections_similarity: z.array(z.number().min(0).max(1))
    .describe('Semantic similarity scores per section batch'),

  overall: z.number().min(0).max(1)
    .describe('Overall quality score (weighted average)'),
});

export const RetryCountSchema = z.object({
  metadata: z.number().int().min(0).describe('Retry count for metadata generation'),
  sections: z.array(z.number().int().min(0)).describe('Retry counts per section batch'),
});

export const GenerationMetadataSchema = z.object({
  model_used: ModelUsageSchema,
  total_tokens: TokenUsageSchema,
  cost_usd: z.number().min(0).describe('Total cost in USD'),
  duration_ms: DurationSchema,
  quality_scores: QualityScoresSchema,
  batch_count: z.number().int().positive().describe('Number of section batches processed'),
  retry_count: RetryCountSchema,
  created_at: z.string().datetime().describe('ISO 8601 timestamp of generation completion'),
});

export type GenerationMetadata = z.infer<typeof GenerationMetadataSchema>;

// ============================================================================
// FULL GENERATION RESULT
// ============================================================================

export interface GenerationResult {
  course_structure: CourseStructure;
  generation_metadata: GenerationMetadata;
}
```

### 2.2 Validation Examples

```typescript
// Example 1: Valid course structure
const validCourse: CourseStructure = {
  course_title: "Introduction to Machine Learning",
  course_description: "Learn the fundamentals of machine learning with hands-on Python examples",
  course_overview: "This comprehensive course covers supervised and unsupervised learning, neural networks, and practical applications. You'll build real projects and gain the skills to apply ML in your work.",
  target_audience: "Developers and data analysts with basic Python knowledge",
  estimated_duration_hours: 12.5,
  difficulty_level: "intermediate",
  prerequisites: [
    "Basic Python programming (variables, functions, loops)",
    "Understanding of statistics (mean, median, standard deviation)"
  ],
  learning_outcomes: [
    "Implement supervised learning algorithms from scratch",
    "Build and train neural networks using modern frameworks",
    "Evaluate model performance using appropriate metrics"
  ],
  assessment_strategy: {
    quiz_per_section: true,
    final_exam: false,
    practical_projects: 3,
    assessment_description: "Assessment through practical coding projects and section quizzes"
  },
  course_tags: ["machine-learning", "python", "data-science", "neural-networks", "supervised-learning"],
  sections: [
    {
      section_number: 1,
      section_title: "Introduction to ML Concepts",
      section_description: "Foundational machine learning concepts and terminology",
      learning_objectives: [
        "Define machine learning and its applications",
        "Distinguish between supervised and unsupervised learning"
      ],
      estimated_duration_minutes: 90,
      lessons: [
        {
          lesson_number: 1,
          lesson_title: "What is Machine Learning?",
          lesson_objectives: [
            "Explain machine learning in simple terms",
            "Identify real-world ML applications"
          ],
          key_topics: ["ML definition", "Types of ML", "Use cases", "Industry applications"],
          estimated_duration_minutes: 15,
          practical_exercises: [
            {
              exercise_type: "self_assessment",
              exercise_title: "ML Knowledge Check",
              exercise_description: "Test your understanding of basic ML concepts"
            },
            {
              exercise_type: "case_study",
              exercise_title: "Real-World ML Examples",
              exercise_description: "Analyze how major companies use machine learning"
            },
            {
              exercise_type: "discussion",
              exercise_title: "ML in Your Industry",
              exercise_description: "Discuss potential ML applications in your field"
            }
          ]
        },
        // ... more lessons (minimum 10 total across all sections)
      ]
    },
    // ... more sections
  ]
};

// Validate
const result = CourseStructureSchema.safeParse(validCourse);
if (!result.success) {
  console.error('Validation errors:', result.error.format());
} else {
  console.log('Course structure is valid!');
}

// Example 2: Invalid - too few lessons (FR-015 violation)
const invalidCourse = {
  // ... metadata
  sections: [
    {
      section_number: 1,
      // ... section metadata
      lessons: [
        // Only 5 lessons total - violates FR-015 minimum of 10
      ]
    }
  ]
};

const invalidResult = CourseStructureSchema.safeParse(invalidCourse);
// Result: { success: false, error: 'Course must have minimum 10 lessons...' }
```

---

## 3. Generation Job Schema (Input)

### 3.1 Job Parameters

**Location**: `packages/shared-types/src/generation-job.ts`

```typescript
import { z } from 'zod';
import { CourseStyleSchema } from './style-prompts';

// ============================================================================
// ANALYSIS RESULT (from Stage 4)
// ============================================================================

export const AnalysisResultSchema = z.object({
  // Phase 1: Classification
  category: z.string().describe('Course category (e.g., technical, business, creative)'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  contextual_language: z.string().describe('Target language for course content'),

  // Phase 2: Scope
  recommended_structure: z.object({
    total_sections: z.number().int().positive(),
    total_lessons: z.number().int().min(10), // FR-015 constraint
    sections_breakdown: z.array(z.object({
      area: z.string(),
      estimated_lessons: z.number().int().positive(),
    })),
  }),

  // Phase 3: Expert Analysis
  pedagogical_strategy: z.string(),
  needs_research: z.boolean(),
  expansion_areas: z.array(z.string()),

  // Phase 4: Synthesis
  final_scope_instructions: z.string(),

  // Phase 5: Topic Analysis
  determined_topic: z.string(),
  key_concepts: z.array(z.string()),

  // Phase 6: Content Strategy
  content_approach: z.enum(['expand', 'create_from_scratch']),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ============================================================================
// FRONTEND PARAMETERS (from courses table)
// ============================================================================

export const FrontendParametersSchema = z.object({
  // Required
  course_title: z.string().min(1).describe('Course title (ONLY guaranteed field per spec)'),

  // Optional (may be null/undefined)
  language: z.string().optional().describe('Target language (defaults to contextual_language from Analyze)'),
  style: CourseStyleSchema.optional().describe('Content style (defaults to conversational)'),
  target_audience: z.string().optional().describe('Target audience description'),

  // Guidance parameters (NOT constraints per spec.md clarifications)
  desired_lessons_count: z.number().int().positive().optional()
    .describe('User preference for lesson count (guidance, not constraint)'),

  desired_modules_count: z.number().int().positive().optional()
    .describe('User preference for module/section count (guidance, not constraint)'),

  lesson_duration_minutes: z.number().int().min(3).max(45).optional()
    .describe('Target duration per lesson (defaults to 5 minutes)'),

  // Constraints (MUST be satisfied)
  learning_outcomes: z.array(z.string()).optional()
    .describe('User-specified learning outcomes (constraints, not guidance)'),
});

export type FrontendParameters = z.infer<typeof FrontendParametersSchema>;

// ============================================================================
// GENERATION JOB INPUT
// ============================================================================

export const GenerationJobInputSchema = z.object({
  // Course identification
  course_id: z.string().uuid().describe('Course UUID'),
  organization_id: z.string().uuid().describe('Organization UUID (for RLS)'),
  user_id: z.string().uuid().describe('User UUID (for audit trail)'),

  // Input data (FR-001, FR-002)
  analysis_result: AnalysisResultSchema.nullable()
    .describe('Results from Stage 4 analysis (nullable for title-only scenario)'),

  frontend_parameters: FrontendParametersSchema
    .describe('Parameters from courses table'),

  // Optional RAG context (FR-004)
  vectorized_documents: z.boolean().default(false)
    .describe('Whether to use RAG context from uploaded documents'),

  document_summaries: z.array(z.object({
    file_id: z.string().uuid(),
    file_name: z.string(),
    summary: z.string(),
    key_topics: z.array(z.string()),
  })).optional().describe('Document summaries from file_catalog (if vectorized)'),
});

export type GenerationJobInput = z.infer<typeof GenerationJobInputSchema>;

// ============================================================================
// BULLMQ JOB DATA
// ============================================================================

export interface GenerationJobData {
  jobId: string; // BullMQ job ID
  input: GenerationJobInput;
  metadata: {
    created_at: string; // ISO 8601
    priority: number; // Tier-based priority
    attempt: number; // Current attempt (1-3)
  };
}
```

### 3.2 Input Examples

```typescript
// Example 1: Full Analyze results available
const fullInputJob: GenerationJobInput = {
  course_id: '123e4567-e89b-12d3-a456-426614174000',
  organization_id: '234e5678-e89b-12d3-a456-426614174000',
  user_id: '345e6789-e89b-12d3-a456-426614174000',

  analysis_result: {
    category: 'technical',
    difficulty: 'intermediate',
    contextual_language: 'Russian',
    recommended_structure: {
      total_sections: 8,
      total_lessons: 24,
      sections_breakdown: [
        { area: 'Introduction to Machine Learning', estimated_lessons: 3 },
        { area: 'Supervised Learning Algorithms', estimated_lessons: 4 },
        // ... 6 more sections
      ]
    },
    pedagogical_strategy: 'Hands-on, project-based learning with incremental complexity',
    needs_research: false,
    expansion_areas: ['Neural network architectures', 'Model deployment'],
    final_scope_instructions: 'Create comprehensive ML course with Python examples',
    determined_topic: 'Machine Learning Fundamentals',
    key_concepts: ['supervised learning', 'neural networks', 'model evaluation'],
    content_approach: 'expand',
  },

  frontend_parameters: {
    course_title: 'Introduction to Machine Learning',
    language: 'Russian',
    style: 'practical',
    target_audience: 'Developers with Python experience',
    desired_lessons_count: 25, // Guidance
    lesson_duration_minutes: 10,
    learning_outcomes: [ // Constraints
      'Implement ML algorithms from scratch',
      'Evaluate model performance',
    ],
  },

  vectorized_documents: true,
  document_summaries: [
    {
      file_id: '456e7890-e89b-12d3-a456-426614174000',
      file_name: 'ml_basics.pdf',
      summary: 'Comprehensive overview of supervised and unsupervised learning',
      key_topics: ['linear regression', 'k-means clustering', 'decision trees'],
    }
  ],
};

// Example 2: Title-only scenario (FR-003)
const titleOnlyJob: GenerationJobInput = {
  course_id: '123e4567-e89b-12d3-a456-426614174000',
  organization_id: '234e5678-e89b-12d3-a456-426614174000',
  user_id: '345e6789-e89b-12d3-a456-426614174000',

  analysis_result: null, // No Analyze results

  frontend_parameters: {
    course_title: 'Основы Python программирования', // Only guaranteed field
    // All other fields optional/missing
  },

  vectorized_documents: false,
};
```

---

## 4. Database Schema

### 4.1 Migration

**File**: `packages/course-gen-platform/supabase/migrations/20251105000000_stage5_generation.sql`

```sql
-- ============================================================================
-- Stage 5: Generation Phase Database Schema
-- Migration: 20251105000000_stage5_generation.sql
-- ============================================================================

-- Add generation_metadata column to courses table (FR-025)
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS generation_metadata JSONB;

-- Create index for generation metadata queries
CREATE INDEX IF NOT EXISTS idx_courses_generation_metadata
ON courses USING gin (generation_metadata);

-- Add comment for documentation
COMMENT ON COLUMN courses.generation_metadata IS
'Generation metadata tracking (FR-025): model_used, token_usage, cost_usd, quality_scores, batch_count, retry_count, timestamps';

-- ============================================================================
-- Update course_structure column comment (already exists from Stage 0)
-- ============================================================================

COMMENT ON COLUMN courses.course_structure IS
'Generated course structure JSON (FR-007): sections, lessons, exercises, metadata. Conforms to CourseStructureSchema from shared-types.';

-- ============================================================================
-- Validation helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_minimum_lessons(course_structure_json JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  total_lessons INTEGER;
BEGIN
  -- Count total lessons across all sections
  SELECT COALESCE(SUM((section->>'lessons')::JSONB->>'length'::INT), 0)
  INTO total_lessons
  FROM jsonb_array_elements(course_structure_json->'sections') AS section;

  -- FR-015: Minimum 10 lessons required
  RETURN total_lessons >= 10;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION validate_minimum_lessons IS
'Validates FR-015: Course must have minimum 10 lessons total across all sections';

-- ============================================================================
-- Sample generation_metadata structure (for reference)
-- ============================================================================

-- Example generation_metadata JSONB:
-- {
--   "model_used": {
--     "metadata": "qwen/qwen3-max",
--     "sections": "openai/gpt-oss-20b",
--     "validation": "openai/gpt-oss-120b"
--   },
--   "total_tokens": {
--     "metadata": 5234,
--     "sections": 45678,
--     "validation": 1234,
--     "total": 52146
--   },
--   "cost_usd": 0.28,
--   "duration_ms": {
--     "metadata": 8500,
--     "sections": 95000,
--     "validation": 3200,
--     "total": 106700
--   },
--   "quality_scores": {
--     "metadata_similarity": 0.89,
--     "sections_similarity": [0.87, 0.92, 0.85, 0.90, 0.88, 0.91, 0.86, 0.89],
--     "overall": 0.88
--   },
--   "batch_count": 8,
--   "retry_count": {
--     "metadata": 0,
--     "sections": [0, 0, 1, 0, 0, 0, 0, 0]
--   },
--   "created_at": "2025-11-05T12:34:56.789Z"
-- }
```

### 4.2 Database Queries

```typescript
// Query 1: Fetch course for generation
const { data: course } = await supabase
  .from('courses')
  .select(`
    id,
    title,
    language,
    style,
    settings,
    analysis_result,
    organization_id,
    user_id
  `)
  .eq('id', courseId)
  .single();

// Query 2: Save generated course structure
const { error } = await supabase
  .from('courses')
  .update({
    course_structure: courseStructure, // CourseStructure type
    generation_metadata: generationMetadata, // GenerationMetadata type
    status: 'content_generated',
    updated_at: new Date().toISOString(),
  })
  .eq('id', courseId);

// Query 3: Get generation statistics (admin analytics)
const { data: stats } = await supabase
  .from('courses')
  .select(`
    id,
    title,
    generation_metadata->model_used->metadata as metadata_model,
    generation_metadata->total_tokens->total as total_tokens,
    generation_metadata->cost_usd as cost,
    generation_metadata->quality_scores->overall as quality,
    generation_metadata->duration_ms->total as duration_ms
  `)
  .not('generation_metadata', 'is', null)
  .gte('created_at', '2025-11-01')
  .order('created_at', { ascending: false });
```

---

## 5. Style Prompts Schema

### 5.1 Type Definitions

**Location**: `packages/shared-types/src/style-prompts.ts`

```typescript
import { z } from 'zod';

// ============================================================================
// STYLE ENUMERATION (21 styles from workflows n8n/style.js)
// ============================================================================

export const COURSE_STYLES = [
  'academic',
  'conversational',
  'storytelling',
  'practical',
  'motivational',
  'visual',
  'gamified',
  'minimalist',
  'research',
  'engaging',
  'professional',
  'socratic',
  'problem_based',
  'collaborative',
  'technical',
  'microlearning',
  'inspirational',
  'interactive',
  'analytical',
] as const;

export type CourseStyle = typeof COURSE_STYLES[number];

export const CourseStyleSchema = z.enum(COURSE_STYLES);

// ============================================================================
// STYLE PROMPT DEFINITIONS (ported from workflows n8n/style.js)
// ============================================================================

export const STYLE_PROMPTS: Record<CourseStyle, string> = {
  academic: "Write with scholarly rigor and theoretical depth. Present multiple perspectives with critical analysis. Use formal academic language, define terminology precisely, include theoretical frameworks. Structure arguments with clear thesis statements supported by evidence. Maintain objective tone through passive voice constructions.",

  conversational: "Write as friendly dialogue with the reader. Use personal pronouns 'you' and 'we' throughout. Include relatable everyday analogies and real-life examples. Ask rhetorical questions to engage. Keep sentences short and paragraphs scannable. Maintain warm, approachable tone like explaining to a curious friend.",

  storytelling: "Structure lessons as compelling narratives with characters facing real challenges. Begin with intriguing hooks, build tension through conflict, resolve with learning moments. Weave theoretical concepts naturally into story progression. Create emotional connections that make abstract concepts memorable through concrete scenarios.",

  practical: "Focus entirely on actionable implementation. Provide step-by-step instructions, numbered procedures, and clear checklists. Use imperative mood: 'Open the file', 'Click here', 'Run this command'. Include troubleshooting sections for common problems. Minimize theory, maximize hands-on application with immediate results.",

  motivational: "Write with infectious enthusiasm and empowering energy. Include success stories and transformation examples. Frame challenges as exciting opportunities for growth. Use phrases like 'You're capable of amazing things', 'Every expert started here'. Build confidence through positive reinforcement and celebration of small wins.",

  visual: "Create vivid mental images through rich descriptive language. Use spatial metaphors and visual analogies: 'Think of memory as a filing cabinet'. Paint detailed word pictures that help readers see concepts. Describe abstract ideas through concrete visual scenes, diagrams, and spatial relationships.",

  gamified: "Transform learning into an adventure game. Frame content as quests, missions, and challenges to complete. Use gaming language: 'Level up your skills', 'Achievement unlocked', 'Boss battle ahead'. Create sense of progression with experience points and skill trees. Make failure fun with 'Game Over - Try Again!' attitude.",

  minimalist: "Strip content to absolute essentials. Short declarative sentences. Core concepts only. No elaboration unless critical. Direct statements without qualification. Each paragraph delivers one complete idea. Eliminate adjectives, adverbs, and filler words. Maximum clarity through minimum complexity.",

  research: "Guide learning through strategic inquiry and investigation. Start with thought-provoking questions: 'What would happen if...?', 'Why do you think...?'. Present hypotheses to test, experiments to try. Encourage critical thinking by challenging assumptions. Balance open-ended exploration with evidence-based conclusions.",

  engaging: "Hook readers instantly with surprising facts, paradoxes, or 'Did you know?' moments. Create curiosity gaps that demand resolution. Use cliffhangers between sections: 'But there's a catch...'. Make content personally relevant: 'This could save you hours'. Include interactive moments: 'Stop and try this before reading on'.",

  professional: "Adopt corporate tone focusing on business value and ROI. Emphasize industry best practices, case studies from Fortune 500 companies. Use executive language: strategic advantages, core competencies, value propositions. Structure with executive summaries and actionable takeaways for implementation.",

  socratic: "Never give direct answers, guide discovery through questions. Use progressive questioning to lead learners to insights. 'What do you notice about...?', 'How might this relate to...?'. Let students uncover principles themselves. Build understanding layer by layer through guided inquiry.",

  problem_based: "Start every section with real-world problem scenario. Present symptoms and context first, then guide through diagnostic process. Explore multiple solution paths with trade-offs. Use case study format: situation, complication, resolution. Include decision points where readers choose approach.",

  collaborative: "Write for group learning contexts. Include instructions for peer discussions: 'Share with your partner', 'Debate in groups'. Suggest team exercises and collaborative projects. Create opportunities for knowledge exchange. Use inclusive language that assumes multiple learners working together.",

  technical: "Prioritize precision and technical accuracy above all. Include exact specifications, code snippets, mathematical formulas. Use proper technical terminology without simplification. Focus on system architecture, algorithms, and implementation details. Assume reader comfort with technical complexity.",

  microlearning: "Deliver ultra-focused micro-lessons on single concepts. Each lesson standalone and immediately applicable. Use memorable mnemonics and rules of thumb. Create quick wins and instant value. Design for 2-3 minute consumption during coffee breaks.",

  inspirational: "Ignite passion for learning and transformation. Paint vivid pictures of future possibilities: 'Imagine yourself in one year...'. Share stories of ordinary people achieving extraordinary results. Use uplifting language that sparks dreams and ambitions. Focus on unlimited potential and life-changing outcomes.",

  interactive: "Demand constant reader participation and engagement. Embed exercises directly in text: 'Before reading further, write down...'. Include self-assessments, reflection prompts, and hands-on activities. Never let reader be passive consumer. Create dialogue through anticipated questions and responses.",

  analytical: "Approach topics through data and logical analysis. Present statistics, metrics, and quantifiable evidence. Build arguments through systematic reasoning and cause-effect relationships. Use structured analytical frameworks. Break complex systems into components for detailed examination.",
};

// ============================================================================
// STYLE HELPER FUNCTIONS
// ============================================================================

export function getStylePrompt(style?: string | null): string {
  // Validate and normalize style
  const result = CourseStyleSchema.safeParse(style);

  if (!result.success) {
    console.warn(`Invalid style "${style}", defaulting to conversational`);
    return STYLE_PROMPTS.conversational;
  }

  return STYLE_PROMPTS[result.data];
}

export function getAllStyles(): CourseStyle[] {
  return [...COURSE_STYLES];
}

export function isValidStyle(style: string): style is CourseStyle {
  return CourseStyleSchema.safeParse(style).success;
}
```

---

## 6. Type Exports

### 6.1 Shared Types Index

**Location**: `packages/shared-types/src/index.ts`

```typescript
// ============================================================================
// Stage 5 - Generation Phase Types
// ============================================================================

export {
  // Course Structure
  type CourseStructure,
  type Section,
  type Lesson,
  type PracticalExercise,
  type ExerciseType,
  type DifficultyLevel,
  type AssessmentStrategy,
  CourseStructureSchema,
  SectionSchema,
  LessonSchema,
  PracticalExerciseSchema,
  ExerciseTypeSchema,
  DifficultyLevelSchema,
  AssessmentStrategySchema,
  EXERCISE_TYPES,

  // Generation Metadata
  type GenerationMetadata,
  type ModelUsage,
  type TokenUsage,
  type Duration,
  type QualityScores,
  type RetryCount,
  GenerationMetadataSchema,
  ModelUsageSchema,
  TokenUsageSchema,
  DurationSchema,
  QualityScoresSchema,
  RetryCountSchema,

  // Generation Job
  type GenerationJobInput,
  type GenerationJobData,
  type AnalysisResult,
  type FrontendParameters,
  GenerationJobInputSchema,
  AnalysisResultSchema,
  FrontendParametersSchema,

  // Generation Result
  type GenerationResult,

  // Style Prompts
  type CourseStyle,
  CourseStyleSchema,
  COURSE_STYLES,
  STYLE_PROMPTS,
  getStylePrompt,
  getAllStyles,
  isValidStyle,
} from './generation-result';
```

---

## 7. Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        STAGE 5 DATA FLOW                          │
└──────────────────────────────────────────────────────────────────┘

INPUT (from BullMQ job):
┌────────────────────────┐
│ GenerationJobInput     │
│ ┌────────────────────┐ │
│ │ course_id          │ │
│ │ organization_id    │ │
│ │ user_id            │ │
│ │                    │ │
│ │ analysis_result    │ │◄──── Stage 4 output (nullable)
│ │ frontend_parameters│ │◄──── courses table
│ │ vectorized_docs    │ │◄──── file_catalog
│ └────────────────────┘ │
└────────────────────────┘
           │
           ↓
┌────────────────────────────────────────────────────────────────┐
│                   LANGRAPH ORCHESTRATOR                         │
│                                                                 │
│  Phase 1: Metadata Generation (qwen3-max)                      │
│  ├─ course_title, course_description, learning_outcomes        │
│  └─ Output: Course metadata                                    │
│                                                                 │
│  Phase 2: Section Batch Generation (OSS 20B, parallel)         │
│  ├─ SECTIONS_PER_BATCH = 1                                     │
│  ├─ PARALLEL_BATCH_SIZE = 2                                    │
│  └─ Output: sections[] with lessons[]                          │
│                                                                 │
│  Phase 3: Quality Validation (Jina-v3)                         │
│  ├─ Semantic similarity scoring                                │
│  └─ Output: quality_scores                                     │
│                                                                 │
│  Phase 4: Minimum Lessons Validation (FR-015)                  │
│  ├─ Count total lessons across sections                        │
│  └─ Retry if < 10 lessons                                      │
│                                                                 │
│  Phase 5: Database Commit                                      │
│  ├─ XSS sanitization (DOMPurify)                               │
│  └─ Atomic JSONB update                                        │
└────────────────────────────────────────────────────────────────┘
           │
           ↓
OUTPUT (to database):
┌────────────────────────┐
│ GenerationResult       │
│ ┌────────────────────┐ │
│ │ course_structure   │ │──► courses.course_structure JSONB
│ │ ├─ metadata        │ │
│ │ ├─ sections[]      │ │
│ │ │  └─ lessons[]    │ │
│ │ │     └─ exercises│ │
│ │                    │ │
│ │ generation_metadata│ │──► courses.generation_metadata JSONB
│ │ ├─ model_used      │ │
│ │ ├─ total_tokens    │ │
│ │ ├─ cost_usd        │ │
│ │ ├─ quality_scores  │ │
│ │ └─ timestamps      │ │
│ └────────────────────┘ │
└────────────────────────┘
```

---

## 8. Summary

### 8.1 Key Decisions

✅ **Zod Schemas**: All data structures use Zod for runtime validation
✅ **Type Safety**: TypeScript types auto-generated from Zod schemas
✅ **FR-015 Validation**: Custom refine function enforces minimum 10 lessons
✅ **Style Integration**: 21 styles ported to TypeScript with type safety
✅ **Generation Metadata**: Comprehensive tracking per FR-025
✅ **Lesson Technical Specs**: FR-011 fields for Stage 6 compatibility

### 8.2 Files Created

- `packages/shared-types/src/generation-result.ts` (core schemas)
- `packages/shared-types/src/generation-job.ts` (input schemas)
- `packages/shared-types/src/style-prompts.ts` (style definitions)
- `packages/course-gen-platform/supabase/migrations/20251105000000_stage5_generation.sql` (database)

### 8.3 Next Steps

➡️ Generate `contracts/` (tRPC generation endpoints)
➡️ Generate `quickstart.md` (developer onboarding)
➡️ Update agent context (claude.md)
