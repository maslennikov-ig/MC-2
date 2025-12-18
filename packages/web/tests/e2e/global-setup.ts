import { chromium, FullConfig } from '@playwright/test'

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use

  // Launch browser for global setup
  const browser = await chromium.launch()
  const page = await browser.newPage()

  try {
    console.log('🧪 Running global test setup...')
    
    // Wait for the server to be ready
    await page.goto(baseURL!)
    await page.waitForSelector('body')
    
    // Perform any global authentication or setup here
    // For example, if you need to create test data or authenticate
    
    console.log('✅ Global setup completed successfully')
  } catch (error) {
    console.error('❌ Global setup failed:', error)
    throw error
  } finally {
    await browser.close()
  }
}

export default globalSetup