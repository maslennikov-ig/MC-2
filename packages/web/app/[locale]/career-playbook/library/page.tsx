import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { getCurrentUser } from '@/lib/auth-helpers'
import type { Locale } from '@/src/i18n/config'
import type {
  CareerPlaybookLibraryFilters,
  CareerPlaybookLibrarySort,
  CareerPlaybookLibraryStatus,
} from '@/components/career-playbook/library/types'
import CareerPlaybookLibraryAuthRequiredClient from './auth-required-client'
import { getCareerPlaybookLibrary } from './data'
import CareerPlaybookLibraryPageClient from './page-client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type Props = {
  params: Promise<{ locale: Locale }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const VALID_STATUSES = new Set<CareerPlaybookLibraryStatus>([
  'draft',
  'answering_fixed',
  'awaiting_followups',
  'answering_followups',
  'ready_to_generate',
  'generating',
  'completed',
  'failed',
])

const VALID_SORTS = new Set<CareerPlaybookLibrarySort>([
  'created_desc',
  'created_asc',
  'title_asc',
  'title_desc',
])

function readSearchParam(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value
  const trimmed = normalized?.trim()
  return trimmed ? trimmed : undefined
}

function buildLibraryFilters(
  searchParams: Record<string, string | string[] | undefined>
): CareerPlaybookLibraryFilters {
  const status = readSearchParam(searchParams.status)
  const sort = readSearchParam(searchParams.sort)

  return {
    search: readSearchParam(searchParams.search),
    status:
      status && VALID_STATUSES.has(status as CareerPlaybookLibraryStatus)
        ? (status as CareerPlaybookLibraryStatus)
        : undefined,
    department: readSearchParam(searchParams.department),
    level: readSearchParam(searchParams.level),
    sort:
      sort && VALID_SORTS.has(sort as CareerPlaybookLibrarySort)
        ? (sort as CareerPlaybookLibrarySort)
        : 'created_desc',
  }
}

export default async function CareerPlaybookLibraryPage({ params, searchParams }: Props) {
  const { locale } = await params
  const searchParamsResolved = (await searchParams) ?? {}
  setRequestLocale(locale)
  const user = await getCurrentUser()

  if (!user) {
    return <CareerPlaybookLibraryAuthRequiredClient locale={locale} />
  }

  const filters = buildLibraryFilters(searchParamsResolved)
  const initialData = await getCareerPlaybookLibrary({
    userId: user.id,
    limit: 50,
    ...filters,
  })

  return (
    <CareerPlaybookLibraryPageClient locale={locale} initialData={initialData} filters={filters} />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'career-playbook.library' })
  return {
    title: t('title'),
    description: t('subtitle'),
  }
}
