---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.21
stage_id: mc2-jz6y0
agent_type: frontend_worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: E3 metadata trust boundaries, manual/system decision semantics, accessibility, responsive behavior, and an unchanged Phase 0.5 gate require high correctness reasoning.
repo: /home/me/code/mc2
branch: codex/document-evidence-e4
base_branch: codex/self-hosted-qdrant-platform
base_commit: d1d185c5585bdbe40bddc8c5e0e583b891a8c4c9
worktree: /home/me/code/mc2/.worktrees/document-evidence-e4
write_zone:
  - packages/shared-types/src/clarifying-questions.ts
  - packages/shared-types/tests/clarifying-question-contract.test.ts
  - packages/web/components/generation-graph/panels/clarifying/
  - packages/web/messages/en/generation.json
  - packages/web/messages/ru/generation.json
  - packages/web/tests/e2e/document-conflicts-e4.spec.ts
  - packages/web/tests/unit/document-conflicts-e4-fixture-policy.test.ts
  - packages/web/app/(mocks)/mocks/document-conflicts-e4/page.tsx
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.21.md
success_criteria:
  - Material document conflicts render in a distinct RU/EN required block with bounded statements, precise source references, impact, recommendation, rationale, and alternatives.
  - Required manual decisions use accessible mutually exclusive controls and block continuation; informational differences do not block.
  - Automatic system decisions are read-only audit records and cannot be edited as user selections.
  - Canonical suggestion values map to localized labels, and manual supersession submits the validated current-decision CAS token.
  - E3 metadata is runtime-validated at the web boundary, unknown/source-body fields fail closed, React text rendering never injects HTML, and long bounded excerpts use an accessible native disclosure.
  - Existing no-document/ordinary clarification behavior and the backend Phase 0.5 boundary remain unchanged.
selected_docs:
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - Task E4 in docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.20.md
  - packages/shared-types/src/document-evidence.ts
  - packages/shared-types/src/clarifying-questions.ts
selected_skills:
  - /home/me/.lazyweb/repos/lazyweb-skill/skills/lazyweb-design/SKILL.md
  - /home/me/code/mc2/.agents/skills/frontend-aesthetics/SKILL.md
  - /home/me/code/mc2/.agents/skills/ui-design-system/SKILL.md
  - /home/me/code/mc2/.agents/skills/webapp-testing/SKILL.md
  - /mnt/c/Users/masle/.codex/skills/playwright/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/test-driven-development/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/verification-before-completion/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/receiving-code-review/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/systematic-debugging/SKILL.md
selected_agents:
  - frontend worker
  - UI/accessibility reviewer pending parent independent review
catalog_candidates:
  - none - installed UI, browser, TDD, and verification assets covered E4
parallel_group: E4-conflict-ui
depends_on_streams:
  - mc2-jz6y0.20
parallel_decision: isolated UI stream running in parallel with E5 and E6; implementation stayed sequential because metadata parsing, grouping, decision controls, and browser fixtures share one UI contract
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Integrated through final reviewed commit c27b9eb; the dedicated worktree and local worker branch were removed. The pushed remote evidence branch and hosted Lazyweb report remain as audit evidence.
risk_level: medium
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: The approved evidence design and E4 plan already describe the distinct conflict block and manual/system behavior. This stream updates RU/EN product messages and its tracked artifact; durable cross-stage/operator docs remain with parent E7/docs_reviewer.
graph_reviewed: used
graph_review_notes: Read the integration graph report and ran a focused query for clarifying UI/question submission before broad reads. The graph predates E3/E4; parent refreshes it after accepted integration because this isolated worker does not own graphify-out.
verification:
  - Focused RED failed on the missing DocumentEvidenceDetails module; panel RED then failed on the missing region and system metadata wiring.
  - Review-remediation RED reproduced stripped/unchecked CAS metadata, dropped canonical suggestion values, machine-code display, optimistic stale-save closure, actionable invalid metadata, and a local-state-only browser fixture.
  - Shared contract GREEN passed 2/2 plus standalone strict TypeScript compilation for optional suggestion value and current-decision token fields.
  - Focused component/policy GREEN passed 20/20 across E3/CAS parsing, unknown-field rejection, RU/EN, canonical-value mapping, stale-CAS edit retention, invalid-metadata blocking, provenance overflow, inert markup, accessible disclosure/radios/focus/progress, no-document behavior, and production fixture redirect.
  - Real-panel Playwright Chromium, mobile-chrome, and dark-mode passed 4 applicable scenarios with 2 expected non-mobile skips and 0 failures.
  - Re-review pinned both wizard transitions to the exact accessible name `Next`, excluding the injected Next Dev Tools control; the declared webpack Chromium/mobile/dark command remained 4 passed, 2 expected skips, 0 failures.
  - Axe WCAG 2 A/AA structural/name/state analysis passed; its color-contrast rule was disabled only because axe 4.11 misreads Tailwind v4 OKLCH in Chromium 149.
  - Browser computed-style RGB/Lab/OKLCH-to-sRGB assertions covered impact, recommendation, source refs, disclosure, radio text, critical question text, badge, and pending error. Light/mobile ratios were 14.66, 17.34, 7.56, 7.35, 17.84, 14.66, 17.87, 17.61; dark ratios were 15.23, 15.76, 7.23, 14.01, 16.28, 16.28, 17.06, 18.11.
  - packages/web type-check passed.
  - packages/web production build passed with synthetic loopback/test Supabase env; the preceding env-less attempt failed only at page collection with `supabaseUrl is required` and was rerun successfully.
  - scripts/orchestration/run_process_verification.sh passed, including git diff --check.
