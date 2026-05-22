/**
 * Global Setup for Playwright E2E Tests
 *
 * Handles authentication and environment preparation before test execution.
 */

import { chromium, type FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const LEGACY_SUPABASE_AUTH_COOKIE = 'sb-diqooqbuchsliypgwksu-auth-token'

function encodeSupabaseSessionCookie(session: unknown) {
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}

function getSupabaseAuthCookieNames() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
  const hostname = new URL(supabaseUrl).hostname
  const derivedProjectRef = hostname.split('.')[0] || 'localhost'

  return [...new Set([`sb-${derivedProjectRef}-auth-token`, LEGACY_SUPABASE_AUTH_COOKIE])]
}

async function globalSetup(config: FullConfig) {
  console.log('[Global Setup] Starting...')

  // Ensure .auth directory exists
  const authDir = path.join(dirname, '.auth')
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  const authFile = path.join(authDir, 'user.json')

  // Check if we have a test token
  const token = process.env.TOKEN
  if (!token) {
    console.warn('[Global Setup] No TOKEN in environment, skipping auth setup')
    console.warn('[Global Setup] Tests will use unauthenticated state')
    return
  }

  console.log('[Global Setup] Setting up authenticated state...')

  // Launch browser and create auth state
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Set up authentication in localStorage
    const session = {
      access_token: token,
      refresh_token: token,
      token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      expires_in: 60 * 60,
    }

    const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000'
    const cookieValue = encodeSupabaseSessionCookie(session)
    const authCookies = getSupabaseAuthCookieNames()

    await context.addCookies(
      authCookies.map((name) => ({
        name,
        value: cookieValue,
        url: baseURL,
        sameSite: 'Lax' as const,
        expires: session.expires_at,
      }))
    )

    await page.addInitScript(
      ({ authCookies, authSession }) => {
        for (const authCookie of authCookies) {
          localStorage.setItem(authCookie, JSON.stringify(authSession))
        }
      },
      { authCookies, authSession: session }
    )

    // Navigate to ensure localStorage is set
    await page.goto(baseURL)

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Save storage state
    await context.storageState({ path: authFile })
    console.log(`[Global Setup] Auth state saved to ${authFile}`)
  } catch (error) {
    console.error('[Global Setup] Error during setup:', error)
    throw error
  } finally {
    await browser.close()
  }

  console.log('[Global Setup] Complete')
}

export default globalSetup
