'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import {
  Rocket,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  BookOpen,
  Clock,
  CheckCircle2,
  Zap
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { GenerationProgress, CourseStatus } from '@/types/course-generation';
import { STAGE_CONFIG } from '../generation-celestial/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface GenerationProgressBarProps {
  courseTitle: string;
  overallProgress: number;
  isConnected: boolean;
  progress: GenerationProgress;
  status: CourseStatus;
}

interface CompactStatProps {
  icon?: React.ReactNode;
  value: string;
  tooltip: string;
  className?: string;
}

function CompactStat({ icon, value, tooltip, className }: CompactStatProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-0.5 text-[10px] tabular-nums whitespace-nowrap cursor-help", className)}>
          {icon}
          <span>{value}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[10px] px-2 py-1">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function Separator() {
  return <span className="text-gray-300 dark:text-gray-600 select-none">│</span>;
}

interface MobileStatProps {
  label: string;
  value: string;
  subValue?: string;
  icon?: React.ReactNode;
}

function MobileStat({ label, value, subValue, icon }: MobileStatProps) {
  return (
    <div className="bg-gray-100 dark:bg-gray-800/50 rounded px-1.5 py-1">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[9px] font-medium uppercase tracking-wider opacity-70 truncate">
          {label}
        </p>
        {icon && <div className="flex-shrink-0">{icon}</div>}
      </div>
      <p className="text-xs font-bold tabular-nums">{value}</p>
      {subValue && (
        <p className="text-[9px] opacity-60 truncate">{subValue}</p>
      )}
    </div>
  );
}

