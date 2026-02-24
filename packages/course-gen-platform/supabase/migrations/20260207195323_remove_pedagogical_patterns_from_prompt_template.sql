-- Remove pedagogical_patterns references from Phase 1 prompt template
-- The pedagogical_patterns field has been removed from the codebase.
-- This updates the seeded prompt template to no longer reference theory_practice_ratio.

UPDATE prompt_templates
SET prompt_template = REPLACE(
  prompt_template,
  E'\nFIELD FORMATS:\n- theory_practice_ratio: Format "XX:YY" where XX+YY=100 (e.g., "30:70", "50:50", "70:30")\n',
  E'\n'
),
updated_at = NOW()
WHERE prompt_key = 'stage4_phase1_classification'
  AND prompt_template LIKE '%theory_practice_ratio%';
