'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Pencil, X, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SemanticDiff } from '@megacampus/shared-types';

interface SemanticDiffViewerProps {
  originalValue: unknown;
  regeneratedValue: unknown;
  diff: SemanticDiff;
  locale?: 'ru' | 'en';
  onAccept: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

const translations = {
  ru: {
    changeTypes: {
      simplified: 'Упрощено',
      expanded: 'Расширено',
      restructured: 'Реструктурировано',
      refined: 'Уточнено',
    },
    bloomPreserved: 'Уровень Блума сохранён',
    bloomChanged: 'Уровень Блума изменён',
    conceptsAdded: 'Добавлено',
    conceptsRemoved: 'Убрано',
    alignmentScore: 'Согласованность',
    showChanges: 'Показать изменения',
    hideChanges: 'Скрыть изменения',
    accept: 'Принять',
    edit: 'Редактировать',
    cancel: 'Отменить',
    originalLabel: 'Было',
    newLabel: 'Стало',
  },
  en: {
    changeTypes: {
      simplified: 'Simplified',
      expanded: 'Expanded',
      restructured: 'Restructured',
      refined: 'Refined',
    },
    bloomPreserved: "Bloom's Level Preserved",
    bloomChanged: "Bloom's Level Changed",
    conceptsAdded: 'Added',
    conceptsRemoved: 'Removed',
    alignmentScore: 'Alignment Score',
    showChanges: 'Show Changes',
    hideChanges: 'Hide Changes',
    accept: 'Accept',
    edit: 'Edit',
    cancel: 'Cancel',
    originalLabel: 'Original',
    newLabel: 'Updated',
  },
};

const changeTypeBadgeColors: Record<SemanticDiff['changeType'], string> = {
  simplified: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  expanded: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  restructured: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  refined: 'bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800',
};

const getAlignmentScoreColor = (score: number): string => {
  if (score >= 4) return 'text-green-600 dark:text-green-400';
  if (score === 3) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
};

export const SemanticDiffViewer: React.FC<SemanticDiffViewerProps> = ({
  originalValue,
  regeneratedValue,
  diff,
  locale = 'ru',
  onAccept,
  onEdit,
  onCancel,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const t = translations[locale];

  const hasConceptChanges = diff.conceptsAdded.length > 0 || diff.conceptsRemoved.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm space-y-4"
    >
      {/* Header: Change type + Bloom's indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'text-xs font-medium border',
              changeTypeBadgeColors[diff.changeType]
            )}
          >
            {t.changeTypes[diff.changeType]}
          </Badge>

          <div className="flex items-center gap-1.5 text-xs">
            {diff.bloomLevelPreserved ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-green-700 dark:text-green-400">{t.bloomPreserved}</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-yellow-700 dark:text-yellow-400">{t.bloomChanged}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Alignment Score */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {t.alignmentScore}:
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <Star
              key={index}
              className={cn(
                'h-4 w-4',
                index < diff.alignmentScore
                  ? cn('fill-current', getAlignmentScoreColor(diff.alignmentScore))
                  : 'text-slate-300 dark:text-slate-600'
              )}
            />
          ))}
        </div>
        <span className={cn('text-sm font-semibold', getAlignmentScoreColor(diff.alignmentScore))}>
          {diff.alignmentScore}/5
        </span>
      </div>

      {/* Concepts Summary */}
      {hasConceptChanges && (
        <div className="space-y-2">
          {diff.conceptsAdded.length > 0 && (
            <div className="flex flex-wrap items-start gap-1.5">
              <span className="text-xs font-medium text-green-700 dark:text-green-400 pt-1">
                {t.conceptsAdded}:
              </span>
              <div className="flex flex-wrap gap-1">
                {diff.conceptsAdded.map((concept: string, index: number) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800 text-xs rounded-full px-2 py-0.5"
                  >
                    {concept}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {diff.conceptsRemoved.length > 0 && (
            <div className="flex flex-wrap items-start gap-1.5">
              <span className="text-xs font-medium text-red-700 dark:text-red-400 pt-1">
                {t.conceptsRemoved}:
              </span>
              <div className="flex flex-wrap gap-1">
                {diff.conceptsRemoved.map((concept: string, index: number) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800 text-xs rounded-full px-2 py-0.5"
                  >
                    {concept}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Change Description */}
      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-md p-3 border border-slate-100 dark:border-slate-700" role="status" aria-live="polite">
        <p className="text-sm text-slate-700 dark:text-slate-300 italic leading-relaxed">
          {diff.changeDescription}
        </p>
      </div>

      {/* Preview Panel (Collapsible) */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          aria-expanded={showPreview}
          aria-controls="diff-preview"
          aria-label={showPreview ? (locale === 'ru' ? 'Скрыть изменения' : 'Hide changes') : (locale === 'ru' ? 'Показать изменения' : 'Show changes')}
        >
          {showPreview ? (
            <>
              <ChevronUp className="h-4 w-4" />
              <span>{t.hideChanges}</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              <span>{t.showChanges}</span>
            </>
          )}
        </button>

        <AnimatePresence>
          {showPreview && (
            <motion.div
              id="diff-preview"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {t.originalLabel}
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-md p-3 border border-slate-200 dark:border-slate-700">
                    <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">
                      {typeof originalValue === 'object'
                        ? JSON.stringify(originalValue, null, 2)
                        : String(originalValue)}
                    </pre>
                  </div>
                </div>

                {/* Regenerated */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {t.newLabel}
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-md p-3 border border-green-200 dark:border-green-800">
                    <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">
                      {typeof regeneratedValue === 'object'
                        ? JSON.stringify(regeneratedValue, null, 2)
                        : String(regeneratedValue)}
                    </pre>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700" role="group" aria-label={locale === 'ru' ? 'Действия с изменениями' : 'Diff actions'}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          aria-label={locale === 'ru' ? 'Отменить изменения' : 'Cancel changes'}
        >
          <X className="h-4 w-4" />
          {t.cancel}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
          aria-label={locale === 'ru' ? 'Редактировать вручную' : 'Edit manually'}
        >
          <Pencil className="h-4 w-4" />
          {t.edit}
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={onAccept}
          className="bg-green-600 hover:bg-green-700 text-white"
          aria-label={locale === 'ru' ? 'Принять изменения' : 'Accept changes'}
        >
          <CheckCircle2 className="h-4 w-4" />
          {t.accept}
        </Button>
      </div>
    </motion.div>
  );
};
