'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Users, BookOpen, GraduationCap, Zap, AlertTriangle, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SystemHealthMonitor } from './system-health-monitor';

type AdminRoute = '/admin' | '/admin/users' | '/admin/pipeline' | '/admin/generation/history';

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  href?: AdminRoute;
}

function StatCard({ title, value, subtitle, icon: Icon, trend, href }: StatCardProps) {
  const content = (
    <div className="group bg-white dark:bg-transparent admin-glass-card p-6 rounded-xl border border-gray-200 dark:border-slate-700/50 hover:border-purple-300 dark:hover:border-cyan-500/30 transition-all hover:shadow-lg dark:hover:shadow-cyan-500/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value.toLocaleString()}</p>
          {trend && trend.value > 0 && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              +{trend.value} {trend.label}
            </p>
          )}
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <Icon className="w-10 h-10 text-purple-500 dark:text-cyan-400 opacity-80" />
      </div>
    </div>
  );

  return href ? <Link href={href as Route} className="block">{content}</Link> : content;
}

interface QuickActionProps {
  title: string;
  description?: string;
  href: AdminRoute;
  icon: React.ElementType;
}

function QuickAction({ title, href, icon: Icon }: QuickActionProps) {
  return (
    <Link
      href={href as Route}
      className="group flex items-center justify-between p-4 bg-white dark:bg-transparent admin-glass-card rounded-xl border border-gray-200 dark:border-slate-700/50 hover:border-purple-300 dark:hover:border-purple-500/30 transition-all hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-500/10">
          <Icon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <span className="font-medium text-gray-900 dark:text-white">{title}</span>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-purple-500 dark:group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
    </Link>
  );
}

interface AdminDashboardProps {
  stats: {
    users: { total: number; newThisWeek: number };
    courses: { total: number };
    lessons: { total: number };
    generations: { total: number; active: number };
    errors: { last24h: number };
  };
  isSuperadmin?: boolean;
}

export function AdminDashboard({ stats, isSuperadmin = false }: AdminDashboardProps) {
  const t = useTranslations('admin');

  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('welcome')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {t('stats.overview')}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title={t('stats.users')}
          value={stats.users.total}
          icon={Users}
          trend={stats.users.newThisWeek > 0 ? { value: stats.users.newThisWeek, label: t('stats.newThisWeek') } : undefined}
          href={isSuperadmin ? '/admin/users' : undefined}
        />
        <StatCard
          title={t('stats.courses')}
          value={stats.courses.total}
          icon={BookOpen}
        />
        <StatCard
          title={t('stats.lessons')}
          value={stats.lessons.total}
          icon={GraduationCap}
        />
        <StatCard
          title={t('stats.generations')}
          value={stats.generations.total}
          subtitle={stats.generations.active > 0 ? `${t('stats.active')}: ${stats.generations.active}` : undefined}
          icon={Zap}
          href="/admin/generation/history"
        />
      </div>

      {/* Errors alert (if any) */}
      {stats.errors.last24h > 0 && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-300">
            {t('stats.errorsLast24h')}: {stats.errors.last24h}
          </span>
        </div>
      )}

      {/* System Health Monitor (superadmin only) */}
      {isSuperadmin && <SystemHealthMonitor autoRefreshInterval={30} />}

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t('quickActions.title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <QuickAction
            title={t('quickActions.viewGenerations')}
            href="/admin/generation/history"
            icon={Zap}
          />
          {isSuperadmin && (
            <>
              <QuickAction
                title={t('quickActions.manageUsers')}
                href="/admin/users"
                icon={Users}
              />
              <QuickAction
                title={t('quickActions.pipelineConfig')}
                href="/admin/pipeline"
                icon={GraduationCap}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
