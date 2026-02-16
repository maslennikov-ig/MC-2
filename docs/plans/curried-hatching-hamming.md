# Plan: Cleanup dead code + close stale tasks

## Context

При анализе mc2-stfk (интеграция `validateLessonContent()`) обнаружено:

1. **mc2-stfk** — оверинжиниринг: все проверки из `validateLessonContent()` уже выполняются downstream нодами (self-reviewer, judge heuristic filter, mermaid-fix-pipeline)
2. **mc2-2ma7, mc2-xn97, mc2-h67d** — Phase 4 T1/T2/T3 полностью реализованы, задачи не закрыты
3. **content-validator.ts** — мёртвый код (0 импортов, 0 тестов, фасад над функциями, которые используются напрямую в других местах)

---

## Step 1: Close stale Beads tasks

```bash
bd close mc2-stfk --reason="Won't-do: overengineering — all checks already run in self-reviewer + judge heuristic filter. content-validator.ts deleted as dead code."
bd close mc2-2ma7 --reason="Already implemented: migration, RLS, triggers, types, .env.example, restart_from_stage all done"
bd close mc2-xn97 --reason="Already implemented: fractional-indexing installed, order-keys.ts with tests"
bd close mc2-h67d --reason="Already implemented: converters.ts, types.ts with round-trip tests"
```

---

## Step 2: Delete dead code

**Delete**: `packages/course-gen-platform/src/stages/stage6-lesson-content/validation/content-validator.ts`

Confirmation that it's dead:

- 0 imports from any other file (grep verified)
- 0 tests
- 0 barrel re-exports
- All constituent functions (`validateGeneratedContent`, `checkLanguageConsistency`, `checkMermaidSyntax`, `checkSectionDuplication`, `checkPromptMarkers`, `sanitizeMermaidBlocks`) are imported directly where needed

---

## Step 3: Check if validation/ directory has other files

If `content-validator.ts` is the only file in `validation/`, delete the directory too.

---

## Verification

```bash
pnpm type-check       # no broken imports
pnpm --filter course-gen-platform build
```

---

## Files

| Action | File                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- |
| DELETE | `packages/course-gen-platform/src/stages/stage6-lesson-content/validation/content-validator.ts` |
| CLOSE  | mc2-stfk, mc2-2ma7, mc2-xn97, mc2-h67d                                                          |
