'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import type { TierSettings } from '@megacampus/shared-types'
import { TierEditDialog } from './tier-edit-dialog'

interface PricingTableProps {
  initialTiers: TierSettings[]
}

const TIER_ORDER: Record<string, number> = {
  trial: 0,
  free: 1,
  basic: 2,
  standard: 3,
  premium: 4,
}

export function PricingTable({ initialTiers }: PricingTableProps) {
  const t = useTranslations('admin.pricing')
  const [tiers, setTiers] = useState<TierSettings[]>(
    [...initialTiers].sort((a, b) => TIER_ORDER[a.tierKey] - TIER_ORDER[b.tierKey])
  )
  const [editingTier, setEditingTier] = useState<TierSettings | null>(null)

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const formatPrice = (cents: number): string => {
    if (cents === 0) return 'Free'
    return `$${(cents / 100).toFixed(2)}`
  }

  const getTierDisplayName = (tier: TierSettings): string => {
    // Try to get translated name, fall back to database value
    const translationKey = `tierNames.${tier.tierKey}` as const
    const translatedName = t(translationKey as Parameters<typeof t>[0])
    // If translation returns the key itself, use database value
    return translatedName.startsWith('tierNames.') ? tier.displayName : translatedName
  }

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return (
        <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
          {t('active')}
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="bg-gray-500/10 text-gray-500 hover:bg-gray-500/20">
        {t('inactive')}
      </Badge>
    )
  }

  const handleTierUpdated = (updatedTier: TierSettings) => {
    setTiers((prev) =>
      prev.map((tier) => (tier.tierKey === updatedTier.tierKey ? updatedTier : tier))
    )
    setEditingTier(null)
  }

  return (
    <>
      <div className="bg-card overflow-hidden rounded-md border shadow-sm">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('tier')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('displayName')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('storage')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('maxFileSize')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('filesPerCourse')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('concurrentJobs')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('price')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('status')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-right align-middle font-medium">
                  {t('edit')}
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {tiers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-muted-foreground h-24 text-center">
                    {t('table.noTiers')}
                  </td>
                </tr>
              ) : (
                tiers.map((tier) => (
                  <tr
                    key={tier.tierKey}
                    className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
                  >
                    <td className="p-4 align-middle">
                      <span className="rounded bg-purple-50 px-2 py-1 font-mono text-xs text-purple-600 uppercase dark:bg-purple-500/10 dark:text-purple-400">
                        {tier.tierKey}
                      </span>
                    </td>
                    <td className="p-4 align-middle">
                      <span className="font-medium">{getTierDisplayName(tier)}</span>
                    </td>
                    <td className="text-muted-foreground p-4 align-middle">
                      {formatBytes(tier.storageQuotaBytes)}
                    </td>
                    <td className="text-muted-foreground p-4 align-middle">
                      {formatBytes(tier.maxFileSizeBytes)}
                    </td>
                    <td className="text-muted-foreground p-4 align-middle">
                      {tier.maxFilesPerCourse}
                    </td>
                    <td className="text-muted-foreground p-4 align-middle">
                      {tier.maxConcurrentJobs}
                    </td>
                    <td className="text-muted-foreground p-4 align-middle">
                      {formatPrice(tier.monthlyPriceCents)}
                    </td>
                    <td className="p-4 align-middle">{getStatusBadge(tier.isActive)}</td>
                    <td className="p-4 text-right align-middle">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingTier(tier)}
                        aria-label={`${t('edit')} ${tier.displayName}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingTier && (
        <TierEditDialog
          tier={editingTier}
          onClose={() => setEditingTier(null)}
          onTierUpdated={handleTierUpdated}
        />
      )}
    </>
  )
}