changed_files:
  - packages/shared-types/src/clarifying-questions.ts
  - packages/shared-types/tests/clarifying-question-contract.test.ts
  - packages/web/app/(mocks)/mocks/document-conflicts-e4/page.tsx
  - packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx
  - packages/web/components/generation-graph/panels/clarifying/DocumentConflictSection.tsx
  - packages/web/components/generation-graph/panels/clarifying/DocumentEvidenceDetails.tsx
  - packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx
  - packages/web/components/generation-graph/panels/clarifying/wizard/WizardProgress.tsx
  - packages/web/components/generation-graph/panels/clarifying/wizard/WizardNavigation.tsx
  - packages/web/components/generation-graph/panels/clarifying/wizard/WizardSidebar.tsx
  - packages/web/components/generation-graph/panels/clarifying/__tests__/ClarifyingPanel.document-conflicts.test.tsx
  - packages/web/components/generation-graph/panels/clarifying/__tests__/DocumentEvidenceQuestion.test.tsx
  - packages/web/messages/en/generation.json
  - packages/web/messages/ru/generation.json
  - packages/web/tests/e2e/document-conflicts-e4.spec.ts
  - packages/web/tests/unit/document-conflicts-e4-fixture-policy.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.21.md
explicit_defers:
  - Independent UI/accessibility correctness review, parent integration rerun, Graphify refresh, E7 cross-stage acceptance, and final worktree cleanup remain parent-stage responsibilities.
  - Axe 4.11 OKLCH parsing remains an upstream tooling limitation; the retained browser-side computed-style contrast gate prevents this exclusion from hiding real contrast regressions.
  - Q12, deploy, live reindex, service/secret changes, and all staging/production mutation remain outside E4 and were not performed.
---

# Summary

E4 validates E3 `document-conflict-question-v1` metadata at the web boundary and renders claim conflicts, degraded evidence, and detector-capacity decisions without exposing unbounded or unknown fields. Material conflicts lead the wizard in a distinct `Document conflicts` / `Противоречия в документах` section. Bounded statements, document names, page/heading references, overflow counts, course impact, recommendation, rationale, and alternatives render only as escaped React text.

The client preserves and UUID-validates the optional `current_decision_id`, forwards it as `expectedCurrentDecisionId` when a manual decision is superseded, and leaves the editor actionable when stale CAS is rejected. Optional `suggested_answers[].value` is preserved as the canonical machine identifier while the UI maps stored system values to localized option text; `recommendation:<uuid>` and `continue_limited` are never exposed as user-facing answers. Invalid document metadata fails closed with a blocking, non-actionable error state.

Manual conflict choices use Radix radio semantics with required state, arrow-key selection, labels, a confirm action, and an alert that focuses the first unresolved conflict. Quick “accept all” excludes document decisions so a material resolution remains intentional. Informational document differences are visibly non-blocking. Questions answered by `answer_source=system` show a read-only system-decision explanation with no radio or edit control. Ordinary/no-document courses retain their prior flow and ordering because grouping UI appears only when conflict-category questions exist.

# Lazyweb and design evidence

