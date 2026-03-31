# Plan: Фундаментальное исправление Stage 6 Quality Pipeline

## Context

Курс XQH-3540 выявил системные проблемы качества генерации уроков:

- **50% уроков** — сломанные mermaid-диаграммы (уже починено pipeline fix)
- **Галлюцинации** — упражнения/заключения от ЧУЖИХ модулей (3.2, 8.5)
- **Обрезанный контент** — текст обрывается на полуслове (5.3, 6.1)
- **Stub-контент** — урок 8.2 всего 217 слов вместо 700+
- **Дубликаты** — одинаковые секции дважды (8.5)
- **CJK-символы** — китайские символы в русском тексте

**Корневая причина:** проблемы проходят через judge pipeline незамеченными из-за архитектурных пробелов в валидации.

---

## Выявленные пробелы (6 root causes)

### 1. `checkContentTruncation` НЕ подключён к heuristic pipeline

- **Файл:** `judge/filters/orchestrator.ts` (runHeuristicFilters)
- Функция экспортирована, но НЕ вызывается в `runHeuristicFilters()`
- Проверка обрезанного контента существует только в self-reviewer, но не в heuristic cascade
- **Результат:** обрезанный контент проходит в judge как "валидный"

### 2. Word count в cascade — WARNING, а не BLOCKER

- **Файл:** `judge/cascade/heuristic-helpers.ts:503-514`
- `if (wordCount < minWordCount) { warnings.push(...) }` — не блокирует
- 217 слов при минимуме ~500 → warning в логах, но контент проходит дальше
- **Результат:** stub-контент принимается с высоким quality score

### 3. Judge prompt не проверяет cross-module coherence

- **Файл:** `judge/clev-voter-helpers.ts` (buildJudgePrompt)
- 6 критериев OSCQR: alignment, structure, accuracy, clarity, engagement, completeness
- **НЕТ критерия:** "verify exercises/conclusions belong to THIS lesson, not imported from other modules"
- **Результат:** упражнения от чужого модуля получают "factual accuracy: PASS"

### 4. Дупликация секций — порог 32% слишком высокий

- **Файл:** `judge/filters/duplication-checks.ts`
- 5-gram overlap threshold = 0.32 (32%)
- Парафразированные дубликаты (<32%) проходят проверку
- **Результат:** перефразированные дубликаты не обнаруживаются

### 5. CJK detection работает, но judge prompt НЕ просит проверять

- **Файл:** `judge/filters/content-quality.ts:155-306`
- `checkLanguageConsistency()` ловит CJK (zero-tolerance)
- Но если CJK в code block — пропускается
- Judge prompt (buildJudgePrompt) НЕ включает критерий language purity
- **Результат:** отдельные CJK-символы могут проскочить через code blocks

### 6. CLEV agreement проверяет только числовой score

- **Файл:** `judge/clev-voter-helpers.ts` (scoresAgree)
- `scoresAgree()` проверяет |score1 - score2| < 0.1
- НЕ проверяет: одинаковые ли issues найдены обоими judges
- **Результат:** judges могут согласиться на score 0.85 но по разным причинам

---

## Решение: 3 уровня защиты

### Уровень 1: PRE-JUDGE heuristic fixes (бесплатно, без LLM)

**1.1 Подключить checkContentTruncation в heuristic pipeline**

- **Файл:** `judge/filters/orchestrator.ts`
- Добавить вызов `checkContentTruncation(content)` после duplication check
- Добавить вес `contentTruncation: 0.08` в `FILTER_WEIGHTS` (types.ts)
- Перебалансировать веса (сумма = 1.0)

**1.2 Сделать word count BLOCKER в cascade**

- **Файл:** `judge/cascade/heuristic-helpers.ts:503-514`
- Заменить `warnings.push(...)` на добавление failure с severity `critical` если wordCount < 50% от minWordCount
- При wordCount < minWordCount но > 50% — severity `major` (всё ещё блокер для heuristics passed)

**1.3 Добавить per-section minimum word count**

- **Файл:** `judge/filters/basic-checks.ts`
- Новая проверка: каждая секция должна иметь минимум 40 слов
- Ловит "stub sections" (заголовок есть, контент пустой/короткий)

**1.4 Улучшить truncation detection**

- **Файл:** `judge/filters/structural-checks.ts`
- Добавить: проверку каждой секции по отдельности (не только конец документа)
- Добавить: детекцию обрезанных слов (regex: `\b\w{2,}$` без пунктуации в конце секции)

### Уровень 2: Judge prompt enhancement (LLM evaluation)

**2.1 Добавить критерий cross-module coherence**

- **Файл:** `judge/clev-voter-helpers.ts` (buildJudgePrompt)
- Новый 7-й критерий: `content_coherence`
- Инструкция: "Verify ALL exercises, examples, and conclusions directly reference content from THIS lesson. Flag if any exercise mentions topics/modules NOT covered in this lesson."
- Передавать `lessonSpec.lesson_title` и `lessonSpec.section_title` в prompt для reference

**2.2 Добавить language purity в judge prompt**

- **Файл:** `judge/clev-voter-helpers.ts` (buildJudgePrompt)
- В секцию `clarity_readability`: "Check for foreign script characters (CJK, Arabic) that don't belong in {language} content."

**2.3 Добавить minimum length criterion**

- В judge prompt: "Flag if total content is significantly shorter than expected for a {duration_minutes}-minute lesson (expected ~{expected_words} words, actual ~{actual_words} words)."

### Уровень 3: CLEV agreement hardening

**3.1 Issue-level agreement check**

- **Файл:** `judge/clev-voter-helpers.ts` (scoresAgree)
- Помимо numeric score agreement, проверить что оба judges нашли (или не нашли) CRITICAL issues
- Если judge1 нашёл critical issue а judge2 нет → disagreement → tiebreaker

---

## Файлы для модификации

| Файл                                 | Изменения                                           |
| ------------------------------------ | --------------------------------------------------- |
| `judge/filters/orchestrator.ts`      | Подключить truncation check, перебалансировать веса |
| `judge/filters/types.ts`             | Добавить `contentTruncation` weight                 |
| `judge/filters/structural-checks.ts` | Per-section truncation detection                    |
| `judge/filters/basic-checks.ts`      | Per-section minimum word count                      |
| `judge/cascade/heuristic-helpers.ts` | Word count → blocker                                |
| `judge/clev-voter-helpers.ts`        | Judge prompt + CLEV agreement enhancement           |

Все файлы в: `packages/course-gen-platform/src/stages/stage6-lesson-content/`

---

## Verification

1. **Unit tests:** Запустить `npx vitest run "heuristic\|structural\|duplication\|content-quality\|clev"` из `packages/course-gen-platform/`
2. **Contract tests:** `pnpm --filter course-gen-platform test` (unit suite)
3. **Type check:** `pnpm type-check`
4. **Manual test:** Перегенерировать 2-3 урока после изменений и проверить что:
   - Stub content (< 250 слов) → REGENERATE
   - Обрезанный текст → REGENERATE
   - Cross-module exercises → низкий score от judge
