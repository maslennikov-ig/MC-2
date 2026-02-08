# FUTURE: Remove Difficulty Field from Frontend

**Status**: DEFERRED (Post-Stage 5)
**Priority**: Low (UX improvement, not blocking production)
**Blocking**: None
**Implementation Timeline**: Post-Stage 6
**Related**: specs/008-generation-generation-json/spec.md:22

---

## Context

В текущей реализации frontend содержит поле выбора сложности курса (`difficulty`), которое позволяет пользователю вручную указать уровень сложности (beginner/intermediate/advanced). Однако это создаёт конфликты и противоречия:

1. **AI определяет difficulty автоматически** в Analyze Phase 1 (Stage 4) на основе:
   - Анализа содержания курса
   - Целевой аудитории
   - Педагогических требований
   - Рекомендаций expert analysis

2. **Пользовательский ввод менее точен**, чем AI-определение:
   - Пользователь может переоценить/недооценить сложность
   - Субъективная оценка vs объективный анализ
   - Создаёт конфликты между user input и AI recommendations

3. **Архитектурный принцип** (spec.md:22):
   > **Analyze Stage is authoritative**. Frontend параметры — это guidance (рекомендации), НЕ constraints (ограничения)

## Rationale (Почему отложено)

**Не блокирует Stage 5 production deployment** по следующим причинам:

1. ✅ **Текущая система работает корректно**:
   - Если пользователь указывает difficulty, AI учитывает это как hint, но может переопределить
   - Логируется deviation с rationale
   - Приоритет всегда за Analyze Stage (педагогическая правильность)

2. ✅ **Нет критических конфликтов**:
   - Система не ломается при наличии поля
   - Conflict resolution работает корректно (spec.md:22 clarification)
   - Пользователь получает оптимальный результат независимо от input

3. ⏱️ **Требует frontend изменений**:
   - Удаление поля из форм создания курса
   - Обновление UX flow (убрать шаг выбора сложности)
   - Обновление документации для пользователей
   - A/B тестирование для проверки влияния на UX

4. 🎯 **Лучше сделать после Stage 6**:
   - Когда вся генерация (Structure + Lessons) работает стабильно
   - Можем собрать метрики точности AI-определения difficulty
   - Можем показать пользователям, что AI определяет сложность лучше

## Implementation Plan

### Phase 1: Metrics Collection (During Stage 6)

**Цель**: Собрать данные о точности AI-определения difficulty vs пользовательский выбор

**Tasks**:

- [ ] Логировать `user_selected_difficulty` vs `ai_determined_difficulty` в метаданные курса
- [ ] Добавить метрику deviation: `difficulty_override_count` (сколько раз AI переопределил выбор пользователя)
- [ ] Собирать feedback от пользователей: "Согласны ли вы с определённым уровнем сложности?" (опциональный опрос)
- [ ] Анализ за 1-2 месяца: в каком % случаев AI переопределяет пользователя?

**Success Criteria**:

- AI переопределяет пользователя в >30% случаев → подтверждает необходимость удаления поля
- User feedback показывает, что AI-определение точнее в >70% случаев

### Phase 2: Frontend Changes (Post-Stage 6)

**Цель**: Удалить поле difficulty из пользовательского интерфейса

**Tasks**:

- [ ] **courseai-next/app/courses/create/page.tsx**: Удалить dropdown/radio для выбора difficulty
- [ ] **courseai-next/components/course-form.tsx**: Убрать difficulty field из формы
- [ ] **courseai-next/lib/validations/course.ts**: Удалить difficulty из Zod schema (если есть frontend validation)
- [ ] **courseai-next/app/courses/[id]/edit/page.tsx**: Убрать возможность редактирования difficulty (показывать только AI-определённое значение)
- [ ] **packages/shared-types/src/frontend-parameters.ts**: Сделать `difficulty` deprecated (добавить warning в JSDoc)
- [ ] **Documentation**: Обновить пользовательские гайды, указав, что сложность определяется автоматически

**UI Changes**:

1. **Create Course Form**:
   - Убрать: "Выберите уровень сложности: ○ Beginner ○ Intermediate ○ Advanced"
   - Добавить: Информационное сообщение "Уровень сложности будет определён автоматически на основе содержания курса"

2. **Course Details Page** (после генерации):
   - Показывать AI-определённую сложность с иконкой "✨ AI-определено"
   - Tooltip: "Уровень сложности рассчитан на основе анализа содержания, целевой аудитории и педагогических стандартов"

**Testing**:

- [ ] E2E тест: Создание курса без указания difficulty → успешная генерация
- [ ] E2E тест: Курс показывает AI-определённую сложность после Analyze Phase
- [ ] Manual UX testing: Проверить, что отсутствие поля не confusing для пользователей

