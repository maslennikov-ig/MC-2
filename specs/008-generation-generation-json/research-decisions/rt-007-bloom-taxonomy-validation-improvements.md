# RT-007: Bloom's Taxonomy Validation Improvements - Progressive Flexibility

**Research Task**: RT-007 Bloom's Taxonomy Validation Improvements
**Decision Date**: 2025-11-10
**Status**: 📝 PLANNED - Ready for Future Implementation
**Strategy**: **Progressive Validation with Flexibility** - Guardrails, not handcuffs
**Parent Tasks**: RT-006 (Bloom's Taxonomy Validation Framework)

---

## Executive Summary

**ЦЕЛЬ**: Улучшить RT-006 validation framework, сделав его более гибким и менее склонным к false positives, при этом сохранив педагогическое качество.

**Философия**: Bloom's Taxonomy — это **универсальный когнитивный фреймворк**, а не domain-specific constraints. Он работает для любой тематики (quantum physics, cooking, marketing, programming), потому что описывает **когнитивные процессы**, а не предметные области.

**Ключевой инсайт**: Не хардкодим тематику, а обеспечиваем педагогическое качество через:
- ✅ Универсальные стандарты (non-measurable verbs) — блокируем всегда
- ⚠️ Гибкие правила (Bloom's whitelist, duration) — warnings + retry
- ℹ️ Метрики (specificity scoring) — только мониторинг

**Expected Impact**:
- -15-20% false positive rate
- +2-3 retry успешность
- Сохранение 85-90% педагогического compliance

**Multilingual Support**: 19 языков (ru, en, zh, es, fr, de, ja, ko, ar, pt, it, tr, vi, th, id, ms, hi, bn, pl) с unified architecture

---

## Контекст: Проблема Жестких Рамок

**Источник обсуждения**: `/docs/blooms-taxonomy-validation-discussion.md`

**User Concern**:
> "Я совершенно не хочу ставить агентам какие-либо жесткие рамки, и также что-то хардкодить. Потому что мы создаем проект, который генерирует курсы для любой тематики, существующих в этом мире."

**Анализ RT-006**: Страх обоснован на **20%**
- ✅ **80% правил** — педагогически корректны (non-measurable verbs, TODO blocking)
- ⚠️ **15% правил** — нуждаются в доработке (whitelist fuzzy match, bracket detection)
- ❌ **5% правил** — потенциально опасны (ENGAGEMENT_CAP, aggressive bracket detection)

**Решение**: Не ослаблять педагогические стандарты, а **сделать их применение прогрессивным** (ERROR → WARNING → INFO).

---

## Проблемы RT-006, Требующие Решения

### Problem 1: Bloom's Verb Whitelist — Language-Agnostic Fuzzy Match (P1) ⚠️

**Текущее поведение**: Exact match не учитывает глагольные формы, синонимы и морфологию различных языков

**Ложные блокировки** (примеры для разных языков):
```typescript
// Русский (Russian): Глагольные формы
"объяснить" ✅ (в whitelist)
"объяснять" ❌ (не в whitelist, но та же семантика)
"дать объяснение" ❌ (фразовый глагол)

// Испанский (Spanish): Спряжения
"explicar" ✅ (в whitelist)
"explicando" ❌ (герундий, та же основа)
"explique" ❌ (сослагательное наклонение)

// Французский (French): Инфинитивы
"expliquer" ✅ (в whitelist)
"expliquant" ❌ (причастие настоящего времени)

// Арабский (Arabic): Корневые вариации
"شرح" (sharaḥa - объяснил) ✅
"يشرح" (yashraḥ - объясняет) ❌ (та же корневая основа)

// Китайский (Chinese): Variations with 了/过/着
"解释" (jiěshì - объяснять) ✅
"解释了" (jiěshì le - объяснил) ❌ (аспектуальная частица)
```

**Решение**: Universal Stemming + Language-Agnostic Fuzzy Match для **19+ языков**

**Реализация**: Universal Language-Agnostic Solution

```typescript
// packages/course-gen-platform/src/server/services/generation/validators/blooms-validators.ts

import Snowball from 'snowball'; // Supports 15+ languages
import levenshtein from 'fast-levenshtein';

// Supported languages by Snowball stemmer
// https://snowballstem.org/algorithms/
const SNOWBALL_LANGUAGES = {
  en: 'english',
  ru: 'russian',
  es: 'spanish',
  fr: 'french',
  de: 'german',
  pt: 'portuguese',
  it: 'italian',
  ar: 'arabic',
  tr: 'turkish',
  hi: 'hindi',
  // Для остальных используем fallback strategy
};

// Для языков без stemmer (Chinese, Japanese, Korean, Thai, etc.)
const CJK_LANGUAGES = ['zh', 'ja', 'ko', 'th', 'vi', 'id', 'ms', 'bn'];

interface StemmerCache {
  [language: string]: {
    [word: string]: string;
  };
}

// Cache для производительности
const stemmerCache: StemmerCache = {};

function stemWord(word: string, language: string): string {
  // Check cache first
  if (stemmerCache[language]?.[word]) {
    return stemmerCache[language][word];
  }

  let stemmed: string;

  if (SNOWBALL_LANGUAGES[language]) {
    // Use Snowball stemmer for supported languages
    const stemmer = new Snowball(SNOWBALL_LANGUAGES[language]);
    stemmer.setCurrent(word);
    stemmer.stem();
    stemmed = stemmer.getCurrent();
  } else if (CJK_LANGUAGES.includes(language)) {
    // For CJK languages, no stemming needed (morphology handled differently)
    // Just normalize: lowercase + trim
    stemmed = word.toLowerCase().trim();
  } else {
    // Fallback: simple suffix removal for unknown languages
    stemmed = word.toLowerCase().replace(/(?:ing|ed|s|es|ly|tion|ment)$/i, '');
  }

  // Cache result
  if (!stemmerCache[language]) {
    stemmerCache[language] = {};
  }
  stemmerCache[language][word] = stemmed;

  return stemmed;
}

function isSimilarVerb(verb: string, whitelist: string[], language: string): boolean {
  const lowerVerb = verb.toLowerCase().trim();

  // Exact match (fast path)
  if (whitelist.some(v => v.toLowerCase() === lowerVerb)) {
    return true;
  }

  // Fuzzy match for all languages
  const verbStem = stemWord(lowerVerb, language);

  return whitelist.some(whitelistVerb => {
    const whitelistStem = stemWord(whitelistVerb.toLowerCase(), language);

    // Stemming match (works for 15+ languages via Snowball)
    if (verbStem === whitelistStem) return true;

    // Levenshtein distance ≤ 2 (typos, minor variations)
    // Universal across all languages
    if (levenshtein.get(verbStem, whitelistStem) <= 2) return true;

    return false;
  });
}

// Обновить validateBloomsTaxonomy():
function validateBloomsTaxonomy(objective: LearningObjective): ValidationResult {
  const verb = extractActionVerb(objective.text, objective.language);
  const whitelistForLanguage = BLOOMS_TAXONOMY_WHITELIST[objective.language];

  // Check if verb exists in any cognitive level (с fuzzy match)
  for (const [level, verbs] of Object.entries(whitelistForLanguage)) {
    if (isSimilarVerb(verb, verbs, objective.language)) {
      return {
        passed: true,
        cognitiveLevel: level as BloomLevel,
        verb,
        score: 1.0,
        matchType: 'fuzzy' // для метрик
      };
    }
  }

  // ВАЖНО: Если не нашли, это WARNING, а не ERROR
  return {
    passed: false, // но не блокируем сразу!
    severity: ValidationSeverity.WARNING, // ⚠️ WARNING вместо ERROR
    cognitiveLevel: null,
    verb,
    score: 0.7, // partial credit (не 0.0!)
    issues: [`Action verb "${verb}" not found in Bloom's taxonomy whitelist for ${objective.language}`],
    suggestion: suggestAlternativeVerb(verb, objective.language)
  };
}
```

**Extensible Bloom's Whitelist Architecture**:

```typescript
// packages/course-gen-platform/src/server/services/generation/validators/blooms-whitelists.ts

