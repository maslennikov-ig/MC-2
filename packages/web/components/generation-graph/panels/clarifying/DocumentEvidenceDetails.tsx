'use client'

import { useTranslations } from 'next-intl'
import { AlertTriangle, BookOpen, FileWarning, Gauge, Lightbulb } from 'lucide-react'
import {
  DocumentEvidenceQuestionMetadataSchema,
  type DocumentEvidenceQuestionMetadata,
  type EvidenceSourceRef,
} from '@megacampus/shared-types'
import { Badge } from '@/components/ui/badge'

interface DocumentEvidenceDetailsProps {
  metadata: DocumentEvidenceQuestionMetadata
}

const COLLAPSED_EXCERPT_LENGTH = 240

function sanitizeText(value: string): string {
  // React renders this value as a text node and escapes markup. Keeping the
  // original bounded string also preserves audit fidelity for source labels.
  return value
}

/**
 * Validate E3 question metadata at the client boundary. The decision RPC appends
 * one audited pointer to the immutable payload; no other extra field is allowed.
 */
export function parseDocumentEvidenceQuestionMetadata(
  raw: unknown
): DocumentEvidenceQuestionMetadata | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const { current_decision_id: _currentDecisionId, ...canonicalMetadata } = raw as Record<
    string,
    unknown
  >
  const parsed = DocumentEvidenceQuestionMetadataSchema.safeParse(canonicalMetadata)
  return parsed.success ? parsed.data : null
}

function sourceLabel(
  ref: EvidenceSourceRef,
  documents: Map<string, string>,
  pageLabel: (page: number) => string
): string {
  const parts = [documents.get(ref.document_id) ?? ref.document_id]
  if (ref.page_number) parts.push(pageLabel(ref.page_number))
  if (ref.heading_path) parts.push(sanitizeText(ref.heading_path))
  return parts.join(' · ')
}

export function DocumentEvidenceDetails({ metadata }: DocumentEvidenceDetailsProps) {
  const t = useTranslations('generation.clarifying.documentEvidence')

  if (metadata.subject_kind === 'degraded_evidence') {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/25">
        <div className="flex items-start gap-3">
          <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id={`document-evidence-${metadata.subject_key}`}
                className="font-semibold text-amber-950 dark:text-amber-100"
              >
                {t('degradedTitle')}
              </h3>
              <Badge variant="outline">{t('requiredDecision')}</Badge>
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {sanitizeText(metadata.document_name)}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {sanitizeText(metadata.coverage_reason)}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('attempt', { attempt: metadata.attempt, max: metadata.max_attempts })}
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (metadata.subject_kind === 'detector_capacity') {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/25">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id={`document-evidence-${metadata.subject_key}`}
                className="font-semibold text-amber-950 dark:text-amber-100"
              >
                {t('capacityTitle')}
              </h3>
              <Badge variant="outline">{t('requiredDecision')}</Badge>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">{t('capacityDescription')}</p>
          </div>
        </div>
      </section>
    )
  }

  const documents = new Map(
    metadata.documents.map((document) => [
      document.document_id,
      sanitizeText(document.document_name),
    ])
  )

  return (
    <section
      data-testid="conflict-details"
      className="rounded-xl border border-orange-300 bg-gradient-to-br from-orange-50 to-stone-50 p-4 shadow-sm dark:border-orange-900 dark:from-orange-950/25 dark:to-slate-950/20"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-orange-700 dark:text-orange-300" />
        <h3
          id={`document-evidence-${metadata.subject_key}`}
          className="font-semibold text-orange-950 dark:text-orange-100"
        >
          {t('conflictTitle')}
        </h3>
      </div>

      <div className="space-y-3">
        <div className="space-y-2" aria-label={t('conflictingStatements')}>
          {metadata.sides.map((side, sideIndex) => {
            const hasLongExcerpt = side.excerpt.length > COLLAPSED_EXCERPT_LENGTH
            const visibleExcerpt = hasLongExcerpt
              ? `${side.excerpt.slice(0, COLLAPSED_EXCERPT_LENGTH)}…`
              : side.excerpt

            return (
              <article
                key={`${metadata.subject_key}-${sideIndex}`}
                className="rounded-lg border border-orange-200 bg-white/80 p-3 dark:border-orange-900/70 dark:bg-slate-950/45"
              >
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  “{sanitizeText(visibleExcerpt)}”
                </p>
                {hasLongExcerpt && (
                  <details className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    <summary className="cursor-pointer font-medium text-orange-800 underline underline-offset-2 dark:text-orange-200">
                      {t('showFullStatement')}
                    </summary>
                    <p className="mt-2 break-words">“{sanitizeText(side.excerpt)}”</p>
                  </details>
                )}
                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {side.source_refs.map((ref, refIndex) => (
                    <li
                      key={`${ref.document_id}-${ref.chunk_id ?? refIndex}`}
                      className="flex gap-2"
                    >
                      <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{sourceLabel(ref, documents, (page) => t('page', { page }))}</span>
                    </li>
                  ))}
                </ul>
                {side.source_ref_overflow_count > 0 && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {t('moreReferences', { count: side.source_ref_overflow_count })}
                  </p>
                )}
              </article>
            )
          })}
          {metadata.document_overflow_count > 0 && (
            <p className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              {t('moreDocuments', { count: metadata.document_overflow_count })}
            </p>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/35">
            <h4 className="text-xs font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300">
              {t('courseImpact')}
            </h4>
            <p
              data-testid="conflict-course-impact"
              className="mt-1 text-sm text-slate-800 dark:text-slate-200"
            >
              {sanitizeText(metadata.course_impact)}
            </p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 dark:border-teal-900 dark:bg-teal-950/20">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-teal-700 dark:text-teal-300" />
              <h4 className="text-xs font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-200">
                {t('recommendation')}
              </h4>
            </div>
            <p
              data-testid="conflict-recommendation"
              className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              {sanitizeText(metadata.recommendation)}
            </p>
            <p className="mt-2 text-xs font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300">
              {t('rationale')}
            </p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              {sanitizeText(metadata.recommendation_rationale)}
            </p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300">
            {t('alternatives')}
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
            {metadata.alternatives.map((alternative) => (
              <li key={alternative}>{sanitizeText(alternative)}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
