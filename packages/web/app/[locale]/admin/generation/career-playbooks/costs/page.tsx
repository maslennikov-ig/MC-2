import { getTranslations, setRequestLocale } from 'next-intl/server'

import {
  CareerPlaybookCostEvidenceTable,
  type CareerPlaybookCostEvidence,
} from '@/components/career-playbook/admin/CareerPlaybookCostEvidenceTable'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import { Locale } from '@/src/i18n/config'

type Props = {
  params: Promise<{ locale: Locale }>
}

export default async function CareerPlaybookCostsPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('admin.careerPlaybookCosts')
  const client = await getServerTrpcClient()
  const evidence = (await client.admin.getCareerPlaybookCostEvidence.query({
    limit: 50,
  })) as CareerPlaybookCostEvidence

  return (
    <div className="flex min-h-[calc(100vh-100px)] flex-col space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <p className="max-w-3xl text-gray-600 dark:text-gray-300">{t('description')}</p>
      </div>

      <CareerPlaybookCostEvidenceTable
        evidence={evidence}
        locale={locale}
        emptyLabel={t('empty')}
        labels={{
          playbooks: t('labels.playbooks'),
          playbookSingular: t('labels.playbookSingular'),
          playbookPlural: t('labels.playbookPlural'),
          totalCost: t('labels.totalCost'),
          tokens: t('labels.tokens'),
          inputOutput: t('labels.inputOutput'),
          stage: t('labels.stage'),
          node: t('labels.node'),
          model: t('labels.model'),
          input: t('labels.input'),
          output: t('labels.output'),
          cost: t('labels.cost'),
          created: t('labels.created'),
          invalidCostBreakdown: t('labels.invalidCostBreakdown'),
        }}
      />
    </div>
  )
}
