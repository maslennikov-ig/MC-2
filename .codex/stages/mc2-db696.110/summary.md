# Stage mc2-db696.110 — Career Playbook quality v2 acceptance

Date: 2026-08-11

Status: accepted and delivered

Delivered: `develop` `a3266aed1` → `master` `4936d4231`; CI/CD run `31501779967` green on the exact
sha including Deploy to Production. Staging healthy afterwards.

## Outcome

The quality v2 contract was implemented across 18 tasks and verified by one authorized paid run that
repeated the exact 2026-08-11 baseline fixture.

The deterministic scorecard reports **zero criticals**; the same scorecard reports **fourteen** on the
baseline artifact. The guide carries 12 citations resolving to a Sources section with real URLs, four
ledger metrics quoted consistently across blocks, thirteen explicitly marked examples, and no calendar
year other than the generation year. The PDF has zero blank pages (was three) and zero literal
separators (was nine).

## Acceptance facts

- Cost USD 0.234668095 against a USD 0.35 ceiling; `unknown_cost_attempts: 1` recorded rather than
  hidden.
- Wall clock 59 minutes against a 25-minute target — **missed**.
- 20 block regenerations across 14 blocks against a target of 6 — **missed**.
- Cleanup reported zero residual rows across organizations, users, memberships, playbooks, job
  status, error logs, courses, auth users, and storage objects.

## Defects the run found that no test had

1. A malformed `metric_ledger` from the model aborted an entire generation at spec validation —
   26 blocks lost to a formatting slip in a secondary field. Now sanitized before validation.
2. Successful LLM calls preceding a spec failure were absent from the cost receipt: roughly USD 0.04
   spent, USD 0.0005 reported. Now recorded.
3. Status glyphs still drew as empty boxes after the font-family change, because the rendering
   container has no font covering U+2705. Now substituted with ASCII in the PDF template only, so the
   Markdown export keeps the richer glyphs.
4. Two scorecard findings were check artifacts on correct content. Both checks tightened; a false
   positive here spends a paid regeneration.

## Closeout markers

- docs-reviewed: updated — quality contract, prompt spec v2, ADR-008, acceptance plan and handoff all
  record the delivered behaviour and the measured result.
- graph-reviewed: no-change-needed — the change is contained within the existing Career Playbook
  stage boundary and adds no new entrypoint or ownership boundary.
- project-index: reviewed-no-change.
- Documentation: no external/versioned boundary — `marked` was added as an ordinary dependency and
  its renderer contract is covered by the repository's own fixture test.

## Explicit defers

- `mc2-db696.112` — first-draft contract adherence: the run missed the latency and regeneration
  targets because the repair loop dominates. The gate is correct; the drafts are not.
- Full-document proofreading pass (baseline finding 6) remains deferred on budget grounds.
