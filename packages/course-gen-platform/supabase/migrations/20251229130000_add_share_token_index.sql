-- Add partial index for share_token lookups (public course sharing)
-- Only indexes non-null tokens for space efficiency
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_courses_share_token
ON courses(share_token)
WHERE share_token IS NOT NULL;

COMMENT ON INDEX idx_courses_share_token IS
'Optimizes share link lookups for public course sharing. Partial index for non-null tokens only.';
