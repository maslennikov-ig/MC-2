ALTER TABLE career_playbooks
  ADD COLUMN IF NOT EXISTS image_status TEXT CHECK (
    image_status IS NULL OR image_status IN ('pending', 'generating', 'completed', 'failed', 'cancelled')
  ),
  ADD COLUMN IF NOT EXISTS image_content JSONB,
  ADD COLUMN IF NOT EXISTS image_metadata JSONB,
  ADD COLUMN IF NOT EXISTS image_generation_attempt INTEGER NOT NULL DEFAULT 0 CHECK (image_generation_attempt >= 0),
  ADD COLUMN IF NOT EXISTS image_error_message TEXT,
  ADD COLUMN IF NOT EXISTS image_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_career_playbooks_image_status
  ON career_playbooks(image_status)
  WHERE image_status IN ('pending', 'generating', 'failed');
