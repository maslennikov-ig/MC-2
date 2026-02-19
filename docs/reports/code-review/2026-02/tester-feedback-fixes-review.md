# Code Review: Tester Feedback Fixes (commit a438ae3f)

**Date**: 2026-02-19
**Commit**: `a438ae3f96cb0f3e2a51355ce1f13fac9e18a1a1`
**Author**: maslennikov-ig
**Reviewer**: Claude Sonnet 4.6 (code-reviewer)
**Files reviewed**: 7
**Issues found**: 11 (1 P1, 5 P2, 5 P3)

---

## Summary

В целом изменения реализованы грамотно. Архитектурные решения правильные: lazy-init map для заголовков, reverse-order применение замен в mermaid, защита code-fence регионов. Критических багов нет, но есть один bug и несколько значимых issues с false-positive рисками в mermaid pipeline.

---

## CRITICAL BUGS

Критических багов (P0) не обнаружено.

---

## BUGS

### P1-001 — MERMAID_SYNTAX_PATTERNS имеет широкие false-positive паттерны

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.ts`
**Строки**: 216–226

**Описание**:
`MERMAID_SYNTAX_PATTERNS` используется как "guard" — если паттерн найден в lookahead-строках после Mermaid-ключевого слова, блок считается настоящим Mermaid. Но сами паттерны слишком широкие и срабатывают на обычный учебный текст:

```typescript
const MERMAID_SYNTAX_PATTERNS: RegExp[] = [
  /\[.*?\]|\(.*?\)|\{.*?\}/, // markdown ссылки, checkboxes, скобки
  /subgraph|end\b/i, // "at the end of...", "the class ended"
  /class\s+\w+/i, // "the class of data", "in class C"
  /state\s+/i, // "the state of the system"
  /section\s+/i, // "the section on..."
  /^\s+\w/m, // любая строка с отступом
];
```

Проверено практически:

- `"Each slice (section) represents a proportion."` — срабатывает `\(.*?\)` и `/section\s+/i`
- `"The class of data shown is numerical."` — срабатывает `/class\s+\w+/i`
- `"At the end of the course..."` — срабатывает `/end\b/i`
- `"- [x] Task completed"` — срабатывает `\[.*?\]`

**Последствие**: Если слово `pie`, `timeline`, `journey` или `gantt` стоит на отдельной строке в учебном тексте (например, раздел "Pie charts" или "Journey maps"), и в следующих 20 строках есть любые скобки или слово "section/state/class/end" (а это почти всегда), блок будет ошибочно завёрнут в ` ```mermaid ` фенс.

**Дополнительный риск**: Алгоритм определения конца блока использует те же паттерны чтобы решить, продолжается ли блок после пустой строки. Если после настоящего Mermaid-блока идёт пустая строка, а за ней prose типа `"The section on..."`, алгоритм ошибочно включает эти строки в блок.

**Предложенный fix**:

1. Ужесточить паттерны, сделав их специфичными для Mermaid-синтаксиса:

```typescript
const MERMAID_SYNTAX_PATTERNS: RegExp[] = [
  /-->|---|-\.->|==>|~~~/, // стрелки (специфичны для Mermaid)
  /subgraph\s+\w/i, // только 'subgraph Name', не просто 'end'
  /\bend\s*$/im, // 'end' только в конце строки (Mermaid block closer)
  /^participant\s+\w/im, // 'participant Alice' (sequence diagrams)
  /"[^"]+"\s*:\s*\d+/, // gantt/pie data: "Label": 42
];
```

2. Для определения конца блока использовать отдельный, ещё более строгий набор паттернов.

---

## IMPROVEMENTS

### P2-001 — SectionDescription: useEffect не сбрасывает `expanded` при смене `description`

**Файл**: `packages/web/components/course/viewer/components/Sidebar.tsx`
**Строки**: 30–35

**Описание**:
Когда `description` prop меняется (sidebar-пересортировка, навигация), `expanded` остаётся `true`. В этот момент `useEffect` запускается — но `el` не имеет `line-clamp` (т.к. `expanded=true`), поэтому `scrollHeight === clientHeight` и `setClamped(false)`. Кнопка исчезает. Текст при этом остаётся развёрнутым (expanded=true), но кнопку "Свернуть" пользователь не видит.