- Lazyweb health was usable (`supabase`, `openai`, `voyage` OK; `cohere` degraded but non-blocking). Installed skill pack 0.13.7 reported no mandatory update; published version was 0.14.5.
- Quick search: `conflict resolution review form`, desktop, 8 results. Coverage was weak (top similarity 0.409), so the references were treated as adjacent form/radio patterns rather than exact product evidence.
- Current-state capture used the repository dev-only clarifying wizard with synthetic content only: `.lazyweb/lazyweb-design/document-conflicts-2026-07-11/references/current-state.png` (1036x567).
- Screenshot upload used the required presign PUT/resolve flow; no document body or production data was sent.
- Hosted report: https://www.lazyweb.com/report/lazyweb/2a7a6a4d-accf-4a2b-a131-8a3ac1b9a2f2/?source=create
- The report completed without degradation or failed mockup slots and was opened in the Windows default browser with `powershell.exe Start-Process`.
- Manual browser captures: `output/playwright/e4-conflicts-desktop.png` and `output/playwright/e4-conflicts-mobile-ru.png` (local ignored evidence).

# TDD and accessibility chronology

- First RED: the new evidence-details module did not exist, so the suite failed before collecting tests.
- First GREEN: the E3 parser, conflict details, inert-text behavior, native radio semantics, system audit, and informational label reached 8/8.
- Panel RED: the required region and system metadata wiring were absent. GREEN added conflict-first grouping, alert/focus behavior, sidebar/progress separation, no-doc preservation, and decision-aware continuation.
- Additional RED/GREEN cycles pinned `aria-required=true`, actual focus transfer, informational non-blocking continuation, and document-overflow visibility.
- A dev-only synthetic fixture is guarded by a production redirect and a source-policy test. It mounts the real `ClarifyingPanel` with Query/tRPC providers and contains no uploaded source content; Playwright intercepts authentication and every tRPC query/mutation with synthetic course data.
- Playwright proves authenticated tRPC use, conflict/ordinary grouping, pending focus, keyboard selection, CAS payloads, pending-to-canProceed transition, RU translation, canonical system-label mapping, progress naming, structural Axe results, dark mode, and mobile source-reference visibility.
- Axe 4.11 reported false color failures because Tailwind v4 emits OKLCH; screenshots showed the actual dark text. The test therefore keeps all structural/name/state WCAG rules and separately parses real `getComputedStyle()` RGB/OKLCH values, composites ancestor backgrounds, and enforces exact AA ratios above.

# Verification

- `pnpm --filter @megacampus/shared-types exec tsc --noEmit --strict --skipLibCheck --moduleResolution bundler --module esnext --target es2022 tests/clarifying-question-contract.test.ts` and the focused shared test -> passed, 2/2.
- `pnpm --filter @megacampus/web test -- components/generation-graph/panels/clarifying/__tests__/DocumentEvidenceQuestion.test.tsx components/generation-graph/panels/clarifying/__tests__/ClarifyingPanel.document-conflicts.test.tsx tests/unit/document-conflicts-e4-fixture-policy.test.ts` -> 20/20.
- Stable browser server: `pnpm --filter @megacampus/web exec next dev --hostname 0.0.0.0 --port 3125`; webpack was used after the managed Turbopack run deterministically exposed the server-only `isomorphic-dompurify`/jsdom worktree-root failure.
- `TOKEN=<synthetic-JWT> PLAYWRIGHT_BASE_URL=http://10.255.255.254:3125 PLAYWRIGHT_DISABLE_VIDEO=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/google/chrome/chrome pnpm --filter @megacampus/web exec playwright test tests/e2e/document-conflicts-e4.spec.ts --project=chromium --project=mobile-chrome --project=dark-mode --workers=1 --reporter=line` -> 4 passed, 2 expected skips, 0 failed.
- `pnpm --filter @megacampus/web type-check` -> passed.
- `SKIP_ENV_VALIDATION=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon-key SUPABASE_SERVICE_ROLE_KEY=synthetic-service-role-key NEXT_PUBLIC_APP_URL=http://127.0.0.1:3125 pnpm --filter @megacampus/web build` -> passed, 75/75 static pages generated.
- `scripts/orchestration/run_process_verification.sh` -> passed.

# Delivery / Cleanup

The branch is returned for independent review before parent integration. The local development server, Playwright CLI browser session, `.next`, Playwright reports/results/auth, and ignored screenshots are worker-local runtime evidence and are cleaned before handoff. No remote runtime action occurred.

# Risks / Follow-ups / Explicit Defers

The UI consumes only the durable question rows returned by the existing clarification API; it does not move or weaken the Stage 4 Phase 0.5 pause/approval boundary. The parent should independently inspect the diff, rerun focused web tests after integration, and retain the computed contrast test while axe/Chromium OKLCH interoperability remains inconsistent.
