# QA Report — UI Redesign Phase 1

Date: 2026-04-08

## Summary

- Total checks: 26
- Passed: 17
- Failed: 9
- Warnings: 2

Note: full visual matrix was captured for all 3 viewports and 2 locales. Full interactive flows were exercised on representative desktop runs; responsive/mobile conclusions are based on dedicated 375px screenshots plus shared-component behavior where applicable.

## Results by Screen

### Landing Page

| Check                            | 1440px | 768px | 375px | RU  | EN  |
| -------------------------------- | ------ | ----- | ----- | --- | --- |
| Header glass-panel               | ✅     | ✅    | ✅    | ✅  | ✅  |
| Hero layout, badge and pill CTAs | ✅     | ✅    | ✅    | ✅  | ✅  |
| ShaderBackground behind hero     | ❌     | ❌    | ❌    | ❌  | ❌  |
| Auth CTA opens modal             | ✅     | ✅    | ✅    | ✅  | ✅  |
| Nav link scrolls to `#features`  | ✅     | ✅    | ✅    | ✅  | ✅  |
| Language switcher changes locale | ❌     | ❌    | ❌    | ❌  | ❌  |
| Locale consistency               | ❌     | ❌    | ❌    | ❌  | ✅  |

### Auth Modal

| Check                                            | 1440px | 768px | 375px | RU  | EN  |
| ------------------------------------------------ | ------ | ----- | ----- | --- | --- |
| Glass overlay, blur, gradient title              | ✅     | ✅    | ✅    | ✅  | ✅  |
| Social buttons are Google + GitHub               | ✅     | ✅    | ✅    | ✅  | ✅  |
| Registration tab shows name/email/password/terms | ✅     | ✅    | ✅    | ✅  | ✅  |
| Forgot password flow and back arrow              | ❌     | ❌    | ❌    | ❌  | ❌  |
| Empty submit shows visible validation messages   | ❌     | ❌    | ❌    | ❌  | ❌  |

### Course Catalog

| Check                                        | 1440px | 768px | 375px | RU  | EN  |
| -------------------------------------------- | ------ | ----- | ----- | --- | --- |
| Dark visual theme, stats bar and filter bar  | ✅     | ✅    | ✅    | ✅  | ✅  |
| Course cards use glass/ghost-border styling  | ✅     | ✅    | ✅    | ✅  | ✅  |
| Search filters courses by name               | ✅     | ✅    | ✅    | ✅  | ✅  |
| Status/difficulty/sort controls update state | ✅     | ✅    | ✅    | ✅  | ✅  |
| Course card click navigates to detail        | ❌     | ❌    | ❌    | ❌  | ❌  |
| Locale consistency                           | ❌     | ❌    | ❌    | ✅  | ❌  |
| Mobile single-column stacking                | ✅     | ✅    | ✅    | ✅  | ✅  |

### Course Detail

| Check                                    | 1440px | 768px | 375px | RU  | EN  |
| ---------------------------------------- | ------ | ----- | ----- | --- | --- |
| Dark background and gradient atmosphere  | ✅     | ✅    | ✅    | ✅  | ✅  |
| Sidebar, toolbar and next-button styling | ✅     | ✅    | ✅    | ✅  | ✅  |
| Active lesson highlight                  | ✅     | ✅    | ✅    | ✅  | ✅  |
| Lesson selection loads content           | ✅     | ✅    | ✅    | ✅  | ✅  |
| Collapse/expand sidebar works clearly    | ❌     | ❌    | ❌    | ❌  | ❌  |
| Back to courses link works               | ✅     | ✅    | ✅    | ✅  | ✅  |
| Locale consistency                       | ❌     | ❌    | ❌    | ✅  | ❌  |

## Failed Checks (details)

- Landing Page: ShaderBackground behind hero. Expected animated canvas/WebGL layer behind hero; actual render contains no visible shader canvas. Severity: P2. Screenshot: `qa-screenshots/landing-1440-ru.png`
- Landing Page: Language switcher changes locale. Expected visible RU/EN switcher in header; actual locale changes only by manual URL prefix and no switcher is exposed. Severity: P2. Screenshot: `qa-screenshots/landing-1440-ru.png`
- Landing Page: RU locale consistency. Expected fully Russian UI; actual RU landing still contains mixed English copy such as `Real-time мониторинг`. Severity: P3. Screenshot: `qa-screenshots/landing-1440-ru.png`
- Auth Modal: Forgot password flow and back arrow. Expected dedicated forgot-password state with clear back navigation; actual state change is not clearly rendered and the flow is visually indistinguishable from the base modal. Severity: P2. Screenshot: `qa-screenshots/auth-1440-ru-after-forgot.png`
- Auth Modal: Empty submit validation. Expected visible inline validation errors on empty submit; actual modal does not show clear error messaging. Severity: P2. Screenshot: `qa-screenshots/auth-1440-ru-before-validation.png`
- Course Catalog: Course card click navigates to detail. Expected mouse click on the card body to open detail; actual body click did not navigate reliably in desktop automation and keyboard `Enter` on focused card was needed to open the course. Severity: P1. Screenshot: `qa-screenshots/catalog-1440-ru-after-card-click.png`
- Course Catalog: EN locale consistency. Expected English catalog UI and content; actual EN catalog keeps Russian course/module titles and mixed copy. Severity: P2. Screenshot: `qa-screenshots/catalog-375-en.png`
- Course Detail: Collapse/expand sidebar works clearly. Expected obvious width/state change; actual toggle affordance does not produce a clear sidebar collapse state. Severity: P2. Screenshot: `qa-screenshots/detail-1440-ru-after-sidebar-toggle.png`
- Course Detail: EN locale consistency. Expected fully English detail page; actual EN detail still shows Russian lesson titles, section names and body content. Severity: P2. Screenshot: `qa-screenshots/detail-1440-en.png`

## Console Errors

- New repeated browser-console issue on page load: CSP `connect-src` contains invalid wildcard sources such as `http://10.*`, `http://192.168.*`, `http://172.16.*` through `http://172.31.*`. This is new noise outside expected Supabase/tRPC errors and should be cleaned up because the browser ignores those sources.

## Recommendations

- Restore the hero shader layer or remove the requirement from the design spec; right now the visual depth relies only on gradients.
- Add a visible RU/EN locale switcher to the header so locale QA does not depend on hand-entered URL prefixes.
- Finish EN localization for catalog/detail data surfaces; the shell is translated, but course titles, section labels and lesson content remain Russian.
- Make empty-form validation explicit in the auth modal with inline error text and clearer state transitions for forgot-password mode.
- Fix mouse-click navigation on catalog cards and make sidebar collapse behavior on detail visibly measurable.
