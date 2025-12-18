'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

export type CascadeAction = 'mark_stale' | 'auto_regenerate' | 'review_each';

const IMPACT_THRESHOLDS = {
  low: 5,      // 1-5 elements
  medium: 10,  // 6-10 elements
  high: 20,    // 11-20 elements
  critical: 50 // 21+ elements
} as const;

type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

function getImpactLevel(count: number): ImpactLevel {
  if (count <= IMPACT_THRESHOLDS.low) return 'low';
  if (count <= IMPACT_THRESHOLDS.medium) return 'medium';
  if (count <= IMPACT_THRESHOLDS.high) return 'high';
  return 'critical';
}

export interface ImpactAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (action: CascadeAction) => void;
  affectedCount: number;
  fieldLabel: string; // e.g., "Learning Objectives"
  fieldPath: string;
  locale?: 'ru' | 'en';
  // Optional breakdown for more detailed display
  affectedBreakdown?: {
    sections?: number;
    lessons?: number;
  };
}

const translations = {
  ru: {
    title: 'Анализ влияния изменений',
    summary: 'Это изменение затронет {count} элементов',
    breakdown: '{sections} секций, {lessons} уроков',
    fieldLabel: 'Изменяемое поле',
    actions: {
      mark_stale: {
        label: 'Пометить для проверки',
        description: 'Элементы будут помечены как требующие проверки',
      },
      auto_regenerate: {
        label: 'Перегенерировать автоматически',
        description: 'Все затронутые элементы будут перегенерированы с помощью AI',
      },
      review_each: {
        label: 'Проверить каждый',
        description: 'Открыть интерфейс для поочередной проверки каждого элемента',
      },
    },
    cancel: 'Отмена',
    confirm: 'Применить',
    highImpactWarning: 'Это изменение затрагивает большое количество элементов',
    criticalWarning: 'Критическое изменение',
    criticalDescription: 'Это изменение затронет очень большое количество элементов. Рекомендуется выбрать "Пометить для проверки" вместо автоматической перегенерации.',
    impactLevel: {
      low: 'Низкое влияние',
      medium: 'Среднее влияние',
      high: 'Высокое влияние',
      critical: 'Критическое влияние',
    },
  },
  en: {
    title: 'Impact Analysis',
    summary: 'This change will affect {count} elements',
    breakdown: '{sections} sections, {lessons} lessons',
    fieldLabel: 'Field being changed',
    actions: {
      mark_stale: {
        label: 'Mark as needing review',
        description: 'Elements will be marked with a stale indicator',
      },
      auto_regenerate: {
        label: 'Auto-regenerate all',
        description: 'All affected elements will be regenerated using AI',
      },
      review_each: {
        label: 'Review each individually',
        description: 'Open review interface for each affected element',
      },
    },
    cancel: 'Cancel',
    confirm: 'Apply',
    highImpactWarning: 'This change affects a large number of elements',
    criticalWarning: 'Critical Change',
    criticalDescription: 'This change will affect a very large number of elements. Consider marking for review instead of auto-regeneration.',
    impactLevel: {
      low: 'Low Impact',
      medium: 'Medium Impact',
      high: 'High Impact',
      critical: 'Critical Impact',
    },
  },
};

