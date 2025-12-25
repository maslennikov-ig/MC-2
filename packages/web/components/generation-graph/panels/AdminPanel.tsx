import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { TraceViewer } from '@/components/generation-monitoring/trace-viewer';
import { GenerationTimeline } from '@/components/generation-monitoring/generation-timeline';
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider';
import { useFullscreenContext } from '../contexts/FullscreenContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const { traces } = useGenerationRealtime();
  const { portalContainerRef } = useFullscreenContext();
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filtering logic
  const filteredTraces = traces.filter(t => {
      if (stageFilter !== 'all' && t.stage !== stageFilter) return false;
      if (statusFilter === 'error' && !t.error_data) return false;
      if (statusFilter === 'success' && t.error_data) return false;
      return true;
  });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="left"
        className="w-[90vw] sm:max-w-[1000px] p-0 flex flex-col bg-white dark:bg-slate-900"
        container={portalContainerRef.current}
        data-testid="admin-panel"
      >
        <SheetHeader className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="flex justify-between items-center pr-8">
              <div>
                <SheetTitle>Admin Monitor</SheetTitle>
                <SheetDescription>Inspect generation internals and trace logs.</SheetDescription>
              </div>
          </div>
          
          {/* Filters */}
          <div className="flex gap-2 mt-4">
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
                 <Button variant="ghost" size="icon" onClick={() => { setStageFilter('all'); setStatusFilter('all'); }}>
                     <X className="w-4 h-4" />
                 </Button>
             )}
          </div>
        </SheetHeader>
        
        <div className="flex-1 flex overflow-hidden">
             {/* Timeline Column */}
             <div className="w-1/3 border-r border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-4 overflow-y-auto">
                 <GenerationTimeline traces={filteredTraces} />
             </div>

             {/* Viewer Column */}
             <div className="w-2/3 p-4 overflow-y-auto bg-white dark:bg-slate-900">
                 <TraceViewer />
             </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
