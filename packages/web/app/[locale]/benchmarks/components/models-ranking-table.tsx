'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  SortingState,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Filter } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getBenchmarksAction, getProvidersAction, BenchmarkData } from '@/app/actions/benchmarks'
import { cn } from '@/lib/utils'

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

  const [data, setData] = useState<BenchmarkData[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [pageIndex, setPageIndex] = useState(0)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'overallQualityScore', desc: true }])
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [providers, setProviders] = useState<string[]>([])

  // Fetch providers on mount
  useEffect(() => {
    void getProvidersAction().then(setProviders)
  }, [])

  const columns = useMemo<ColumnDef<BenchmarkData>[]>(
    () => [
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
    ],
    [t, pageIndex, pageSize]
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const sortField = sorting[0]?.id || 'overallQualityScore'
      const sortOrder = sorting[0]?.desc ? 'desc' : 'asc'

      const result = await getBenchmarksAction({
        sortBy: sortField,
        sortOrder,
        provider: providerFilter !== 'all' ? providerFilter : undefined,
        tier: tierFilter !== 'all' ? tierFilter : undefined,
        limit: pageSize,
        offset: pageIndex * pageSize,
      })

      setData(result.benchmarks)
      setTotalCount(result.totalCount)
    } catch (err) {
      console.error('Failed to fetch benchmarks', err)
    } finally {
      setLoading(false)
    }
  }, [sorting, providerFilter, tierFilter, pageSize, pageIndex])

  useEffect(() => {
    void loadData()
  }, [loadData])

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
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors even:bg-white/[0.02] hover:bg-white/5"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-4 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
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
