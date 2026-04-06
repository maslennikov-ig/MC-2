'use client'

import React from 'react'
import type { GroupImperativeHandle } from 'react-resizable-panels'
import { ArrowLeft, X, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { createLogger } from '@/lib/client-logger'
import {
  assessLessonInspectorLayout,
  LESSON_INSPECTOR_DEFAULT_LAYOUT,
  LESSON_INSPECTOR_PANEL_IDS,
} from './LessonInspectorLayout.measurements'

interface LessonInspectorLayoutProps {
  moduleNumber: number
  lessonNumber: number
  lessonTitle: string
  onBack: () => void
  onClose: () => void
  leftPanel: React.ReactNode
  rightPanel: React.ReactNode
  isMaximized?: boolean
  onToggleMaximize?: () => void
  className?: string
  /** Hide the header (when used inside tabbed container that provides its own header) */
  hideHeader?: boolean
}

const log = createLogger({ component: 'LessonInspectorLayout' })

export const LessonInspectorLayout: React.FC<LessonInspectorLayoutProps> = ({
  moduleNumber,
  lessonNumber,
  lessonTitle,
  onBack,
  onClose,
  leftPanel,
  rightPanel,
  isMaximized = false,
  onToggleMaximize,
  className = '',
  hideHeader = false,
}) => {
  const [useFixedLayout, setUseFixedLayout] = React.useState(false)
  const groupRef = React.useRef<GroupImperativeHandle | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const leftPanelRef = React.useRef<HTMLDivElement | null>(null)
  const rightPanelRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    setUseFixedLayout(false)
  }, [moduleNumber, lessonNumber, isMaximized])

  React.useEffect(() => {
    if (useFixedLayout) {
      return
    }

    let isDisposed = false
    let frameId: number | null = null
    const attemptedRecovery = { current: false }
    const loggedFallback = { current: false }

    const validateLayout = () => {
      if (isDisposed) {
        return
      }

      frameId = null

      const assessment = assessLessonInspectorLayout({
        container: containerRef.current,
        leftPanel: leftPanelRef.current,
        rightPanel: rightPanelRef.current,
      })

      if (!assessment.isReady) {
        return
      }

      if (assessment.isValid) {
        return
      }

      if (!attemptedRecovery.current) {
        attemptedRecovery.current = true
        groupRef.current?.setLayout(LESSON_INSPECTOR_DEFAULT_LAYOUT)
        scheduleValidation()
        return
      }

      setUseFixedLayout(true)

      if (!loggedFallback.current) {
        loggedFallback.current = true
        log.warn(
          'Falling back to fixed lesson inspector split after invalid resizable measurements',
          {
            reason: assessment.reason,
            measurements: assessment.measurements,
          }
        )
      }
    }

    const scheduleValidation = () => {
      if (isDisposed) {
        return
      }

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(validateLayout)
    }

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleValidation())

    ;[containerRef.current, leftPanelRef.current, rightPanelRef.current].forEach((element) => {
      if (element) {
        resizeObserver?.observe(element)
      }
    })

    scheduleValidation()

    return () => {
      isDisposed = true

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      resizeObserver?.disconnect()
    }
  }, [moduleNumber, lessonNumber, useFixedLayout])

  const renderLeftPanel = () => (
    <div className="h-full overflow-y-auto" data-testid="pipeline-panel">
      {leftPanel}
    </div>
  )

  const renderRightPanel = () => (
    <div className="h-full overflow-hidden" data-testid="content-panel">
      {rightPanel}
    </div>
  )

  return (
    <div
      className={`flex h-full w-full flex-col bg-white dark:bg-slate-900 ${className}`}
      data-testid="lesson-inspector-layout"
    >
      {/* Header - can be hidden when parent provides its own header */}
      {!hideHeader && (
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-9 w-9 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              aria-label={`Back to Module ${moduleNumber}`}
              data-testid="back-button"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Модуль {moduleNumber}</span>
              <span className="text-slate-400 dark:text-slate-600">/</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                Урок {lessonNumber}: {lessonTitle}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onToggleMaximize && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleMaximize}
                className="h-9 w-9 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                aria-label={isMaximized ? 'Minimize' : 'Maximize'}
              >
                {isMaximized ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-9 w-9 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              aria-label="Close lesson inspector"
              data-testid="close-button"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>
      )}

      {useFixedLayout ? (
        <div className="flex min-h-0 flex-1" data-testid="lesson-inspector-fixed-layout">
          <div
            className="min-h-0 shrink-0 bg-slate-50 dark:bg-slate-800/50"
            style={{ flexBasis: '30%', minWidth: '15%', maxWidth: '50%' }}
          >
            {renderLeftPanel()}
          </div>

          <div className="bg-border relative flex w-px shrink-0 justify-center" aria-hidden="true">
            <div className="bg-border z-10 my-auto flex h-4 w-3 items-center justify-center rounded-sm border" />
          </div>

          <div className="min-h-0 min-w-0 flex-1 bg-white dark:bg-slate-900">
            {renderRightPanel()}
          </div>
        </div>
      ) : (
        <ResizablePanelGroup
          direction="horizontal"
          defaultLayout={LESSON_INSPECTOR_DEFAULT_LAYOUT}
          groupRef={groupRef}
          elementRef={containerRef}
          className="min-h-0 flex-1"
          data-testid="lesson-inspector-resizable-layout"
        >
          <ResizablePanel
            id={LESSON_INSPECTOR_PANEL_IDS.left}
            defaultSize={30}
            minSize={15}
            maxSize={50}
            collapsible={true}
            collapsedSize={0}
            elementRef={leftPanelRef}
            className="bg-slate-50 dark:bg-slate-800/50"
            data-testid="lesson-inspector-resizable-left-panel"
          >
            {renderLeftPanel()}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            id={LESSON_INSPECTOR_PANEL_IDS.right}
            defaultSize={70}
            minSize={50}
            elementRef={rightPanelRef}
            className="bg-white dark:bg-slate-900"
            data-testid="lesson-inspector-resizable-right-panel"
          >
            {renderRightPanel()}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}
