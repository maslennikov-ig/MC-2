import React, { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { TraceViewer } from '@/components/generation-monitoring/trace-viewer'
import { GenerationTimeline } from '@/components/generation-monitoring/generation-timeline'
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider'
import { useFullscreenContext } from '../contexts/FullscreenContext'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const { traces } = useGenerationRealtime()
  const { portalContainerRef } = useFullscreenContext()
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Filtering logic
  const filteredTraces = traces.filter((t) => {
    if (stageFilter !== 'all' && t.stage !== stageFilter) return false
    if (statusFilter === 'error' && !t.error_data) return false
    if (statusFilter === 'success' && t.error_data) return false
    return true
  })

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="left"
        className="flex w-[90vw] flex-col bg-white p-0 sm:max-w-[1000px] dark:bg-slate-900"
        container={portalContainerRef.current}
        data-testid="admin-panel"
      >
        <SheetHeader className="border-b border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between pr-8">
            <div>
              <SheetTitle>Admin Monitor</SheetTitle>
              <SheetDescription>Inspect generation internals and trace logs.</SheetDescription>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 flex gap-2">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[150px]" data-testid="filter-stage">
                <SelectValue placeholder="Filter Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="stage_1">Stage 1</SelectItem>
                <SelectItem value="stage_2">Stage 2</SelectItem>
                <SelectItem value="stage_3">Stage 3</SelectItem>
                <SelectItem value="stage_4">Stage 4</SelectItem>
                <SelectItem value="stage_5">Stage 5</SelectItem>
                <SelectItem value="stage_6">Stage 6</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            {(stageFilter !== 'all' || statusFilter !== 'all') && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setStageFilter('all')
                  setStatusFilter('all')
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Timeline Column */}
          <div className="w-1/3 overflow-y-auto border-r border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <GenerationTimeline traces={filteredTraces} />
          </div>

          {/* Viewer Column */}
          <div className="w-2/3 overflow-y-auto bg-white p-4 dark:bg-slate-900">
            <TraceViewer />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
