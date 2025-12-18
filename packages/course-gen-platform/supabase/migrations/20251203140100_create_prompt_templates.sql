-- Migration: Create prompt_templates table
-- Purpose: Store versioned prompt templates for pipeline stages
-- Date: 2025-12-03
-- Related: specs/015-admin-pipeline-dashboard/data-model.md

-- ============================================================================
-- Table: prompt_templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  stage text NOT NULL CHECK (stage IN ('stage_3', 'stage_4', 'stage_5', 'stage_6')),
  prompt_key text NOT NULL,
  prompt_name text NOT NULL,
  prompt_description text,

  -- Content
  prompt_template text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb,

  -- Versioning
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,

  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),

  -- Constraints
  CONSTRAINT prompt_templates_stage_key_version_unique UNIQUE(stage, prompt_key, version)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Only one active version per stage+key
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_templates_active
  ON prompt_templates(stage, prompt_key)
  WHERE is_active = true;

-- Index for listing by stage
CREATE INDEX IF NOT EXISTS idx_prompt_templates_stage ON prompt_templates(stage);

-- Index for history queries
CREATE INDEX IF NOT EXISTS idx_prompt_templates_history
  ON prompt_templates(stage, prompt_key, version DESC);

-- ============================================================================
-- Row-Level Security (RLS)
-- ============================================================================

ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage prompt_templates" ON prompt_templates
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
CREATE OR REPLACE FUNCTION update_prompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_prompt_templates_updated_at();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE prompt_templates IS 'Versioned prompt templates for pipeline stages (stage_3 through stage_6)';
COMMENT ON COLUMN prompt_templates.stage IS 'Pipeline stage this prompt belongs to';
COMMENT ON COLUMN prompt_templates.prompt_key IS 'Unique key identifying the prompt within the stage';
COMMENT ON COLUMN prompt_templates.prompt_template IS 'The actual prompt template content (XML/text)';
COMMENT ON COLUMN prompt_templates.variables IS 'JSON array of variable definitions with name, description, required, example';
COMMENT ON COLUMN prompt_templates.version IS 'Version number (increments on each update)';
COMMENT ON COLUMN prompt_templates.is_active IS 'Whether this is the currently active version';