### Phase 3: Backend Cleanup (Post-Frontend Changes)

**Цель**: Убрать обработку deprecated поля на backend

**Tasks**:

- [ ] **packages/shared-types/src/generation-job.ts**: Удалить `difficulty?: DifficultyLevel` из `FrontendParametersSchema`
- [ ] **packages/course-gen-platform/src/services/stage5/metadata-generator.ts**: Убрать обработку `input.frontend_parameters.difficulty`
- [ ] **packages/course-gen-platform/src/services/stage4/analyze-orchestrator.ts**: Убрать conflict resolution для difficulty (больше не нужно)
- [ ] **Database Migration**: Добавить комментарий к `courses.difficulty_level` столбцу: "Populated by Analyze Phase 1, user input deprecated"
- [ ] **API Documentation**: Обновить tRPC API docs, указав, что difficulty больше не принимается от пользователя

**Migration Strategy**:

1. ✅ **Graceful degradation**: Если старый frontend ещё отправляет difficulty → игнорировать, логировать warning
2. ✅ **Backward compatibility**: Existing courses с user-selected difficulty продолжают работать (не трогаем старые данные)
3. ⚠️ **Deprecation timeline**: 3 месяца warning period, затем полное удаление поддержки

### Phase 4: User Communication

**Цель**: Объяснить пользователям изменение

**Tasks**:

- [ ] **Release Notes**: Написать объяснение в changelog: "Поле выбора сложности удалено — теперь AI определяет оптимальный уровень автоматически"
- [ ] **In-App Announcement**: Показать notification при первом создании курса: "Обновление: Сложность курса теперь определяется AI для максимальной точности"
- [ ] **Help Center Article**: Добавить FAQ: "Почему я не могу выбрать сложность курса?"
  - Ответ: "Наша AI-система анализирует содержание и автоматически определяет оптимальный уровень сложности, что обеспечивает более точные результаты, чем ручной выбор"
- [ ] **Feedback Collection**: Мониторить support tickets и user feedback после изменения (первый месяц)

## Technical Dependencies

**Required Before Implementation**:

1. ✅ Stage 4 (Analyze) полностью реализован (AI-определение difficulty работает)
2. ✅ Stage 5 (Generation) использует Analyze results (difficulty propagation работает)
3. ✅ Stage 6 (Lesson Generation) завершён (вся цепочка генерации стабильна)
4. ✅ Metrics collection показывает >30% override rate (подтверждает необходимость)

**Does NOT Require**:

- ❌ Breaking changes в database schema (difficulty_level столбец остаётся)
- ❌ Миграция существующих курсов (старые данные не трогаем)
- ❌ Changes в Analyze/Generation logic (уже работает корректно без user input)

## Success Criteria

**Implementation Считается Успешной Если**:

1. ✅ **Frontend Changes**:
   - Поле difficulty удалено из всех форм создания/редактирования
   - Users не видят опцию выбора сложности
   - UI показывает AI-определённую сложность как read-only

2. ✅ **Backend Changes**:
   - API игнорирует difficulty в user input (если отправлено старым клиентом)
   - Analyze Phase продолжает определять difficulty автоматически
   - Логирование показывает 0 conflict resolution для difficulty (field не используется)

3. ✅ **User Experience**:
   - <5% support tickets о "missing difficulty field" в первый месяц
   - User feedback положительный или нейтральный (не негативный)
   - A/B тестирование показывает, что удаление не impact course creation rate

4. ✅ **Quality Metrics**:
   - AI-определённая сложность показывает >85% user satisfaction (post-generation survey)
   - Deviation между AI difficulty и actual course content <10% (manual audit)

## Estimated Effort

**Total**: 2-3 дня (1 developer)

**Breakdown**:

- Phase 1 (Metrics): 0.5 дня (добавить логирование)
- Phase 2 (Frontend): 1 день (удалить поля, обновить UI, E2E tests)
- Phase 3 (Backend): 0.5 дня (cleanup, deprecation warnings)
- Phase 4 (Communication): 1 день (release notes, docs, FAQ)

**Timeline**: Post-Stage 6 (когда вся генерация стабильна и metrics собраны)

## References

- specs/008-generation-generation-json/spec.md:22 - Clarification о conflict resolution
- specs/007-stage-4-analyze/spec.md - Analyze Phase 1 определение difficulty
- docs/IMPLEMENTATION_ROADMAP_EN.md - Stage progression timeline
- .claude/CLAUDE.md - Constitution principle III (Spec-Driven Development)

---

**Version**: 1.0.0
**Created**: 2025-11-06
**Last Updated**: 2025-11-06
**Owner**: Frontend Team (координация с Backend Team для Phase 3)
