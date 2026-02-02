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
  version: 1,
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
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<UserPreferences> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', userId)
      .single()

    if (error) {
      // Handle "no rows" (PGRST116) error by falling back to local preferences
      if (error.code === 'PGRST116') {
        const localPrefs = getLocalPreferences()
        if (localPrefs) {
          // Migrate local preferences to Supabase
          try {
            await saveUserPreferences(supabase, userId, localPrefs)
          } catch {
            // Silently ignore save errors
          }
          return localPrefs
        }
        return DEFAULT_PREFERENCES
      }
      throw error
    }

    const remotePrefs = data?.preferences as UserPreferences | null

    const localPrefs = getLocalPreferences()
    if (localPrefs && !remotePrefs) {
      // Migrate local preferences to Supabase
      try {
        await saveUserPreferences(supabase, userId, localPrefs)
      } catch {
        // Silently ignore save errors
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
}

export async function saveUserPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
  preferences: UserPreferences
): Promise<void> {
  const prefsWithVersion = { ...preferences, version: preferences.version || 1 }

  try {
    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: userId,
        preferences: prefsWithVersion,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    )

    if (error) {
      // Save to local storage as fallback when Supabase save fails
      saveLocalPreferences(prefsWithVersion)
      throw error
    }

    // Also save to local storage as cache
    saveLocalPreferences(prefsWithVersion)
  } catch {
    // Save to local storage as fallback
    saveLocalPreferences(prefsWithVersion)
  }
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

export function migratePreferences(
  preferences: Partial<UserPreferences> | null | undefined
): UserPreferences {
  if (!preferences) {
    return { ...DEFAULT_PREFERENCES }
  }

  return {
    ...DEFAULT_PREFERENCES,
    ...preferences,
  } as UserPreferences
}
