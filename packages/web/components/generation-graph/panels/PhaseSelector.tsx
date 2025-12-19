import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getPhaseName } from '@/lib/generation-graph/phase-names';

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
            const timestamp = new Date(phase.timestamp).toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-US');

            return (
              <SelectItem key={phase.phaseId} value={phase.phaseId} className="text-xs">
                <span className="font-medium">{phaseName}</span>
                <span className="text-slate-400 dark:text-slate-500 ml-2">{timestamp}</span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};
