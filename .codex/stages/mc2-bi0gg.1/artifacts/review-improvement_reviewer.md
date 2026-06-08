---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-bi0gg.1
stage_id: mc2-bi0gg.1
agent_type: improvement_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Review stream covering UX, accessibility, design-system, tests, and maintainability tradeoffs.
repo: /home/me/code/mc2
branch: codex/fix-course-landing-light-theme
base_branch: origin/develop
base_commit: 58e74146
worktree: /home/me/code/mc2
write_zone:
  - .codex/stages/mc2-bi0gg.1/artifacts/review-improvement_reviewer.md
success_criteria:
  - Review course landing light-theme CTA fix for practical improvements without editing source files.
  - Include severity, evidence, suggested fix, value, tradeoff, confidence, classification, Top 3, and acceptance recommendation.
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
selected_skills:
  - frontend-aesthetics
  - ui-design-system
selected_agents:
  - improvement_reviewer
catalog_candidates:
  - none
parallel_group: mc2-bi0gg.1-review
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: Read-only source review; no cleanup needed.
risk_level: low
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: Static visual class fix; no API, route, operator, deployment, or durable product-doc contract changed.
verification:
  - git status --short --branch: passed
  - git diff origin/develop...HEAD -- packages/web/app/[locale]/courses/page.tsx: passed
  - rg focused theme-pattern searches in course/public landing files: passed
  - inspected existing course landing unit tests and Playwright config: passed
changed_files:
  - .codex/stages/mc2-bi0gg.1/artifacts/review-improvement_reviewer.md
explicit_defers:
  - none
---

# Improvement Review: Course Landing Light Theme CTA

## Summary

The direct class-only fix in `packages/web/app/[locale]/courses/page.tsx` is the right scope for the reported issue. It removes the light-theme dark CTA band without introducing new logic, data dependencies, or route behavior. I do not recommend extracting a component or adding a broad design-system refactor for this patch.

I found no must-fix improvement. The practical next step with the best value is a small regression test so this exact light/dark inversion does not return.

## Improvement Opportunities

### 1. Add a focused regression assertion for the final CTA theme classes

- **Severity**: Low to Medium.
- **Current approach**: Parent verification includes browser smoke for `/ru/courses` light/dark computed colors, but the branch diff adds no persistent test coverage. Existing `packages/web/tests/unit/components/courses/landing-page.test.tsx` already renders the landing and validates core links/content, but it does not assert that the final CTA is light by default.
- **Evidence**: `packages/web/app/[locale]/courses/page.tsx:215` now uses `border border-[#e3d7c6] bg-white/75 text-slate-950 ... dark:bg-slate-900/85 dark:text-white`. The pre-fix base was `bg-slate-950 text-white ... dark:bg-white dark:text-slate-950` at the same block. Existing test coverage at `packages/web/tests/unit/components/courses/landing-page.test.tsx:67` checks rendering and links only.
- **Suggested improvement**: Add a narrow unit assertion in `landing-page.test.tsx` that locates the final CTA heading/link region and verifies the containing block has `bg-white/75`, `text-slate-950`, and `dark:bg-slate-900/85`, and no longer has base `bg-slate-950`. If browser-level confidence is preferred, add a tiny Playwright spec that checks computed background/text color for light and dark on the final CTA.
- **Expected value**: Catches the exact regression that triggered the user report with very little maintenance cost. Also documents the intended behavior: light surface by default, dark surface only under `dark:`.
- **Tradeoff/cost**: Class assertions can be brittle if the page is redesigned. A computed-style Playwright check is more behavior-oriented but slower than the existing unit test.
- **Affected files**: `packages/web/tests/unit/components/courses/landing-page.test.tsx`; optionally `packages/web/tests/e2e/...`.
- **Confidence**: High.
- **Classification**: high-value improvement.

### 2. Add explicit keyboard focus styling to course landing CTA links

