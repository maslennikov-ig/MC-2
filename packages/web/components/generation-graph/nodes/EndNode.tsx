import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { RFEndNode } from '../types';
import { Trophy, Sparkles, CheckCircle2, ExternalLink, Layers, BookOpen } from 'lucide-react';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { useStaticGraph } from '../contexts/StaticGraphContext';
import { motion } from 'framer-motion';
import { Link } from '@/src/i18n/navigation';

const EndNode = ({ id, data, selected }: NodeProps<RFEndNode>) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status || 'pending';
  const isCompleted = currentStatus === 'completed';

  // Get course info from context for navigation and stats
  const { courseInfo } = useStaticGraph();
  const { id: courseId, moduleCount, lessonCount } = courseInfo;

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
            Финиш
          </span>
          <span className={`
            text-sm font-bold
            ${isCompleted
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-slate-500 dark:text-slate-400'
            }
          `}>
            {isCompleted ? 'Курс готов!' : 'Ожидание...'}
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
            <div className="flex items-center gap-3 text-[11px] text-emerald-600 dark:text-emerald-400">
              {moduleCount > 0 && (
                <span className="flex items-center gap-1">
                  <Layers size={12} />
                  {moduleCount} модул{moduleCount === 1 ? 'ь' : moduleCount < 5 ? 'я' : 'ей'}
                </span>
              )}
              {lessonCount > 0 && (
                <span className="flex items-center gap-1">
                  <BookOpen size={12} />
                  {lessonCount} урок{lessonCount === 1 ? '' : lessonCount < 5 ? 'а' : 'ов'}
                </span>
              )}
            </div>
          )}

          {/* Open Course Button */}
          <Link
            href={`/courses/${courseId}`}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs font-semibold
              bg-emerald-500 hover:bg-emerald-600 text-white transition-colors
              dark:bg-emerald-600 dark:hover:bg-emerald-500"
            onClick={(e) => e.stopPropagation()}
          >
            <span>Открыть курс</span>
            <ExternalLink size={12} />
          </Link>
        </div>
      )}

      {/* Pending state footer */}
      {!isCompleted && (
        <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2 bg-slate-50/50 dark:bg-slate-800/50 rounded-b-md">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            Ожидание завершения генерации...
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default memo(EndNode);
