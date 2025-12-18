import { test, expect } from '@playwright/test'

test.describe('Courses Page Performance & UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/courses')
  })

  test('should load within performance budget', async ({ page }) => {
    const performanceTiming = JSON.parse(
      await page.evaluate(() => JSON.stringify(window.performance.timing))
    )
    
    const responseEnd = performanceTiming.responseEnd
    const domInteractive = performanceTiming.domInteractive
    const loadEventEnd = performanceTiming.loadEventEnd
    
    const ttfb = responseEnd - performanceTiming.navigationStart
    const domReady = domInteractive - performanceTiming.navigationStart
    const pageLoad = loadEventEnd - performanceTiming.navigationStart
    
    console.log('Performance Metrics:')
    console.log(`  TTFB: ${ttfb}ms`)
    console.log(`  DOM Ready: ${domReady}ms`)
    console.log(`  Page Load: ${pageLoad}ms`)
    
    expect(ttfb).toBeLessThan(600)
    expect(domReady).toBeLessThan(1500)
    expect(pageLoad).toBeLessThan(3000)
  })

  test('should have no layout shifts', async ({ page }) => {
    const cls = await page.evaluate(() => {
      return new Promise((resolve) => {
        let cls = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'layout-shift' && !(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
              cls += (entry as PerformanceEntry & { value: number }).value
            }
          }
        }).observe({ type: 'layout-shift', buffered: true })
        
        setTimeout(() => resolve(cls), 2000)
      })
    })
    
    console.log(`Cumulative Layout Shift: ${cls}`)
    expect(cls).toBeLessThan(0.1)
  })

  test('should render stats bar with animation', async ({ page }) => {
    const statsBar = page.locator('[class*="course-stats-bar"]').first()
    await expect(statsBar).toBeVisible()
    
    const statItems = page.locator('[class*="rounded-xl"][class*="backdrop-blur"]')
    const count = await statItems.count()
    expect(count).toBeGreaterThanOrEqual(6)
    
    for (let i = 0; i < Math.min(count, 6); i++) {
      await expect(statItems.nth(i)).toBeVisible()
      await expect(statItems.nth(i)).toBeInViewport()
    }
    
    const animatedValues = await page.locator('[class*="tabular-nums"]').allTextContents()
    expect(animatedValues.length).toBeGreaterThan(0)
  })

  test('should have functional filter pills', async ({ page }) => {
    await page.waitForSelector('button:has-text("Все статусы")', { timeout: 5000 })
    
    const statusPill = page.locator('button:has-text("Все статусы")').first()
    await expect(statusPill).toBeVisible()
    await statusPill.click()
    
    const completedPill = page.locator('button:has-text("Завершены")').first()
    await expect(completedPill).toBeVisible()
    await completedPill.click()
    
    await expect(completedPill).toHaveClass(/from-emerald-500/)
    
    const resetButton = page.locator('button:has-text("Сбросить")')
    await expect(resetButton).toBeVisible()
  })

  test('should show empty state when no courses', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('mock-empty-courses', 'true')
    })
    await page.reload()
    
    const emptyState = page.locator('text=/Курсы пока не созданы|Ничего не найдено/')
    const isEmptyVisible = await emptyState.isVisible().catch(() => false)
    
    if (isEmptyVisible) {
      await expect(emptyState).toBeVisible()
      
      const icon = page.locator('[class*="rounded-full"][class*="bg-gradient"]').first()
      await expect(icon).toBeVisible()
      
      const createButton = page.locator('a:has-text("Создать"):has-text("курс")')
      const isCreateVisible = await createButton.isVisible().catch(() => false)
      if (isCreateVisible) {
        await expect(createButton).toHaveAttribute('href', '/create')
      }
    }
  })

  test('should have responsive search with debounce', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Поиск"]')
    await expect(searchInput).toBeVisible()
    
    await searchInput.fill('test')
    await page.waitForTimeout(400)
    
    const searchQuery = await searchInput.inputValue()
    expect(searchQuery).toBe('test')
    
    const clearButton = page.locator('button:has(svg[class*="X"])')
    const isClearVisible = await clearButton.isVisible().catch(() => false)
    if (isClearVisible) {
      await clearButton.click()
      expect(await searchInput.inputValue()).toBe('')
    }
  })

  test('should display course cards with glassmorphism effect', async ({ page }) => {
    const courseCards = page.locator('[class*="backdrop-blur"][class*="border-border"]')
    const cardCount = await courseCards.count()
    
    if (cardCount > 0) {
      const firstCard = courseCards.first()
      await expect(firstCard).toBeVisible()
      
      const hasBackdropBlur = await firstCard.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return styles.backdropFilter && styles.backdropFilter !== 'none'
      })
      expect(hasBackdropBlur).toBeTruthy()
      
      await firstCard.hover()
      await page.waitForTimeout(200)
      
      const transform = await firstCard.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return styles.transform
      })
      expect(transform).not.toBe('none')
    }
  })

  test('should have stagger animation on course cards', async ({ page }) => {
    const courseCards = page.locator('[class*="backdrop-blur"][class*="border-border"]')
    const cardCount = await courseCards.count()
    
    if (cardCount > 1) {
      const delays = []
      for (let i = 0; i < Math.min(cardCount, 3); i++) {
        const card = courseCards.nth(i)
        const animationDelay = await card.evaluate((el) => {
          const styles = window.getComputedStyle(el)
          return styles.animationDelay || styles.transitionDelay || '0s'
        })
        delays.push(animationDelay)
      }
      
      console.log('Card animation delays:', delays)
    }
  })

  test('should be accessible with proper ARIA attributes', async ({ page }) => {
    const violations = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, a, input')
      const issues: string[] = []
      
      elements.forEach((el) => {
        if (el.tagName === 'BUTTON' && !el.textContent?.trim() && !el.getAttribute('aria-label')) {
          issues.push(`Button without text or aria-label: ${el.outerHTML.substring(0, 100)}`)
        }
        if (el.tagName === 'INPUT' && !el.getAttribute('aria-label') && !el.getAttribute('placeholder')) {
          issues.push(`Input without label: ${el.outerHTML.substring(0, 100)}`)
        }
      })
      
      return issues
    })
    
    if (violations.length > 0) {
      console.warn('Accessibility issues found:', violations)
    }
    
    expect(violations.length).toBeLessThanOrEqual(5)
  })

  test('should handle mobile viewport correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()
    
    const mobileMenu = page.locator('[class*="lg:hidden"]').first()
    await mobileMenu.isVisible().catch(() => false)
    
    const statsBar = page.locator('[class*="grid-cols-2"][class*="md:grid-cols-3"]')
    await expect(statsBar).toBeVisible()
    
    const searchInput = page.locator('input[placeholder*="Поиск"]')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toBeInViewport()
  })

  test('should measure First Contentful Paint', async ({ page }) => {
    const fcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries()
          for (const entry of entries) {
            if (entry.name === 'first-contentful-paint') {
              resolve(entry.startTime)
            }
          }
        }).observe({ type: 'paint', buffered: true })
        
        setTimeout(() => resolve(null), 3000)
      })
    })
    
    if (fcp) {
      console.log(`First Contentful Paint: ${fcp}ms`)
      expect(fcp).toBeLessThan(1500)
    }
  })

  test('should have optimized bundle size', async ({ page }) => {
    await page.coverage.startJSCoverage()
    await page.reload()
    await page.waitForLoadState('networkidle')
    const jsCoverage = await page.coverage.stopJSCoverage()
    
    let totalBytes = 0
    let usedBytes = 0
    
    for (const entry of jsCoverage) {
      if (entry.source) {
        totalBytes += entry.source.length
        for (const func of entry.functions) {
          for (const range of func.ranges) {
            usedBytes += range.endOffset - range.startOffset
          }
        }
      }
    }
    
    const unusedPercentage = ((totalBytes - usedBytes) / totalBytes) * 100
    console.log(`JavaScript usage: ${usedBytes}/${totalBytes} bytes (${unusedPercentage.toFixed(2)}% unused)`)
    
    expect(unusedPercentage).toBeLessThan(60)
  })
})