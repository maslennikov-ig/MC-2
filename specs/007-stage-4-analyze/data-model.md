# Data Model: Stage 4 Analysis

**Feature**: Course Content Analysis (Stage 4)
**Date**: 2025-10-31
**Status**: Design Complete

## Overview

Stage 4 introduces minimal new database schema (1 table + 1 JSONB column). Most infrastructure reuses existing tables from Stages 0-3. This document defines:

1. New database tables and migrations
2. Analysis result structure (JSONB)
3. Job payload structure (BullMQ)
4. TypeScript types and Zod schemas
5. Relationships with existing tables

## 1. Database Schema

### 1.1 New Table: `llm_model_config`

**Purpose**: Store per-phase LLM model configuration with global defaults + per-course overrides.

```sql
CREATE TABLE llm_model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type TEXT NOT NULL CHECK (config_type IN ('global', 'course_override')),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE, -- NULL for global config
  phase_name TEXT NOT NULL CHECK (phase_name IN (
    'phase_1_classification',
    'phase_2_scope',
    'phase_3_expert',
    'phase_4_synthesis',
    'emergency'
  )),
  model_id TEXT NOT NULL, -- e.g., 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'
  fallback_model_id TEXT, -- Fallback if primary model fails
  temperature NUMERIC(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER DEFAULT 4096 CHECK (max_tokens > 0 AND max_tokens <= 200000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_global_phase UNIQUE (config_type, phase_name) WHERE config_type = 'global',
  CONSTRAINT unique_course_phase UNIQUE (course_id, phase_name) WHERE config_type = 'course_override',
  CONSTRAINT course_override_requires_course_id CHECK (
    (config_type = 'course_override' AND course_id IS NOT NULL) OR
    (config_type = 'global' AND course_id IS NULL)
  )
);

CREATE INDEX idx_llm_model_config_course ON llm_model_config(course_id) WHERE course_id IS NOT NULL;
CREATE INDEX idx_llm_model_config_phase ON llm_model_config(phase_name);

COMMENT ON TABLE llm_model_config IS 'Per-phase LLM model configuration for Stage 4 analysis. Supports global defaults and per-course overrides for troubleshooting.';
COMMENT ON COLUMN llm_model_config.config_type IS 'Type of configuration: global (default for all courses) or course_override (specific course)';
COMMENT ON COLUMN llm_model_config.phase_name IS 'Analysis phase: phase_1_classification, phase_2_scope, phase_3_expert, phase_4_synthesis, or emergency';
COMMENT ON COLUMN llm_model_config.model_id IS 'OpenRouter model identifier (e.g., openai/gpt-oss-20b)';
COMMENT ON COLUMN llm_model_config.fallback_model_id IS 'Model to use if primary model fails (quality-based escalation)';

-- Insert default global configuration
INSERT INTO llm_model_config (config_type, phase_name, model_id, fallback_model_id, temperature) VALUES
  ('global', 'phase_1_classification', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 0.7),
  ('global', 'phase_2_scope', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 0.7),
  ('global', 'phase_3_expert', 'openai/gpt-oss-120b', 'google/gemini-2.5-flash', 0.7),
  ('global', 'phase_4_synthesis', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 0.7), -- Will be overridden by adaptive logic
  ('global', 'emergency', 'google/gemini-2.5-flash', NULL, 0.7)
ON CONFLICT DO NOTHING;
```

**Row-Level Security** (RLS):
```sql
-- Only SuperAdmin can modify global config
ALTER TABLE llm_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY llm_model_config_superadmin_all ON llm_model_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::TEXT = 'superadmin'
    )
  );

CREATE POLICY llm_model_config_read_global ON llm_model_config
  FOR SELECT
  USING (config_type = 'global');

CREATE POLICY llm_model_config_read_course_override ON llm_model_config
  FOR SELECT
  USING (
    config_type = 'course_override'
    AND EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = llm_model_config.course_id
      AND courses.organization_id = (auth.jwt()->>'organization_id')::UUID
    )
  );
```

### 1.2 Extended Table: `courses`

**New Column**: `analysis_result` (JSONB)

```sql
ALTER TABLE courses ADD COLUMN IF NOT EXISTS analysis_result JSONB;

CREATE INDEX idx_courses_analysis_result_gin ON courses USING GIN (analysis_result);

COMMENT ON COLUMN courses.analysis_result IS 'Stage 4 analysis output (JSONB): course category, contextual language, topic analysis, recommended structure, pedagogical strategy, scope instructions, research flags';
```

**Structure** (see section 2 below for detailed schema).

