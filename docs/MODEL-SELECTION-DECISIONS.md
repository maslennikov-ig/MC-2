# Принятые Решения: Выбор Моделей Для Генерации Контента

**Дата**: 2025-11-13
**Статус**: Утверждено
**Основано на**: Тестирование 11 моделей, 120+ API вызовов, качественный анализ контента

---

## 📌 Принятые Решения

### 1. Course Metadata (Метадата Курса)

**Primary модели** (language-aware routing):

- **RU**: `qwen/qwen3-235b-a22b-2507`
- **EN и другие языки**: `deepseek/deepseek-v3.1-terminus`

**⚠️ ВАЖНО для Qwen3**: Используем **regular модель** (НЕ `-thinking` вариант) для performance (INV-2025-11-19-003)

- Regular: 15-29s, Thinking: 30-110s (test), 521s (production context)
- Оба достигают 100% success rate, нет разницы в качестве для structured generation
- Performance улучшение: **17-35x быстрее**

**Причины выбора**:

- Qwen3 235B: Качество 9/10 для RU, $0.11 input / $0.60 output per 1M tokens
- DeepSeek Terminus: Качество 9.0/10 для EN, 100% стабильность
- Надежность: 100% success rate на обеих моделях

**Fallback модель**: `moonshotai/kimi-k2-0905`

**⚠️ ВАЖНО**: Используем **regular Kimi K2** (НЕ `-thinking` вариант)

**Причины выбора fallback**:

- Качество: 9.2/10 для EN, 9.5/10 для RU (лидер по качеству)
- Надежность: 100% success rate
- Цена: $0.55 input / $2.25 output per 1M tokens
- Премиум качество для сложных случаев

---

### 2. Lesson Structure (Структура Уроков)

**Primary модели** (language-aware routing):

- **RU**: `qwen/qwen3-235b-a22b-2507` (9.2/10 для RU Lessons)
- **EN и другие языки**: `deepseek/deepseek-v3.1-terminus` (8.8/10, 100% стабильность)

**Причины выбора**:

- Qwen3 235B RU: 10/10 (5 уроков, backpropagation, градиенты, математические формулы)
- DeepSeek Terminus EN: 8.8/10 (5 complete lessons, 100% консистентность, modern Python)
- Надежность: 100% success rate на обеих моделях

**Fallback модель**: `moonshotai/kimi-k2-0905`

**⚠️ ВАЖНО**: Используем **regular Kimi K2** (НЕ `-thinking` вариант)

**Причины выбора fallback**:

- Качество EN: 8.8/10 (наравне с лидерами)
- Качество RU: 8.7/10 (хорошее качество)
- Премиум качество для сложных случаев
- Цена: $0.55 input / $2.25 output per 1M tokens

**Примечание**: Qwen3 235B (regular variant) и DeepSeek Terminus используются для генерации. Thinking варианты НЕ используются нигде из-за performance degradation без качественных преимуществ

---

### 3. Задачи С Большим Контекстом (Large Context)

**Применимо к**: Суммаризация больших документов, анализ множественных источников, обработка длинных транскриптов

**Primary модель**: `x-ai/grok-4-fast`

**Характеристики**:

- Context window: **2,000,000 токенов входящих** (2M)
- Output limit: 30,000 токенов исходящих
- Цена: $0.20 input / $0.50 output per 1M tokens
- Качество: 10/10 для английской метадаты, очень быстрая (9.6s avg)

**Причины выбора**:

- Самый большой context window среди доступных моделей
- Отличная цена для large context задач
- Высокая скорость обработки
- Output limit не проблема, т.к. мы дробим задачи

**Fallback модель**: `google/gemini-2.5-flash`

**Причины выбора fallback**:

- Context window: 2M tokens (резервный вариант для больших объемов)
- Цена: $0.075 input / $0.30 output per 1M tokens (экономичный fallback)
- Надежность: Проверенная модель для large context задач

**Примечание**: Gemini Flash - правильный fallback для задач с большим контекстом

---

### 4. Все Остальные Задачи

**Применимо к**: Все другие генерируемые сущности

**Primary модели** (language-aware routing):

- **RU**: `qwen/qwen3-235b-a22b-2507`
- **EN и другие языки**: `deepseek/deepseek-v3.1-terminus`

**Fallback модель**: `moonshotai/kimi-k2-0905`

**Причина**: Language-aware routing обеспечивает оптимальное качество для каждого языка

---

### 5. OSS Модели (Без Изменений)

**Применимо к**: Фазы анализа (Stage 4), где используются легковесные модели

**Текущие модели**:

- `openai/gpt-oss-20b` - для большинства фаз анализа (Phase 1, 2, 4, 6)
- `openai/gpt-oss-120b` - для критических фаз (Phase 3 Expert Analysis)

**Статус**: **Без изменений**. Эти модели остаются на своих местах и продолжают использоваться для задач анализа.

**Причины**:

- Отличная цена для аналитических задач
- Проверенная надежность
- Хорошее качество для структурного анализа

---

### 6. Stage 6 LLM Judge (Оценка Качества Контента)

**Применимо к**: Автоматическая оценка качества сгенерированного контента уроков

**Архитектура**: CLEV Voting (Consensus via Lightweight Efficient Voting)