export function GenerationProgressBar({
  courseTitle,
  overallProgress,
  isConnected,
  progress,
  status
}: GenerationProgressBarProps) {
  const t = useTranslations('generation');
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('generation-progress-expanded') === 'true';
    }
    return false;
  });

  // Calculate elapsed time
  const [elapsed, setElapsed] = useState('0s');

  useEffect(() => {
    const start = new Date(progress.started_at);

    const updateTime = () => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - start.getTime()) / 1000);

      if (diff < 60) setElapsed(`${diff}s`);
      else if (diff < 3600) setElapsed(`${Math.floor(diff / 60)}m ${diff % 60}s`);
      else setElapsed(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [progress.started_at]);

  // Save expansion state to localStorage
  useEffect(() => {
    localStorage.setItem('generation-progress-expanded', String(isExpanded));
  }, [isExpanded]);

  // Calculate stats
  const totalSteps = Object.keys(STAGE_CONFIG).filter(key => key !== 'stage_0').length; // = 6
  const displayStep = status === 'completed' ? totalSteps : Math.min(progress.current_step + 1, totalSteps);

  const showStructureStats = (
    progress.modules_total !== undefined && progress.modules_total > 0
  ) || (
    progress.lessons_total > 0 && (
      status === 'generating_structure' ||
      status === 'generating_content' ||
      status === 'completed' ||
      (status.includes && (status.includes('stage_4') || status.includes('stage_5') || status.includes('stage_6')))
    )
  );

  const hasDocuments = progress.has_documents;
  const modulesTotal = showStructureStats ? (progress.modules_total ?? '—') : '—';
  const lessonsCompleted = progress.lessons_completed;
  const lessonsTotal = progress.lessons_total;
  const lessonsPercent = showStructureStats && lessonsTotal > 0
    ? Math.round((lessonsCompleted / lessonsTotal) * 100)
    : 0;

  return (
    <TooltipProvider delayDuration={300}>
      <motion.div layout className="w-full max-w-4xl mx-auto mb-2 px-4">
        <div className="border rounded bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Main row - always visible */}
          <motion.div layout className="flex items-center gap-1.5 px-2 py-1">
            {/* Icon with connection indicator */}
            <div className="relative flex-shrink-0">
              <Rocket className="w-3 h-3 text-purple-500 dark:text-purple-400" />
              {!isConnected && (
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              )}
            </div>

            {/* Title - shrinks when stats collapsed to give space to progress bar */}
            <span className={cn(
              "text-xs font-medium truncate text-gray-900 dark:text-gray-100 min-w-0",
              isExpanded ? "flex-1" : "max-w-[50%]"
            )}>
              {courseTitle}
            </span>

            {/* Desktop: Progress bar - flex-1 when collapsed, shrinks when expanded */}
            <div className={cn(
              "hidden lg:flex h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden transition-all duration-300",
              isExpanded ? "w-12 flex-shrink-0" : "flex-1"
            )}>
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500"
                style={{ width: `${Math.round(overallProgress)}%` }}
              />
            </div>

            {/* Percentage */}
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 tabular-nums flex-shrink-0">
              {Math.round(overallProgress)}%
            </span>

            {/* Desktop inline stats - shown when expanded, flex-shrink-0 to not compress */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="hidden lg:flex items-center gap-1.5 overflow-hidden flex-shrink-0"
                >
                  <Separator />
                  <CompactStat
                    icon={<FileText className="w-2.5 h-2.5" />}
                    value={hasDocuments ? '✓' : '—'}
                    tooltip={hasDocuments ? t('stats.hasDocuments') : t('stats.noDocuments')}
                  />
                  <Separator />
                  <CompactStat
                    icon={<Layers className="w-2.5 h-2.5" />}
                    value={`${modulesTotal} ${t('stats.modulesShort')}`}
                    tooltip={t('stats.modulesTooltip')}
                  />
                  <Separator />
                  <CompactStat
                    icon={<BookOpen className="w-2.5 h-2.5" />}
                    value={`${lessonsCompleted}/${lessonsTotal}`}
                    tooltip={t('stats.lessonsTooltip')}
                    className={lessonsPercent > 0 ? "text-purple-600 dark:text-purple-400" : ""}
                  />
                  <Separator />
                  <CompactStat
                    icon={<Clock className="w-2.5 h-2.5" />}
                    value={elapsed}
                    tooltip={t('stats.timeTooltip')}
                  />
                  <Separator />
                  <CompactStat
                    icon={status === 'completed' ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500" /> : <Zap className="w-2.5 h-2.5" />}
                    value={`${displayStep}/${totalSteps}`}
                    tooltip={t('stats.stepsTooltip')}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Expand button */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {/* Desktop: horizontal chevrons */}
              <span className="hidden lg:block">
                {isExpanded ? (
                  <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                )}
              </span>
              {/* Mobile/Tablet: vertical chevrons */}
              <span className="lg:hidden">
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                )}
              </span>
            </button>
          </motion.div>

        {/* Mobile/Tablet progress bar (below title) */}
        <div className="lg:hidden px-2 pb-1.5">
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500"
              style={{ width: `${Math.round(overallProgress)}%` }}
            />
          </div>
        </div>

        {/* Mobile/Tablet expanded stats */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden overflow-hidden"
            >
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 px-2 pb-1.5">
                <MobileStat
                  label={t('stats.documents')}
                  value={hasDocuments ? t('stats.processing') : t('stats.none')}
                  subValue={progress.document_size ? `${(progress.document_size / 1000).toFixed(1)}KB` : undefined}
                  icon={<FileText className="w-2.5 h-2.5 text-blue-500" />}
                />
                <MobileStat
                  label={t('stats.modules')}
                  value={String(modulesTotal)}
                  subValue={status === 'generating_structure' || (status.includes && status.includes('stage_4_analyzing')) ? t('stats.analyzing') : undefined}
                  icon={<Layers className="w-2.5 h-2.5 text-purple-500" />}
                />
                <MobileStat
                  label={t('stats.lessons')}
                  value={showStructureStats ? `${lessonsCompleted}/${lessonsTotal}` : '—'}
                  subValue={lessonsPercent > 0 ? `${lessonsPercent}%` : undefined}
                  icon={<BookOpen className="w-2.5 h-2.5 text-purple-500" />}
                />
                <MobileStat
                  label={t('stats.time')}
                  value={elapsed}
                  subValue={status === 'completed' ? t('stats.completed') : t('stats.inProgress')}
                  icon={<Clock className="w-2.5 h-2.5 text-orange-500" />}
                />
                <MobileStat
                  label={t('stats.steps')}
                  value={`${displayStep}/${totalSteps}`}
                  subValue={status === 'completed' ? t('stats.allCompleted') : t('stats.step', { number: displayStep })}
                  icon={status === 'completed' ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500" /> : <Zap className="w-2.5 h-2.5 text-green-500" />}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}
