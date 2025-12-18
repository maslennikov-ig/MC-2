import React, { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CheckCircle2, XCircle } from 'lucide-react';

interface ActivityTabProps {
  nodeId: string | null;
}

export const ActivityTab: React.FC<ActivityTabProps> = ({ nodeId }) => {
  const { traces } = useGenerationRealtime();

  // Filter traces for this node (if nodeId is provided)
  // Supports: stage_X, doc_<uuid>, lesson_<uuid>, step_<docId>_<stepname>, merge_X
  const activities = useMemo(() => {
      if (!nodeId) return [];

      let stageNum = 0;
      let documentId: string | null = null;
      let lessonId: string | null = null;

      if (nodeId.startsWith('stage_')) {
          stageNum = parseInt(nodeId.split('_')[1]);
      } else if (nodeId.startsWith('doc_')) {
          documentId = nodeId.replace(/^doc_/, '');
          stageNum = 2;
      } else if (nodeId.startsWith('lesson_')) {
          lessonId = nodeId.replace(/^lesson_/, '');
          stageNum = 6;
      } else if (nodeId.startsWith('step_')) {
          const parts = nodeId.replace(/^step_/, '').split('_');
          if (parts.length >= 1) {
              documentId = parts[0];
          }
          stageNum = 2;
      } else if (nodeId.startsWith('merge_')) {
          stageNum = parseInt(nodeId.split('_')[1]);
      }

      return traces.filter(t => {
          // First filter by stage
          if (stageNum > 0 && t.stage !== `stage_${stageNum}`) return false;

          // Then filter by specific node
          if (documentId) {
              return t.input_data?.document_id === documentId ||
                     t.input_data?.documentId === documentId ||
                     t.input_data?.file_id === documentId ||
                     t.input_data?.fileId === documentId;
          }
          if (lessonId) {
              return t.lesson_id === lessonId;
          }

          // For stage/merge nodes, match all traces from that stage
          if (stageNum > 0) return true;

          return false;
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [traces, nodeId]);

  if (activities.length === 0) {
      return <div className="text-sm text-muted-foreground p-4 text-center">No activity recorded for this stage.</div>;
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-4">
        {activities.map((activity) => {
            const isError = !!activity.error_data;
            return (
                <div key={activity.id} className="flex gap-3 text-sm">
                    <div className="mt-0.5">
                        {isError ? (
                            <XCircle className="w-4 h-4 text-red-500" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                    </div>
                    <div className="flex-1 space-y-1">
                        <div className="flex justify-between">
                            <span className="font-medium">{activity.phase}</span>
                            <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ru })}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{activity.step_name}</p>
                        {isError && (
                            <div className="bg-red-50 p-2 rounded text-xs text-red-600 border border-red-100 mt-1">
                                {JSON.stringify(activity.error_data)}
                            </div>
                        )}
                    </div>
                </div>
            );
        })}
      </div>
    </ScrollArea>
  );
};
