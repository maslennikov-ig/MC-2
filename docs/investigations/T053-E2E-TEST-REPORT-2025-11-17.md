# Отчет E2E тестирования: T053 Курс по продажам
# Investigation Report: T053 E2E Test - Sales Course Generation

**Дата**: 2025-11-17
**Тест**: `tests/e2e/t053-synergy-sales-course.test.ts`
**Course ID**: `6841dba7-cd01-4f1d-ad2e-f48ae4fdae7a`
**Статус**: ❌ **FAILED** - Stage 5 Section Generation
**Результат**: 1 FAIL / 1 Tests

---

## 📋 Executive Summary / Краткое резюме

Проведено комплексное E2E тестирование полного пайплайна генерации курса (Stages 2-5) на реальных документах по продажам. Тест включает обработку документов (Docling OCR), Stage 4 анализ (5 фаз), и Stage 5 генерацию структуры курса.

**🎯 Итоговый результат**:
- ✅ Document Processing (Stage 2) - **SUCCESS** (20 sec)
- ✅ Analysis (Stage 4) - **SUCCESS** (76 sec, 5 phases)
- ❌ Generation (Stage 5) - **FAILED** (528 sec, section generation exhausted all repair layers)

**Основная проблема**: Section batch generation не смогла создать валидный JSON даже после 2 попыток с auto-repair и critique-revise layers. Quality validation failed → нет секций → нет уроков → тест провалился.

---

## 🧪 Тестовые данные / Test Data

### Входные документы (4 PDF/DOCX, ~282KB):
1. **ТЗ на курс по продажам.docx** (24.2KB)
   - Текстов: 38 блоков
   - Таблицы: 0
   - Изображения: 0

2. **Модуль 1 - Продажа билетов.pdf** (58.9KB)
   - Текстов: 100 блоков
   - Таблицы: 0
   - Изображения: 1
   - Страницы: 8

3. **Регламент работы в AMO CRM.pdf** (121.9KB)
   - Текстов: 80 блоков
   - Таблицы: 0
   - Страницы: 7

4. **Регулярный менеджмент отдела продаж.pdf** (81.3KB)
   - Текстов: 80 блоков
   - Страницы: 7

**Общий объем**: 298 текстовых блоков, 1 изображение, 22 страницы

---

## ✅ Успешно выполнено / Successfully Completed

### 1. **Подготовка тестовой среды**
- ✅ Redis очищен (29 BullMQ ключей удалено)
- ✅ Supabase очищен (6 тестовых курсов удалено)
- ✅ Тестовые пользователи созданы (3 auth users)
- ✅ Организация premium tier настроена

### 2. **Stage 2: Document Processing (Docling)**
- ✅ 4 документа загружены успешно
- ✅ Все 4 документа обработаны через Docling MCP
- ✅ OCR + image processing выполнены
- ✅ Markdown конвертация завершена
- ✅ Качество валидация пройдена (score = 1.0 для всех)
- ✅ Stage 4 Barrier passed: 4/4 completed

**Метрики Document Processing**:
- Время обработки: ~20 секунд
- Quality scores: 1.0 (все документы)
- Threshold: 0.75 (превышен)
- Embedding cache hits: 100%

### 3. **Stage 4: Analysis (5 фаз)**

#### **Phase 0: Initialization** ✅
- Duration: <1 sec
- Total Files: 4
- Completed Files: 4
- Status: ✅ PASSED

#### **Phase 1: Classification** ✅
- Duration: ~12.1 sec
- Model: `openai/gpt-oss-20b`
- Category: `professional`
- Confidence: 0.95
- Complexity: `narrow`
- Pedagogical patterns:
  - Primary strategy: `lecture-based`
  - Theory/Practice ratio: 30:70
  - Assessment types: `quizzes`
  - Key patterns count: 3
- Status: ✅ PASSED

#### **Phase 2: Scope Estimation** ⚠️ PASSED (с ретраями)
- Duration: ~43.7 sec
- Model: `openai/gpt-oss-20b`
- Total lessons: 48
- Total sections: 8
- Estimated hours: 12

**⚠️ Проблема JSON парсинга**:
```
[Phase 2] Direct parse FAILED: Unexpected end of JSON input
[Phase 2] Using UnifiedRegenerator with all 5 layers
```

**✅ Решение**:
- Layer 1-4 failed (FSM, brace, quote, comma repair)
- Layer 5 (`critique-revise`) **SUCCESS** ✅
- Post-processing: Validated 8 sections with all required fields

**Metrics**:
- Layer Used: `critique-revise`
- Success: true
- Token Cost: 1000
- Retry Count: 1
- Quality Passed: true

