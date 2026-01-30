# План: UX улучшение выбора режима в RefinementChat

## Проблема

1. **Непонятно, что нужно выбрать режим** — изначально ничего не выбрано
2. **Нет объяснения разницы** между режимами "Уточнить" и "Перегенерировать"

## Решение

### 1. "Уточнить" по умолчанию

Выбирать режим "refine" при инициализации компонента. Это решает проблему пустого выбора.

### 2. Tooltips для режимов

Добавить всплывающие подсказки на каждый режим:

| Режим                | Tooltip                                                    |
| -------------------- | ---------------------------------------------------------- |
| **Уточнить**         | "Небольшие правки текущего контента. Быстро (~2K токенов)" |
| **Перегенерировать** | "Полное пересоздание с нуля. Дольше (~20K токенов)"        |

## Файлы для изменения

| Файл                                                                 | Изменение                                     |
| -------------------------------------------------------------------- | --------------------------------------------- |
| `packages/web/components/generation-graph/panels/RefinementChat.tsx` | Default state + tooltips                      |
| `packages/web/messages/ru/generation.json`                           | Добавить `refineTooltip`, `regenerateTooltip` |
| `packages/web/messages/en/generation.json`                           | Добавить английские версии                    |

## Реализация

### RefinementChat.tsx

```tsx
// Добавить импорт
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Изменить начальное значение с null на 'refine'
const [selectedIntent, setSelectedIntent] = useState<ChatIntent | null>('refine')

// ToggleGroup с tooltips
<TooltipProvider delayDuration={300}>
  <ToggleGroup
    type="single"
    value={selectedIntent ?? ''}
    onValueChange={(value) => {
      if (value === 'refine' || value === 'regenerate') {
        setSelectedIntent(value)
      }
    }}
    aria-label={t('refinementChat.modes.modeSelectionLabel')}
    className="justify-start"
    disabled={isProcessing}
  >
    <Tooltip>
      <TooltipTrigger asChild>
        <ToggleGroupItem
          value="refine"
          aria-label={t('refinementChat.modes.refineAriaLabel')}
          className="h-8 text-xs"
        >
          <Wand2 className="mr-1 h-3 w-3" />
          {t('refinementChat.modes.refine')} (~2K)
        </ToggleGroupItem>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs max-w-[200px]">{t('refinementChat.modes.refineTooltip')}</p>
      </TooltipContent>
    </Tooltip>

    <Tooltip>
      <TooltipTrigger asChild>
        <ToggleGroupItem
          value="regenerate"
          aria-label={t('refinementChat.modes.regenerateAriaLabel')}
          className="h-8 text-xs"
        >
          <RefreshCcw className="mr-1 h-3 w-3" />
          {t('refinementChat.modes.regenerate')} (~20K)
        </ToggleGroupItem>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs max-w-[200px]">{t('refinementChat.modes.regenerateTooltip')}</p>
      </TooltipContent>
    </Tooltip>
  </ToggleGroup>
</TooltipProvider>
```

### Переводы

**ru/generation.json** (добавить в `refinementChat.modes`):

```json
"refineTooltip": "Небольшие правки текущего контента. Быстро (~2K токенов)",
"regenerateTooltip": "Полное пересоздание с нуля. Дольше (~20K токенов)"
```

**en/generation.json** (добавить в `refinementChat.modes`):

```json
"refineTooltip": "Small edits to current content. Fast (~2K tokens)",
"regenerateTooltip": "Full recreation from scratch. Slower (~20K tokens)"
```

## Верификация

1. **Type-check**: `pnpm type-check`
2. **Build**: `pnpm build`
3. **Manual test**:
   - Открыть Stage 4/5/6 node drawer
   - Режим "Уточнить" должен быть выбран сразу
   - Навести на "Уточнить" — появляется tooltip
   - Навести на "Перегенерировать" — появляется tooltip
   - Можно сразу отправить сообщение (режим уже выбран)
