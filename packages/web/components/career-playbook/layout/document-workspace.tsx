'use client'

import type { ReactNode } from 'react'
import { BookOpen, FileText } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface CareerPlaybookPreviewSection {
  id: string
  title: string
  value?: string
  muted?: boolean
}

interface CareerPlaybookWorkspaceProps {
  children: ReactNode
  className?: string
  testId?: string
}

export function CareerPlaybookWorkspace({
  children,
  className,
  testId,
}: CareerPlaybookWorkspaceProps) {
  return (
    <section
      data-testid={testId}
      className={cn('mx-auto w-full max-w-[1760px] px-4 py-5 md:px-6 xl:py-7', className)}
    >
      {children}
    </section>
  )
}

interface CareerPlaybookDocumentShellProps {
  navigation: ReactNode
  document: ReactNode
  panel: ReactNode
  className?: string
  testId?: string
}

export function CareerPlaybookDocumentShell({
  navigation,
  document,
  panel,
  className,
  testId = 'career-playbook-document-shell',
}: CareerPlaybookDocumentShellProps) {
  return (
    <section
      data-testid={testId}
      className={cn(
        'grid w-full items-start gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_27rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_30rem]',
        className
      )}
    >
      <div className="order-1 xl:order-1">{navigation}</div>
      <div className="order-2 min-w-0 xl:order-2">{document}</div>
      <div className="order-3 min-w-0 xl:order-3">{panel}</div>
    </section>
  )
}

interface CareerPlaybookDocumentPreviewProps {
  label?: string
  title: string
  subtitle?: string
  sections: CareerPlaybookPreviewSection[]
  emptyLabel?: string
  footer?: ReactNode
  className?: string
}

export function CareerPlaybookDocumentPreview({
  label = 'Черновик',
  title,
  subtitle,
  sections,
  emptyLabel = 'Появится после ответа',
  footer,
  className,
}: CareerPlaybookDocumentPreviewProps) {
  return (
    <article
      data-testid="career-playbook-document-preview"
      className={cn('career-playbook-document min-h-[34rem] px-5 py-6 md:px-8 md:py-8', className)}
    >
      <header className="career-playbook-document-rule space-y-5 border-b pb-5">
        <div className="flex items-center justify-between gap-4">
          <span className="career-playbook-pill inline-flex items-center gap-2 px-3 py-1.5 text-[13px] leading-5 font-medium text-slate-600 dark:text-slate-300">
            <FileText className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
            {label}
          </span>
          <BookOpen className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden />
        </div>
        <div className="max-w-3xl space-y-2">
          <h2 className="text-[28px] leading-9 font-semibold tracking-normal text-slate-950 md:text-[34px] md:leading-[2.65rem] dark:text-slate-50">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-[15px] leading-7 text-slate-600 dark:text-slate-300">{subtitle}</p>
          ) : null}
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        {sections.map((section) => {
          const value = section.value?.trim()

          return (
            <section key={section.id} className="career-playbook-muted-card p-4">
              <h3 className="text-[13px] leading-5 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {section.title}
              </h3>
              <p
                className={cn(
                  'mt-2 text-[16px] leading-7 break-words whitespace-pre-wrap text-slate-900 dark:text-slate-100',
                  !value || section.muted ? 'text-slate-500 dark:text-slate-400' : null
                )}
              >
                {value || emptyLabel}
              </p>
            </section>
          )
        })}
      </div>

      {footer ? (
        <footer className="career-playbook-document-rule mt-6 border-t pt-5">{footer}</footer>
      ) : null}
    </article>
  )
}
