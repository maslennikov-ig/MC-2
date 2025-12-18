# FUTURE-004: Research & Implement LangChain 1.x New Features

**Priority**: MEDIUM
**Effort**: 40-60 hours (Research: 8h, Implementation: 32-52h)
**Context**: После миграции на LangChain 1.x (v0.19.2) изучить новые возможности и внедрить полезные для MegaCampus
**Dependency**: Dependency migrations complete (v0.19.2, 2025-11-21)

---

## OBJECTIVE

Исследовать все новые возможности LangChain/LangGraph 1.x и определить, какие из них улучшат:
1. Качество генерации курсов
2. Надёжность и отказоустойчивость
3. User experience (human-in-the-loop)
4. Observability и debugging
5. Стоимость и производительность

---

## SCOPE

### Установленные версии (2025-11-21)
| Package | Version |
|---------|---------|
| @langchain/core | 1.0.6 |
| @langchain/openai | 1.1.2 |
| @langchain/langgraph | 1.0.2 |
| @langchain/textsplitters | 1.0.0 |

### Новые возможности для исследования

#### 1. Command API (HIGH PRIORITY)
**Что это**: Динамическое управление потоком графа
```typescript
return new Command({
  update: { searchResults },  // обновить state
  goto: "draftResponse",      // перейти к node
});
```
**Потенциал для MegaCampus**:
- Stage5 orchestrator — динамический роутинг между фазами
- Regeneration layers — условный переход между стратегиями
- Error recovery — graceful degradation flow

**Research Questions**:
- [ ] Как интегрировать с существующим StateGraph?
- [ ] Какие breaking changes в orchestrator.ts?
- [ ] Performance impact?

---

#### 2. Typed Interrupts (MEDIUM PRIORITY)
**Что это**: Пауза графа с типизированным payload для human review
```typescript
const graphConfig = {
  interrupts: {
    humanReview: interrupt<{ reason: string }, { approved: boolean }>
  }
}
```
**Потенциал для MegaCampus**:
- Content review перед публикацией курса
- Approval workflow для генерации с чувствительным контентом
- Quality gate с человеческой проверкой

**Research Questions**:
- [ ] Как сохранять state во время interrupt?
- [ ] UI интеграция в packages/web?
- [ ] Resume workflow после approve/reject?

---

#### 3. Persistent Memory / Cross-Thread Memory (LOW PRIORITY)
**Что это**: Долговременная память, работающая между разными threads
```typescript
const config = { configurable: { thread_id: "2", user_id: "1" } };
```
**Потенциал для MegaCampus**:
- Запоминание предпочтений пользователя
- Персонализация стиля генерации
- История успешных/неуспешных генераций

**Research Questions**:
- [ ] Storage backend (Redis vs Supabase)?
- [ ] Memory cleanup policy?
- [ ] Privacy implications?

---

#### 4. Middleware System (MEDIUM PRIORITY)
**Что это**: Pre/post processing для каждого LLM вызова
```typescript
createMiddleware({
  name: "Logging",
  beforeModel: (state, runtime) => { /* ... */ },
  afterModel: (state, runtime) => { /* ... */ }
});
```
**Потенциал для MegaCampus**:
- Централизованный cost tracking
- Rate limiting на уровне LLM
- Retry logic с exponential backoff
- Token budget enforcement

**Research Questions**:
- [ ] Совместимость с существующим observability?
- [ ] Как интегрировать с langchain-observability.ts?
- [ ] Performance overhead?

---

#### 5. Time Travel / Checkpoints (LOW PRIORITY)
**Что это**: Откат к предыдущим состояниям графа
```typescript
await graph.updateState(selectedState.config, { topic: "new value" });
```
**Потенциал для MegaCampus**:
- Откат неудачной генерации без потери прогресса
- A/B testing разных путей генерации
- Debug сложных edge cases

**Research Questions**:
- [ ] Storage requirements?
- [ ] Как интегрировать с BullMQ jobs?
- [ ] UI для выбора checkpoint?

---

#### 6. Tools с Interrupt (MEDIUM PRIORITY)
**Что это**: Инструменты, требующие подтверждения перед выполнением
```typescript
const publishCourseTool = tool(
  async ({ courseId }) => {
    const response = interrupt({ message: "Publish course?" });
    if (response?.action === "approve") { /* publish */ }
  },
  { name: "publish_course", schema: z.object({...}) }
);
```
**Потенциал для MegaCampus**:
- Подтверждение публикации курса
- Approval для отправки email/notifications
- Dangerous operations confirmation

---

## IMPLEMENTATION ROADMAP

### Phase 0: DeepResearch (2 hours)

**T-LC1X-000: Запустить DeepResearch для полного анализа**

Перед началом работы запустить DeepResearch с промптом ниже для получения полного списка новых возможностей и best practices.

<details>
<summary>DeepResearch Prompt (click to expand)</summary>

