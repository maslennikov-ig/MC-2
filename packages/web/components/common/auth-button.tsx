'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/supabase/browser-client'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import { useRouter, usePathname } from '@/src/i18n/navigation'
import GooeyFilter from '@/components/layouts/gooey-filter'
import ProfileMenu from '@/components/common/profile-menu'
import { ProfileMenuErrorBoundary } from '@/components/common/profile-menu-error-boundary'
import type { UserRole } from '@/types/database'

interface User {
  id: string
  email?: string
  name?: string
  image?: string
  role?: UserRole
}

interface AuthButtonProps {
  darkMode?: boolean
  forceWhiteDropdown?: boolean
}

export default function AuthButton({ darkMode = false, forceWhiteDropdown = false }: AuthButtonProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const { open } = useAuthModal()
  const router = useRouter()
  const pathname = usePathname()
  
  // Use the single source of truth from SupabaseProvider
  const { supabase, session, isLoading } = useSupabase()


  useEffect(() => {
    let mounted = true

    const loadProfile = async () => {
      if (!session?.user) {
        setUser(null)
        setProfileLoading(false)
        return
      }

      try {
        // Get profile data
        const { data: userProfile } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()

        // Get full_name from user metadata
        const fullName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0]

        if (mounted) {
          setUser({
            id: session.user.id,
            email: session.user.email,
            name: fullName,
            role: userProfile?.role || 'student'
          })
        }
      } catch {
        // Silently handle errors
        if (mounted) {
          setUser({
            id: session.user.id,
            email: session.user.email,
            name: session.user.email?.split('@')[0],
            role: 'student'
          })
        }
      } finally {
        if (mounted) {
          setProfileLoading(false)
        }
      }
    }

    loadProfile()

    // Add timeout protection - max 5 seconds for profile loading
    const timeout = setTimeout(() => {
      if (mounted) {
        // Profile loading timeout - forcing completion
        setProfileLoading(false)
      }
    }, 5000)

    return () => {
      mounted = false
      clearTimeout(timeout)
    }
  }, [session?.user, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    // Не редиректим на главную, просто обновляем текущую страницу
    router.refresh()
  }

  if (isLoading || profileLoading) {
    return <Skeleton className="h-11 w-32 rounded-full" />
  }

  // If not logged in, show the styled login button
  if (!user) {
    return (
      <>
        <GooeyFilter />
        <div id="gooey-btn" className="relative flex items-center group" style={{ filter: "url(#gooey-filter)" }}>
          <button
            onClick={() => open('login', { returnTo: pathname })}
            className={`absolute right-0 px-3 py-3 rounded-full bg-gradient-to-r text-white font-medium text-sm transition-all duration-300 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center -translate-x-12 group-hover:-translate-x-20 z-0 shadow-md ${
              darkMode
                ? 'from-purple-700 to-purple-800 hover:from-purple-800 hover:to-purple-900'
                : 'from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 hover:from-purple-700 hover:to-purple-800 dark:hover:from-purple-800 dark:hover:to-purple-900'
            }`}
            aria-label="Открыть меню входа"
            aria-hidden="true"
            tabIndex={-1}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H7M17 7V17" />
            </svg>
          </button>
          <button 
            onClick={() => open('login', { returnTo: pathname })}
            className={`px-8 py-3 rounded-full bg-gradient-to-r text-white font-medium text-sm transition-all duration-300 cursor-pointer min-h-[44px] flex items-center z-10 shadow-lg ${
              darkMode
                ? 'from-purple-700 to-purple-800 hover:from-purple-800 hover:to-purple-900'
                : 'from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 hover:from-purple-700 hover:to-purple-800 dark:hover:from-purple-800 dark:hover:to-purple-900'
            }`}
            aria-label="Войти в аккаунт"
          >
            Войти
          </button>
        </div>
      </>
    )
  }

  // If logged in, show the enhanced profile menu
  return (
    <ProfileMenuErrorBoundary darkMode={darkMode}>
      <ProfileMenu
        user={{
          id: user.id,
          email: user.email || '',
          name: user.name,
          image: user.image,
          role: user.role
        }}
        onSignOut={handleSignOut}
        darkMode={darkMode}
        forceWhiteDropdown={forceWhiteDropdown}
      />
    </ProfileMenuErrorBoundary>
  )
}