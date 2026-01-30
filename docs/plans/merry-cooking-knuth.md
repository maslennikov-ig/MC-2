# План: Смягчение подхода к устранению клише в уроках

## Проблема

Первоначальная реализация (коммиты `d716019e`, `c6800a44`) была слишком жёсткой:

- Чистые запреты без конкретных позитивных альтернатив
- Риск "загнать модель в угол" → галлюцинации или сухой контент
- Конфликтующие инструкции (friendly dialogue + avoid questions)

## Что нужно исправить

### 1. `forbidden_patterns` → `writing_tips` (компактная позитивная версия)

**Файл**: `packages/course-gen-platform/src/shared/prompts/prompt-registry.ts`

**Станет (~400 chars вместо ~700):**

```xml
<writing_tips>
**STRONG OPENINGS** — Lead with substance:
- ❌ "Знаете ли вы..." / "Did you know..." → ✅ State the fact directly
- ❌ "В современном мире..." / "In today's world..." → ✅ Be specific to the topic
- Questions are welcome if they're specific: "How does Netflix handle 200M users?" ✅
</writing_tips>
```

Это ~100 токенов вместо ~180.

### 2. `conversational` style — вернуть к оригиналу + микро-подсказка

**Файл**: `packages/shared-types/src/style-prompts.ts`

**Станет (близко к оригиналу, без жёстких запретов):**

```
"Write as friendly dialogue with the reader. Use personal pronouns 'you' and 'we' throughout. Include relatable everyday analogies and real-life examples. Ask engaging questions with specific context rather than generic ones. Keep sentences short and paragraphs scannable. Maintain warm, approachable tone like explaining to a curious friend."
```

Изменение: "Ask rhetorical questions" → "Ask engaging questions with specific context" (позитивное направление вместо запрета)

### 3. `research` style — вернуть примеры хороших вопросов

**Станет (с примерами):**

```
"Guide learning through strategic inquiry and investigation. Ask questions with non-obvious answers: 'Why does X work this way?', 'What would break if we changed Y?'. Present hypotheses to test. Encourage critical thinking by challenging assumptions. Balance open-ended exploration with evidence-based conclusions."
```

Изменение: вместо "rather than rhetorical clichés" → примеры хороших вопросов

### 4. Self-Reviewer — понизить severity до INFO

**Файл**: `self-reviewer-prompt.ts`

**Изменить:**

- Severity `FLAG_TO_JUDGE` → `INFO`
- Это advisory, не блокирующий

## Файлы для изменения

| Файл                      | Изменение                                              | Токены |
| ------------------------- | ------------------------------------------------------ | ------ |
| `prompt-registry.ts`      | `<forbidden_patterns>` → `<writing_tips>` (компактнее) | -80    |
| `style-prompts.ts`        | conversational: позитивное направление                 | ~0     |
| `style-prompts.ts`        | research: примеры хороших вопросов                     | ~0     |
| `self-reviewer-prompt.ts` | CLICHE severity → INFO                                 | ~0     |

**Итог по токенам**: ~100 токенов меньше чем сейчас

## Принцип

**Вместо "НЕ делай X" → "Делай Y с контекстом"**

- Убираем списки запретов
- Даём короткие позитивные примеры
- Не конфликтуем с другими стилями (interactive, storytelling могут использовать вопросы)

## Верификация

1. `pnpm type-check && pnpm build`
2. Сгенерировать урок с `conversational` стилем
3. Контент должен быть живым, с конкретными фактами
