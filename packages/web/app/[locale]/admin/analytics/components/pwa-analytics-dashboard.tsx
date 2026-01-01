'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Smartphone,
  Bell,
  TrendingUp,
  Download,
  BellOff,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AnalyticsData {
  summary: {
    total: number;
    last24h: number;
    last7d: number;
  };
  install: {
    promptsShown: number;
    accepted: number;
    dismissed: number;
    conversionRate: string;
  };
  push: {
    subscribed: number;
    unsubscribed: number;
    netSubscriptions: number;
  };
  breakdown: Record<string, number>;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
            {value}
          </p>
          {subtitle && (
            <p className={`text-xs mt-1 ${
              trend === 'up' ? 'text-green-600 dark:text-green-400' :
              trend === 'down' ? 'text-red-600 dark:text-red-400' :
              'text-gray-500 dark:text-gray-500'
            }`}>
              {subtitle}
            </p>
          )}
        </div>
        <Icon className="w-10 h-10 text-purple-500 dark:text-cyan-400 opacity-80" />
      </div>
    </div>
  );
}

export function PWAAnalyticsDashboard() {
  const t = useTranslations('admin.analytics');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics/pwa');
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <span className="text-red-700 dark:text-red-300">{error}</span>
        <Button variant="outline" size="sm" onClick={fetchData}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          {t('refresh')}
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title={t('totalEvents')}
          value={data.summary.total}
          subtitle={`${data.summary.last24h} ${t('last24h')}`}
          icon={TrendingUp}
        />
        <StatCard
          title={t('installConversion')}
          value={`${data.install.conversionRate}%`}
          subtitle={`${data.install.accepted} / ${data.install.promptsShown} ${t('installs')}`}
          icon={Download}
          trend={parseFloat(data.install.conversionRate) > 10 ? 'up' : 'neutral'}
        />
        <StatCard
          title={t('pushSubscriptions')}
          value={data.push.netSubscriptions}
          subtitle={`+${data.push.subscribed} / -${data.push.unsubscribed}`}
          icon={Bell}
          trend={data.push.netSubscriptions > 0 ? 'up' : data.push.netSubscriptions < 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* Install funnel */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t('installFunnel')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
            <Smartphone className="w-8 h-8 mx-auto text-purple-500 dark:text-cyan-400 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {data.install.promptsShown}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('promptsShown')}</p>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-500/10 rounded-lg">
            <Download className="w-8 h-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {data.install.accepted}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('installed')}</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
            <Smartphone className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {data.install.dismissed}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('dismissed')}</p>
          </div>
        </div>
      </div>

      {/* Push stats */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t('pushNotifications')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="text-center p-4 bg-green-50 dark:bg-green-500/10 rounded-lg">
            <Bell className="w-8 h-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {data.push.subscribed}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('subscribed')}</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
            <BellOff className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {data.push.unsubscribed}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('unsubscribed')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