// Core whitelists for 19 languages
// Structure: language → cognitive level → verbs[]
export const BLOOMS_TAXONOMY_MULTILINGUAL = {
  en: {
    remember: ["list", "name", "identify", "recall", "define", /* ... */],
    understand: ["explain", "summarize", "interpret", /* ... */],
    apply: ["demonstrate", "implement", "execute", /* ... */],
    analyze: ["compare", "contrast", "differentiate", /* ... */],
    evaluate: ["assess", "justify", "critique", /* ... */],
    create: ["design", "develop", "construct", /* ... */]
  },

  ru: {
    remember: ["перечислить", "назвать", "определить", /* ... */],
    understand: ["объяснить", "резюмировать", /* ... */],
    // ... остальные уровни
  },

  es: {
    remember: ["listar", "nombrar", "identificar", "recordar", "definir"],
    understand: ["explicar", "resumir", "interpretar", "describir"],
    apply: ["demostrar", "implementar", "ejecutar", "usar", "resolver"],
    analyze: ["comparar", "contrastar", "diferenciar", "examinar"],
    evaluate: ["evaluar", "justificar", "criticar", "defender"],
    create: ["diseñar", "desarrollar", "construir", "formular"]
  },

  fr: {
    remember: ["lister", "nommer", "identifier", "rappeler", "définir"],
    understand: ["expliquer", "résumer", "interpréter", "décrire"],
    apply: ["démontrer", "mettre en œuvre", "exécuter", "utiliser"],
    analyze: ["comparer", "contraster", "différencier", "examiner"],
    evaluate: ["évaluer", "justifier", "critiquer", "défendre"],
    create: ["concevoir", "développer", "construire", "formuler"]
  },

  de: {
    remember: ["auflisten", "benennen", "identifizieren", "erinnern"],
    understand: ["erklären", "zusammenfassen", "interpretieren"],
    apply: ["demonstrieren", "implementieren", "ausführen", "anwenden"],
    analyze: ["vergleichen", "gegenüberstellen", "differenzieren"],
    evaluate: ["bewerten", "begründen", "kritisieren", "verteidigen"],
    create: ["entwerfen", "entwickeln", "konstruieren", "formulieren"]
  },

  zh: {
    remember: ["列出", "命名", "识别", "回忆", "定义"],
    understand: ["解释", "总结", "解读", "描述"],
    apply: ["演示", "实施", "执行", "使用", "应用"],
    analyze: ["比较", "对比", "区分", "检查"],
    evaluate: ["评估", "证明", "批评", "辩护"],
    create: ["设计", "开发", "构建", "制定"]
  },

  ar: {
    remember: ["قائمة", "اسم", "تحديد", "تذكر", "تعريف"],
    understand: ["شرح", "تلخيص", "تفسير", "وصف"],
    apply: ["إظهار", "تنفيذ", "تطبيق", "استخدام"],
    analyze: ["مقارنة", "تباين", "تمييز", "فحص"],
    evaluate: ["تقييم", "تبرير", "انتقاد", "دفاع"],
    create: ["تصميم", "تطوير", "بناء", "صياغة"]
  },

  // Fallback: используем English whitelist для неизвестных языков
  // with language detection warning
};

// Helper: Get whitelist for language with fallback
export function getBloomsWhitelist(language: string) {
  if (BLOOMS_TAXONOMY_MULTILINGUAL[language]) {
    return BLOOMS_TAXONOMY_MULTILINGUAL[language];
  }

  // Fallback to English with warning
  logger.warn(`No Bloom's whitelist for language "${language}", using English fallback`);
  return BLOOMS_TAXONOMY_MULTILINGUAL.en;
}
```

**Plugin Architecture для новых языков**:

```typescript
// Позволяет добавлять новые языки без изменения core logic
export function registerLanguageWhitelist(
  language: string,
  whitelist: BloomsWhitelist
): void {
  if (BLOOMS_TAXONOMY_MULTILINGUAL[language]) {
    logger.warn(`Overwriting existing whitelist for language "${language}"`);
  }

  BLOOMS_TAXONOMY_MULTILINGUAL[language] = whitelist;
  logger.info(`Registered Bloom's whitelist for language "${language}"`);
}

// Usage:
// registerLanguageWhitelist('pt', { remember: [...], understand: [...], ... });
```

**Dependencies**:
- `snowball` (или `snowball-js`) для universal stemming (15+ языков)
- `fast-levenshtein` для distance computation
- Fallback strategy для языков без stemmer (CJK)

**Success Criteria**:
- ✅ Работает для всех 19 языков (ru, en, zh, es, fr, de, ja, ko, ar, pt, it, tr, vi, th, id, ms, hi, bn, pl)
- ✅ "объяснить" = "объяснять" = "объяснение" (Russian stem match)
- ✅ "explicar" = "explicando" (Spanish stem match)
- ✅ "解释" = "解释了" (Chinese normalization)
- ✅ False positive rate -10-15% across all languages
- ✅ Bloom's compliance остается ≥90%
- ✅ Plugin architecture позволяет добавить новый язык за <1 час

---

### Problem 2: Bracket/Angle Detection — Слишком Агрессивно (P1) ⚠️

**Текущее поведение**: `/\[.*?\]/` ловит ВСЕ скобки, включая легитимные

**Ложные срабатывания**:
```javascript
// ❌ FALSE POSITIVE
"Изучите массивы [array] и объекты [object] в JavaScript"
// → Детектор думает, что [array] - это placeholder!

// ❌ FALSE POSITIVE
"Рассмотрим типы: Array<number>, Map<string, boolean>"
// → <number> и <string> выглядят как placeholders!

// ❌ FALSE POSITIVE
"Эта тема интересна... и важна для карьеры"
// → Многоточие в середине - НЕ placeholder!
```

**Решение**: Консервативная детекция — только явные placeholders

**Реализация**:
```typescript
// packages/course-gen-platform/src/server/services/generation/validators/placeholder-validator.ts

