'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import type { TierSettings } from '@megacampus/shared-types';
import { TierEditDialog } from './tier-edit-dialog';

interface PricingTableProps {
  initialTiers: TierSettings[];
}

const TIER_ORDER: Record<string, number> = {
  trial: 0,
  free: 1,
  basic: 2,
  standard: 3,
  premium: 4,
};

export function PricingTable({ initialTiers }: PricingTableProps) {
  const t = useTranslations('admin.pricing');
  const [tiers, setTiers] = useState<TierSettings[]>(
    [...initialTiers].sort((a, b) => TIER_ORDER[a.tierKey] - TIER_ORDER[b.tierKey])
  );
  const [editingTier, setEditingTier] = useState<TierSettings | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatPrice = (cents: number): string => {
    if (cents === 0) return 'Free';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getTierDisplayName = (tier: TierSettings): string => {
    // Try to get translated name, fall back to database value
    const translationKey = `tierNames.${tier.tierKey}` as const;
    const translatedName = t(translationKey as Parameters<typeof t>[0]);
    // If translation returns the key itself, use database value
    return translatedName.startsWith('tierNames.') ? tier.displayName : translatedName;
  };

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return (
        <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
          {t('active')}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-gray-500/10 text-gray-500 hover:bg-gray-500/20">
        {t('inactive')}
      </Badge>
    );
  };

  const handleTierUpdated = (updatedTier: TierSettings) => {
    setTiers((prev) =>
      prev.map((tier) => (tier.tierKey === updatedTier.tierKey ? updatedTier : tier))
    );
    setEditingTier(null);
  };

  return (
    <>
      <div className="rounded-md border bg-card shadow-sm overflow-hidden">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('tier')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('displayName')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('storage')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('maxFileSize')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('filesPerCourse')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('concurrentJobs')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('price')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('status')}
                </th>
                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">
                  {t('edit')}
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {tiers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="h-24 text-center text-muted-foreground">
                    {t('table.noTiers')}
                  </td>
                </tr>
              ) : (
                tiers.map((tier) => (
                  <tr
                    key={tier.tierKey}
                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                  >
                    <td className="p-4 align-middle">
                      <span className="font-mono text-xs uppercase bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-1 rounded">
                        {tier.tierKey}
                      </span>
                    </td>
                    <td className="p-4 align-middle">
                      <span className="font-medium">{getTierDisplayName(tier)}</span>
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {formatBytes(tier.storageQuotaBytes)}
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {formatBytes(tier.maxFileSizeBytes)}
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {tier.maxFilesPerCourse}
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {tier.maxConcurrentJobs}
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {formatPrice(tier.monthlyPriceCents)}
                    </td>
                    <td className="p-4 align-middle">{getStatusBadge(tier.isActive)}</td>
                    <td className="p-4 align-middle text-right">
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
  );
}
