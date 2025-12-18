# T055 - Automated E2E Pipeline Validation Task

**Created**: 2025-11-03
**Context**: Session continuation for T055 implementation
**Priority**: HIGH - Critical path validation
**Executor**: Main agent (with orchestration principles)

---

## Task Overview

**Objective**: Автоматизировать и выполнить полную E2E проверку пайплайна (Stages 2-4) согласно задаче T055 из `specs/007-stage-4-analyze/tasks.md`.

**Important Context**:
- T055 помечен как `[EXECUTOR: MANUAL]` для ручного тестирования пользователем
- Пользователь запросил: **сначала я (агент) должен автоматизировать и выполнить все сам**
- Только после полного успеха пользователь будет выполнять ручное тестирование
- Применять принципы атомарности и оркестрации при выполнении

---

## Current Status (из предыдущего контекста)

### ✅ Completed: Stages 2-3 E2E Test

**File**: `packages/course-gen-platform/tests/e2e/t055-full-pipeline.test.ts`

**Status**: ✅ PASSING (Exit Code: 0)

**Что уже работает**:
1. ✅ **Stage 2: Document Upload**
   - Создание тестового курса
   - Загрузка 3 документов в `file_catalog`
   - Копирование файлов на диск (production-compatible paths)
   - Правильная схема: `storage_path`, `hash`, `mime_type`, `vector_status='pending'`

2. ✅ **Stage 3: Document Processing**
   - Вызов `generation.initiate` для создания processing jobs
   - Обработка всех 3 документов через BullMQ handler
   - Индексация 145 векторов в Qdrant
   - Обновление статуса: `vector_status='indexed'`, `chunk_count=N`
   - Проверка завершения обработки

**Bugs Fixed**: 6 критических багов исправлено (см. T055-PIPELINE-VICTORY-REPORT.md)

**Test Output**:
```
[T055] Document processing status: 3/3 completed, 0 failed
[T055] All 3 documents processed successfully
[T055] ✓ Verified 3 documents indexed (145 total vectors)
✓ Test completed successfully
```

---

## Required Work: Stage 4 Automation

### ❌ TODO: Extend E2E Test for Stage 4

**Current Gap**: Существующий тест останавливается после Stage 3. Нужно добавить Stage 4 - Analysis Execution.

**Required Steps** (согласно T055 в tasks.md):

#### 1. Stage 4: Analysis Execution

**Test должен выполнить**:
- Запустить course analysis через tRPC endpoint (аналогично generation.initiate)
- Endpoint: `generation.analyze` или `courses.analyzeContent` (нужно найти правильный)
- Параметры: `courseId` (тот же, что создали в Stage 2)
- Ожидаемое поведение:
  - Создается STAGE_4_ANALYSIS job в BullMQ
  - Job обрабатывается handler'ом
  - Прогресс обновляется в real-time (0% → 100%)
  - Русские сообщения прогресса появляются корректно

**Monitoring в тесте**:
- Poll `courses` table для проверки прогресса
- Ждать `status='completed'` или `analysis_result IS NOT NULL`
- Timeout: 300 секунд (как в Stage 3)
- Логировать прогресс каждые 5 секунд

#### 2. Result Verification

**Test должен проверить**:
- `courses.analysis_result` JSONB column заполнен
- Структура `analysis_result`:
  ```typescript
  {
    phases: Array<{ phase_id: number, status: 'completed', ... }>, // 6 phases
    total_lessons: number, // ≥ 10
    contextual_language: string, // populated
    scope_instructions: string, // generated
    research_flags: string[], // may be empty for general topics
    // ... другие поля
  }
  ```
- Все 6 фаз completed успешно
- `total_lessons >= 10` (минимальное требование)
- `contextual_language` не пустой
- `scope_instructions` сгенерирован
- `research_flags` - массив (может быть пустым)
- HTML sanitization (нет XSS уязвимостей в текстовых полях)

#### 3. Observability Check

**Test должен проверить**:
- Таблица `system_metrics` содержит LLM execution logs
- Метрики для courseId:
  - Token usage записан
  - Cost calculation выполнен
  - Latency metrics присутствуют
  - Model usage per phase (паттерн: 20B → 120B → 20B или аналогичный)
- Query example:
  ```sql
  SELECT * FROM system_metrics
  WHERE metadata->>'course_id' = '<courseId>'
  ORDER BY timestamp DESC
  ```

---

## Execution Strategy (Orchestration Principles)

### Phase 1: Investigation & Planning
**Executor**: Main agent
**Subagent**: problem-investigator (если нужно)

**Tasks**:
1. Найти правильный tRPC endpoint для Stage 4 analysis
   - Grep: `generation.*analyze` или `courses.*analyze`
   - Проверить `packages/course-gen-platform/src/server/routers/`
