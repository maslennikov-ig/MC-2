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
      <main className="career-playbook-motion-page relative z-10 text-white">
        <section className="career-playbook-motion-section grid min-h-[calc(100svh-4.75rem)] overflow-hidden px-4 py-10 sm:px-6 md:py-12 lg:px-10 xl:px-12 2xl:px-16">
          <div className="career-playbook-wide-container mx-auto grid w-full max-w-[96rem] content-center gap-10 xl:grid-cols-[minmax(0,0.95fr)_minmax(28rem,0.72fr)] xl:items-center">
            <div className="max-w-5xl">
              <Badge className="mb-5 rounded-md border border-cyan-300/30 bg-cyan-300/12 text-cyan-100 hover:bg-cyan-300/12">
                {t('heroEyebrow')}
              </Badge>
              <h1 className="max-w-5xl text-4xl leading-[1.04] font-bold text-white md:text-6xl xl:text-7xl">
                {t('heroTitle')}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-200 md:text-xl">
                {t('heroSubtitle')}
              </p>

              <div className="mt-5 max-w-3xl rounded-lg border border-cyan-200/20 bg-slate-950/20 px-4 py-3 text-sm leading-6 text-slate-200 backdrop-blur-sm">
                <div className="flex gap-3">
                  <BookOpenCheck
                    className="mt-1 h-4 w-4 shrink-0 text-cyan-200"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold text-white">{t('heroMethodologyLine')}</p>
                    <p className="mt-1 text-slate-300">{t('heroBooksLine')}</p>
                  </div>
                </div>
              </div>

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

              <div className="mt-8 grid max-w-5xl gap-3 sm:grid-cols-3">
                <HeroMetric value={t('heroMetricOneValue')} label={t('heroMetricOneLabel')} />
                <HeroMetric value={t('heroMetricTwoValue')} label={t('heroMetricTwoLabel')} />
                <HeroMetric value={t('heroMetricThreeValue')} label={t('heroMetricThreeLabel')} />
              </div>
            </div>

            <HeroDocumentPreview
              title={t('heroPreviewTitle')}
              subtitle={t('heroPreviewSubtitle')}
              contextLabel={t('heroPreviewContextLabel')}
              role={t('heroPreviewRole')}
              companyLabel={t('heroPreviewCompanyLabel')}
              company={t('heroPreviewCompany')}
              draftLabel={t('heroPreviewDraftLabel')}
              draft={t('heroPreviewDraft')}
              signalOne={t('heroPreviewSignalOne')}
              signalTwo={t('heroPreviewSignalTwo')}
              signalThree={t('heroPreviewSignalThree')}
              qualityTitle={t('heroPreviewQualityTitle')}
              qualityText={t('heroPreviewQualityText')}
            />
          </div>
        </section>

        <section className="career-playbook-motion-section relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white md:py-20">
          <div className="career-playbook-wide-container mx-auto grid max-w-[96rem] gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
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

        <section className="career-playbook-motion-section relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white md:py-20">
          <div className="career-playbook-wide-container mx-auto max-w-[96rem]">
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

        <section className="career-playbook-motion-section relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white">
          <div className="career-playbook-wide-container mx-auto grid max-w-[96rem] gap-5 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
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
                  className="career-playbook-motion-card group grid gap-4 rounded-xl border border-white/10 bg-white/[0.06] p-5 transition-colors hover:border-cyan-300/35 hover:bg-white/[0.08] md:grid-cols-[3rem_1fr] md:p-6"
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

        <section className="career-playbook-motion-section relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white md:py-20">
          <div className="career-playbook-wide-container mx-auto max-w-[96rem] text-center">
            <div className="mx-auto max-w-4xl">
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
          </div>
        </section>
      </main>
    </ShaderBackground>
  )
}

function HeroDocumentPreview({
  title,
  subtitle,
  contextLabel,
  role,
  companyLabel,
  company,
  draftLabel,
  draft,
  signalOne,
  signalTwo,
  signalThree,
  qualityTitle,
  qualityText,
}: {
  title: string
  subtitle: string
  contextLabel: string
  role: string
  companyLabel: string
  company: string
  draftLabel: string
  draft: string
  signalOne: string
  signalTwo: string
  signalThree: string
  qualityTitle: string
  qualityText: string
}) {
  const signals = [
    { icon: <ClipboardCheck className="h-4 w-4" aria-hidden="true" />, label: signalOne },
    { icon: <BookOpenCheck className="h-4 w-4" aria-hidden="true" />, label: signalTwo },
    { icon: <Workflow className="h-4 w-4" aria-hidden="true" />, label: signalThree },
  ]

  return (
    <aside className="career-playbook-hero-preview career-playbook-motion-card hidden rounded-2xl border border-cyan-200/20 bg-slate-950/30 p-4 shadow-2xl shadow-slate-950/45 backdrop-blur-md xl:block">
      <div className="career-playbook-hero-preview-card rounded-xl border border-cyan-200/25 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(49,46,129,0.7))] p-6 text-white shadow-[0_35px_90px_rgba(15,23,42,0.35)] ring-1 ring-white/10 2xl:p-7">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold tracking-wide text-cyan-200 uppercase">
              {draftLabel}
            </p>
            <h2 className="mt-2 text-3xl leading-tight font-bold text-white">{title}</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-200">{subtitle}</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-cyan-200/25 bg-cyan-200/10 text-cyan-100">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-7 grid gap-3">
          <div className="rounded-lg border border-cyan-100/15 bg-white/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              <span>{contextLabel}</span>
            </div>
            <p className="mt-2 text-xl font-semibold text-white">{role}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-cyan-100/15 bg-white/[0.08] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <span>{companyLabel}</span>
              </div>
              <p className="mt-2 text-base font-semibold text-white">{company}</p>
            </div>
            <div className="rounded-lg border border-cyan-100/15 bg-white/[0.08] p-4">
              <p className="text-sm font-semibold text-slate-300">{draftLabel}</p>
              <p className="mt-2 text-base font-semibold text-white">{draft}</p>
            </div>
          </div>
        </div>

        <div className="mt-7 rounded-lg border border-violet-200/20 bg-violet-200/10 p-4">
          <p className="text-sm font-semibold text-violet-100">{qualityTitle}</p>
          <p className="mt-2 text-sm leading-6 text-slate-200">{qualityText}</p>
        </div>

        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="grid gap-2">
            {signals.map((signal) => (
              <div
                key={signal.label}
                className="flex min-h-11 items-center gap-3 rounded-md border border-white/10 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-slate-100"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-200/10 text-cyan-100">
                  {signal.icon}
                </span>
                <span>{signal.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="career-playbook-motion-card rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
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
    <div className="career-playbook-motion-card rounded-lg border border-white/10 bg-white/5 p-5">
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
    <div className="career-playbook-motion-card rounded-xl border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-slate-950/20">
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
    <div className="career-playbook-motion-card flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-medium text-slate-100">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
        {icon}
      </span>
      <span>{label}</span>
    </div>
  )
}
