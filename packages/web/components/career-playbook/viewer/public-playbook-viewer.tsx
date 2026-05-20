import { MarkdownRenderer } from '@/components/markdown'
import type { CareerPlaybookPublicSharePlaybook } from '@/components/career-playbook/library/types'

interface PublicPlaybookViewerProps {
  title: string
  playbook: CareerPlaybookPublicSharePlaybook
}

export function PublicPlaybookViewer({ title, playbook }: PublicPlaybookViewerProps) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-4 space-y-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          {playbook.department ? (
            <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
              {playbook.department}
            </span>
          ) : null}
          {playbook.level ? (
            <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
              {playbook.level}
            </span>
          ) : null}
        </div>
      </header>
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <MarkdownRenderer content={playbook.markdown} preset="preview" trusted={false} />
      </div>
    </article>
  )
}
