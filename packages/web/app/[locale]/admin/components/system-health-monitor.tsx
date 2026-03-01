'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  Database,
  Server,
  Cog,
  FileText,
  Search,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Send,
  Mic,
} from 'lucide-react'

// Types
type ServiceStatus = 'healthy' | 'degraded' | 'error' | 'unknown'

interface ServiceHealth {
  name: string
  status: ServiceStatus
  responseTime: number
  message?: string
  lastCheck: string
}

interface HealthResponse {
  overall: 'healthy' | 'degraded' | 'error'
  services: ServiceHealth[]
  timestamp: string
}

// Status color mappings (light + dark mode)
const STATUS_STYLES: Record<
  ServiceStatus,
  {
    bg: string
    text: string
    dot: string
    border: string
  }
> = {
  healthy: {
    bg: 'bg-green-50 dark:bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    dot: 'bg-green-500',
    border: 'border-green-200 dark:border-green-500/30',
  },
  degraded: {
    bg: 'bg-yellow-50 dark:bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    dot: 'bg-yellow-500',
    border: 'border-yellow-200 dark:border-yellow-500/30',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
    border: 'border-red-200 dark:border-red-500/30',
  },
  unknown: {
    bg: 'bg-gray-50 dark:bg-gray-500/10',
    text: 'text-gray-600 dark:text-gray-400',
    dot: 'bg-gray-400',
    border: 'border-gray-200 dark:border-gray-500/30',
  },
}

// Service key mapping for translations and icons
const SERVICE_CONFIG: Record<string, { key: string; icon: React.ElementType }> = {
  Supabase: { key: 'supabase', icon: Database },
  'API Server': { key: 'api', icon: Server },
  Redis: { key: 'redis', icon: HardDrive },
  'Docling MCP': { key: 'docling', icon: FileText },
  Qdrant: { key: 'qdrant', icon: Search },
  Worker: { key: 'worker', icon: Cog },
  'Worker Stage 7': { key: 'workerStage7', icon: Cog },
  'NotebookLM Bridge': { key: 'notebookLMBridge', icon: Mic },
  'Telegram Bot': { key: 'telegram', icon: Send },
  'Mermaid Pipeline': { key: 'mermaid', icon: Cog },
}

// Overall status icon mapping
const OVERALL_STATUS_ICONS: Record<
  ServiceStatus | 'healthy' | 'degraded' | 'error',
  React.ElementType
> = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  error: XCircle,
  unknown: HelpCircle,
}

interface ServiceStatusCardProps {
  service: ServiceHealth
}

