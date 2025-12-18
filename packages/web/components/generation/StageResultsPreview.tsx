'use client';

import { useEffect, useState } from 'react';
import { getStageResults } from '@/app/actions/admin-generation';
import { BarChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface StageResultsPreviewProps {
  courseId: string;
  stage: number;
}

interface StageData {
  totalDocuments?: number;
  classifiedCount?: number;
  priorities?: Array<{ id: string; priority: string }>;
  summarizedDocuments?: number;
  tokenSavings?: string;
  analysisSummary?: string;
  modulesCount?: number;
  lessonsCount?: number;
}

export default function StageResultsPreview({ courseId, stage }: StageResultsPreviewProps) {
  const [data, setData] = useState<StageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchResults() {
      try {
        setIsLoading(true);
        setError(null);
        const results = await getStageResults(courseId, stage);
        if (!cancelled) {
          setData(results?.data || results);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load results');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchResults();

    return () => {
      cancelled = true;
    };
  }, [courseId, stage]);

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error) {
    return (
      <div className="p-4 text-red-500 bg-red-50 rounded-md">
        Failed to load stage results: {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Card className="border-blue-100 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
          <BarChart className="w-4 h-4" />
          Stage {stage} Results
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stage === 2 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Documents:</span>
              <span className="font-medium">{data.totalDocuments}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Classified:</span>
              <span className="font-medium">{data.classifiedCount}</span>
            </div>
            {data.priorities && data.priorities.length > 0 && (
               <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-semibold mb-1">Priorities:</p>
                  <div className="flex flex-wrap gap-1">
                    {data.priorities.map((p) => (
                      <span key={p.id} className="text-xs px-2 py-0.5 bg-blue-200 dark:bg-blue-800 rounded-full">
                        {p.priority}
                      </span>
                    ))}
                  </div>
               </div>
            )}
          </div>
        )}

        {stage === 3 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Documents:</span>
              <span className="font-medium">{data.totalDocuments}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Summarized:</span>
              <span className="font-medium">{data.summarizedDocuments}</span>
            </div>
            {data.tokenSavings && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Token Savings:</span>
                <span className="font-medium text-green-600">{data.tokenSavings}</span>
              </div>
            )}
          </div>
        )}

        {stage === 4 && (
          <div className="space-y-2">
             <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Analysis Summary:</span>
                <p className="text-sm italic bg-white/50 dark:bg-black/20 p-2 rounded">
                   {typeof data.analysisSummary === 'string' ? data.analysisSummary.substring(0, 150) + '...' : 'Available'}
                </p>
             </div>
          </div>
        )}

        {stage === 5 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/60 dark:bg-black/20 p-3 rounded text-center">
               <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.modulesCount}</div>
               <div className="text-xs text-muted-foreground uppercase tracking-wider">Modules</div>
            </div>
            <div className="bg-white/60 dark:bg-black/20 p-3 rounded text-center">
               <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{data.lessonsCount}</div>
               <div className="text-xs text-muted-foreground uppercase tracking-wider">Lessons</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