export const ImpactAnalysisModal: React.FC<ImpactAnalysisModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  affectedCount,
  fieldLabel,
  fieldPath,
  locale = 'ru',
  affectedBreakdown,
}) => {
  const [selectedAction, setSelectedAction] = useState<CascadeAction>('mark_stale');
  const t = translations[locale];
  const impactLevel = getImpactLevel(affectedCount);

  const handleConfirm = () => {
    // Prevent auto_regenerate for critical impact without double confirmation
    if (impactLevel === 'critical' && selectedAction === 'auto_regenerate') {
      // For critical impact, user must explicitly select auto_regenerate
      // The UI will show strong warnings, but we allow it if they really want to
    }
    onConfirm(selectedAction);
    onClose();
  };

  const getBreakdownText = (): string => {
    if (!affectedBreakdown) return '';

    const parts: string[] = [];
          if (affectedBreakdown.sections) {
            parts.push(`${affectedBreakdown.sections} ${locale === 'ru' ? 'модулей' : 'modules'}`);
          }
          if (affectedBreakdown.lessons) {
            parts.push(`${affectedBreakdown.lessons} ${locale === 'ru' ? 'уроков' : 'lessons'}`);
          }
    return parts.join(', ');
  };

  const getImpactLevelStyles = () => {
    switch (impactLevel) {
      case 'low':
        return {
          containerClass: '',
          iconClass: 'text-blue-600 dark:text-blue-500',
          iconBgClass: 'bg-blue-100 dark:bg-blue-900/20',
          badgeClass: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
        };
      case 'medium':
        return {
          containerClass: '',
          iconClass: 'text-yellow-600 dark:text-yellow-500',
          iconBgClass: 'bg-yellow-100 dark:bg-yellow-900/20',
          badgeClass: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300',
        };
      case 'high':
        return {
          containerClass: 'border-2 border-orange-300 dark:border-orange-700 animate-pulse',
          iconClass: 'text-orange-600 dark:text-orange-500',
          iconBgClass: 'bg-orange-100 dark:bg-orange-900/20',
          badgeClass: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300',
        };
      case 'critical':
        return {
          containerClass: 'border-2 border-red-400 dark:border-red-600 animate-pulse',
          iconClass: 'text-red-600 dark:text-red-500',
          iconBgClass: 'bg-red-100 dark:bg-red-900/20',
          badgeClass: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300',
        };
    }
  };

  const styles = getImpactLevelStyles();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn('sm:max-w-[540px]', styles.containerClass)}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                styles.iconBgClass
              )}
            >
              <AlertTriangle
                className={cn(
                  impactLevel === 'critical' ? 'h-6 w-6 animate-pulse' : 'h-5 w-5',
                  styles.iconClass
                )}
              />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold">
                {t.title}
              </DialogTitle>
              <div className={cn('inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium', styles.badgeClass)}>
                {t.impactLevel[impactLevel]}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Critical Impact Warning */}
          {impactLevel === 'critical' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-6 w-6 animate-pulse" />
                <span className="font-bold text-lg">{t.criticalWarning}</span>
              </div>
              <p className="mt-2 text-sm text-red-600 dark:text-red-300">
                {t.criticalDescription}
              </p>
            </div>
          )}

          {/* High Impact Warning */}
          {impactLevel === 'high' && (
            <div className="rounded-md bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 p-3">
              <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                {t.highImpactWarning}
              </p>
            </div>
          )}

          {/* Medium Impact Warning */}
          {impactLevel === 'medium' && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 p-3">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                {t.highImpactWarning}
              </p>
            </div>
          )}

          {/* Summary */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t.summary.replace('{count}', affectedCount.toString())}
            </p>
            {affectedBreakdown && getBreakdownText() && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {getBreakdownText()}
              </p>
            )}
          </div>

          {/* Field Info */}
          <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t.fieldLabel}
            </p>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {fieldLabel}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {fieldPath}
            </p>
          </div>

          {/* Action Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {locale === 'ru' ? 'Действие' : 'Action'}
            </Label>
            <RadioGroup
              value={selectedAction}
              onValueChange={(value) => setSelectedAction(value as CascadeAction)}
              className="space-y-3"
              role="radiogroup"
              aria-label={locale === 'ru' ? 'Выберите действие для каскадного обновления' : 'Cascade action options'}
            >
              {/* Mark Stale (Safest) */}
              <div className="flex items-start space-x-3 p-3 rounded-md border-2 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <RadioGroupItem value="mark_stale" id="mark_stale" className="mt-0.5" aria-describedby="action-desc-mark-stale" />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="mark_stale"
                    className="text-sm font-medium cursor-pointer"
                  >
                    {t.actions.mark_stale.label}
                  </Label>
                  <p id="action-desc-mark-stale" className="text-xs text-slate-500 dark:text-slate-400">
                    {t.actions.mark_stale.description}
                  </p>
                </div>
              </div>

              {/* Auto Regenerate (Danger) */}
              <div
                className={cn(
                  'flex items-start space-x-3 p-3 rounded-md border-2 transition-colors',
                  selectedAction === 'auto_regenerate'
                    ? impactLevel === 'critical'
                      ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/10 animate-pulse'
                      : 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
                  impactLevel === 'critical' && 'opacity-75'
                )}
              >
                <RadioGroupItem
                  value="auto_regenerate"
                  id="auto_regenerate"
                  className="mt-0.5"
                  aria-describedby="action-desc-auto-regenerate"
                />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="auto_regenerate"
                    className={cn(
                      'text-sm font-medium cursor-pointer',
                      impactLevel === 'critical' && 'text-red-700 dark:text-red-400'
                    )}
                  >
                    {t.actions.auto_regenerate.label}
                    {impactLevel === 'critical' && (
                      <span className="ml-2 text-xs font-bold text-red-600 dark:text-red-400">
                        ({locale === 'ru' ? 'Не рекомендуется' : 'Not Recommended'})
                      </span>
                    )}
                  </Label>
                  <p id="action-desc-auto-regenerate" className="text-xs text-slate-500 dark:text-slate-400">
                    {t.actions.auto_regenerate.description}
                  </p>
                </div>
              </div>

              {/* Review Each */}
              <div className="flex items-start space-x-3 p-3 rounded-md border-2 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <RadioGroupItem value="review_each" id="review_each" className="mt-0.5" aria-describedby="action-desc-review-each" />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="review_each"
                    className="text-sm font-medium cursor-pointer"
                  >
                    {t.actions.review_each.label}
                  </Label>
                  <p id="action-desc-review-each" className="text-xs text-slate-500 dark:text-slate-400">
                    {t.actions.review_each.description}
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            onClick={handleConfirm}
            variant={selectedAction === 'auto_regenerate' ? 'destructive' : 'default'}
          >
            {t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
