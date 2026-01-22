import React, { useEffect, useState, useRef } from 'react'
import { Clock, Sigma, Hourglass } from 'lucide-react'
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider'

interface StatsBarProps {
  progress?: number
  isDark?: boolean
}

export const StatsBar = ({ progress = 0, isDark }: StatsBarProps) => {
  const { traces } = useGenerationRealtime()
  const [elapsed, setElapsed] = useState(0)
  const [tokens, setTokens] = useState(0)
  // Store smoothed remaining time estimate to avoid jumps
  const [smoothedRemaining, setSmoothedRemaining] = useState<number | null>(null)
  const lastProgressRef = useRef(progress)

  // Refs for stable values in single consolidated interval
  const smoothedRemainingRef = useRef(smoothedRemaining)
  const progressRef = useRef(progress)

  useEffect(() => {
    smoothedRemainingRef.current = smoothedRemaining
  }, [smoothedRemaining])

  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  useEffect(() => {
    // Calculate total tokens from traces
    const totalTokens = traces.reduce((acc, t) => acc + (t.tokens_used || 0), 0)
    setTokens(totalTokens)
  }, [traces])

  // Single consolidated interval for both elapsed and remaining countdown
  useEffect(() => {
    const interval = setInterval(() => {
      // Update elapsed
      setElapsed((prev) => prev + 1)

      // Update remaining if applicable
      const remaining = smoothedRemainingRef.current
      const prog = progressRef.current
      if (remaining !== null && remaining > 0 && prog < 100) {
        setSmoothedRemaining((prev) => (prev !== null ? Math.max(0, prev - 1) : null))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Update remaining time estimate when progress changes
  useEffect(() => {
    if (progress > 5 && progress < 100 && elapsed > 5) {
      // Only recalculate when progress actually increases
      if (progress > lastProgressRef.current) {
        const estimatedTotal = elapsed / (progress / 100)
        const newRemaining = Math.max(0, estimatedTotal - elapsed)

        // Smooth the estimate to avoid jumps
        setSmoothedRemaining((prev) => {
          if (prev === null) return newRemaining
          // Weighted average: 70% old estimate, 30% new
          return Math.round(prev * 0.7 + newRemaining * 0.3)
        })

        lastProgressRef.current = progress
      }
    }
  }, [progress, elapsed])

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '--:--'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Show remaining time only when we have a valid estimate
  const showRemaining =
    smoothedRemaining !== null && smoothedRemaining > 0 && progress > 5 && progress < 100

  return (
    <div
      className={`flex items-center gap-6 text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
    >
      <div className="flex items-center gap-1.5" title="Прошло времени">
        <Clock size={14} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
        <span>{formatTime(elapsed)}</span>
      </div>
      {showRemaining && (
        <div className="flex items-center gap-1.5" title="Осталось примерно">
          <Hourglass size={14} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
          <span>~{formatTime(smoothedRemaining)}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5" title="Всего токенов">
        <Sigma size={14} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
        <span>{tokens.toLocaleString()}</span>
      </div>
    </div>
  )
}
