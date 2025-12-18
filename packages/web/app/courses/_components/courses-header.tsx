'use client'

import Link from 'next/link'
import { Home, Plus, Sparkles } from 'lucide-react'
import Logo from '@/components/common/logo'
import AuthButton from '@/components/common/auth-button'
import ThemeToggle from '@/components/common/theme-toggle'
import { Button } from '@/components/ui/button'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import { useSupabase } from '@/lib/supabase/browser-client'
import { usePathname } from 'next/navigation'

export function CoursesHeader() {
  const { session } = useSupabase()
  const isAuthenticated = !!session
  const authModal = useAuthModal()
  const pathname = usePathname()

  return (
    <header className="border-b border-gray-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90 backdrop-blur-sm sticky top-0 z-50 transition-colors duration-200">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          {/* Left side - Logo */}
          <Logo variant="compact" size="md" />
          
          {/* Center - Navigation */}
          <nav className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-3">
            <Link 
              href="/" 
              className="group text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium px-4 py-2.5 rounded-full bg-gray-100 dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-800 hover:border-gray-400 dark:hover:border-slate-600 transition-all duration-200 min-h-[42px] flex items-center gap-2 shadow-sm hover:shadow-md"
            >
              <Home className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-white transition-colors" />
              <span>На главную</span>
            </Link>
            {isAuthenticated === true ? (
              <Link 
                href="/create" 
                className="group text-purple-700 dark:text-gray-300 hover:text-purple-900 dark:hover:text-white text-sm font-medium px-4 py-2.5 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-600/10 dark:to-blue-600/10 border border-purple-300 dark:border-purple-500/20 hover:from-purple-200 hover:to-blue-200 dark:hover:from-purple-600/20 dark:hover:to-blue-600/20 hover:border-purple-400 dark:hover:border-purple-500/30 transition-all duration-200 min-h-[42px] flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <Plus className="w-4 h-4 text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors" />
                <span>Создать курс</span>
              </Link>
            ) : isAuthenticated === false ? (
              <Button 
                onClick={() => authModal.open('register', { returnTo: pathname })}
                className="text-white text-sm font-medium px-4 py-2.5 !rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 border border-purple-300 dark:border-purple-500/20 transition-all duration-200 min-h-[42px] flex items-center gap-2 shadow-lg hover:shadow-xl"
              >
                <Sparkles className="w-4 h-4" />
                <span>Начать бесплатно</span>
              </Button>
            ) : null}
          </nav>
          
          {/* Right side - Theme toggle and Auth button */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  )
}