'use client';

import { Rocket, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface CelestialHeaderProps {
  courseTitle: string;
  overallProgress: number;
  isConnected: boolean;
  currentStage?: string | null;
}

export function CelestialHeader({
  courseTitle,
  overallProgress,
  isConnected
}: CelestialHeaderProps) {
  const t = useTranslations('generation.header');

  return (
    <div className="w-full max-w-4xl mx-auto mb-4 px-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-purple-500/20 rounded-full">
            <Rocket className="w-4 h-4 text-purple-500 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate max-w-[300px] sm:max-w-none">
              {courseTitle}
            </h1>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <span>{t('missionProgress')}</span>
              {!isConnected && (
                <span className="flex items-center gap-0.5 text-red-500 text-[10px] bg-red-500/10 px-1 py-0.5 rounded">
                  <WifiOff className="w-2.5 h-2.5" /> {t('noConnection')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
            {Math.round(overallProgress)}%
          </div>
        </div>
      </div>

      <div className="relative h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.round(overallProgress)}%` }}
        />
      </div>
    </div>
  );
}
