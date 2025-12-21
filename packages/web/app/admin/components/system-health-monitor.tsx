'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
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
} from 'lucide-react';

// Types
type ServiceStatus = 'healthy' | 'degraded' | 'error' | 'unknown';

interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  responseTime: number;
  message?: string;
  lastCheck: string;
}

interface HealthResponse {
  overall: 'healthy' | 'degraded' | 'error';
  services: ServiceHealth[];
  timestamp: string;
}

// Status color mappings (light + dark mode)
const STATUS_STYLES: Record<ServiceStatus, {
  bg: string;
  text: string;
  dot: string;
  border: string;
}> = {
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
};

// Service key mapping for translations and icons
const SERVICE_CONFIG: Record<string, { key: string; icon: React.ElementType }> = {
  'Supabase': { key: 'supabase', icon: Database },
  'API Server': { key: 'api', icon: Server },
  'Redis': { key: 'redis', icon: HardDrive },
  'Docling MCP': { key: 'docling', icon: FileText },
  'Qdrant': { key: 'qdrant', icon: Search },
  'Worker': { key: 'worker', icon: Cog },
};

// Overall status icon mapping
const OVERALL_STATUS_ICONS: Record<ServiceStatus | 'healthy' | 'degraded' | 'error', React.ElementType> = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  error: XCircle,
  unknown: HelpCircle,
};

interface ServiceStatusCardProps {
  service: ServiceHealth;
}

function ServiceStatusCard({ service }: ServiceStatusCardProps) {
  const t = useTranslations('admin.monitoring');
  const styles = STATUS_STYLES[service.status];
  const config = SERVICE_CONFIG[service.name] || { key: service.name.toLowerCase(), icon: Server };
  const Icon = config.icon;

  // Get localized name and description using type-safe keys
  type ServiceKey = 'redis' | 'docling' | 'api' | 'worker' | 'supabase' | 'qdrant';
  const serviceKey = config.key as ServiceKey;

  // Use a mapping approach for type safety
  const serviceNames: Record<ServiceKey, string> = {
    redis: t('services.redis'),
    docling: t('services.docling'),
    api: t('services.api'),
    worker: t('services.worker'),
    supabase: t('services.supabase'),
    qdrant: t('services.qdrant'),
  };

  const serviceDescs: Record<ServiceKey, string> = {
    redis: t('services.redisDesc'),
    docling: t('services.doclingDesc'),
    api: t('services.apiDesc'),
    worker: t('services.workerDesc'),
    supabase: t('services.supabaseDesc'),
    qdrant: t('services.qdrantDesc'),
  };

  const localizedName = serviceNames[serviceKey] || service.name;
  const localizedDesc = serviceDescs[serviceKey];

  return (
    <div
      className={`group bg-white dark:bg-transparent admin-glass-card p-4 rounded-xl border ${styles.border} transition-all hover:shadow-lg dark:hover:shadow-cyan-500/5`}
    >
      {/* Icon + Service Name */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-purple-500 dark:text-cyan-400 flex-shrink-0" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {localizedName}
          </h3>
          {localizedDesc && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {localizedDesc}
            </p>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${styles.bg} mb-2`}>
        <span
          className={`w-2 h-2 rounded-full ${styles.dot} ${service.status === 'healthy' ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
        <span className={`text-xs font-medium ${styles.text}`}>
          {t(`status.${service.status}`)}
        </span>
      </div>

      {/* Response Time */}
      {service.responseTime !== undefined && service.responseTime > 0 && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
          <span className="font-mono">{t('responseTime', { time: service.responseTime })}</span>
        </p>
      )}

      {/* Error Message (if any) */}
      {service.message && service.status === 'error' && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2 line-clamp-2" title={service.message}>
          {service.message}
        </p>
      )}
    </div>
  );
}

interface SystemHealthMonitorProps {
  autoRefreshInterval?: number; // in seconds, default 30
}

export function SystemHealthMonitor({
  autoRefreshInterval = 30,
}: SystemHealthMonitorProps) {
  const t = useTranslations('admin.monitoring');
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(autoRefreshInterval);

  // Fetch health data
  const fetchHealth = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/health');

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError(t('error.unauthorized'));
        } else {
          setError(t('error.fetchFailed'));
        }
        return;
      }

      const data: HealthResponse = await response.json();
      setHealthData(data);
      setCountdown(autoRefreshInterval);
    } catch {
      setError(t('error.fetchFailed'));
    } finally {
      setIsRefreshing(false);
    }
  }, [autoRefreshInterval, t]);

  // Initial fetch
  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Auto-refresh countdown
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchHealth();
          return autoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchHealth]);

  // Loading skeleton
  if (!healthData && !error) {
    return (
      <div className="bg-white dark:bg-transparent admin-glass-card p-6 rounded-xl border border-gray-200 dark:border-slate-700/50">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !healthData) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 flex items-center gap-3">
        <XCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
        <span className="text-red-700 dark:text-red-300">{error}</span>
        <button
          onClick={fetchHealth}
          className="ml-auto px-3 py-1 text-sm bg-red-100 dark:bg-red-500/20 rounded-lg hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors"
        >
          {t('refresh')}
        </button>
      </div>
    );
  }

  if (!healthData) return null;

  const OverallIcon = OVERALL_STATUS_ICONS[healthData.overall];
  const overallStyles = STATUS_STYLES[healthData.overall];

  return (
    <div className="space-y-4">
      {/* Header with Overall Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <OverallIcon className={`w-5 h-5 ${overallStyles.text}`} />
            {t('title')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            {healthData.overall === 'healthy' && t('overallHealthy')}
            {healthData.overall === 'degraded' && t('overallDegraded')}
            {healthData.overall === 'error' && t('overallError')}
          </p>
        </div>

        {/* Refresh Controls */}
        <div className="flex items-center gap-3">
          {autoRefreshInterval > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                {countdown}s
              </span>
              <span className="hidden sm:inline">{t('autoRefresh')}</span>
            </div>
          )}
          <button
            onClick={fetchHealth}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-transparent admin-glass-card border border-gray-200 dark:border-slate-700/50 rounded-lg hover:border-purple-300 dark:hover:border-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            aria-label={t('refresh')}
          >
            <RefreshCw
              className={`w-4 h-4 text-gray-600 dark:text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {t('refresh')}
            </span>
          </button>
        </div>
      </div>

      {/* Service Status Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {healthData.services.map((service) => (
          <ServiceStatusCard key={service.name} service={service} />
        ))}
      </div>

      {/* Last Check Timestamp */}
      <p className="text-xs text-gray-500 dark:text-gray-400 text-right">
        {t('lastCheck')}:{' '}
        <time className="font-mono">
          {new Date(healthData.timestamp).toLocaleTimeString()}
        </time>
      </p>
    </div>
  );
}