### 1.3 Existing Tables (No Changes)

**Reused from previous stages**:

- `courses`: Course metadata (title, slug, user_id, organization_id, status, generation_progress, language, style, answers, etc.)
- `file_catalog`: Document tracking with `processing_status` and `processed_content` (Stage 3 barrier validation)
- `job_status`: BullMQ job tracking (inherited from Stage 0)
- `system_metrics`: Observability (inherited from Stage 1)

**No changes required** - Stage 4 integrates seamlessly with existing schema.

## 2. Analysis Result Structure (JSONB)

### 2.1 TypeScript Interface

```typescript
export interface AnalysisResult {
  // Course categorization (Phase 1)
  course_category: {
    primary: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic';
    confidence: number; // 0-1
    reasoning: string;
    secondary?: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic' | null;
  };

  // Category-specific motivational language (Phase 1)
  contextual_language: {
    why_matters_context: string; // 50-300 chars, TARGET: 100
    motivators: string; // 100-600 chars, TARGET: 200
    experience_prompt: string; // 100-600 chars, TARGET: 200
    problem_statement_context: string; // 50-300 chars, TARGET: 100
    knowledge_bridge: string; // 100-600 chars, TARGET: 200
    practical_benefit_focus: string; // 100-600 chars, TARGET: 200
  };

  // Topic analysis (Phase 1-2)
  topic_analysis: {
    determined_topic: string; // 3-200 chars
    information_completeness: number; // 0-100%
    complexity: 'narrow' | 'medium' | 'broad';
    reasoning: string; // Min 50 chars
    target_audience: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
    missing_elements: string[] | null;
    key_concepts: string[]; // 3-10 items
    domain_keywords: string[]; // 5-15 items
  };

  // Scope and structure recommendations (Phase 2)
  recommended_structure: {
    estimated_content_hours: number; // 0.5-200h
    scope_reasoning: string; // 100-500 chars
    lesson_duration_minutes: number; // 3-45 minutes
    calculation_explanation: string; // 50-300 chars
    total_lessons: number; // 10-100 (enforced minimum: 10)
    total_sections: number; // 1-30
    scope_warning: string | null; // Optional warning if scope borderline
    sections_breakdown: SectionBreakdown[]; // Detailed section plan
  };

  // Pedagogical strategy (Phase 3)
  pedagogical_strategy: {
    teaching_style: 'hands-on' | 'theory-first' | 'project-based' | 'mixed';
    assessment_approach: string; // 50-200 chars
    practical_focus: 'high' | 'medium' | 'low';
    progression_logic: string; // 100-500 chars
    interactivity_level: 'high' | 'medium' | 'low';
  };

  // Generation prompt for Stage 5 (Phase 5)
  scope_instructions: string; // 100-800 chars

  // Content strategy (Phase 5)
  content_strategy: 'create_from_scratch' | 'expand_and_enhance' | 'optimize_existing';

  // Optional expansion areas (Phase 3)
  expansion_areas: ExpansionArea[] | null;

  // Research flags for time-sensitive content (Phase 3)
  research_flags: ResearchFlag[]; // Can be empty array

  // Metadata (all phases)
  metadata: {
    analysis_version: string; // e.g., 'v1.0.0'
    total_duration_ms: number;
    phase_durations_ms: Record<string, number>; // e.g., { phase_1: 5000, phase_2: 8000, ... }
    model_usage: Record<string, string>; // e.g., { phase_1: 'openai/gpt-oss-20b', phase_3: 'openai/gpt-oss-120b' }
    total_tokens: { input: number; output: number; total: number };
    total_cost_usd: number;
    retry_count: number; // Total retries across all phases
    quality_scores: Record<string, number>; // Semantic similarity scores per phase (0-1)
    created_at: string; // ISO 8601 timestamp
  };
}

export interface SectionBreakdown {
  area: string; // Section name/topic
  estimated_lessons: number; // Min 1
  importance: 'core' | 'important' | 'optional';
  learning_objectives: string[]; // 2-5 items
  key_topics: string[]; // 3-8 items
  pedagogical_approach: string; // 50-200 chars
  difficulty_progression: 'flat' | 'gradual' | 'steep';
}

export interface ExpansionArea {
  area: string; // Topic needing more detail
  priority: 'critical' | 'important' | 'nice-to-have';
  specific_requirements: string[]; // 1-5 items
  estimated_lessons: number; // 1-10
}

export interface ResearchFlag {
  topic: string; // e.g., "Постановление 1875"
  reason: string; // e.g., "regulation_updates"
  context: string; // Why this needs research (50-200 chars)
}
```