#### **Phase 3: Expert Analysis** ✅
- Duration: ~6.3 sec
- Model: `openai/gpt-oss-120b` (повышенный уровень)
- Teaching style: `mixed`
- Research flags: 0
- Expansion areas: 8
- Status: ✅ PASSED (direct parse SUCCESS)

#### **Phase 4: Synthesis** ✅
- Duration: ~5.0 sec
- Model: `openai/gpt-oss-20b`
- Content strategy: `create_from_scratch`
- Generation guidance tone: `technical professional`
- Document count: 0 (RAG skip)
- Generation guidance:
  - Tone: technical professional
  - Use analogies: true
  - Include visuals: diagrams, flowcharts, screenshots, animations
  - Exercise types: analysis, interpretation
  - Avoid jargon count: 9
- Status: ✅ PASSED (direct parse SUCCESS)

#### **Phase 5: Assembly** ✅
- Total Duration: ~72.2 sec
- Total Tokens: 8,217
- Total Cost: $0.00 (test mode)
- Total Lessons: 48
- Category: professional
- Research flags: 0
- Status: ✅ PASSED

**Models Used**:
- Phase 1: `openai/gpt-oss-20b`
- Phase 2: `openai/gpt-oss-20b`
- Phase 3: `openai/gpt-oss-120b` ⭐ (escalated)
- Phase 4: `openai/gpt-oss-20b`

**Stage 4 Total Summary**:
- Total Duration: ~74 sec (1.2 min)
- Phases Completed: 6/6
- Total Lessons: 48
- Total Sections: 8
- Estimated Hours: 12
- Category: professional
- Teaching Style: mixed
- Research Flags: 0
- Expansion Areas: 8
- Total Cost: $0.00
- Total Tokens: 8,217

### 4. **Stage 5: Generation ❌ FAILED**

#### **Metadata Generation** ✅ SUCCESS
- Model Selected: `qwen/qwen3-235b-a22b-thinking-2507` (Russian language)
- Language: ru
- Layer Used: `auto-repair`
- Duration: ~77 sec (1.3 min)
- Status: ✅ **PASSED**

#### **Section Generation** ❌ FAILED
- **Batch 1, Section 0** - **FAILED after 2 attempts**
- Duration: ~450 sec (7.5 min for 2 retries)
- Error: "Failed to parse sections: All regeneration layers exhausted"
- Tier: `tier2_ru_lessons`

**Попытка 1** (attempt 0):
- Layer 1 (auto-repair): **Quality validation failed**
- Layer 2 (critique-revise): **Quality validation failed**
- Result: ❌ FAILED

**Попытка 2** (attempt 1):
- Layer 1 (auto-repair): **Quality validation failed**
- Layer 2 (critique-revise): **Quality validation failed**
- Result: ❌ FAILED

**❌ Финальная ошибка**:
```
Generation failed: Section generation failed:
Failed to generate section batch 1 (section 0) after 2 attempts:
Failed to parse sections: All regeneration layers exhausted;
Quality validation failed: Cannot validate quality: no sections generated;
Lesson count validation failed: Cannot validate lessons: no sections generated
```

**Total Stage 5 Duration**: 528 sec (8.8 min)
**Status**: ❌ **PERMANENT FAILURE** (job не будет retry)

---

## ⚠️ Проблемы и предупреждения / Issues & Warnings

### 1. **JSON Parsing Failures** (MEDIUM)
**Фаза**: Phase 2 (Scope Estimation), Stage 5 Section Generation

**Описание**:
- Phase 2: Пустой JSON output от модели → все 4 repair слоя failed → critique-revise SUCCESS
- Stage 5: Section generation failed после exhausted layers

**Impact**:
- Добавлено ~20 сек латентности на Phase 2 (critique-revise)
- Stage 5 section generation застряла на retry

**Root Cause**:
- Модель вернула пустой/невалидный JSON
- FSM/brace/quote/comma repair не справились
- Потребовался LLM-based critique-revise

**Рекомендации**:
1. Улучшить промпты для более стабильного JSON вывода
2. Добавить pre-validation в modельные промпты
3. Мониторить частоту critique-revise использования (должно быть <10%)

### 2. **Status Transition Errors** (LOW - Non-Fatal)
**Фаза**: Все фазы

**Описание**:
Множественные ошибки перехода статусов курса:
```
Invalid generation status transition: pending → generating_structure
Invalid generation status transition: analyzing_task → generating_content
Invalid generation status transition: generating_structure → initializing
```

**Impact**:
- Логи засорены warning messages
- Фактически non-fatal (система продолжает работу)

**Root Cause**:
- State machine в Supabase RLS policies слишком строгая
- Worker пытается обновлять статус в неправильных порядках

**Рекомендации**:
1. Пересмотреть state transitions в `courses` table trigger
2. Добавить grace period для асинхронных обновлений
3. Или пометить эти обновления как optional

