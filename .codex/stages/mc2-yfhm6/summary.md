# Stage Summary: mc2-yfhm6

Updated: 2026-06-05
Branch: `codex/career-playbook-visibility-owner`
Beads: `mc2-yfhm6`

## Scope

- Added course-style Career Playbook visibility: `private`, `organization`, and `public`.
- Made `career_playbooks.visibility` canonical while keeping `is_public` as a public-link compatibility mirror.
- Added owner/read-only permissions to Career Playbook library and viewer responses.
- Scoped library listing at the database query level and selected only library-card columns instead of fetching full playbook rows through the admin client.
- Made `career_playbook_sources` read policy owner/superadmin-only because source text can contain private company context.
- Updated the production library card UI to use the course-style visibility dropdown for owners and a read-only state for non-owner organization readers.
- Updated the production reader so non-owners do not see the right management inspector, block edit/regenerate controls, or the block editor.

## Routing

- Classification: medium/complex because this changed database schema, RLS, backend tRPC contracts, shared types, frontend library/reader behavior, tests, and durable docs.
- Documentation: local repo docs and existing course visibility implementation; no external dependency docs needed because the change follows established local Supabase/tRPC/React patterns.
- Selected skills: `orchestrator-stage`, `task-router`, `superpowers:executing-plans`, `superpowers:subagent-driven-development`, `superpowers:verification-before-completion`, `orchestration-closeout`, `code-review`, `frontend-aesthetics`.
- Selected agents/personas: local implementation; visible read-only `correctness_reviewer` and `improvement_reviewer` for quality gates.
- Catalog candidates: none; installed QUALITY_PACK agents and local skills fit.
- Knowledge graph: Graphify report reviewed and focused query used before implementation; graph refresh decision happens during closeout.

## Parallel Decomposition

| Stream        | Goal                                                                    | Owner             | Write zone                                      | Dependencies                  | Verification                                       | Decision   | Reason                                                     |
| ------------- | ----------------------------------------------------------------------- | ----------------- | ----------------------------------------------- | ----------------------------- | -------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| Backend/data  | Migration, RLS/access model, tRPC mutation, response permissions        | local             | backend router/service, migration, shared types | gates frontend contract       | backend unit tests, migration contract, type-check | sequential | shared contract and frontend behavior depend on this first |
| Frontend/UI   | Library dropdown/read-only state and reader owner-only management layer | local             | web library, store, reader, messages, tests     | backend response contract     | web unit tests, lint, type-check, build            | sequential | tightly coupled with backend response shape                |
| Review        | Catch correctness/UX regressions                                        | visible subagents | read-only                                       | implementation/gates complete | reviewer reports                                   | parallel   | independent read-only review streams                       |
| Docs/closeout | Update stable docs, Beads, handoff, closeout evidence                   | local             | `.codex`, docs, Beads                           | verification/review complete  | closeout checks                                    | sequential | final truth depends on completed verification              |

## Verification

- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/career-playbook-library-service.test.ts tests/unit/career-playbook-visibility-migration.test.ts`.
- Passed: `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/viewer.test.tsx`.
- Passed: targeted Prettier check for changed TS/TSX/JSON files.
- Passed: targeted web ESLint for changed web files.
- Passed: targeted backend ESLint for changed backend files with one non-blocking existing-style warning: `library-service.ts` exceeds `max-lines`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build` with existing Browserslist and `url.parse()` warnings.
- Review gate: visible read-only `correctness_reviewer` and `improvement_reviewer` findings were reviewed; must-fix findings were addressed before final gates.

## Documentation

- docs-reviewed: updated - `docs/career-playbook/README.md`, `docs/career-playbook/architecture.md`, `.codex/project-index.md`, this stage summary, and handoff.
- graph-reviewed: updated - Graphify 0.8.27 refreshed with `graphify update .` and `graphify cluster-only . --no-viz`; report shows 57,247 nodes and 79,382 edges from current `HEAD`.

## Explicit Defers

- Follow-up Beads task `mc2-k2qih` tracks panel animation, active TOC section, and TOC auto-scroll polish.
- Browser smoke for authenticated owner/non-owner production records depends on available test accounts and data; unit tests, type-check, and build cover the behavior locally.
