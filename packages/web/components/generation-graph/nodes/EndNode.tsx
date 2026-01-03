import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { RFEndNode } from '../types';
import { Trophy, Sparkles, CheckCircle2, ExternalLink, Layers, BookOpen, AlertCircle } from 'lucide-react';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { useStaticGraph } from '../contexts/StaticGraphContext';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { getModuleWord, getLessonWord } from '@/lib/generation-graph/utils/pluralization';
import { motion } from 'framer-motion';
import { Link } from '@/src/i18n/navigation';
import { useParams } from 'next/navigation';

const EndNode = ({ id, data, selected }: NodeProps<RFEndNode>) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status || 'pending';
  const isCompleted = currentStatus === 'completed';

  // Get course info from context for stats
  const { courseInfo } = useStaticGraph();
  const { moduleCount, lessonCount } = courseInfo;

  // Get courseSlug from URL params for navigation
  const params = useParams();
  const courseSlug = params?.slug as string | undefined;

  // Translations
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`
        nopan nodrag relative min-w-[180px] rounded-lg border-2 transition-all duration-300
        ${isCompleted
          ? 'bg-gradient-to-br from-emerald-50 to-green-100 border-emerald-400 dark:from-emerald-900/30 dark:to-green-900/30 dark:border-emerald-600 shadow-lg shadow-emerald-500/20'
          : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-600'
        }
        ${selected ? 'ring-2 ring-offset-2 ring-emerald-400' : ''}
      `}
      data-testid={`node-end-${id}`}
    >
      {/* Input Handle - visible for connection */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-emerald-500 dark:!bg-emerald-600 !w-3 !h-3 !border-2 !border-white dark:!border-slate-800"
      />

      {/* Header with gradient */}
      <div className={`
        h-2 w-full rounded-t-md
        ${isCompleted
          ? 'bg-gradient-to-r from-emerald-400 to-green-500'
          : 'bg-slate-300 dark:bg-slate-600'
        }
      `} />

      {/* Body */}
      <div className="flex items-center gap-3 p-3">
        <div className={`
          flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500
          ${isCompleted
            ? 'bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-md'
            : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
          }
        `}>
          {isCompleted ? (
            <Trophy size={20} className="drop-shadow-sm" />
          ) : (
            <CheckCircle2 size={20} />
          )}
        </div>
        <div className="flex flex-col">
          <span className={`
            text-xs font-medium uppercase tracking-wider
            ${isCompleted
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 dark:text-slate-500'
            }
          `}>
            {t('endNode.finish')}
          </span>
          <span className={`
            text-sm font-bold
            ${isCompleted
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-slate-500 dark:text-slate-400'
            }
          `}>
            {isCompleted ? t('endNode.courseReady') : t('endNode.waiting')}
          </span>
        </div>
        {isCompleted && (
          <Sparkles size={16} className="text-yellow-500 animate-pulse ml-auto" />
        )}
      </div>

      {/* Stats and CTA for completed state */}
      {isCompleted && (
        <div className="border-t border-emerald-200 dark:border-emerald-700/50 px-3 py-2.5 bg-emerald-50/50 dark:bg-emerald-900/20 rounded-b-md space-y-2">
          {/* Course Stats */}
          {(moduleCount > 0 || lessonCount > 0) && (
            <div className="flex items-center gap-3 text-[11px] text-emerald-600 dark:text-emerald-400" role="status">
              {moduleCount > 0 && (
                <span className="flex items-center gap-1">
                  <Layers size={12} />
                  {moduleCount} {getModuleWord(moduleCount, t, 'common')}
                </span>
              )}
              {lessonCount > 0 && (
                <span className="flex items-center gap-1">
                  <BookOpen size={12} />
                  {lessonCount} {getLessonWord(lessonCount, t, 'common')}
                </span>
              )}
            </div>
          )}

          {/* Open Course Button */}
          {courseSlug ? (
            <Link
              href={`/courses/${courseSlug}`}
              className="nopan nodrag flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs font-semibold
                bg-emerald-500 hover:bg-emerald-600 text-white transition-colors
                dark:bg-emerald-600 dark:hover:bg-emerald-500"
              onClick={(e) => e.stopPropagation()}
            >
              <span>{t('endNode.openCourse')}</span>
              <ExternalLink size={12} />
            </Link>
          ) : (
            /* Fallback when courseSlug is not available */
            <div className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <AlertCircle size={12} />
              <span>{t('endNode.loadingLink')}</span>
            </div>
          )}
        </div>
      )}

      {/* Pending state footer */}
      {!isCompleted && (
        <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2 bg-slate-50/50 dark:bg-slate-800/50 rounded-b-md">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {t('endNode.waitingForGeneration')}
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default memo(EndNode);
