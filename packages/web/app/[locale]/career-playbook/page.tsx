import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { defaultLocale, locales, type Locale } from '@/src/i18n/config'
import CareerPlaybookLandingPageClient from './page-client'

type Props = {
  params: Promise<{ locale: Locale }>
}

export default async function CareerPlaybookLandingPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'career-playbook.landing' })
  const pageUrl = getCareerPlaybookPageUrl(locale)

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('metadataTitle'),
    description: t('metadataDescription'),
    url: pageUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: 'MegaCampusAI',
    },
  }

  return (
    <>
      <CareerPlaybookLandingPageClient />
      <script
        data-testid="career-playbook-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'career-playbook.landing' })
  const title = t('metadataTitle')
  const description = t('metadataDescription')
  const pagePath = getCareerPlaybookPagePath(locale)

  return {
    title,
    description,
    alternates: {
      canonical: pagePath,
      languages: getCareerPlaybookLanguageAlternates(),
    },
    openGraph: {
      title,
      description,
      url: pagePath,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

function getCareerPlaybookPagePath(locale: Locale) {
  return locale === defaultLocale ? '/career-playbook' : `/${locale}/career-playbook`
}

function getCareerPlaybookLanguageAlternates() {
  return Object.fromEntries(locales.map((locale) => [locale, getCareerPlaybookPagePath(locale)]))
}

function getCareerPlaybookPageUrl(locale: Locale) {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  return new URL(getCareerPlaybookPagePath(locale), baseUrl).toString()
}
