import { test, expect } from '@playwright/test'

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for any animations or dynamic content to settle
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('Homepage visual snapshot', async ({ page }) => {
    // Wait for any animations to complete
    await page.waitForTimeout(2000)
    
    // Take screenshot of the full page
    await expect(page).toHaveScreenshot('homepage-full.png', {
      fullPage: true,
      animations: 'disabled',
      clip: { x: 0, y: 0, width: 1280, height: 800 }
    })
  })

  test('Homepage hero section', async ({ page }) => {
    const heroSection = page.locator('main').first()
    await expect(heroSection).toBeVisible()
    
    await expect(heroSection).toHaveScreenshot('homepage-hero.png', {
      animations: 'disabled'
    })
  })

  test('Header component', async ({ page }) => {
    const header = page.locator('header').first()
    await expect(header).toBeVisible()
    
    await expect(header).toHaveScreenshot('header-component.png', {
      animations: 'disabled'
    })
  })

  test('Courses page visual snapshot', async ({ page }) => {
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000) // Wait for animations
    
    await expect(page).toHaveScreenshot('courses-page.png', {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('Course creation page visual snapshot', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // Wait for shader animations to settle
    
    await expect(page).toHaveScreenshot('create-course-page.png', {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('Course creation form', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')
    
    const form = page.locator('form').first()
    if (await form.isVisible()) {
      await expect(form).toHaveScreenshot('course-creation-form.png', {
        animations: 'disabled'
      })
    }
  })

  test('Dark mode visual comparison', async ({ page }) => {
    // Test light mode
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    await expect(page).toHaveScreenshot('homepage-light-mode.png', {
      fullPage: true,
      animations: 'disabled'
    })
    
    // Switch to dark mode if toggle is available
    const darkModeToggle = page.locator('[data-testid="theme-toggle"]').or(
      page.locator('button:has-text("Dark")').or(
        page.locator('[aria-label*="dark"]').or(
          page.locator('[class*="theme"]')
        )
      )
    )
    
    if (await darkModeToggle.isVisible()) {
      await darkModeToggle.click()
      await page.waitForTimeout(500)
      
      await expect(page).toHaveScreenshot('homepage-dark-mode.png', {
        fullPage: true,
        animations: 'disabled'
      })
    }
  })

  test('Mobile responsive design', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    await expect(page).toHaveScreenshot('homepage-mobile.png', {
      fullPage: true,
      animations: 'disabled'
    })
    
    // Test courses page mobile
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    await expect(page).toHaveScreenshot('courses-page-mobile.png', {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('Tablet responsive design', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    await expect(page).toHaveScreenshot('homepage-tablet.png', {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('Course cards visual consistency', async ({ page }) => {
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // Check if course cards are present
    const courseCards = page.locator('[data-testid="course-card"]').or(
      page.locator('.course-card').or(
        page.locator('[class*="course"]').first()
      )
    )
    
    if (await courseCards.count() > 0) {
      const firstCard = courseCards.first()
      await expect(firstCard).toHaveScreenshot('course-card.png', {
        animations: 'disabled'
      })
    }
  })

  test('Loading states visual snapshot', async ({ page }) => {
    // Intercept network requests to simulate loading
    await page.route('**/api/**', route => {
      // Delay the response by 2 seconds
      setTimeout(() => route.continue(), 2000)
    })
    
    await page.goto('/courses')
    
    // Capture loading state
    await expect(page).toHaveScreenshot('loading-state.png', {
      animations: 'disabled'
    })
  })

  test('Empty state visual snapshot', async ({ page }) => {
    // Mock empty response
    await page.route('**/api/courses**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ courses: [] })
      })
    })
    
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    await expect(page).toHaveScreenshot('empty-courses-state.png', {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('Error state visual snapshot', async ({ page }) => {
    // Mock error response
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      })
    })
    
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // Look for error states
    const errorElement = page.locator('[data-testid="error"]').or(
      page.locator('.error').or(
        page.locator(':has-text("error")').first()
      )
    )
    
    if (await errorElement.isVisible()) {
      await expect(page).toHaveScreenshot('error-state.png', {
        animations: 'disabled'
      })
    }
  })
})

test.describe('Component Visual Tests', () => {
  test('Logo component variations', async ({ page }) => {
    await page.goto('/')
    
    const logo = page.locator('img[alt*="MegaCampusAI"], img[alt*="logo"]').first()
    if (await logo.isVisible()) {
      await expect(logo).toHaveScreenshot('logo-component.png')
    }
  })

  test('Button states', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')
    
    // Find various button states
    const buttons = page.locator('button')
    const buttonCount = await buttons.count()
    
    if (buttonCount > 0) {
      const primaryButton = buttons.first()
      await expect(primaryButton).toHaveScreenshot('button-default.png')
      
      // Hover state
      await primaryButton.hover()
      await expect(primaryButton).toHaveScreenshot('button-hover.png')
      
      // Focus state
      await primaryButton.focus()
      await expect(primaryButton).toHaveScreenshot('button-focus.png')
    }
  })

  test('Form elements visual consistency', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')
    
    // Check input fields
    const inputs = page.locator('input[type="text"], input[type="email"], textarea')
    const inputCount = await inputs.count()
    
    if (inputCount > 0) {
      const firstInput = inputs.first()
      await expect(firstInput).toHaveScreenshot('input-field.png')
      
      // Focus state
      await firstInput.focus()
      await expect(firstInput).toHaveScreenshot('input-field-focus.png')
    }
  })
})

test.describe('Animation and Transition Tests', () => {
  test('Page transition smoothness', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Take initial screenshot
    await expect(page).toHaveScreenshot('page-transition-start.png', {
      animations: 'allow'
    })
    
    // Navigate to another page
    const coursesLink = page.locator('a[href="/courses"]').first()
    if (await coursesLink.isVisible()) {
      await coursesLink.click()
      
      // Wait a moment for transition
      await page.waitForTimeout(300)
      
      await expect(page).toHaveScreenshot('page-transition-mid.png', {
        animations: 'allow'
      })
      
      // Wait for completion
      await page.waitForLoadState('networkidle')
      
      await expect(page).toHaveScreenshot('page-transition-end.png', {
        animations: 'disabled'
      })
    }
  })
})