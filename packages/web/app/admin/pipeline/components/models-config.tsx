/**
 * ModelsConfig Component (T032)
 *
 * Main component for the Models tab showing a data table of all model configurations.
 *
 * Features:
 * - DataTable with @tanstack/react-table
 * - Columns: Phase name, Model ID, Fallback, Temperature, Max Tokens, Version, Actions
 * - Row click opens ModelEditorDialog
 * - Actions: Edit, History, Reset
 * - Skeleton loader during data fetch
 *
 * @module app/admin/pipeline/components/models-config
 */

'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { History, RotateCcw, Edit, RefreshCw, Loader2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ModelEditorDialog } from './model-editor-dialog';
import { ConfigHistoryDialog } from './config-history-dialog';
import {
  listModelConfigs,
  resetModelConfigToDefault,
  refreshOpenRouterModels,
} from '@/app/actions/pipeline-admin';
import type { ModelConfigWithVersion } from '@megacampus/shared-types';

/**
 * Display model configurations in a data table
 */
export function ModelsConfig() {
  const [configs, setConfigs] = useState<ModelConfigWithVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<ModelConfigWithVersion | null>(null);

  // Reset confirmation state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPhaseName, setResetPhaseName] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Refresh cache state
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);

  // Load configs
  const loadConfigs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await listModelConfigs();
      // Filter out judge configs - they are managed in Stage 6 detail sheet
      const nonJudgeConfigs = (result.result?.data || []).filter(
        (config: ModelConfigWithVersion) => config.phaseName !== 'stage_6_judge'
      );
      setConfigs(nonJudgeConfigs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configurations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  // Handle reset confirmation
  const handleResetClick = (phaseName: string) => {
    setResetPhaseName(phaseName);
    setResetDialogOpen(true);
  };

  const confirmReset = async () => {
    if (!resetPhaseName) return;

    try {
      setIsResetting(true);
      await resetModelConfigToDefault({ phaseName: resetPhaseName });
      toast.success(`Reset ${resetPhaseName} to default configuration`);
      await loadConfigs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset configuration');
    } finally {
      setIsResetting(false);
      setResetDialogOpen(false);
      setResetPhaseName(null);
    }
  };

  // Handle refresh cache
  const handleRefreshCache = async () => {
    try {
      setIsRefreshingCache(true);
      const result = await refreshOpenRouterModels();
      const count = result.result?.data?.count || 0;
      toast.success(`Refreshed ${count} models from OpenRouter`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh models cache');
    } finally {
      setIsRefreshingCache(false);
    }
  };

  // Table columns definition
  const columns: ColumnDef<ModelConfigWithVersion>[] = [
    {
      accessorKey: 'phaseName',
      header: 'Phase',
      cell: ({ row }) => (
        <div className="font-medium">
          <Badge
            variant="outline"
            className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border-cyan-500/30 text-cyan-400"
          >
            {row.original.phaseName}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: 'language',
      header: () => (
        <div className="flex items-center gap-1">
          Lang
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              <p><strong>any</strong> — fallback для всех языков</p>
              <p><strong>RU/EN</strong> — конфиг для конкретного языка (приоритетнее any)</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
      cell: ({ row }) => {
        const lang = row.original.language;
        if (!lang || lang === 'any') {
          return <span className="text-sm text-muted-foreground">any</span>;
        }
        return (
          <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-400">
            {lang.toUpperCase()}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'judgeRole',
      header: () => (
        <div className="flex items-center gap-1">
          Role
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs">
              <p className="mb-1"><strong>CLEV Voting Panel:</strong></p>
              <p>🟢 <strong>primary</strong> — основной судья (вес 0.75)</p>
              <p>🟡 <strong>secondary</strong> — второй судья (вес 0.73)</p>
              <p>🟠 <strong>tiebreaker</strong> — арбитр при разногласиях</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
      cell: ({ row }) => {
        const role = row.original.judgeRole;
        if (!role) return <span className="text-sm text-muted-foreground">—</span>;

        const roleColors: Record<string, string> = {
          primary: 'bg-green-500/10 border-green-500/30 text-green-400',
          secondary: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
          tiebreaker: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
        };

        return (
          <Badge variant="outline" className={`text-xs ${roleColors[role] || ''}`}>
            {role}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'modelId',
      header: 'Model ID',
      cell: ({ row }) => (
        <div className="font-mono text-sm truncate max-w-[200px]" title={row.original.modelId}>
          {row.original.modelId}
        </div>
      ),
    },
    {
      accessorKey: 'fallbackModelId',
      header: 'Fallback',
      cell: ({ row }) => (
        <div className="font-mono text-sm text-muted-foreground truncate max-w-[150px]" title={row.original.fallbackModelId || ''}>
          {row.original.fallbackModelId || '—'}
        </div>
      ),
    },
    {
      accessorKey: 'temperature',
      header: 'Temperature',
      cell: ({ row }) => (
        <div className="text-sm">{row.original.temperature.toFixed(1)}</div>
      ),
    },
    {
      accessorKey: 'maxTokens',
      header: 'Max Tokens',
      cell: ({ row }) => (
        <div className="text-sm">{row.original.maxTokens.toLocaleString()}</div>
      ),
    },
    {
      accessorKey: 'version',
      header: 'Version',
      cell: ({ row }) => (
        <div className="text-sm">
          <Badge
            variant="secondary"
            className="bg-purple-500/20 text-purple-400 border-purple-500/30"
          >
            v{row.original.version}
          </Badge>
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const config = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setSelectedConfig(config);
                  setEditorOpen(true);
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedConfig(config);
                  setHistoryOpen(true);
                }}
              >
                <History className="h-4 w-4 mr-2" />
                View History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleResetClick(config.phaseName)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Default
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  // Table instance
  const table = useReactTable({
    data: configs,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  });

  return (
    <TooltipProvider>
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'rgb(var(--admin-text-primary))' }}>
            Model Configuration
          </h2>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
            Configure LLM models for each pipeline phase
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshCache}
          disabled={isRefreshingCache}
          className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 transition-all"
        >
          {isRefreshingCache ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh Models Cache
        </Button>
      </div>

      {/* Search filter */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter by phase name..."
          value={(table.getColumn('phaseName')?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn('phaseName')?.setFilterValue(event.target.value)}
          className="max-w-sm bg-transparent border-cyan-500/20 focus:border-cyan-500/50 text-white placeholder:text-gray-500"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {/* Data table */}
      {!isLoading && !error && (
        <div className="rounded-xl border border-cyan-500/10 admin-glass-card overflow-hidden">
          <Table>
            <TableHeader className="sticky top-0 backdrop-blur-xl bg-[rgb(var(--admin-bg-primary))]/90 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-cyan-500/10 hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="font-semibold" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="admin-table-row cursor-pointer"
                    onClick={() => {
                      setSelectedConfig(row.original);
                      setEditorOpen(true);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        onClick={(e) => {
                          // Prevent row click when clicking actions dropdown
                          if ((e.target as HTMLElement).closest('[role="menu"]')) {
                            e.stopPropagation();
                          }
                        }}
                        style={{ color: 'rgb(var(--admin-text-secondary))' }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
                    No configurations found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Editor dialog */}
      <ModelEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        config={selectedConfig}
        onSaved={loadConfigs}
      />

      {/* History dialog */}
      <ConfigHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        phaseName={selectedConfig?.phaseName || ''}
        onReverted={loadConfigs}
      />

      {/* Reset confirmation dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset <strong>{resetPhaseName}</strong> to the hardcoded
              default configuration? This will create a new version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset} disabled={isResetting}>
              {isResetting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
