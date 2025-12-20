'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ErrorBoundary } from '@/components/common/error-boundary'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/lib/supabase/browser-client'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  User, Settings, BookOpen, BarChart3, AlertTriangle,
  Keyboard, ArrowLeft, X, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Profile } from '@/types/database'
import PersonalInfoSection from './components/PersonalInfoSection'
import AccountSettingsSection from './components/AccountSettingsSection'
import LearningPreferencesSection from './components/LearningPreferencesSection'
import StatisticsSection from './components/StatisticsSection'
import {
  loadUserPreferences,
  saveUserPreferences,
  type UserPreferences as UserPrefs
} from '@/lib/user-preferences'
import { ProfileHeader as MainProfileHeader } from './_components/profile-header'

// Safe storage utilities
const safeStorage = {
  getItem: (key: string, storage: Storage = localStorage) => {
    if (typeof window === 'undefined') return null
    try {
      return storage.getItem(key)
    } catch {
      // Failed to get from storage - return null silently
      return null
    }
  },
  setItem: (key: string, value: string, storage: Storage = localStorage) => {
    if (typeof window === 'undefined') return false
    try {
      storage.setItem(key, value)
      return true
    } catch (error) {
      // Storage might be full or disabled
      // Failed to set in storage - handle silently
      // Try to clear old data if storage is full
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        try {
          // Clear old preferences to make room
          storage.removeItem('userPreferences_old')
          storage.setItem(key, value)
          return true
        } catch {
          return false
        }
      }
      return false
    }
  },
  removeItem: (key: string, storage: Storage = localStorage) => {
    if (typeof window === 'undefined') return
    try {
      storage.removeItem(key)
    } catch {
      // Failed to remove from storage - handle silently
    }
  },
  clear: (storage: Storage = sessionStorage) => {
    if (typeof window === 'undefined') return
    try {
      storage.clear()
    } catch {
      // Failed to clear storage - handle silently
    }
  }
}

// Extended Profile data structure for Phase 3
export interface UserProfile extends Profile {
  bio?: string
  preferences?: UserPrefs
  courses_enrolled?: number
  courses_completed?: number
  total_learning_hours?: number
  last_activity?: string
}

// Tab configuration
const profileTabs = [
  {
    value: 'personal',
    label: 'Личная информация',
    icon: User,
    description: 'Управление профилем и личными данными'
  },
  {
    value: 'settings',
    label: 'Настройки',
    icon: Settings,
    description: 'Настройки аккаунта и безопасности'
  },
  {
    value: 'learning',
    label: 'Обучение',
    icon: BookOpen,
    description: 'Настройки обучения и предпочтения'
  },
  {
    value: 'statistics',
    label: 'Статистика',
    icon: BarChart3,
    description: 'Ваш прогресс и достижения'
  }
]

