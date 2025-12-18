/**
 * E2E Test Helper Functions
 *
 * Utilities for interacting with Redis, database, and API during E2E tests.
 */

import { Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import Redis from 'ioredis'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * Get Redis session data for a user
 */
export async function getRedisSession(
  userId: string,
  sessionId: string
): Promise<any | null> {
  const redis = new Redis(redisUrl)
  try {
    const key = `draft:session:${userId}:${sessionId}`
    const data = await redis.get(key)
    return data ? JSON.parse(data) : null
  } finally {
    await redis.quit()
  }
}

/**
 * Get all Redis sessions for a user
 */
export async function getAllRedisSessions(userId: string): Promise<string[]> {
  const redis = new Redis(redisUrl)
  try {
    const pattern = `draft:session:${userId}:*`
    const keys = await redis.keys(pattern)
    return keys
  } finally {
    await redis.quit()
  }
}

/**
 * Delete all Redis sessions for a user
 */
export async function clearRedisSessions(userId: string): Promise<void> {
  const redis = new Redis(redisUrl)
  try {
    const pattern = `draft:session:${userId}:*`
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } finally {
    await redis.quit()
  }
}

/**
 * Set Redis session timestamp (for TTL testing)
 */
export async function setRedisSessionTimestamp(
  userId: string,
  sessionId: string,
  hoursAgo: number
): Promise<void> {
  const redis = new Redis(redisUrl)
  try {
    const key = `draft:session:${userId}:${sessionId}`
    const data = await redis.get(key)
    if (data) {
      const session = JSON.parse(data)
      const timestamp = new Date(
        Date.now() - hoursAgo * 60 * 60 * 1000
      ).toISOString()
      session.createdAt = timestamp
      session.updatedAt = timestamp
      await redis.set(key, JSON.stringify(session), 'EX', 24 * 60 * 60)
    }
  } finally {
    await redis.quit()
  }
}

/**
 * Get draft courses from database
 */
export async function getDraftCourses(userId: string): Promise<any[]> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('status', 'draft')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching draft courses:', error)
    return []
  }

  return data || []
}

/**
 * Delete all draft courses for a user
 */
export async function clearDraftCourses(userId: string): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  await supabase
    .from('courses')
    .delete()
    .eq('status', 'draft')
    .eq('user_id', userId)
}

/**
 * Trigger cleanup job via Edge Function
 */
export async function triggerCleanupJob(): Promise<any> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/cleanup-old-drafts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Cleanup job failed: ${response.statusText}`)
  }

  return await response.json()
}

/**
 * Get current user ID from authenticated page
 */
export async function getCurrentUserId(page: Page): Promise<string> {
  // Extract user ID from page context (localStorage or cookie)
  const userId = await page.evaluate(() => {
    const authData = localStorage.getItem('supabase.auth.token')
    if (authData) {
      const parsed = JSON.parse(authData)
      return parsed?.currentSession?.user?.id || null
    }
    return null
  })

  if (!userId) {
    // Fallback: use test user ID from .env.test
    return process.env.TEST_USER_ID || 'test-user-id'
  }

  return userId
}

/**
 * Extract session ID from page (via API call or network inspection)
 */
export async function getSessionIdFromPage(page: Page): Promise<string | null> {
  // Wait for session creation and extract from network or localStorage
  const sessionId = await page.evaluate(() => {
    return (window as any).__draftSessionId || null
  })

  return sessionId
}

/**
 * Wait for auto-save to complete (debounce timeout + network)
 */
export async function waitForAutoSave(page: Page, timeoutMs = 5000): Promise<void> {
  // Wait for debounce (3 seconds) + extra buffer
  await page.waitForTimeout(timeoutMs)
}

/**
 * Fill form fields without triggering submit
 */
export async function fillFormFields(
  page: Page,
  fields: {
    topic?: string
    description?: string
    email?: string
    language?: string
  }
): Promise<void> {
  if (fields.topic) {
    await page.fill('input[name="topic"]', fields.topic)
    await page.locator('input[name="topic"]').blur()
  }

  if (fields.description) {
    await page.fill('textarea[name="description"]', fields.description)
    await page.locator('textarea[name="description"]').blur()
  }

  if (fields.email) {
    await page.fill('input[name="email"]', fields.email)
    await page.locator('input[name="email"]').blur()
  }

  if (fields.language) {
    await page.selectOption('select[name="language"]', fields.language)
  }
}