2. Изучить структуру `analysis_result` JSONB
   - Проверить TypeScript types в `packages/shared-types/`
   - Найти Zod schema для validation
3. Изучить handler для STAGE_4_ANALYSIS job
   - Файл: `packages/course-gen-platform/src/workers/handlers/`
   - Понять логику обработки, progress updates
4. Проверить существующие integration tests для Stage 4
   - Файл: `packages/course-gen-platform/tests/integration/`
   - Понять паттерн тестирования

**Output**: Investigation report с найденными endpoints, schemas, handlers

---

### Phase 2: Test Extension Implementation
**Executor**: integration-tester subagent (preferred) или Main agent
**Atomicity**: Одна задача = расширить тест для Stage 4

**Tasks**:
1. Добавить Stage 4 section в `t055-full-pipeline.test.ts`
2. Implement analysis initiation:
   ```typescript
   // --- STAGE 4: Analysis Execution ---
   console.log('[T055] --- STAGE 4: Analysis Execution ---');

   const analyzeResult = await client.generation.analyze.mutate({
     courseId: testCourseId,
     // ... другие параметры
   });

   if (!analyzeResult.jobId) {
     throw new Error('Failed to initiate analysis');
   }
   ```
3. Implement progress polling:
   ```typescript
   await waitForAnalysisCompletion(testCourseId, 300_000);
   ```
4. Implement result verification:
   ```typescript
   await verifyAnalysisResult(testCourseId);
   await verifyObservabilityMetrics(testCourseId);
   ```

**Output**: Extended test file с Stage 4 coverage

---

### Phase 3: Test Execution & Debugging
**Executor**: Main agent (orchestrator)
**Subagent**: problem-investigator (если тесты fail)

**Tasks**:
1. Запустить расширенный E2E test
   ```bash
   pnpm --filter @megacampus/course-gen-platform test tests/e2e/t055-full-pipeline.test.ts
   ```
2. Если тест падает:
   - Использовать problem-investigator для root cause analysis
   - Создать investigation report
   - Делегировать фиксы appropriate subagents:
     - api-builder: если проблема в endpoint
     - orchestration-logic-specialist: если проблема в job flow
     - integration-tester: если проблема в тесте
3. Повторять до успеха (follow atomicity: один баг → один фикс → один test run)

**Output**: ✅ PASSING test covering Stages 2-4

---

### Phase 4: Quality Gates
**Executor**: code-reviewer subagent

**Tasks**:
1. Launch code-reviewer agent для review изменений:
   - Test code quality
   - Type safety (no `as any`)
   - Error handling
   - Code coverage
2. Address findings (если есть)

**Output**: Code review report, все findings resolved

---

### Phase 5: Final Validation & Reporting
**Executor**: Main agent

**Tasks**:
1. Запустить полный test suite (убедиться нет регрессий)
   ```bash
   pnpm --filter @megacampus/course-gen-platform test
   ```
2. Создать финальный отчет:
   - Что было автоматизировано
   - Какие проблемы найдены и исправлены
   - Покрытие T055 automated tests
   - Ready for manual UAT: YES/NO
3. Update T055-PIPELINE-VICTORY-REPORT.md с результатами Stage 4

**Output**: Final report, готовность к ручному UAT подтверждена

---

## Success Criteria

### Automated Tests Coverage

- [x] ✅ Stage 2: Document Upload (3 documents)
- [x] ✅ Stage 3: Document Processing (145 vectors indexed)
- [ ] ⏳ Stage 4: Analysis Execution (6 phases completed)
- [ ] ⏳ Result Verification (analysis_result structure valid)
- [ ] ⏳ Observability Check (system_metrics populated)

### Test Execution

- [ ] Test exits with code 0 (success)
- [ ] No errors in console output
- [ ] All assertions pass
- [ ] Test duration < 600 seconds (10 minutes)

### Quality Gates

- [ ] Type-check passes
- [ ] Build passes
- [ ] Code review approved
- [ ] No regression in other tests

### Final Status

- [ ] Complete pipeline (Stages 2-4) works end-to-end automatically
- [ ] User can proceed with manual UAT testing (T055 original intent)
- [ ] All bugs documented and fixed
- [ ] Victory report updated

---

## Orchestration Principles (MUST FOLLOW)

### Atomicity
- Один баг → один investigation → один фикс → один test run
- Не смешивать исправления разных проблем в одном коммите
- Каждое изменение должно быть independently verifiable

### Delegation
- Use problem-investigator для complex investigations
- Use integration-tester для test implementation (если нужна помощь)
- Use api-builder если нужно создать/исправить endpoints
- Use code-reviewer для final quality check
- Main agent = orchestrator (координация, не implementation)