```typescript
useEffect(() => {
  const el = textRef.current;
  if (el) {
    setClamped(el.scrollHeight > el.clientHeight);
    // Проблема: если expanded=true, line-clamp не применяется,
    // scrollHeight === clientHeight, setClamped(false),
    // кнопка исчезает, но текст остаётся развёрнутым
  }
}, [description]); // expanded не в зависимостях — intentional, но создаёт edge case
```

**Fix**:

```typescript
useEffect(() => {
  // Сбрасываем состояние при смене описания
  setExpanded(false);
  setClamped(false);
  // requestAnimationFrame даёт React время применить line-clamp перед измерением
  const frame = requestAnimationFrame(() => {
    const el = textRef.current;
    if (el) {
      setClamped(el.scrollHeight > el.clientHeight);
    }
  });
  return () => cancelAnimationFrame(frame);
}, [description]);
```

---

### P2-002 — SectionDescription: hardcoded русские строки без i18n

**Файл**: `packages/web/components/course/viewer/components/Sidebar.tsx`
**Строки**: 50

**Описание**:
Текст кнопки захардкожен по-русски, хотя компонент уже использует `useTranslations`:

```tsx
{
  expanded ? 'Свернуть' : 'Показать полностью';
}
```

Остальной Sidebar использует `t('allLessons')`. Заметим также, что в строке 274 есть `мин` — тоже захардкожено. Новый компонент усиливает этот паттерн.

**Fix**:

```tsx
// В SectionDescription принять t как prop или вынести useTranslations в компонент:
const t = useTranslations('course.viewer');
// ...
{
  expanded ? t('collapse') : t('showMore');
}
```

Добавить в локализационный файл ключи `collapse` и `showMore`.

---

