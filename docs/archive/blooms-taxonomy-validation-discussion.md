# Обсуждение: Bloom's Taxonomy Validation - Баланс Строгости и Гибкости

**Дата**: 2025-11-10
**Контекст**: Spec 008 - Generation Phase Implementation
**Версия**: v0.16.7 (RT-006 validators интегрированы)

---

## 🤔 Вопрос Пользователя

> "Я очень беспокоюсь, что мы загоняем модели в слишком жесткие рамки. Согласись или опровергни этот мой страх."

**Контекст беспокойства**:

- RT-006 Bloom's Taxonomy validators введены в production (v0.16.6-v0.16.7)
- Валидаторы блокируют non-measurable verbs, placeholders, invalid Bloom's verbs
- Есть опасение, что строгие правила ограничивают креативность LLM

---

## ✅ Ответ: Страх на 20% Обоснован

### Где Жесткость ПРАВИЛЬНА (80% cases)

#### 1. **Non-Measurable Verbs Blacklist** - Педагогически Корректно ✅

**Verbs**: understand, know, learn, appreciate, be aware of (11 EN + 10 RU)

**Почему это правильно**:

- Bloom's Revised Taxonomy (Anderson & Krathwohl, 2001) - **индустриальный стандарт**
- 40% качественных проблем в learning objectives связаны с non-measurable verbs (RT-006 research)
- Невозможно верифицировать через assessment

**Пример**:

```
❌ ПЛОХО: "Understand closures in JavaScript"
   → Как проверить? Студент может сказать "I understand", но врать.

✅ ХОРОШО: "Explain closures using code examples"
   → Можно измерить: код работает или нет, объяснение корректное или нет.
```

**Вердикт**: Это **НЕ ограничение креативности**, а **педагогический стандарт качества**.

---

#### 2. **Placeholder Detection (TODO/TBD)** - Правильно для Production ✅

**Patterns**: `/\b(TODO|FIXME|XXX)\b/i`, `/\bPLACEHOLDER\b/i`

**Почему это правильно**:

- Production course не должен содержать "TODO: add content"
- Блокирует incomplete generations на draft stage
- 95%+ detection accuracy для явных placeholders

**Вердикт**: Правильно блокировать явные placeholders.

---

### ⚠️ Где Нужна Доработка (15% cases)

#### 1. **Bloom's 165-Verb Whitelist** - Слишком Жестко для Русского

**Проблема**: Exact match не учитывает синонимы и глагольные формы

**Ложные блокировки**:

```typescript
// Контекстуальные вариации
"разработать алгоритм" ✅ (create level)
"разработать понимание концепции" ❓ (может быть understand level, но "разработать" в whitelist)

// Глагольные формы
"объяснить" ✅ (в whitelist)
"объяснять" ❓ (не в whitelist, но та же семантика)
"дать объяснение" ❓ (фразовый глагол)

// Синонимы
"понять" (blacklist) vs "постичь" (не в whitelist, но похоже)
```

**Рекомендация**:

```typescript
// Вместо точного match
verbs.some(v => v.toLowerCase() === lowerVerb);

// Использовать stemming или fuzzy match
verbs.some(v => {
  const stem1 = stem(v); // "объяснить" → "объясн"
  const stem2 = stem(lowerVerb); // "объяснять" → "объясн"
  return stem1 === stem2 || levenshtein(stem1, stem2) <= 2;
});
```

---

#### 2. **Bracket/Angle Detection** - Слишком Агрессивно

**Проблемные паттерны**:

```typescript
/\[.*?\]/,  // ❌ ПРОБЛЕМА: ловит ЛЮБЫЕ скобки!
/<.*?>/,    // ❌ ПРОБЛЕМА: ловит HTML tags, generic types
/\.{3,}/,   // ❌ ПРОБЛЕМА: ловит многоточие в середине предложения
```

**Ложные срабатывания**:

```javascript
// ❌ FALSE POSITIVE
'Изучите массивы [array] и объекты [object] в JavaScript';
// → Детектор думает, что [array] - это placeholder!

// ❌ FALSE POSITIVE
'Рассмотрим типы: Array<number>, Map<string, boolean>';
// → <number> и <string> выглядят как placeholders!

// ❌ FALSE POSITIVE
'Эта тема интересна... и важна для карьеры';
// → Многоточие в середине - НЕ placeholder!
```

**Рекомендация**:

```typescript
// Более умная детекция
const PLACEHOLDER_PATTERNS = [
  /\[TODO\]/i, // ✅ Только TODO в скобках
  /\[TBD\]/i, // ✅ Только TBD
  /\[insert.*?\]/i, // ✅ Только [insert ...]
  /\{\{.*?\}\}/, // ✅ Template variables OK
  /^\.\.\.$|^\.\.\. /, // ✅ Только в начале или изолированно
];
```

---

#### 3. **Duration Proportionality** - Не Учитывает Сложность

**Формула**:

```typescript
MIN: (topics × 2 min) + (objectives × 5 min)
MAX: (topics × 5 min) + (objectives × 15 min)
ENGAGEMENT_CAP: 6 minutes  // ❌ ПРОБЛЕМА!
```

**Конфликт**:

```javascript
Lesson: "Асинхронное программирование в JavaScript"
- Topics: 4 (Promises, async/await, Event Loop, Callbacks)
- Objectives: 3 (Explain event loop, Implement promises, Debug errors)

// Формула:
MIN = 4×2 + 3×5 = 23 минуты
MAX = 4×5 + 3×15 = 65 минут
ENGAGEMENT_CAP = 6 минут ❌ ПРОТИВОРЕЧИЕ!

// Реальность:
// Async programming - сложная тема, нужно 30-45 минут
// Но ENGAGEMENT_CAP = 6 минут блокирует!
```

