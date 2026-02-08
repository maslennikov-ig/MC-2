'use client'

import { useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  SortingState,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table'
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Filter,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BenchmarkData, ScenarioResult } from '@/app/actions/benchmarks'
import { cn } from '@/lib/utils'
import { SampleContentViewer } from './sample-content-viewer'
import { benchmarkQueries } from '@/lib/queries/benchmarks'

const TIER_COLORS = {
  S: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  A: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  B: 'bg-green-500/20 text-green-300 border-green-500/50',
  C: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  D: 'bg-red-500/20 text-red-300 border-red-500/50',
}

interface ModelsRankingTableProps {
  locale: string
}

export function ModelsRankingTable({ locale: _locale }: ModelsRankingTableProps) {
  const t = useTranslations('benchmarks')

  const [pageSize, setPageSize] = useState(20)
  const [pageIndex, setPageIndex] = useState(0)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'overallQualityScore', desc: true }])
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [scenarioFilter, setScenarioFilter] = useState<string>('all')
  const [testDateFilter, setTestDateFilter] = useState<string>('all')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [scenarioDetails, setScenarioDetails] = useState<Record<string, ScenarioResult[]>>({})
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({})

  // Fetch filter options with TanStack Query
  const { data: providers = [] } = useQuery(benchmarkQueries.providers())
  const { data: scenarios = [] } = useQuery(benchmarkQueries.scenarios())
  const { data: testDates = [] } = useQuery(benchmarkQueries.testDates())

  // Build params object for the main data query
  const benchmarkParams = useMemo(() => {
    const sortField = sorting[0]?.id || 'overallQualityScore'
    const sortOrder = sorting[0]?.desc ? ('desc' as const) : ('asc' as const)

    return {
      sortBy: sortField,
      sortOrder,
      provider: providerFilter !== 'all' ? providerFilter : undefined,
      tier: tierFilter !== 'all' ? tierFilter : undefined,
      scenario: scenarioFilter !== 'all' ? scenarioFilter : undefined,
      testDate: testDateFilter !== 'all' ? testDateFilter : undefined,
      limit: pageSize,
      offset: pageIndex * pageSize,
    }
  }, [sorting, providerFilter, tierFilter, scenarioFilter, testDateFilter, pageSize, pageIndex])

  // Fetch main benchmark data with TanStack Query
  const {
    data: benchmarkResult,
    isLoading: loading,
    refetch: loadData,
  } = useQuery(benchmarkQueries.all(benchmarkParams))

  const data = benchmarkResult?.benchmarks ?? []
  const totalCount = benchmarkResult?.totalCount ?? 0

  // Handle row expansion — still uses manual fetch for on-demand scenario details
  const handleRowClick = useCallback(
    async (modelSlug: string) => {
      if (expandedRow === modelSlug) {
        // Collapse if already expanded
        setExpandedRow(null)
      } else {
        // Expand and load details if not already loaded
        setExpandedRow(modelSlug)
        if (!scenarioDetails[modelSlug]) {
          setLoadingDetails((prev) => ({ ...prev, [modelSlug]: true }))
          try {
            const { getModelScenarioResultsAction } = await import('@/app/actions/benchmarks')
            const results = await getModelScenarioResultsAction(modelSlug)
            setScenarioDetails((prev) => ({ ...prev, [modelSlug]: results }))
          } catch (err) {
            console.error('Failed to fetch scenario details', err)
          } finally {
            setLoadingDetails((prev) => ({ ...prev, [modelSlug]: false }))
          }
        }
      }
    },
    [expandedRow, scenarioDetails]
  )

  const columns = useMemo<ColumnDef<BenchmarkData>[]>(
    () => [
      {
        id: 'expand',
        header: '',
        cell: ({ row }) => {
          const isExpanded = expandedRow === row.original.modelSlug
          return (
            <button
              onClick={(e) => {
                e.stopPropagation()
                void handleRowClick(row.original.modelSlug)
              }}
              className="text-white/70 transition-colors hover:text-white"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )
        },
      },
      {
        accessorKey: 'rank',
        header: t('table.rank'),
        cell: ({ row }) => (
          <span className="font-bold text-white">{pageIndex * pageSize + row.index + 1}</span>
        ),
      },
      {
        accessorKey: 'modelName',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.model')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-white">{row.original.modelName}</div>
            <div className="text-sm text-white/60">{row.original.modelSlug}</div>
          </div>
        ),
      },
      {
        accessorKey: 'provider',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.provider')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <Badge variant="outline" className="border-white/20 bg-white/5 text-xs text-white">
            {row.original.provider}
          </Badge>
        ),
      },
      {
        accessorKey: 'qualityTier',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.tier')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <Badge variant="outline" className={TIER_COLORS[row.original.qualityTier]}>
            {t(`tiers.${row.original.qualityTier}` as any)}
          </Badge>
        ),
      },
      {
        accessorKey: 'overallQualityScore',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.quality')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <span className="font-semibold text-white">
            {(row.original.overallQualityScore * 100).toFixed(1)}%
          </span>
        ),
      },
      {
        accessorKey: 'contentQualityScore',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.content')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <span className="text-white">{(row.original.contentQualityScore * 100).toFixed(1)}%</span>
        ),
      },
      {
        accessorKey: 'schemaComplianceScore',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.schema')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <span className="text-white">
            {(row.original.schemaComplianceScore * 100).toFixed(1)}%
          </span>
        ),
      },
      {
        accessorKey: 'languageQualityScore',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.language')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <span className="text-white">
            {(row.original.languageQualityScore * 100).toFixed(1)}%
          </span>
        ),
      },
      {
        accessorKey: 'errorRate',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.errorRate')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <span className={cn('text-white', row.original.errorRate > 0.1 && 'text-red-400')}>
            {(row.original.errorRate * 100).toFixed(1)}%
          </span>
        ),
      },
      {
        id: 'sample',
        header: '',
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <SampleContentViewer
              modelSlug={row.original.modelSlug}
              modelName={row.original.modelName}
            />
          </div>
        ),
      },
    ],
    [t, pageIndex, pageSize, expandedRow, handleRowClick]
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    pageCount: Math.ceil(totalCount / pageSize),
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex, pageSize })
        setPageIndex(newState.pageIndex)
        setPageSize(newState.pageSize)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    manualSorting: true,
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col items-start gap-4 rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-white">
          <Filter className="h-5 w-5" />
          <span className="font-medium">{t('filters.title')}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={providerFilter}
            onValueChange={(value) => {
              setProviderFilter(value)
              setPageIndex(0)
            }}
          >
            <SelectTrigger className="w-[180px] border-white/20 bg-white/5 text-white">
              <SelectValue placeholder={t('filters.provider')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allProviders')}</SelectItem>
              {providers.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={tierFilter}
            onValueChange={(value) => {
              setTierFilter(value)
              setPageIndex(0)
            }}
          >
            <SelectTrigger className="w-[160px] border-white/20 bg-white/5 text-white">
              <SelectValue placeholder={t('filters.tier')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allTiers')}</SelectItem>
              <SelectItem value="S">{t('tiers.S' as any)}</SelectItem>
              <SelectItem value="A">{t('tiers.A' as any)}</SelectItem>
              <SelectItem value="B">{t('tiers.B' as any)}</SelectItem>
              <SelectItem value="C">{t('tiers.C' as any)}</SelectItem>
              <SelectItem value="D">{t('tiers.D' as any)}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={scenarioFilter}
            onValueChange={(value) => {
              setScenarioFilter(value)
              setPageIndex(0)
            }}
          >
            <SelectTrigger className="w-[200px] border-white/20 bg-white/5 text-white">
              <SelectValue placeholder={t('filters.scenario')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allScenarios')}</SelectItem>
              {scenarios.map((scenario) => (
                <SelectItem key={scenario} value={scenario}>
                  {t(`scenarios.${scenario}` as any) || scenario}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={testDateFilter}
            onValueChange={(value) => {
              setTestDateFilter(value)
              setPageIndex(0)
            }}
          >
            <SelectTrigger className="w-[180px] border-white/20 bg-white/5 text-white">
              <SelectValue placeholder={t('filters.testDate')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allDates')}</SelectItem>
              {testDates.map((date) => (
                <SelectItem key={date} value={date}>
                  {new Date(date).toLocaleDateString(_locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => void loadData()}
            disabled={loading}
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            <Loader2 className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-white/20 bg-white/10 shadow-xl backdrop-blur-sm">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 border-b border-white/20 bg-white/5 backdrop-blur-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="h-12 px-4 text-left align-middle font-medium text-white/90"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="h-32 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-white/70" />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="h-32 text-center text-white/70">
                    {t('table.noData')}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isExpanded = expandedRow === row.original.modelSlug
                  const details = scenarioDetails[row.original.modelSlug]
                  const isLoadingDetails = loadingDetails[row.original.modelSlug]

                  return (
                    <>
                      <tr
                        key={row.id}
                        className="cursor-pointer transition-colors even:bg-white/[0.02] hover:bg-white/5"
                        onClick={() => void handleRowClick(row.original.modelSlug)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="p-4 align-middle">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {isExpanded && (
                        <tr key={`${row.id}-expanded`}>
                          <td colSpan={columns.length} className="bg-white/[0.08] p-0">
                            <div className="overflow-hidden transition-all duration-300">
                              {isLoadingDetails ? (
                                <div className="flex items-center justify-center py-8">
                                  <Loader2 className="h-6 w-6 animate-spin text-white/70" />
                                </div>
                              ) : details && details.length > 0 ? (
                                <div className="p-4">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-white/10">
                                        <th className="pb-2 text-left font-medium text-white/80">
                                          {t('expandedTable.scenario')}
                                        </th>
                                        <th className="pb-2 text-left font-medium text-white/80">
                                          {t('expandedTable.run')}
                                        </th>
                                        <th className="pb-2 text-left font-medium text-white/80">
                                          {t('expandedTable.schema')}
                                        </th>
                                        <th className="pb-2 text-left font-medium text-white/80">
                                          {t('expandedTable.content')}
                                        </th>
                                        <th className="pb-2 text-left font-medium text-white/80">
                                          {t('expandedTable.language')}
                                        </th>
                                        <th className="pb-2 text-left font-medium text-white/80">
                                          {t('expandedTable.overall')}
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {details.map((detail, idx) => (
                                        <tr
                                          key={idx}
                                          className="border-b border-white/5 last:border-0"
                                        >
                                          <td className="py-2 text-white/90">
                                            {t(`scenarios.${detail.scenario}` as any) ||
                                              detail.scenario}
                                          </td>
                                          <td className="py-2 text-white/90">{detail.runNumber}</td>
                                          <td className="py-2 text-white/90">
                                            {(detail.schemaScore * 100).toFixed(1)}%
                                          </td>
                                          <td className="py-2 text-white/90">
                                            {(detail.contentScore * 100).toFixed(1)}%
                                          </td>
                                          <td className="py-2 text-white/90">
                                            {(detail.languageScore * 100).toFixed(1)}%
                                          </td>
                                          <td className="py-2 text-white/90">
                                            {detail.isError ? (
                                              <span className="text-red-400">
                                                {t('expandedTable.error')}
                                              </span>
                                            ) : (
                                              `${(detail.overallScore * 100).toFixed(1)}%`
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="py-8 text-center text-white/70">
                                  {t('table.noData')}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col items-center justify-between gap-4 px-2 sm:flex-row">
        <div className="text-sm text-white/70">
          {t('pagination.showing', {
            from: pageIndex * pageSize + 1,
            to: Math.min((pageIndex + 1) * pageSize, totalCount),
            total: totalCount,
          })}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value))
              setPageIndex(0)
            }}
          >
            <SelectTrigger className="w-[100px] border-white/20 bg-white/5 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0 || loading}
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t('pagination.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((p) => p + 1)}
            disabled={pageIndex >= Math.ceil(totalCount / pageSize) - 1 || loading}
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            {t('pagination.next')}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
