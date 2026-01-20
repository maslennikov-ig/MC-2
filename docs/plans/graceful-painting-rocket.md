# Fix: Navigation "Open Course" Button Returns to Workflow

## Problem

При клике на кнопку "Открыть курс" в success popup завершения генерации:

1. Preloader показывается и проигрывается (5 сек timeout)
2. Пользователь остаётся на workflow странице
3. После F5 (hard reload) - курс открывается нормально

**Локаль тестирования**: Русская (default)

## Root Cause Analysis

В файле `GenerationProgressContainerEnhanced.tsx` используется **неправильный Link компонент**:

```tsx
// Строка 6 - НЕПРАВИЛЬНО
import Link from 'next/link';

// Строка 904 - использует неправильный Link
<Button asChild>
  <Link href={`/courses/${slug}`}>{t('viewCourse')}</Link>
</Button>;
```

**Почему это проблема:**

1. `Link from 'next/link'` не интегрирован с next-intl router
2. SPA навигация не происходит корректно в контексте i18n приложения
3. `Link from '@/src/i18n/navigation'` создаётся через `createNavigation(routing)` и правильно работает с Next.js AppRouter

**Доказательство**: В `GenerationErrorBoundary.tsx` (тот же app) используется правильный `Link from '@/src/i18n/navigation'` и навигация работает.

## Solution

### Primary Fix (1 file)

**File**: `packages/web/app/[locale]/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`

```diff
- import Link from 'next/link'
+ import { Link } from '@/src/i18n/navigation'
```

Это единственное изменение. Строка 904 (`<Link href={...}>`) будет работать корректно после замены импорта.

### Secondary (audit other files)

Файлы с `import Link from 'next/link'` для проверки:

| File                | Status                                   |
| ------------------- | ---------------------------------------- |
| `GraphHeader.tsx`   | Нужна проверка - навигация на /courses   |
| `BreadcrumbNav.tsx` | Вероятно ok - внутренняя навигация курса |
| `logo.tsx`          | Вероятно ok - домашняя страница          |

## Verification

1. `pnpm type-check` - убедиться что нет TS ошибок
2. Сгенерировать курс до завершения
3. Кликнуть "Открыть курс" в success popup
4. **Ожидаемый результат**: навигация на `/courses/{slug}` без возврата на workflow

## Related History

- `ca96b58` - Fix Link+Button nesting (не решило эту проблему)
- `5ac8d5f` - Fix Link+Button across generation-graph (не решило эту проблему)

Те коммиты исправили HTML nesting (`<a><button>`), но не исправили неправильный import Link.