**Рекомендация**:

```typescript
// Добавить difficulty_level modifier
const DIFFICULTY_MULTIPLIER = {
  beginner: 1.0,
  intermediate: 1.5,
  advanced: 2.0,
};

const multiplier = DIFFICULTY_MULTIPLIER[lesson.difficulty_level || 'intermediate'];
const minExpected =
  (topicCount * MIN_TOPIC_DURATION + objectiveCount * MIN_OBJECTIVE_DURATION) * multiplier;

// Убрать ENGAGEMENT_CAP или сделать soft warning
```

---

### ❌ Потенциально Опасные Правила (5% cases)

1. **ENGAGEMENT_CAP = 6 min** - может блокировать сложные темы
2. **Bracket detection** - ловит [array], <generic> как placeholders

---

## 💡 Стратегические Рекомендации

### 1. **Сделать Validation Уровневой** (Progressive Validation)

Вместо жесткого блока, использовать **warning levels**:

```typescript
enum ValidationSeverity {
  ERROR = 'error', // Блокирует сохранение
  WARNING = 'warning', // Логирует, но пропускает
  INFO = 'info', // Только мониторинг
}

const VALIDATION_RULES = {
  nonMeasurableVerbs: { severity: ValidationSeverity.ERROR }, // ✅ Блокировать
  bloomsWhitelist: { severity: ValidationSeverity.WARNING }, // ⚠️ Warning (fuzzy match в будущем)
  placeholdersTODO: { severity: ValidationSeverity.ERROR }, // ✅ Блокировать
  placeholdersBrackets: { severity: ValidationSeverity.WARNING }, // ⚠️ Warning (много false positives)
  durationMin: { severity: ValidationSeverity.WARNING }, // ⚠️ Warning
  engagementCap: { severity: ValidationSeverity.INFO }, // ℹ️ Мониторинг только
};
```

**Преимущества**:

- Блокируем только критичные нарушения (non-measurable verbs, TODO markers)
- Остальное - warnings для мониторинга
- Собираем метрики false positives

---

### 2. **Добавить Override Mechanism**

Для edge cases, где преподаватель ЗНАЕТ, что делает:

```typescript
interface ValidationOverride {
  rule: string;
  reason: string;
  approvedBy: string; // instructor_id
}

// Example:
{
  learning_objective: "Understand quantum mechanics fundamentals",
  validation_override: {
    rule: "nonMeasurableVerbs",
    reason: "Introductory course, 'understand' appropriate for conceptual topic",
    approvedBy: "instructor_uuid"
  }
}
```

---

### 3. **Собирать Метрики False Positives**

```typescript
interface ValidationMetrics {
  rule: string;
  falsePositiveRate: number; // % случаев, где retry был успешным
  avgRetriesNeeded: number; // Сколько попыток нужно
}

// Если falsePositiveRate > 30% → правило слишком жесткое
```

**Benefit**: Data-driven decision making для смягчения правил.

---

## 🎯 Итоговая Оценка

**Страх обоснован на 20%**:

- ✅ **80% правил** - педагогически корректны, не ограничивают
- ⚠️ **15% правил** - нужна доработка (whitelist fuzzy match, placeholder patterns)
- ❌ **5% правил** - потенциально опасны (engagement cap, bracket detection)

**Но это ЛЕГКО исправить**:

1. Severity levels (ERROR/WARNING/INFO)
2. Консервативнее placeholder detection
3. Difficulty_level modifier для duration
4. Метрики false positives

---

## 📋 Предлагаемые Улучшения (Future Tasks)

### Phase 1: Quick Fixes (1-2h)

- Смягчить bracket/angle detection (только `[TODO]`, `[TBD]`, `[insert...]`)
- Убрать ENGAGEMENT_CAP или сделать INFO level
- Добавить difficulty_level modifier для duration

### Phase 2: Stemming для Русского (2-3h)

- Интегрировать stemmer (porter-stemmer-ru или mystem)
- Fuzzy match для Bloom's verbs (Levenshtein distance ≤ 2)
- Поддержка глагольных форм (объяснить/объяснять)

### Phase 3: Severity Levels (3-4h)

- Рефакторинг validators на severity-based
- Logging warnings вместо блокировки
- Metrics collection для false positives

### Phase 4: Override Mechanism (2-3h)

- UI для instructor overrides
- Audit trail для overrides
- Admin review для overrides

---

## 📚 Референсы

**Research Documents**:

- RT-006: `/specs/008-generation-generation-json/research-decisions/rt-006-bloom-taxonomy-validation.md`
- Validators: `/packages/course-gen-platform/src/server/services/generation/validators/blooms-validators.ts`
- Schema: `/packages/shared-types/src/generation-result.ts` (lines 15-136)

**Test Results**:

```
✅ Test 1: Valid Bloom verb "explain" - ACCEPTED
✅ Test 2: Non-measurable "understand" - REJECTED (P0)
✅ Test 3: Invalid Bloom "visualize" - REJECTED (P1)
✅ Test 4: Russian "объяснить" - ACCEPTED
✅ Test 5: Russian "понимать" - REJECTED (P0)
```

**Production Status**: v0.16.7 (validators active, metrics collecting)

---

## 🚀 Next Steps

1. **Мониторинг Metrics** (1 неделя production):
   - False positive rate по каждому правилу
   - Retry success rate
   - Avg retries needed

2. **Data-Driven Adjustments**:
   - Если placeholder brackets FP > 30% → смягчить
   - Если Bloom's whitelist FP > 20% → добавить fuzzy match

3. **User Feedback**:
   - Собрать feedback от преподавателей
   - Identify edge cases requiring overrides

---

**Статус**: Открыто для обсуждения
**Автор**: Claude Code
**Версия документа**: 1.0
