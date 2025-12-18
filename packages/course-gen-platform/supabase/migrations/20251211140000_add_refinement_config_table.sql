-- Migration: Add refinement_config table for Stage 6 targeted refinement settings
-- Task: 018-judge-targeted-refinement
-- Date: 2025-12-11
--
-- This table stores configurable parameters for the targeted refinement system.
-- Follows the same versioning pattern as llm_model_config for history tracking.

-- Create refinement_config table
CREATE TABLE IF NOT EXISTS public.refinement_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Config identification
    config_type TEXT NOT NULL DEFAULT 'global' CHECK (config_type IN ('global', 'course_override')),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,

    -- Operation mode: 'full-auto' or 'semi-auto'
    operation_mode TEXT NOT NULL DEFAULT 'full-auto' CHECK (operation_mode IN ('full-auto', 'semi-auto')),

    -- Mode-specific thresholds (merged from both modes)
    accept_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.85 CHECK (accept_threshold BETWEEN 0 AND 1),
    good_enough_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.75 CHECK (good_enough_threshold BETWEEN 0 AND 1),
    on_max_iterations TEXT NOT NULL DEFAULT 'best_effort' CHECK (on_max_iterations IN ('escalate', 'best_effort')),
    escalation_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Hard limits
    max_iterations INTEGER NOT NULL DEFAULT 3 CHECK (max_iterations BETWEEN 1 AND 10),
    max_tokens INTEGER NOT NULL DEFAULT 15000 CHECK (max_tokens BETWEEN 1000 AND 100000),
    timeout_ms INTEGER NOT NULL DEFAULT 300000 CHECK (timeout_ms BETWEEN 10000 AND 600000),

    -- Quality control
    regression_tolerance NUMERIC(3,2) NOT NULL DEFAULT 0.05 CHECK (regression_tolerance BETWEEN 0 AND 0.5),
    section_lock_after_edits INTEGER NOT NULL DEFAULT 2 CHECK (section_lock_after_edits BETWEEN 1 AND 10),
    convergence_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.02 CHECK (convergence_threshold BETWEEN 0 AND 0.1),

    -- Parallel execution
    max_concurrent_patchers INTEGER NOT NULL DEFAULT 3 CHECK (max_concurrent_patchers BETWEEN 1 AND 10),
    adjacent_section_gap INTEGER NOT NULL DEFAULT 1 CHECK (adjacent_section_gap BETWEEN 1 AND 5),
    sequential_for_regenerations BOOLEAN NOT NULL DEFAULT true,

    -- Krippendorff's Alpha thresholds
    krippendorff_high_agreement NUMERIC(3,2) NOT NULL DEFAULT 0.80 CHECK (krippendorff_high_agreement BETWEEN 0.5 AND 1),
    krippendorff_moderate_agreement NUMERIC(3,2) NOT NULL DEFAULT 0.67 CHECK (krippendorff_moderate_agreement BETWEEN 0.3 AND 1),

    -- Token cost estimates (JSONB for flexibility)
    token_costs JSONB NOT NULL DEFAULT '{
        "patcher": {"min": 500, "max": 1000},
        "sectionExpander": {"min": 1200, "max": 2000},
        "deltaJudge": {"min": 150, "max": 250},
        "arbiter": {"min": 400, "max": 600},
        "fullRegenerate": {"min": 5000, "max": 7000}
    }'::jsonb,

    -- Readability settings (JSONB for flexibility)
    readability JSONB NOT NULL DEFAULT '{
        "avgSentenceLength": {"target": 17, "max": 25},
        "avgWordLength": {"max": 10},
        "paragraphBreakRatio": {"min": 0.08}
    }'::jsonb,

    -- Versioning (same pattern as llm_model_config)
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Comments
COMMENT ON TABLE public.refinement_config IS 'Configurable parameters for Stage 6 targeted refinement system';
COMMENT ON COLUMN public.refinement_config.operation_mode IS 'Operation mode: full-auto (best-effort) or semi-auto (with escalation)';
COMMENT ON COLUMN public.refinement_config.accept_threshold IS 'Quality score threshold for automatic acceptance (0-1)';
COMMENT ON COLUMN public.refinement_config.good_enough_threshold IS 'Quality score threshold for good-enough acceptance in full-auto mode';
COMMENT ON COLUMN public.refinement_config.max_iterations IS 'Maximum refinement iterations before termination';
COMMENT ON COLUMN public.refinement_config.regression_tolerance IS 'Maximum allowed quality regression per iteration (0.05 = 5%)';
COMMENT ON COLUMN public.refinement_config.krippendorff_high_agreement IS 'Alpha threshold for high inter-rater agreement';
COMMENT ON COLUMN public.refinement_config.krippendorff_moderate_agreement IS 'Alpha threshold for moderate inter-rater agreement';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_refinement_config_active
    ON public.refinement_config(is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_refinement_config_course
    ON public.refinement_config(course_id)
    WHERE course_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refinement_config_mode
    ON public.refinement_config(operation_mode);

-- Create partial unique indexes for proper constraint handling
-- (instead of DEFERRABLE constraint which doesn't work with ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_refinement_config
  ON public.refinement_config(
    config_type,
    COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
    operation_mode
  )
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS unique_refinement_config_version
  ON public.refinement_config(
    config_type,
    COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
    operation_mode,
    version
  );

COMMENT ON INDEX unique_active_refinement_config IS 'Ensures only one active config per (config_type, course_id, operation_mode)';
COMMENT ON INDEX unique_refinement_config_version IS 'Ensures unique version numbers per (config_type, course_id, operation_mode)';

-- Enable RLS
ALTER TABLE public.refinement_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies (superadmin only - same pattern as llm_model_config)
CREATE POLICY "refinement_config_select_superadmin" ON public.refinement_config
    FOR SELECT
    USING (
        auth.uid() IN (
            SELECT id FROM auth.users
            WHERE raw_user_meta_data->>'role' = 'superadmin'
        )
    );

CREATE POLICY "refinement_config_insert_superadmin" ON public.refinement_config
    FOR INSERT
    WITH CHECK (
        auth.uid() IN (
            SELECT id FROM auth.users
            WHERE raw_user_meta_data->>'role' = 'superadmin'
        )
    );

CREATE POLICY "refinement_config_update_superadmin" ON public.refinement_config
    FOR UPDATE
    USING (
        auth.uid() IN (
            SELECT id FROM auth.users
            WHERE raw_user_meta_data->>'role' = 'superadmin'
        )
    );

CREATE POLICY "refinement_config_delete_superadmin" ON public.refinement_config
    FOR DELETE
    USING (
        auth.uid() IN (
            SELECT id FROM auth.users
            WHERE raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- Seed default configurations
INSERT INTO public.refinement_config (
    config_type,
    operation_mode,
    accept_threshold,
    good_enough_threshold,
    on_max_iterations,
    escalation_enabled,
    max_iterations,
    max_tokens,
    timeout_ms,
    regression_tolerance,
    section_lock_after_edits,
    convergence_threshold,
    max_concurrent_patchers,
    adjacent_section_gap,
    sequential_for_regenerations,
    krippendorff_high_agreement,
    krippendorff_moderate_agreement,
    version,
    is_active
) VALUES
-- Full-auto mode defaults
(
    'global',
    'full-auto',
    0.85,
    0.75,
    'best_effort',
    false,
    3,
    15000,
    300000,
    0.05,
    2,
    0.02,
    3,
    1,
    true,
    0.80,
    0.67,
    1,
    true
),
-- Semi-auto mode defaults
(
    'global',
    'semi-auto',
    0.90,
    0.85,
    'escalate',
    true,
    3,
    15000,
    300000,
    0.05,
    2,
    0.02,
    3,
    1,
    true,
    0.80,
    0.67,
    1,
    true
);
