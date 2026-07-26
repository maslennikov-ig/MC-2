# Stage Summary: mc2-jc275

Updated: 2026-07-26
Branch: `codex/self-hosted-qdrant-platform-plan`
Beads: `mc2-jc275`

## Scope

- Fully removed Career Playbook numeric-review extraction, classification, shared contracts, internal tRPC mutation, correction service, frontend store action, viewer panel, Markdown annotations, navigation, editor, translations, helpers, and obsolete tests.
- Kept ordinary numeric content in generated Markdown unchanged.
- Kept existing stored JSON untouched: Zod normalization now safely strips legacy `numeric_facts`, so no database migration or bulk cleanup is required.
- Added regressions for legacy metadata normalization, plain viewer rendering, generation/regeneration without numeric metadata, and the removed tRPC surface.
- Preserved generic block editing/regeneration, PDF export, final assembly, and public viewing.

## Routing

- Classification: complex because the removal crosses shared contracts, backend generation/API/service code, frontend viewer/store/Markdown behavior, tests, durable docs, and Graphify.
- Execution: one root-owned sequential stream, as explicitly requested; no subagents or extra worktree.
- Documentation: local repository contracts and existing implementation only; no version-sensitive external dependency research was needed.
- Selected skills: `orchestrator-stage`, `task-router`, `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:executing-plans`, `superpowers:verification-before-completion`, `impeccable`, `orchestration-closeout`.
- Selected agents/personas: none; explicit single-stream implementation.
- Catalog candidates: none; installed skills and local code were sufficient.
- Knowledge graph: existing report and a focused query were used before implementation; local graph refreshed during closeout without external semantic services or Git hooks.

## Verification

- TDD red: shared-types legacy `numeric_facts` regression initially failed because metadata survived normalization.
- Passed: shared-types Career Playbook tests, 22 tests.
- Passed: backend library service, group generation, and block regeneration tests, 37 tests.
- Passed: web store/viewer/page-client tests, 34 tests.
- Passed: backend Career Playbook router tests, 43 tests, including absence of `library.updateNumericFact` plus PDF/public transport coverage.
- Passed: final assembler tests, 7 tests.
- Passed: public viewer test, 1 test.
- Passed: targeted web and backend ESLint with no errors; only existing-style warnings for `<img>` and file length.
- Passed: i18n JSON parsing, source reference scan, `git diff --check`, and added debt-marker scan.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`; existing Browserslist and `url.parse()` warnings remain non-blocking.
- Impeccable targeted detection reported one pre-existing blockquote side-border warning in unchanged code; no in-scope UI issue remained.
- Passed: `scripts/orchestration/run_process_verification.sh`.
- Passed: `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-jc275 --verify-group code_change_commands --skip-process-check`.

## Documentation

- docs-reviewed: updated — removed numeric-review behavior and obsolete test commands from `docs/career-playbook/README.md`; updated stage summary and handoff.
- project-index: reviewed-no-change — the Career Playbook documentation entrypoint and repository navigation remain valid.
- graph-reviewed: updated — `graphify update .` rebuilt 53,847 nodes / 75,659 edges, then `graphify cluster-only . --no-viz` produced 6,824 communities.

## Explicit Defers

- None. Legacy `numeric_facts` values remain only inside existing stored JSON by design and are ignored during normalization; this is compatibility behavior, not unfinished cleanup.
