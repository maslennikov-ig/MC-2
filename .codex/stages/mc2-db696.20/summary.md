# Stage mc2-db696.20 Summary

Status: Role-title suggestions implemented locally; PR-ready after verification
Updated: 2026-05-23
Branch: `codex/career-playbook-role-suggestions`
Base: `origin/develop` @ `17e826ee49ca862857cc832c562daf525a28211e`

## Scope Delivered

- Added a small language-aware role-title suggestion input for the first `position` question in the Career Playbook / "Должностная инструкция" constructor.
- Kept manual entry available and wrote both typed and selected role titles through the existing fixed-answer wizard state.
- Added a tracked RU/EN seed list with aliases for common roles; no live API, payment, schema, or backend dependency was introduced.
- Updated RU/EN wizard copy and corrected one stale Russian `Role Guide` question string to `должностную инструкцию`.
- Updated focused unit and E2E expectations for the new wording and suggestion behavior.

## Routing And Delegation

- Classification: medium/complex.
- Skills used: `orchestrator-stage`, `task-router`, `frontend-aesthetics`, `ux-researcher-designer`, `ui-design-system`, `webapp-testing`, `code-review`, `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`.
- 21st.dev was checked for autocomplete/combobox inspiration; returned examples implied extra component dependencies, so no code was imported.
- LazyWeb MCP was requested but no local tool was available to the orchestrator; visible research used available web/source references instead.
- Visible spawned subagents:
  - Lookup: UI reference research.
  - Atlas: occupation/role knowledge-base research.
  - Lorentz: existing implementation audit.
- Catalog-only candidates were not promoted.

## Research Decisions

- UI direction: editable combobox/autocomplete near the beginning of the constructor, compact list, no taxonomy browser, no blocking manual entry.
- Knowledge base direction: static curated seed list for MVP; ESCO is the best later build-time subset candidate, O\*NET is English/US-first, ISCO is a backbone taxonomy, and Lightcast is not an MVP dependency without access/licensing review.
- Multilingual behavior: UI copy is localized, suggestions use locale-aware labels with an alternate-language line where useful.

## Beads

- `mc2-db696.20` tracks this implementation under parent `mc2-db696`.

## Verification Evidence

- TDD red check before implementation: focused wizard unit test failed because `Подходящие роли` was absent.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx` - passed, 17 tests.
- `pnpm type-check` - passed.
- `SUPABASE_SERVICE_ROLE_KEY=test-service-role NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon pnpm build` - passed.
- `PLAYWRIGHT_PORT=3104 pnpm --dir packages/web exec playwright test tests/e2e/career-playbook/wizard-phase-a.spec.ts --project=chromium --reporter=list` - unauthenticated test passed; authenticated test skipped because `TOKEN` is not set.
- `git diff --check` - passed.
- `scripts/orchestration/validate_artifact.py .codex/stages/mc2-db696.20/artifacts/lookup-ui-references.md .codex/stages/mc2-db696.20/artifacts/atlas-role-knowledge-base.md .codex/stages/mc2-db696.20/artifacts/lorentz-implementation-audit.md` - passed.
- `scripts/orchestration/check_stage_ready.py mc2-db696.20` - passed.
- `scripts/orchestration/run_process_verification.sh` - passed.
- `scripts/orchestration/run_stage_closeout.py --stage mc2-db696.20` - passed on rerun with a longer command timeout; the first 180s wrapper timeout stopped during repeated build finalization and was not treated as pass evidence.

## Explicit Defers

- No large taxonomy import in MVP.
- Authenticated browser screenshot/flow verification remains unavailable in this local session without `TOKEN` or storage state; unauthenticated gate was verified.
