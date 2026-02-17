-- Migration: Enable cache_read_enabled for all Gemini 3 Flash extended tier configs
-- Date: 2026-02-17
--
-- OpenRouter supports both implicit and explicit prompt caching for Gemini:
-- - Implicit: automatic, cached tokens charged at 0.25x input cost
-- - Explicit: cache_control breakpoints in messages (like Anthropic)
--
-- This enables the flag for all extended tier configs where Gemini 3 Flash is the primary model.
-- The flag is used by the budget allocator and can be read by downstream code for caching decisions.

-- Enable cache_read_enabled for all configs using google/gemini-3-flash-preview as primary model
-- These are typically extended tier configs used when context overflows standard limits
UPDATE llm_model_config
SET cache_read_enabled = true
WHERE model_id = 'google/gemini-3-flash-preview'
  AND is_active = true;
