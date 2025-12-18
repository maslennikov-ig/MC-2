-- ============================================================================
-- Add Observability Event Types to system_metrics ENUM
-- Purpose: Enable LLM phase execution and JSON repair metrics tracking
-- Date: 2025-11-17
-- Related: Stage 4 Analysis observability (langchain-observability.ts)
-- ============================================================================

DO $$ BEGIN
  -- Add llm_phase_execution if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'llm_phase_execution'
    AND enumtypid = 'metric_event_type'::regtype
  ) THEN
    ALTER TYPE metric_event_type ADD VALUE 'llm_phase_execution';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  -- Add json_repair_execution if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'json_repair_execution'
    AND enumtypid = 'metric_event_type'::regtype
  ) THEN
    ALTER TYPE metric_event_type ADD VALUE 'json_repair_execution';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update table comment to reflect new event types
COMMENT ON TABLE system_metrics IS 'Critical system events for Stage 8 monitoring, alerting, and Stage 4 LLM observability';

-- Verify ENUM now has 8 values
DO $$
DECLARE
  enum_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO enum_count
  FROM pg_enum
  WHERE enumtypid = 'metric_event_type'::regtype;

  IF enum_count <> 8 THEN
    RAISE EXCEPTION 'Expected 8 event types, found %', enum_count;
  END IF;

  RAISE NOTICE 'Successfully added observability event types. Total: %', enum_count;
END $$;
