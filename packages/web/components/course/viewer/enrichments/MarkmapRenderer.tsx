'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { IPureNode } from 'markmap-common'
import { Markmap, deriveOptions } from 'markmap-view'
import { useThemeSync } from '@/lib/hooks/use-theme-sync'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AUTO_FOLD_DEPTH } from '@/lib/helpers/mindmap-transform'
import { cn } from '@/lib/utils'

const LIGHT_COLORS = [
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#dc2626', // red-600
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  '#c026d3', // fuchsia-600
  '#65a30d', // lime-600
]

const DARK_COLORS = [
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f87171', // red-400
  '#a78bfa', // violet-400
  '#22d3ee', // cyan-400
  '#e879f9', // fuchsia-400
  '#a3e635', // lime-400
]

interface MarkmapRendererProps {
  data: IPureNode
  fitToViewLabel?: string
  className?: string
}

export function MarkmapRenderer({ data, fitToViewLabel, className }: MarkmapRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const mmRef = useRef<Markmap | null>(null)
  const { resolvedTheme, mounted } = useThemeSync()

  const isDark = resolvedTheme === 'dark'

  const handleFit = useCallback(() => {
    void mmRef.current?.fit()
  }, [])

  // Effect 1: Create markmap instance on mount, destroy on unmount
  useEffect(() => {
    if (!mounted || !svgRef.current) return

    const svg = svgRef.current
    // Defensive clear: handles cases where cleanup didn't run (e.g., React Strict Mode)
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild)
    }

    const opts = deriveOptions({
      color: isDark ? DARK_COLORS : LIGHT_COLORS,
      colorFreezeLevel: 2,
      duration: 300,
      zoom: true,
      pan: true,
      initialExpandLevel: AUTO_FOLD_DEPTH,
      spacingHorizontal: 80,
      spacingVertical: 5,
      maxWidth: 300,
    })

    const mm = Markmap.create(
      svg,
      {
        ...opts,
        autoFit: true,
      },
      data
    )

    mmRef.current = mm

    return () => {
      mm.destroy()
      mmRef.current = null
    }
    // Only recreate when SVG becomes available (mounted).
    // Data and theme updates are handled by separate effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: data & isDark handled by Effects 2 & 3 to preserve zoom/pan state
  }, [mounted])

  // Effect 2: Update data without destroying instance (preserves zoom/pan state)
  useEffect(() => {
    const mm = mmRef.current
    if (!mm) return
    void mm.setData(data).then(() => mm.fit())
  }, [data])

  // Effect 3: Update colors on theme change without destroying instance
  useEffect(() => {
    const mm = mmRef.current
    if (!mm) return
    const colorOpts = deriveOptions({
      color: isDark ? DARK_COLORS : LIGHT_COLORS,
      colorFreezeLevel: 2,
    })
    mm.setOptions(colorOpts)
    void mm.renderData()
  }, [isDark])

  // Effect 4: Re-fit on container resize (e.g. inline ↔ fullscreen toggle)
  useEffect(() => {
    if (!mounted) return
    const container = svgRef.current?.parentElement
    if (!container) return

    const ro = new ResizeObserver(() => {
      void mmRef.current?.fit()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [mounted])

  if (!mounted) {
    return (
      <div className={cn('flex items-center justify-center', className ?? 'min-h-[60vh]')}>
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        style={{
          color: isDark ? '#e2e8f0' : '#1e293b',
          touchAction: 'none',
        }}
        onWheel={(e) => e.stopPropagation()}
      />
      {fitToViewLabel && (
        <Button
          variant="outline"
          size="sm"
          className="absolute right-3 bottom-3 z-10 gap-1.5 opacity-80 hover:opacity-100"
          onClick={handleFit}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          {fitToViewLabel}
        </Button>
      )}
    </div>
  )
}

export default MarkmapRenderer
