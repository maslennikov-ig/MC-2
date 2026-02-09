'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, ArrowRight, FileText, Hash, Clock, Cpu, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@megacampus/shared-utils'

/**
 * NodeInputOutput - Input/Output summary for pipeline nodes
 *
 * Shows what went into a node and what came out:
 * - Input summary (e.g., "5 RAG chunks, 12K tokens")
 * - Output summary (e.g., "7 sections, 2.5K words")
 * - Metrics (tokens, duration, model)
 *
 * Features:
 * - Collapsible input/output sections
 * - JSON preview for raw data
 * - Color-coded metric badges
 */

interface NodeInputOutputProps {
  /** Node type for display - 3-node pipeline: generator, selfReviewer, judge */
  nodeType: 'generator' | 'selfReviewer' | 'judge'
  /** Input data summary */
  input?: {
    /** Primary input description */
    primary?: string
    /** Secondary details */
    details?: Array<{ label: string; value: string | number }>
    /** Raw input data (optional) */
    raw?: Record<string, unknown>
  }
  /** Output data summary */
  output?: {
    /** Primary output description */
    primary?: string
    /** Secondary details */
    details?: Array<{ label: string; value: string | number }>
    /** Raw output data (optional) */
    raw?: Record<string, unknown>
  }
  /** Metrics for the node */
  metrics?: {
    tokensUsed?: number
    durationMs?: number
    modelUsed?: string
    temperature?: number
  }
  className?: string
  /** Start collapsed */
  defaultCollapsed?: boolean
}

/**
 * Node type labels - 3-node pipeline
 */
const NODE_TYPE_LABELS: Record<string, string> = {
  generator: 'Генератор',
  selfReviewer: 'Самопроверка',
  judge: 'Судья',
}

/**
 * Node type colors - 3-node pipeline
 */
const NODE_TYPE_COLORS: Record<string, string> = {
  generator: 'text-indigo-600 dark:text-indigo-400',
  selfReviewer: 'text-teal-600 dark:text-teal-400',
  judge: 'text-red-600 dark:text-red-400',
}

function formatDuration(ms: number): string {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)}м`
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}с`
  }
  return `${ms}мс`
}

interface DataSectionProps {
  title: string
  icon: React.ElementType
  iconColor: string
  primary?: string
  details?: Array<{ label: string; value: string | number }>
  raw?: Record<string, unknown>
}

function DataSection({ title, icon: Icon, iconColor, primary, details, raw }: DataSectionProps) {
  const [showRaw, setShowRaw] = useState(false)

  if (!primary && !details?.length && !raw) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', iconColor)} />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</span>
      </div>

      {primary && <p className="pl-6 text-sm text-slate-600 dark:text-slate-400">{primary}</p>}

      {details && details.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pl-6">
          {details.map((detail, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{detail.label}:</span>
              <Badge variant="outline" className="font-mono text-xs">
                {typeof detail.value === 'number' ? formatNumber(detail.value) : detail.value}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {raw && (
        <div className="pl-6">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {showRaw ? 'Скрыть JSON' : 'Показать JSON'}
            {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <AnimatePresence>
            {showRaw && (
              <motion.pre
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 max-h-48 overflow-auto rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800"
              >
                {JSON.stringify(raw, null, 2)}
              </motion.pre>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export function NodeInputOutput({
  nodeType,
  input,
  output,
  metrics,
  className,
  defaultCollapsed = false,
}: NodeInputOutputProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const nodeLabel = NODE_TYPE_LABELS[nodeType] || nodeType
  const nodeColor = NODE_TYPE_COLORS[nodeType] || 'text-slate-600'

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader
        className="cursor-pointer pb-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className={nodeColor}>{nodeLabel}</span>
            <ArrowRight className="h-3 w-3 text-slate-400" />
            <span className="font-normal text-slate-500">Вход/Выход</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {metrics?.tokensUsed && (
              <Badge variant="outline" className="text-xs">
                <Zap className="mr-1 h-3 w-3" />
                {formatNumber(metrics.tokensUsed)} токенов
              </Badge>
            )}
            {collapsed ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-4 pt-0">
              {/* Metrics Row */}
              {metrics && (
                <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
                  {metrics.modelUsed && (
                    <Badge variant="secondary" className="text-xs">
                      <Cpu className="mr-1 h-3 w-3" />
                      {metrics.modelUsed}
                    </Badge>
                  )}
                  {metrics.durationMs !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      <Clock className="mr-1 h-3 w-3" />
                      {formatDuration(metrics.durationMs)}
                    </Badge>
                  )}
                  {metrics.temperature !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      <Hash className="mr-1 h-3 w-3" />
                      t={metrics.temperature}
                    </Badge>
                  )}
                </div>
              )}

              {/* Input Section */}
              {input && (
                <DataSection
                  title="Вход"
                  icon={ArrowRight}
                  iconColor="text-blue-500"
                  primary={input.primary}
                  details={input.details}
                  raw={input.raw}
                />
              )}

              {/* Output Section */}
              {output && (
                <DataSection
                  title="Выход"
                  icon={FileText}
                  iconColor="text-green-500"
                  primary={output.primary}
                  details={output.details}
                  raw={output.raw}
                />
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
