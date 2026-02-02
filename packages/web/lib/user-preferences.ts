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

// Promise cache for deduplicating concurrent loadUserPreferences calls
// Prevents race condition when multiple components load simultaneously
const loadPromiseCache = new Map<string, Promise<UserPreferences>>()

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
  // Check if load already in progress for this user (prevents race condition)
  const existingPromise = loadPromiseCache.get(userId)
  if (existingPromise) {
    return existingPromise
  }

  const loadPromise = (async () => {
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
            } catch (saveError) {
              console.warn(
                '[UserPreferences] Failed to migrate localStorage to Supabase:',
                saveError
              )
            }
            return localPrefs
          }
          return DEFAULT_PREFERENCES
        }
        console.warn('[UserPreferences] Supabase load error:', error.message)
        throw error
      }

      const remotePrefs = data?.preferences as UserPreferences | null

      const localPrefs = getLocalPreferences()
      if (localPrefs && !remotePrefs) {
        // Migrate local preferences to Supabase
        try {
          await saveUserPreferences(supabase, userId, localPrefs)
        } catch (saveError) {
          console.warn('[UserPreferences] Failed to migrate localStorage to Supabase:', saveError)
        }
        return localPrefs
      }

      if (remotePrefs) {
        saveLocalPreferences(remotePrefs)
        return remotePrefs
      }

      return DEFAULT_PREFERENCES
    } catch (error) {
      // Fall back to local preferences if Supabase load fails
      console.warn('[UserPreferences] Load failed, using localStorage fallback:', error)
      const localPrefs = getLocalPreferences()
      return localPrefs || DEFAULT_PREFERENCES
    } finally {
      // Clean up promise cache after completion
      loadPromiseCache.delete(userId)
    }
  })()

  loadPromiseCache.set(userId, loadPromise)
  return loadPromise
}

export async function saveUserPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
  preferences: UserPreferences
): Promise<{ synced: boolean; error?: string }> {
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
      console.warn('[UserPreferences] Failed to sync to Supabase:', error.message)
      saveLocalPreferences(prefsWithVersion)
      return { synced: false, error: error.message }
    }

    // Also save to local storage as cache
    saveLocalPreferences(prefsWithVersion)
    return { synced: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.warn('[UserPreferences] Exception during save:', errorMessage)
    saveLocalPreferences(prefsWithVersion)
    return { synced: false, error: errorMessage }
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
): Promise<{ synced: boolean; error?: string }> {
  // Optimistic local update first (immediate feedback)
  const localPrefs = getLocalPreferences()
  const previousPrefs = localPrefs ? { ...localPrefs } : null

  if (localPrefs) {
    saveLocalPreferences({ ...localPrefs, [key]: value })
  }

  // Then sync to Supabase
  try {
    const currentPrefs = await loadUserPreferences(supabase, userId)
    const updatedPrefs = { ...currentPrefs, [key]: value }
    const result = await saveUserPreferences(supabase, userId, updatedPrefs)

    if (!result.synced && previousPrefs) {
      // Revert local cache on Supabase failure
      saveLocalPreferences(previousPrefs)
    }

    return result
  } catch (error) {
    // Revert local cache on error
    if (previousPrefs) {
      saveLocalPreferences(previousPrefs)
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.warn('[UserPreferences] updateSinglePreference failed:', errorMessage)
    return { synced: false, error: errorMessage }
  }
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
