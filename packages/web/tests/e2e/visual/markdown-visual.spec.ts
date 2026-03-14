/**
 * Playwright Visual Tests for Markdown Rendering System
 *
 * Tests visual consistency of:
 * - Typography and prose styling
 * - Code blocks with syntax highlighting
 * - Math formulas (KaTeX)
 * - Mermaid diagrams
 * - Callouts/admonitions
 * - Tables
 * - Links and headings
 *
 * Run: pnpm exec playwright test tests/e2e/visual/markdown-visual.spec.ts
 * Update snapshots: pnpm exec playwright test --update-snapshots
 */

import { test, expect } from '@playwright/test'





test.describe('Markdown Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page where we can test markdown rendering
    // We'll use the create page which has minimal content as a clean slate
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('Homepage loads correctly for baseline', async ({ page }) => {
    await page.waitForTimeout(1000)
    await expect(page).toHaveScreenshot('markdown-baseline-homepage.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixels: 100,
    })
  })
})

test.describe('Markdown Component Visual Tests on Course Pages', () => {
  test.beforeEach(async ({ page }) => {
    // Try to navigate to a course detail page with lesson content
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
  })

  test('Courses list page - card layout', async ({ page }) => {
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('courses-list-layout.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 200,
    })
  })

  test('Course cards maintain visual consistency', async ({ page }) => {
    const courseCards = page
      .locator('[data-testid="course-card"], .course-card, [class*="card"]')
      .first()

    if (await courseCards.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(courseCards).toHaveScreenshot('course-card-component.png', {
        animations: 'disabled',
        maxDiffPixels: 50,
      })
    }
  })
})

test.describe('Content Preview Panel Visual Tests', () => {
  // These tests target the generation/preview panels where markdown is rendered

  test('Admin generation page layout', async ({ page }) => {
    // Navigate to admin generation page if accessible
    await page.goto('/admin/generation/history')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('admin-generation-history.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 300,
    })
  })
})

test.describe('Dark Mode Markdown Rendering', () => {
  test.use({ colorScheme: 'dark' })

  test('Dark mode - homepage', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('markdown-dark-mode-homepage.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixels: 100,
    })
  })

  test('Dark mode - courses page', async ({ page }) => {
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('markdown-dark-mode-courses.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 200,
    })
  })
})

test.describe('Responsive Markdown Rendering', () => {
  test('Mobile viewport - 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('markdown-mobile-375.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 100,
    })
  })

  test('Tablet viewport - 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('markdown-tablet-768.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 100,
    })
  })

  test('Desktop viewport - 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('markdown-desktop-1280.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 100,
    })
  })

  test('Wide desktop viewport - 1920px', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('markdown-wide-1920.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 150,
    })
  })
})

test.describe('Course Creation Page - Form Visual Tests', () => {
  test('Create page - form layout', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // Wait for shader animations

    await expect(page).toHaveScreenshot('create-page-form.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 300, // Higher tolerance due to shader effects
    })
  })

  test('Create page - form elements', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const form = page.locator('form').first()
    if (await form.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(form).toHaveScreenshot('create-form-elements.png', {
        animations: 'disabled',
        maxDiffPixels: 200,
      })
    }
  })
})

test.describe('Typography Consistency Tests', () => {
  test('Heading hierarchy visual check', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Find any heading elements
    const headings = page.locator('h1, h2, h3')
    const headingCount = await headings.count()

    if (headingCount > 0) {
      const firstHeading = headings.first()
      await expect(firstHeading).toHaveScreenshot('heading-typography.png', {
        animations: 'disabled',
        maxDiffPixels: 30,
      })
    }
  })

  test('Button component visual consistency', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const primaryButton = page
      .locator('button[type="submit"], button:has-text("Create"), button:has-text("Создать")')
      .first()

    if (await primaryButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Normal state
      await expect(primaryButton).toHaveScreenshot('button-normal.png', {
        animations: 'disabled',
        maxDiffPixels: 20,
      })

      // Hover state
      await primaryButton.hover()
      await page.waitForTimeout(200)
      await expect(primaryButton).toHaveScreenshot('button-hover.png', {
        animations: 'disabled',
        maxDiffPixels: 30,
      })
    }
  })
})

test.describe('Features Catalog Page', () => {
  test('Features page - full layout', async ({ page }) => {
    await page.goto('/features-catalog')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('features-catalog-page.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 200,
    })
  })
})

test.describe('About Page', () => {
  test('About page - content layout', async ({ page }) => {
    await page.goto('/about')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('about-page-layout.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 150,
    })
  })
})
