'use client'

import { Link } from '@/src/i18n/navigation'
import type { Route } from 'next'
import { Users, BookOpen, GraduationCap, Zap, AlertTriangle, ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SystemHealthMonitor } from './system-health-monitor'

type AdminRoute = '/admin' | '/admin/users' | '/admin/pipeline' | '/admin/generation/history'

interface StatCardProps {
  title: string
  value: number
  subtitle?: string
  icon: React.ElementType
  trend?: { value: number; label: string }
  href?: AdminRoute
}

function StatCard({ title, value, subtitle, icon: Icon, trend, href }: StatCardProps) {
  const content = (
    <div className="group admin-glass-card rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-purple-300 hover:shadow-lg dark:border-slate-700/50 dark:bg-transparent dark:hover:border-cyan-500/30 dark:hover:shadow-cyan-500/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">
            {value.toLocaleString()}
          </p>
          {trend && trend.value > 0 && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400">
              +{trend.value} {trend.label}
            </p>
          )}
          {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">{subtitle}</p>}
        </div>
        <Icon className="h-10 w-10 text-purple-500 opacity-80 dark:text-cyan-400" />
      </div>
    </div>
  )

  return href ? (
    <Link href={href as Route} className="block">
      {content}
    </Link>
  ) : (
    content
  )
}

interface QuickActionProps {
  title: string
  description?: string
  href: AdminRoute
  icon: React.ElementType
}

function QuickAction({ title, href, icon: Icon }: QuickActionProps) {
  return (
    <Link
      href={href as Route}
      className="group admin-glass-card flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-purple-300 hover:shadow-md dark:border-slate-700/50 dark:bg-transparent dark:hover:border-purple-500/30"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-purple-50 p-2 dark:bg-purple-500/10">
          <Icon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <span className="font-medium text-gray-900 dark:text-white">{title}</span>
      </div>
      <ArrowRight className="h-4 w-4 text-gray-400 transition-all group-hover:translate-x-1 group-hover:text-purple-500 dark:group-hover:text-purple-400" />
    </Link>
  )
}

interface AdminDashboardProps {
  stats: {
    users: { total: number; newThisWeek: number }
    courses: { total: number }
    lessons: { total: number }
    generations: { total: number; active: number }
    errors: { last24h: number }
  }
  isSuperadmin?: boolean
}

export function AdminDashboard({ stats, isSuperadmin = false }: AdminDashboardProps) {
  const t = useTranslations('admin')

  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('welcome')}</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">{t('stats.overview')}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t('stats.users')}
          value={stats.users.total}
          icon={Users}
          trend={
            stats.users.newThisWeek > 0
              ? { value: stats.users.newThisWeek, label: t('stats.newThisWeek') }
              : undefined
          }
          href={isSuperadmin ? '/admin/users' : undefined}
        />
        <StatCard title={t('stats.courses')} value={stats.courses.total} icon={BookOpen} />
        <StatCard title={t('stats.lessons')} value={stats.lessons.total} icon={GraduationCap} />
        <StatCard
          title={t('stats.generations')}
          value={stats.generations.total}
          subtitle={
            stats.generations.active > 0
              ? `${t('stats.active')}: ${stats.generations.active}`
              : undefined
          }
          icon={Zap}
          href="/admin/generation/history"
        />
      </div>

      {/* Errors alert (if any) */}
      {stats.errors.last24h > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
          <AlertTriangle className="h-5 w-5 text-red-500 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-300">
            {t('stats.errorsLast24h')}: {stats.errors.last24h}
          </span>
        </div>
      )}

      {/* System Health Monitor (superadmin only) */}
      {isSuperadmin && <SystemHealthMonitor autoRefreshInterval={30} />}

      {/* Quick actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          {t('quickActions.title')}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <QuickAction
            title={t('quickActions.viewGenerations')}
            href="/admin/generation/history"
            icon={Zap}
          />
          {isSuperadmin && (
            <>
              <QuickAction title={t('quickActions.manageUsers')} href="/admin/users" icon={Users} />
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
  )
}
