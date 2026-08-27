-- The lesson banner moves to sourceful/riverflow-v2.5-fast.
--
-- Chosen by measuring every 16:9-capable model on OpenRouter, one prompt each,
-- billed by the provider rather than read off a price list:
--
--   sourceful/riverflow-v2.5-fast     $0.013954
--   black-forest-labs/flux.2-klein-4b $0.015000
--   openai/gpt-image-2                $0.032775
--   bytedance-seed/seedream-5-0-lite  $0.035000
--   google/gemini-2.5-flash-image     $0.038725   <- what this row said
--   black-forest-labs/flux.2-pro      $0.045000
--
-- Gemini's $0.038725 halves to $0.019247 once `google-ai-studio/flex` is pinned,
-- which is now done and still leaves it 38% dearer than this. So the flex fix
-- stands on its own and this is a further step, not a replacement for it.
--
-- It is also the better picture. Given a brief asking for layered translucent
-- planes with a node cluster left of centre in deep blue and violet, riverflow
-- produced exactly that, in the requested palette, with no text anywhere. The
-- artifacts are side by side rather than scored.
--
-- The fallback becomes openai/gpt-5-image-mini's newer sibling rather than
-- staying on it: `gpt-image-2` is the only OpenAI image model that publishes
-- 16:9 at all — the mini pair tops out at 3:2 — so the old fallback could not
-- have produced a banner in the right shape if it had ever been reached.
--
-- Three code changes had to land first, and each would have broken this:
--
--   * `usesImagesApi` asked `startsWith('openai/')`, so anything else went to
--     chat completions. Only 9 of the 48 image models exist there; riverflow is
--     not one, and the call would have failed as an unknown model.
--   * `quality` was sent whenever the Images API was used. Seven models accept
--     it; riverflow is not one, and would have answered 400.
--   * MODEL_CATALOG priced images per token. riverflow charges per frame and
--     reports no output tokens, so every banner would have traced unpriced.
--
-- Nothing is in flight: `generation_trace` holds no `stage_7_cover` row at all,
-- so this changes a phase that has never run rather than one mid-course.

BEGIN;

UPDATE llm_model_config
SET model_id = 'sourceful/riverflow-v2.5-fast',
    primary_display_name = 'Riverflow v2.5 Fast',
    fallback_model_id = 'openai/gpt-image-2',
    fallback_display_name = 'GPT Image 2',
    updated_at = NOW()
WHERE phase_name = 'stage_7_cover'
  AND config_type = 'global'
  AND judge_role IS NULL
  AND is_active
  AND model_id = 'google/gemini-2.5-flash-image';

COMMIT;
