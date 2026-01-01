-- Fix: Change unique constraint from endpoint-only to user+endpoint composite
-- This allows the same endpoint to exist for different users (device sharing scenario)
-- while preventing duplicate subscriptions for the same user+endpoint

-- Drop the old unique constraint on endpoint alone
ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;

-- Add composite unique constraint
ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_endpoint_key
  UNIQUE (user_id, endpoint);

-- Add index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at
  ON push_subscriptions(updated_at);
