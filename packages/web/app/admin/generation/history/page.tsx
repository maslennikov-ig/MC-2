import { HistoryTable } from '@/components/generation-monitoring/history-table';

export default function HistoryPage() {
  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generation History</h1>
        <p className="text-muted-foreground">
          View and manage course generation history across the platform.
        </p>
      </div>
      
      <div className="flex-1 min-h-0">
        <HistoryTable />
      </div>
    </div>
  );
}
