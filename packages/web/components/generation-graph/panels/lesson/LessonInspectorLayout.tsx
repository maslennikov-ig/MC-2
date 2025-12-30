'use client';

import React from 'react';
import { ArrowLeft, X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';

interface LessonInspectorLayoutProps {
  moduleNumber: number;
  lessonNumber: number;
  lessonTitle: string;
  onBack: () => void;
  onClose: () => void;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  className?: string;
  /** Hide the header (when used inside tabbed container that provides its own header) */
  hideHeader?: boolean;
}

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
  return (
    <div
      className={`flex flex-col h-full w-full bg-white dark:bg-slate-900 ${className}`}
      data-testid="lesson-inspector-layout"
    >
      {/* Header - can be hidden when parent provides its own header */}
      {!hideHeader && (
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="h-9 w-9 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            aria-label={`Back to Module ${moduleNumber}`}
            data-testid="back-button"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              Модуль {moduleNumber}
            </span>
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
              className="h-9 w-9 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
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
            className="h-9 w-9 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            aria-label="Close lesson inspector"
            data-testid="close-button"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>
      )}

      {/* Split View Container using ResizablePanel */}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 min-h-0"
      >
        {/* Left Panel: Pipeline (collapsible, default 30%) */}
        <ResizablePanel
          defaultSize={30}
          minSize={15}
          maxSize={50}
          collapsible={true}
          collapsedSize={0}
          className="bg-slate-50 dark:bg-slate-800/50"
        >
          <div className="h-full overflow-y-auto" data-testid="pipeline-panel">
            {leftPanel}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel: Content Preview (70%, expands when left collapsed) */}
        <ResizablePanel
          defaultSize={70}
          minSize={50}
          className="bg-white dark:bg-slate-900"
        >
          <div className="h-full overflow-hidden" data-testid="content-panel">
            {rightPanel}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
