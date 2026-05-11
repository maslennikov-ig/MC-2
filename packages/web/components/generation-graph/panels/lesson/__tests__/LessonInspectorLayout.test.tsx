import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { LessonInspectorLayout } from '../LessonInspectorLayout'

const resizableMocks = vi.hoisted(() => ({
  getLayout: vi.fn(() => ({
    'lesson-inspector-pipeline': 30,
    'lesson-inspector-content': 70,
  })),
  setLayout: vi.fn((layout: Record<string, number>) => layout),
}))

vi.mock('@/components/ui/resizable', async () => {
  const React = await import('react')

  const ResizablePanelGroup = ({
    children,
    groupRef,
    elementRef,
    defaultLayout: _defaultLayout,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    groupRef?: React.Ref<{
      getLayout: () => Record<string, number>
      setLayout: (layout: Record<string, number>) => Record<string, number>
    }>
    elementRef?: React.Ref<HTMLDivElement>
    defaultLayout?: Record<string, number>
  }) => {
    React.useImperativeHandle(groupRef, () => resizableMocks, [])

    return (
      <div ref={elementRef} {...props}>
        {children}
      </div>
    )
  }

  const ResizablePanel = ({
    children,
    elementRef,
    defaultSize: _defaultSize,
    minSize: _minSize,
    maxSize: _maxSize,
    collapsible: _collapsible,
    collapsedSize: _collapsedSize,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    elementRef?: React.Ref<HTMLDivElement>
    defaultSize?: number
    minSize?: number
    maxSize?: number
    collapsible?: boolean
    collapsedSize?: number
  }) => (
    <div ref={elementRef} {...props}>
      {children}
    </div>
  )

  const ResizableHandle = ({
    withHandle: _withHandle,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    withHandle?: boolean
  }) => <div {...props} />

  return {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
  }
})

type RectMap = Record<string, Partial<DOMRect>>

const ZERO_RECT: DOMRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
}

const defaultProps = {
  moduleNumber: 4,
  lessonNumber: 1,
  lessonTitle: 'Completed lesson',
  onBack: vi.fn(),
  onClose: vi.fn(),
  leftPanel: <div>Pipeline</div>,
  rightPanel: <div>Preview</div>,
}

describe('LessonInspectorLayout', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window)
  const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window)
  let rectMap: RectMap = {}

  function mockRects(nextRectMap: RectMap) {
    rectMap = nextRectMap

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const testId = this.getAttribute('data-testid') ?? ''
      const rect = rectMap[testId]

      if (!rect) {
        return ZERO_RECT
      }

      return {
        ...ZERO_RECT,
        ...rect,
        top: rect.top ?? 0,
        right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
        bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
        left: rect.left ?? 0,
        toJSON: () => rect,
      } satisfies DOMRect
    })
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    resizableMocks.getLayout.mockClear()
    resizableMocks.setLayout.mockReset()
    resizableMocks.setLayout.mockImplementation((layout: Record<string, number>) => layout)
    window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      window.setTimeout(
        () => callback(performance.now()),
        0
      )) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = ((handle: number) =>
      window.clearTimeout(handle)) as typeof window.cancelAnimationFrame
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
  })

  it('keeps the resizable split when measurements are valid', async () => {
    mockRects({
      'lesson-inspector-resizable-layout': { width: 1200, height: 800 },
      'lesson-inspector-resizable-left-panel': { width: 360, height: 800 },
      'lesson-inspector-resizable-right-panel': { width: 840, height: 800 },
    })

    render(<LessonInspectorLayout {...defaultProps} />)

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(screen.getByTestId('lesson-inspector-resizable-layout')).toBeInTheDocument()
    expect(screen.queryByTestId('lesson-inspector-fixed-layout')).not.toBeInTheDocument()
  })

  it('keeps the resizable split when recovery restores a usable preview panel', async () => {
    mockRects({
      'lesson-inspector-resizable-layout': { width: 1200, height: 800 },
      'lesson-inspector-resizable-left-panel': { width: 0, height: 0 },
      'lesson-inspector-resizable-right-panel': { width: 0, height: 0 },
    })

    resizableMocks.setLayout.mockImplementationOnce((layout: Record<string, number>) => {
      rectMap = {
        'lesson-inspector-resizable-layout': { width: 1200, height: 800 },
        'lesson-inspector-resizable-left-panel': { width: 360, height: 800 },
        'lesson-inspector-resizable-right-panel': { width: 840, height: 800 },
      }

      return layout
    })

    render(<LessonInspectorLayout {...defaultProps} />)

    await waitFor(() => {
      expect(resizableMocks.setLayout).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('lesson-inspector-resizable-layout')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('lesson-inspector-fixed-layout')).not.toBeInTheDocument()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('switches to the fixed fallback when measurements stay invalid after recovery', async () => {
    mockRects({
      'lesson-inspector-resizable-layout': { width: 1200, height: 800 },
      'lesson-inspector-resizable-left-panel': { width: 0, height: 0 },
      'lesson-inspector-resizable-right-panel': { width: 0, height: 0 },
    })

    render(<LessonInspectorLayout {...defaultProps} />)

    await waitFor(() => {
      expect(resizableMocks.setLayout).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('lesson-inspector-fixed-layout')).toBeInTheDocument()
    })

    expect(console.warn).toHaveBeenCalled()
  })

  it('keeps the resizable split when the left panel is intentionally collapsed', async () => {
    mockRects({
      'lesson-inspector-resizable-layout': { width: 1200, height: 800 },
      'lesson-inspector-resizable-left-panel': { width: 0, height: 800 },
      'lesson-inspector-resizable-right-panel': { width: 1200, height: 800 },
    })

    render(<LessonInspectorLayout {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('lesson-inspector-resizable-layout')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('lesson-inspector-fixed-layout')).not.toBeInTheDocument()
    expect(resizableMocks.setLayout).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })
})
