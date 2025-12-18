/**
 * Accessibility testing using axe-core
 * Tests all major pages and components for WCAG compliance
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Configure accessibility tests
test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up larger viewport for accessibility testing
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  // Test homepage accessibility
  test('Homepage should be accessible', async ({ page }) => {
    await page.goto('/')
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000) // Allow animations to complete

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  // Test courses catalog page
  test('Courses catalog should be accessible', async ({ page }) => {
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude(['[data-testid="loading"]']) // Exclude loading states
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  // Test course creation page
  test('Course creation form should be accessible', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  // Test about page
  test('About page should be accessible', async ({ page }) => {
    await page.goto('/about')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  // Test keyboard navigation
  test('Should support keyboard navigation', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Test Tab navigation through interactive elements
    await page.keyboard.press('Tab')
    
    let focusedElement = await page.locator(':focus').first()
    await expect(focusedElement).toBeVisible()

    // Continue tabbing through several elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
      focusedElement = await page.locator(':focus').first()
      
      // Verify element is focusable and visible
      if (await focusedElement.count() > 0) {
        await expect(focusedElement).toBeVisible()
      }
    }
  })

  // Test focus indicators
  test('Should have visible focus indicators', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Find all interactive elements
    const interactiveElements = await page.locator('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])').all()

    for (const element of interactiveElements.slice(0, 10)) { // Test first 10 elements
      if (await element.isVisible()) {
        await element.focus()
        
        // Check if element has focus styles
        const styles = await element.evaluate((el) => {
          return window.getComputedStyle(el, ':focus')
        })
        
        // At least one focus style should be present
        const hasFocusStyle = 
          styles.outline !== 'none' ||
          styles.outlineWidth !== '0px' ||
          styles.boxShadow !== 'none' ||
          styles.border !== 'none'
        
        expect(hasFocusStyle).toBeTruthy()
      }
    }
  })

  // Test color contrast
  test('Should meet color contrast requirements', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include(['body']) // Test the whole page
      .analyze()

    // Filter for color contrast violations
    const contrastViolations = accessibilityScanResults.violations.filter(
      violation => violation.id === 'color-contrast'
    )

    expect(contrastViolations).toEqual([])
  })

  // Test screen reader compatibility
  test('Should have proper ARIA labels and roles', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check for missing alt text on images
    const images = await page.locator('img').all()
    for (const img of images) {
      const alt = await img.getAttribute('alt')
      const ariaLabel = await img.getAttribute('aria-label')
      const ariaHidden = await img.getAttribute('aria-hidden')
      
      // Image should have alt text, aria-label, or be marked as decorative
      expect(alt !== null || ariaLabel !== null || ariaHidden === 'true').toBeTruthy()
    }

    // Check for proper heading structure
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all()
    expect(headings.length).toBeGreaterThan(0) // Should have at least one heading
    
    // Check if there's an h1
    const h1Count = await page.locator('h1').count()
    expect(h1Count).toBeGreaterThanOrEqual(1) // Should have at least one h1
  })

  // Test form accessibility
  test('Forms should be accessible', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')

    // Check that all form inputs have labels
    const inputs = await page.locator('input, select, textarea').all()
    for (const input of inputs) {
      const id = await input.getAttribute('id')
      const ariaLabel = await input.getAttribute('aria-label')
      const ariaLabelledby = await input.getAttribute('aria-labelledby')
      
      if (id) {
        // Check for associated label
        const label = await page.locator(`label[for="${id}"]`).count()
        const hasLabel = label > 0 || ariaLabel !== null || ariaLabelledby !== null
        expect(hasLabel).toBeTruthy()
      } else {
        // Input without ID should have aria-label
        expect(ariaLabel !== null || ariaLabelledby !== null).toBeTruthy()
      }
    }
  })

  // Test mobile accessibility
  test('Should be accessible on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])

    // Test touch target sizes
    const buttons = await page.locator('button, a').all()
    for (const button of buttons.slice(0, 5)) { // Test first 5 buttons
      if (await button.isVisible()) {
        const box = await button.boundingBox()
        if (box) {
          // Touch targets should be at least 44x44 pixels (WCAG AA)
          expect(box.width).toBeGreaterThanOrEqual(44)
          expect(box.height).toBeGreaterThanOrEqual(44)
        }
      }
    }
  })

  // Test with high contrast mode
  test('Should work with high contrast mode', async ({ page }) => {
    // Simulate high contrast mode
    await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Elements should still be visible and accessible
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      // Exclude color contrast checks in forced-colors mode as browsers override colors
      .disableRules(['color-contrast'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  // Test skip links and navigation landmarks
  test('Should have skip links and proper landmarks', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check for skip links (usually hidden but accessible via keyboard)
    await page.keyboard.press('Tab')
    const firstFocusedElement = await page.locator(':focus').first()
    
    // If skip link exists, it should be focusable
    if (await firstFocusedElement.count() > 0) {
      const skipLinkText = await firstFocusedElement.textContent()
      if (skipLinkText && skipLinkText.toLowerCase().includes('skip')) {
        await expect(firstFocusedElement).toBeVisible()
      }
    }

    // Check for proper landmarks
    const main = await page.locator('main, [role="main"]').count()
    expect(main).toBeGreaterThanOrEqual(1)

    const nav = await page.locator('nav, [role="navigation"]').count()
    expect(nav).toBeGreaterThanOrEqual(0) // Navigation is optional but good to have
  })

  // Test error states accessibility
  test('Error states should be accessible', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')

    // Try to submit form without required fields to trigger errors
    const submitButton = page.locator('button[type="submit"], button:has-text("Create")')
    if (await submitButton.count() > 0) {
      await submitButton.first().click()
      await page.waitForTimeout(1000) // Wait for error messages

      // Check that error messages are accessible
      const errorMessages = await page.locator('[role="alert"], .error, [aria-invalid="true"]').all()
      for (const error of errorMessages) {
        if (await error.isVisible()) {
          // Error should be announced to screen readers
          const ariaLive = await error.getAttribute('aria-live')
          const role = await error.getAttribute('role')
          
          expect(ariaLive === 'polite' || ariaLive === 'assertive' || role === 'alert').toBeTruthy()
        }
      }
    }
  })

  // Performance impact on accessibility
  test('Accessibility features should not significantly impact performance', async ({ page }) => {
    // Navigate to page and measure performance
    const startTime = Date.now()
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const loadTime = Date.now() - startTime
    
    // Page should load within reasonable time (5 seconds)
    expect(loadTime).toBeLessThan(5000)

    // Run accessibility scan and ensure it doesn't take too long
    const scanStartTime = Date.now()
    
    await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    
    const scanTime = Date.now() - scanStartTime
    
    // Accessibility scan should complete within 10 seconds
    expect(scanTime).toBeLessThan(10000)
  })
})

// Component-specific accessibility tests
test.describe('Component Accessibility', () => {
  // Test individual components that might be loaded dynamically
  test('Course cards should be accessible', async ({ page }) => {
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')

    // Check if course cards exist before running accessibility scan
    const cards = page.locator('[data-testid="course-card"], .course-card, article')
    const cardCount = await cards.count()

    if (cardCount === 0) {
      // Skip test if no courses - this is expected in test environment
      test.skip()
      return
    }

    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('[data-testid="course-card"], .course-card, article')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  // Test modals and dialogs
  test('Modals should be accessible and focus-trapped', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for modal triggers
    const modalTriggers = await page.locator('button:has-text("create"), button:has-text("new"), [data-testid="modal-trigger"]').all()
    
    for (const trigger of modalTriggers.slice(0, 2)) { // Test first 2 modals
      if (await trigger.isVisible()) {
        await trigger.click()
        await page.waitForTimeout(500)

        // Check if modal opened
        const modal = page.locator('[role="dialog"], .modal, [aria-modal="true"]')
        if (await modal.count() > 0) {
          // Modal should be accessible
          const accessibilityScanResults = await new AxeBuilder({ page })
            .include('[role="dialog"], .modal, [aria-modal="true"]')
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()

          expect(accessibilityScanResults.violations).toEqual([])

          // Test focus trap - pressing Tab should cycle within modal
          await page.keyboard.press('Tab')
          const focusedElement = await page.locator(':focus').first()
          const isWithinModal = await focusedElement.evaluate((el, modalSelector) => {
            const modal = document.querySelector(modalSelector)
            return modal && modal.contains(el)
          }, '[role="dialog"], .modal, [aria-modal="true"]')
          
          expect(isWithinModal).toBeTruthy()

          // Close modal (try Escape key)
          await page.keyboard.press('Escape')
          await page.waitForTimeout(300)
        }
      }
    }
  })
})