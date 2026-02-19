# Plan: Tester Feedback Fixes (ZKE-7818)

## Context

Получена обратная связь от тестера по курсу ZKE-7818 ("Основы систематизации бизнеса"). Обнаружены проблемы рендеринга, утечки иностранных символов и структурные недостатки. Ключевая находка: **курс ZKE-7818 был сгенерирован самой дешевой моделью `mimo-v2-flash` для всех 20 уроков** из-за бага маршрутизации (mc2-mzjlu), что объясняет большинство проблем с качеством контента. С тех пор модели обновлены и маршрутизация исправлена — многие проблемы качества не будут воспроизводиться.

Курс ZKE-7818 перегенерировать не будем — фокус на системных улучшениях для будущих генераций.

## Root Cause Analysis

| Проблема                       | Корневая причина                                                                                           | Где чинить                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| CJK-иероглифы ("分享")         | `criticalLanguageThreshold: 10` — <10 символов = INFO, не чинится                                          | Self-reviewer heuristics                   |
| "SECTION CONCLUSION" на англ.  | Нет детекции English structural markers; библиотеки языкового детектирования не подходят для коротких фраз | Heuristic reverse-lookup из CONTENT_LABELS |
| Сырой Mermaid как текст        | `runMermaidFixPipeline` ловит только code-fenced Mermaid (`MERMAID_BLOCK_REGEX`). Raw text = пропуск       | Mermaid pipeline Stage 0                   |
| Таблицы как pipe-текст         | GFM tables внутри numbered lists не парсятся                                                               | Prompt (минимально)                        |
| Нет вводных к модулям          | `section.description` есть в БД, но UI не показывает                                                       | Frontend Sidebar                           |
| Короткие уроки, плохие примеры | mimo-v2-flash для всех уроков (mc2-mzjlu)                                                                  | Уже исправлено                             |
| Однообразные заходы            | hook_strategy может не ротироваться                                                                        | Prompt audit                               |

## Tasks (Beads)

### Task 1: [P2][frontend] UI — Описание модулей в viewer

**Файлы:**

- `packages/web/components/course/viewer/components/Sidebar.tsx:168-199`
- `packages/web/types/database.ts:79-89` — `Section.description`

**Контекст:**
Тестер просит вводные к модулям. У секций (`sections`) уже есть `description` в БД. Нужно отображать его в UI при раскрытии модуля.

**Что сделать:**

- При раскрытии модуля в Sidebar — показать `section.description` как блок между заголовком и списком уроков
- Дизайн: как на Coursera/Udemy — компактная карточка с описанием модуля, визуально отделённая от списка уроков
  - Фон: `bg-muted/30` (тонкая подложка), скруглённые углы
  - Текст: `text-xs leading-relaxed text-muted-foreground`, max 3 строки
  - Если длинный текст — line-clamp-3 с кнопкой "показать полностью"
  - Разделитель или отступ между описанием и первым уроком
- Не показывать если `description` пустой или null

---

### Task 2: [P2][pipeline] Self-reviewer — Zero-tolerance fix для CJK/Arabic/Devanagari

**Файлы:**

- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases.ts:98-175`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-constants.ts:127`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts` — `extractForeignCharFragments()`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm.ts` — `applyPatching()`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/content-quality.ts:185-189` — `ZERO_TOLERANCE_SCRIPTS`

**Корневая причина:**
Скриншот показывает "без обязательного分享 (sharing) с менеджерами" — 2 CJK-символа. Порог `criticalLanguageThreshold: 10` пропускает их как INFO.

**Что сделать (для ВСЕХ языков):**

- В `self-reviewer-phases.ts`, между CRITICAL (>10 chars → REGENERATE) и MINOR (<10 chars → INFO) добавить ветку:
  ```
  if foreignCharacters > 0 AND foreignCharacters <= threshold AND any script in ZERO_TOLERANCE_SCRIPTS:
    → extractForeignCharFragments() для получения конкретных фрагментов
    → applyPatching() с инструкцией "Replace foreign characters with correct translation"
    → status = FIXED
  ```
- `ZERO_TOLERANCE_SCRIPTS` уже определён: `Set(['CJK', 'ARABIC', 'DEVANAGARI'])`
- Использовать существующую инфраструктуру `applyPatching` из `self-reviewer-llm.ts`
- НЕ менять `criticalLanguageThreshold` (>10 = полная регенерация по-прежнему верно)

---

### Task 3: [P2][pipeline] Heuristic — Auto-replace английских структурных заголовков

**Файлы:**

- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts`
- `packages/shared-types/src/common-enums.ts:95-478` — `CONTENT_LABELS` (19 языков)

**Корневая причина:**
LLM вставляет "SECTION CONCLUSION", "Introduction", "Summary" и т.п. на английском в нерусский контент. Библиотеки языкового детектирования (`franc`, `tinyld`, `cld3`) ненадёжны на фразах из 2-5 слов. Но проблему можно решить детерминированно.

**Подход — reverse-lookup из CONTENT_LABELS:**

