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

'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { History, RotateCcw, Edit, RefreshCw, Loader2, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ModelEditorDialog } from './model-editor-dialog'
import { ConfigHistoryDialog } from './config-history-dialog'
import { trpc } from '@/lib/trpc/react'
import type { ModelConfigWithVersion } from '@megacampus/shared-types'

/**
 * Phases that use dynamic token calculation
 * These phases calculate maxTokens at runtime based on content length and language
 */
const DYNAMIC_TOKEN_PHASES = [
  'stage_6_refinement',
  'stage_6_section_expander',
  'stage_6_patcher',
] as const

function usesDynamicTokens(phaseName: string): boolean {
  return DYNAMIC_TOKEN_PHASES.includes(phaseName as (typeof DYNAMIC_TOKEN_PHASES)[number])
}

/**
 * Display model configurations in a data table
 */
export function ModelsConfig() {
  const utils = trpc.useUtils()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // Dialog state
  const [editorOpen, setEditorOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<ModelConfigWithVersion | null>(null)

  // Reset confirmation state
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetPhaseName, setResetPhaseName] = useState<string | null>(null)

  // Query model configs
  const { data: allConfigs, isLoading, error } = trpc.pipelineAdmin.listModelConfigs.useQuery()

  // Filter out judge configs - they are managed in Stage 6 detail sheet
  const configs = useMemo(
    () => (allConfigs || []).filter((config) => config.phaseName !== 'stage_6_judge'),
    [allConfigs]
  )

  // Reset mutation
  const resetMutation = trpc.pipelineAdmin.resetModelConfigToDefault.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`Reset ${variables.phaseName} to default configuration`)
      void utils.pipelineAdmin.listModelConfigs.invalidate()
      setResetDialogOpen(false)
      setResetPhaseName(null)
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to reset configuration')
    },
    onSettled: () => {
      setResetDialogOpen(false)
      setResetPhaseName(null)
    },
  })

  // Refresh cache mutation
  const refreshCacheMutation = trpc.pipelineAdmin.refreshOpenRouterModels.useMutation({
    onSuccess: (data) => {
      toast.success(`Refreshed ${data.count} models from OpenRouter`)
      void utils.pipelineAdmin.listOpenRouterModels.invalidate()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to refresh models cache')
    },
  })

  // Handle reset confirmation
  const handleResetClick = (phaseName: string) => {
    setResetPhaseName(phaseName)
    setResetDialogOpen(true)
  }

  const confirmReset = () => {
    if (!resetPhaseName) return
    resetMutation.mutate({
      phaseName: resetPhaseName as Parameters<typeof resetMutation.mutate>[0]['phaseName'],
    })
  }

  // Handle refresh cache
  const handleRefreshCache = () => {
    refreshCacheMutation.mutate()
  }

  // Table columns definition
  const columns: ColumnDef<ModelConfigWithVersion>[] = [
    {
      accessorKey: 'phaseName',
      header: 'Phase',
      cell: ({ row }) => (
        <div className="font-medium">
          <Badge
            variant="outline"
            className="border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-purple-500/10 text-purple-500 dark:border-cyan-500/30 dark:from-cyan-500/10 dark:to-purple-500/10 dark:text-cyan-400"
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
              <HelpCircle className="text-muted-foreground h-3.5 w-3.5 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              <p>
                <strong>any</strong> — fallback для всех языков
              </p>
              <p>
                <strong>RU/EN</strong> — конфиг для конкретного языка (приоритетнее any)
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
      cell: ({ row }) => {
        const lang = row.original.language
        if (!lang || lang === 'any') {
          return <span className="text-muted-foreground text-sm">any</span>
        }
        return (
          <Badge
            variant="outline"
            className="border-blue-500/30 bg-blue-500/10 text-xs text-blue-400"
          >
            {lang.toUpperCase()}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'judgeRole',
      header: () => (
        <div className="flex items-center gap-1">
          Role
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="text-muted-foreground h-3.5 w-3.5 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs">
              <p className="mb-1">
                <strong>CLEV Voting Panel:</strong>
              </p>
              <p>
                🟢 <strong>primary</strong> — основной судья (вес 0.75)
              </p>
              <p>
                🟡 <strong>secondary</strong> — второй судья (вес 0.73)
              </p>
              <p>
                🟠 <strong>tiebreaker</strong> — арбитр при разногласиях
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
      cell: ({ row }) => {
        const role = row.original.judgeRole
        if (!role) return <span className="text-muted-foreground text-sm">—</span>

        const roleColors: Record<string, string> = {
          primary: 'bg-green-500/10 border-green-500/30 text-green-400',
          secondary: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
          tiebreaker: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
        }

        return (
          <Badge variant="outline" className={`text-xs ${roleColors[role] || ''}`}>
            {role}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'modelId',
      header: 'Model ID',
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate font-mono text-sm" title={row.original.modelId}>
          {row.original.modelId}
        </div>
      ),
    },
    {
      accessorKey: 'fallbackModelId',
      header: 'Fallback',
      cell: ({ row }) => (
        <div
          className="text-muted-foreground max-w-[150px] truncate font-mono text-sm"
          title={row.original.fallbackModelId || ''}
        >
          {row.original.fallbackModelId || '—'}
        </div>
      ),
    },
    {
      accessorKey: 'temperature',
      header: 'Temperature',
      cell: ({ row }) => <div className="text-sm">{row.original.temperature.toFixed(1)}</div>,
    },
    {
      accessorKey: 'maxTokens',
      header: 'Max Tokens',
      cell: ({ row }) => {
        if (usesDynamicTokens(row.original.phaseName)) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="cursor-help border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                >
                  Dynamic
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs">
                <p>Calculated automatically based on:</p>
                <ul className="mt-1 ml-4 list-disc">
                  <li>Content length</li>
                  <li>Language (RU needs 33% more tokens)</li>
                  <li>Lesson duration</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          )
        }
        return <div className="text-sm">{row.original.maxTokens.toLocaleString()}</div>
      },
    },
    {
      accessorKey: 'version',
      header: 'Version',
      cell: ({ row }) => (
        <div className="text-sm">
          <Badge
            variant="secondary"
            className="border-purple-500/30 bg-purple-500/20 text-purple-400"
          >
            v{row.original.version}
          </Badge>
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const config = row.original

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
                  setSelectedConfig(config)
                  setEditorOpen(true)
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedConfig(config)
                  setHistoryOpen(true)
                }}
              >
                <History className="mr-2 h-4 w-4" />
                View History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleResetClick(config.phaseName)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset to Default
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

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
  })

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header with actions */}
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="text-2xl font-semibold"
              style={{ color: 'rgb(var(--admin-text-primary))' }}
            >
              Model Configuration
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
              Configure LLM models for each pipeline phase
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshCache}
            disabled={refreshCacheMutation.isPending}
            className="border-purple-500/30 text-purple-500 transition-all hover:bg-purple-500/10 hover:text-purple-600 dark:border-cyan-500/30 dark:text-cyan-400 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-300"
          >
            {refreshCacheMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
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
            className="max-w-sm border-purple-500/20 bg-transparent text-gray-900 placeholder:text-gray-500 focus:border-purple-500/50 dark:border-cyan-500/20 dark:text-white dark:focus:border-cyan-500/50"
          />
        </div>

        {/* Error state */}
        {error && (
          <div className="border-destructive bg-destructive/10 rounded-lg border p-4">
            <p className="text-destructive text-sm">{error.message}</p>
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
          <div className="admin-glass-card overflow-hidden rounded-xl border border-purple-500/10 dark:border-cyan-500/10">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-[rgb(var(--admin-bg-primary))]/90 backdrop-blur-xl">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="border-b border-purple-500/10 hover:bg-transparent dark:border-cyan-500/10"
                  >
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="font-semibold"
                        style={{ color: 'rgb(var(--admin-text-secondary))' }}
                      >
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
                        setSelectedConfig(row.original)
                        setEditorOpen(true)
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          onClick={(e) => {
                            // Prevent row click when clicking actions dropdown
                            if ((e.target as HTMLElement).closest('[role="menu"]')) {
                              e.stopPropagation()
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
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                      style={{ color: 'rgb(var(--admin-text-tertiary))' }}
                    >
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
          onSaved={() => void utils.pipelineAdmin.listModelConfigs.invalidate()}
        />

        {/* History dialog */}
        <ConfigHistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          phaseName={selectedConfig?.phaseName ?? 'global_default'}
          onReverted={() => void utils.pipelineAdmin.listModelConfigs.invalidate()}
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
              <AlertDialogCancel disabled={resetMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmReset} disabled={resetMutation.isPending}>
                {resetMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