```
## Research Task: LangChain.js and LangGraph.js 1.x New Features Analysis for Course Generation Platform

### Context
We have a course generation platform (MegaCampus) that uses:
- @langchain/core (migrated from 0.3.0 to 1.0.6)
- @langchain/openai (migrated from 0.3.0 to 1.1.2)
- @langchain/langgraph (migrated from 0.2.0 to 1.0.2)
- @langchain/textsplitters (migrated from 0.1.0 to 1.0.0)

Our platform generates educational courses using LLM orchestration with:
- Multi-phase analysis pipeline (6 phases)
- Content generation with StateGraph workflows
- JSON repair and validation layers
- Regeneration strategies (5 layers of fallback)
- OpenRouter integration for model routing

### Research Questions

1. **New APIs and Features (0.x → 1.x)**
   - What new APIs were added in LangChain.js 1.x that weren't in 0.3.x?
   - What new APIs were added in LangGraph.js 1.x that weren't in 0.2.x?
   - What deprecated APIs should we migrate away from?
   - What are the new best practices for TypeScript integration?

2. **Command API Deep Dive**
   - How does the new Command API work for dynamic graph routing?
   - What are the patterns for using Command with StateGraph?
   - How to implement conditional branching with Command?
   - Performance implications vs static routing?

3. **Interrupt System**
   - How do typed interrupts work in LangGraph 1.x?
   - What are the requirements for checkpointing during interrupts?
   - How to implement human-in-the-loop with interrupts?
   - Storage backends supported for interrupt state?

4. **Middleware System**
   - What middleware capabilities are available in 1.x?
   - How to implement custom middleware for cost tracking?
   - How to add retry logic via middleware?
   - Integration with existing observability (Pino, Prometheus)?

5. **Memory and Persistence**
   - What's new in cross-thread memory?
   - How to implement persistent user preferences?
   - Memory cleanup and TTL strategies?
   - Performance of different checkpointer backends?

6. **Streaming Improvements**
   - What new streaming modes are available?
   - How to stream with interrupts?
   - Token-by-token streaming for UI?

7. **Error Handling**
   - New error types and handling patterns?
   - Graceful degradation patterns?
   - Retry strategies built into 1.x?

8. **Production Best Practices**
   - Recommended patterns for production deployments?
   - Scaling considerations?
   - Cost optimization techniques?
   - Testing strategies for LangGraph workflows?

### Output Format

Please provide:
1. **Summary Table**: New features with priority rating for course generation use case
2. **Implementation Recommendations**: Specific recommendations for MegaCampus
3. **Code Examples**: TypeScript examples for each recommended feature
4. **Migration Notes**: Any additional migration steps we might have missed
5. **Performance Considerations**: Impact on latency and cost
6. **Architecture Recommendations**: How to restructure our orchestration to leverage new features

### Constraints
- Focus on JavaScript/TypeScript ecosystem (not Python)
- Prioritize features relevant to LLM-powered content generation
- Consider our existing architecture (StateGraph, BullMQ, Supabase)
```

</details>

**Expected Output**: Comprehensive research report с приоритизированным списком фич для внедрения

---

### Phase 1: Research (8 hours)

**T-LC1X-001: Deep Dive Documentation** (4h):
- Прочитать полный LangChain 1.0 migration guide
- Изучить LangGraph 1.0 release notes
- Собрать все breaking changes и deprecations

**T-LC1X-002: POC Testing** (4h):
- Создать minimal POC для каждой фичи
- Измерить performance impact
- Документировать findings в research report

**Output**: `specs/010-langchain-1x-features/research-report.md`

---

### Phase 2: Command API Integration (16 hours)

**T-LC1X-003: Stage5 Orchestrator Refactor** (8h):
- Заменить статический routing на Command API
- Добавить dynamic goto для error recovery
- Тестирование с существующими e2e тестами

**T-LC1X-004: Regeneration Layers Update** (8h):
- Интегрировать Command в unified-regenerator.ts
- Условный переход между Layer 1-5
- Fallback strategies с Command

---

### Phase 3: Middleware Integration (12 hours)

**T-LC1X-005: Cost Tracking Middleware** (6h):
- Создать middleware для token/cost tracking
- Интегрировать с llm_phase_metrics таблицей
- Prometheus metrics export

**T-LC1X-006: Rate Limit Middleware** (6h):
- Per-user rate limiting
- Model-specific limits (GPT-4 vs GPT-4o-mini)
- Graceful degradation при превышении

---

### Phase 4: Human-in-the-Loop (16 hours) — OPTIONAL

**T-LC1X-007: Interrupt Infrastructure** (8h):
- Setup checkpointer для interrupts
- API endpoints для resume/reject
- WebSocket notifications для UI

**T-LC1X-008: Review UI** (8h):
- React component для review workflow
- Integration с курс-генерацией
- Approval/rejection handling

---

## SUCCESS CRITERIA

- [ ] Command API интегрирован в Stage5 orchestrator
- [ ] Middleware для cost tracking работает
- [ ] Нет регрессии в существующих e2e тестах
- [ ] Документация обновлена
- [ ] Research report создан с рекомендациями

---

## RELATED TASKS

- FUTURE-001: Apply RT-005 to Stage 4 (может использовать Command API)
- FUTURE-002: Apply RT-005 to Stage 5 (зависит от этого исследования)
- FUTURE-003: Unify repair patterns (может использовать Middleware)

---

## REFERENCE

**Migration Source**: `specs/009-dependency-migrations/tasks.md`
**LangChain Docs**: https://js.langchain.com/docs/versions/
**LangGraph Docs**: https://langchain-ai.github.io/langgraphjs/

---

**Status**: PENDING
**Created**: 2025-11-21
**Related**: Dependency migrations v0.19.2
