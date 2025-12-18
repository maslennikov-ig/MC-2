'use client';

import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { GenerationProgress, CourseStatus } from '@/types/course-generation';
import {
  FileText,
  BookOpen,
  Clock,
  Zap,
  CheckCircle2,
  Loader2,
  Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { STAGE_CONFIG } from '../generation-celestial/utils';

interface StatsGridProps {
  progress: GenerationProgress;
  status: CourseStatus;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
  isLoading?: boolean;
  disableAnimation?: boolean;
}

function StatCard({ icon, label, value, subValue, color = 'blue', isLoading, disableAnimation }: StatCardProps) {
  // Celestial-themed colors: transparent backgrounds with colored borders and text
  const colorClasses = {
    blue: 'bg-blue-500/5 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/5 border-green-500/30 text-green-400',
    purple: 'bg-purple-500/5 border-purple-500/30 text-purple-400',
    orange: 'bg-orange-500/5 border-orange-500/30 text-orange-400',
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      <Card className={cn(
        'overflow-hidden border rounded-xl backdrop-blur-sm transition-shadow duration-300',
        colorClasses[color as keyof typeof colorClasses]
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wider opacity-70">
                {label}
              </p>
              <div className="mt-2 flex items-baseline">
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className="w-5 h-5 opacity-70" />
                  </motion.div>
                ) : disableAnimation ? (
                  <>
                    <p className="text-2xl font-bold tabular-nums">
                      {value}
                    </p>
                    {subValue && (
                      <p className="ml-2 text-sm opacity-60">
                        {subValue}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <motion.p
                      className="text-2xl font-bold"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200 }}
                      key={String(value)}
                    >
                      {value}
                    </motion.p>
                    {subValue && (
                      <motion.p
                        className="ml-2 text-sm opacity-60"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        {subValue}
                      </motion.p>
                    )}
                  </>
                )}
              </div>
            </div>
            <motion.div
              className="p-2 rounded-lg bg-white/5"
              whileHover={{ rotate: 15 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {icon}
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function StatsGrid({ progress, status }: StatsGridProps) {
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

  // Count total steps from config (exclude stage_0 which is just "Launch generation" banner)
  const totalSteps = Object.keys(STAGE_CONFIG).filter(key => key !== 'stage_0').length; // = 6 stages (1-6)
  // Current step is 0-based in DB, convert to 1-based for display.
  // If status is completed, show total/total.
  const displayStep = status === 'completed' ? totalSteps : Math.min(progress.current_step + 1, totalSteps);

  // Show module/lesson stats when known (after Stage 4 analysis or during structure generation)
  // Data comes from analysis_result.recommended_structure after Stage 4 completes
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
  
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 100
      }
    }
  };

  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          label="Документы"
          value={progress.has_documents ? 'Обработка' : 'Нет'}
          subValue={progress.document_size ? `${(progress.document_size / 1000).toFixed(1)}KB` : undefined}
          color="blue"
          isLoading={progress.has_documents && status === 'processing_documents'}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <StatCard
          icon={<Layers className="w-5 h-5" />}
          label="Модули"
          // Use actual modules_total from analysis_result if available, otherwise show placeholder
          value={showStructureStats ? (progress.modules_total ?? '—') : '—'}
          subValue={status === 'generating_structure' || (status.includes && status.includes('stage_4_analyzing')) ? 'Анализ...' : undefined}
          color="purple"
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <StatCard
          icon={<BookOpen className="w-5 h-5" />}
          label="Уроки"
          value={showStructureStats ? `${progress.lessons_completed}/${progress.lessons_total}` : '—'}
          subValue={showStructureStats && progress.lessons_total > 0 ? `${Math.round((progress.lessons_completed / progress.lessons_total) * 100)}%` : undefined}
          color="purple"
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Время"
          value={elapsed}
          subValue={status === 'completed' ? 'Готово' : 'В процессе'}
          color="orange"
          disableAnimation={true}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <StatCard
          icon={status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
          label="Шаги"
          value={`${displayStep}/${totalSteps}`}
          subValue={status === 'completed' ? 'Все выполнено' : `Шаг ${displayStep}`}
          color="green"
        />
      </motion.div>
    </motion.div>
  );
}