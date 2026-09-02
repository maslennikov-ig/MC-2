import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import type { Locale } from '@/src/i18n/config'
import { PublicPlaybookViewer } from '@/components/career-playbook/viewer/public-playbook-viewer'
import { getCareerPlaybookView, type CareerPlaybookViewAudience } from './data'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type PageProps = {
  params: Promise<{ locale: Locale; playbookId: string; token: string }>
}

const READER_LABEL: Record<CareerPlaybookViewAudience, { ru: string; en: string }> = {
  employee: { ru: 'Версия для сотрудника', en: 'Employee view' },
  manager: { ru: 'Версия для руководителя', en: 'Manager view' },
  hr: { ru: 'Версия для HR', en: 'HR view' },
}

/**
 * A role guide addressed to one reader.
 *
 * The link is the credential: the server reads the audience out of the token
 * and assembles only that reader's sections. There is no view switcher here on
 * purpose — a control that could widen the document would defeat the point.
 */
export default async function CareerPlaybookViewPage({ params }: PageProps) {
  const { locale, playbookId, token } = await params
  setRequestLocale(locale)

  const result = await getCareerPlaybookView({ playbookId, token })
  if (result.status !== 'ok' || !result.playbook) {
    notFound()
  }

  const label = result.audience ? READER_LABEL[result.audience] : null

  return (
    <main className="career-playbook-zone">
      <section className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
        {label ? (
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            {locale === 'ru' ? label.ru : label.en}
          </p>
        ) : null}
        <PublicPlaybookViewer title={result.playbook.title} playbook={result.playbook} />
      </section>
    </main>
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { playbookId, token } = await params
  const result = await getCareerPlaybookView({ playbookId, token })

  if (result.status !== 'ok' || !result.playbook) {
    return { title: 'Role guide', robots: { index: false, follow: false } }
  }

  return {
    title: result.playbook.title,
    description: result.playbook.summary,
    // A reader-scoped link must never reach a search index.
    robots: { index: false, follow: false },
  }
}