- `CONTENT_LABELS` уже содержит переводы для: introduction, summary, exercises, exercise, task, scenario, yourAnswer, hint, sampleAnswer, lessonDigest (19 языков)
- Строим Map: `CONTENT_LABELS['en'].introduction` ("Introduction") → `CONTENT_LABELS[targetLang].introduction` ("Введение")
- Добавить функцию `replaceEnglishStructuralHeaders(content, targetLanguage)` в `self-reviewer-heuristics.ts`:
  1. Извлекаем все заголовки `## ...` / `### ...` из markdown
  2. Для каждого заголовка проверяем: совпадает ли текст (case-insensitive) с любым английским label из `CONTENT_LABELS['en']`?
  3. Если да и `targetLanguage !== 'en'` → заменяем на локализованный вариант
  4. Дополнительно: regex для составных маркеров не из CONTENT_LABELS:
     ```
     /^(#+\s*)(SECTION|MODULE|COURSE|LESSON)\s+(CONCLUSION|INTRODUCTION|SUMMARY|OVERVIEW|DIGEST)\s*$/gim
     ```
     → Удаляем заголовок целиком (структурный артефакт, не настоящий контент)
- Вызывать в `removeChatbotArtifacts()` ДО regex-чистки (или как отдельный шаг в heuristic phase)

**Безопасность от false positives:**

- Заменяются только ЗАГОЛОВКИ (строки, начинающиеся с `##`), не текст внутри параграфов
- Технические термины (KPI, CEO, RACI) не совпадают ни с одним label
- Для языков с совпадающими словами (фр. "Introduction" = англ. "Introduction") — замена безвредна

---

### Task 4: [P2][pipeline] Mermaid pipeline — Stage 0: авто-оборачивание raw Mermaid

**Файлы:**

- `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.ts:313-350` — `runMermaidFixPipeline()`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-sanitizer.ts:71` — `MERMAID_BLOCK_REGEX`

**Корневая причина:**
`MERMAID_BLOCK_REGEX = /```mermaid\s*([\s\S]*?)```/g` ловит только code-fenced Mermaid. Если LLM генерирует raw `flowchart TD\n  A-->B` как обычный текст — пайплайн возвращает контент без изменений (`diagramsTotal: 0`).

**Что сделать — добавить Stage 0 перед существующей экстракцией:**

1. Новая функция `wrapRawMermaidBlocks(content: string): { content: string; wrappedCount: number }`
2. Алгоритм:
   - Ищем строки, начинающиеся с Mermaid keyword (из `MERMAID_KEYWORDS`: flowchart, graph, sequenceDiagram, classDiagram, stateDiagram, erDiagram, journey, gantt, pie, mindmap, timeline, etc.)
   - Проверяем, что строка НЕ внутри существующего code fence (````...`````)
   - Определяем границы блока: от keyword-строки до первой пустой строки + не-Mermaid-контент (или до следующего `##` заголовка)
   - Дополнительная валидация: следующие строки должны содержать Mermaid-подобный синтаксис (стрелки `-->`, `---`, скобки `[]`, `()`, `{}`, ключевые слова `subgraph`, `end`, `participant`, etc.) — защита от false positives (слово "graph" или "pie" в обычном тексте)
   - Оборачиваем в ` ```mermaid\n...\n``` `
3. Вызывать в `runMermaidFixPipeline()` перед `extractMermaidBlocks()` (line 342)
4. Добавить `diagramsAutoWrapped` в метрики

**Защита от false positives:**

- Keyword + хотя бы 1 Mermaid-синтаксис в следующих строках (стрелки, ноды)
- "pie" + только текст = не Mermaid; "pie" + `"Label" : 42` = Mermaid

---

### Task 5: [P3][pipeline] Prompt — Таблицы не в списках + audit hooks

**Файлы:**

- `packages/course-gen-platform/src/shared/prompts/stage6-prompts.ts:330-350` — `<visual_toolkit>`
- `packages/course-gen-platform/src/stages/stage5-generation/` — hook_strategy assignment

**Что сделать:**

1. В `<visual_toolkit>` добавить 1 строку: "Tables must be standalone blocks — NEVER place markdown tables inside numbered or bulleted lists."
2. Проверить ротацию hook_strategy в Stage 5 — разнообразятся ли стратегии между уроками одного курса. Если нет — добавить round-robin.

## Verification

1. **Task 1**: `pnpm type-check` + визуальная проверка на dev — раскрыть модуль → описание видно и красиво
2. **Task 2**: Unit test: контент с 2 CJK-символами → status `FIXED`, контент очищен
3. **Task 3**: Unit test: `## SECTION CONCLUSION` в русском контенте → заменён/удалён; `## Introduction` → `## Введение`; `## KPI` → не тронут
4. **Task 4**: Unit test: raw `flowchart TD\n  A-->B\n  B-->C` → обёрнут в code fence; обычный текст "This is a graph of..." → не тронут
5. **Task 5**: Визуальная проверка промпта (1 строка добавлена)

## Existing Related Beads

- `mc2-mzjlu` [P2] — Verify Stage 6 model tier routing (ZKE-7818 mismatch) — OPEN
- `mc2-mt07s` [P2] — Stage6 follow-up: remove non-ru/en normalization — OPEN
- `mc2-mrcu` [P2] — Добавить проверку на clichés в Self-Reviewer — CLOSED (уже сделано)
- `mc2-5cuj` [P2] — Fix self-reviewer CJK detection tests — CLOSED
- `mc2-nt8m` [P1] — Course position awareness — CLOSED (уже сделано)