const PLACEHOLDER_REGEX_PATTERNS = [
  // ✅ TODO/FIXME markers (блокируем всегда)
  /\b(TODO|FIXME|XXX|HACK|NOTE|@todo)\b/i,

  // ✅ Только явные bracketed placeholders
  /\[TODO\]/i,
  /\[TBD\]/i,
  /\[FIXME\]/i,
  /\[insert[^\]]*\]/i,      // [insert ...], [insert topic]
  /\[add[^\]]*\]/i,         // [add ...], [add content]
  /\[replace[^\]]*\]/i,     // [replace ...]
  /\[название[^\]]*\]/i,    // [название ...]
  /\[описание[^\]]*\]/i,    // [описание ...]
  /\[введите[^\]]*\]/i,     // [введите ...]
  /\[добавьте[^\]]*\]/i,    // [добавьте ...]

  // ❌ УДАЛЕНО: /\[.*?\]/ (ловило ВСЕ скобки)
  // ❌ УДАЛЕНО: /<.*?>/ (ловило HTML tags и <generic> types)

  // ✅ Template variables (только двойные скобки)
  /\{\{[^}]+\}\}/,          // {{variable}} — явный template
  /\$\{[^}]+\}/,            // ${variable} — явный template

  // ✅ Ellipsis indicators (только в начале или изолированно)
  /^\.\.\.$|^\.\.\.\s/,     // "..." в начале строки
  /…$/,                      // Unicode ellipsis в конце

  // ✅ Generic placeholders (только с контекстом)
  /\b(example|sample|placeholder|пример|образец)\s+(title|name|description|text|название|текст)\b/i,

  // ✅ Empty or whitespace-only content
  /^\s*$/,

  // ✅ Numeric placeholders (только с контекстом)
  /\b(N|X|Y|Z)\s+(students|hours|modules|студентов|часов|модулей)\b/i
];

// ВАЖНО: Bracket detection теперь WARNING, а не ERROR
function validatePlaceholders(structure: CourseStructure): ValidationResult {
  const issues: PlaceholderIssue[] = [];

  // Check all text fields recursively
  function checkField(obj: any, path: string) {
    if (typeof obj === "string") {
      for (const pattern of PLACEHOLDER_REGEX_PATTERNS) {
        if (pattern.test(obj)) {
          const match = obj.match(pattern);
          const severity = determineSeverity(match![0]); // TODO, FIXME → ERROR, остальное → WARNING

          issues.push({
            path,
            pattern: pattern.source,
            match: match![0],
            severity,
            context: obj.substring(0, 100)
          });
        }
      }
    } else if (typeof obj === "object" && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        checkField(value, `${path}.${key}`);
      }
    }
  }

  checkField(structure, "courseStructure");

  // Разделяем по severity
  const errors = issues.filter(i => i.severity === ValidationSeverity.ERROR);
  const warnings = issues.filter(i => i.severity === ValidationSeverity.WARNING);

  return {
    passed: errors.length === 0, // Блокируем только на ERROR
    score: errors.length === 0 ? (warnings.length === 0 ? 1.0 : 0.85) : 0.0,
    issues: errors.length > 0 ? errors.map(i => i.match) : [],
    warnings: warnings.map(i => i.match),
    detectionRate: issues.length > 0 ? 0.95 : 1.0,
    blockedAt: ValidationStage.DRAFT
  };
}

