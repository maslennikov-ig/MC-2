-- PWA Analytics table for tracking install and push notification events
-- Used by admin dashboard to monitor PWA adoption

CREATE TABLE pwa_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_pwa_analytics_event_type ON pwa_analytics(event_type);
CREATE INDEX idx_pwa_analytics_created_at ON pwa_analytics(created_at DESC);
CREATE INDEX idx_pwa_analytics_event_date ON pwa_analytics(event_type, created_at DESC);

-- Enable RLS
ALTER TABLE pwa_analytics ENABLE ROW LEVEL SECURITY;

-- Anyone can insert analytics events (including anonymous users)
CREATE POLICY "Anyone can insert pwa analytics"
  ON pwa_analytics FOR INSERT
  WITH CHECK (true);

-- Only admins can read analytics
CREATE POLICY "Admins can read pwa analytics"
  ON pwa_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
    )
  );

-- Comment
COMMENT ON TABLE pwa_analytics IS 'Tracks PWA install prompts, installs, and push notification subscriptions for admin analytics';
