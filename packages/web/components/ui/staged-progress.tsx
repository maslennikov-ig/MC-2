'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SmoothProgress } from './smooth-progress'

interface Stage {
  id: string
  label: string
}

interface StagedProgressProps {
  stages: Stage[]
  currentStageIndex: number
  /** Progress within current stage (0-100) */
  stageProgress: number
  isComplete?: boolean
  className?: string
}

export function StagedProgress({
  stages,
  currentStageIndex,
  stageProgress,
  isComplete = false,
  className,
}: StagedProgressProps) {
  // Calculate total progress across all stages
  const stageWeight = 100 / stages.length
  const completedStagesProgress = currentStageIndex * stageWeight
  const currentStageContribution = (stageProgress / 100) * stageWeight
  const totalProgress = isComplete ? 100 : completedStagesProgress + currentStageContribution

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress bar */}
      <SmoothProgress value={totalProgress} variant="gradient" showPercentage />

      {/* Stage indicators */}
      <div className="flex justify-between">
        {stages.map((stage, idx) => {
          const isDone = idx < currentStageIndex || isComplete
          const isActive = idx === currentStageIndex && !isComplete

          return (
            <div
              key={stage.id}
              className={cn(
                'flex flex-col items-center gap-1',
                isDone && 'text-green-600 dark:text-green-400',
                isActive && 'text-blue-600 dark:text-blue-400',
                !isDone && !isActive && 'text-gray-400 dark:text-gray-500'
              )}
            >
              <motion.div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border-2',
                  isDone && 'border-green-500 bg-green-500 text-white',
                  isActive && 'border-blue-500 bg-blue-50 dark:bg-blue-900/30',
                  !isDone && !isActive && 'border-gray-300 dark:border-gray-600'
                )}
                animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                {isDone ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="text-xs font-medium">{idx + 1}</span>
                )}
              </motion.div>
              <span className="text-xs font-medium">{stage.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