- 2 судей запускаются параллельно
- Если оценки совпадают (разница < 10%) → возврат результата (67% экономия)
- Если расхождение → запуск 3-го судьи как tiebreaker

**Модели судей** (language-aware, чтобы избежать self-evaluation bias):

**Для RU контента** (генерируется Qwen3 → судьи НЕ Qwen):

- **Primary**: `deepseek/deepseek-v3.1-terminus` (weight: 0.74)
- **Secondary**: `moonshotai/kimi-k2-0905` (weight: 0.73)
- **Tiebreaker**: `minimax/minimax-m2` (weight: 0.72)

**Для EN/Other контента** (генерируется DeepSeek → судьи НЕ DeepSeek):

- **Primary**: `qwen/qwen3-235b-a22b-2507` (weight: 0.75)
- **Secondary**: `moonshotai/kimi-k2-0905` (weight: 0.73)
- **Tiebreaker**: `minimax/minimax-m2` (weight: 0.72)

**Дополнительные модели** (для расширения или fallback):

- `z-ai/glm-4.6` (weight: 0.71)
- `google/gemini-2.5-flash` (weight: 0.68) — только крайний fallback

**Модель для Refinement** (исправление контента по feedback судей):

- **Primary**: `moonshotai/kimi-k2-0905`
- **Fallback**: `minimax/minimax-m2`

**Причины выбора**:

- Self-evaluation bias: модель показывает 10-25% более высокую оценку своего контента
- Kimi K2 — нейтральная модель, подходит для судейства любого контента
- Minimax M2 и GLM-4.6 — дополнительное разнообразие архитектур

**Temperature**: 0.1 (для консистентности оценок)

---

## 📊 Сводная Таблица

| Задача               | Primary RU   | Primary EN/Other  | Fallback     | Причина                                                                |
| -------------------- | ------------ | ----------------- | ------------ | ---------------------------------------------------------------------- |
| **Metadata**         | Qwen3 235B   | DeepSeek Terminus | Kimi K2      | Language-aware routing, 100% надежность                                |
| **Lessons**          | Qwen3 235B   | DeepSeek Terminus | Kimi K2      | Лучшее качество для каждого языка                                      |
| **Large Context**    | Grok 4 Fast  | Grok 4 Fast       | Gemini Flash | 2M токенов входящих, отличная цена                                     |
| **Остальное**        | Qwen3 235B   | DeepSeek Terminus | Kimi K2      | Универсальность                                                        |
| **Stage 4 Analysis** | OSS 20B/120B | OSS 20B/120B      | —            | Аналитические задачи, низкая цена                                      |
| **Stage 6 Content**  | Qwen3 235B   | DeepSeek Terminus | Kimi K2      | Research completed — см. docs/research/010-stage6-generation-strategy/ |

---

## 💰 Ценовое Сравнение

| Модель               | Input  | Output | Context Window | Использование                             |
| -------------------- | ------ | ------ | -------------- | ----------------------------------------- |
| Qwen3 235B (regular) | $0.11  | $0.60  | Standard       | RU primary - NOT thinking variant         |
| DeepSeek Terminus    | ~$0.27 | ~$1.10 | Standard       | EN/Other primary                          |
| Grok 4 Fast          | $0.20  | $0.50  | **2M tokens**  | Large context (primary)                   |
| Kimi K2 (regular)    | $0.55  | $2.25  | Standard       | Universal fallback - NOT thinking variant |
| OSS 20B              | $0.20  | $0.20  | 128K           | Stage 4 Analysis (phases 1,2,4,6)         |
| OSS 120B             | $0.20  | $0.20  | 128K           | Stage 4 Analysis (phase 3)                |

---

## 🎯 Ключевые Выводы

1. **Language-aware routing** - разные модели для RU и EN/Other языков
2. **Qwen3 235B (regular, NOT thinking)** - primary для RU (17-35x faster, 100% надежность)
3. **DeepSeek Terminus** - primary для EN и других языков (100% стабильность, отличное качество)
4. **Grok 4 Fast** - для задач с большим контекстом (2M токенов входящих)
5. **Kimi K2 (regular, NOT thinking)** - премиум fallback для сложных случаев
6. **Stage 6 Content** - те же модели (Qwen3/DeepSeek/Kimi K2) подтверждены research (см. docs/research/010-stage6-generation-strategy/)
7. Thinking варианты НЕ используются нигде (performance degradation)

---

## 📈 Ожидаемые Результаты

**Качество** (language-aware routing):

- RU Metadata: 9.0/10 (Qwen3) → 9.5/10 (Kimi K2 fallback)
- EN Metadata: 9.0/10 (DeepSeek Terminus) → 9.2/10 (Kimi K2 fallback)
- RU Lessons: 9.2/10 (Qwen3) → 8.7/10 (Kimi K2 fallback)
- EN Lessons: 8.8/10 (DeepSeek Terminus) → 8.8/10 (Kimi K2 fallback)

**Надежность**: 100% для primary моделей, 100% для Kimi K2 fallback

---

**Утверждено**: 2025-11-13
**Последнее обновление**: 2025-11-22 (language-aware routing, исправлен fallback на Kimi K2 regular, Stage 6 модели подтверждены research)
**Следующий пересмотр**: По мере накопления production данных