- **Severity**: Low to Medium.
- **Current approach**: The CTA links are visually styled for normal and hover states, but the course landing action links do not include explicit `focus-visible` ring/outline classes.
- **Evidence**: Course landing CTA/link classes at `packages/web/app/[locale]/courses/page.tsx:76`, `:83`, `:189`, `:226`, and `:233` include hover/transition styling but no `focus-visible:*`. Nearby UI already uses visible focus patterns, for example `packages/web/components/layouts/header.tsx:203` and `packages/web/components/common/error-states/auth-required-state.tsx:40`.
- **Suggested improvement**: Apply the existing focus pattern to the landing CTAs, for example `outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950`, with a light offset color that matches the warm page background where needed.
- **Expected value**: Improves keyboard accessibility on the highest-value actions on the page and aligns the landing with existing app conventions.
- **Tradeoff/cost**: Slightly longer class strings on a page that is already class-heavy. It may be best handled as a small accessibility follow-up rather than folded into a narrow color-regression patch.
- **Affected files**: `packages/web/app/[locale]/courses/page.tsx`.
- **Confidence**: High.
- **Classification**: high-value improvement.

### 3. Keep the one-off class fix now; consider local theme constants only if this page keeps changing

- **Severity**: Low.
- **Current approach**: The course landing page uses repeated literal surface/border colors such as `#f7f1e8`, `#e3d7c6`, `#fbf8f2`, plus repeated secondary CTA class strings. The fix follows that existing inline Tailwind style.
- **Evidence**: Repeated warm landing values appear throughout `packages/web/app/[locale]/courses/page.tsx:55`, `:59`, `:119`, `:136`, `:153`, `:199`, `:215`, `:270`, `:287`, `:296`, `:308`, and `:312`. Global semantic tokens already exist in `packages/web/app/globals.css:45` through `:69`, but the course landing is not currently using them for these exact warm marketing surfaces.
- **Suggested improvement**: Do not extract a reusable component for this fix. If future course landing theme edits continue, introduce small local constants for repeated CTA/surface class groups or map the warm colors to semantic tokens. Keep it page-local until the same pattern is needed across multiple routes.
- **Expected value**: Reduces future missed light/dark inversions and makes design intent easier to scan.
- **Tradeoff/cost**: Premature abstraction would make a six-line bug fix harder to review and could broaden the patch beyond the reported user issue.
- **Affected files**: `packages/web/app/[locale]/courses/page.tsx`; possibly `packages/web/app/globals.css` in a later design-system pass.
- **Confidence**: Medium.
- **Classification**: optional/nit.

## Similar-Issue Scan

Focused searches for inverted light-default patterns found no remaining `bg-slate-950 text-white` CTA block on `packages/web/app/[locale]/courses/page.tsx` after the patch. The remaining default-dark sections in the related Career Playbook landing and methodology components appear intentional dark editorial sections, not accidental light-theme inversions:

- `packages/web/app/[locale]/career-playbook/page-client.tsx:192`, `:253`, `:277`, `:326`
- `packages/web/components/career-playbook/methodology/InteractiveDemo.tsx:108`
- `packages/web/components/career-playbook/methodology/MethodologySection.tsx:67`

This supports accepting the current source fix without widening scope.

## Top 3 Recommended Next Improvements

1. **Add the course landing CTA regression test**: best risk reduction for the exact reported issue; worth doing before delivery if one small test edit is acceptable.
2. **Add `focus-visible` treatment to the course landing CTAs**: high user/accessibility value, small implementation cost, but can be tracked separately if the current patch must stay color-only.
3. **Track page-local CTA/surface class consolidation only after repeated edits**: useful for maintainability, but optional polish now and not worth blocking this fix.

## Acceptance Recommendation

**Defer source changes except the regression test if the orchestrator wants one more small safety edit.** The CTA color fix itself is acceptable as-is. No must-fix improvement blocks acceptance.

## Verification Notes

I did not re-run the parent quality gates. Parent reported browser smoke for `/ru/courses` light/dark computed colors, `git diff --check`, `pnpm --filter @megacampus/web type-check`, and `pnpm --filter @megacampus/web build`.

Local review commands used: branch status, focused diff against `origin/develop`, line-number inspection of `packages/web/app/[locale]/courses/page.tsx`, focused `rg` searches for inverted theme patterns, existing landing unit-test inspection, Playwright config inspection, and design-token inspection.

# Risks / Follow-ups

- No must-fix improvement was found.
- Worth tracking if accepted: add a focused course landing CTA light/dark regression test.
- Worth tracking separately: add visible `focus-visible` styling to course landing CTAs.
- Optional polish: consolidate repeated course landing surface/CTA classes only if future edits keep touching the same page.
