'use client'

import { useTranslations } from 'next-intl'
import { BenchmarkData } from '@/app/actions/benchmarks'
import { TopModelsCards } from './top-models-cards'
import { ModelsRankingTable } from './models-ranking-table'

interface BenchmarksClientProps {
  topModels: BenchmarkData[]
  locale: string
}

export function BenchmarksClient({ topModels, locale }: BenchmarksClientProps) {
  const t = useTranslations('benchmarks')

  return (
    <div className="mx-auto max-w-6xl space-y-12">
      {/* Top 3 Models Cards */}
      {topModels.length > 0 && (
        <section>
          <h2 className="mb-6 text-2xl font-semibold text-white">{t('topModels.title')}</h2>
          <TopModelsCards models={topModels} />
        </section>
      )}

      {/* Ranking Table */}
      <section>
        <h2 className="mb-6 text-2xl font-semibold text-white">{t('ranking.title')}</h2>
        <ModelsRankingTable locale={locale} />
      </section>
    </div>
  )
}