### 3. **System Metrics Logging Failed** (LOW)
**Фаза**: Все Phase 1-4

**Описание**:
```
Failed to log phase metrics to system_metrics:
Could not find the 'message' column of 'system_metrics' in the schema cache
```

**Impact**:
- Метрики фаз не сохраняются в БД
- Мониторинг производительности затруднен

**Root Cause**:
- Schema mismatch между кодом и Supabase table `system_metrics`
- Column `message` отсутствует или переименован

**Рекомендации**:
1. Проверить schema `system_metrics` в Supabase
2. Обновить INSERT queries для соответствия actual schema
3. Добавить fallback для failed metrics logging

---

## 📊 Метрики производительности / Performance Metrics

### Document Processing (Stage 2)
| Метрика | Значение |
|---------|----------|
| Общее время | ~20 сек |
| Документы обработано | 4/4 (100%) |
| Quality score | 1.0 (все) |
| Threshold | 0.75 (passed) |
| Embedding cache hits | 100% |

### Analysis (Stage 4)
| Фаза | Длительность | Модель | Статус |
|------|--------------|--------|--------|
| Phase 0: Init | <1 sec | - | ✅ |
| Phase 1: Classification | 12.1 sec | gpt-oss-20b | ✅ |
| Phase 2: Scope | 43.7 sec | gpt-oss-20b | ⚠️ (retry) |
| Phase 3: Expert | 6.3 sec | gpt-oss-120b | ✅ |
| Phase 4: Synthesis | 5.0 sec | gpt-oss-20b | ✅ |
| Phase 5: Assembly | <1 sec | - | ✅ |
| **Total** | **~72 sec** | - | **✅** |

### Generation (Stage 5) - ⏳ В ПРОЦЕССЕ
| Фаза | Статус |
|------|--------|
| Metadata Generation | ⏳ STARTED |
| Section Generation | ⚠️ RETRY (attempt 1) |

---

## 🔧 Использованные модели / Models Used

### Stage 4 Analysis
1. **Phase 1, 2, 4**: `openai/gpt-oss-20b` (default)
2. **Phase 3**: `openai/gpt-oss-120b` (escalated for expert analysis)

### Stage 5 Generation (partial)
1. **Metadata**: `qwen/qwen3-235b-a22b-thinking-2507` (Russian language)
2. **Sections**: `tier2_ru_lessons` (language-aware routing)

**Наблюдение**: Система правильно детектировала русский язык и выбрала Qwen3 для metadata generation.

---

## 🎯 Анализ результатов / Results Analysis

### Что прошло хорошо ✅

1. **Document Processing Pipeline**
   - Docling MCP интеграция работает стабильно
   - OCR + markdown конвертация без ошибок
   - Quality validation passed для всех документов
   - Embedding cache 100% hits (отличная производительность)

2. **Stage 4 Analysis Orchestration**
   - 5-фазный workflow выполнен успешно
   - Multi-model routing работает (escalation to 120B)
   - Critique-revise fallback спас Phase 2
   - Все фазы завершились с правильными данными

3. **Language Detection**
   - Русский язык корректно определен
   - Qwen3-235B выбран для RU metadata generation
   - tier2_ru_lessons routing работает

### Что требует улучшения ⚠️

1. **JSON Parsing Stability**
   - **Проблема**: Модели возвращают пустой/невалидный JSON слишком часто
   - **Impact**: 2 критических случая (Phase 2, Stage 5)
   - **Решение**: Улучшить промпты, добавить pre-validation

2. **Status Transition Management**
   - **Проблема**: Множественные "Invalid status transition" errors
   - **Impact**: Логи засорены, debugging затруднен
   - **Решение**: Пересмотреть state machine в Supabase

3. **Metrics Logging**
   - **Проблема**: system_metrics column mismatch
   - **Impact**: Нет мониторинга производительности в БД
   - **Решение**: Обновить schema или queries

### Что неплохо (но можно лучше) ⚙️

1. **Phase 2 Latency** (~44 sec)
   - Включает retry с critique-revise
   - Можно оптимизировать через better prompts

2. **Error Recovery**
   - Critique-revise работает как last resort
   - Но лучше не доводить до этого слоя

3. **Model Escalation**
   - Phase 3 escalated to 120B правильно
   - Но можно добавить больше logging для monitoring

---

## 📈 Рекомендации / Recommendations

### Priority 1 (Critical - Fix ASAP)
1. **Исправить Section Generation JSON Parsing**
   - Проверить промпты для section generation
   - Добавить JSON schema validation в промпт
   - Мониторить exhausted layers frequency

2. **Улучшить Phase 2 Prompt Stability**
   - Добавить примеры валидного JSON в промпт
   - Добавить explicit schema в system message
   - Протестировать на 10+ курсах

