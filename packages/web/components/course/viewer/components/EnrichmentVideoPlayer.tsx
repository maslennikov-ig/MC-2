'use client'

import { MediaPlayer, MediaProvider, Poster, type PlayerSrc } from '@vidstack/react'
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default'
import { formatVideoSrc } from '@/components/common/video-utils'
import { useVidstackTranslations } from '@/hooks/useVidstackTranslations'

interface EnrichmentVideoPlayerProps {
  src: string
  poster?: string
  alt?: string
  onError?: () => void
}

export default function EnrichmentVideoPlayer({
  src,
  poster,
  alt,
  onError,
}: EnrichmentVideoPlayerProps) {
  const vidstackTranslations = useVidstackTranslations()

  return (
    <MediaPlayer
      src={formatVideoSrc(src) as PlayerSrc}
      playsInline
      className="h-full w-full"
      onError={onError}
    >
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
        seekStep={10}
      />
    </MediaPlayer>
  )
}
