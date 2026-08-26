-- Stage 6 prose joins the Career Playbook groups on z-ai/glm-5.3-flash.
--
-- This is the second attempt and the first one is worth keeping, because it is
-- the reason to distrust a single live run (mc2-r8shw).
--
-- Attempt 1, 2026-08-26 19:14, course 3e0e5dc1: all 23 `stage_6_content` calls
-- returned `finishReason: length` having spent 4819 of 4848 completion tokens on
-- reasoning. Every lesson was written by the escalation model, and the course
-- cost $0.0949 against a usual $0.03-0.06. It looked like the model could not
-- work inside the pipeline's section budget.
--
-- It was the container. `MODEL_CATALOG.requiresReasoning` for this model shipped
-- in the same commit as the routing, and dev had not been deployed, so the code
-- asked for `reasoning: {enabled:false}`, was refused, and fell back to letting
-- the model deliberate by default. Three paid probes on one prompt say what the
-- flag is worth:
--
--   no reasoning field      1831 reasoning, 2789 completion, stop
--   reasoning.effort low       0 reasoning,  900 completion, stop
--   reasoning.enabled false             400 Reasoning is mandatory
--
-- Attempt 2, 2026-08-26 21:07, after deploying, course 46dd2ea2: eight
-- `stage_6_content` calls, every one `finish: stop`, average 41 reasoning tokens
-- against 4819, and no escalation at all.
--
-- Like for like, the same topic through the same pipeline:
--
--   2026-08-23  luna   44 calls  $0.037859 total  $0.024493 Stage 6  119714 tok
--   2026-08-26  glm    42 calls  $0.019854 total  $0.005267 Stage 6   90722 tok
--
-- Total 48% lower, Stage 6 — the line that is ~90% of generation spend — 78%
-- lower. The lesson was read: a worked analogy, a valid Mermaid diagram, and the
-- one statistical claim hedged as "по разным исследованиям" rather than given a
-- fabricated number, which is exactly the failure mc2-bneet recorded against the
-- previous candidate for this seat.
--
-- Unchanged and deliberate: the judges, every chat_* phase, Stage 2/4/5 (they
-- produce JSON the pipeline parses, and this model ignores a strict json_schema),
-- the playbook spec, and the two escalation hops.

BEGIN;

UPDATE llm_model_config
SET model_id = 'z-ai/glm-5.3-flash',
    primary_display_name = 'GLM 5.3 Flash',
    updated_at = NOW()
WHERE model_id = 'openai/gpt-5.6-luna'
  AND config_type = 'global'
  AND judge_role IS NULL
  AND phase_name IN (
    'stage_6_normal',
    'stage_6_simple',
    'stage_6_complex',
    'stage_6_refinement',
    'stage_6_section_expander'
  );

COMMIT;
