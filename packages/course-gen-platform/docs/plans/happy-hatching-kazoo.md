# ТЗ: Комплексные тесты качества Stage 6

**Дата:** 2026-01-21
**Статус:** На согласовании
**Модели:** deepseek/deepseek-v3.2, xiaomi/mimo-v2-flash:free

---

## 1. Цель

Создать скрипт `test-stage6-quality-mechanisms.ts` (~600-800 строк) для комплексной проверки всех механизмов качества Stage 6:

- Heuristic фильтры (12 проверок)
- Repair механизмы (JSON, Mermaid)
- Inline Fixer и Patcher
- Judge система (Cascade Evaluator)
- CJK обработка и recovery
- Prompt marker detection

---

## 2. Архитектура скрипта

```
scripts/test-stage6-quality-mechanisms.ts
├── Configuration & CLI Args
├── Test Fixtures (синтетические данные с дефектами)
├── Test Suites (6 наборов)
│   ├── Suite 1: Heuristic Filters
│   ├── Suite 2: Repair Mechanisms
│   ├── Suite 3: Inline Fixer
│   ├── Suite 4: Judge System (с LLM)
│   ├── Suite 5: CJK Detection & Recovery
│   └── Suite 6: Prompt Marker Detection
├── Model Comparison (DeepSeek vs Xiaomi)
├── Report Generator
└── Main Entry Point
```

---

## 3. Test Suites

### Suite 1: Heuristic Filters (12 проверок)