### 2.2 Zod Schema

```typescript
import { z } from 'zod';

export const ResearchFlagSchema = z.object({
  topic: z.string().min(3).max(100),
  reason: z.string().min(3).max(50),
  context: z.string().min(50).max(200),
});

export const ExpansionAreaSchema = z.object({
  area: z.string().min(3).max(100),
  priority: z.enum(['critical', 'important', 'nice-to-have']),
  specific_requirements: z.array(z.string()).min(1).max(5),
  estimated_lessons: z.number().int().min(1).max(10),
});

export const SectionBreakdownSchema = z.object({
  area: z.string().min(3).max(100),
  estimated_lessons: z.number().int().min(1),
  importance: z.enum(['core', 'important', 'optional']),
  learning_objectives: z.array(z.string()).min(2).max(5),
  key_topics: z.array(z.string()).min(3).max(8),
  pedagogical_approach: z.string().min(50).max(200),
  difficulty_progression: z.enum(['flat', 'gradual', 'steep']),
});

export const AnalysisResultSchema = z.object({
  course_category: z.object({
    primary: z.enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic']),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().min(50).max(200),
    secondary: z.enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic']).optional().nullable(),
  }),

  contextual_language: z.object({
    why_matters_context: z.string().min(50).max(300),
    motivators: z.string().min(100).max(600),
    experience_prompt: z.string().min(100).max(600),
    problem_statement_context: z.string().min(50).max(300),
    knowledge_bridge: z.string().min(100).max(600),
    practical_benefit_focus: z.string().min(100).max(600),
  }),

  topic_analysis: z.object({
    determined_topic: z.string().min(3).max(200),
    information_completeness: z.number().min(0).max(100),
    complexity: z.enum(['narrow', 'medium', 'broad']),
    reasoning: z.string().min(50),
    target_audience: z.enum(['beginner', 'intermediate', 'advanced', 'mixed']),
    missing_elements: z.array(z.string()).nullable(),
    key_concepts: z.array(z.string()).min(3).max(10),
    domain_keywords: z.array(z.string()).min(5).max(15),
  }),

  recommended_structure: z.object({
    estimated_content_hours: z.number().min(0.5).max(200),
    scope_reasoning: z.string().min(100).max(500),
    lesson_duration_minutes: z.number().int().min(3).max(45),
    calculation_explanation: z.string().min(50).max(300),
    total_lessons: z.number().int().min(10).max(100),
    total_sections: z.number().int().min(1).max(30),
    scope_warning: z.string().nullable().optional(),
    sections_breakdown: z.array(SectionBreakdownSchema),
  }),

  pedagogical_strategy: z.object({
    teaching_style: z.enum(['hands-on', 'theory-first', 'project-based', 'mixed']),
    assessment_approach: z.string().min(50).max(200),
    practical_focus: z.enum(['high', 'medium', 'low']),
    progression_logic: z.string().min(100).max(500),
    interactivity_level: z.enum(['high', 'medium', 'low']),
  }),

  scope_instructions: z.string().min(100).max(800),
  content_strategy: z.enum(['create_from_scratch', 'expand_and_enhance', 'optimize_existing']),
  expansion_areas: z.array(ExpansionAreaSchema).nullable().optional(),
  research_flags: z.array(ResearchFlagSchema),

  metadata: z.object({
    analysis_version: z.string(),
    total_duration_ms: z.number().int().min(0),
    phase_durations_ms: z.record(z.number().int()),
    model_usage: z.record(z.string()),
    total_tokens: z.object({
      input: z.number().int().min(0),
      output: z.number().int().min(0),
      total: z.number().int().min(0),
    }),
    total_cost_usd: z.number().min(0),
    retry_count: z.number().int().min(0),
    quality_scores: z.record(z.number().min(0).max(1)),
    created_at: z.string().datetime(),
  }),
});
```

## 3. Job Payload Structure (BullMQ)

### 3.1 STRUCTURE_ANALYSIS Job

```typescript
export interface StructureAnalysisJob {
  course_id: string; // UUID
  organization_id: string; // UUID (for RLS)
  user_id: string; // UUID (for audit trail)

  // Input data (from courses table)
  input: {
    topic: string;
    language: string; // Target language for final course (e.g., 'ru', 'en')
    style: string; // e.g., 'professional', 'conversational'
    answers?: string; // Optional user requirements
    target_audience: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
    difficulty: string;
    lesson_duration_minutes: number; // 3-45
    document_summaries?: DocumentSummary[]; // From Stage 3
  };

  // Metadata
  priority: number; // Tier-based (FREE=1, PREMIUM=10)
  attempt_count: number; // Retry tracking
  created_at: string; // ISO 8601
}

export interface DocumentSummary {
  document_id: string;
  file_name: string;
  processed_content: string; // Summary from Stage 3
  processing_method: 'bypass' | 'detailed' | 'balanced' | 'aggressive';
  summary_metadata: {
    original_tokens: number;
    summary_tokens: number;
    compression_ratio: number;
    quality_score: number;
  };
}
```