function determineSeverity(match: string): ValidationSeverity {
  // TODO, FIXME, XXX → ERROR (блокируем)
  if (/\b(TODO|FIXME|XXX|HACK)\b/i.test(match)) {
    return ValidationSeverity.ERROR;
  }

  // [TODO], [TBD], [insert...] → ERROR (блокируем)
  if (/\[(TODO|TBD|FIXME|insert|add|replace)\b/i.test(match)) {
    return ValidationSeverity.ERROR;
  }

  // Остальное → WARNING (не блокируем, но логируем)
  return ValidationSeverity.WARNING;
}
```

**Success Criteria**:
- ✅ "[array]" в контексте "массивы [array] и объекты [object]" — НЕ блокируется
- ✅ "<number>" в контексте "Array<number>" — НЕ блокируется
- ✅ "..." в середине предложения — НЕ блокируется
- ✅ "[TODO]" и "[insert topic]" — блокируются (ERROR)
- ✅ False positive rate -20-30%

---

### Problem 3: ENGAGEMENT_CAP = 6 min — Блокирует Сложные Темы (P1) ❌

**Текущее поведение**: Жесткий 6-minute cap блокирует сложные темы

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

**Решение**: Убрать ENGAGEMENT_CAP как ERROR, сделать INFO level

**Реализация**:
```typescript
// packages/course-gen-platform/src/server/services/generation/validators/duration-validator.ts

function validateDurationProportionality(lesson: Lesson): ValidationResult {
  const topicCount = lesson.topics.length;
  const objectiveCount = lesson.learningObjectives.length;
  const actualDuration = lesson.estimatedDuration;

  const expected = calculateExpectedDuration(topicCount, objectiveCount);

  // MIN/MAX checks (критичные)
  if (actualDuration < expected.min) {
    return {
      passed: false,
      severity: ValidationSeverity.ERROR, // ✅ Блокируем слишком короткие
      score: actualDuration / expected.min,
      issues: [
        `Duration too short: ${actualDuration} min (expected ${expected.min}-${expected.max} min)`
      ]
    };
  }

  if (actualDuration > expected.max) {
    return {
      passed: false,
      severity: ValidationSeverity.WARNING, // ⚠️ WARNING для слишком длинных (не ERROR!)
      score: expected.max / actualDuration,
      issues: [
        `Duration too long: ${actualDuration} min (expected ${expected.min}-${expected.max} min)`
      ]
    };
  }

  // ENGAGEMENT_CAP check (НЕ критичный!)
  if (actualDuration > ENGAGEMENT_CAP && !lesson.hasBreaks) {
    // ℹ️ INFO level - только логируем, НЕ блокируем!
    logger.info('Duration exceeds engagement cap', {
      lesson: lesson.id,
      duration: actualDuration,
      engagementCap: ENGAGEMENT_CAP,
      recommendation: 'Consider adding breaks or splitting into shorter lessons'
    });

    // НЕ возвращаем ValidationResult с passed: false!
    // Это просто метрика для мониторинга
  }

  return {
    passed: true,
    severity: ValidationSeverity.INFO,
    score: 1.0,
    expectedRange: expected,
    actualDuration
  };
}
```

**Success Criteria**:
- ✅ Сложные темы (30-45 min) НЕ блокируются
- ✅ ENGAGEMENT_CAP логируется, но НЕ блокирует
- ✅ MIN/MAX proportionality по-прежнему применяется
- ✅ Метрики собираются для future analysis

---

### Problem 4: Отсутствие Difficulty Level Modifier (P2) 💡

**Текущее поведение**: Duration formulas не учитывают сложность темы

**Проблема**:
```javascript
// Beginner topic: "Переменные в Python"
MIN = 2×2 + 1×5 = 9 минут  // ✅ OK для beginner

// Advanced topic: "Метапрограммирование в Python"
MIN = 2×2 + 1×5 = 9 минут  // ❌ Слишком мало для advanced!
```

**Решение**: Difficulty level multiplier

**Реализация**:
```typescript
// packages/course-gen-platform/src/server/services/generation/validators/duration-validator.ts

const DIFFICULTY_MULTIPLIER = {
  beginner: 1.0,      // базовая формула
  intermediate: 1.5,  // +50% времени
  advanced: 2.0,      // +100% времени
};

function calculateExpectedDuration(
  topicCount: number,
  objectiveCount: number,
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
): { min: number; max: number } {
  const multiplier = DIFFICULTY_MULTIPLIER[difficultyLevel];

  // Base calculation
  const baseMin = topicCount * MIN_TOPIC_DURATION + objectiveCount * MIN_OBJECTIVE_DURATION;
  const baseMax = topicCount * MAX_TOPIC_DURATION + objectiveCount * MAX_OBJECTIVE_DURATION;

  // Apply difficulty multiplier
  return {
    min: Math.ceil(baseMin * multiplier),
    max: Math.ceil(baseMax * multiplier)
  };
}

// Пример:
// Beginner "Переменные в Python":
//   MIN = (2×2 + 1×5) × 1.0 = 9 минут ✅
// Advanced "Метапрограммирование":
//   MIN = (2×2 + 1×5) × 2.0 = 18 минут ✅
```

**Success Criteria**:
- ✅ Beginner topics — базовая формула (1.0x)
- ✅ Intermediate topics — +50% времени (1.5x)
- ✅ Advanced topics — +100% времени (2.0x)
- ✅ Duration validation учитывает difficulty level

---

## Архитектура: 3-Tier Severity System

**Ключевое улучшение**: Разделить validation rules на 3 уровня severity

```typescript
// packages/shared-types/src/generation-result.ts

export enum ValidationSeverity {
  ERROR = "error",      // Блокирует сохранение
  WARNING = "warning",  // Логирует, но пропускает
  INFO = "info",        // Только мониторинг
}

export interface ValidationRule {
  name: string;
  severity: ValidationSeverity;
  validate: (input: any) => ValidationResult;
  description: string;
  rationale: string; // Почему это правило существует
}
```

**Правила по Severity**:

| Rule                         | Current | Proposed | Rationale                                      |
|------------------------------|---------|----------|------------------------------------------------|
| Non-measurable verbs         | ERROR   | ERROR    | ✅ Педагогически некорректно всегда            |
| TODO/FIXME placeholders      | ERROR   | ERROR    | ✅ Явно incomplete content                     |
| Bloom's whitelist            | ERROR   | WARNING  | ⚠️ Fuzzy match снижает false positives        |
| Bracket detection            | ERROR   | WARNING  | ⚠️ Много false positives ([array], <number>)  |
| Duration MIN (too short)     | ERROR   | ERROR    | ✅ Cognitive overload риск                     |
| Duration MAX (too long)      | ERROR   | WARNING  | ⚠️ Может быть обоснованно для сложных тем     |
| ENGAGEMENT_CAP (6 min)       | ERROR   | INFO     | ℹ️ Только метрика, не блокатор                 |
| Specificity score            | -       | INFO     | ℹ️ Метрика для dashboards                     |

**Реализация**:

```typescript
// packages/course-gen-platform/src/server/services/generation/validators/validation-orchestrator.ts

const VALIDATION_RULES: Record<string, ValidationRule> = {
  nonMeasurableVerbs: {
    name: 'Non-Measurable Verbs',
    severity: ValidationSeverity.ERROR,
    validate: validateNonMeasurableVerbs,
    description: 'Blocks understand/know/learn verbs',
    rationale: '40% of quality issues stem from non-measurable verbs (RT-006 research)'
  },

  bloomsWhitelist: {
    name: 'Blooms Taxonomy Whitelist',
    severity: ValidationSeverity.WARNING, // ⚠️ CHANGED from ERROR
    validate: validateBloomsTaxonomy,
    description: 'Checks verb against 165-verb whitelist with fuzzy match',
    rationale: 'Fuzzy match reduces false positives for Russian verb forms'
  },

  placeholdersTODO: {
    name: 'TODO/FIXME Placeholders',
    severity: ValidationSeverity.ERROR,
    validate: (obj) => validatePlaceholders(obj, { onlyExplicit: true }),
    description: 'Blocks explicit TODO/FIXME markers',
    rationale: 'Incomplete content must not reach production'
  },

  placeholdersBrackets: {
    name: 'Bracketed Placeholders',
    severity: ValidationSeverity.WARNING, // ⚠️ CHANGED from ERROR
    validate: (obj) => validatePlaceholders(obj, { onlyExplicit: false }),
    description: 'Detects [insert...], [topic], but allows [array] in context',
    rationale: 'Conservative detection reduces false positives'
  },

  durationMin: {
    name: 'Duration Minimum',
    severity: ValidationSeverity.ERROR,
    validate: (lesson) => validateDurationMin(lesson),
    description: 'Enforces 2-5 min/topic, 5-15 min/objective',
    rationale: 'Cognitive load research (RT-006)'
  },

  engagementCap: {
    name: 'Engagement Cap (6 min)',
    severity: ValidationSeverity.INFO, // ℹ️ CHANGED from ERROR
    validate: (lesson) => validateEngagementCap(lesson),
    description: 'Monitors lessons >6 min without breaks',
    rationale: 'Metric for UX optimization, not blocker'
  }
};

async function orchestrateValidation(
  structure: CourseStructure,
  stage: ValidationStage
): Promise<OrchestratedValidationResult> {
  const results: ValidationResult[] = [];
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  // Run all validators for this stage
  for (const rule of STAGE_VALIDATORS[stage]) {
    const result = await rule.validate(structure);
    results.push(result);

    // Categorize by severity
    if (!result.passed) {
      const issue = {
        rule: rule.name,
        severity: rule.severity,
        issues: result.issues,
        suggestion: result.suggestion
      };

      if (rule.severity === ValidationSeverity.ERROR) {
        errors.push(issue);
      } else if (rule.severity === ValidationSeverity.WARNING) {
        warnings.push(issue);
      } else {
        info.push(issue);
      }
    }
  }

  // Block only on ERRORS
  const passed = errors.length === 0;

  return {
    passed,
    stage,
    errors,
    warnings,
    info,
    recommendation: passed ? 'PROCEED' : 'REGENERATE_METADATA'
  };
}
```

---

## Implementation Roadmap

### Phase 1: Quick Fixes (2-3 hours) — P1

**Цель**: Снизить false positive rate на 15-20%

**Задачи**:
1. ✅ Смягчить bracket detection (только явные placeholders)
   - File: `validators/placeholder-validator.ts`
   - Change: `/\[.*?\]/` → `/\[(TODO|TBD|insert|add|replace)\b/i`
   - Impact: -20-30% false positives

2. ✅ Убрать ENGAGEMENT_CAP как ERROR (сделать INFO)
   - File: `validators/duration-validator.ts`
   - Change: `return { passed: false, ... }` → `logger.info(...)`
   - Impact: Сложные темы больше НЕ блокируются

3. ✅ Добавить difficulty_level modifier
   - File: `validators/duration-validator.ts`
   - Change: Add `DIFFICULTY_MULTIPLIER` logic
   - Impact: Advanced topics получают +100% времени

**Executor**: `quality-validator-specialist` или main orchestrator
**Testing**: Unit tests для новых regex patterns, integration test для duration multiplier
**Success Criteria**:
- ✅ False positive rate -15-20%
- ✅ Bloom's compliance ≥90%
- ✅ No regressions on TODO/FIXME blocking

---

### Phase 2: Universal Multilingual Fuzzy Match (4-6 hours) — P1

**Цель**: Поддержка 19 языков с universal stemming + extensible architecture

**Поддерживаемые языки** (из `courseai-next/lib/validation/course.ts`):
```typescript
const SUPPORTED_LANGUAGES = [
  'ru',  // Russian (Русский)
  'en',  // English (Английский)
  'zh',  // Chinese Simplified (简体中文)
  'es',  // Spanish (Español)
  'fr',  // French (Français)
  'de',  // German (Deutsch)
  'ja',  // Japanese (日本語)
  'ko',  // Korean (한국어)
  'ar',  // Arabic (العربية)
  'pt',  // Portuguese (Português)
  'it',  // Italian (Italiano)
  'tr',  // Turkish (Türkçe)
  'vi',  // Vietnamese (Tiếng Việt)
  'th',  // Thai (ไทย)
  'id',  // Indonesian (Bahasa Indonesia)
  'ms',  // Malay (Bahasa Melayu)
  'hi',  // Hindi (हिन्दी)
  'bn',  // Bengali (বাংলা)
  'pl'   // Polish (Polski)
] as const;
```

**Задачи**:

1. ✅ Интегрировать universal stemmer (Snowball)
   - Dependency: `snowball` или `snowball-js`
   - Supports: English, Russian, Spanish, French, German, Portuguese, Italian, Turkish, Arabic, Hindi (10/19 языков)
   - File: `validators/blooms-validators.ts`
   - Function: `stemWord(word, language)`

2. ✅ Fallback strategy для CJK языков (Chinese, Japanese, Korean, Thai, Vietnamese)
   - Normalization: lowercase + trim (морфология обрабатывается по-другому)
   - Levenshtein distance остается для typos

3. ✅ Создать Bloom's whitelists для всех 19 языков
   - File: `validators/blooms-whitelists.ts`
   - Structure: `{ [language]: { remember: [...], understand: [...], ... } }`
   - Initial: EN + RU (полные), остальные (базовые 30-40 verbs per level)
   - Extensible: Plugin architecture для добавления новых языков

4. ✅ Language detection fallback
   - Если язык неизвестен → используем English whitelist + warning
   - Логируем для future expansion

5. ✅ Bloom's whitelist validation → WARNING вместо ERROR
   - File: `validators/blooms-validators.ts`
   - Change: `return { passed: false, severity: WARNING, score: 0.7 }`

**Executor**: `quality-validator-specialist`

**Testing**:
- Unit tests: Stemming для 10 языков (Snowball-supported)
  - Russian: "объяснить" = "объяснять" = "объяснение"
  - Spanish: "explicar" = "explicando" = "explique"
  - French: "expliquer" = "expliquant"
  - German: "erklären" = "erklärt"
  - Arabic: "شرح" = "يشرح"

- Unit tests: Normalization для CJK языков
  - Chinese: "解释" = "解释了" (strip particles)
  - Japanese: "説明する" = "説明します" (normalize forms)
  - Korean: "설명하다" = "설명합니다"

- Unit tests: Levenshtein typos (universal)
  - "объяснить" = "объяснят" (RU typo, distance ≤2)
  - "explain" = "explan" (EN typo, distance ≤2)

- Integration test: Multilingual course generation
  - Generate courses in 5+ languages
  - Validate fuzzy match works across all

**Success Criteria**:
- ✅ Работает для всех 19 языков
- ✅ Stemming: 10 языков через Snowball (EN, RU, ES, FR, DE, PT, IT, TR, AR, HI)
- ✅ Normalization: 9 языков через fallback (ZH, JA, KO, TH, VI, ID, MS, BN, PL)
- ✅ Typos с distance ≤2 не блокируются (universal)
- ✅ False positive rate -10-15% across all languages
- ✅ Bloom's compliance ≥90%
- ✅ Plugin architecture: добавить новый язык за <1 час

---

### Phase 3: Severity Levels Integration (4-5 hours) — P2

**Цель**: Полная интеграция 3-tier severity system

**Задачи**:
1. ✅ Создать `ValidationSeverity` enum
   - File: `packages/shared-types/src/generation-result.ts`
   - Export: `ERROR`, `WARNING`, `INFO`

2. ✅ Обновить все validators на severity-based
   - Files: `validators/*.ts`
   - Change: Add `severity` field to all ValidationResults

3. ✅ Orchestration logic для severity filtering
   - File: `validators/validation-orchestrator.ts`
   - Logic: Block только на ERROR, log на WARNING, monitor на INFO

4. ✅ Logging/metrics для WARNING и INFO
   - Integration: Pino logger
   - Metrics: Collect false positive rates per rule

**Executor**: Main orchestrator + `quality-validator-specialist`
**Testing**:
- Unit tests: Severity filtering logic
- Integration test: Course проходит с WARNINGS, но блокируется на ERRORS

**Success Criteria**:
- ✅ ERROR блокирует сохранение
- ✅ WARNING логируется, но пропускает
- ✅ INFO только метрики, нет влияния на flow
- ✅ Metrics dashboard показывает WARNING/INFO counts

---

### Phase 4: Metrics Collection & Analysis (3-4 hours) — P3

**Цель**: Data-driven decision making для future tuning

**Задачи**:
1. ✅ Собирать метрики false positives per rule
   - Metric: `validation_false_positive_rate{rule="bloomsWhitelist"}`
   - Logic: Если retry успешен после WARNING → считаем false positive

2. ✅ Собирать avg_retries_needed per rule
   - Metric: `validation_avg_retries{rule="placeholdersBrackets"}`
   - Logic: Сколько retry попыток нужно в среднем

3. ✅ Dashboard для monitoring
   - Tool: Grafana или custom admin UI
   - Display: False positive rates, retry counts, quality scores

4. ✅ Automated alerts для правил с FP >30%
   - Logic: Если `false_positive_rate > 0.30` → alert для review
   - Action: Consider смягчение правила или removal

**Executor**: Main orchestrator
**Testing**: Synthetic data для проверки metric collection
**Success Criteria**:
- ✅ False positive rate tracked per rule
- ✅ Retry success rate tracked
- ✅ Dashboard доступен для analysis
- ✅ Alerts работают для FP >30%

---

## Success Criteria: Overall

### Quality Metrics (Must Pass)
- ✅ Bloom's compliance: ≥90% (сохранить from RT-006)
- ✅ False positive rate: -15-20% (улучшение)
- ✅ Retry success rate: +20-30% (меньше regeneration loops)
- ✅ Semantic similarity: ≥0.75 (сохранить from RT-004)

### Flexibility Metrics (Must Pass)
- ✅ Russian verb forms: "объяснить" = "объяснять" (fuzzy match работает)
- ✅ Legitimate brackets: "[array]" в контексте НЕ блокируется
- ✅ Complex topics: 30-45 min темы проходят validation
- ✅ Domain universality: Работает для quantum physics, cooking, marketing, programming

### Performance Metrics (Should Pass)
- ✅ Validation latency: <100ms per lesson (stemming overhead minimal)
- ✅ Memory overhead: <10MB (stemmer + levenshtein caching)
- ✅ No regression: P0 rules (non-measurable, TODO) по-прежнему блокируют

---

## Testing Strategy

### Unit Tests (Required)

```typescript
// packages/course-gen-platform/src/server/services/generation/validators/__tests__/blooms-validators.test.ts

describe('Blooms Taxonomy Validator - Fuzzy Match', () => {
  it('should accept Russian verb forms via stemming', () => {
    const objective1 = { text: "объяснить closures", language: "ru" };
    const objective2 = { text: "объяснять closures", language: "ru" };
    const objective3 = { text: "дать объяснение closures", language: "ru" };

    const result1 = validateBloomsTaxonomy(objective1);
    const result2 = validateBloomsTaxonomy(objective2);
    const result3 = validateBloomsTaxonomy(objective3);

    expect(result1.passed).toBe(true);
    expect(result2.passed).toBe(true); // ✅ Fuzzy match работает
    expect(result3.passed).toBe(true); // ✅ Фразовый глагол работает
  });

  it('should handle typos with Levenshtein ≤2', () => {
    const objective = { text: "объяснят closures", language: "ru" }; // typo
    const result = validateBloomsTaxonomy(objective);

    expect(result.passed).toBe(true); // ✅ Typo не блокирует
    expect(result.matchType).toBe('fuzzy');
  });
});

// packages/course-gen-platform/src/server/services/generation/validators/__tests__/placeholder-validator.test.ts

describe('Placeholder Validator - Conservative Detection', () => {
  it('should NOT block legitimate brackets in context', () => {
    const text = "Изучите массивы [array] и объекты [object] в JavaScript";
    const result = validatePlaceholders({ someField: text });

    expect(result.passed).toBe(true); // ✅ НЕ блокируем
    expect(result.warnings).toHaveLength(0); // ✅ Даже WARNING нет
  });

  it('should block explicit [TODO] and [insert...]', () => {
    const text1 = "Learning objectives [TODO]";
    const text2 = "Topics: [insert topic here]";

    const result1 = validatePlaceholders({ someField: text1 });
    const result2 = validatePlaceholders({ someField: text2 });

    expect(result1.passed).toBe(false); // ❌ Блокируем
    expect(result2.passed).toBe(false); // ❌ Блокируем
  });
});

// packages/course-gen-platform/src/server/services/generation/validators/__tests__/duration-validator.test.ts

describe('Duration Validator - Difficulty Multiplier', () => {
  it('should apply difficulty multiplier correctly', () => {
    const beginnerLesson = {
      topics: ['Variables', 'Data types'],
      learningObjectives: [{ text: 'Define variables' }],
      estimatedDuration: 9, // 2×2 + 1×5 = 9
      difficultyLevel: 'beginner'
    };

    const advancedLesson = {
      topics: ['Metaprogramming', 'Decorators'],
      learningObjectives: [{ text: 'Implement decorators' }],
      estimatedDuration: 18, // (2×2 + 1×5) × 2.0 = 18
      difficultyLevel: 'advanced'
    };

    const result1 = validateDurationProportionality(beginnerLesson);
    const result2 = validateDurationProportionality(advancedLesson);

    expect(result1.passed).toBe(true); // ✅ 9 min OK для beginner
    expect(result2.passed).toBe(true); // ✅ 18 min OK для advanced
  });

  it('should NOT block on ENGAGEMENT_CAP', () => {
    const complexLesson = {
      topics: ['Async', 'Promises', 'Event Loop', 'Callbacks'],
      learningObjectives: [
        { text: 'Explain event loop' },
        { text: 'Implement promises' },
        { text: 'Debug async errors' }
      ],
      estimatedDuration: 35, // Превышает 6-minute cap
      hasBreaks: false
    };

    const result = validateDurationProportionality(complexLesson);

    expect(result.passed).toBe(true); // ✅ НЕ блокируем!
    expect(result.severity).toBe(ValidationSeverity.INFO); // ℹ️ Только INFO
  });
});
```

### Integration Tests (Required)

```typescript
// packages/course-gen-platform/src/server/services/generation/__tests__/integration/validation-flow.test.ts

describe('Validation Flow - Progressive Severity', () => {
  it('should pass with WARNINGs but block on ERRORs', async () => {
    const courseWithWarnings = {
      title: "Advanced JavaScript",
      lessons: [{
        learningObjectives: [
          { text: "объяснять closures", language: "ru" } // WARNING (fuzzy match)
        ],
        topics: ["Closures"],
        estimatedDuration: 10
      }]
    };

    const result = await orchestrateValidation(courseWithWarnings, ValidationStage.REVIEW);

    expect(result.passed).toBe(true); // ✅ Проходит с WARNING
    expect(result.warnings).toHaveLength(1); // ⚠️ 1 WARNING
    expect(result.errors).toHaveLength(0); // ✅ Нет ERRORS
  });

  it('should block on non-measurable verbs (ERROR)', async () => {
    const courseWithErrors = {
      title: "JavaScript Basics",
      lessons: [{
        learningObjectives: [
          { text: "understand closures", language: "en" } // ERROR (non-measurable)
        ],
        topics: ["Closures"],
        estimatedDuration: 10
      }]
    };

    const result = await orchestrateValidation(courseWithErrors, ValidationStage.DRAFT);

    expect(result.passed).toBe(false); // ❌ Блокируем
    expect(result.errors).toHaveLength(1); // ❌ 1 ERROR
    expect(result.errors[0].rule).toBe('Non-Measurable Verbs');
  });
});
```

---

## Monitoring & Metrics

### Metrics to Track

```typescript
// packages/course-gen-platform/src/server/services/generation/monitoring/validation-metrics.ts

interface ValidationMetrics {
  rule: string;

  // Quality metrics
  totalValidations: number;
  passed: number;
  failed: number;
  passRate: number; // passed / totalValidations

  // Severity breakdown
  errors: number;
  warnings: number;
  info: number;

  // False positive tracking
  falsePositives: number; // Cases where retry succeeded after initial failure
  falsePositiveRate: number; // falsePositives / failed

  // Retry metrics
  avgRetriesNeeded: number; // Average retries until success
  maxRetriesObserved: number;

  // Performance
  avgLatencyMs: number;
  p95LatencyMs: number;
}

// Prometheus metrics
const validationCounter = new prometheus.Counter({
  name: 'course_gen_validation_total',
  help: 'Total validations by rule and result',
  labelNames: ['rule', 'severity', 'result'] // result: pass|fail
});

const falsePositiveGauge = new prometheus.Gauge({
  name: 'course_gen_validation_false_positive_rate',
  help: 'False positive rate by rule (0.0-1.0)',
  labelNames: ['rule']
});

const retryHistogram = new prometheus.Histogram({
  name: 'course_gen_validation_retries',
  help: 'Retries needed for successful validation',
  labelNames: ['rule'],
  buckets: [0, 1, 2, 3, 5, 10]
});
```

### Dashboards

**Grafana Dashboard**: "Validation Quality"

**Panels**:
1. **False Positive Rate by Rule** (target: <15%)
   - Gauge per rule: `course_gen_validation_false_positive_rate`
   - Alert if >30%

2. **Validation Pass Rate** (target: >90%)
   - Line graph: `rate(course_gen_validation_total{result="pass"}[5m])`

3. **Retry Distribution** (target: avg <2 retries)
   - Histogram: `course_gen_validation_retries`

4. **Severity Breakdown**
   - Stacked bar: ERROR / WARNING / INFO counts

---

## Risk Assessment

### Risk 1: False Positives Still Occur (P2)

**Probability**: Medium (10-15% even with fuzzy match)
**Impact**: Medium (user frustration, regeneration cost)

**Mitigation**:
- ✅ Progressive severity (WARNING instead of ERROR)
- ✅ Metrics collection → identify problematic rules
- ✅ Human override mechanism (future: Phase 5)
- ✅ Quarterly whitelist review

### Risk 2: Fuzzy Match Too Permissive (P2)

**Probability**: Low (5-10%)
**Impact**: High (may accept invalid verbs)

**Mitigation**:
- ✅ Levenshtein distance ≤2 (conservative threshold)
- ✅ Stemming only for Russian (English exact match)
- ✅ Monitor false negative rate (accepted invalid verbs)
- ✅ A/B testing: 50% fuzzy, 50% exact

### Risk 3: Performance Overhead (P3)

**Probability**: Low (stemming <5ms per objective)
**Impact**: Low (negligible vs LLM latency)

**Mitigation**:
- ✅ Compile regex at startup
- ✅ Cache stemming results
- ✅ Profile validation pipeline quarterly
- ✅ Benchmark: <100ms total validation per lesson

### Risk 4: Cultural Bias (P3)

**Probability**: Medium (Bloom's is Western framework)
**Impact**: Medium (may not align with all philosophies)

**Mitigation**:
- ✅ Document cultural assumptions
- ✅ Future: Add Vygotsky's ZPD framework (Russian)
- ✅ Allow custom verb whitelists per institution
- ✅ Collect feedback from non-Western instructors

---

## Future Enhancements (Phase 5+)

### 1. Domain-Specific Verb Extensions (P4)

```typescript
// LLM может предложить domain-specific verbs
const DOMAIN_VERBS_SUGGESTIONS = {
  programming: ['debug', 'refactor', 'compile', 'deploy', 'profile', 'optimize'],
  medicine: ['diagnose', 'prescribe', 'examine', 'treat', 'monitor'],
  cooking: ['sauté', 'julienne', 'blanch', 'caramelize', 'emulsify'],
  physics: ['derive', 'calculate', 'measure', 'observe', 'simulate'],
  // ... extensible
};

function suggestDomainVerb(objective: string, domain: string): string[] {
  // Если Bloom's verb не найден, предлагаем domain-specific
  return DOMAIN_VERBS_SUGGESTIONS[domain] || [];
}
```

### 2. Human Override Mechanism (P4)

```typescript
interface ValidationOverride {
  rule: string;
  reason: string;
  approvedBy: string; // instructor_id
  timestamp: Date;
}

// Example:
{
  learning_objective: "Understand quantum mechanics fundamentals",
  validation_override: {
    rule: "nonMeasurableVerbs",
    reason: "Introductory conceptual course, 'understand' appropriate here",
    approvedBy: "instructor_uuid"
  }
}
```

### 3. LLM-Based Semantic Validation (P5)

```typescript
// Для borderline cases, где regex недостаточно
async function semanticValidation(objective: string): Promise<ValidationResult> {
  const prompt = `
    Is this learning objective measurable and pedagogically sound?
    Objective: "${objective}"

    Criteria:
    1. Uses observable action verb
    2. Specific and concrete
    3. Can be assessed

    Respond: YES/NO + reasoning
  `;

  const response = await llm.generate(model, prompt);
  // Parse response, use as tiebreaker for WARNING cases
}
```

---

## Multilingual Coverage Summary

### Language Support Matrix

| Language | Code | Snowball Stemmer | Fallback Strategy | Bloom's Whitelist | Notes |
|----------|------|------------------|-------------------|-------------------|-------|
| English | en | ✅ Yes | N/A | ✅ Full (87 verbs) | Primary language |
| Russian | ru | ✅ Yes | N/A | ✅ Full (78 verbs) | Primary language |
| Spanish | es | ✅ Yes | N/A | 🟡 Base (30-40 verbs) | Phase 2 |
| French | fr | ✅ Yes | N/A | 🟡 Base (30-40 verbs) | Phase 2 |
| German | de | ✅ Yes | N/A | 🟡 Base (30-40 verbs) | Phase 2 |
| Portuguese | pt | ✅ Yes | N/A | 🟡 Base (30-40 verbs) | Phase 2 |
| Italian | it | ✅ Yes | N/A | 🟡 Base (30-40 verbs) | Phase 2 |
| Turkish | tr | ✅ Yes | N/A | 🟡 Base (30-40 verbs) | Phase 2 |
| Arabic | ar | ✅ Yes | N/A | 🟡 Base (30-40 verbs) | Phase 2, RTL support |
| Hindi | hi | ✅ Yes | N/A | 🟡 Base (30-40 verbs) | Phase 2, Devanagari script |
| Chinese | zh | ❌ No | ✅ Normalization | 🟡 Base (30-40 verbs) | CJK, no stemming needed |
| Japanese | ja | ❌ No | ✅ Normalization | 🟡 Base (30-40 verbs) | CJK, morphology complex |
| Korean | ko | ❌ No | ✅ Normalization | 🟡 Base (30-40 verbs) | CJK, agglutinative |
| Thai | th | ❌ No | ✅ Normalization | 🟡 Base (30-40 verbs) | No word boundaries |
| Vietnamese | vi | ❌ No | ✅ Normalization | 🟡 Base (30-40 verbs) | Tonal language |
| Indonesian | id | ❌ No | ✅ Suffix removal | 🟡 Base (30-40 verbs) | Agglutinative |
| Malay | ms | ❌ No | ✅ Suffix removal | 🟡 Base (30-40 verbs) | Similar to Indonesian |
| Bengali | bn | ❌ No | ✅ Normalization | 🟡 Base (30-40 verbs) | Bengali script |
| Polish | pl | ❌ No | ✅ Suffix removal | 🟡 Base (30-40 verbs) | Complex inflection |

**Legend**:
- ✅ Full: Complete Bloom's whitelist (80+ verbs across 6 levels)
- 🟡 Base: Basic whitelist (30-40 core verbs, extensible)
- ✅ Snowball: Supported by Snowball stemmer (high accuracy)
- ✅ Normalization: Simple normalization strategy (acceptable accuracy)

### Expansion Strategy

**Phase 2 Priorities** (Base whitelists for all 19 languages):
1. Research native Bloom's Taxonomy translations per language
2. Consult educational standards (e.g., CEFR for European languages)
3. Validate with native speakers / educators
4. Start with 30-40 most common verbs per level
5. Monitor false positive rates per language
6. Iteratively expand based on metrics

**Phase 3+ Priorities** (Full coverage):
1. Expand whitelists to 80+ verbs per language (matching EN/RU)
2. Add language-specific pedagogical frameworks (e.g., Vygotsky's ZPD for RU)
3. Implement CJK-specific tokenizers for better verb extraction
4. Add RTL language support for Arabic (already handled by stemmer)
5. Consider adding more languages (Hebrew, Greek, Swedish, Norwegian, etc.)

---

## References

**Research Documents**:
- ✅ RT-006 Research Report: `specs/008-generation-generation-json/research-decisions/rt-006-research-report-bloom-taxonomy.md`
- ✅ RT-006 Validation Framework: `specs/008-generation-generation-json/research-decisions/rt-006-bloom-taxonomy-validation.md`
- ✅ Discussion Document: `docs/blooms-taxonomy-validation-discussion.md`

**Implementation Files** (Target):
- `packages/shared-types/src/generation-result.ts` — ValidationSeverity enum
- `packages/course-gen-platform/src/server/services/generation/validators/blooms-validators.ts` — Fuzzy match
- `packages/course-gen-platform/src/server/services/generation/validators/placeholder-validator.ts` — Conservative detection
- `packages/course-gen-platform/src/server/services/generation/validators/duration-validator.ts` — Difficulty multiplier
- `packages/course-gen-platform/src/server/services/generation/validators/validation-orchestrator.ts` — Severity orchestration

**Test Files** (Target):
- `packages/course-gen-platform/src/server/services/generation/validators/__tests__/blooms-validators.test.ts`
- `packages/course-gen-platform/src/server/services/generation/validators/__tests__/placeholder-validator.test.ts`
- `packages/course-gen-platform/src/server/services/generation/validators/__tests__/duration-validator.test.ts`
- `packages/course-gen-platform/src/server/services/generation/__tests__/integration/validation-flow.test.ts`

---

## Execution Checklist

### Pre-Implementation

- [ ] Read RT-006 research report (full context)
- [ ] Read RT-006 validation framework (current implementation)
- [ ] Read discussion document (user concerns)
- [ ] Review current validator implementations
- [ ] Set up feature branch: `008-rt-007-bloom-validation-improvements`

### Phase 1 Implementation (2-3h)

- [ ] Update placeholder-validator.ts (conservative detection)
- [ ] Update duration-validator.ts (remove ENGAGEMENT_CAP ERROR)
- [ ] Add difficulty_level multiplier
- [ ] Write unit tests for Phase 1
- [ ] Run integration tests
- [ ] Measure false positive rate (should be -15-20%)

### Phase 2 Implementation (3-4h)

- [ ] Install dependencies: `porter-stemmer-ru`, `fast-levenshtein`
- [ ] Implement `isSimilarVerb()` with fuzzy match
- [ ] Update `validateBloomsTaxonomy()` to use fuzzy match
- [ ] Change Bloom's whitelist validation → WARNING
- [ ] Write unit tests for fuzzy match
- [ ] Test Russian verb forms: "объяснить" = "объяснять"

### Phase 3 Implementation (4-5h)

- [ ] Create `ValidationSeverity` enum in shared-types
- [ ] Update all validators with severity field
- [ ] Implement `orchestrateValidation()` with severity filtering
- [ ] Add logging for WARNING/INFO cases
- [ ] Write integration tests for severity flow
- [ ] Verify ERROR blocks, WARNING logs, INFO monitors

### Phase 4 Implementation (3-4h)

- [ ] Set up Prometheus metrics (counter, gauge, histogram)
- [ ] Implement false positive tracking
- [ ] Implement retry metrics
- [ ] Create Grafana dashboard
- [ ] Set up alerts for FP >30%
- [ ] Document metrics in README

### Post-Implementation

- [ ] Run full test suite: `pnpm test:validators`
- [ ] Run type-check: `pnpm type-check`
- [ ] Generate test coverage report (target: >90%)
- [ ] Review metrics after 1 week production
- [ ] Adjust thresholds based on metrics
- [ ] Update RT-007 with final results

---

## Success Criteria: Final Validation

**Before marking RT-007 as COMPLETE, verify:**

✅ **Quality Maintained**:
- [ ] Bloom's compliance ≥90%
- [ ] Non-measurable verbs still blocked (P0)
- [ ] TODO/FIXME still blocked (P0)
- [ ] Semantic similarity ≥0.75

✅ **Flexibility Achieved**:
- [ ] False positive rate -15-20%
- [ ] Russian verb forms work ("объяснить" = "объяснять")
- [ ] Legitimate brackets not blocked ("[array]" OK)
- [ ] Complex topics pass (30-45 min lessons OK)

✅ **Performance Acceptable**:
- [ ] Validation latency <100ms per lesson
- [ ] No memory leaks (stemmer caching works)
- [ ] No regression in existing tests

✅ **Monitoring Operational**:
- [ ] Metrics dashboard live
- [ ] Alerts configured for FP >30%
- [ ] Weekly metrics review scheduled

---

**Document Version**: 2.0 (Updated with universal multilingual support)
**Created**: 2025-11-10
**Updated**: 2025-11-10 (Added 19-language support)
**Status**: 📝 PLANNED - Ready for Future Implementation
**Estimated Effort**: 14-20 hours (split across 4 phases, +2-4h for multilingual)
**Priority**: P1 (High impact on UX, critical for global expansion)
**Recommended Executor**: `quality-validator-specialist` (Phases 1-2), Main orchestrator (Phases 3-4)

---

## PROMPT FOR FUTURE CLAUDE

**When you are ready to implement RT-007, follow these steps:**

### Pre-Implementation (30 min)
1. **Read this document completely** — all context is here, especially **Multilingual Coverage Summary**
2. **Review RT-006 implementation** — understand current state
3. **Check frontend language support** — verify all 19 languages still valid
4. **Research Snowball stemmer** — understand supported languages
5. **Create feature branch**: `008-rt-007-bloom-validation-improvements`

### Phase 1: Quick Fixes (2-3h)
1. Implement conservative bracket detection
2. Remove ENGAGEMENT_CAP as ERROR → INFO
3. Add difficulty_level multiplier
4. Test with existing EN+RU courses
5. Measure false positive rate reduction

### Phase 2: Multilingual Support (4-6h) ⭐ **KEY PHASE**
1. **Install dependencies**:
   - `snowball` или `snowball-js` (universal stemmer)
   - `fast-levenshtein` (typo tolerance)

2. **Implement universal stemming**:
   - `stemWord()` function with language detection
   - Snowball support for 10 languages
   - Fallback normalization for 9 CJK languages
   - Caching for performance

3. **Create multilingual whitelists**:
   - Start with EN (full 87 verbs) + RU (full 78 verbs)
   - Add BASE whitelists for 17 other languages (30-40 verbs each)
   - Use Google Translate + educational dictionaries for initial translations
   - **Validate with native speakers** (critical!)

4. **Implement plugin architecture**:
   - `registerLanguageWhitelist()` function
   - `getBloomsWhitelist()` with fallback to English
   - Warning logging for missing languages

5. **Test multilingual fuzzy match**:
   - Unit tests for all 19 languages
   - Verify stemming works (10 languages)
   - Verify normalization works (9 languages)
   - Validate false positive rate per language

### Phase 3: Severity Integration (4-5h)
1. Create `ValidationSeverity` enum
2. Update all validators with severity levels
3. Implement orchestration logic
4. Add logging/metrics

### Phase 4: Metrics Collection (3-4h)
1. Set up Prometheus metrics
2. Create Grafana dashboard
3. Configure alerts for FP >30%
4. Monitor per-language metrics

### Post-Implementation (1-2h)
1. Run full test suite across all 19 languages
2. Generate multilingual test report
3. Update RT-007 with final metrics
4. Document any language-specific quirks
5. Create TODO for expanding BASE → FULL whitelists

---

## Key Principles

✅ **Universal**: Works for 19+ languages, not just EN/RU
✅ **Extensible**: Plugin architecture for adding new languages
✅ **Flexible**: "Guardrails, not handcuffs" — quality without rigidity
✅ **Data-driven**: Metrics per language guide improvements
✅ **Pedagogically sound**: Bloom's Taxonomy universal across cultures

---

## Success Metrics (Must Achieve)

- ✅ All 19 languages supported (even if with BASE whitelists)
- ✅ False positive rate -15-20% across languages
- ✅ Bloom's compliance ≥90% for all languages
- ✅ No regressions in EN/RU (primary languages)
- ✅ Stemming works for 10 Snowball-supported languages
- ✅ Normalization works for 9 fallback languages
- ✅ Plugin architecture allows <1h to add new language
- ✅ Metrics dashboard shows per-language FP rates

Good luck with global expansion! 🌍🚀
