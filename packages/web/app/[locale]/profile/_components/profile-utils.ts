import type { Profile } from '@/types/database'
import type { UserPreferences as UserPrefs } from '@/lib/user-preferences'

// Safe storage utilities
export const safeStorage = {
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
  },
}

// Extended Profile data structure for Phase 3
export interface UserProfile extends Profile {
  bio?: string
  preferences?: UserPrefs
  courses_enrolled?: number
  courses_completed?: number
  total_learning_hours?: number
  last_activity?: string
  telegram_chat_id?: string | null
  telegram_notifications_enabled?: boolean | null
}
