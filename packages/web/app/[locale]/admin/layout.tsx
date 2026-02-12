import { Link } from '@/src/i18n/navigation'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { getMessages } from 'next-intl/server'
import { LanguageSwitcher } from '@/components/common/language-switcher'
import { AdminUserMenu } from './components/admin-user-menu'
import { AdminNav } from './components/admin-nav'
import Logo from '@/components/common/logo'
import { BookOpen, Plus } from 'lucide-react'

// Messages type for admin navigation (passed as props)
interface AdminMessages {
  admin?: {
    dashboard?: string
    navigation?: {
      dashboard?: string
      generations?: string
      history?: string
      users?: string
      pipeline?: string
      pricing?: string
    }
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    // Redirect to home since auth/login is missing
    redirect('/')
  }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()

  const role = profile?.role

  if (role !== 'admin' && role !== 'superadmin') {
    redirect('/')
  }

  const messages = (await getMessages()) as AdminMessages

  return (
    <div className="admin-bg-grid min-h-screen bg-gray-50 dark:bg-transparent">
      <header className="admin-header-glass sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 dark:border-transparent dark:bg-transparent">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Logo - links to main site */}
            <Logo variant="compact" size="sm" href="/" />

            {/* Quick action buttons */}
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/courses"
                className="group flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-purple-500/30 dark:hover:bg-purple-500/10 dark:hover:text-purple-400"
              >
                <BookOpen className="h-4 w-4" />
                <span>Каталог</span>
              </Link>
              <Link
                href="/create"
                className="group flex items-center gap-1.5 rounded-full border border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:from-purple-100 hover:to-blue-100 hover:text-purple-600 dark:border-purple-500/20 dark:from-purple-500/5 dark:to-blue-500/5 dark:text-gray-300 dark:hover:from-purple-500/10 dark:hover:to-blue-500/10 dark:hover:text-purple-400"
              >
                <Plus className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span>Создать курс</span>
              </Link>
            </div>

            {/* Divider */}
            <div className="hidden h-6 w-px bg-gray-200 sm:block dark:bg-slate-700" />

            {/* Admin navigation */}
            <AdminNav role={role} messages={messages} />
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <AdminUserMenu userEmail={user.email || ''} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-8">{children}</main>
    </div>
  )
}