### Quality Gates
- Validate каждое изменение перед переходом к следующему
- Type-check после каждого кодового изменения
- Test run после каждого фикса
- Code review перед finalization

### Progress Tracking
- Use TodoWrite для tracking прогресса
- Update todos после каждой completed phase
- Mark in_progress BEFORE starting phase
- Mark completed IMMEDIATELY after phase done

---

## File References

### Test File
- **Primary**: `packages/course-gen-platform/tests/e2e/t055-full-pipeline.test.ts`

### Router Files (likely locations)
- `packages/course-gen-platform/src/server/routers/generation.ts`
- `packages/course-gen-platform/src/server/routers/courses.ts`

### Handler Files
- `packages/course-gen-platform/src/workers/handlers/document-processing.ts` (exists)
- `packages/course-gen-platform/src/workers/handlers/stage-4-analysis.ts` (likely)

### Type Definitions
- `packages/shared-types/src/jobs.ts`
- `packages/shared-types/src/courses.ts`

### Reports (existing)
- `T055-PIPELINE-VICTORY-REPORT.md` (Stages 2-3 success)
- `T055-ORCHESTRATION-SESSION-CONTEXT.md` (previous session context)

---

## Expected Timeline

**Estimated Duration**: 2-4 hours (depending on bugs found)

**Breakdown**:
- Phase 1 (Investigation): 30-60 min
- Phase 2 (Implementation): 60-90 min
- Phase 3 (Debugging): 30-90 min (depending on issues)
- Phase 4 (Review): 15-30 min
- Phase 5 (Validation): 15-30 min

---

## Notes for New Context

1. **Previous Session Summary**: Я исправил 6 критических багов в Stages 2-3. Все детали в `T055-PIPELINE-VICTORY-REPORT.md`.

2. **Current Working State**:
   - Branch: `007-stage-4-analyze`
   - Modified files: `generation.ts`, `t055-full-pipeline.test.ts`
   - Git status показывает несколько uncommitted changes (см. gitStatus в system prompt)

3. **Next Step**: Начать с Phase 1 - Investigation & Planning для Stage 4.

4. **Key Insight**: Не использовать `as any`, проверять типы, следовать production patterns (как было сделано для Stages 2-3).

5. **Testing Pattern**: Используй тот же паттерн polling + timeout, что работает для Stage 3 (см. `waitForProcessingCompletion` в тесте).

---

## Questions to Investigate First

1. **Endpoint Discovery**: Какой tRPC endpoint используется для запуска Stage 4 analysis?
   - Hint: Grep for `analyze`, `STAGE_4`, `analysis_result`

2. **Job Type**: Какой JobType используется для Stage 4?
   - Hint: Check `packages/shared-types/src/jobs.ts` для enum

3. **Handler Location**: Где находится handler для Stage 4 analysis job?
   - Hint: Check `packages/course-gen-platform/src/workers/handlers/`

4. **Schema**: Какая TypeScript type описывает `analysis_result` JSONB?
   - Hint: Check `packages/shared-types/src/courses.ts`

5. **Existing Tests**: Есть ли уже integration tests для Stage 4?
   - Hint: Check `packages/course-gen-platform/tests/integration/stage-4-*.test.ts`

---

## Success Message Template

После успешного выполнения, создай отчет в формате:

```markdown
# T055 Automated E2E Validation - SUCCESS REPORT

**Status**: ✅ FULLY AUTOMATED (Stages 2-4)
**Test Result**: PASSING (Exit Code: 0)
**Coverage**: Complete pipeline validation

## Automation Summary
- Stage 2: Document Upload ✅
- Stage 3: Document Processing ✅
- Stage 4: Analysis Execution ✅
- Result Verification ✅
- Observability Check ✅

## Bugs Fixed During Stage 4
[List any new bugs found and fixed]

## Test Metrics
- Documents Processed: 3/3
- Vectors Indexed: 145
- Analysis Phases Completed: 6/6
- Total Lessons Generated: [N]
- Test Duration: [X] seconds

## Ready for Manual UAT
✅ All automated tests passing
✅ Complete pipeline works end-to-end
✅ User can now proceed with manual T055 testing

[Detailed findings...]
```

---

## IMPORTANT: Orchestration Reminder

**DO NOT** implement everything yourself in one go. Follow the phases:
1. Investigate first (problem-investigator if complex)
2. Plan the changes
3. Delegate to appropriate subagent if needed
4. Validate each change
5. Iterate atomically

**DO** update TodoWrite frequently to show progress.

**DO** create investigation reports before fixes.

**DO** follow the same patterns that worked for Stages 2-3.

---

**Ready to start**: Начни с Phase 1 - Investigation & Planning. Удачи!
