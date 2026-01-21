# План: Исправление проблем качества генерации уроков

## Контекст

Курс: **ZGB-9509** (Импортозамещение в закупках с нуля: новые правила 2025 года)

- Course ID: `bc34283a-0a61-45cb-8e5c-773a3b67a86c`
- Lesson ID: `8c3623c0-07e5-4e01-853d-ff3eab14a546` (Урок 1.1 - "Суть импортозамещения")
- Модель генерации: `xiaomi/mimo-v2-flash:free`
- Модель судьи: `moonshotai/kimi-k2-0905`
- Время генерации: 2026-01-20 15:58-16:02 (~3.5 мин)

### Реконструкция flow ошибки

```
1. Generator → контент OK (34,888 токенов, 129 сек)
2. Self-Reviewer → OK (4.5 сек)
3. Judge → score 0.88, decision: TARGETED_FIX, 3 minor issues
4. Patcher → LLM получил промпт с маркерами:
   - ## SECTION TITLE
   - ## ORIGINAL CONTENT
   - ## FIX INSTRUCTIONS
   - ## OUTPUT REQUIREMENTS
5. Patcher LLM → ГАЛЛЮЦИНАЦИЯ: вернул весь промпт вместо контента
6. Patcher validation → проверка длины (>=70%) ПРОШЛА (промпт длиннее контента)
7. Контент с маркерами СОХРАНЁН в БД ❌
```

---

## Обнаруженные проблемы

### 1. CRITICAL: Маркеры промпта в финальном контенте

**Симптом**: В тексте урока присутствуют технические маркеры:

- `## SECTION TITLE` (2 раза)
- `## ORIGINAL CONTENT` (2 раза)
- `## FIX INSTRUCTIONS` (2 раза)
- `## CONTEXT FOR COHERENCE` (2 раза)
- `## TARGET AREA` (2 раза)
- `## OUTPUT REQUIREMENTS` (2 раза)

**Корневая причина**: Patcher LLM галлюцинирует и возвращает структуру промпта вместо исправленного контента. Функция валидации `validateGeneratedContent()` существует в `generator-content.ts`, но **НЕ вызывается в patcher/index.ts**.

