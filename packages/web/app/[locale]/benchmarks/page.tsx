import { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { Locale } from '@/src/i18n/config'
import { Link } from '@/src/i18n/navigation'
import Logo from '@/components/common/logo'
import { BenchmarksClient } from './components/benchmarks-client'
import { getTopModelsAction, getLatestTestDateAction } from '@/app/actions/benchmarks'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'benchmarks' })

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
    keywords: [
      'LLM benchmarks',
      'AI model comparison',
      'language model quality',
      'GPT benchmarks',
      'DeepSeek benchmarks',
    ],
    openGraph: {
      title: t('metadata.ogTitle'),
      description: t('metadata.ogDescription'),
      url: '/benchmarks',
      type: 'website',
    },
    twitter: {
      title: t('metadata.twitterTitle'),
      description: t('metadata.twitterDescription'),
    },
    alternates: {
      canonical: '/benchmarks',
    },
  }
}

type Props = {
  params: Promise<{ locale: Locale }>
}

export default async function BenchmarksPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('benchmarks')

  // Fetch initial data for hero section
  const [topModels, latestTestDate] = await Promise.all([
    getTopModelsAction(),
    getLatestTestDateAction(),
  ])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-white/70 transition-colors hover:text-white">
            ← {t('backToHome')}
          </Link>
          <Logo variant="compact" size="md" />
        </div>

        {/* Hero Section */}
        <div className="mx-auto mb-12 max-w-6xl">
          <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">{t('hero.title')}</h1>
          <p className="mb-2 text-xl text-white/80">{t('hero.subtitle')}</p>
          {latestTestDate && (
            <p className="text-sm text-white/60">
              {t('hero.lastUpdated')}: {new Date(latestTestDate).toLocaleDateString(locale)}
            </p>
          )}
        </div>

        {/* Client Component with all interactive features */}
        <BenchmarksClient topModels={topModels} locale={locale} />
      </div>
    </div>
  )
}
