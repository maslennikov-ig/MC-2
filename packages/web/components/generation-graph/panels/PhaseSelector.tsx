import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getPhaseName, getPhaseDescription } from '@/lib/generation-graph/phase-names';

interface PhaseSelectorProps {
  stageId: string;
  phases: Array<{
    phaseId: string;
    attemptNumber: number;
    timestamp: string;
    status: 'pending' | 'active' | 'completed' | 'error';
  }>;
  selectedPhase: string | null;
  onSelectPhase: (phaseId: string) => void;
  locale?: 'ru' | 'en';
}

export const PhaseSelector = ({
  stageId,
  phases,
  selectedPhase,
  onSelectPhase,
  locale = 'ru',
}: PhaseSelectorProps) => {
  if (!phases || phases.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 mb-4 px-1">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {locale === 'ru' ? 'Фаза:' : 'Phase:'}
      </span>
      <Select
        value={selectedPhase ?? undefined}
        onValueChange={onSelectPhase}
      >
        <SelectTrigger className="w-[280px] h-8 text-xs">
          <SelectValue placeholder={locale === 'ru' ? 'Выберите фазу' : 'Select phase'} />
        </SelectTrigger>
        <SelectContent>
          {phases.map((phase) => {
            const phaseName = getPhaseName(stageId, phase.phaseId, locale);
            const phaseDescription = getPhaseDescription(stageId, phase.phaseId, locale);
            const timestamp = new Date(phase.timestamp).toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-US');
            const statusLabel = locale === 'ru'
              ? { pending: 'ожидание', active: 'выполняется', completed: 'завершено', error: 'ошибка' }[phase.status]
              : phase.status;

            return (
              <SelectItem key={phase.phaseId} value={phase.phaseId} className="text-xs">
                <div className="flex flex-col gap-0.5">
                  <div className="font-medium">{phaseName}</div>
                  {phaseDescription && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">{phaseDescription}</div>
                  )}
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {timestamp} ({statusLabel})
                  </div>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};
