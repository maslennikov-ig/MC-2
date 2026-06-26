INSERT INTO prompt_templates (
  stage,
  prompt_key,
  prompt_name,
  prompt_description,
  prompt_template,
  variables,
  version,
  is_active
)
VALUES (
  'stage_7',
  'career_playbook_card',
  'Career Playbook Card: Role Guide Thumbnail',
  'Generates a 1:1 square thumbnail image for Career Playbook / Role Guide library cards and viewer hero display.',
  $prompt$Create a professional 1:1 square thumbnail image for a Career Playbook / Role Guide.

ROLE CONTEXT:
Role: "{{roleTitle}}"
Department: {{department}}
Level: {{level}}
Specialization: {{specialization}}
Language Context: {{languageContext}}

BUSINESS CONTEXT:
{{businessContextSummary}}

ROLE FOCUS:
{{roleFocusSummary}}

VISUAL STYLE (MUST FOLLOW):
Color Scheme: {{colorScheme}}
Aesthetic: {{aesthetic}}
Visual Elements: {{visualElements}}
Mood: {{mood}}

COMPOSITION REQUIREMENTS:
- 1:1 square format optimized for library cards and document hero preview
- Symbolic, professional representation of the role and work environment
- Modern editorial business illustration with depth and a clear focal point
- Visual metaphor for responsibilities, decision-making, tools, collaboration, or outcomes
- Works at small thumbnail sizes without relying on written labels

STYLE GUIDELINES:
- Use the specified color scheme prominently
- Incorporate the visual elements mentioned in the style
- Prefer conceptual workplace symbolism over literal portraits
- Avoid identifiable human faces; silhouettes or abstract figures are acceptable
- Keep the image premium, practical, and credible for a business role guide

CRITICAL CONSTRAINTS - NO TEXT:
ABSOLUTELY NO text, letters, words, numbers, characters, typography, writing, inscriptions, labels, captions, titles, UI screenshots, logos, watermarks, or signatures in ANY alphabet.
The image must be 100% text-free and symbol-based only.

OUTPUT:
A polished square thumbnail that communicates the essence of "{{roleTitle}}" as a Role Guide while staying text-free and suitable for professional catalog browsing.$prompt$,
  '[
    {"name":"roleTitle","description":"Career Playbook role title","required":true},
    {"name":"department","description":"Role department","required":true},
    {"name":"level","description":"Role seniority level","required":true},
    {"name":"specialization","description":"Role specialization or fallback","required":true},
    {"name":"businessContextSummary","description":"Short business context summary","required":true},
    {"name":"roleFocusSummary","description":"Role KPIs/tools/competencies summary","required":true},
    {"name":"languageContext","description":"Language context description","required":true},
    {"name":"colorScheme","description":"Visual style color scheme","required":true},
    {"name":"aesthetic","description":"Visual style aesthetic","required":true},
    {"name":"visualElements","description":"Visual style elements","required":true},
    {"name":"mood","description":"Visual style mood","required":true}
  ]'::jsonb,
  1,
  true
)
ON CONFLICT (stage, prompt_key, version)
DO UPDATE SET
  prompt_name = EXCLUDED.prompt_name,
  prompt_description = EXCLUDED.prompt_description,
  prompt_template = EXCLUDED.prompt_template,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active;
