# Course Structure Quality Policy

Last updated: 2026-06-14

## Purpose

Automatic course generation should create the smallest complete course that
satisfies the intended learning outcomes. Auto-size must not become a broad
encyclopedia, especially when the source is a Career Playbook / role guide.

External design principles used for this policy:

- CMU Eberly alignment: learning objectives, assessment, and learning activities
  should be aligned.
- CMU Eberly learning objectives: objectives should be concrete, measurable,
  and used to select content.
- Vanderbilt Online Course Design Guide: course outcomes should remain focused
  and use backward design.
- University of Michigan cognitive load guidance: reduce overload with
  scaffolding and guided practice.

References:

- https://www.cmu.edu/teaching/assessment/basics/alignment.html
- https://www.cmu.edu/teaching/designteach/design/learningobjectives.html
- https://cdn.vanderbilt.edu/vu-URL/wp-content/uploads/sites/382/2022/10/20030242/Online-Course-Design-Guide_September2022.pdf
- https://lsa.umich.edu/technology-services/news-events/all-news/teaching-tip-of-the-week/considering-cognitive-load-refreshing-your-class-to-improve-student-learning.html

## Structure Profiles

`general_auto`

- Minimum lessons: 10
- Target lessons: 16-28
- Soft maximum: 32
- Hard maximum: 40
- Sections: 4-8
- Used when a normal course is set to `auto`.

`role_playbook_bridge`

- Minimum lessons: 12
- Target lessons: 18-24
- Soft maximum: 24
- Hard maximum: 30
- Sections: 5-7
- Used for Career Playbook to course generation.
- The generated course should be a practical onboarding/upskilling path, not a
  full role encyclopedia.

Explicit user-selected course sizes keep their existing preset bounds.

## Stage 4 Requirements

Stage 4 Phase 2 must:

- Include an explicit `structure_profile` in the analysis input.
- Ask for the smallest complete course that satisfies learning outcomes.
- Avoid prompt language that encourages broad scope expansion.
- Normalize `recommended_structure` after LLM generation:
  - merge section overflow into the last allowed section;
  - split large sections when the result has fewer sections than the profile
    minimum;
  - enforce minimum and hard maximum lesson counts;
  - recompute `total_lessons`, `total_sections`, per-section durations, and
    top-level estimated content hours from the normalized section breakdown.

## Stage 5 Requirements

Stage 5 must:

- Generate each section from its Stage 4 `estimated_lessons`, not from a uniform
  `total_lessons / total_sections` average.
- Cap lesson objectives by lesson duration:
  - 15-minute lessons: 1-3 objectives;
  - longer lessons: 1-5 objectives.
- Recompute `estimated_duration_hours` from actual generated lessons.
- Reconcile senior/lead/head Career Playbook bridge difficulty so the final
  course is not purely `beginner`.

## Blocking Quality Gate

Stage 5 writes deterministic structural quality data to
`generation_metadata.quality_scores.structure`.

Critical issues block Stage 6 progression:

- lesson count exceeds profile hard maximum;
- section count is outside the profile bounds;
- course duration metadata differs from actual lesson duration by more than
  10% and more than 0.25h;
- duplicate lesson titles;
- lesson objective overload;
- empty generated sections;
- senior/lead/head Career Playbook bridge course remains purely beginner after
  metadata reconciliation.

Warnings do not block progression:

- lesson count exceeds the profile soft maximum but stays within the hard
  maximum;
- semantic overlap unless it becomes concrete duplicate lesson titles.

Automatic mode must leave Stage 5 at `stage_5_awaiting_approval` when critical
issues exist. Manual approval and direct Stage 6 starts must also reject critical
Stage 5 structures.

Stage 5 edit, regeneration, chat proposal, and element add/delete paths must
recompute `generation_metadata.quality_scores.structure` after persisting a new
`course_structure`, so users can resolve critical blockers by editing or
regenerating the structure.

## UI Requirements

The Stage 5 review UI should show:

- `needs fixes` for critical structural issues, with continue disabled;
- `warning` when only non-blocking warnings exist;
- `can continue` when the structure passed deterministic checks.

Recovered retry errors should remain logs/telemetry and should not be shown as
fatal user-facing errors when the final Stage 5 result passed.
