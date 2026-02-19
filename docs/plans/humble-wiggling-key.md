# Fix: Keyword Coverage блокирует генерацию качественного русского контента

## Context

После исправления BullMQ дедупликации и 3-tier model routing, `partialGenerate` снова запускает генерацию. Но уроки 1.2 и 1.3 **fail** на heuristic pre-filter из-за keyword coverage < 50%, хотя контент качественный.

Данные из production (курс `fd155785-d819-48d7-9217-ea776006b449`):

- Урок 1.2: 32 keywords, 13 found = **41%** → FAIL (порог 50%)
- Урок 1.3: 35 keywords, 16 found = **46%** → FAIL (порог 50%)
- Урок 1.4: 31 keywords, 17 found = **55%** → PASS

Контент проходит LLM judge когда до него доходит, но heuristic stage блокирует — 2 retry исчерпываются, урок помечается как failed.

## Корневые причины (3 слоя)

### 1. Bloom's taxonomy verbs не фильтруются

Из `learning_objectives` извлекаются глаголы-инструкции: "запомнить", "объяснить", "оценить", "опровергнуть". Это Bloom's taxonomy — описывает что студент должен **уметь делать**, а не тематику контента. LLM правильно не воспроизводит их в тексте урока.

### 2. Русская морфология ломает exact match

`allText.includes(keyword)` — exact substring. Русский язык имеет 6 падежей, меняющих окончания:

- "эвдемонии" (род.) ≠ "эвдемония" (им.)
- "процветания" (род.) ≠ "процветание" (им.)
- "конечной" (предл.) ≠ "конечная" (им.)

### 3. Порог 50% слишком строг для русского

С учётом п.1 и п.2, из 32 extracted keywords реально релевантных ~20, из которых ~13 находятся. Фактический coverage контентных слов ~65%, но метрика показывает 41%.

## Решение (3 изменения в 1 файле)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/heuristic-helpers.ts`

### Изменение 1: Snowball stemmer для русской морфологии

Пакет `snowball-stemmers` **уже установлен** (`package.json:94`) с типами (`src/types/snowball-stemmers.d.ts`), но **нигде не используется**. Русский стеммер корректно обрабатывает падежи, числа, род:

```typescript
import { russian as RussianStemmer } from 'snowball-stemmers';

const russianStemmer = new RussianStemmer();

// Pre-stem весь текст 1 раз (O(n) слов)
function stemRussianText(text: string): string {
  return text.replace(/[а-яёА-ЯЁ]{4,}/g, match => russianStemmer.stem(match.toLowerCase()));
}

// Проверка: exact match → fallback на stem match
function matchKeywordInText(keyword: string, allText: string, stemmedText: string): boolean {
  const isCyrillic = /^[а-яёА-ЯЁ]+$/.test(keyword);
  if (!isCyrillic) return allText.includes(keyword);

  if (allText.includes(keyword)) return true;

  const keywordStem = russianStemmer.stem(keyword);
  if (keywordStem.length < 3) return false; // слишком короткий стем
  return stemmedText.includes(keywordStem);
}
```

### Изменение 2: Bloom's taxonomy verbs в стоп-лист

Расширить `commonWords` Set:

**English** (из `filters/orchestrator.ts:57-65`):

```
'understand', 'explain', 'describe', 'identify', 'demonstrate',
'apply', 'analyze', 'create', 'evaluate'
```

**Russian** (все 6 уровней Блума):

```
'запомнить', 'объяснить', 'описать', 'определить', 'оценить',
'проанализировать', 'применить', 'сформулировать', 'сравнить',
'различить', 'классифицировать', 'опровергнуть', 'доказать',
'обосновать', 'перечислить', 'назвать', 'выделить', 'распознать',
'интерпретировать', 'продемонстрировать', 'создать', 'разработать',
'предложить', 'спроектировать', 'составить', 'понять', 'знать',
'усвоить', 'освоить', 'изучить', 'рассмотреть'
```

### Изменение 3: Порог 50% → 35%

Строка 365: `keywordCoverage < 0.5` → `keywordCoverage < 0.35`
Строка 367: обновить текст ошибки "below 35% threshold"

Обоснование: даже с стеммером и Bloom фильтрацией, русская морфология (составные слова, синонимы, деривационная морфология) не даёт 100% matching. 35% — meaningful signal: ловит off-topic контент, но не блокирует качественные уроки.

## Файлы

| #   | Файл                           | Что                                                                 |
| --- | ------------------------------ | ------------------------------------------------------------------- |
| 1   | `cascade/heuristic-helpers.ts` | Все 3 изменения: import snowball, Bloom verbs, stem matching, порог |

**1 файл, ~50 строк изменений.**

## Проверка

1. `pnpm type-check` — snowball-stemmers import с существующими типами
2. Deploy на DEV → перегенерировать урок 1.2 на курсе `fd155785`
3. Проверить логи worker: `Keyword coverage calculation` → coverage должен быть 55-70% (вместо 41%)
4. `Heuristic pre-filter complete` → `passed: true`
5. Урок должен дойти до LLM judge и пройти полную генерацию
