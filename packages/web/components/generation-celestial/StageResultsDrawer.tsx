'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StageResultsPreview from '@/components/generation/StageResultsPreview';
import { PrioritizationView } from '@/components/generation-graph/panels/output/PrioritizationView';
import ActivityLog from '@/app/courses/generating/[slug]/ActivityLog';
import { ActivityEntry } from '@/types/course-generation';
import { STAGE_CONFIG } from './utils';

interface StageResultsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  stageNumber: number | null;
  activityLog: ActivityEntry[];
}

export function StageResultsDrawer({
  isOpen,
  onClose,
  courseId,
  stageNumber,
  activityLog
}: StageResultsDrawerProps) {
  
  const stageName = stageNumber
    ? Object.values(STAGE_CONFIG).find(s => s.number === stageNumber)?.name
    : 'Детали этапа';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-[50vw] border-l border-gray-800 bg-[#0a0e1a] text-gray-100 p-0 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <SheetHeader>
            <SheetTitle className="text-purple-400">{stageName}</SheetTitle>
            <SheetDescription className="text-gray-400">
              Просмотр сгенерированного контента и логов.
            </SheetDescription>
          </SheetHeader>
        </div>

        <Tabs defaultValue="results" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-2">
             <TabsList className="w-full bg-gray-900 border border-gray-800">
              <TabsTrigger value="results" className="flex-1 text-gray-400 data-[state=active]:text-purple-400 data-[state=active]:bg-purple-900/20">
                Результаты
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 text-gray-400 data-[state=active]:text-blue-400 data-[state=active]:bg-blue-900/20">
                Журнал активности
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="results" className="h-full p-6 pt-4">
              {stageNumber === 3 ? (
                <PrioritizationView
                  courseId={courseId}
                  editable={true}
                  onApproved={onClose}
                />
              ) : stageNumber ? (
                <StageResultsPreview courseId={courseId} stage={stageNumber} />
              ) : (
                <div className="text-center text-gray-500 py-8">Этап не выбран</div>
              )}
            </TabsContent>
            
            <TabsContent value="activity" className="h-full p-6 pt-4">
               {/* Reuse existing ActivityLog but styled for drawer if possible, or just wrap it */}
               <div className="pb-8">
                 <ActivityLog 
                   entries={activityLog} 
                   status="processing_documents" // Dummy status just to show updates if needed, or pass actual status if available
                   maxHeight={800} 
                 />
               </div>
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
