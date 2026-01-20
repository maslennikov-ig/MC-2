# Plan: Language & Grammar Validator для Stage 6

## Проблема

Несмотря на проверки, иногда генерируется:

- Текст на неправильном языке (китайские символы в русском)
- Грамматические ошибки (склонения, падежи, согласование)

**Ключевой вопрос**: можно ли править конкретные слова, а не весь текст?

**Ответ: ДА** - у нас уже есть `InlineFixer` для точечных замен (0 токенов)!

## Текущая архитектура

```
GeneratorNode → SelfReviewer → HeuristicFilter → CascadeEvaluator → TargetedRefinement
```

**Что уже есть:**

1. `InlineFixer` (`judge/inline-fixer/index.ts`) - применяет замены через `quotedText` → `inlineReplacement` без LLM (0 токенов)
2. `checkLanguageConsistency()` в heuristic-filter - детектирует чужие Unicode скрипты
3. Self-Reviewer - валидирует качество, но НЕ генерирует точные замены для грамматики

**Чего НЕ хватает:**

- LLM-проверка грамматики с точными `quotedText` + `inlineReplacement`
- Правила для языко-специфических ошибок (русские падежи, согласование)

## Решение

### Подход: Новая Phase 2.5 в Self-Reviewer

Добавить **отдельную фазу** в промпт Self-Reviewer'а:

```
Phase 1: Critical Failures      → REGENERATE
Phase 2: Structure & Hygiene    → FIXED (chatbot artifacts, script pollution, markdown)
Phase 2.5: Language & Grammar   → FIXED (грамматика, неправильные символы) ← НОВОЕ
Phase 3: Semantic Verification  → FLAG_TO_JUDGE
Phase 4: Acceptance             → PASS
```

**Почему отдельная фаза:**

1. Чёткое разделение ответственности
2. Не конфликтует с Phase 2 (structure) - Phase 2.5 работает с языком/грамматикой
3. Не дублирует Phase 1 (Language Failure) - Phase 1 проверяет ВЕСЬ контент на неправильном языке, Phase 2.5 исправляет ОТДЕЛЬНЫЕ слова

**Поток данных:**

1. Phase 2.5 находит ошибки с `quotedText` + `inlineReplacement`
2. InlineFixer применяет исправления (0 токенов)
3. Исправленный контент идёт в Phase 3 и далее к Judge

### Изменения

#### 1. Добавить Phase 2.5 в промпт Self-Reviewer

**Файл:** `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/self-reviewer-prompt.ts`

Добавить после Phase 2 (Structure & Hygiene), перед Phase 3:

```
## Phase 2.5: Language & Grammar Fixes (Status: FIXED)

Check for language-specific grammar errors that can be fixed with EXACT text replacement.

### Russian (ru) Checks:
1. **Case endings** (падежи):
   - After "о/об" → prepositional: "о принципе" not "о принцип"
   - After numbers 2-4 → genitive singular: "два студента" not "два студент"

2. **Gender agreement** (род):
   - Adjective matches noun: "большая таблица" not "большой таблица"

3. **Number agreement** (число):
   - Verb matches subject: "данные показывают" not "данные показывает"

### Wrong Script Detection:
- Find isolated characters from wrong writing system (Chinese in Russian, etc.)
- NOT in: code blocks, technical terms, proper nouns

### Output Format for Grammar Issues:
{
  "type": "GRAMMAR",
  "severity": "FIXABLE",
  "location": "sec_<id>",
  "description": "Brief error description",
  "quotedText": "exact wrong text (3-50 chars)",
  "inlineReplacement": "corrected text"
}

### Rules:
- Only flag if 100% certain of the error
- quotedText must be EXACT match from content
- Fix ONLY the grammar, don't rephrase
- Skip content inside code blocks, mermaid, LaTeX
```

#### 2. Обновить JSON output schema

Добавить в `issues` массив поддержку `quotedText` и `inlineReplacement`:

```typescript
{
  "type": "GRAMMAR",
  "severity": "FIXABLE",
  "location": "sec_introduction",
  "description": "Incorrect case after 'о'",
  "quotedText": "о принцип работы",
  "inlineReplacement": "о принципе работы"
}
```

#### 3. Обработка в self-reviewer-node.ts

**Файл:** `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer-node.ts`

После парсинга LLM ответа, извлечь grammar issues и применить через InlineFixer:

```typescript
// Extract grammar issues with quotedText + inlineReplacement
const grammarIssues = result.issues.filter(
  i => i.type === 'GRAMMAR' && i.quotedText && i.inlineReplacement
);

if (grammarIssues.length > 0) {
  const fixResult = processInlineFixes(content, grammarIssues.map(toTargetedIssue));
  if (fixResult.appliedFixes.length > 0) {
    content = fixResult.content;
    result.status = 'FIXED';
  }
}
```

#### 4. Добавить языко-специфические правила

**Новый файл:** `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/grammar-rules.ts`

```typescript
export const GRAMMAR_RULES: Record<string, string> = {
  ru: `
1. **Падежи после предлогов**:
   - "о/об" + предложный: "о проекте" ✓, "о проект" ✗
   - "для" + родительный: "для студента" ✓, "для студент" ✗

2. **Согласование в роде**:
   - "большая система" ✓, "большой система" ✗

3. **Согласование в числе**:
   - "данные показывают" ✓, "данные показывает" ✗
`,
  en: `
1. Subject-verb agreement
2. Article usage (a/an/the)
3. Preposition errors
`,
  // Добавить другие языки по мере необходимости
};
```

## Стоимость токенов

| Сценарий               | InlineFixer | Patcher fallback | Итого            |
| ---------------------- | ----------- | ---------------- | ---------------- |
| 5 ошибок, все найдены  | 0           | 0                | **0 токенов**    |
| 5 ошибок, 2 не найдены | 0           | ~1600            | **1600 токенов** |

**Ожидаемое распределение:**

- ~95% исправлений через InlineFixer (0 токенов)
- ~5% fallback на Patcher (~800 токенов/ошибка)

**Дополнительная стоимость промпта:** ~200-300 токенов (правила грамматики в system prompt)

## Файлы для изменения

| Файл                                          | Изменение                                    |
| --------------------------------------------- | -------------------------------------------- |
| `judge/self-reviewer/self-reviewer-prompt.ts` | Добавить Phase 2.5 Grammar                   |
| `judge/self-reviewer/grammar-rules.ts`        | Новый: языковые правила                      |
| `nodes/self-reviewer-node.ts`                 | Обработка grammar issues                     |
| `shared-types/src/judge-types.ts`             | Добавить GRAMMAR в SelfReviewIssueTypeSchema |

## Верификация

1. **Unit тесты:**
   - Тест grammar rules для русского языка
   - Тест InlineFixer с grammar issues

2. **E2E тест:**
   - Сгенерировать урок на русском
   - Искусственно добавить грамматические ошибки
   - Проверить что Self-Reviewer находит и исправляет

3. **Ручная проверка:**
   - Запустить генерацию курса на русском
   - Проверить логи на grammar fixes
   - Проверить финальный контент

## Альтернативы (отклонены)

1. **Отдельный LLM вызов** - дороже (+500-800 токенов)
2. **Внешний grammar checker API** - латентность, зависимость
3. **Регулярки для грамматики** - слишком сложно для русского

## Риски

1. **False positives** - модель может "исправить" правильный текст
   - Митигация: строгие правила в промпте, только 100% уверенные ошибки

2. **Performance** - дополнительные токены в промпте
   - Митигация: ~200-300 токенов, минимальное влияние