### 3.2 Job Result

```typescript
export interface StructureAnalysisJobResult {
  success: boolean;
  course_id: string;
  analysis_result?: AnalysisResult; // Full result if success
  error?: {
    code: string; // e.g., 'BARRIER_FAILED', 'MINIMUM_LESSONS_NOT_MET', 'LLM_ERROR'
    message: string;
    phase?: string; // Which phase failed
    details?: Record<string, any>;
  };
  metadata: {
    total_duration_ms: number;
    retry_count: number;
    completed_at: string; // ISO 8601
  };
}
```

## 4. Phase-Specific Data Structures

### 4.1 Phase 1 Output (Classification)

```typescript
export interface Phase1Output {
  course_category: {
    primary: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic';
    confidence: number;
    reasoning: string;
    secondary?: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic' | null;
  };
  contextual_language: {
    why_matters_context: string;
    motivators: string;
    experience_prompt: string;
    problem_statement_context: string;
    knowledge_bridge: string;
    practical_benefit_focus: string;
  };
  topic_analysis: {
    determined_topic: string;
    information_completeness: number;
    complexity: 'narrow' | 'medium' | 'broad';
    reasoning: string;
    target_audience: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
    missing_elements: string[] | null;
    key_concepts: string[];
    domain_keywords: string[];
  };
  phase_metadata: {
    duration_ms: number;
    model_used: string;
    tokens: { input: number; output: number; total: number };
    quality_score: number;
    retry_count: number;
  };
}
```

### 4.2 Phase 2 Output (Scope)

```typescript
export interface Phase2Output {
  recommended_structure: {
    estimated_content_hours: number;
    scope_reasoning: string;
    lesson_duration_minutes: number;
    calculation_explanation: string;
    total_lessons: number;
    total_sections: number;
    scope_warning: string | null;
    sections_breakdown: SectionBreakdown[];
  };
  phase_metadata: {
    duration_ms: number;
    model_used: string;
    tokens: { input: number; output: number; total: number };
    quality_score: number;
    retry_count: number;
  };
}
```

### 4.3 Phase 3 Output (Expert Analysis)

```typescript
export interface Phase3Output {
  pedagogical_strategy: {
    teaching_style: 'hands-on' | 'theory-first' | 'project-based' | 'mixed';
    assessment_approach: string;
    practical_focus: 'high' | 'medium' | 'low';
    progression_logic: string;
    interactivity_level: 'high' | 'medium' | 'low';
  };
  expansion_areas: ExpansionArea[] | null;
  research_flags: ResearchFlag[];
  phase_metadata: {
    duration_ms: number;
    model_used: string; // Always 120B for Phase 3
    tokens: { input: number; output: number; total: number };
    quality_score: number;
    retry_count: number;
  };
}
```

### 4.4 Phase 4 Output (Synthesis)

```typescript
export interface Phase4Output {
  scope_instructions: string;
  content_strategy: 'create_from_scratch' | 'expand_and_enhance' | 'optimize_existing';
  phase_metadata: {
    duration_ms: number;
    model_used: string; // Adaptive: 20B or 120B based on document count
    tokens: { input: number; output: number; total: number };
    quality_score: number;
    retry_count: number;
    document_count: number;
  };
}
```

## 5. Entity Relationships

```
┌─────────────────────┐
│      courses        │
│---------------------|
│ id (PK)             │
│ organization_id (FK)│
│ user_id (FK)        │
│ title               │
│ slug                │
│ language            │◄─────┐
│ style               │      │
│ answers             │      │
│ generation_progress │      │
│ analysis_result ────┼──────┤ JSONB: AnalysisResult
│ ...                 │      │
└─────────────────────┘      │
         │                   │
         │ 1:N               │
         ▼                   │
┌─────────────────────┐      │
│   file_catalog      │      │
│---------------------|      │
│ id (PK)             │      │
│ course_id (FK) ─────┤      │
│ processing_status   │      │ (Stage 3 barrier check)
│ processed_content   │      │
│ ...                 │      │
└─────────────────────┘      │
                             │
┌─────────────────────┐      │
│ llm_model_config    │      │
│---------------------|      │
│ id (PK)             │      │
│ config_type         │      │ ('global' | 'course_override')
│ course_id (FK) ─────┤      │ (nullable for global)
│ phase_name          │      │
│ model_id            │      │
│ fallback_model_id   │      │
│ temperature         │      │
│ max_tokens          │      │
│ ...                 │      │
└─────────────────────┘      │
                             │
┌─────────────────────┐      │
│    job_status       │      │
│---------------------|      │
│ id (PK)             │      │
│ course_id (FK) ─────┼──────┘
│ job_type            │ ('STRUCTURE_ANALYSIS')
│ status              │
│ payload             │ (JSONB: StructureAnalysisJob)
│ result              │ (JSONB: StructureAnalysisJobResult)
│ ...                 │
└─────────────────────┘
```

