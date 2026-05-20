---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-db696.7
stage_id: mc2-db696.7
agent_type: n/a
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: local orchestrator implemented the coupled route/component/i18n slice; read-only explorers and review subagent inherited defaults
repo: mc2
branch: feature/career-playbook-landing
base_branch: feature/career-playbook-frontend-phase-b
base_commit: 883df2e462e53aad86347b3d488b5e3d5883f9e7
worktree: /home/me/code/mc2
write_zone:
  - packages/web/app/[locale]/career-playbook
  - packages/web/components/career-playbook/methodology
  - packages/web/messages/en/career-playbook.json
  - packages/web/messages/ru/career-playbook.json
  - packages/web/tests/unit/components/career-playbook
  - packages/web/tests/e2e/career-playbook/landing.spec.ts
success_criteria:
  - public /career-playbook landing renders localized hero and CTA
  - methodology section shows five source systems and maps to 26 blocks
  - interactive demo shows annotated B2B sales Role Guide excerpts
  - SEO metadata, OpenGraph/Twitter data, and JSON-LD are present
  - tests cover route, components, and Playwright smoke
selected_docs:
  - docs/plans/quiet-waddling-starfish.md
  - docs/plans/career-playbook/05-frontend-architecture.md
  - docs/job-descriptions/sales-manager-b2b.md
  - Context7: /vercel/next.js App Router params and metadata
  - Context7: /amannn/next-intl server/client translations
  - Lazyweb: Storylane, Workday, Chameleon, Craft, Genius reference patterns
selected_skills:
  - orchestration-setup
  - orchestrator-stage
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:requesting-code-review
  - frontend-aesthetics
  - webapp-testing
selected_agents:
  - explorer: repo-conventions
  - explorer: demo-content
  - default: code-review
  - default: final-code-review
catalog_candidates:
  - none - installed skills and MCP tools were sufficient
parallel_group: phase-7-landing
depends_on_streams:
  - none
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no write-heavy child worktrees were created for this stage; nothing needed removal
risk_level: medium
verification:
  - pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/landing-page.test.tsx tests/unit/components/career-playbook/methodology.test.tsx: passed, 6 tests
  - pnpm --filter @megacampus/web test tests/unit/components/career-playbook tests/unit/career-playbook-store.test.ts: passed, 44 tests
  - scoped eslint for landing files and tests: passed
  - pnpm type-check: passed
  - pnpm lint: passed with existing warnings outside landing scope
  - pnpm --filter @megacampus/web exec playwright test tests/e2e/career-playbook/landing.spec.ts --project=chromium: passed
  - pnpm build: passed
changed_files:
  - docs/plans/career-playbook/2026-05-14-marketing-landing-implementation.md
  - packages/web/app/[locale]/career-playbook/page.tsx
  - packages/web/app/[locale]/career-playbook/page-client.tsx
  - packages/web/components/career-playbook/methodology/InteractiveDemo.tsx
  - packages/web/components/career-playbook/methodology/MethodologySection.tsx
  - packages/web/messages/en/career-playbook.json
  - packages/web/messages/ru/career-playbook.json
  - packages/web/tests/e2e/career-playbook/landing.spec.ts
  - packages/web/tests/unit/components/career-playbook/landing-page.test.tsx
  - packages/web/tests/unit/components/career-playbook/methodology.test.tsx
explicit_defers:
  - mc2-db696.12 real backend follow-up/generation transport
  - mc2-db696.8 PDF export service
  - mc2-db696.9 JD/course bridge
  - mc2-db696.10 library/share/RLS/public viewer
---

# Summary

Implemented the public Career Playbook marketing landing as a localized Next.js App Router page. The route now has server metadata and absolute-URL JSON-LD, a shader-backed hero, methodology cards, 26-block mapping, an annotated interactive demo, value/FAQ sections, and CTA links into the existing constructor flow.

# Scope / Routing

The route and components were implemented locally because route, i18n, and component composition are one tightly coupled UI slice. Two read-only explorers ran in parallel to confirm repo conventions and demo-content mapping. A final read-only code-review subagent found a structured-data URL issue; it was accepted and fixed with RED -> GREEN coverage. Context7 was used for current Next.js and next-intl behavior; Lazyweb was used for design references.

# Verification

- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/landing-page.test.tsx tests/unit/components/career-playbook/methodology.test.tsx`: passed, 6 tests.
- `pnpm --filter @megacampus/web test tests/unit/components/career-playbook tests/unit/career-playbook-store.test.ts`: passed, 44 tests.
- Scoped ESLint for new landing files and tests: passed.
- `pnpm type-check`: passed.
- `pnpm lint`: passed with existing warnings outside landing scope.
- `pnpm --filter @megacampus/web exec playwright test tests/e2e/career-playbook/landing.spec.ts --project=chromium`: passed, 1 test.
- `pnpm build`: passed.

# Delivery / Cleanup

Local implementation in `/home/me/code/mc2`; no child write-heavy worktree needs cleanup. The branch is stacked on `feature/career-playbook-frontend-phase-b`.

# Risks / Follow-ups / Explicit Defers

The landing uses static localized/paraphrased demo excerpts rather than live generation. Backend generation transport, PDF, JD/course bridge, and library/share are tracked in their existing Beads tasks.
