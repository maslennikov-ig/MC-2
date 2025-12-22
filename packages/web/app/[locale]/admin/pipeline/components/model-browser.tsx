/**
 * ModelBrowser Component (T059)
 *
 * Searchable, filterable data table showing all available OpenRouter models.
 *
 * Features:
 * - DataTable with columns: ID, Name, Provider, Context, Input Price, Output Price
 * - Filters: Text search, provider dropdown, context size range, max price
 * - Sorting by clicking column headers
 * - Cache status display (from cache or fresh API call)
 * - Refresh button to force API call
 * - Copy model ID to clipboard
 * - Optional "Use this model" callback for ModelEditorDialog integration
 *
 * @module app/admin/pipeline/components/model-browser
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { RefreshCw, Copy, ArrowUpDown, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listOpenRouterModels, refreshOpenRouterModels } from '@/app/actions/pipeline-admin';
import type { OpenRouterModel } from '@megacampus/shared-types';

interface ModelBrowserProps {
  onSelectModel?: (modelId: string) => void;
}

export function ModelBrowser({ onSelectModel }: ModelBrowserProps) {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Cache info
  const [fromCache, setFromCache] = useState<boolean>(false);
  const [cacheAge, setCacheAge] = useState<number | undefined>();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [minContext, setMinContext] = useState<number | undefined>();
  const [maxPrice, setMaxPrice] = useState<number | undefined>();

  // Load models
  const loadModels = async () => {
    try {
      setIsLoading(true);
      const result = await listOpenRouterModels();
      const data = result.result?.data;
      setModels(data?.models || []);
      setFromCache(data?.fromCache || false);
      setCacheAge(data?.cacheAge);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh cache
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await refreshOpenRouterModels();
      await loadModels();
      toast.success('Models cache refreshed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh models');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  // Extract unique providers
  const providers = useMemo(() => {
    const set = new Set(models.map((m) => m.provider || m.id.split('/')[0]));
    return Array.from(set).sort();
  }, [models]);

  // Format context size
  const formatContext = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return n.toString();
  };

  // Format price (from USD per token to $/M tokens)
  const formatPrice = (pricePerToken: number) => {
    const pricePerMillion = pricePerToken * 1000000;
    if (pricePerMillion === 0) return 'Free';
    if (pricePerMillion < 0.01) return '<$0.01';
    return `$${pricePerMillion.toFixed(2)}`;
  };

  // Filter models
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      // Text search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !m.id.toLowerCase().includes(query) &&
          !m.name.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      // Provider filter
      if (providerFilter !== 'all') {
        const modelProvider = m.provider || m.id.split('/')[0];
        if (modelProvider !== providerFilter) {
          return false;
        }
      }

      // Context size filter
      if (minContext && m.contextLength < minContext) {
        return false;
      }

      // Max price filter
      if (maxPrice) {
        const inputPrice = m.pricing.prompt * 1000000;
        if (inputPrice > maxPrice) return false;
      }

      return true;
    });
  }, [models, searchQuery, providerFilter, minContext, maxPrice]);

  // Columns
  const columns: ColumnDef<OpenRouterModel>[] = [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Model ID <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="font-mono text-sm">{row.original.id}</div>,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
    },
    {
      id: 'provider',
      header: 'Provider',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.provider || row.original.id.split('/')[0]}</Badge>
      ),
    },
    {
      accessorKey: 'contextLength',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Context <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => formatContext(row.original.contextLength),
    },
    {
      id: 'inputPrice',
      header: 'Input $/M',
      cell: ({ row }) => formatPrice(row.original.pricing.prompt),
    },
    {
      id: 'outputPrice',
      header: 'Output $/M',
      cell: ({ row }) => formatPrice(row.original.pricing.completion),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(row.original.id);
              toast.success('Model ID copied');
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
          {onSelectModel && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectModel(row.original.id)}
            >
              <Zap className="h-4 w-4 mr-1" />
              Use
            </Button>
          )}
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: filteredModels,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
  });

  // Format cache age
  const formatCacheAge = (ms: number | undefined) => {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Model Browser</CardTitle>
            <CardDescription>
              Browse available OpenRouter models ({filteredModels.length} of {models.length})
              {fromCache && cacheAge && (
                <span className="ml-2 text-xs">
                  • Cached {formatCacheAge(cacheAge)}
                </span>
              )}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Min context (K)"
            className="w-[140px]"
            onChange={(e) =>
              setMinContext(e.target.value ? parseInt(e.target.value) * 1000 : undefined)
            }
          />
          <Input
            type="number"
            placeholder="Max $/M"
            className="w-[120px]"
            onChange={(e) => setMaxPrice(e.target.value ? parseFloat(e.target.value) : undefined)}
          />
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {/* Table */}
        {!isLoading && (
          <div className="rounded-md border max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {table.getRowModel().rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center py-8">
                      No models found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
