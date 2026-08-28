-- Every configured `timeout_ms` is raised to fit the token budget beside it.
--
-- The rule: a phase must be allowed at least **twice** the time its own
-- `max_tokens` needs at `MIN_ENDPOINT_THROUGHPUT_TPS` (30 tok/s, the slowest
-- endpoint routing will now accept — see `openrouter-endpoints.ts`). Twice,
-- because generation is the dominant term but not the only one: connection,
-- prompt processing on a 128k context, and a provider that is at the floor
-- rather than above it all come out of the same budget.
--
-- Under that rule all seventeen rows carrying a timeout were too tight, and
-- seven were not close:
--
--   stage_career_playbook_spec       16000 tokens, 238 s  -> needs 1067 s
--   stage_career_playbook_group_1..6 14000 tokens, 238 s  -> needs  934 s
--   stage_career_playbook_regenerator 6000 tokens, 238 s  -> needs  400 s
--   stage_6_* (six phases)            8000 tokens, 300 s  -> needs  534 s
--
-- The playbook half was live: `stage-career-playbook/nodes/runtime.ts` applies
-- `phaseConfig.timeoutMs`, so those seven phases could abort their own work
-- before it could legitimately finish. Nothing in 60 days of `generation_trace`
-- records a timeout, because glm-5.3-flash on a healthy endpoint finishes far
-- inside 238 s — but that is the endpoint being fast, not the setting being
-- right, and the setting is what holds when it is not.
--
-- The Stage 6 half was not live at all: `getModelForPhase` passed a literal
-- `undefined` where the timeout goes, so the OpenAI SDK's own 600 s default
-- applied. The same commit wires the column through, which makes Stage 6's
-- effective bound 540 s instead of 600 — a 10% narrowing, on a bound that has
-- never fired, of a phase whose budget legitimately needs 267 s at the floor.
-- Worth naming rather than calling it no change (mc2-jm25g).
--
-- Rounded up to whole minutes so the values read as decisions rather than as
-- arithmetic output.

BEGIN;

UPDATE llm_model_config
SET timeout_ms = GREATEST(
      timeout_ms,
      -- ceil(max_tokens / 30 * 2 * 1000 / 60000) * 60000
      (ceil((max_tokens::numeric / 30) * 2 * 1000 / 60000) * 60000)::integer
    ),
    updated_at = NOW()
WHERE config_type = 'global'
  AND is_active
  AND timeout_ms IS NOT NULL
  AND timeout_ms < (max_tokens::numeric / 30) * 2 * 1000;

COMMIT;
