/**
 * Global Setup for Playwright E2E Tests
 *
 * Handles authentication and environment preparation before test execution.
 */

import { chromium, type FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'

async function globalSetup(config: FullConfig) {
  console.log('[Global Setup] Starting...')

  // Ensure .auth directory exists
  const authDir = path.join(__dirname, '.auth')
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
    await page.addInitScript((authToken) => {
      localStorage.setItem(
        'sb-diqooqbuchsliypgwksu-auth-token',
        JSON.stringify({
          access_token: authToken,
          token_type: 'bearer',
        })
      )
    }, token)

    // Navigate to ensure localStorage is set
    const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000'
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
