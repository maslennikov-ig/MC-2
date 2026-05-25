'use client'

import type { ReactNode } from 'react'
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  ClipboardCheck,
  Cpu,
  FileText,
  Workflow,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  InteractiveDemo,
  type CareerPlaybookDemoSection,
} from '@/components/career-playbook/methodology/InteractiveDemo'
import {
  MethodologySection,
  type CareerPlaybookBlockGroup,
  type CareerPlaybookMethodology,
} from '@/components/career-playbook/methodology/MethodologySection'
import Header from '@/components/layouts/header'
import ShaderBackground from '@/components/layouts/shader-background'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Link } from '@/src/i18n/navigation'

const methodologyIds = ['netflix', 'amazon', 'toyota', 'spotify', 'bridgewater', 'google'] as const
const blockGroupIds = ['foundation', 'operations', 'people', 'growth', 'system', 'wrap'] as const
const demoSectionIds = [
  'mission',
  'antiGoals',
  'responsibilities',
  'duties',
  'decisions',
  'kpi',
] as const
const faqItemIds = ['0', '1', '2'] as const
const faqHighlightIds = ['0', '1', '2'] as const
const personalizationStepIds = ['0', '1', '2'] as const

type MethodologyId = (typeof methodologyIds)[number]
type BlockGroupId = (typeof blockGroupIds)[number]
type BlockId =
  | 'block1'
  | 'block2'
  | 'block3'
  | 'block4'
  | 'block5'
  | 'block6'
  | 'block7'
  | 'block8'
  | 'block9'
  | 'block10'
  | 'block11'
  | 'block12'
  | 'block13'
  | 'block14'
  | 'block15'
  | 'block16'
  | 'block17'
  | 'block18'
  | 'block19'
  | 'block20'
  | 'block21'
  | 'block22'
  | 'block23'
  | 'block24'
  | 'block25'
  | 'block26'

const blockGroupBlockIds: Record<BlockGroupId, BlockId[]> = {
  foundation: ['block1', 'block2', 'block5'],
  operations: ['block3', 'block4', 'block6', 'block8'],
  people: ['block7', 'block9', 'block12', 'block13'],
  growth: ['block11', 'block14', 'block15', 'block17'],
  system: ['block10', 'block16', 'block19', 'block20', 'block21'],
  wrap: ['block18', 'block22', 'block23', 'block24', 'block25', 'block26'],
}

const affectedBlockKeys: Record<MethodologyId, BlockId[]> = {
  netflix: ['block1', 'block2', 'block5', 'block22'],
  amazon: ['block5', 'block6', 'block18', 'block20'],
  toyota: ['block4', 'block16', 'block14', 'block21'],
  spotify: ['block3', 'block10', 'block23', 'block24'],
  bridgewater: ['block7', 'block12', 'block15', 'block17'],
  google: ['block3', 'block7', 'block10', 'block25'],
}

