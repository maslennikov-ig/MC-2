# План: Унификация системы уведомлений

## Исследование (подтверждено)

Проведено полное исследование:

- ✅ 65 файлов используют Sonner (`from 'sonner'` или `from '@/lib/toast'`)
- ✅ Единственный `<Toaster />` в `app/[locale]/layout.tsx:320`
- ✅ Нет других toast библиотек (react-hot-toast, react-toastify, notistack не используются)
- ✅ `lib/toast.ts` — обёртка над Sonner
- ✅ `MissionControlBanner.tsx` — панель управления workflow, не toast
- ✅ `SelectionToolbar.tsx` — toolbar внизу, не toast
- ✅ `LongRunningIndicator.tsx` — banner вверху по центру (информационный), не toast
- ✅ Web Push notifications (`use-push-notifications.ts`) — уведомления ОС, не UI toast

## Проблема

В проекте используются **две разные системы** уведомлений:

| Система               | Позиция             | Где используется                                 |
| --------------------- | ------------------- | ------------------------------------------------ |
| **Sonner** (основная) | Правый нижний угол  | Везде в приложении                               |
| **Кастомная** (Alert) | Правый верхний угол | Только `GenerationProgressContainerEnhanced.tsx` |

Это создаёт inconsistent UX — пользователь видит уведомления в разных местах экрана.

## Решение

Удалить кастомную toast систему и использовать **единый Sonner** для всех уведомлений (правый нижний угол).

## Изменения

### Файл: `packages/web/app/[locale]/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`

**1. Добавить импорт:**

```typescript
import { toast } from 'sonner';
```

**2. Удалить из типа `Action`:**

```typescript
| { type: 'SHOW_TOAST'; payload: { type: 'success' | 'error' | 'warning' | 'info'; message: string } }
| { type: 'CLEAR_TOAST' }
```

**3. Удалить из `State`:**

```typescript
toast: { type: 'success' | 'error' | 'warning' | 'info'; message: string } | null
```

**4. Удалить из initialState:**

```typescript
toast: null,
```

**5. Удалить cases из reducer:**

- `case 'SHOW_TOAST'`
- `case 'CLEAR_TOAST'`

**6. Удалить восстановление toast из localStorage:**

```typescript
toast: null, // Don't restore toasts (строка ~263)
```

**7. Удалить `toastTimeout` ref и cleanup:**

```typescript
const toastTimeout = useRef<NodeJS.Timeout | null>(null);
// ... cleanup в useEffect
```

**8. Удалить функцию `showToast`:**

```typescript
const showToast = useCallback((type: ..., message: string) => { ... }, [])
```

**9. Удалить рендеринг кастомного toast (строки ~891-913):**

```tsx
{/* Toast notifications */}
<AnimatePresence>
  {state.toast && ( ... )}
</AnimatePresence>
```

**10. Заменить все вызовы `showToast()` на Sonner:**

| Было                        | Стало                |
| --------------------------- | -------------------- |
| `showToast('success', msg)` | `toast.success(msg)` |
| `showToast('error', msg)`   | `toast.error(msg)`   |
| `showToast('warning', msg)` | `toast.warning(msg)` |
| `showToast('info', msg)`    | `toast.info(msg)`    |

Список замен (~20 вызовов):

- Строка 323: `toast.success('Генерация запущена!')`
- Строка 326: `toast.success(\`Stage ${awaitingStage} approved...\`)`
- Строка 329: `toast.error(...)` — запуск/одобрение
- Строка 341: `toast.info('Mission aborted.')`
- Строка 343: `toast.error('Failed to cancel generation')`
- Строка 421: `toast.warning('Генерация уже приостановлена')`
- Строка 426: `toast.warning('Генерация уже завершена')`
- Строка 442: `toast.info('Генерация приостановлена')`
- Строка 444: `toast.error('Не удалось приостановить генерацию')`
- Строка 453: `toast.warning('Генерация не приостановлена')`
- Строка 469: `toast.success('Генерация продолжена')`
- Строка 471: `toast.error('Не удалось продолжить генерацию')`
- Строка 481: `toast.info('Генерация отменена')`
- Строка 483: `toast.error('Не удалось отменить генерацию')`
- Строка 491: `toast.success(data?.message || 'Переключено в ручной режим')`
- Строка 493: `toast.error('Не удалось переключить в ручной режим')`
- Строка 608: `toast.error(\`Step failed: ${failedStep.name}...\`)`
- Строка 638: `toast.success('Course generated successfully!')`
- Строка 656: `toast.error('Course generation failed...')`
- Строка 698: `toast.warning('Connection issues detected...')`

## Результат

- Все уведомления появляются в **правом нижнем углу**
- Единый UI/UX для всех toast'ов (цвета, анимации, кнопка закрытия)
- Меньше кода — удалён дублирующий reducer logic

## Проверка

1. `pnpm type-check` — проверка TypeScript
2. `pnpm build` — сборка проекта
3. Ручное тестирование:
   - Открыть страницу генерации курса
   - Запустить/приостановить/отменить генерацию
   - Убедиться что все toast'ы появляются в правом нижнем углу
