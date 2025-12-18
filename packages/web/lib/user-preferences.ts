import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.generated'

export interface UserPreferences {
  theme_preference: 'light' | 'dark'
  language: string
  font_size: string
  high_contrast: boolean
  reduce_motion: boolean
  email_notifications: boolean
  email_course_updates: boolean
  push_notifications: boolean
  profile_visibility: 'public' | 'private'
  show_achievements: boolean
  data_collection: boolean
  difficulty_level: string
  learning_style: string
  daily_goal_minutes: number
  version: number
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme_preference: 'light',
  language: 'ru',
  font_size: 'medium',
  high_contrast: false,
  reduce_motion: false,
  email_notifications: true,
  email_course_updates: true,
  push_notifications: false,
  profile_visibility: 'public',
  show_achievements: true,
  data_collection: true,
  difficulty_level: 'intermediate',
  learning_style: 'visual',
  daily_goal_minutes: 30,
  version: 1
}

const LOCALSTORAGE_KEY = 'userPreferences'

export function getLocalPreferences(): UserPreferences | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY)
    if (!stored) return null

    const parsed = JSON.parse(stored)
    return { ...DEFAULT_PREFERENCES, ...parsed }
  } catch {
    // Silently handle localStorage load error
    return null
  }
}

export function saveLocalPreferences(preferences: UserPreferences): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Silently handle localStorage save error
  }
}

export async function loadUserPreferences(
  _supabase: SupabaseClient<Database>,
  _userId: string
): Promise<UserPreferences> {
  // TODO: Enable Supabase integration when user_preferences table is created
  // For now, use localStorage only to avoid 404 errors
  const localPrefs = getLocalPreferences()
  return localPrefs || DEFAULT_PREFERENCES

  /* DISABLED UNTIL TABLE EXISTS
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', userId)
      .single()

    if (error) {
      // Handle both "no rows" (PGRST116) and "table not found" (42P01) errors
      // by falling back to local preferences
      if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('does not exist')) {
        const localPrefs = getLocalPreferences()
        if (localPrefs) {
          // Don't try to save to Supabase if table doesn't exist
          return localPrefs
        }
        return DEFAULT_PREFERENCES
      }
      throw error
    }

    const remotePrefs = data?.preferences as UserPreferences | null

    const localPrefs = getLocalPreferences()
    if (localPrefs && !remotePrefs) {
      // Try to save but don't fail if table doesn't exist
      try {
        await saveUserPreferences(supabase, userId, localPrefs)
      } catch {
        // Silently ignore save errors - table might not exist yet
      }
      return localPrefs
    }

    if (remotePrefs) {
      saveLocalPreferences(remotePrefs)
      return remotePrefs
    }

    return DEFAULT_PREFERENCES
  } catch {
    // Fall back to local preferences if Supabase load fails
    const localPrefs = getLocalPreferences()
    return localPrefs || DEFAULT_PREFERENCES
  }
  */
}

export async function saveUserPreferences(
  _supabase: SupabaseClient<Database>,
  _userId: string,
  preferences: UserPreferences
): Promise<void> {
  // TODO: Enable Supabase integration when user_preferences table is created
  // For now, use localStorage only to avoid 404 errors
  const prefsWithVersion = { ...preferences, version: preferences.version || 1 }
  saveLocalPreferences(prefsWithVersion)

  /* DISABLED UNTIL TABLE EXISTS
  try {
    const prefsWithVersion = { ...preferences, version: preferences.version || 1 }

    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        preferences: prefsWithVersion,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

    if (error) {
      // Handle table not found error (42P01) by falling back to localStorage
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        saveLocalPreferences(prefsWithVersion)
        // Don't throw - silently fall back to localStorage
        return
      }

      // Save to local storage as fallback when Supabase save fails
      saveLocalPreferences(prefsWithVersion)
      throw error
    }

    saveLocalPreferences(prefsWithVersion)
  } catch (_error) {
    // Save to local storage as fallback
    saveLocalPreferences(preferences)
    // Don't re-throw if it's a table not found error
    const err = _error as any
    if (err?.code !== '42P01' && !err?.message?.includes('does not exist')) {
      throw _error
    }
  }
  */
}

export function mergePreferences(
  remote: UserPreferences | null,
  local: UserPreferences | null
): UserPreferences {
  if (!remote && !local) return DEFAULT_PREFERENCES
  if (!remote) return local || DEFAULT_PREFERENCES
  if (!local) return remote

  return { ...DEFAULT_PREFERENCES, ...remote }
}

export async function updateSinglePreference<K extends keyof UserPreferences>(
  supabase: SupabaseClient<Database>,
  userId: string,
  key: K,
  value: UserPreferences[K]
): Promise<void> {
  const currentPrefs = await loadUserPreferences(supabase, userId)
  const updatedPrefs = { ...currentPrefs, [key]: value }
  await saveUserPreferences(supabase, userId, updatedPrefs)
}

export function migratePreferences(preferences: Partial<UserPreferences> | null | undefined): UserPreferences {
  if (!preferences) {
    return { ...DEFAULT_PREFERENCES }
  }

  return {
    ...DEFAULT_PREFERENCES,
    ...preferences
  } as UserPreferences
}