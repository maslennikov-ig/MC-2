# Fix: Intermittent "Failed to load chunk" for media-captions in Turbopack dev

## Context

При навигации на страницу урока в dev-режиме (`pnpm dev` = Next.js 15.5.12 + Turbopack) периодически:

```
Failed to load chunk /_next/static/chunks/342f9_media-captions_dist_dev_43a86b31._.js
```

**Причина:** `media-captions@1.0.4` — транзитивная зависимость `@vidstack/react@1.12.13`. Turbopack выделяет её в async chunk. При навигации на роут все 3 компонента с видеоплеером статически импортируют vidstack → Turbopack пытается загрузить `media-captions` chunk на уровне роута. Если dev-сервер занят HMR/компиляцией — chunk не отдаётся вовремя → ошибка.

**Решение:** Dynamic import видеоплееров → `media-captions` загружается по требованию компонента, а не при навигации на роут.

## Changes

### 1. `components/common/lesson-materials-switcher.tsx`

**Текущий импорт (строка 15):**

```tsx
import PersistentVideoPlayer from './persistent-video-player'
```

**Заменить на:**

```tsx
import dynamic from 'next/dynamic'

const PersistentVideoPlayer = dynamic(() => import('./persistent-video-player'), { ssr: false })
```

Компонент `PersistentVideoPlayer` — чисто клиентский (drag, resize, browser Media APIs). SSR для него не нужен.

### 2. `components/course/viewer/components/LessonView.tsx`

**Текущий импорт (строка 14):**

```tsx
import ContentFormatSwitcher from '@/components/common/content-format-switcher'
```

**Заменить на:**

```tsx
import dynamic from 'next/dynamic'

const ContentFormatSwitcher = dynamic(() => import('@/components/common/content-format-switcher'), {
  ssr: false,
})
```

`ContentFormatSwitcher` использует `MediaPlayer` для видео и аудио. Весь компонент client-only.

### 3. `components/course/viewer/components/EnrichmentCard.tsx`

Этот компонент сложнее — он рендерит разные типы обогащений (video, audio, quiz, presentation). Нельзя dynamic-import всю карточку, т.к. она нужна и для не-видео типов.

**Решение:** Извлечь vidstack-рендеринг в отдельный компонент, dynamic-import его.

#### 3a. Создать `components/course/viewer/components/EnrichmentVideoPlayer.tsx`

Новый тонкий компонент, который инкапсулирует все vidstack-импорты:

```tsx
'use client'

import { MediaPlayer, MediaProvider, Poster } from '@vidstack/react'
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default'
import { formatVideoSrc } from '@/components/common/video-utils'
import { useVidstackTranslations } from '@/hooks/useVidstackTranslations'

interface EnrichmentVideoPlayerProps {
  src: string
  poster?: string
  alt?: string
}

export default function EnrichmentVideoPlayer({ src, poster, alt }: EnrichmentVideoPlayerProps) {
  const vidstackTranslations = useVidstackTranslations()

  return (
    <MediaPlayer src={formatVideoSrc(src) as any} playsInline className="h-full w-full">
      <MediaProvider>
        {poster && (
          <Poster
            className="absolute inset-0 block h-full w-full opacity-0 transition-opacity data-[visible]:opacity-100 [&>img]:h-full [&>img]:w-full [&>img]:object-cover"
            src={poster}
            alt={alt || 'Video'}
          />
        )}
      </MediaProvider>
      <DefaultVideoLayout
        icons={defaultLayoutIcons}
        translations={vidstackTranslations}
        playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 2]}
      />
    </MediaPlayer>
  )
}
```

#### 3b. В `EnrichmentCard.tsx`

Убрать статические импорты vidstack:

```diff
- import { MediaPlayer, MediaProvider, Poster } from '@vidstack/react'
- import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default'
- import { formatVideoSrc } from '@/components/common/video-utils'
- import { useVidstackTranslations } from '@/hooks/useVidstackTranslations'
+ import dynamic from 'next/dynamic'
+
+ const EnrichmentVideoPlayer = dynamic(
+   () => import('./EnrichmentVideoPlayer'),
+   { ssr: false }
+ )
```

Заменить inline `<MediaPlayer>` JSX на `<EnrichmentVideoPlayer src={playbackUrl} poster={placeholderImage} alt={label} />`.

## Files to Modify

1. `packages/web/components/common/lesson-materials-switcher.tsx` — dynamic import (2 строки)
2. `packages/web/components/course/viewer/components/LessonView.tsx` — dynamic import (2 строки)
3. `packages/web/components/course/viewer/components/EnrichmentCard.tsx` — replace vidstack imports with dynamic EnrichmentVideoPlayer
4. **NEW** `packages/web/components/course/viewer/components/EnrichmentVideoPlayer.tsx` — extracted vidstack wrapper

## What NOT to Change

- `persistent-video-player.tsx` — сам компонент не трогаем, только его импорт в parent
- `content-format-switcher.tsx` — сам компонент не трогаем, только его импорт в parent
- Layout CSS imports (`@vidstack/react/player/styles/...`) в `layout.tsx` — оставляем, CSS не вызывает chunk loading issues

## Verification

1. `pnpm dev` → navigate to lesson page 10+ times, no "Failed to load chunk" errors
2. Video player renders correctly on lesson page (all 3 usages)
3. Audio player works in ContentFormatSwitcher
4. EnrichmentCard works for non-video types (quiz, presentation) without loading vidstack
5. `pnpm type-check` passes
6. `pnpm build` passes
7. `cd packages/web && pnpm test` — existing tests pass
