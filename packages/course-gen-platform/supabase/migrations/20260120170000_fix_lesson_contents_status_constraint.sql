-- Fix lesson_contents_status_check constraint to include 'rejected' status
--
-- Problem: saveRejectedContent() in database-service.ts tries to save content
-- with status='rejected', but the constraint only allows:
-- ['pending', 'generating', 'completed', 'failed', 'review_required', 'approved']
--
-- This causes INSERT to fail, leaving lessons without content and preventing
-- the course from transitioning to stage_6_complete.

-- Drop the old constraint
ALTER TABLE lesson_contents DROP CONSTRAINT IF EXISTS lesson_contents_status_check;

-- Add the new constraint with 'rejected' status
ALTER TABLE lesson_contents ADD CONSTRAINT lesson_contents_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'generating'::text,
    'completed'::text,
    'failed'::text,
    'review_required'::text,
    'approved'::text,
    'rejected'::text  -- Added: for saveRejectedContent() in Stage 6
  ]));

-- Add comment for documentation
COMMENT ON CONSTRAINT lesson_contents_status_check ON lesson_contents IS
  'Valid statuses: pending, generating, completed, failed, review_required, approved, rejected';
