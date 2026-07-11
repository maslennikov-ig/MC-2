'use client'

import { useState } from 'react'
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import enMessages from '@/messages/en/generation.json'
import ruMessages from '@/messages/ru/generation.json'
import { Button } from '@/components/ui/button'
import { QuestionCard } from '@/components/generation-graph/panels/clarifying/QuestionCard'
import { DocumentConflictSection } from '@/components/generation-graph/panels/clarifying/DocumentConflictSection'
import type { DocumentEvidenceQuestionMetadata } from '@megacampus/shared-types'

const runId = '30000000-0000-4000-8000-000000000001'
const conflictId = '30000000-0000-4000-8000-000000000002'
const handbookId = '30000000-0000-4000-8000-000000000003'
const guideId = '30000000-0000-4000-8000-000000000004'

const metadata: DocumentEvidenceQuestionMetadata = {
  schema_version: 'document-conflict-question-v1',
  subject_kind: 'claim_conflict',
  subject_key: 'sha256:synthetic-e4-conflict',
  run_id: runId,
  conflict_id: conflictId,
  document_ids: [handbookId, guideId],
  documents: [
    { document_id: handbookId, document_name: 'Safety handbook.pdf' },
    { document_id: guideId, document_name: 'Operations guide.docx' },
  ],
  document_overflow_count: 0,
  sides: [
    {
      excerpt: 'Complete the review within 24 hours.',
      source_refs: [{ document_id: handbookId, page_number: 12, heading_path: 'Review policy' }],
      source_ref_overflow_count: 0,
    },
    {
      excerpt: 'Complete the review within 48 hours.',
      source_refs: [{ document_id: guideId, heading_path: 'Escalation / Timing' }],
      source_ref_overflow_count: 0,
    },
  ],
  provenance_handle: 'synthetic:e4:conflict',
  course_impact: 'The lesson must teach one unambiguous review deadline.',
  recommendation: 'Teach the 24-hour review window.',
  recommendation_rationale: 'The synthetic safety handbook is marked as the current policy.',
  alternatives: [
    'Teach the 48-hour review window.',
    'Explain both windows and require escalation when they differ.',
  ],
}

export default function DocumentConflictsE4FixturePage() {
  if (process.env.NODE_ENV === 'production') redirect('/')

  const [locale, setLocale] = useState<'en' | 'ru'>('en')
  const [answer, setAnswer] = useState<string>()
  const messages = locale === 'en' ? enMessages : ruMessages

  const manualQuestion = {
    id: 'synthetic-manual-conflict',
    text:
      locale === 'en'
        ? 'Which review window should the course teach?'
        : 'Какой срок проверки должен быть указан в курсе?',
    type: 'single_choice' as const,
    priority: 'critical' as const,
    suggestedAnswers: [
      {
        text: locale === 'en' ? '24 hours' : '24 часа',
        rationale:
          locale === 'en' ? 'Current synthetic safety policy' : 'Актуальная тестовая политика',
        is_recommended: true,
      },
      {
        text: locale === 'en' ? '48 hours' : '48 часов',
        rationale:
          locale === 'en'
            ? 'Legacy synthetic operations guide'
            : 'Тестовое руководство прошлой версии',
      },
    ],
    currentAnswer: answer,
    category: 'document_conflicts',
    evidenceMetadata: metadata,
  }

  const systemQuestion = {
    ...manualQuestion,
    id: 'synthetic-system-conflict',
    text:
      locale === 'en'
        ? 'Automatically resolved example'
        : 'Пример автоматически разрешённого противоречия',
    currentAnswer: locale === 'en' ? '24 hours' : '24 часа',
    answerSource: 'system' as const,
  }

  return (
    <NextIntlClientProvider locale={locale} messages={{ generation: messages }}>
      <main className="min-h-screen bg-stone-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-widest text-orange-700 uppercase dark:text-orange-300">
                E4 synthetic browser fixture
              </p>
              <h1 className="mt-1 text-2xl font-semibold">
                {locale === 'en' ? 'Document conflicts' : 'Противоречия в документах'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                {locale === 'en'
                  ? 'Synthetic content only. No uploaded document text or production data is shown.'
                  : 'Только синтетические данные. Тексты загруженных документов и производственные данные не используются.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocale((current) => (current === 'en' ? 'ru' : 'en'))}
            >
              {locale === 'en' ? 'Русский' : 'English'}
            </Button>
          </header>

          {!answer && (
            <DocumentConflictSection
              pendingRequiredCount={1}
              onReviewFirst={() =>
                document.getElementById('clarifying-question-synthetic-manual-conflict')?.focus()
              }
            />
          )}

          <section aria-label={locale === 'en' ? 'Manual conflict' : 'Ручное решение'}>
            <QuestionCard
              question={manualQuestion}
              onAnswer={(_questionId, value) => setAnswer(String(value))}
              isAnswered={Boolean(answer)}
            />
          </section>

          <Button type="button" className="w-full" disabled={!answer}>
            {locale === 'en' ? 'Continue generation' : 'Продолжить генерацию'}
          </Button>

          <section aria-label={locale === 'en' ? 'System audit' : 'Системный аудит'}>
            <QuestionCard question={systemQuestion} onAnswer={() => {}} isAnswered />
          </section>
        </div>
      </main>
    </NextIntlClientProvider>
  )
}
