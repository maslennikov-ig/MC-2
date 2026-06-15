---
stage_id: mc2-1uzub
beads: mc2-1uzub
branch: codex/career-playbook-course-preview-bridge
status: closed
---

# Career Playbook Bridge Review-And-Fix Pass

## Scope

Review current uncommitted Role Guide -> course bridge implementation, accept or reject material findings, and fix accepted in-scope issues.

## Review Streams

- `correctness_reviewer` Ledger, run `019ec15f-1540-7292-9b8f-bda21ce4302e`
- `improvement_reviewer` Lens, run `019ec15f-1c2d-71e3-be52-b2b49a1002a0`

## Decisions

- Accepted and fixed: degraded preview when optional business-context source listing fails.
- Accepted and fixed: explicit business-context opt-in now requires authoritative source evidence and rolls back on unavailable evidence.
- Accepted and fixed: private viewer hides create-course action when `viewerPermissions.canCreateCourse` is false.
- Rejected for this pass: localizing size/style option labels, because it is polish scope rather than material correctness.

## Verification

Targeted backend and frontend tests passed after fixes. Stage closeout also passed
`pnpm type-check`, `pnpm build`, process verification, artifact validation, and
docs/project-index checks.

docs-reviewed: updated - `docs/plans/career-playbook/04-course-bridge-flow.md` and `docs/career-playbook/architecture.md` now describe degraded preview, strict explicit business-context evidence, rollback, and permission-gated private viewer action.

project-index: reviewed-no-change - existing `.codex/project-index.md` already lists the Career Playbook backend course bridge, private viewer route, viewer UI, library UI, docs, and verification entrypoints touched by this pass.
