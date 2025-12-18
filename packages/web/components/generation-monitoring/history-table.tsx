'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Search, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getGenerationHistoryAction } from '@/app/actions/admin-history';
import { cn } from '@/lib/utils';

interface CourseHistoryItem {
  id: string;
  title: string;
  generation_status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | null;
  created_at: string;
  updated_at: string;
}

export function HistoryTable() {
  const router = useRouter();
  const [data, setData] = useState<CourseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getGenerationHistoryAction({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      
      setData(result.courses);
      setTotalCount(result.totalCount);
    } catch (err) {
      console.error('Failed to fetch history', err);
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [pageSize, page, search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300); // Debounce search
    return () => clearTimeout(timer);
  }, [loadData]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-500 hover:bg-green-500/20';
      case 'failed': return 'bg-red-500/10 text-red-500 hover:bg-red-500/20';
      case 'processing': return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20';
      case 'pending': return 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20';
      case 'cancelled': return 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-3 h-3 mr-1" />;
      case 'failed': return <AlertCircle className="w-3 h-3 mr-1" />;
      case 'processing': return <Loader2 className="w-3 h-3 mr-1 animate-spin" />;
      case 'pending': return <Clock className="w-3 h-3 mr-1" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="icon" onClick={loadData} disabled={loading}>
             <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card shadow-sm overflow-hidden">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Title</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Created</th>
                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : error ? (
                 <tr>
                  <td colSpan={4} className="h-24 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="h-24 text-center text-muted-foreground">
                    No courses found.
                  </td>
                </tr>
              ) : (
                data.map((course) => (
                  <tr 
                    key={course.id} 
                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer"
                    onClick={() => router.push(`/admin/generation/${course.id}`)}
                  >
                    <td className="p-4 align-middle font-medium">{course.title}</td>
                    <td className="p-4 align-middle">
                      <Badge variant="secondary" className={getStatusColor(course.generation_status)}>
                        {getStatusIcon(course.generation_status)}
                        {course.generation_status || 'Draft'}
                      </Badge>
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {course.created_at && formatDistanceToNow(new Date(course.created_at), { addSuffix: true })}
                    </td>
                    <td className="p-4 align-middle text-right">
                      <Button variant="ghost" size="sm">View</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} results
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
