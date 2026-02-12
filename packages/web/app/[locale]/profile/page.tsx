'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { Link, useRouter } from '@/src/i18n/navigation'
import { useSupabase } from '@/lib/supabase/browser-client'
import { toast } from 'sonner'
import { useThemeSync } from '@/lib/hooks/use-theme-sync'
import { useTranslations } from 'next-intl'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  User,
  Settings,
  BookOpen,
  BarChart3,
  Keyboard,
  ArrowLeft,
  X,
  ChevronRight,
} from 'lucide-react'
import { logger } from '@/lib/client-logger'
import type { Profile } from '@/types/database'
import {
  loadUserPreferences,
  saveUserPreferences,
  type UserPreferences as UserPrefs,
} from '@/lib/user-preferences'
import { ProfileHeader as MainProfileHeader } from './_components/profile-header'
import { safeStorage, type UserProfile } from './_components/profile-utils'
import { ProfileSidebar } from './_components/ProfileSidebar'
import { ProfileHeaderBanner } from './_components/ProfileHeaderBanner'
import { ProfileContent } from './_components/ProfileContent'
import { ProfilePageSkeleton } from './_components/ProfilePageSkeleton'
import { ProfileErrorBoundary } from './_components/ProfileErrorBoundary'

export default function ProfilePage() {
  const t = useTranslations('profile')
  const router = useRouter()
  const { supabase, session, isLoading: sessionLoading } = useSupabase()
  const { setTheme, mounted } = useThemeSync()

  // Tab configuration with translations
  const profileTabs = [
    {
      value: 'personal',
      label: t('tabs.personal.label'),
      icon: User,
      description: t('tabs.personal.description'),
    },
    {
      value: 'settings',
      label: t('tabs.settings.label'),
      icon: Settings,
      description: t('tabs.settings.description'),
    },
    {
      value: 'learning',
      label: t('tabs.learning.label'),
      icon: BookOpen,
      description: t('tabs.learning.description'),
    },
    {
      value: 'statistics',
      label: t('tabs.statistics.label'),
      icon: BarChart3,
      description: t('tabs.statistics.description'),
    },
  ]
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [preferences, setPreferences] = useState<UserPrefs | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('personal')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [touchStartX, setTouchStartX] = useState(0)
  const [touchEndX, setTouchEndX] = useState(0)
  const [showKeyboardHints, setShowKeyboardHints] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const mainContentRef = useRef<HTMLDivElement>(null)

  // Check authentication and handle navigation guard
  useEffect(() => {
    if (!sessionLoading && !session) {
      router.push('/')
    }
  }, [session, sessionLoading, router])

  // Navigation guard for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = t('confirmations.unsavedChangesLeave')
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Keyboard navigation for tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if input is focused
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return
      }

      // Show keyboard hints with ?
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault()
        setShowKeyboardHints((prev) => !prev)
        return
      }

      // Hide keyboard hints with Escape
      if (e.key === 'Escape') {
        if (showKeyboardHints) {
          e.preventDefault()
          setShowKeyboardHints(false)
          return
        }
        // Navigate back on ESC when no dialog is open
        router.back()
        return
      }

      // Ctrl/Cmd + 1-4 for tab navigation
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        const tabIndex = parseInt(e.key) - 1
        const tabs = ['personal', 'settings', 'learning', 'statistics']
        if (tabs[tabIndex]) {
          setActiveTab(tabs[tabIndex])
          // Announce tab change to screen readers
          const announcement = document.getElementById('tab-announcement')
          if (announcement) {
            announcement.textContent = t('announcements.tabSwitched', {
              tab: profileTabs[tabIndex].label,
            })
          }
        }
      }

      // Arrow keys for tab navigation
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const tabs = ['personal', 'settings', 'learning', 'statistics']
        const currentIndex = tabs.indexOf(activeTab)
        let newIndex = currentIndex

        if (e.key === 'ArrowLeft') {
          newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1
        } else {
          newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0
        }

        if (tabs[newIndex] && document.activeElement?.getAttribute('role') === 'tab') {
          e.preventDefault()
          setActiveTab(tabs[newIndex])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, showKeyboardHints, router])

  // Handle touch gestures for mobile tab navigation (iOS Safari compatible)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Prevent iOS Safari bounce effect
    if (e.touches && e.touches[0]) {
      setTouchStartX(e.touches[0].clientX)
      setTouchEndX(0) // Reset end position
    }
  }, [])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // Track movement for iOS Safari
      if (e.touches && e.touches[0]) {
        setTouchEndX(e.touches[0].clientX)

        // Prevent default only for horizontal swipes to not break vertical scrolling
        const distance = touchStartX - e.touches[0].clientX
        if (Math.abs(distance) > 10) {
          // Only prevent if clearly horizontal
          const verticalDistance = e.touches[0].clientY
          if (Math.abs(distance) > Math.abs(verticalDistance)) {
            e.preventDefault()
          }
        }
      }
    },
    [touchStartX]
  )

  const handleTouchEnd = useCallback(() => {
    if (!touchStartX || !touchEndX) return

    const distance = touchStartX - touchEndX
    const threshold = 50 // Minimum swipe distance for iOS
    const isLeftSwipe = distance > threshold
    const isRightSwipe = distance < -threshold

    if (isLeftSwipe || isRightSwipe) {
      const tabs = ['personal', 'settings', 'learning', 'statistics']
      const currentIndex = tabs.indexOf(activeTab)
      let newIndex = currentIndex

      if (isLeftSwipe && currentIndex < tabs.length - 1) {
        newIndex = currentIndex + 1
      } else if (isRightSwipe && currentIndex > 0) {
        newIndex = currentIndex - 1
      }

      if (tabs[newIndex] && newIndex !== currentIndex) {
        setActiveTab(tabs[newIndex])

        // Announce to screen readers
        const announcement = document.getElementById('swipe-announcement')
        if (announcement) {
          const tabLabels = [
            t('tabs.personal.label'),
            t('tabs.settings.label'),
            t('tabs.learning.label'),
            t('tabs.statistics.label'),
          ]
          announcement.textContent = t('announcements.tabSwitched', { tab: tabLabels[newIndex] })
        }

        // Haptic feedback for iOS devices
        if (window.navigator && 'vibrate' in window.navigator) {
          window.navigator.vibrate(10)
        }
      }
    }

    // Reset touch positions
    setTouchStartX(0)
    setTouchEndX(0)
  }, [touchStartX, touchEndX, activeTab])

  // Load profile data and preferences
  useEffect(() => {
    const loadProfile = async () => {
      if (!session?.user) {
        setIsLoading(false)
        return
      }

      try {
        setError(null)

        // Fetch profile data
        const { data, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (profileError) throw profileError

        // Load preferences from Supabase
        const userPreferences = await loadUserPreferences(supabase, session.user.id)
        setPreferences(userPreferences)

        // Only sync theme from DB if localStorage doesn't have a theme set
        // This prevents overriding user's current theme selection
        if (mounted) {
          const localTheme = localStorage.getItem('theme')
          if (!localTheme && userPreferences.theme_preference) {
            // No local theme stored, use the one from database
            setTheme(userPreferences.theme_preference)
          } else if (localTheme && localTheme !== userPreferences.theme_preference) {
            // Local theme differs from DB, update DB to match local
            const updatedPrefs = {
              ...userPreferences,
              theme_preference: localTheme as 'light' | 'dark',
            }
            await saveUserPreferences(supabase, session.user.id, updatedPrefs)
            setPreferences(updatedPrefs)
          }
        }

        const enhancedProfile: UserProfile = {
          id: data.id,
          email: data.email || '',
          full_name: data.full_name || undefined,
          avatar_url: data.avatar_url || undefined,
          bio: data.bio || undefined,
          role: (data.role as 'student' | 'admin' | 'superadmin') || 'student',
          telegram_chat_id: data.telegram_chat_id || undefined,
          telegram_notifications_enabled: data.telegram_notifications_enabled ?? false,
          created_at: data.created_at || undefined,
          updated_at: data.updated_at || undefined,
          preferences: userPreferences,
          // Stats (could be fetched from courses table in future)
          courses_enrolled: 0,
          courses_completed: 0,
          total_learning_hours: 0,
          last_activity: new Date().toISOString(),
        }

        setProfile(enhancedProfile)
      } catch {
        // Failed to load profile - error will be shown via toast
        setError(t('errors.loadFailed'))
      } finally {
        setIsLoading(false)
      }
    }

    if (session?.user && mounted) {
      void loadProfile()
    }
  }, [session, supabase, mounted, setTheme])

  // Avatar upload handler
  const handleAvatarUpload = useCallback(
    async (files: File[]) => {
      if (!files.length || !session?.user || !profile) return

      const file = files[0]

      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast.error(t('avatar.invalidType'))
        return
      }

      // Validate file size
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('avatar.sizeError'))
        return
      }

      // Validate image dimensions
      const validateDimensions = () =>
        new Promise<boolean>((resolve) => {
          const img = new window.Image()
          img.onload = () => {
            const { width, height } = img
            URL.revokeObjectURL(img.src)

            // Check minimum dimensions
            if (width < 100 || height < 100) {
              toast.error(t('avatar.tooSmall'))
              resolve(false)
              return
            }

            // Check maximum dimensions
            if (width > 4096 || height > 4096) {
              toast.error(t('avatar.tooLarge'))
              resolve(false)
              return
            }

            // Check aspect ratio (allow up to 3:1 or 1:3)
            const aspectRatio = width / height
            if (aspectRatio > 3 || aspectRatio < 0.33) {
              toast.error(t('avatar.aspectRatio'))
              resolve(false)
              return
            }

            resolve(true)
          }
          img.onerror = () => {
            URL.revokeObjectURL(img.src)
            toast.error(t('avatar.validationFailed'))
            resolve(false)
          }
          img.src = URL.createObjectURL(file)
        })

      const isValidDimensions = await validateDimensions()
      if (!isValidDimensions) return

      try {
        setUploadProgress(10)

        // Upload to Supabase Storage
        const fileExt = file.name.split('.').pop()
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`
        const filePath = `avatars/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, file, {
            upsert: true,
          })

        setUploadProgress(50)

        if (uploadError) {
          // Upload error handled, showing user notification
          const errorMessage = uploadError.message?.includes('row-level security')
            ? t('avatar.noPermission')
            : uploadError.message?.includes('Storage')
              ? t('avatar.storageError')
              : t('avatar.uploadError')
          toast.error(errorMessage)
          return
        }

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from('avatars').getPublicUrl(filePath)

        setUploadProgress(75)

        // Update profile
        const { error: updateError } = await supabase
          .from('users')
          .update({ avatar_url: publicUrl })
          .eq('id', session.user.id)

        setUploadProgress(100)

        if (updateError) {
          // Update error handled, showing user notification
          const errorMessage = updateError.message?.includes('duplicate')
            ? t('avatar.duplicateError')
            : updateError.message?.includes('permission')
              ? t('avatar.permissionError')
              : t('avatar.updateError', { error: updateError.message || '' })
          toast.error(errorMessage)
          return
        }

        // Update local state
        setProfile({ ...profile, avatar_url: publicUrl })
        toast.success(t('avatar.updateSuccess'))
      } catch {
        // Avatar upload error handled, showing user notification
        toast.error(t('avatar.uploadFailed'))
      } finally {
        setTimeout(() => setUploadProgress(0), 1000)
      }
    },
    [session, supabase, profile]
  )

  // Update profile function
  const updateProfile = useCallback(
    async (updates: Partial<UserProfile & UserPrefs>) => {
      if (!session?.user || !profile || !preferences) return

      setIsSaving(true)
      setHasUnsavedChanges(false)

      try {
        // Separate profile fields from preference fields
        const { full_name, avatar_url, telegram_chat_id, telegram_notifications_enabled } = updates
        const profileUpdates: Partial<Profile> = {}
        if (full_name !== undefined) profileUpdates.full_name = full_name
        if (avatar_url !== undefined) profileUpdates.avatar_url = avatar_url
        if (telegram_chat_id !== undefined) profileUpdates.telegram_chat_id = telegram_chat_id
        if (telegram_notifications_enabled !== undefined)
          profileUpdates.telegram_notifications_enabled = telegram_notifications_enabled

        // Update profile in database if needed
        if (Object.keys(profileUpdates).length > 0) {
          const { error } = await supabase
            .from('users')
            .update(profileUpdates)
            .eq('id', session.user.id)

          if (error) {
            const errorMessage = error.message?.includes('row-level security')
              ? t('errors.rlsError')
              : error.message?.includes('unique')
                ? t('errors.uniqueError')
                : t('errors.saveError', { error: error.message || '' })
            toast.error(errorMessage)
            return
          }

          // Sync profile fields to auth user_metadata so header/nav update immediately
          const authData: Record<string, string> = {}
          if (profileUpdates.full_name !== undefined) authData.full_name = profileUpdates.full_name
          if (profileUpdates.avatar_url !== undefined)
            authData.avatar_url = profileUpdates.avatar_url
          if (Object.keys(authData).length > 0) {
            const { error: authError } = await supabase.auth.updateUser({ data: authData })
            if (authError) {
              logger.warn('Failed to sync profile to auth metadata', authError.message)
              toast.warning(t('warnings.profileSyncPartial'))
            }
          }
        }

        // Extract preference fields
        const preferenceKeys: (keyof UserPrefs)[] = [
          'theme_preference',
          'language',
          'font_size',
          'high_contrast',
          'reduce_motion',
          'email_notifications',
          'email_course_updates',
          'push_notifications',
          'profile_visibility',
          'show_achievements',
          'data_collection',
          'difficulty_level',
          'learning_style',
          'daily_goal_minutes',
          'version',
        ]

        const preferenceUpdates: Partial<UserPrefs> = {}
        let hasPreferenceUpdates = false

        for (const key of preferenceKeys) {
          if (key in updates) {
            const value = updates[key as keyof typeof updates]
            if (value !== undefined) {
              ;(preferenceUpdates[key] as typeof value) = value
              hasPreferenceUpdates = true
            }
          }
        }

        // Update preferences if needed
        if (hasPreferenceUpdates) {
          const newPreferences = { ...preferences, ...preferenceUpdates }
          await saveUserPreferences(supabase, session.user.id, newPreferences)
          setPreferences(newPreferences)

          // Apply theme change immediately using next-themes
          if (preferenceUpdates.theme_preference && mounted) {
            setTheme(preferenceUpdates.theme_preference)
          }
        }

        // Update local state
        setProfile({ ...profile, ...profileUpdates })
        toast.success(t('success.settingsSaved'))
      } catch {
        // Failed to save settings - error will be shown via toast
        toast.error(t('errors.saveFailed'))
      } finally {
        setIsSaving(false)
      }
    },
    [session, supabase, profile, preferences, mounted, setTheme, t]
  )

  // Export data function
  const exportUserData = useCallback(() => {
    if (!profile) return

    const dataToExport = {
      profile: {
        ...profile,
        exported_at: new Date().toISOString(),
      },
    }

    const json = JSON.stringify(dataToExport, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `megacampus-ai-profile-${profile.id}-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()

    toast.success(t('success.dataExported'))
  }, [profile, t])

  // Delete account function
  const deleteAccount = useCallback(async () => {
    if (!session?.user) return

    try {
      // Clear local storage first
      safeStorage.removeItem('userPreferences')
      safeStorage.clear(sessionStorage)

      // Call the API route to delete the account
      const response = await fetch('/api/profile/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || t('accountSettings.deleteAccountFailed'))
        return
      }

      if (data.partial) {
        // Partial deletion - auth user still exists
        toast.warning(data.message)
      } else {
        // Full deletion successful
        toast.success(data.message || t('accountSettings.deleteAccountSuccess'))
      }

      // Redirect to home page
      router.push('/')
    } catch {
      // Delete account error handled, showing user notification
      toast.error(t('accountSettings.deleteAccountTryLater'))
    }
  }, [session, router, t])

  // Loading state
  if (sessionLoading || isLoading) {
    return <ProfilePageSkeleton />
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <ProfileErrorBoundary error={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  // Not authenticated
  if (!session || !profile) {
    return null
  }

  // Combined profile with preferences for components
  const profileWithPrefs =
    profile && preferences
      ? {
          ...profile,
          ...preferences,
          preferences,
        }
      : null

  return (
    <ErrorBoundary
      onError={() => {
        // Log error to monitoring service in production
        if (process.env.NODE_ENV === 'production') {
          // logErrorToService(_error, _errorInfo);
        }
      }}
    >
      <div className="bg-background relative min-h-screen" role="main">
        {/* Main Application Header */}
        <MainProfileHeader />

        {/* Navigation Header */}
        <div className="bg-background sticky top-[73px] z-40 border-b">
          <div className="container mx-auto max-w-6xl px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (hasUnsavedChanges) {
                      if (confirm(t('confirmations.unsavedChangesNav'))) {
                        router.back()
                      }
                    } else {
                      router.back()
                    }
                  }}
                  aria-label={t('navigation.back')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <nav
                  className="text-muted-foreground flex items-center space-x-1 text-sm"
                  aria-label="Breadcrumb"
                >
                  <Link href="/" className="hover:text-foreground transition-colors">
                    {t('navigation.home')}
                  </Link>
                  <ChevronRight className="h-4 w-4" />
                  <span className="text-foreground">{t('navigation.profile')}</span>
                </nav>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (hasUnsavedChanges) {
                    if (confirm(t('confirmations.unsavedChangesNav'))) {
                      router.push('/')
                    }
                  } else {
                    router.push('/')
                  }
                }}
                aria-label={t('navigation.close')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Skip navigation link */}
        <a
          href="#main-content"
          className="focus:bg-primary focus:text-primary-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:ring-2 focus:ring-offset-2 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              mainContentRef.current?.focus()
            }
          }}
        >
          {t('navigation.skipToMain')}
        </a>

        {/* Screen reader announcements */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          <span id="tab-announcement"></span>
          <span id="swipe-announcement"></span>
          <span id="save-announcement"></span>
          <span id="upload-announcement"></span>
        </div>
        {/* Keyboard Hints Dialog */}
        {showKeyboardHints && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md bg-white p-6 dark:bg-gray-900">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Keyboard className="h-5 w-5" />
                  {t('keyboard.title')}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKeyboardHints(false)}
                  aria-label={t('keyboard.closeHints')}
                >
                  ✕
                </Button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('keyboard.showHelp')}</span>
                  <kbd className="rounded border px-2 py-1 text-xs">Shift + ?</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('keyboard.personalInfo')}</span>
                  <kbd className="rounded border px-2 py-1 text-xs">Ctrl/⌘ + 1</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('keyboard.settings')}</span>
                  <kbd className="rounded border px-2 py-1 text-xs">Ctrl/⌘ + 2</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('keyboard.learning')}</span>
                  <kbd className="rounded border px-2 py-1 text-xs">Ctrl/⌘ + 3</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('keyboard.statistics')}</span>
                  <kbd className="rounded border px-2 py-1 text-xs">Ctrl/⌘ + 4</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('keyboard.nextTab')}</span>
                  <kbd className="rounded border px-2 py-1 text-xs">→</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('keyboard.previousTab')}</span>
                  <kbd className="rounded border px-2 py-1 text-xs">←</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('keyboard.closeDialog')}</span>
                  <kbd className="rounded border px-2 py-1 text-xs">Esc</kbd>
                </div>
              </div>
              <p className="text-muted-foreground mt-4 text-xs">{t('keyboard.tip')}</p>
            </Card>
          </div>
        )}

        {/* Gradient background for premium feel */}
        <div className="gradient-subtle pointer-events-none absolute inset-0" />

        {/* Desktop Layout */}
        <div className="relative z-10 hidden lg:flex" role="presentation">
          <ProfileSidebar
            profile={profileWithPrefs || profile}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={profileTabs}
          />
          <main
            id="main-content"
            className="flex-1 overflow-y-auto"
            ref={mainContentRef}
            tabIndex={-1}
            aria-label={t('navigation.mainContent')}
          >
            <div className="container mx-auto max-w-4xl px-6 py-8">
              <ProfileContent
                profile={profileWithPrefs || profile}
                activeTab={activeTab}
                tabs={profileTabs}
                updateProfile={updateProfile}
                handleAvatarUpload={handleAvatarUpload}
                uploadProgress={uploadProgress}
                isSaving={isSaving}
                exportUserData={exportUserData}
                deleteAccount={deleteAccount}
              />
            </div>
          </main>
        </div>

        {/* Mobile/Tablet Layout */}
        <div
          className="lg:hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          role="presentation"
        >
          <div className="container mx-auto px-4 py-6">
            <ProfileHeaderBanner profile={profileWithPrefs || profile} />

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="mt-6"
              aria-label={t('navigation.profileSections')}
            >
              <TabsList
                className="grid w-full grid-cols-2 sm:grid-cols-4"
                role="tablist"
                aria-label={t('navigation.profileNav')}
              >
                {profileTabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="data-[state=active]:tab-active focus-visible:ring-ring flex min-h-[44px] touch-manipulation flex-col items-center gap-1 py-3 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:flex-row sm:gap-2 sm:py-2"
                    role="tab"
                    aria-selected={activeTab === tab.value}
                    aria-controls={`${tab.value}-panel`}
                    id={`${tab.value}-tab`}
                  >
                    <tab.icon className="h-4 w-4" />
                    <span className="text-xs sm:text-sm">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="mt-6">
                <ProfileContent
                  profile={profileWithPrefs || profile}
                  activeTab={activeTab}
                  tabs={profileTabs}
                  isMobile
                  updateProfile={updateProfile}
                  handleAvatarUpload={handleAvatarUpload}
                  uploadProgress={uploadProgress}
                  isSaving={isSaving}
                  exportUserData={exportUserData}
                  deleteAccount={deleteAccount}
                />
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
