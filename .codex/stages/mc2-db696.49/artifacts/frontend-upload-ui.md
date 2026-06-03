---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-db696.48
stage_id: mc2-db696.49
agent_type: frontend_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: frontend upload/body handling and persisted source status UX affect reliability and user workflow
repo: mc2
branch: codex/career-playbook-business-context
base_branch: codex/career-playbook-business-context
base_commit: c342e8f5
worktree: /home/me/code/mc2-worktrees/career-playbook-business-context
write_zone:
  - packages/web/app/api/career-playbook/upload/route.ts
  - packages/web/components/career-playbook/wizard/BusinessContextStep.tsx
  - packages/web/app/[locale]/career-playbook/new/page-client.tsx
  - packages/web/stores/use-career-playbook-store.ts
  - packages/web/messages/en/career-playbook.json
  - packages/web/messages/ru/career-playbook.json
  - packages/web/tests/unit/api/career-playbook/upload.test.ts
  - packages/web/tests/unit/components/career-playbook/page-client.test.tsx
  - .codex/stages/mc2-db696.49/artifacts/frontend-upload-ui.md
success_criteria:
  - Career Playbook upload route accepts multipart FormData and rejects JSON/base64 request bodies.
  - Client no longer base64-encodes files before upload.
  - Business Context UI shows persisted source filenames/status and removal.
  - Processing sources are visible before follow-ups and do not allow premature follow-up generation.
selected_docs:
  - No external dependency documentation lookup needed; implementation used existing Next route and project FileUpload/tRPC patterns.
selected_skills:
  - superpowers:test-driven-development
  - orchestrator-stage
selected_agents:
  - built-in frontend_specialist
catalog_candidates:
  - none
parallel_group: Stream C
depends_on_streams:
  - mc2-db696.50 backend list/remove source lifecycle endpoint names
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Accepted stream is integrated in the active stage branch; no separate child branch or worktree cleanup remains.
risk_level: medium
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: Internal wizard/upload flow changed; no durable user/operator docs exist for this private constructor path.
graph_reviewed: updated
graph_review_notes: Worker refreshed Graphify; orchestrator will refresh again during final closeout after local fixes.
verification:
  - 'RED observed by worker: targeted vitest failed on old JSON/base64 upload and missing persisted source UI.'
  - 'npm exec --yes pnpm@8.15.0 -- --filter @megacampus/web exec vitest run tests/unit/api/career-playbook/upload.test.ts tests/unit/components/career-playbook/page-client.test.tsx: passed, 21/21 tests after orchestrator fixes'
  - 'pnpm --filter @megacampus/web exec eslint app/[locale]/career-playbook/new/page-client.tsx app/api/career-playbook/upload/route.ts components/career-playbook/wizard/BusinessContextStep.tsx stores/use-career-playbook-store.ts tests/unit/api/career-playbook/upload.test.ts tests/unit/components/career-playbook/page-client.test.tsx: passed'
  - 'pnpm type-check: passed after orchestrator fixes'
changed_files:
  - packages/web/app/api/career-playbook/upload/route.ts
  - packages/web/components/career-playbook/wizard/BusinessContextStep.tsx
  - packages/web/app/[locale]/career-playbook/new/page-client.tsx
  - packages/web/stores/use-career-playbook-store.ts
  - packages/web/messages/en/career-playbook.json
  - packages/web/messages/ru/career-playbook.json
  - packages/web/tests/unit/api/career-playbook/upload.test.ts
  - packages/web/tests/unit/components/career-playbook/page-client.test.tsx
  - .codex/stages/mc2-db696.49/artifacts/frontend-upload-ui.md
explicit_defers:
  - none
---

## Summary

Implemented the frontend upload/UI slice for Career Playbook Business Context.

- `BusinessContextStep` now uploads selected files as `FormData` with `playbookId` and `file`; the client no longer imports or calls `readFileAsBase64`.
- `/api/career-playbook/upload` now rejects explicit non-multipart bodies, rejects oversized `content-length`, parses `request.formData()`, validates `playbookId` and file metadata, and converts file bytes to base64 server-side only for the current `careerPlaybook.sources.uploadFile` tRPC contract.
- Business Context now supports optional persisted source rows from the store, renders filename/status/error compactly, blocks follow-up generation while selected sources are still processing, and exposes an accessible remove button.
- Source statuses and remove labels use the Career Playbook i18n copy surface instead of hard-coded English strings.
- Store now carries `businessContextSources`, hydrates and refreshes them when present, records optimistic processing sources after upload, and provides source list/remove client methods.

## Documentation Impact

api-contract, behavior, tests.

Docs review note: no durable docs update made in this stream because this is an internal wizard/upload implementation slice; backend lifecycle contract docs are owned by sibling backend streams.

## Verification Evidence

- Targeted vitest passed: 2 files, 21 tests.
- Direct frontend TypeScript passed from `packages/web`: `npm exec --yes pnpm@8.15.0 -- exec tsc --noEmit`.
- Targeted ESLint passed on touched frontend files.
- Full root `pnpm type-check` and `@megacampus/web type-check` remain blocked before frontend `tsc` by an unrelated backend type error in `packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts:63`.
- Graph reviewed: updated with `graphify update .`; result `56904 nodes / 78880 edges`.

## Explicit Defers

# Risks / Follow-ups

- None. Orchestrator fixed the backend endpoint name mismatch, added source status polling, and adjusted tests so processing sources cannot move prematurely into follow-up generation.
