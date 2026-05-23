# Career Playbook Role Title Suggestions - Production-Grade Plan

Date: 2026-05-23
Beads: `mc2-db696.21`
Branch: `codex/career-playbook-role-suggestions`

## Goal

Upgrade the first `position` question in the Career Playbook / "Должностная инструкция" constructor from a minimal autocomplete to a production-grade role intelligence input.

The input should help users choose a normalized role title when useful, while preserving manual entry as a first-class path. This remains a frontend-only enhancement for this stage.

## Accepted Constraints

- No billing or payment scope.
- No direct push to `develop` or `master`.
- No live external role taxonomy API in the user flow.
- No backend schema change for this stage.
- Selected or typed role title must continue to flow through the existing fixed-answer wizard state.
- RU and EN UI are both supported.
- Russian UI must keep the product name `Должностная инструкция`; do not regress to `руководство роли`.

## Reference Direction

The selected pattern combines:

- WAI-ARIA APG editable combobox with list autocomplete and manual selection:
  https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- MDN combobox role guidance for `aria-expanded`, `aria-controls`, `aria-autocomplete`, and `aria-activedescendant`:
  https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/combobox_role
- LinkedIn Recruiter-style job title normalization: suggest standard titles, but keep the title editable.
- Typeform-style one-question flow: suggestions should support the current question, not become a separate taxonomy browser.
- Airtable-style compact controlled vocabulary: the list can be curated and grouped without exposing a large data model.

21st.dev combobox examples were used as component inspiration only. They are not imported because they imply extra dependencies and do not match the existing MC2 UI system closely enough.

LazyWeb MCP was requested, but no LazyWeb tool is available in the current orchestrator runtime. Prior visible research found that official/product references above were more actionable than generic screenshots.

## Product Behavior

### Empty Focus

When the role input receives focus with an empty value, show a compact list of popular roles. This makes the control feel useful before the user knows what to type.

Rules:

- Show up to 8 roles.
- Use `popularityRank` and locale priority for ordering.
- Do not call `onValueChange` until the user types or selects a suggestion.
- Keep manual input available.

### Typed Matches

When the user types, search across labels, aliases, acronyms, and keywords in both supported languages.

Rules:

- Current locale exact/prefix matches outrank alternate locale matches.
- Exact acronym matches outrank loose aliases, but ambiguous acronyms stay ordered by curated priority.
- Prefix matches outrank includes matches.
- Keywords help discovery but rank below aliases.
- Results are grouped by department for scanability.
- Group headers are not options.

### No Results

When there are no matches, show a clear manual-entry fallback, such as `Использовать "<typed title>"`.

Rules:

- Continue button should still work because the first question remains a normal required open answer.
- Enter should not silently replace the typed value.
- No hidden auto-normalization on blur.

### Selected Suggestion

Selecting a suggestion by mouse, touch, or keyboard writes the localized display label into the existing fixed answer value.

For this stage, normalized metadata stays local to the suggestion list. Persisting a separate `role_id`, `source`, or `confidence` is deferred until backend schema work is explicitly scoped.

## Data Policy

Use a curated static seed list of modern knowledge-work roles, not a large imported taxonomy.

Recommended seed size for this stage: roughly 80-120 roles. The implementation can land a smaller but meaningfully broader first curated set if the data shape supports expansion.

Implementation note: the first production-grade version uses 75 curated role records. That is intentionally below a full taxonomy, but broad enough to cover common product, engineering, data, design, sales, marketing, support, operations, HR, finance, and legal roles while keeping the bundle small and reviewable.

Each role should support:

- stable `id`
- `department`
- finer `group`
- optional `seniority`
- RU/EN `labels`
- RU/EN `aliases`
- `acronyms`
- RU/EN `keywords`
- `popularityRank`
- optional `localePriority`
- `source: "curated"` for now

Future ESCO integration should be build-time/import-time only, with explicit attribution and RU fallback policy. O\*NET, ISCO, and Lightcast remain future research/enrichment inputs, not runtime dependencies for this constructor input.

## Accessibility Contract

- The input remains an editable `input` with `role="combobox"`.
- Popup uses `role="listbox"`.
- Selectable rows use `role="option"`.
- DOM focus stays on the input.
- Active option is exposed through `aria-activedescendant`.
- `aria-expanded` reflects popup state.
- `aria-controls` points to the listbox while open.
- Escape closes the popup without changing the typed value.
- Arrow keys move through selectable options, not group headers.
- Enter selects the active option only when the popup is open and an option is active.
- Tab follows normal form navigation and keeps the typed value.

## Implementation Plan

1. Add failing unit tests for empty popular suggestions, typed grouped matches, no-results manual fallback, keyboard navigation, and locale-aware labels.
2. Expand `role-title-suggestions.ts` with the production data shape, grouped search result model, ranking rules, and popular-role mode.
3. Upgrade `RoleTitleSuggestionInput.tsx` to render grouped results, popular/no-results states, match metadata, manual fallback, and stronger ARIA state.
4. Add RU/EN copy for popular roles, no-results fallback, match hints, and department labels.
5. Update docs, stage summary, and handoff.
6. Verify with focused unit tests, Playwright where possible, `pnpm type-check`, `pnpm build`, and stage closeout.

## Explicit Defers

- Persisted normalized role metadata.
- Live taxonomy API.
- Large ESCO/O\*NET/ISCO/Lightcast imports.
- User-observed popularity analytics.
- Full authenticated browser flow unless `TOKEN` or storage state is available.
