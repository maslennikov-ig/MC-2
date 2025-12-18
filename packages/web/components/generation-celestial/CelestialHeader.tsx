'use client';

import { Rocket, WifiOff } from 'lucide-react';

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
  return (
    <div className="w-full max-w-4xl mx-auto mb-8 px-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-full">
            <Rocket className="w-6 h-6 text-purple-500 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {courseTitle}
            </h1>
            <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span>Прогресс миссии</span>
              {!isConnected && (
                <span className="flex items-center gap-1 text-red-500 text-xs bg-red-500/10 px-2 py-0.5 rounded">
                  <WifiOff className="w-3 h-3" /> Нет связи
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {Math.round(overallProgress)}%
          </div>
        </div>
      </div>
      
      <div className="relative h-2 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div 
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.round(overallProgress)}%` }}
        />
      </div>
    </div>
  );
}
