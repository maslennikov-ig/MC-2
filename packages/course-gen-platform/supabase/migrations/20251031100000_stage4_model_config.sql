-- Migration: Stage 4 Analysis - LLM Model Configuration
-- Purpose: Create llm_model_config table for per-phase LLM model configuration
-- Date: 2025-10-31
-- Related: specs/007-stage-4-analyze/data-model.md section 1.1

-- ============================================================================
-- Table: llm_model_config
-- ============================================================================
-- Purpose: Store per-phase LLM model configuration with global defaults
--          and per-course overrides for Stage 4 analysis phases.
--
-- Design:
--   - Global config: One row per phase (config_type='global', course_id=NULL)
--   - Course override: Per-course customization (config_type='course_override')
--   - Quality escalation: fallback_model_id for automatic retries
--   - Multi-tenant isolation: RLS policies enforce organization boundaries
-- ============================================================================

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

  -- Enforce course_id constraints based on config_type
  CONSTRAINT course_override_requires_course_id CHECK (
    (config_type = 'course_override' AND course_id IS NOT NULL) OR
    (config_type = 'global' AND course_id IS NULL)
  )
);

-- Partial unique index: Ensure only one global config per phase
CREATE UNIQUE INDEX unique_global_phase ON llm_model_config(config_type, phase_name) WHERE config_type = 'global';

-- Partial unique index: Ensure only one course override per phase per course
CREATE UNIQUE INDEX unique_course_phase ON llm_model_config(course_id, phase_name) WHERE config_type = 'course_override';

-- ============================================================================
-- Indexes
-- ============================================================================

-- Index for course-specific queries (excludes global configs)
CREATE INDEX idx_llm_model_config_course ON llm_model_config(course_id) WHERE course_id IS NOT NULL;

-- Index for phase-based lookups (all config types)
CREATE INDEX idx_llm_model_config_phase ON llm_model_config(phase_name);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE llm_model_config IS 'Per-phase LLM model configuration for Stage 4 analysis. Supports global defaults and per-course overrides for troubleshooting.';
COMMENT ON COLUMN llm_model_config.config_type IS 'Type of configuration: global (default for all courses) or course_override (specific course)';
COMMENT ON COLUMN llm_model_config.phase_name IS 'Analysis phase: phase_1_classification, phase_2_scope, phase_3_expert, phase_4_synthesis, or emergency';
COMMENT ON COLUMN llm_model_config.model_id IS 'OpenRouter model identifier (e.g., openai/gpt-oss-20b, openai/gpt-oss-120b)';
COMMENT ON COLUMN llm_model_config.fallback_model_id IS 'Model to use if primary model fails (quality-based escalation)';
COMMENT ON COLUMN llm_model_config.temperature IS 'LLM temperature parameter (0-2, default 0.7)';
COMMENT ON COLUMN llm_model_config.max_tokens IS 'Maximum tokens for LLM response (1-200000, default 4096)';

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE llm_model_config ENABLE ROW LEVEL SECURITY;

-- Policy 1: SuperAdmin full access
-- SuperAdmins can view, insert, update, and delete all model configurations
CREATE POLICY llm_model_config_superadmin_all ON llm_model_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::TEXT = 'superadmin'
    )
  );

-- Policy 2: Global config read access for all authenticated users
-- Anyone can read global configurations to understand system defaults
CREATE POLICY llm_model_config_read_global ON llm_model_config
  FOR SELECT
  USING (config_type = 'global');

-- Policy 3: Course override read access for organization members
-- Users can only see course overrides for courses in their organization
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

-- ============================================================================
-- Default Global Configuration
-- ============================================================================
-- Purpose: Insert default LLM model settings for all 5 analysis phases
--
-- Model Strategy:
--   - Phase 1 (Classification): 20B model (fast, cheap) → 120B fallback
--   - Phase 2 (Scope): 20B model (fast, cheap) → 120B fallback
--   - Phase 3 (Expert): 120B model (high quality) → Gemini fallback
--   - Phase 4 (Synthesis): 20B model (adaptive) → 120B fallback
--   - Emergency: Gemini (reliable, no fallback)
--
-- ON CONFLICT DO NOTHING ensures idempotent migrations (safe re-runs)
-- ============================================================================

INSERT INTO llm_model_config (config_type, phase_name, model_id, fallback_model_id, temperature) VALUES
  ('global', 'phase_1_classification', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 0.7),
  ('global', 'phase_2_scope', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 0.7),
  ('global', 'phase_3_expert', 'openai/gpt-oss-120b', 'google/gemini-2.5-flash', 0.7),
  ('global', 'phase_4_synthesis', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 0.7),
  ('global', 'emergency', 'google/gemini-2.5-flash', NULL, 0.7)
ON CONFLICT DO NOTHING;
