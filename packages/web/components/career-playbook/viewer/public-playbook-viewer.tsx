import { MarkdownRenderer } from '@/components/markdown'
import type { CareerPlaybookPublicSharePlaybook } from '@/components/career-playbook/library/types'

interface PublicPlaybookViewerProps {
  title: string
  playbook: CareerPlaybookPublicSharePlaybook
}

export function PublicPlaybookViewer({ title, playbook }: PublicPlaybookViewerProps) {
  return (
    <article
      data-testid="career-playbook-public-document"
      className="career-playbook-document p-6 md:p-8"
    >
      <header className="mb-4 space-y-2">
        <h1 className="text-[32px] leading-10 font-semibold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          {playbook.department ? (
            <span className="career-playbook-pill px-2 py-1">{playbook.department}</span>
          ) : null}
          {playbook.level ? (
            <span className="career-playbook-pill px-2 py-1">{playbook.level}</span>
          ) : null}
        </div>
      </header>
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <MarkdownRenderer content={playbook.markdown} preset="preview" trusted={false} />
      </div>
    </article>
  )
}