function ServiceStatusCard({ service }: ServiceStatusCardProps) {
  const t = useTranslations('admin.monitoring')
  const styles = STATUS_STYLES[service.status]
  const config = SERVICE_CONFIG[service.name] || { key: service.name.toLowerCase(), icon: Server }
  const Icon = config.icon

  // Get localized name and description using type-safe keys
  type ServiceKey =
    | 'redis'
    | 'docling'
    | 'api'
    | 'worker'
    | 'workerStage7'
    | 'notebookLMBridge'
    | 'supabase'
    | 'qdrant'
    | 'telegram'
    | 'mermaid'
  const serviceKey = config.key as ServiceKey

  // Use a mapping approach for type safety
  const serviceNames: Record<ServiceKey, string> = {
    redis: t('services.redis'),
    docling: t('services.docling'),
    api: t('services.api'),
    worker: t('services.worker'),
    workerStage7: t('services.workerStage7'),
    notebookLMBridge: t('services.notebookLMBridge'),
    supabase: t('services.supabase'),
    qdrant: t('services.qdrant'),
    telegram: t('services.telegram'),
    mermaid: t('services.mermaid'),
  }

  const serviceDescs: Record<ServiceKey, string> = {
    redis: t('services.redisDesc'),
    docling: t('services.doclingDesc'),
    api: t('services.apiDesc'),
    worker: t('services.workerDesc'),
    workerStage7: t('services.workerStage7Desc'),
    notebookLMBridge: t('services.notebookLMBridgeDesc'),
    supabase: t('services.supabaseDesc'),
    qdrant: t('services.qdrantDesc'),
    telegram: t('services.telegramDesc'),
    mermaid: t('services.mermaidDesc'),
  }

  const localizedName = serviceNames[serviceKey] || service.name
  const localizedDesc = serviceDescs[serviceKey]

  return (
    <div
      className={`group admin-glass-card rounded-xl border bg-white p-4 dark:bg-transparent ${styles.border} transition-all hover:shadow-lg dark:hover:shadow-cyan-500/5`}
    >
      {/* Icon + Service Name */}
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 flex-shrink-0 text-purple-500 dark:text-cyan-400" />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {localizedName}
          </h3>
          {localizedDesc && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{localizedDesc}</p>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${styles.bg} mb-2`}>
        <span
          className={`h-2 w-2 rounded-full ${styles.dot} ${service.status === 'healthy' ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
        <span className={`text-xs font-medium ${styles.text}`}>
          {t(`status.${service.status}`)}
        </span>
      </div>

      {/* Response Time */}
      {service.responseTime !== undefined && service.responseTime > 0 && (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-mono">{t('responseTime', { time: service.responseTime })}</span>
        </p>
      )}

      {/* Error/Degraded Message */}
      {service.message && (service.status === 'error' || service.status === 'degraded') && (
        <p
          className={`mt-2 line-clamp-2 text-xs ${
            service.status === 'error'
              ? 'text-red-600 dark:text-red-400'
              : 'text-yellow-600 dark:text-yellow-400'
          }`}
          title={service.message}
        >
          {service.message}
        </p>
      )}
    </div>
  )
}

interface SystemHealthMonitorProps {
  autoRefreshInterval?: number // in seconds, default 30
}

export function SystemHealthMonitor({ autoRefreshInterval = 30 }: SystemHealthMonitorProps) {
  const t = useTranslations('admin.monitoring')
  const [healthData, setHealthData] = useState<HealthResponse | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(autoRefreshInterval)

  // Fetch health data
  const fetchHealth = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/health')

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError(t('error.unauthorized'))
        } else {
          setError(t('error.fetchFailed'))
        }
        return
      }

      const data: HealthResponse = await response.json()
      setHealthData(data)
      setCountdown(autoRefreshInterval)
    } catch {
      setError(t('error.fetchFailed'))
    } finally {
      setIsRefreshing(false)
    }
  }, [autoRefreshInterval, t])

  // Initial fetch
  useEffect(() => {
    void fetchHealth()
  }, [fetchHealth])

  // Auto-refresh countdown
  useEffect(() => {
    if (autoRefreshInterval <= 0) return

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          void fetchHealth()
          return autoRefreshInterval
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [autoRefreshInterval, fetchHealth])

  // Loading skeleton
  if (!healthData && !error) {
    return (
      <div className="admin-glass-card rounded-xl border border-gray-200 bg-white p-6 dark:border-slate-700/50 dark:bg-transparent">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error && !healthData) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
        <XCircle className="h-5 w-5 flex-shrink-0 text-red-500 dark:text-red-400" />
        <span className="text-red-700 dark:text-red-300">{error}</span>
        <button
          onClick={() => void fetchHealth()}
          className="ml-auto rounded-lg bg-red-100 px-3 py-1 text-sm transition-colors hover:bg-red-200 dark:bg-red-500/20 dark:hover:bg-red-500/30"
        >
          {t('refresh')}
        </button>
      </div>
    )
  }

  if (!healthData) return null

  const OverallIcon = OVERALL_STATUS_ICONS[healthData.overall]
  const overallStyles = STATUS_STYLES[healthData.overall]

  return (
    <div className="space-y-4">
      {/* Header with Overall Status */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <OverallIcon className={`h-5 w-5 ${overallStyles.text}`} />
            {t('title')}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            {healthData.overall === 'healthy' && t('overallHealthy')}
            {healthData.overall === 'degraded' && t('overallDegraded')}
            {healthData.overall === 'error' && t('overallError')}
          </p>
        </div>

        {/* Refresh Controls */}
        <div className="flex items-center gap-3">
          {autoRefreshInterval > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="rounded bg-gray-100 px-2 py-1 font-mono dark:bg-gray-800">
                {countdown}s
              </span>
              <span className="hidden sm:inline">{t('autoRefresh')}</span>
            </div>
          )}
          <button
            onClick={() => void fetchHealth()}
            disabled={isRefreshing}
            className="admin-glass-card inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm transition-all hover:border-purple-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/50 dark:bg-transparent dark:hover:border-cyan-500/30"
            aria-label={t('refresh')}
          >
            <RefreshCw
              className={`h-4 w-4 text-gray-600 dark:text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span className="font-medium text-gray-700 dark:text-gray-300">{t('refresh')}</span>
          </button>
        </div>
      </div>

      {/* Service Status Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {healthData.services.map((service) => (
          <ServiceStatusCard key={service.name} service={service} />
        ))}
      </div>

      {/* Last Check Timestamp */}
      <p className="text-right text-xs text-gray-500 dark:text-gray-400">
        {t('lastCheck')}:{' '}
        <time className="font-mono">{new Date(healthData.timestamp).toLocaleTimeString()}</time>
      </p>
    </div>
  )
}