### Priority 2 (Important - Fix This Week)
3. **Пересмотреть Status Transition Logic**
   - Документировать valid transitions
   - Обновить Supabase trigger
   - Добавить grace period для async updates

4. **Починить System Metrics Logging**
   - Обновить schema `system_metrics`
   - Добавить migration для `message` column
   - Тестировать метрики логирование

### Priority 3 (Nice to Have - Future)
5. **Добавить Performance Monitoring**
   - Dashboard для Phase latencies
   - Alerting для exhausted layers (>10%)
   - Cost tracking per course

6. **Optimize Phase 2 Latency**
   - Reduce tokens in scope estimation prompt
   - Cache common patterns
   - Parallel processing где возможно

---

## 🔍 Детальные логи фаз / Detailed Phase Logs

### Phase 2: Scope Estimation (⚠️ Retry)

**Исходная попытка (Failed)**:
```json
{
  "phase": "phase_2_scope",
  "rawOutputLength": 0,
  "rawOutputPreview": "",
  "error": "Unexpected end of JSON input"
}
```

**Repair Layers (All Failed)**:
1. ❌ `jsonrepair_fsm` - already failed
2. ❌ `brace_counting` - failed
3. ❌ `quote_fixing` - failed
4. ❌ `trailing_comma_removal` - failed
5. ❌ `comment_stripping` - failed

**Layer 6: Critique-Revise (✅ SUCCESS)**:
```json
{
  "layer": "critique-revise",
  "success": true,
  "tokenCost": 1000,
  "retryCount": 1,
  "qualityPassed": true,
  "postProcessing": "Validated 8 sections with all required fields"
}
```

**Final Output**:
- Total lessons: 48
- Total sections: 8
- Estimated hours: 12
- Duration: 43.7 sec (including retry)

### Stage 5: Section Generation (⏳ В ПРОЦЕССЕ)

**Batch 1, Section 0 - Attempt 1 (⚠️ Failed)**:
```json
{
  "batchNum": 1,
  "sectionIndex": 0,
  "attempt": 1,
  "tier": "tier2_ru_lessons",
  "error": "Failed to parse sections: All regeneration layers exhausted",
  "action": "Retrying with stricter prompt"
}
```

**Status**: Ожидание результатов retry...

---

## 📝 Выводы / Conclusions

### Общая оценка системы
**Оценка**: 7.5/10

**Сильные стороны**:
- ✅ Document processing pipeline надежный
- ✅ Multi-phase analysis работает корректно
- ✅ Error recovery (critique-revise) функционален
- ✅ Language-aware routing работает
- ✅ Quality validation строгая и эффективная

**Слабые стороны**:
- ⚠️ JSON parsing stability требует улучшения
- ⚠️ Status transitions создают noise в логах
- ⚠️ Metrics logging не работает
- ⚠️ Section generation застревает на retries

### Готовность к production
**Статус**: ⚠️ **PARTIAL - Требуется доработка**

**Блокеры**:
1. Section generation failures (Priority 1)
2. JSON parsing instability (Priority 1)

**Можно релизить после**:
- Исправления Section generation промптов
- Добавления мониторинга для exhausted layers
- Тестирования на 20+ реальных курсах

---

## 🔄 Следующие шаги / Next Steps

1. ⏳ **Дождаться завершения теста T053**
   - Обновить этот документ финальными результатами
   - Проверить итоговую структуру курса
   - Проверить quality scores

2. 🐛 **Исследовать Section Generation Failure**
   - Создать отдельный investigation report
   - Проанализировать exhausted layers
   - Улучшить промпты

3. 🧪 **Запустить дополнительные тесты**
   - 10 курсов с разными типами контента
   - Проверить стабильность JSON parsing
   - Измерить exhausted layers rate

4. 📊 **Setup Monitoring**
   - Grafana dashboard для Phase latencies
   - Alerting для JSON parsing failures
   - Cost tracking per course

---

## 📎 Приложения / Appendices

### A. Test Configuration
```typescript
{
  testFile: 'tests/e2e/t053-synergy-sales-course.test.ts',
  courseId: '6841dba7-cd01-4f1d-ad2e-f48ae4fdae7a',
  organizationId: '759ba851-3f16-4294-9627-dc5a0a366c8e',
  userId: '00000000-0000-0000-0000-000000000012',
  tier: 'premium',
  language: 'ru',
  documentsCount: 4,
  totalSize: '282KB'
}
```

### B. Environment
```
Node.js: v22.18.0
Vitest: v4.0.1
Redis: localhost:6379
Supabase: diqooqbuchsliypgwksu.supabase.co
Docling MCP: localhost:8000/mcp
```

### C. Key Files Modified
- None (read-only E2E test)

---

**Status**: ⏳ REPORT IN PROGRESS - будет обновлен после завершения теста

**Last Updated**: 2025-11-17 05:30 UTC
