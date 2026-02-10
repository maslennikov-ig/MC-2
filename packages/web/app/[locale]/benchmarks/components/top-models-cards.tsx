'use client'

import { useTranslations } from 'next-intl'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Award } from 'lucide-react'
import { BenchmarkData } from '@/app/actions/benchmarks'
import { cn } from '@/lib/utils'

interface TopModelsCardsProps {
  models: BenchmarkData[]
}

const TIER_COLORS = {
  S: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  A: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  B: 'bg-green-500/20 text-green-300 border-green-500/50',
  C: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  D: 'bg-red-500/20 text-red-300 border-red-500/50',
}

const RANK_STYLES = [
  {
    icon: Trophy,
    gradient: 'from-yellow-400/20 via-yellow-500/20 to-amber-600/20',
    border: 'border-yellow-500/50',
    iconColor: 'text-yellow-400',
  },
  {
    icon: Medal,
    gradient: 'from-gray-300/20 via-gray-400/20 to-gray-500/20',
    border: 'border-gray-400/50',
    iconColor: 'text-gray-300',
  },
  {
    icon: Award,
    gradient: 'from-orange-400/20 via-orange-500/20 to-orange-600/20',
    border: 'border-orange-500/50',
    iconColor: 'text-orange-400',
  },
]

export function TopModelsCards({ models }: TopModelsCardsProps) {
  const t = useTranslations('benchmarks')

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {models.slice(0, 3).map((model, index) => {
        const rankStyle = RANK_STYLES[index]
        const Icon = rankStyle.icon

        return (
          <Card
            key={model.modelSlug}
            className={cn(
              'border-2 bg-gradient-to-br backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-xl',
              rankStyle.gradient,
              rankStyle.border
            )}
          >
            <CardHeader className="pb-4">
              <div className="mb-2 flex items-start justify-between">
                <Badge variant="outline" className={TIER_COLORS[model.qualityTier]}>
                  {/* Dynamic translation key from tier value (S, A, B, C, D) */}
                  {t(`tiers.${model.qualityTier}`)}
                </Badge>
                <Icon className={cn('h-8 w-8', rankStyle.iconColor)} />
              </div>
              <CardTitle className="text-xl text-white">{model.modelName}</CardTitle>
              <p className="text-sm text-white/60">{model.provider}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">{t('metrics.quality')}</span>
                  <span className="font-semibold text-white">
                    {(model.overallQualityScore * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">{t('metrics.content')}</span>
                  <span className="font-semibold text-white">
                    {(model.contentQualityScore * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">{t('metrics.errorRate')}</span>
                  <span className="font-semibold text-white">
                    {(model.errorRate * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              {model.criticalIssues > 0 && (
                <div className="border-t border-white/10 pt-2">
                  <span className="text-sm text-red-400">
                    {t('metrics.criticalIssues')}: {model.criticalIssues}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
