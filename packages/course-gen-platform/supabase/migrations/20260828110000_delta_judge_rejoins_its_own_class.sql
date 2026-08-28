-- `stage_6_delta_judge` goes back to the fast default, where its three siblings
-- already are.
--
-- Found on 2026-08-28 by the first run of the new guard
-- `phase-names-are-one-list`, which compares the compiled Stage 6 defaults
-- against the seed they overwrite. The database said `openai/gpt-5.6-luna`;
-- `STAGE6_CANONICAL_PHASE_DEFAULTS` says `DEFAULT_MODEL_ID`. That combination is
-- the exact failure mc2-u8kwx removed everywhere else: the database wins at
-- runtime while the binary wins when the database cannot be read, so a lookup
-- failure quietly served a different model than the one running a minute
-- earlier — and the panel's "reset to default" would have moved it without the
-- operator meaning to.
--
-- The database side is the accident. A bulk sweep on 2026-08-22 09:07 rewrote
-- 60-odd rows in fifteen seconds, all to version 4, and every other phase of
-- this class landed on the fast default: `stage_6_arbiter` at both tiers,
-- `stage_6_patcher` at both, `stage_6_rag_planning` at both,
-- `stage_career_playbook_judge`. Only this one went to Luna, and nothing records
-- a reason.
--
-- The rule it breaks is written down and tested: what AUTHORS prose the reader
-- opens takes the careful model; what EDITS under an explicit instruction, or
-- never reaches the reader, takes the fast one. A delta judge validates a patch
-- at temperature 0.0 with a 512-token ceiling. It is the second kind.
--
-- Small money — 512-token answers — but the point is not the money. It is that
-- two answers to one question is how a routing decision goes missing, and this
-- was the last pair still disagreeing.
--
-- Reversible from the panel in one click, now that `phase-names-are-one-list`
-- would fail the build rather than let the two drift apart again.

BEGIN;

UPDATE llm_model_config
SET model_id = 'deepseek/deepseek-v4-flash-0731',
    primary_display_name = 'DeepSeek V4 Flash 0731',
    fallback_model_id = 'openai/gpt-5.6-luna',
    fallback_display_name = 'GPT-5.6 Luna',
    updated_at = NOW()
WHERE phase_name = 'stage_6_delta_judge'
  AND config_type = 'global'
  AND judge_role IS NULL
  AND is_active
  AND model_id = 'openai/gpt-5.6-luna';

COMMIT;
