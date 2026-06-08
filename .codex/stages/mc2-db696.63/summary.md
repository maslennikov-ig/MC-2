# Stage mc2-db696.63 Summary

## Scope

- Fixed Career Playbook follow-up generation language drift for Russian drafts.
- Updated the follow-up prompt to pass both the language code and human-readable language name.
- Added SDK-level structured output via LangChain `withStructuredOutput` / JSON Schema for Career Playbook LLM runtime calls.
- Added server-side Russian language validation for generated `question_text`, `options[].label`, and `rationale`, with one bounded repair call on fallback model.
- Kept tolerant parsing for malformed/missing `question_id`, while using a provider-friendly strict schema for structured output.

## Routing / Matrix

| Stream         | Goal                                        | Owner                                          | Write zone                     | Verification        | Decision   | Reason                                                  |
| -------------- | ------------------------------------------- | ---------------------------------------------- | ------------------------------ | ------------------- | ---------- | ------------------------------------------------------- |
| Docs research  | Verify current SDK/provider best practice   | `docs_researcher`                              | read-only                      | source review       | parallel   | Version-sensitive OpenAI/OpenRouter/LangChain behavior. |
| Code mapping   | Compare course-generation language handling | `code_mapper`                                  | read-only                      | repo mapping report | parallel   | Independent investigation stream.                       |
| Implementation | Apply prompt/runtime/follow-up fix          | orchestrator local                             | `packages/course-gen-platform` | unit/type/build     | sequential | Same files needed cohesive local edit after research.   |
| Reviews        | Correctness and improvement review          | `correctness_reviewer`, `improvement_reviewer` | read-only                      | review reports      | parallel   | Independent quality gates after implementation.         |

## Verification

- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/stages/stage-career-playbook/followup-questions.test.ts tests/unit/stages/stage-career-playbook/runtime.test.ts --config vitest.config.unit.ts` - 11 tests.
- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/stages/stage-career-playbook --config vitest.config.unit.ts` - 57 tests.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.
- Passed: `git diff --check`.
- E2E/smoke: not applicable for this backend generation-language fix; no UI flow changed.

## Review Notes

- Prompt regression checklist reviewed locally: user-facing fields are explicitly target-language constrained; `options[].value` remains machine-readable; structured output asks for strict JSON shape; Russian English-heavy and mixed-language outputs repair before save.
- Reviewer feedback accepted: mixed English/Russian detection uses a Cyrillic/Latin ratio instead of a single-Cyrillic-character check; repair cost now aggregates all LLM calls.
- project-index: reviewed-no-change - no routes, entrypoints, directories, integrations, verification commands, or ownership boundaries changed.
- docs-reviewed: no-change-needed - durable public docs/API/DB behavior did not change; this is backend prompt/runtime hardening covered by tests.
- graph-reviewed: updated - `graphify update .` and `graphify cluster-only . --no-viz` completed successfully.

## Explicit Defers

- None.
