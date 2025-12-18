-- ============================================================================
-- Fix Status Transition for Stage 4 Analysis
-- Purpose: Allow generating_content → generating_structure transition
-- Date: 2025-11-03
-- Issue: After Stage 3 (summarization), course is in 'generating_content' status
--        but Stage 4 (analysis) tries to transition to 'generating_structure'
--        which was blocked by the state machine trigger
-- ============================================================================

-- Update the validate_generation_status_transition() function to allow
-- generating_content → generating_structure transition
--
-- Context:
-- - Stage 2: processing_documents (document upload & vectorization)
-- - Stage 3: generating_content (LLM summarization of documents)
-- - Stage 4: generating_structure (multi-phase analysis)
-- - Stage 5+: finalizing → completed

CREATE OR REPLACE FUNCTION validate_generation_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions JSONB;
BEGIN
  -- Allow NULL → any status (first initialization)
  IF OLD.generation_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prevent changes if status didn't actually change
  IF NEW.generation_status = OLD.generation_status THEN
    RETURN NEW;
  END IF;

  -- Define valid state machine transitions
  v_valid_transitions := '{
    "pending": ["initializing", "cancelled"],
    "initializing": ["processing_documents", "analyzing_task", "failed", "cancelled"],
    "processing_documents": ["generating_content", "generating_structure", "failed", "cancelled"],
    "analyzing_task": ["generating_structure", "failed", "cancelled"],
    "generating_structure": ["generating_content", "finalizing", "failed", "cancelled"],
    "generating_content": ["generating_structure", "finalizing", "failed", "cancelled"],
    "finalizing": ["completed", "failed", "cancelled"],
    "completed": ["pending"],
    "failed": ["pending"],
    "cancelled": ["pending"]
  }'::JSONB;

  -- Check if transition is valid
  IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
    RAISE EXCEPTION 'Invalid generation status transition: % → % (course_id: %)',
      OLD.generation_status,
      NEW.generation_status,
      NEW.id
    USING HINT = 'Valid transitions from ' || OLD.generation_status || ': ' ||
                  (v_valid_transitions->OLD.generation_status::text)::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_generation_status_transition IS 'Validates course generation status transitions (updated 2025-11-03 to support Stage 4 workflow)';

-- ============================================================================
-- Changes Made:
-- ============================================================================
-- 1. Line 37: "processing_documents" now allows → "generating_content" (Stage 3 summarization)
-- 2. Line 40: "generating_content" now allows → "generating_structure" (Stage 4 analysis)
--
-- Workflow after fix:
-- - Stage 2 completes: status = 'processing_documents'
-- - Stage 3 starts: status → 'generating_content' (document summarization)
-- - Stage 3 completes: status remains 'generating_content'
-- - Stage 4 starts: status → 'generating_structure' (analysis) ✅ NOW ALLOWED
-- - Stage 4 completes: status → 'generating_content' (lesson generation)
-- - Final: status → 'finalizing' → 'completed'
-- ============================================================================