export default function CareerPlaybookLandingPageClient() {
  const t = useTranslations('career-playbook.landing')
  const blockGroups: CareerPlaybookBlockGroup[] = blockGroupIds.map((groupId) => ({
    title: t(`blockMap.groups.${groupId}.title`),
    blocks: blockGroupBlockIds[groupId].map((blockId) => ({
      id: blockId,
      label: t(`blockMap.blocks.${blockId}`),
    })),
  }))
  const methodologies: CareerPlaybookMethodology[] = methodologyIds.map((id) => ({
    id,
    title: t(`methodologies.${id}.title`),
    description: t(`methodologies.${id}.description`),
    affectedBlocks: affectedBlockKeys[id].map((blockId) => t(`blockMap.blocks.${blockId}`)),
  }))
  const demoSections: CareerPlaybookDemoSection[] = demoSectionIds.map((id) => ({
    id,
    title: t(`demoSections.${id}.title`),
    excerpt: t(`demoSections.${id}.excerpt`),
    annotation: t(`demoSections.${id}.annotation`),
    blockLabel: t(`demoSections.${id}.blockLabel`),
  }))

  return (
    <ShaderBackground>
      <Header darkMode={true} />
      <main className="relative z-10 text-white">
        <section className="grid min-h-[calc(100svh-4.75rem)] px-4 py-10 md:py-12">
          <div className="mx-auto grid w-full max-w-7xl content-center gap-10">
            <div className="max-w-4xl">
              <Badge className="mb-5 rounded-md border border-cyan-300/30 bg-cyan-300/12 text-cyan-100 hover:bg-cyan-300/12">
                {t('heroEyebrow')}
              </Badge>
              <h1 className="max-w-4xl text-4xl font-bold text-white md:text-6xl">
                {t('heroTitle')}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">{t('heroSubtitle')}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-primary text-primary-foreground shadow-primary/20 hover:bg-primary/90 rounded-md shadow-lg"
                >
                  <Link href="/career-playbook/new">
                    {t('ctaPrimary')}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-md border-white/25 bg-white/10 text-white hover:bg-white/15"
                >
                  <a href="#example">{t('ctaSecondary')}</a>
                </Button>
              </div>
            </div>

            <div className="grid max-w-4xl gap-3 sm:grid-cols-3">
              <HeroMetric value={t('heroMetricOneValue')} label={t('heroMetricOneLabel')} />
              <HeroMetric value={t('heroMetricTwoValue')} label={t('heroMetricTwoLabel')} />
              <HeroMetric value={t('heroMetricThreeValue')} label={t('heroMetricThreeLabel')} />
            </div>
          </div>
        </section>

        <section className="relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white md:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div className="max-w-xl">
              <p className="mb-3 text-sm font-semibold text-cyan-200">
                {t('personalizationEyebrow')}
              </p>
              <h2 className="text-3xl leading-tight font-bold md:text-4xl">
                {t('personalizationTitle')}
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-300">
                {t('personalizationDescription')}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {personalizationStepIds.map((id, index) => (
                <PersonalizationCard
                  key={id}
                  icon={
                    index === 0 ? (
                      <Building2 className="h-5 w-5" aria-hidden="true" />
                    ) : index === 1 ? (
                      <Cpu className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                    )
                  }
                  step={String(index + 1).padStart(2, '0')}
                  title={t(`personalizationSteps.${id}.title`)}
                  description={t(`personalizationSteps.${id}.description`)}
                />
              ))}
            </div>
          </div>
        </section>

        <InteractiveDemo
          eyebrow={t('demoEyebrow')}
          title={t('demoTitle')}
          subtitle={t('demoSubtitle')}
          previewTitle={t('demoPreviewTitle')}
          totalBlocksLabel={t('demoTotalBlocksLabel')}
          shownBlocksLabel={t('demoShownBlocksLabel')}
          remainingBlocksLabel={t('demoRemainingBlocksLabel')}
          outlineLabel={t('demoOutlineLabel')}
          allBlocksButtonLabel={t('demoAllBlocksButtonLabel')}
          allBlocksTitle={t('demoAllBlocksTitle')}
          allBlocksDescription={t('demoAllBlocksDescription')}
          exampleLabel={t('demoExampleLabel')}
          sections={demoSections}
          fullStructureGroups={blockGroups}
        />

        <MethodologySection
          eyebrow={t('methodologyEyebrow')}
          title={t('methodologyTitle')}
          subtitle={t('methodologySubtitle')}
          blocksTitle={t('methodologyBlocksTitle')}
          selectedBlocksLabel={t('selectedBlocksLabel')}
          selectedBlocksDescription={t('selectedBlocksDescription')}
          methodologies={methodologies}
          blockGroups={blockGroups}
        />

        <section className="relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white md:py-20">
          <div className="mx-auto max-w-7xl">
            <p className="mb-3 text-sm font-semibold text-emerald-200">{t('valueEyebrow')}</p>
            <h2 className="max-w-3xl text-3xl font-bold md:text-4xl">{t('valueTitle')}</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <ValueCard
                icon={<BookOpenCheck className="h-5 w-5" aria-hidden="true" />}
                title={t('valueProps.0.title')}
                description={t('valueProps.0.description')}
              />
              <ValueCard
                icon={<Workflow className="h-5 w-5" aria-hidden="true" />}
                title={t('valueProps.1.title')}
                description={t('valueProps.1.description')}
              />
              <ValueCard
                icon={<FileText className="h-5 w-5" aria-hidden="true" />}
                title={t('valueProps.2.title')}
                description={t('valueProps.2.description')}
              />
            </div>
          </div>
        </section>

        <section className="relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white">
          <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
            <div className="rounded-xl border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(8,47,73,0.9),rgba(15,23,42,0.82))] p-6 shadow-2xl shadow-cyan-950/30 md:p-8">
              <p className="text-sm font-semibold text-cyan-200">{t('faqEyebrow')}</p>
              <h2 className="mt-4 max-w-lg text-3xl leading-tight font-bold md:text-4xl">
                {t('faqTitle')}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                {t('faqDescription')}
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {faqHighlightIds.map((id, index) => (
                  <FaqHighlight
                    key={id}
                    icon={
                      index === 0 ? (
                        <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                      ) : index === 1 ? (
                        <Workflow className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      )
                    }
                    label={t(`faqHighlights.${id}`)}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-3">
              {faqItemIds.map((id, index) => (
                <div
                  key={id}
                  className="group grid gap-4 rounded-xl border border-white/10 bg-white/[0.06] p-5 transition-colors hover:border-cyan-300/35 hover:bg-white/[0.08] md:grid-cols-[3rem_1fr] md:p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-sm font-semibold text-cyan-100 transition-colors group-hover:border-cyan-200/40 group-hover:bg-cyan-300/15">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div>
                    <h3 className="text-lg leading-snug font-semibold text-white">
                      {t(`faq.${id}.question`)}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{t(`faq.${id}.answer`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white md:py-20">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold md:text-4xl">{t('finalCtaTitle')}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-300">
              {t('finalCtaDescription')}
            </p>
            <Button
              asChild
              size="lg"
              className="bg-primary text-primary-foreground shadow-primary/20 hover:bg-primary/90 mt-8 rounded-md shadow-lg"
            >
              <Link href="/career-playbook/new" aria-label={t('finalCtaTitle')}>
                {t('finalCtaButton')}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </ShaderBackground>
  )
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
      <div className="text-3xl font-bold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-300">{label}</div>
    </div>
  )
}

function ValueCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-emerald-300/20 bg-emerald-300/12 text-emerald-100">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  )
}

function PersonalizationCard({
  icon,
  step,
  title,
  description,
}: {
  icon: ReactNode
  step: string
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-slate-950/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
          {icon}
        </div>
        <span className="text-sm font-semibold text-slate-500">{step}</span>
      </div>
      <h3 className="mt-5 text-lg leading-snug font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  )
}

function FaqHighlight({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-medium text-slate-100">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
        {icon}
      </span>
      <span>{label}</span>
    </div>
  )
}
