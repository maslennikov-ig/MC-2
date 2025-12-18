/* eslint-disable react-hooks/rules-of-hooks */
/**
 * Authentication fixtures for E2E tests
 *
 * Provides authenticated page fixtures for different user roles.
 */

import { test as base, type Page } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../.auth/user.json')

export type AuthFixtures = {
  authenticatedPage: Page
}

/**
 * Extended test with authenticated page fixture
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    // Check if auth file exists, if not, create it
    const context = await browser.newContext({
      storageState: authFile,
    })
    const page = await context.newPage()

    // Set auth cookies/tokens from .env.test if needed
    const token = process.env.TEST_AUTH_TOKEN
    if (token) {
      await page.addInitScript((token) => {
        localStorage.setItem('supabase.auth.token', token)
      }, token)
    }

    await use(page)
    await context.close()
  },
})

export { expect } from '@playwright/test'
