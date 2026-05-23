# Career Playbook LazyWeb Generation Flow Redesign

## Goal

Redesign the "Должностная инструкция" constructor as a wide working surface instead of a narrow wizard card, and fix the generation handoff so the review screen cannot send a draft that the backend still considers unready.

## Beads

- `mc2-db696.27` - redesign generation flow from LazyWeb references.
- `mc2-db696.26` - fix `Career Playbook is not ready for generation`.
- `mc2-db696.28` - follow-up for replacing the temporary local role-title overlay with a reproducible ESCO import subset.

## References Used

LazyWeb patterns:

- `userpilot_0a4df07adb4f7401b06f.png` - onboarding checklist/dashboard pattern with progress and next tasks.
- `appcues_593a61fbff93499813f0.png` - onboarding guidance with modular checklist and contextual panels.
- `stripe-dashboard_c3b552e287a44b6468f6.png` - focused setup form with progress and clear primary action.
- `intercom_b6ee...` and `intercom_789d50...` - AI/generation dashboard states with status, metrics, and expandable context.
- `pendo_cf76...` - analytical side panels and workflow status.
- `craft_fd5...` - HR/job-description template preview and review mental model.

21st.dev check:

- Onboarding dialog/checklist/stages components were relevant as pattern references, especially step checklists and progress states.
- No 21st.dev component is imported directly in this change; the existing local shadcn-style primitives are enough and avoid extra dependency churn.

Knowledge-base recommendation:

- ESCO is the best default source for future role-title normalization because it is multilingual, downloadable, and has an API/local API. It is practical as an import-time/source-data pipeline, not as a fragile live autocomplete dependency.
- O\*NET is strong for English occupation details and task/skill data, but it is US-focused and requires API registration for web services.
- Lightcast is commercially useful and has strong skills/title/occupation taxonomies, but production use needs access/licensing review.
- Tabiya's livelihoods classifier is a real ESCO-based implementation, but it is a heavier model/API path and expects model/runtime setup. It is not a good dependency for lightweight client-side autocomplete in this constructor.
- Current implementation keeps the source-aware local role-title overlay as a temporary product layer and makes its limits explicit. Generic sales queries now include a broad sales manager option plus B2B, B2C, retail, partner, and key-account variants instead of over-normalizing to B2B.
- `mc2-db696.28` tracks the fuller data step: a build-time/import-time ESCO occupation subset with source version, license attribution, ranking rules, RU/EN fallback behavior, and a small MC2 overlay only for market roles ESCO does not model well.

Source links:

- ESCO API: https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api
- ESCO downloads: https://esco.ec.europa.eu/en/use-esco/download
- Tabiya ESCO classifier: https://github.com/tabiya-tech/tabiya-livelihoods-classifier

## Product Direction

1. Keep the constructor manual-first: suggestions help but never block user-entered titles.
2. Keep "Другое" inline for choice questions instead of a separate free-answer button.
3. Make the fixed-question count stable by showing the company/product stage as an optional base question for every company size.
4. Use a three-column desktop workbench:
   - left: stage and question rail;
   - center: current question, review, or generation status;
   - right: collected context/readiness panel.
5. Use a stacked mobile layout with the same information order.
6. If adaptive follow-ups fail, show a clear retry path and allow fixed-context generation only when the backend has enough fixed answers.
7. When the user says "достаточно, сгенерируй", mark unanswered generated follow-ups as skipped before generation approval.

## Implementation Plan

1. Add failing tests for:
   - `completeCareerPlaybookFollowups()` marking unanswered follow-ups as skipped and dirty;
   - page flow flushing skipped follow-ups before `approveAndGenerate`;
   - stable fixed question list including optional company stage;
   - updated wide-flow copy/layout anchors.
2. Update store behavior:
   - always include `company_stage`;
   - skip unanswered follow-ups when completing follow-ups;
   - keep dirty IDs so `flushCareerPlaybookAutosave()` persists skips.
3. Update backend readiness:
   - keep rejecting empty/incomplete drafts;
   - allow generation from fixed-only context when required fixed answers exist and no follow-up questions were stored;
   - keep accepting `answering_followups` only when every generated follow-up has an answer or skip.
4. Redesign frontend screens:
   - compact constructor header in `page-client.tsx`;
   - wide `Wizard`, `FollowupPhase`, `CompletionScreen`, and `PhaseBStatus`;
   - question progress tied to the current step, with answered/readiness panels shown separately.
5. Update RU/EN messages and focused tests.
6. Verify with focused unit tests, backend router test, type-check, lint/build as feasible, and browser/screenshot verification where possible.