## 6. Database Migrations

### Migration 1: `20251031100000_stage4_model_config.sql`

```sql
-- Create llm_model_config table
CREATE TABLE llm_model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type TEXT NOT NULL CHECK (config_type IN ('global', 'course_override')),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL CHECK (phase_name IN (
    'phase_1_classification',
    'phase_2_scope',
    'phase_3_expert',
    'phase_4_synthesis',
    'emergency'
  )),
  model_id TEXT NOT NULL,
  fallback_model_id TEXT,
  temperature NUMERIC(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER DEFAULT 4096 CHECK (max_tokens > 0 AND max_tokens <= 200000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_global_phase UNIQUE (config_type, phase_name) WHERE config_type = 'global',
  CONSTRAINT unique_course_phase UNIQUE (course_id, phase_name) WHERE config_type = 'course_override',
  CONSTRAINT course_override_requires_course_id CHECK (
    (config_type = 'course_override' AND course_id IS NOT NULL) OR
    (config_type = 'global' AND course_id IS NULL)
  )
);

CREATE INDEX idx_llm_model_config_course ON llm_model_config(course_id) WHERE course_id IS NOT NULL;
CREATE INDEX idx_llm_model_config_phase ON llm_model_config(phase_name);

COMMENT ON TABLE llm_model_config IS 'Per-phase LLM model configuration for Stage 4 analysis';

-- RLS policies
ALTER TABLE llm_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY llm_model_config_superadmin_all ON llm_model_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::TEXT = 'superadmin'
    )
  );

CREATE POLICY llm_model_config_read_global ON llm_model_config
  FOR SELECT
  USING (config_type = 'global');

CREATE POLICY llm_model_config_read_course_override ON llm_model_config
  FOR SELECT
  USING (
    config_type = 'course_override'
    AND EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = llm_model_config.course_id
      AND courses.organization_id = (auth.jwt()->>'organization_id')::UUID
    )
  );

-- Insert default global configuration
INSERT INTO llm_model_config (config_type, phase_name, model_id, fallback_model_id, temperature) VALUES
  ('global', 'phase_1_classification', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 0.7),
  ('global', 'phase_2_scope', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 0.7),
  ('global', 'phase_3_expert', 'openai/gpt-oss-120b', 'google/gemini-2.5-flash', 0.7),
  ('global', 'phase_4_synthesis', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 0.7),
  ('global', 'emergency', 'google/gemini-2.5-flash', NULL, 0.7)
ON CONFLICT DO NOTHING;
```

### Migration 2: `20251031110000_stage4_analysis_fields.sql`

```sql
-- Add analysis_result column to courses table
ALTER TABLE courses ADD COLUMN IF NOT EXISTS analysis_result JSONB;

CREATE INDEX idx_courses_analysis_result_gin ON courses USING GIN (analysis_result);

COMMENT ON COLUMN courses.analysis_result IS 'Stage 4 analysis output (JSONB): course category, contextual language, topic analysis, recommended structure, pedagogical strategy, scope instructions, research flags';
```

## Summary

**New Tables**: 1 (`llm_model_config`)
**Modified Tables**: 1 (`courses` - added `analysis_result` JSONB column)
**New Indexes**: 3 (2 on `llm_model_config`, 1 GIN on `courses.analysis_result`)
**RLS Policies**: 3 (llm_model_config access control)

**Reused Infrastructure**:
- `courses` table (metadata, generation_progress)
- `file_catalog` table (Stage 3 barrier validation)
- `job_status` table (BullMQ job tracking)
- `system_metrics` table (observability)

**TypeScript Types**: 15+ interfaces/types
**Zod Schemas**: 5+ validation schemas

Stage 4 integrates seamlessly with existing database schema while introducing minimal new structure for model configuration flexibility.
