-- ============================================================================
-- Migration: add_stage6_enum_values
-- Purpose: Add Stage 6 status values to generation_status enum
-- Date: 2026-01-13
-- Author: Claude Code
--
-- Problem: FSM transitions already support stage_6_init, stage_6_generating,
-- stage_6_complete, but the enum doesn't have these values.
-- The UI uses these statuses to show appropriate buttons.
--
-- Solution: Add stage_6 enum values using ALTER TYPE ADD VALUE
-- ============================================================================

-- Add stage_6_init after stage_5_awaiting_approval
ALTER TYPE generation_status ADD VALUE IF NOT EXISTS 'stage_6_init' AFTER 'stage_5_awaiting_approval';

-- Add stage_6_generating after stage_6_init
ALTER TYPE generation_status ADD VALUE IF NOT EXISTS 'stage_6_generating' AFTER 'stage_6_init';

-- Add stage_6_complete after stage_6_generating
ALTER TYPE generation_status ADD VALUE IF NOT EXISTS 'stage_6_complete' AFTER 'stage_6_generating';

-- Note: stage_6_awaiting_approval is not added because the current flow goes
-- stage_6_complete -> finalizing -> completed without an approval gate.
-- This can be added later if needed.

COMMENT ON TYPE generation_status IS 'Course generation pipeline status. Stage 6 added 2026-01-13 for lesson generation UI.';
