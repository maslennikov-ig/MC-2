# B6: Удаление expansion_areas из Stage 4

## Контекст

Аудит LLM-генерируемых полей выявил, что `expansion_areas` генерируется в Phase 3 (Expert Analysis) условно (при `information_completeness < 80%`), но **не потребляется** ни Stage 5, ни Stage 6, ни UI. Стоимость: ~110-220 токенов на курс. `research_flags` **остаётся** — активно используется в Stage 5 для RAG-решений (`qdrant-search.ts:154-155`).

## Решение

Удалить `expansion_areas` из типов, схем, промптов, assembly и тестов. Обратная совместимость обеспечена — старые курсы с `expansion_areas` в JSONB парсятся корректно (Zod `.strip()` игнорирует неизвестные поля).

---

## Шаги

### 1. shared-types: типы и схемы

**`packages/shared-types/src/analysis-result.ts`**:

- Строка 134: удалить `expansion_areas: ExpansionArea[] | null;`
- Строки 172-180: удалить интерфейс `ExpansionArea` целиком
- Строка 289: удалить `expansion_areas: ExpansionArea[] | null;` из `Phase3Output`

**`packages/shared-types/src/analysis-schemas.ts`**:

- Строки 434-442: удалить `ExpansionAreaSchema` целиком
- Строка 453: удалить `expansion_areas: z.array(ExpansionAreaSchema).nullable()` из `Phase3OutputSchema`
- Строка 576: удалить `expansion_areas: z.array(ExpansionAreaSchema).nullable()` из `AnalysisResultSchema`
- Строка 621: удалить `export type ExpansionArea = z.infer<typeof ExpansionAreaSchema>;`
- Строка 628: удалить `export type ExpansionAreaInput = z.infer<typeof ExpansionAreaSchema>;`

Затем: `pnpm --filter @megacampus/shared-types build`

### 2. Phase 3: промпт и логика

**`packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-3-expert.ts`**:

- Строка 58: удалить `expansion_areas?: unknown;` из `RawPhase3Output`
- Строки 71-83: удалить `expansion_areas` из локальной Zod-схемы
- Строки 182-196: удалить TASK 2 (IDENTIFY EXPANSION AREAS) из промпта
- Строки 210-222: удалить `"expansion_areas"` из примера JSON в промпте
- Строка 343: удалить `expansion_areas: mainPhaseOutput.expansion_areas ?? null,`

### 3. Phase 5: assembly и валидация

**`packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-5-assembly.ts`**:

- Строка 253: удалить `expansion_areas: input.phase3_output.expansion_areas ?? null,`
- Строки 337-340: удалить блок валидации `expansion_areas`

### 4. Orchestrator и Handler: логирование

**`packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`**:

- Строка 651: удалить `expansion_areas_count: phase3Output.expansion_areas?.length || 0,`

**`packages/course-gen-platform/src/stages/stage4-analysis/handler.ts`**:

- Строка 826: удалить `expansion_areas: analysisResult.expansion_areas?.length || 0,`

### 5. Тесты (20 файлов с упоминаниями)

Делегировать субагенту `test-writer` — удалить `expansion_areas` из всех фикстур и assertions:

- `tests/fixtures/analysis-result-fixture.ts` — удалить `expansion_areas: null`
- `phases/__tests__/phase-3-expert.test.ts` — удалить expansion_areas из моков, удалить тест "should allow null expansion_areas when completeness is high"
- `tests/unit/phase-3-expert.test.ts` — то же (дубликат)
- `phases/__tests__/phase-4-synthesis.test.ts` — удалить из мока Phase 3
- `services/analysis/__tests__/phase-5-assembly.test.ts` — удалить из моков и assertions
- `tests/unit/phase-4-synthesis.test.ts` — удалить из мока
- `tests/integration/analysis-pipeline-enhanced.test.ts` — удалить массив expansion_areas из мока
- `tests/integration/stage4-detailed-requirements.test.ts` — удалить STEP 6 проверку expansion_areas
- `__tests__/backward-compat.test.ts` — удалить из мока
- `stage5-generation/regeneration/__tests__/dependency-graph-builder.test.ts` — удалить `expansion_areas: null`
- `stage5-generation/regeneration/__tests__/context-assembler.test.ts` — удалить `expansion_areas: null`
- `stage5-generation/__tests__/analysis-formatters.test.ts` — удалить `expansion_areas: null`
- `tests/unit/regeneration/dependency-graph-builder.test.ts` — удалить `expansion_areas: null`
- `tests/unit/regeneration/context-assembler.test.ts` — удалить `expansion_areas: null`

### 6. Документация (опционально)

**`src/stages/stage4-analysis/README.md`**: удалить упоминания expansion_areas (строки 122, 245)
**`docs/VALIDATION-PRINCIPLE.md`**: проверить упоминания

---

## НЕ трогать

- `research_flags` — активно используется Stage 5 RAG
- `field-name-fix.ts` — нет маппинга `expansionAreas`
- БД — миграция не нужна, старые JSONB данные игнорируются
- `packages/web` — нет ссылок на `expansion_areas`

## Верификация

1. `pnpm --filter @megacampus/shared-types build` — rebuild типов
2. `pnpm type-check` — нет TS ошибок
3. `npx vitest run` в `course-gen-platform` — тесты проходят
4. `npx eslint` на изменённых файлах — 0 errors
