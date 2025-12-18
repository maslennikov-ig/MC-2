-- Migration: Create pipeline_global_settings table
-- Purpose: Store global pipeline configuration (RAG budget, quality threshold, feature flags)
-- Date: 2025-12-03
-- Related: specs/015-admin-pipeline-dashboard/data-model.md

-- ============================================================================
-- Table: pipeline_global_settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL,
  description text,

  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Primary lookup by setting_key (covered by UNIQUE constraint)

-- ============================================================================
-- Row-Level Security (RLS)
-- ============================================================================

ALTER TABLE pipeline_global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage pipeline_global_settings" ON pipeline_global_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- ============================================================================
-- Triggers
-- ============================================================================

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_pipeline_global_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pipeline_global_settings_updated_at
  BEFORE UPDATE ON pipeline_global_settings
  FOR EACH ROW EXECUTE FUNCTION update_pipeline_global_settings_updated_at();

-- ============================================================================
-- Default Settings (FR-026, FR-027)
-- ============================================================================

INSERT INTO pipeline_global_settings (setting_key, setting_value, description) VALUES
  ('rag_token_budget', '20000', 'Maximum tokens for RAG context per request'),
  ('quality_threshold', '0.85', 'Minimum quality score (0-1) for generated content'),
  ('retry_attempts', '2', 'Number of retry attempts per pipeline phase'),
  ('timeout_per_phase', '120000', 'Timeout in milliseconds per pipeline phase'),
  ('feature_flags', '{"useDatabasePrompts": false, "enableQualityValidation": true, "enableCostTracking": true}', 'Feature toggles for pipeline behavior')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE pipeline_global_settings IS 'Global configuration settings for the course generation pipeline';
COMMENT ON COLUMN pipeline_global_settings.setting_key IS 'Unique identifier for the setting';
COMMENT ON COLUMN pipeline_global_settings.setting_value IS 'Setting value as JSON (supports primitives, objects, arrays)';