### P2-003 — STRUCTURAL_ARTIFACT_HEADER_REGEX: модуль-уровневый regex с флагом `/g`

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts`
**Строки**: 452–453

**Описание**:
Regex объявлен на уровне модуля с флагом `/g`:

```typescript
const STRUCTURAL_ARTIFACT_HEADER_REGEX =
  /^(#{1,6}\s*)(SECTION|MODULE|COURSE|LESSON)\s+(CONCLUSION|INTRODUCTION|SUMMARY|OVERVIEW|DIGEST)\s*$/gim;
```

В коде перед использованием делается `STRUCTURAL_ARTIFACT_HEADER_REGEX.lastIndex = 0` (строка 496) — защита есть. Однако модуль-уровневый stateful regex создаёт ненужный риск: если в будущем кто-то вызовет `.test()` на этом regex (например, в unit-тесте или guard-условии), `lastIndex` изменится, и следующий `.replace()` начнёт матчинг не с начала строки.

**Fix**:
Либо убрать флаг `/g` (для `.replace()` с обычным regex флаг не нужен в большинстве случаев), либо создавать regex внутри функции:

```typescript
// Вариант 1: без /g (replace() с /gim без /g — ошибка, оставляем /gim):
// На самом деле /gim нужны для multiline + global. Лучший вариант:

// Вариант 2: factory function
function getStructuralArtifactRegex() {
  return /^(#{1,6}\s*)(SECTION|MODULE|COURSE|LESSON)\s+(CONCLUSION|INTRODUCTION|SUMMARY|OVERVIEW|DIGEST)\s*$/gim;
}
```

---

### P2-004 — `enToRuHeaderMap`: module-level mutable singleton без возможности инвалидации

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts`
**Строки**: 427–444

**Описание**:

```typescript
let enToRuHeaderMap: Map<string, string> | null = null;

function getEnToRuHeaderMap(): Map<string, string> {
  if (enToRuHeaderMap) return enToRuHeaderMap;
  // ... build map
  return enToRuHeaderMap;
}
```

Singleton не инвалидируется. Если `CONTENT_LABELS` меняется (hot reload в dev, или mock в тестах), старый map используется до перезагрузки модуля. Также нет защиты на случай, если `CONTENT_LABELS['en']` или `CONTENT_LABELS['ru']` будут `undefined` (маловероятно, но возможно при неполных импортах).

**Fix** (минимальный):

```typescript
function getEnToRuHeaderMap(): Map<string, string> {
  if (enToRuHeaderMap) return enToRuHeaderMap;

  const enLabels = CONTENT_LABELS['en'];
  const ruLabels = CONTENT_LABELS['ru'];

  if (!enLabels || !ruLabels) {
    // Fallback: пустой map, не кэшируем
    return new Map();
  }
  // ... rest of logic
}
```

---

### P2-005 — wrapRawMermaidBlocks: блок может захватить последующий prose через пустую строку

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.ts`
**Строки**: 314–323

**Описание**:
Алгоритм продолжает включать строки в Mermaid-блок если после пустой строки идёт "Mermaid-подобная" строка. Но `MERMAID_SYNTAX_PATTERNS` дают ложные срабатывания на prose (см. P1-001). Конкретный сценарий:

```
flowchart TD
    A --> B

The section on deployment shows how...
```

Паттерн `/section\s+/i` матчит `"The section on..."`. Алгоритм решает, что блок продолжается. В результате prose-текст включается в Mermaid-фенс и ломает рендер.

**Fix**: Как указано в P1-001 — ужесточить паттерны. Дополнительно: разделить паттерны "lookahead validation" (строже) и "block continuation" (ещё строже — только однозначные стрелки/отступы).

---

## NOTES

### P3-001 — SectionDescription: `clamped` измеряется до анимации expand

**Файл**: `packages/web/components/course/viewer/components/Sidebar.tsx`
**Строки**: 30–35

**Описание**:
`SectionDescription` рендерится внутри `motion.div` с анимацией `height: 0 -> auto`. `useEffect` запускается сразу после mount, но в момент запуска элемент может иметь `height: 0` из-за начальной анимации framer-motion. В этот момент `scrollHeight` и `clientHeight` оба равны 0, `setClamped(false)`, кнопка не показывается.

На практике это может не проявляться (React batches + animation frame), но ненадёжно.

**Рекомендация**: Использовать `ResizeObserver` вместо одноразового `useEffect`:

```typescript
useEffect(() => {
  const el = textRef.current;
  if (!el) return;
  const observer = new ResizeObserver(() => {
    // Измеряем только в collapsed состоянии
    if (!expanded) {
      setClamped(el.scrollHeight > el.clientHeight);
    }
  });
  observer.observe(el);
  return () => observer.disconnect();
}, [expanded]);
```

---

### P3-002 — rotateHookStrategy: в секциях с N >= HOOK_STRATEGIES.length уроков повторяется inferred

**Файл**: `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/v2-converter.ts`
**Строки**: 196–203

**Описание**:

```typescript
function rotateHookStrategy(inferred: HookStrategyV2, lessonIndex: number): HookStrategyV2 {
  if (lessonIndex === 0) return inferred;
  const inferredIdx = HOOK_STRATEGIES.indexOf(inferred);
  const rotatedIdx = (inferredIdx + lessonIndex) % HOOK_STRATEGIES.length;
  return HOOK_STRATEGIES[rotatedIdx];
}
```

При 4 уроках в секции с `inferred = 'challenge'` (idx=3):

- lesson 0: `challenge`
- lesson 1: `question`
- lesson 2: `analogy`
- lesson 3: `statistic`
- lesson 4: `challenge` ← повторяет lesson 0

Для секций с 4+ уроками вариативность нарушается. Не критично для большинства секций (обычно 3–5 уроков), но стоит учитывать.

**Рекомендация** (если важна строгая уникальность): Исключать `inferred` из rotation pool для последующих уроков:

```typescript
function rotateHookStrategy(inferred: HookStrategyV2, lessonIndex: number): HookStrategyV2 {
  if (lessonIndex === 0) return inferred;
  const others = HOOK_STRATEGIES.filter(s => s !== inferred);
  return others[(lessonIndex - 1) % others.length];
}
```

Это даёт для `challenge`: lesson 0=challenge, 1=question, 2=analogy, 3=statistic, 4=question, 5=analogy — без повторения inferred.

---

### P3-003 — replaceEnglishStructuralHeaders: Step 1 матчит заголовки case-insensitively, Step 2 — case-sensitively

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics.ts`
**Строки**: 484–500

**Описание**:
Step 1 использует `headerText.trim().toLowerCase()` для поиска в map → матчит `## INTRODUCTION` и `## Introduction` одинаково — правильно.

Step 2 (`STRUCTURAL_ARTIFACT_HEADER_REGEX`) использует флаг `/i` → матчит любой регистр — правильно.

Но обратный порядок шагов создаёт edge case: если заголовок `## INTRODUCTION` (uppercase) совпадает со Step 1 map (ключ `'introduction'`) И с Step 2 regex, он обрабатывается в Step 1 и заменяется на `Введение`. Regex в Step 2 потом не находит его (уже кириллица). Это корректное поведение, но недокументировано.

Более важно: если заголовок `## SECTION INTRODUCTION` — Step 1 ищет `'section introduction'` в map. Этого ключа в map нет (ключи одиночные: `'introduction'`). Поэтому Step 1 пропускает. Step 2 удаляет его. Работает правильно.

**Замечание**: Документация функции не упоминает, что двухслойная обработка преднамеренна и что Step 1 не захватывает составные заголовки. Стоит добавить комментарий.

---

### P3-004 — wrapRawMermaidBlocks: тильда-фенсы (`~~~`) не учитываются как code fences

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.ts`
**Строки**: 250–258

**Описание**:

````typescript
const codeFenceRegex = /```[\s\S]*?```/g;
````

Markdown поддерживает два вида code fence: ` ``` ` и `~~~`. Если LLM выдал Mermaid в `~~~`-фенсе, алгоритм не посчитает его как защищённый регион. Keyword-линия внутри будет обнаружена и потенциально двойно завёрнута.

На практике LLM-ы крайне редко используют `~~~`, а остальной pipeline тоже работает с ` ``` `. Риск минимальный.

**Рекомендация**: Расширить regex:

````typescript
const codeFenceRegex = /(?:```|~~~)[\s\S]*?(?:```|~~~)/g;
````

---

### P3-005 — stage6-prompts.ts: правило про таблицы добавлено дважды в одном шаблоне, но пропущено в third

**Файл**: `packages/course-gen-platform/src/shared/prompts/stage6-prompts.ts`
**Строки**: 137, 347, 731

**Описание**:
Правило `Tables must be standalone blocks — NEVER place markdown tables inside numbered or bulleted lists` добавлено в три места. Проверяя diff: правило добавлено на строках 138 и 348 и 732. Это три разных `<visual_toolkit>` секции в разных промптах. Выглядит полным и консистентным.

Замечание: В двух местах (строки 137 и 731) добавление идёт как отдельная строка с отступом под пунктом 5. В строке 347 — добавлено как продолжение самого пункта 4. Форматирование чуть отличается, но смысл одинаковый.

**Рекомендация** (косметика): Привести к единому стилю — либо везде как отдельная строка-уточнение, либо везде как часть пункта.

---

## Итоговая оценка

| Файл                                                            | Статус           | Замечания                                                                      |
| --------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `Sidebar.tsx` — SectionDescription                              | OK с замечаниями | P2-001 (expanded reset), P2-002 (i18n), P3-001 (animation timing)              |
| `self-reviewer-phases.ts` — CJK FIXABLE                         | OK               | Логика корректна, ZERO_TOLERANCE_SCRIPTS импортирован и используется правильно |
| `self-reviewer-heuristics.ts` — replaceEnglishStructuralHeaders | OK с замечаниями | P2-003 (stateful regex), P2-004 (singleton), P3-003 (порядок шагов)            |
| `self-reviewer-llm.ts` — STEP 1.5                               | OK               | Интеграция корректна; условие STEP 2 не нарушается                             |
| `mermaid-fix-pipeline.ts` — Stage 0                             | Требует внимания | P1-001 + P2-005 (false-positive паттерны), P3-004 (tilde fences)               |
| `stage6-prompts.ts` — таблицы                                   | OK               | P3-005 (косметика форматирования)                                              |
| `v2-converter.ts` — round-robin                                 | OK с замечанием  | P3-002 (wrap-around для 4+ уроков)                                             |

**Приоритет действий**:

1. P1-001 — ужесточить `MERMAID_SYNTAX_PATTERNS` во избежание false-positive wrapping
2. P2-001 — сбросить `expanded` при смене `description`
3. P2-002 — убрать хардкод русских строк
4. P2-003 — убрать module-level stateful `/g` regex или создавать в функции
5. Остальное — низкий приоритет, может быть исправлено в рамках следующих задач
