/**
 * Global Teardown for Playwright E2E Tests
 *
 * Cleanup after all tests complete.
 */

import { type FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'

async function globalTeardown(config: FullConfig) {
  console.log('[Global Teardown] Starting cleanup...')

  // Optional: Clean up auth files
  const authDir = path.join(__dirname, '.auth')
  if (fs.existsSync(authDir)) {
    console.log('[Global Teardown] Auth directory preserved for debugging')
    // Uncomment to remove auth files:
    // fs.rmSync(authDir, { recursive: true, force: true })
  }

  console.log('[Global Teardown] Complete')
}

export default globalTeardown
