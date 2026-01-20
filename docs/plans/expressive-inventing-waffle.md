# План: Оптимизация расходов на GPT Image Mini

## Проблема

Высокий расход на модель `openai/gpt-5-image-mini` для генерации карточек курсов и уроков.

## Исследование

### Текущая реализация

**Файлы:**

- `packages/course-gen-platform/src/stages/stage7-enrichments/services/image-generation-service.ts` - основной сервис
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/card-handler.ts` - хендлер карточек
- `packages/course-gen-platform/src/shared/prompts/prompt-registry.ts:1507-1632` - промпты

**Текущие параметры:**

- Модель: `openai/gpt-5-image-mini`
- Размер: 1024x1024 (фиксированный для этой модели)
- Quality: **НЕ ПЕРЕДАЕТСЯ** (используется default)
- Промпты: ~2500-3000 символов (~750 input tokens)

### Ценообразование OpenRouter для gpt-5-image-mini

| Тип                     | Цена                                   |
| ----------------------- | -------------------------------------- |
| **Input tokens**        | **$2.50 / 1M tokens** (дороже output!) |
| Output tokens           | $2.00 / 1M tokens                      |
| **Image output tokens** | $8.00 / 1M tokens                      |

### Расчет текущей стоимости

**Input (промпт ~750 tokens):**

- 750 × $2.50 / 1M = **$0.001875**

**Image output (зависит от quality):**

| Quality | Image tokens | Цена image output | **Итого за карточку** |
| ------- | ------------ | ----------------- | --------------------- |
| **low** | ~272         | $0.002            | **~$0.004**           |
| medium  | ~1000        | $0.008            | ~$0.010               |
| high    | ~4000+       | $0.032+           | **~$0.034+**          |

**Вывод:** Без указания quality вероятно используется medium/high, что объясняет высокий расход.

## Решение

### 1. Добавить параметр `quality: "low"` для карточек

Карточки отображаются как маленькие превью (150-200px), высокое качество не нужно.

**Файл:** `image-generation-service.ts`

```typescript
// Добавить в ImageGenerationOptions
export interface ImageGenerationOptions {
  // ... существующие поля
  /** Image quality: 'low', 'medium', 'high' (default: 'low' for cards) */
  quality?: 'low' | 'medium' | 'high';
}

// В generateImage() добавить в requestOptions:
if (model.includes('gpt-5-image')) {
  requestOptions.quality = options.quality ?? 'low';
}
```

**Файл:** `card-handler.ts` - уже использует `generateCardImage()`, который можно обновить.

### 2. Сократить промпты (опционально)

Текущие промпты избыточно длинные. Можно сократить на ~50%:

**До:** ~2500 символов
**После:** ~1200 символов

Экономия: ~300 input tokens × $2.50/1M = ~$0.0007 на изображение (минорная)

### 3. Обновить расчет стоимости

Текущий hardcoded `MODEL_COSTS['openai/gpt-5-image-mini'] = 0.007` неточен.

Заменить на расчет по токенам или более точную оценку:

- Low quality: ~$0.002
- Medium quality: ~$0.008

## Ожидаемый эффект

| Метрика               | До                    | После      |
| --------------------- | --------------------- | ---------- |
| Quality               | medium/high (default) | low        |
| Image output tokens   | ~1000-4000            | ~272       |
| Стоимость за карточку | ~$0.008-0.032         | ~$0.002    |
| **Экономия**          | —                     | **75-94%** |

## Шаги реализации

1. **[image-generation-service.ts:93-104]** Добавить `quality` в `ImageGenerationOptions`
2. **[image-generation-service.ts:181-200]** Добавить `quality` в `requestOptions` для GPT моделей
3. **[image-generation-service.ts:352-358]** Обновить `generateCardImage()` с `quality: 'low'`
4. **[image-generation-service.ts:25-29]** Обновить `MODEL_COSTS` для более точной оценки
5. Тестирование: сгенерировать карточку и проверить качество

## Верификация (тестирование до/после)

### Этап 1: Замер текущей стоимости (ДО)

1. Сделать тестовый вызов API с текущими параметрами
2. Записать: input tokens, output tokens, image tokens, общую стоимость
3. Сохранить сгенерированное изображение для сравнения качества

### Этап 2: Реализация оптимизаций

1. Добавить `quality: "low"` для карточек
2. Сократить промпты (опционально)
3. Обновить расчет стоимости

### Этап 3: Замер новой стоимости (ПОСЛЕ)

1. Сделать тестовый вызов с теми же параметрами, но с оптимизациями
2. Записать: input tokens, output tokens, image tokens, общую стоимость
3. Сравнить качество изображения (визуально)
4. Посчитать экономию в %

### Этап 4: Отчет

- Таблица сравнения до/после
- Скриншоты изображений для сравнения качества
- Рекомендация: low vs medium

## Риски

- **Low quality может быть слишком низким** - если да, использовать `medium`
- **OpenRouter может не поддерживать quality** - проверить экспериментально

## Альтернативы (если quality не поддерживается)

1. Перейти на более дешевую модель (DALL-E 2, Stable Diffusion)
2. Использовать кэширование (не генерировать одинаковые карточки)
3. Уменьшить количество генерируемых карточек
