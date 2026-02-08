'use client'

import { Link, usePathname } from '@/src/i18n/navigation'

interface AdminNavProps {
  role: string | undefined
  messages: {
    admin?: {
      navigation?: {
        dashboard?: string
        generations?: string
        history?: string
        users?: string
        pipeline?: string
        pricing?: string
        logs?: string
        analytics?: string
      }
    }
  }
}

export function AdminNav({ role, messages }: AdminNavProps) {
  const pathname = usePathname()

  const isActive = (path: string, exact: boolean = false) => {
    if (exact) return pathname === path
    return pathname.startsWith(path)
  }

  return (
    <nav className="flex items-center space-x-1 text-sm font-medium">
      <Link
        className={`admin-nav-link rounded-md px-3 py-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-purple-400 ${
          isActive('/admin', true)
            ? 'admin-nav-link-active bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
            : ''
        }`}
        href="/admin"
      >
        {messages.admin?.navigation?.dashboard || 'Dashboard'}
      </Link>
      <Link
        className={`admin-nav-link rounded-md px-3 py-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-purple-400 ${
          isActive('/admin/generation')
            ? 'admin-nav-link-active bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
            : ''
        }`}
        href="/admin/generation/history"
      >
        {messages.admin?.navigation?.generations || 'Generations'}
      </Link>
      {role === 'superadmin' && (
        <>
          <Link
            className={`admin-nav-link rounded-md px-3 py-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-purple-400 ${
              isActive('/admin/users')
                ? 'admin-nav-link-active bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
                : ''
            }`}
            href="/admin/users"
          >
            {messages.admin?.navigation?.users || 'Users'}
          </Link>
          <Link
            className={`admin-nav-link rounded-md px-3 py-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-purple-400 ${
              isActive('/admin/pricing')
                ? 'admin-nav-link-active bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
                : ''
            }`}
            href="/admin/pricing"
          >
            {messages.admin?.navigation?.pricing || 'Pricing'}
          </Link>
          <Link
            className={`admin-nav-link rounded-md px-3 py-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-purple-400 ${
              isActive('/admin/pipeline')
                ? 'admin-nav-link-active bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
                : ''
            }`}
            href="/admin/pipeline"
          >
            {messages.admin?.navigation?.pipeline || 'Pipeline'}
          </Link>
          <Link
            className={`admin-nav-link rounded-md px-3 py-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-purple-400 ${
              isActive('/admin/logs')
                ? 'admin-nav-link-active bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
                : ''
            }`}
            href="/admin/logs"
          >
            {messages.admin?.navigation?.logs || 'Logs'}
          </Link>
          <Link
            className={`admin-nav-link rounded-md px-3 py-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-purple-400 ${
              isActive('/admin/analytics')
                ? 'admin-nav-link-active bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
                : ''
            }`}
            href="/admin/analytics"
          >
            {messages.admin?.navigation?.analytics || 'Analytics'}
          </Link>
        </>
      )}
    </nav>
  )
}