export default function ProfilePage() {
  const router = useRouter()
  const { supabase, session, isLoading: sessionLoading } = useSupabase()
  const { theme, setTheme } = useTheme()
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
  const [mounted, setMounted] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const mainContentRef = useRef<HTMLDivElement>(null)

  // Set mounted state
  useEffect(() => {
    setMounted(true)
  }, [])

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
        e.returnValue = 'У вас есть несохраненные изменения. Вы уверены, что хотите покинуть страницу?'
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
        setShowKeyboardHints(prev => !prev)
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
            const tabLabels = ['Личная информация', 'Настройки', 'Обучение', 'Статистика']
            announcement.textContent = `Переключено на вкладку: ${tabLabels[tabIndex]}`
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

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
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
  }, [touchStartX])

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
          const tabLabels = ['Личная информация', 'Настройки', 'Обучение', 'Статистика']
          announcement.textContent = `Переключено на вкладку: ${tabLabels[newIndex]}`
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
            const updatedPrefs = { ...userPreferences, theme_preference: localTheme as 'light' | 'dark' }
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
          created_at: data.created_at || undefined,
          updated_at: data.updated_at || undefined,
          preferences: userPreferences,
          // Stats (could be fetched from courses table in future)
          courses_enrolled: 0,
          courses_completed: 0,
          total_learning_hours: 0,
          last_activity: new Date().toISOString()
        }

        setProfile(enhancedProfile)
      } catch {
        // Failed to load profile - error will be shown via toast
        setError('Не удалось загрузить профиль. Попробуйте обновить страницу.')
      } finally {
        setIsLoading(false)
      }
    }

    if (session?.user && mounted) {
      loadProfile()
    }
  }, [session, supabase, mounted, theme, setTheme])

  // Avatar upload handler
  const handleAvatarUpload = useCallback(async (files: File[]) => {
    if (!files.length || !session?.user || !profile) return

    const file = files[0]

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Пожалуйста, загрузите изображение (JPEG, PNG или WebP)')
      return
    }

    // Validate file size
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Размер файла не должен превышать 5MB')
      return
    }

    // Validate image dimensions
    const validateDimensions = () => new Promise<boolean>((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        const { width, height } = img
        URL.revokeObjectURL(img.src)

        // Check minimum dimensions
        if (width < 100 || height < 100) {
          toast.error('Изображение слишком маленькое. Минимальный размер 100x100 пикселей.')
          resolve(false)
          return
        }

        // Check maximum dimensions
        if (width > 4096 || height > 4096) {
          toast.error('Изображение слишком большое. Максимальный размер 4096x4096 пикселей.')
          resolve(false)
          return
        }

        // Check aspect ratio (allow up to 3:1 or 1:3)
        const aspectRatio = width / height
        if (aspectRatio > 3 || aspectRatio < 0.33) {
          toast.error('Неподходящее соотношение сторон. Используйте более квадратное изображение.')
          resolve(false)
          return
        }

        resolve(true)
      }
      img.onerror = () => {
        URL.revokeObjectURL(img.src)
        toast.error('Не удалось загрузить изображение для проверки.')
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
          upsert: true
        })

      setUploadProgress(50)

      if (uploadError) {
        // Upload error handled, showing user notification
        const errorMessage = uploadError.message?.includes('row-level security')
          ? 'У вас нет прав для загрузки файлов. Обратитесь к администратору.'
          : uploadError.message?.includes('Storage')
          ? 'Ошибка хранилища. Попробуйте позже.'
          : 'Не удалось загрузить файл. Проверьте соединение и попробуйте снова.'
        toast.error(errorMessage)
        return
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

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
          ? 'Такой аватар уже существует. Попробуйте другое изображение.'
          : updateError.message?.includes('permission')
          ? 'У вас нет прав для обновления профиля.'
          : `Не удалось обновить профиль: ${updateError.message || 'Неизвестная ошибка'}`
        toast.error(errorMessage)
        return
      }

      // Update local state
      setProfile({ ...profile, avatar_url: publicUrl })
      toast.success('Аватар успешно обновлен')
    } catch {
      // Avatar upload error handled, showing user notification
      toast.error('Не удалось загрузить аватар')
    } finally {
      setTimeout(() => setUploadProgress(0), 1000)
    }
  }, [session, supabase, profile])

  // Update profile function
  const updateProfile = useCallback(async (updates: Partial<UserProfile & UserPrefs>) => {
    if (!session?.user || !profile || !preferences) return

    setIsSaving(true)
    setHasUnsavedChanges(false)

    try {
      // Separate profile fields from preference fields
      const { full_name, avatar_url } = updates
      const profileUpdates: Partial<Profile> = {}
      if (full_name !== undefined) profileUpdates.full_name = full_name
      if (avatar_url !== undefined) profileUpdates.avatar_url = avatar_url

      // Update profile in database if needed
      if (Object.keys(profileUpdates).length > 0) {
        const { error } = await supabase
          .from('users')
          .update(profileUpdates)
          .eq('id', session.user.id)

        if (error) {
          const errorMessage = error.message?.includes('row-level security')
            ? 'У вас нет прав для изменения этих данных.'
            : error.message?.includes('unique')
            ? 'Это имя уже используется другим пользователем.'
            : `Ошибка сохранения: ${error.message || 'Попробуйте позже'}`
          toast.error(errorMessage)
          return
        }
      }

      // Extract preference fields
      const preferenceKeys: (keyof UserPrefs)[] = [
        'theme_preference', 'language', 'font_size', 'high_contrast', 'reduce_motion',
        'email_notifications', 'email_course_updates', 'push_notifications',
        'profile_visibility', 'show_achievements', 'data_collection',
        'difficulty_level', 'learning_style', 'daily_goal_minutes', 'version'
      ]

      const preferenceUpdates: Partial<UserPrefs> = {}
      let hasPreferenceUpdates = false

      for (const key of preferenceKeys as Array<keyof UserPrefs>) {
        if (key in updates) {
          const value = updates[key as keyof typeof updates]
          if (value !== undefined) {
            (preferenceUpdates[key] as typeof value) = value
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
      toast.success('Настройки сохранены')
    } catch {
      // Failed to save settings - error will be shown via toast
      toast.error('Не удалось сохранить настройки')
    } finally {
      setIsSaving(false)
    }
  }, [session, supabase, profile, preferences, mounted, setTheme])

  // Export data function
  const exportUserData = useCallback(() => {
    if (!profile) return

    const dataToExport = {
      profile: {
        ...profile,
        exported_at: new Date().toISOString()
      }
    }

    const json = JSON.stringify(dataToExport, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `megacampus-ai-profile-${profile.id}-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()

    toast.success('Данные экспортированы')
  }, [profile])

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
        toast.error(data.error || 'Не удалось удалить аккаунт')
        return
      }

      if (data.partial) {
        // Partial deletion - auth user still exists
        toast.warning(data.message)
      } else {
        // Full deletion successful
        toast.success(data.message || 'Аккаунт успешно удален')
      }

      // Redirect to home page
      router.push('/')
    } catch {
      // Delete account error handled, showing user notification
      toast.error('Не удалось удалить аккаунт. Попробуйте позже.')
    }
  }, [session, router])

  // Loading state
  if (sessionLoading || isLoading) {
    return <ProfilePageSkeleton />
  }

  // Error state
  if (error) {
    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <ProfileErrorBoundary error={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  // Not authenticated
  if (!session || !profile) {
    return null
  }

  // Combined profile with preferences for components
  const profileWithPrefs = profile && preferences ? {
    ...profile,
    ...preferences,
    preferences
  } : null

  return (
    <ErrorBoundary
      onError={() => {
        // Log error to monitoring service in production
        if (process.env.NODE_ENV === 'production') {
          // logErrorToService(_error, _errorInfo);
        }
      }}
    >
      <div className="min-h-screen bg-background relative" role="main">
      {/* Main Application Header */}
      <MainProfileHeader />

      {/* Navigation Header */}
      <div className="sticky top-[73px] z-40 bg-background border-b">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (hasUnsavedChanges) {
                    if (confirm('У вас есть несохраненные изменения. Вы уверены, что хотите выйти?')) {
                      router.back()
                    }
                  } else {
                    router.back()
                  }
                }}
                aria-label="Назад"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <nav className="flex items-center space-x-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
                <Link href="/" className="hover:text-foreground transition-colors">Главная</Link>
                <ChevronRight className="h-4 w-4" />
                <span className="text-foreground">Профиль</span>
              </nav>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (hasUnsavedChanges) {
                  if (confirm('У вас есть несохраненные изменения. Вы уверены, что хотите выйти?')) {
                    router.push('/')
                  }
                } else {
                  router.push('/')
                }
              }}
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Skip navigation link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            mainContentRef.current?.focus()
          }
        }}
      >
        Перейти к основному содержимому
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-md p-6 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Сочетания клавиш
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKeyboardHints(false)}
                aria-label="Закрыть подсказки"
              >
                ✕
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Показать эту справку</span>
                <kbd className="px-2 py-1 text-xs border rounded">Shift + ?</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Личная информация</span>
                <kbd className="px-2 py-1 text-xs border rounded">Ctrl/⌘ + 1</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Настройки</span>
                <kbd className="px-2 py-1 text-xs border rounded">Ctrl/⌘ + 2</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Обучение</span>
                <kbd className="px-2 py-1 text-xs border rounded">Ctrl/⌘ + 3</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Статистика</span>
                <kbd className="px-2 py-1 text-xs border rounded">Ctrl/⌘ + 4</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Следующая вкладка</span>
                <kbd className="px-2 py-1 text-xs border rounded">→</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Предыдущая вкладка</span>
                <kbd className="px-2 py-1 text-xs border rounded">←</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Закрыть диалог</span>
                <kbd className="px-2 py-1 text-xs border rounded">Esc</kbd>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Совет: используйте Tab для навигации по элементам формы
            </p>
          </Card>
        </div>
      )}

      {/* Gradient background for premium feel */}
      <div className="absolute inset-0 gradient-subtle pointer-events-none" />

      {/* Desktop Layout */}
      <div className="hidden lg:flex relative z-10" role="presentation">
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
          aria-label="Основное содержимое профиля"
        >
          <div className="container max-w-4xl mx-auto px-6 py-8">
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
          <ProfileHeader profile={profileWithPrefs || profile} />

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="mt-6"
            aria-label="Разделы профиля"
          >
            <TabsList
              className="grid grid-cols-2 sm:grid-cols-4 w-full"
              role="tablist"
              aria-label="Навигация по профилю"
            >
              {profileTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-3 sm:py-2 min-h-[44px] transition-all duration-300 data-[state=active]:tab-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-manipulation"
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

// Desktop Sidebar Component
const ProfileSidebar = React.memo(function ProfileSidebar({
  profile,
  activeTab,
  onTabChange,
  tabs
}: {
  profile: UserProfile | (UserProfile & UserPrefs)
  activeTab: string
  onTabChange: (value: string) => void
  tabs: typeof profileTabs
}) {
  return (
    <aside
      className="w-80 border-r"
      role="navigation"
      aria-label="Навигация по профилю"
    >
      <div className="sticky top-0 h-screen overflow-y-auto">
        {/* Profile Header with gradient accent */}
        <div className="p-6 border-b relative overflow-hidden">
          <div className="absolute inset-0 gradient-subtle" />
          <div className="relative z-10">
            <ProfileHeader profile={profile} />
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4" aria-label="Основная навигация профиля">
          <ul className="space-y-2">
            {tabs.map((tab) => (
              <li key={tab.value}>
                <button
                  onClick={() => onTabChange(tab.value)}
                  role="tab"
                  aria-selected={activeTab === tab.value}
                  aria-controls={`${tab.value}-panel`}
                  id={`desktop-${tab.value}-tab`}
                  tabIndex={activeTab === tab.value ? 0 : -1}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left",
                    "transition-all duration-200 ease-in-out",
                    "tab-hover", // Add hover class for all tabs
                    activeTab === tab.value
                      ? "tab-active"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <tab.icon className="h-5 w-5" />
                  <div className="flex-1">
                    <div className="font-medium">{tab.label}</div>
                    <div className="text-xs opacity-75 mt-0.5">
                      {tab.description}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  )
})

// Profile Header Component
const ProfileHeader = React.memo(function ProfileHeader({ profile }: { profile: UserProfile | (UserProfile & UserPrefs) }) {
  const roleLabel = profile.role === 'superadmin' ? 'Супер администратор' : profile.role === 'admin' ? 'Администратор' : 'Пользователь'
  const initials = profile.full_name
    ?.split(' ')
    ?.map(n => n[0])
    ?.join('')
    ?.toUpperCase() ||
    profile.email
    ?.split('@')[0]
    ?.slice(0, 2)
    ?.toUpperCase() || 'U'

  return (
    <div className="flex items-center gap-4" role="banner" aria-label="Информация о пользователе">
      <div className="relative group">
        <div className="h-16 w-16 avatar-ring">
          <div className="h-full w-full rounded-full bg-background flex items-center justify-center overflow-hidden">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={`Аватар пользователя ${profile.full_name || profile.email}`}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                fill
                sizes="64px"
                priority={false}
              />
            ) : (
              <span
                className="text-xl font-semibold gradient-text"
                aria-label={`Инициалы: ${initials}`}
              >
                {initials}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h1
          className="text-lg font-semibold truncate gradient-text"
          id="profile-heading"
        >
          {profile.full_name || 'Пользователь'}
        </h1>
        <p className="text-sm text-muted-foreground truncate">
          {profile.email}
        </p>
        {profile.role && profile.role !== 'student' && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium gradient-badge text-primary mt-1 transition-all duration-300 hover:shadow-lg"
            role="status"
            aria-label={`Роль: ${roleLabel}`}
          >
            {profile.role === 'superadmin' ? 'Супер админ' : 'Админ'}
          </span>
        )}
      </div>
    </div>
  )
})

// Common tab content renderer
const TabContentRenderer = React.memo(function TabContentRenderer({
  tabValue,
  profile,
  updateProfile,
  handleAvatarUpload,
  uploadProgress,
  isSaving,
  exportUserData,
  deleteAccount
}: {
  tabValue: string
  profile: UserProfile | (UserProfile & UserPrefs)
  updateProfile: (updates: Partial<UserProfile & UserPrefs>) => Promise<void>
  handleAvatarUpload: (files: File[]) => Promise<void>
  uploadProgress: number
  isSaving: boolean
  exportUserData: () => void
  deleteAccount: () => Promise<void>
}) {
  const renderContent = React.useCallback(() => {
    switch (tabValue) {
      case 'personal':
        return (
          <PersonalInfoSection
            profile={profile}
            onUpdate={updateProfile}
            onAvatarUpload={handleAvatarUpload}
            uploadProgress={uploadProgress}
            isSaving={isSaving}
          />
        )
      case 'settings':
        return (
          <AccountSettingsSection
            profile={profile}
            onUpdate={updateProfile}
            isSaving={isSaving}
            onExportData={exportUserData}
            onDeleteAccount={deleteAccount}
          />
        )
      case 'learning':
        return (
          <LearningPreferencesSection
            profile={profile}
            onUpdate={updateProfile}
          />
        )
      case 'statistics':
        return <StatisticsSection profile={profile} />
      default:
        return null
    }
  }, [tabValue, profile, updateProfile, handleAvatarUpload, uploadProgress, isSaving, exportUserData, deleteAccount])

  return <>{renderContent()}</>
})

// Profile Content Component
const ProfileContent = React.memo(function ProfileContent({
  profile,
  activeTab,
  tabs,
  isMobile = false,
  updateProfile,
  handleAvatarUpload,
  uploadProgress,
  isSaving,
  exportUserData,
  deleteAccount
}: {
  profile: UserProfile | (UserProfile & UserPrefs)
  activeTab: string
  tabs: typeof profileTabs
  isMobile?: boolean
  updateProfile: (updates: Partial<UserProfile & UserPrefs>) => Promise<void>
  handleAvatarUpload: (files: File[]) => Promise<void>
  uploadProgress: number
  isSaving: boolean
  exportUserData: () => void
  deleteAccount: () => Promise<void>
}) {
  if (!isMobile) {
    // Desktop: Direct content rendering
    const currentTab = tabs.find(t => t.value === activeTab)

    return (
      <section
        role="tabpanel"
        id={`${activeTab}-panel`}
        aria-labelledby={`desktop-${activeTab}-tab`}
        tabIndex={0}
      >
        <div className="mb-6 animate-tabFadeIn">
          <h2 className="text-2xl font-bold flex items-center gap-3" id="section-heading">
            {currentTab && (
              <>
                <currentTab.icon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                <span className="gradient-text">
                  {currentTab.label}
                </span>
              </>
            )}
          </h2>
          <p className="text-muted-foreground mt-1">
            {currentTab?.description}
          </p>
        </div>

        <div className="space-y-6 animate-tabSlideIn">
          <TabContentRenderer
            tabValue={activeTab}
            profile={profile}
            updateProfile={updateProfile}
            handleAvatarUpload={handleAvatarUpload}
            uploadProgress={uploadProgress}
            isSaving={isSaving}
            exportUserData={exportUserData}
            deleteAccount={deleteAccount}
          />
        </div>
      </section>
    )
  }

  // Mobile: Tabs content
  return (
    <>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0 animate-tabSlideIn">
          <div className="space-y-6 animate-tabSlideIn">
            <TabContentRenderer
              tabValue={tab.value}
              profile={profile}
              updateProfile={updateProfile}
              handleAvatarUpload={handleAvatarUpload}
              uploadProgress={uploadProgress}
              isSaving={isSaving}
              exportUserData={exportUserData}
              deleteAccount={deleteAccount}
            />
          </div>
        </TabsContent>
      ))}
    </>
  )
})

// Loading Skeleton Component
function ProfilePageSkeleton() {
  return (
    <div className="min-h-screen bg-background relative">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-100/20 via-transparent to-pink-100/20 dark:from-purple-900/10 dark:to-pink-900/10 pointer-events-none" />
      <div className="hidden lg:flex relative z-10">
        {/* Desktop Skeleton */}
        <aside className="w-80 border-r">
          <div className="p-6 border-b">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg shimmer" />
            ))}
          </div>
        </aside>
        <main className="flex-1 p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Card className="p-6">
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-5 w-full max-w-sm" />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </main>
      </div>

      {/* Mobile Skeleton */}
      <div className="lg:hidden p-4">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-10 w-full mb-6" />
        <Card className="p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// Error Boundary Component
function ProfileErrorBoundary({
  error,
  onRetry
}: {
  error: string
  onRetry: () => void
}) {
  return (
    <Card className="p-8 text-center max-w-md mx-auto">
      <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
      <h2 className="text-lg font-semibold mb-2">
        Произошла ошибка
      </h2>
      <p className="text-muted-foreground mb-4">
        {error}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 btn-primary rounded-md transition-all duration-300 hover:scale-105 transform"
      >
        Попробовать снова
      </button>
    </Card>
  )
}