| #    | Тест                                   | Fixture                      | Expected                                   |
| ---- | -------------------------------------- | ---------------------------- | ------------------------------------------ |
| 1.1  | checkWordCount: short                  | < 500 слов                   | `passed=false, severity=critical`          |
| 1.2  | checkWordCount: normal                 | 800 слов                     | `passed=true`                              |
| 1.3  | checkPromptMarkers: detected           | `## SECTION TITLE` в тексте  | `passed=false, detectedMarkers.length > 0` |
| 1.4  | checkPromptMarkers: clean              | Чистый текст                 | `passed=true`                              |
| 1.5  | checkLanguageConsistency: CJK in prose | `稀缺性资源` в русском       | `passed=false, scriptsFound=['CJK']`       |
| 1.6  | checkLanguageConsistency: CJK in code  | CJK внутри ```               | `passed=true` (исключён)                   |
| 1.7  | checkMermaidSyntax: escaped quotes     | `A[\"Label\"]`               | `mermaidIssues.length > 0`                 |
| 1.8  | checkMermaidSyntax: unclosed bracket   | `A[Label --> B`              | `mermaidIssues.length > 0`                 |
| 1.9  | checkMermaidSyntax: clean              | Валидный flowchart           | `passed=true`                              |
| 1.10 | checkSectionDuplication: duplicates    | Два раздела > 80% similarity | `duplicatePairs.length > 0`                |
| 1.11 | checkSectionDuplication: unique        | Уникальные заголовки         | `passed=true`                              |
| 1.12 | runHeuristicFilters: aggregate         | Смешанный контент            | Корректный `score` 0-1                     |

### Suite 2: Repair Mechanisms

| #   | Тест                    | Input                                | Expected                       |
| --- | ----------------------- | ------------------------------------ | ------------------------------ |
| 2.1 | JSON: thinking tags     | `<think>...</think>{"key": "value"}` | Парсится в `{key: "value"}`    |
| 2.2 | JSON: missing brace     | `{"key": "value"`                    | Автозакрытие `}`               |
| 2.3 | JSON: trailing comma    | `{"key": "value",}`                  | Удаление `,`                   |
| 2.4 | JSON: markdown wrapped  | ` ```json\n{...}\n``` `              | Извлечение JSON                |
| 2.5 | Mermaid: escaped quotes | `A[\"Text\"]`                        | Stage: REGEX_SANITIZE          |
| 2.6 | Mermaid: invalid arrow  | `A -> B`                             | Stage: REGEX_SANITIZE → `-->`  |
| 2.7 | Mermaid: complex error  | Сложная ошибка синтаксиса            | Stage: LLM_FIX                 |
| 2.8 | Mermaid: unfixable      | Полностью битая диаграмма            | Stage: FALLBACK (HTML comment) |

### Suite 3: Inline Fixer

| #   | Тест                  | Issue Type                         | Expected                    |
| --- | --------------------- | ---------------------------------- | --------------------------- |
| 3.1 | Eligible fix          | `clarity_readability` + quotedText | `success=true`, zero tokens |
| 3.2 | Blacklisted criterion | `pedagogical_structure`            | Skipped → LLM Patcher       |
| 3.3 | Multiple occurrences  | Текст встречается 3 раза           | Skipped (ambiguous)         |
| 3.4 | Text not found        | quotedText отсутствует             | Skipped                     |
| 3.5 | Markdown breaking     | Fix ломает `**` баланс             | Rollback                    |

### Suite 4: Judge System (с LLM)

| #   | Тест                      | Scenario         | Expected Stage                |
| --- | ------------------------- | ---------------- | ----------------------------- |
| 4.1 | Cascade: heuristic fail   | CJK в контенте   | `stage=heuristic`, REGENERATE |
| 4.2 | Cascade: single judge     | Чистый контент   | `stage=single_judge`          |
| 4.3 | Decision: score >= 0.90   | Высокое качество | ACCEPT                        |
| 4.4 | Decision: score 0.75-0.90 | Среднее качество | TARGETED_FIX                  |
| 4.5 | Decision: score < 0.60    | Низкое качество  | REGENERATE                    |

### Suite 5: CJK Detection & Recovery

| #   | Тест                | Scenario          | Expected                |
| --- | ------------------- | ----------------- | ----------------------- |
| 5.1 | No CJK              | Чистый русский    | `passed=true`           |
| 5.2 | CJK < 50% sections  | 1 из 3 секций     | COMPLEX (partial regen) |
| 5.3 | CJK >= 50% sections | 2 из 3 секций     | CRITICAL (full regen)   |
| 5.4 | CJK in code only    | `print("稀缺性")` | `passed=true`           |
| 5.5 | Retry >= 2 with CJK | После 2 попыток   | Model fallback trigger  |

### Suite 6: Prompt Marker Detection

| #   | Marker                        | Example             | Expected      |
| --- | ----------------------------- | ------------------- | ------------- |
| 6.1 | `## SECTION TITLE`            | Patcher prompt leak | CRITICAL fail |
| 6.2 | `## ORIGINAL CONTENT`         | Patcher prompt leak | CRITICAL fail |
| 6.3 | `## FIX INSTRUCTIONS`         | Patcher prompt leak | CRITICAL fail |
| 6.4 | `COMPLETE CORRECTED SECTION:` | Patcher prompt leak | CRITICAL fail |
| 6.5 | Clean content                 | Нет маркеров        | `passed=true` |

---

## 4. Test Fixtures

````typescript
const FIXTURES = {
  // Prompt markers
  promptMarkers: {
    withMarkers: `# Урок\n\n## SECTION TITLE\n\n## ORIGINAL CONTENT\n\nТекст урока.`,
    clean: `# Урок\n\n## Введение\n\nЭто чистый текст без артефактов.`,
  },

  // CJK detection
  languageConsistency: {
    russianWithCJK: `## Введение\n\nЭто урок по 稀缺性资源分配问题分析 экономике.`,
    cleanRussian: `## Введение\n\nЭто чистый русский текст без посторонних символов.`,
    cjkInCodeBlock: `## Введение\n\n\`\`\`python\nprint("稀缺性")\n\`\`\`\n\nЧистый текст.`,
  },

  // Mermaid syntax
  mermaidSyntax: {
    escapedQuotes: '```mermaid\nflowchart TD\n  A[\\"Start\\"] --> B[\\"End\\"]\n```',
    unclosedBracket: '```mermaid\nflowchart TD\n  A[Start --> B[End]\n```',
    invalidArrow: '```mermaid\nflowchart TD\n  A -> B\n```',
    clean: '```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```',
  },

  // JSON repair
  jsonRepair: {
    withThinkingTags: '<think>Let me analyze...</think>{"sections": []}',
    missingBrace: '{"sections": [{"title": "Test"}',
    trailingComma: '{"key": "value",}',
    markdownWrapped: '```json\n{"key": "value"}\n```',
  },

  // Section duplication
  sectionDuplication: {
    duplicates: `## Основные принципы\n\nContent 1.\n\n## Основные принципы работы\n\nContent 2.`,
    unique: `## Введение\n\nContent 1.\n\n## Основные принципы\n\nContent 2.`,
  },

  // Word count
  wordCount: {
    tooShort: `# Урок\n\nЭто слишком короткий текст.`,
    normal: generateContent(800), // Helper function
  },
};
````

---

## 5. Model Comparison (DeepSeek vs Xiaomi)

### Тесты с реальной генерацией LLM:

| #   | Тест                       | Метрики                      |
| --- | -------------------------- | ---------------------------- |
| M1  | Генерация Introduction     | tokens, duration, validation |
| M2  | Генерация секции с Mermaid | mermaid_issues, tokens       |
| M3  | Self-correction при CJK    | retry_count, model_used      |
| M4  | JSON output parsing        | repair_strategy, success     |

### Сравнительная таблица в отчёте:

```
| Метрика | DeepSeek | Xiaomi | Winner |
|---------|----------|--------|--------|
| Prompt Markers | 0 | 0 | Tie |
| CJK Characters | 0 | 2 | DeepSeek |
| Mermaid Issues | 0 | 1 | DeepSeek |
| Tokens/Section | 1200 | 950 | Xiaomi |
| Duration (s) | 15.3 | 8.2 | Xiaomi |
```

---

## 6. Формат отчёта

```
═══════════════════════════════════════════════════════════════════════════
  STAGE 6 QUALITY MECHANISMS TEST REPORT
  Generated: 2026-01-21T12:00:00Z
  Models: deepseek/deepseek-v3.2, xiaomi/mimo-v2-flash:free
═══════════════════════════════════════════════════════════════════════════

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  SUITE 1: HEURISTIC FILTERS (12 tests)
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

✅ 1.1 checkWordCount: Detects short content
   Score: 0.42, Severity: critical, Duration: 3ms

✅ 1.2 checkPromptMarkers: Detects LLM hallucination
   Detected: ["## SECTION TITLE", "## ORIGINAL CONTENT"]
   Score: 0.00 (immediate fail), Duration: 1ms

✅ 1.3 checkLanguageConsistency: Detects CJK in Russian
   Foreign chars: 24, Scripts: [CJK], Duration: 2ms

✅ 1.4 checkLanguageConsistency: Ignores CJK in code
   Foreign chars: 0 (excluded), Duration: 2ms

... (все тесты)

───────────────────────────────────────────────────────────────────────────
  SUITE 1 SUMMARY: 12/12 passed (100%)
───────────────────────────────────────────────────────────────────────────

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  SUITE 2: REPAIR MECHANISMS (8 tests)
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

✅ 2.1 JSON: Strips thinking tags
   Strategy: jsonrepair_fsm, Duration: 5ms

✅ 2.5 Mermaid: Fixes escaped quotes via regex
   Stage: REGEX_SANITIZE, Fixed: 1/1, Duration: 15ms

... (все тесты)

═══════════════════════════════════════════════════════════════════════════
  MODEL COMPARISON (LLM tests)
═══════════════════════════════════════════════════════════════════════════

| Metric | DeepSeek | Xiaomi | Winner |
|--------|----------|--------|--------|
| Prompt Markers | 0 | 0 | Tie |
| CJK Characters | 0 | 0 | Tie |
| Mermaid Issues | 0 | 0 | Tie |
| Avg Tokens | 1150 | 980 | Xiaomi |
| Avg Duration | 12.5s | 6.8s | Xiaomi |

═══════════════════════════════════════════════════════════════════════════
  FINAL SUMMARY
═══════════════════════════════════════════════════════════════════════════

Total Tests: 45
Passed: 44 (97.8%)
Failed: 1 (2.2%)
Skipped: 0

Total Duration: 85230ms
Total Tokens: 4500

Output: .tmp/test-quality-mechanisms/report.md
```

---

## 7. CLI Interface

```bash
# Запуск всех тестов
pnpm tsx scripts/test-stage6-quality-mechanisms.ts

# Только локальные тесты (без LLM)
pnpm tsx scripts/test-stage6-quality-mechanisms.ts --skip-llm

# Только конкретный suite
pnpm tsx scripts/test-stage6-quality-mechanisms.ts --suite heuristic

# Verbose mode
pnpm tsx scripts/test-stage6-quality-mechanisms.ts --verbose

# Custom models
pnpm tsx scripts/test-stage6-quality-mechanisms.ts --models "deepseek/deepseek-v3.2,xiaomi/mimo-v2-flash:free"
```

---

## 8. Критические файлы

| Файл                                                             | Назначение                |
| ---------------------------------------------------------------- | ------------------------- |
| `src/stages/stage6-lesson-content/judge/heuristic-filter.ts`     | 12 heuristic проверок     |
| `src/stages/stage6-lesson-content/judge/cascade-evaluator.ts`    | 3-stage cascade           |
| `src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.ts` | 5-stage Mermaid repair    |
| `src/shared/utils/json-repair.ts`                                | 4-level JSON repair       |
| `src/stages/stage6-lesson-content/judge/inline-fixer/index.ts`   | Zero-token surgical fixes |
| `scripts/e2e-production-grade-checks.ts`                         | Паттерн для тестов        |

---

## 9. Verification Plan

После реализации:

1. **Unit тесты (локальные):**

   ```bash
   pnpm tsx scripts/test-stage6-quality-mechanisms.ts --skip-llm
   # Expected: 35/35 passed (Suite 1-3, 5-6 без LLM части)
   ```

2. **Integration тесты (с LLM):**

   ```bash
   pnpm tsx scripts/test-stage6-quality-mechanisms.ts
   # Expected: 45/45 passed
   ```

3. **Model comparison:**

   ```bash
   pnpm tsx scripts/test-stage6-quality-mechanisms.ts --verbose
   # Check: DeepSeek vs Xiaomi metrics table
   ```

4. **Report generation:**
   ```bash
   cat .tmp/test-quality-mechanisms/report.md
   # Verify: All sections present, formatting correct
   ```

---

## 10. Scope Exclusions

**Не входит в scope:**

- Тесты CLEV Voting (требуют 3 LLM вызова, дорого)
- Batch/курсовое тестирование
- Multi-language тесты (только русский)
- Performance benchmarks (CPU, memory)
- Regression testing с baseline

---

## 11. Deliverables

1. `scripts/test-stage6-quality-mechanisms.ts` — основной скрипт (~700 строк)
2. `.tmp/test-quality-mechanisms/report.md` — markdown отчёт
3. `.tmp/test-quality-mechanisms/results.json` — JSON метрики
