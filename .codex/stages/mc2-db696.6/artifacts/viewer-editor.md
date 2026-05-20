---
schema_version: orchestration-artifact/v1
artifact_type: local-implementation
task_id: mc2-db696.6
stage_id: mc2-db696.6
agent_type: orchestrator
subagent_model: inherit_orchestrator
reasoning_effort: medium
model_reasoning_rationale: frontend route, store, shared contract, UI, and test implementation with review fixes
repo: mc2
branch: feature/career-playbook-viewer-editor
base_branch: feature/career-playbook-frontend-phase-b
base_commit: 883df2e462e53aad86347b3d488b5e3d5883f9e7
worktree: /home/me/code/mc2
write_zone:
  - packages/shared-types/src/career-playbook.ts
  - packages/web/app/[locale]/career-playbook/[id]/
  - packages/web/app/[locale]/career-playbook/new/auth-required-client.tsx
  - packages/web/components/career-playbook/viewer/
  - packages/web/messages/en/career-playbook.json
  - packages/web/messages/ru/career-playbook.json
  - packages/web/stores/use-career-playbook-store.ts
  - packages/web/tests/unit/career-playbook-store.test.ts
  - packages/web/tests/unit/components/career-playbook/
  - packages/web/tests/e2e/career-playbook/viewer-editor.spec.ts
success_criteria:
  - authenticated viewer route exists for /career-playbook/[id]
  - viewer renders 27 ordered blocks with TOC and markdown/Mermaid handoff
  - edit/regenerate sheet and actions bar are wired to frontend store seams
  - streaming view shows block progress and thinking stream toggle
  - backend skeleton fallback is explicit and does not mask non-skeleton failures
selected_docs:
  - docs/plans/quiet-waddling-starfish.md
  - docs/plans/career-playbook/05-frontend-architecture.md
  - docs/plans/career-playbook/2026-05-14-viewer-editor-implementation.md
selected_skills:
  - orchestration-setup
  - orchestrator-stage
  - superpowers:test-driven-development
  - superpowers:requesting-code-review
  - superpowers:verification-before-completion
selected_agents:
  - Socrates: backend/shared/frontend contract read-only
  - Lorentz: frontend UI/testing pattern read-only
  - Bohr: code review read-only
catalog_candidates:
  - none - existing codebase patterns, Context7, and Lazyweb references were sufficient
parallel_group: phase-6-viewer-editor
depends_on_streams:
  - contract-ui-read
  - viewer-ui-read
parallel_decision: mixed
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no write-heavy child worktrees were created for Phase 6; read-only subagents made no filesystem changes
risk_level: medium
verification:
  - pnpm --filter @megacampus/shared-types build: passed
  - pnpm --filter @megacampus/web test tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook: passed, 52 tests
  - pnpm type-check: passed
  - pnpm lint: passed with existing unrelated warnings
  - pnpm --filter @megacampus/web test:e2e tests/e2e/career-playbook/viewer-editor.spec.ts --project=chromium: passed, 1 passed and 1 skipped because TOKEN is unavailable
  - pnpm build: passed
changed_files:
  - .codex/handoff.md
  - .codex/stages/mc2-db696.6/summary.md
  - .codex/stages/mc2-db696.6/artifacts/viewer-editor.md
  - docs/plans/career-playbook/2026-05-14-viewer-editor-implementation.md
  - packages/shared-types/src/career-playbook.ts
  - packages/web/app/[locale]/career-playbook/[id]/page.tsx
  - packages/web/app/[locale]/career-playbook/[id]/page-client.tsx
  - packages/web/app/[locale]/career-playbook/new/auth-required-client.tsx
  - packages/web/components/career-playbook/viewer/ActionsBar.tsx
  - packages/web/components/career-playbook/viewer/BlockEditor.tsx
  - packages/web/components/career-playbook/viewer/PlaybookViewer.tsx
  - packages/web/components/career-playbook/viewer/StreamingView.tsx
  - packages/web/messages/en/career-playbook.json
  - packages/web/messages/ru/career-playbook.json
  - packages/web/stores/use-career-playbook-store.ts
  - packages/web/tests/e2e/career-playbook/viewer-editor.spec.ts
  - packages/web/tests/unit/career-playbook-store.test.ts
  - packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx
  - packages/web/tests/unit/components/career-playbook/viewer-page.test.tsx
  - packages/web/tests/unit/components/career-playbook/viewer.test.tsx
explicit_defers:
  - Real viewer/editor/generation-status backend transport is tracked as mc2-ekaup.
  - PDF export remains tracked by mc2-db696.8.
  - JD/course bridge remains tracked by mc2-db696.9.
  - Library/share/RLS/public viewer remains tracked by mc2-db696.10.
---

# Summary

Implemented the Phase 6 Career Playbook viewer/editor frontend. The new authenticated route renders a generated Role Guide with a left table of contents, block cards, markdown/Mermaid rendering, right-side markdown editor sheet, regenerate instruction flow, actions bar, and generating-state streaming view.

# Verification

- `pnpm --filter @megacampus/shared-types build`: passed.
- `pnpm --filter @megacampus/web test tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook`: passed, 52 tests.
- `pnpm type-check`: passed.
- `pnpm lint`: passed with existing unrelated warnings.
- `pnpm --filter @megacampus/web test:e2e tests/e2e/career-playbook/viewer-editor.spec.ts --project=chromium`: passed, 1 unauthenticated smoke passed and 1 authenticated smoke skipped because `TOKEN` is unavailable.
- `pnpm build`: passed.

# Risks / Follow-ups

Backend viewer transport is not implemented yet. The frontend creates a local preview only for skeleton backend errors (`METHOD_NOT_SUPPORTED` / not implemented) and leaves real backend failures visible as load errors. The real transport follow-up is tracked as `mc2-ekaup`; PDF, course bridge, and share/public viewer remain in their existing later Beads tasks.