**Локация бага**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/index.ts:190-213`

### 2. HIGH: Китайские иероглифы в русском тексте (найдено ранее)

**Симптом**: Изолированные CJK символы встроены в русский текст:

- `不再` вместо "больше не"
- `制造` вместо "производство"
- `价值链` вместо "цепочка ценности"

**Корневая причина**: Возможно модель смешивает языки при генерации. Требуется language-specific валидация.

### 3. HIGH: Сломанные Mermaid диаграммы

**Симптом**: "Визуализация процесса пересадки" показывает пустое окно (см. скриншот).

**Корневая причина**: LLM генерирует невалидный Mermaid синтаксис с backticks:

```
СЛОМАНО:  D[\"`Совместная разработка<br>и пилотные партии`\"]
```

Sanitizer удаляет `\"`, но **backticks остаются**:

```
ПОСЛЕ САНИТИЗАЦИИ:  D[`Совместная разработка<br>и пилотные партии`]  ❌ backticks внутри []
```

Правильно:

```
НУЖНО:  D[Совместная разработка<br>и пилотные партии]  ✓
```

**Локация бага**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-sanitizer.ts`

- Отсутствует Fix для backticks внутри node labels `[...]`

### 4. MEDIUM: Дублирование секций

**Симптом**: Одинаковые секции появляются несколько раз с минорными вариациями.

**Корневая причина**: Ошибка в логике объединения секций или повторный вызов generator.

---

## Почему judges не поймали проблемы

### Архитектурный дефект: Два параллельных набора проверок

```
cascade-evaluator.ts                    heuristic-filter.ts (orphaned)
├─ runHeuristicFilters() (встроенная)   ├─ checkLanguageConsistency() ✓
│  ├─ checkWordCount ✓                  ├─ checkMermaidSyntax() ✓
│  ├─ checkFleschKincaid ✓              ├─ checkProhibitedTerms() ✓
│  ├─ checkSectionHeaders ✓             └─ НЕ ВЫЗЫВАЕТСЯ из cascade!
│  └─ НЕТ языка, mermaid, маркеров
└─ executeSingleJudge()
   └─ Судья сфокусирован на КАЧЕСТВЕ контента,
      не на технических артефактах
```

### Gap Analysis

| Gap                   | Проверка существует? | Где?                           | Почему не работает?      |
| --------------------- | -------------------- | ------------------------------ | ------------------------ |
| **Маркеры промпта**   | ❌ НЕТ               | Нигде                          | Не реализовано           |
| **CJK иероглифы**     | ✓ Есть               | `heuristic-filter.ts:759-846`  | Не вызывается из cascade |
| **Mermaid синтаксис** | ✓ Есть               | `heuristic-filter.ts:971-1078` | Не вызывается из cascade |
| **Дубликаты секций**  | ❌ НЕТ               | Нигде                          | Не реализовано           |

### Ключевые файлы с проблемой

| Файл                                        | Строки    | Проблема                                             |
| ------------------------------------------- | --------- | ---------------------------------------------------- |
| `judge/cascade-evaluator.ts`                | 530-675   | Использует встроенную версию `runHeuristicFilters()` |
| `judge/heuristic-filter.ts`                 | 1240-1383 | Orphaned - новые проверки не подключены              |
| `self-reviewer/self-reviewer-heuristics.ts` | 39-120    | Отдельная логика языка, не интегрирована             |

---

## План исправления

### Фаза 1: Исправление Patcher (Critical)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/index.ts`

**Изменения**:

1. Импортировать `validateGeneratedContent` из `../nodes/generator/generator-content`:

```typescript
import { validateGeneratedContent } from '../../nodes/generator/generator-content';
```

2. Добавить валидацию после строки 190 (`const patchedContent = response.content.trim();`):

```typescript
// Validate that response doesn't contain prompt markers
const validation = validateGeneratedContent(patchedContent);
if (!validation.isValid) {
  logger.error(
    {
      sectionId: input.sectionId,
      detectedMarkers: validation.detectedMarkers,
    },
    'Patcher: REJECTED - response contains prompt template markers'
  );

  return {
    patchedContent: input.originalContent,
    success: false,
    diffSummary: 'Patch rejected: LLM returned prompt structure',
    tokensUsed,
    durationMs: Date.now() - startTime,
    errorMessage: `LLM hallucinated prompt markers: ${validation.detectedMarkers.join(', ')}`,
  };
}
```

### Фаза 2: Исправление Mermaid sanitizer (High)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-sanitizer.ts`

**Изменения**: Добавить Fix 4 - удаление backticks внутри node labels:

```typescript
// -------------------------------------------------------------------------
// Fix 4: Remove backticks inside node labels [...]
// LLM sometimes generates: D[\"`text`\"] which becomes D[`text`] after Fix 1
// Backticks inside square brackets are invalid Mermaid syntax
// -------------------------------------------------------------------------
let backticksFixed = 0;
sanitized = sanitized.replace(/\[`([^`\]]*)`\]/g, (match, content) => {
  backticksFixed++;
  return `[${content}]`;
});

if (backticksFixed > 0) {
  fixes.push({
    type: 'BACKTICK_REMOVED',
    count: backticksFixed,
    blockIndex,
  });
  modified = true;
}
```

### Фаза 3: Добавить валидацию языка (High)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-content.ts`

**Изменения**:

1. Добавить функцию `validateLanguageConsistency`:

```typescript
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]/;

export function validateLanguageConsistency(
  content: string,
  expectedLang: string
): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Для русского контента не должно быть CJK символов
  if (expectedLang === 'ru' && CJK_PATTERN.test(content)) {
    const matches = content.match(CJK_PATTERN);
    issues.push(`CJK characters found in Russian content: ${matches?.slice(0, 5).join(', ')}`);
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}
```

2. Вызывать эту функцию в generator и patcher.

### Фаза 4: Интеграция heuristic-filter в cascade (CRITICAL)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts`

**Проблема**: cascade-evaluator использует встроенную версию `runHeuristicFilters()`, игнорируя новые проверки из `heuristic-filter.ts`.

**Изменения**:

1. Импортировать проверки из heuristic-filter.ts:

```typescript
import {
  checkLanguageConsistency,
  checkMermaidSyntax,
  checkPromptMarkers, // новая функция
} from './heuristic-filter';
```

2. Добавить вызовы в `runHeuristicFilters()` (строки 530-675):

```typescript
// После существующих проверок добавить:
const languageResult = checkLanguageConsistency(content, language);
const mermaidResult = checkMermaidSyntax(content);
const markersResult = checkPromptMarkers(content);

if (!languageResult.passed) {
  issues.push({
    type: 'LANGUAGE',
    severity: 'CRITICAL',
    description: `Foreign characters detected: ${languageResult.foreignSamples.join(', ')}`,
  });
}

if (!mermaidResult.passed) {
  issues.push({
    type: 'MERMAID',
    severity: 'HIGH',
    description: `Mermaid syntax issues: ${mermaidResult.mermaidIssues.join(', ')}`,
  });
}

if (!markersResult.passed) {
  issues.push({
    type: 'PROMPT_MARKER',
    severity: 'CRITICAL',
    description: `Prompt markers found: ${markersResult.detectedMarkers.join(', ')}`,
  });
}
```

### Фаза 5: Добавить checkPromptMarkers в heuristic-filter (CRITICAL)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts`

**Изменения**: Добавить новую функцию:

```typescript
const PROMPT_MARKERS = [
  '## SECTION TITLE',
  '## ORIGINAL CONTENT',
  '## FIX INSTRUCTIONS',
  '## CONTEXT FOR COHERENCE',
  '## TARGET AREA',
  '## OUTPUT REQUIREMENTS',
  'COMPLETE CORRECTED SECTION:',
  '## INLINE FIX INSTRUCTIONS',
];

export function checkPromptMarkers(content: string): FilterCheckResult & {
  detectedMarkers: string[];
} {
  const detected: string[] = [];

  for (const marker of PROMPT_MARKERS) {
    if (content.includes(marker)) {
      detected.push(marker);
    }
  }

  return {
    passed: detected.length === 0,
    detectedMarkers: detected,
  };
}
```

### Фаза 6: Добавить детекцию дубликатов (Medium)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/`

**Изменения**:

1. Добавить проверку на повторяющиеся заголовки секций
2. Флаг `HYGIENE` issue при обнаружении дубликатов

---

## Критические файлы

| Файл                                       | Действие                    | Фаза |
| ------------------------------------------ | --------------------------- | ---- |
| `judge/patcher/index.ts`                   | Добавить валидацию маркеров | 1    |
| `utils/mermaid-sanitizer.ts`               | Fix backticks в node labels | 2    |
| `nodes/generator/generator-content.ts`     | Валидация языка CJK         | 3    |
| `judge/cascade-evaluator.ts`               | Интеграция heuristic-filter | 4    |
| `judge/heuristic-filter.ts`                | Добавить checkPromptMarkers | 5    |
| `nodes/self-reviewer/self-reviewer-llm.ts` | Детекция дубликатов         | 6    |
| `scripts/test-lesson-generation.ts`        | A/B тестовый скрипт (новый) | 7    |

---

## Верификация

1. **Unit тесты**:

   ```bash
   pnpm --filter course-gen-platform test -- patcher
   ```

2. **Type-check**:

   ```bash
   pnpm type-check
   ```

3. **Ручная проверка**:
   - Перегенерировать урок 1.1 курса ZGB-9509
   - Проверить отсутствие маркеров в контенте
   - Проверить отсутствие CJK символов

4. **SQL проверка**:
   ```sql
   SELECT id, content::text
   FROM lesson_contents
   WHERE lesson_id = '8c3623c0-07e5-4e01-853d-ff3eab14a546'
   AND content::text NOT LIKE '%SECTION TITLE%';
   ```

---

## Оценка рисков

- **Фаза 1**: Низкий риск - добавляем валидацию, fallback на оригинальный контент
- **Фаза 2**: Низкий риск - дополнительная валидация без изменения логики
- **Фаза 3**: Средний риск - требует тестирования edge cases

---

## Фаза 7: Локальный тестовый скрипт с A/B тестированием моделей

**Цель**: Создать скрипт для локальной генерации урока с 3 моделями для сравнения качества.

**Файл**: `packages/course-gen-platform/scripts/test-lesson-generation.ts`

### Модели для тестирования

| #   | Модель                          | Тип            | Примечание           |
| --- | ------------------------------- | -------------- | -------------------- |
| 1   | `xiaomi/mimo-v2-flash:free`     | Текущая        | Baseline, бесплатная |
| 2   | `z-ai/glm-4.7-flash`            | Альтернатива 1 | Китайская, быстрая   |
| 3   | `allenai/olmo-3.1-32b-instruct` | Альтернатива 2 | Open-source, 32B     |

### Функциональность скрипта

```typescript
interface TestConfig {
  courseId: string; // bc34283a-0a61-45cb-8e5c-773a3b67a86c
  lessonId: string; // 8c3623c0-07e5-4e01-853d-ff3eab14a546
  models: string[]; // ['xiaomi/mimo-v2-flash:free', 'z-ai/glm-4.7-flash', 'allenai/olmo-3.1-32b-instruct']
  outputDir: string; // .tmp/test-generation/
}

interface TestResult {
  model: string;
  duration: number;
  tokensUsed: number;
  qualityScore: number;
  issues: {
    promptMarkers: number;
    cjkCharacters: number;
    mermaidErrors: number;
    duplicateSections: number;
  };
  content: string;
}

// Pipeline для каждой модели:
// 1. Загрузить lesson spec из БД
// 2. Запустить stage6 generator с modelOverride
// 3. Запустить self-reviewer
// 4. Запустить judges + patcher
// 5. Запустить новые проверки (маркеры, CJK, mermaid)
// 6. Сохранить результат в .tmp/{model}/
// 7. Создать сравнительный отчёт
```

### Команды запуска

```bash
# Тест со всеми 3 моделями
pnpm --filter course-gen-platform tsx scripts/test-lesson-generation.ts \
  --course-id bc34283a-0a61-45cb-8e5c-773a3b67a86c \
  --lesson-id 8c3623c0-07e5-4e01-853d-ff3eab14a546 \
  --models "xiaomi/mimo-v2-flash:free,z-ai/glm-4.7-flash,allenai/olmo-3.1-32b-instruct"

# Тест с одной моделью
pnpm --filter course-gen-platform tsx scripts/test-lesson-generation.ts \
  --course-id bc34283a-0a61-45cb-8e5c-773a3b67a86c \
  --lesson-id 8c3623c0-07e5-4e01-853d-ff3eab14a546 \
  --models "xiaomi/mimo-v2-flash:free"
```

### Формат сравнительного отчёта

Скрипт создаст `.tmp/test-generation/comparison-report.md`:

```markdown
# Model Comparison Report

Lesson: 1.1 - Суть импортозамещения
Date: 2026-01-21

| Metric         | xiaomi/mimo-v2-flash | z-ai/glm-4.7-flash | allenai/olmo-3.1-32b |
| -------------- | -------------------- | ------------------ | -------------------- |
| Duration       | 129s                 | ?                  | ?                    |
| Tokens         | 34,888               | ?                  | ?                    |
| Quality Score  | 0.88                 | ?                  | ?                    |
| Prompt Markers | 2 ❌                 | ?                  | ?                    |
| CJK Characters | 11 ❌                | ?                  | ?                    |
| Mermaid Errors | 1 ❌                 | ?                  | ?                    |
| Duplicates     | ?                    | ?                  | ?                    |

## Winner: [model with highest score and 0 critical issues]
```

---

## Фаза 8: Комплексная валидация контента

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/validation/content-validator.ts`

**Проверки**:

1. `validatePromptMarkers()` - маркеры промпта в тексте
2. `validateLanguageConsistency()` - CJK символы в русском тексте
3. `validateSectionDuplication()` - повторяющиеся секции
4. `validateMarkdownStructure()` - корректность markdown
5. `validateContentLength()` - адекватная длина секций

**Интеграция**: Вызывать в generator, patcher, и финальной сборке контента.

---

## Следующие шаги после одобрения

1. Создать beads issue: `bd create --title="Fix lesson generation quality issues" --type=bug --priority=1`
2. **Фаза 1**: Patcher - добавить валидацию маркеров
3. **Фаза 2**: Mermaid sanitizer - фикс backticks
4. **Фаза 3**: Language validation - CJK детекция
5. **Фаза 4**: Интеграция heuristic-filter в cascade-evaluator
6. **Фаза 5**: Добавить checkPromptMarkers в heuristic-filter
7. **Фаза 6**: Self-reviewer - детекция дубликатов
8. **Фаза 7**: Локальный тестовый скрипт с A/B тестированием
9. **Фаза 8**: Комплексный content-validator
10. Unit тесты для всех новых функций
11. **A/B тест**: Запустить генерацию урока 1.1 с 3 моделями:
    - `xiaomi/mimo-v2-flash:free` (baseline)
    - `z-ai/glm-4.7-flash`
    - `allenai/olmo-3.1-32b-instruct`
12. Сравнить результаты, выбрать лучшую модель
13. Коммит и PR
