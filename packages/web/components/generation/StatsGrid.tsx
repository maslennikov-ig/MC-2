'use client'

import { Card, CardContent } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { GenerationProgress, CourseStatus } from '@/types/course-generation'
import { FileText, BookOpen, Clock, Zap, CheckCircle2, Loader2, Layers, BrainCircuit } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { STAGE_CONFIG } from '../generation-celestial/utils'
import { useTranslations } from 'next-intl'

interface StatsGridProps {
  progress: GenerationProgress
  status: CourseStatus
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  subValue?: string
  color?: string
  isLoading?: boolean
  disableAnimation?: boolean
}

function StatCard({
  icon,
  label,
  value,
  subValue,
  color = 'blue',
  isLoading,
  disableAnimation,
}: StatCardProps) {
  // Celestial-themed colors: transparent backgrounds with colored borders and text
  const colorClasses = {
    blue: 'bg-blue-500/5 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/5 border-green-500/30 text-green-400',
    purple: 'bg-purple-500/5 border-purple-500/30 text-purple-400',
    orange: 'bg-orange-500/5 border-orange-500/30 text-orange-400',
    cyan: 'bg-cyan-500/5 border-cyan-500/30 text-cyan-400',
  }

  return (
    <motion.div whileHover={{ scale: 1.01, y: -2 }} transition={{ type: 'spring', stiffness: 300 }}>
      <Card
        className={cn(
          'overflow-hidden rounded-lg border backdrop-blur-sm transition-shadow duration-300',
          colorClasses[color as keyof typeof colorClasses]
        )}
      >
        <CardContent className="p-2">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-medium tracking-wider uppercase opacity-70">
                {label}
              </p>
              <div className="mt-1 flex items-baseline">
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className="h-4 w-4 opacity-70" />
                  </motion.div>
                ) : disableAnimation ? (
                  <>
                    <p className="text-base font-bold tabular-nums">{value}</p>
                    {subValue && <p className="ml-1 truncate text-[10px] opacity-60">{subValue}</p>}
                  </>
                ) : (
                  <>
                    <motion.p
                      className="text-base font-bold"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200 }}
                      key={String(value)}
                    >
                      {value}
                    </motion.p>
                    {subValue && (
                      <motion.p
                        className="ml-1 truncate text-[10px] opacity-60"
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
              className="flex-shrink-0 rounded bg-white/5 p-1"
              whileHover={{ rotate: 15 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {icon}
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function formatTokensCompact(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

export default function StatsGrid({ progress, status }: StatsGridProps) {
  const t = useTranslations('generation.stats')
  const [elapsed, setElapsed] = useState('0s')

  useEffect(() => {
    const start = new Date(progress.started_at)

    const updateTime = () => {
      const now = new Date()
      const diff = Math.floor((now.getTime() - start.getTime()) / 1000)

      if (diff < 60) setElapsed(`${diff}s`)
      else if (diff < 3600) setElapsed(`${Math.floor(diff / 60)}m ${diff % 60}s`)
      else setElapsed(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`)
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [progress.started_at])

  // Count total steps from config (exclude stage_0 which is just "Launch generation" banner)
  const totalSteps = Object.keys(STAGE_CONFIG).filter((key) => key !== 'stage_0').length // = 6 stages (1-6)
  // Current step is 0-based in DB, convert to 1-based for display.
  // If status is completed, show total/total.
  const displayStep =
    status === 'completed' ? totalSteps : Math.min(progress.current_step + 1, totalSteps)

  // Show module/lesson stats when known (after Stage 4 analysis or during structure generation)
  // Data comes from analysis_result.recommended_structure after Stage 4 completes
  const showStructureStats =
    (progress.modules_total !== undefined && progress.modules_total > 0) ||
    (progress.lessons_total > 0 &&
      (status === 'generating_structure' ||
        status === 'generating_content' ||
        status === 'completed' ||
        (status.includes &&
          (status.includes('stage_4') ||
            status.includes('stage_5') ||
            status.includes('stage_6')))))

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 100,
      },
    },
  }

  return (
    <motion.div
      className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label={t('documents')}
          value={progress.has_documents ? t('processing') : t('none')}
          subValue={
            progress.document_size ? `${(progress.document_size / 1000).toFixed(1)}KB` : undefined
          }
          color="blue"
          isLoading={progress.has_documents && status === 'processing_documents'}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          label={t('modules')}
          // Use actual modules_total from analysis_result if available, otherwise show placeholder
          value={showStructureStats ? (progress.modules_total ?? '—') : '—'}
          subValue={
            status === 'generating_structure' ||
            (status.includes && status.includes('stage_4_analyzing'))
              ? t('analyzing')
              : undefined
          }
          color="purple"
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <StatCard
          icon={<BookOpen className="h-4 w-4" />}
          label={t('lessons')}
          value={
            showStructureStats ? `${progress.lessons_completed}/${progress.lessons_total}` : '—'
          }
          subValue={
            showStructureStats && progress.lessons_total > 0
              ? `${Math.round((progress.lessons_completed / progress.lessons_total) * 100)}%`
              : undefined
          }
          color="purple"
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label={t('time')}
          value={elapsed}
          subValue={status === 'completed' ? t('completed') : t('inProgress')}
          color="orange"
          disableAnimation={true}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <StatCard
          icon={<BrainCircuit className="h-4 w-4" />}
          label={t('tokens')}
          value={typeof progress.total_tokens_used === 'number' ? formatTokensCompact(progress.total_tokens_used) : '—'}
          subValue={progress.total_tokens_used ? t('tokensUsed') : undefined}
          color="cyan"
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <StatCard
          icon={
            status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Zap className="h-4 w-4" />
            )
          }
          label={t('steps')}
          value={`${displayStep}/${totalSteps}`}
          subValue={status === 'completed' ? t('allCompleted') : t('step', { number: displayStep })}
          color="green"
        />
      </motion.div>
    </motion.div>
  )
}
