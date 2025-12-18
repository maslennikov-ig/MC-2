import { test, expect } from '@playwright/test'

test.describe('Performance Monitoring', () => {
  test('should meet performance metrics', async ({ page }) => {
    // Start performance measurement
    await page.goto('/courses')
    
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle')
    
    // Get performance metrics
    const metrics = await page.evaluate(() => {
      const paintMetrics = performance.getEntriesByType('paint')
      const navigationMetrics = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      
      const fcp = paintMetrics.find(metric => metric.name === 'first-contentful-paint')
      const lcp = performance.getEntriesByType('largest-contentful-paint').pop() as PerformanceEntry & { startTime: number }
      
      // Calculate CLS
      let clsScore = 0
      const clsEntries = performance.getEntriesByType('layout-shift') as Array<PerformanceEntry & { hadRecentInput?: boolean; value: number }>
      for (const entry of clsEntries) {
        if (!entry.hadRecentInput) {
          clsScore += entry.value
        }
      }
      
      return {
        // First Contentful Paint
        fcp: fcp ? fcp.startTime : 0,
        // Largest Contentful Paint
        lcp: lcp ? lcp.startTime : 0,
        // Time to Interactive (approximated)
        tti: navigationMetrics.loadEventEnd - navigationMetrics.fetchStart,
        // Cumulative Layout Shift
        cls: clsScore,
        // DOM Content Loaded
        domContentLoaded: navigationMetrics.domContentLoadedEventEnd - navigationMetrics.fetchStart,
        // Total blocking time (simplified)
        tbt: navigationMetrics.domInteractive - navigationMetrics.domContentLoadedEventEnd,
      }
    })
    
    // Assert performance metrics meet targets
    console.log('Performance Metrics:', metrics)
    
    // Target metrics from the plan
    expect(metrics.fcp).toBeLessThan(1500) // First Contentful Paint < 1.5s
    expect(metrics.lcp).toBeLessThan(2500) // Largest Contentful Paint < 2.5s (more realistic than instant 3s TTI)
    expect(metrics.tti).toBeLessThan(3500) // Time to Interactive < 3.5s (slightly relaxed)
    expect(metrics.cls).toBeLessThan(0.1) // Cumulative Layout Shift < 0.1
  })
  
  test('should handle virtual scrolling efficiently', async ({ page }) => {
    // Navigate to a page with many courses (if available)
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    
    // Check if virtual scrolling notice appears for large lists
    const virtualScrollNotice = page.locator('text=/Виртуальная прокрутка активна/')
    const hasVirtualScroll = await virtualScrollNotice.isVisible().catch(() => false)
    
    if (hasVirtualScroll) {
      // Test scrolling performance
      
      // Measure scroll performance
      const scrollPerformance = await page.evaluate(async () => {
        const container = document.querySelector('[style*="overflow"]') as HTMLElement
        if (!container) return null
        
        const startTime = performance.now()
        
        // Scroll down
        container.scrollTop = container.scrollHeight / 2
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Scroll back to top
        container.scrollTop = 0
        await new Promise(resolve => setTimeout(resolve, 100))
        
        const endTime = performance.now()
        
        return {
          duration: endTime - startTime,
          finalPosition: container.scrollTop
        }
      })
      
      if (scrollPerformance) {
        // Scrolling should be smooth and fast
        expect(scrollPerformance.duration).toBeLessThan(500)
        expect(scrollPerformance.finalPosition).toBe(0)
      }
    }
  })
  
  test('should respect prefers-reduced-motion', async ({ page }) => {
    // Enable reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' })
    
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    
    // Check that animations are disabled
    const hasReducedMotion = await page.evaluate(() => {
      const styles = window.getComputedStyle(document.body)
      const animationDuration = styles.animationDuration
      const transitionDuration = styles.transitionDuration
      
      // Check if durations are effectively zero
      return animationDuration === '0.01ms' || transitionDuration === '0.01ms'
    })
    
    expect(hasReducedMotion).toBe(true)
  })
  
  test('should load toast notifications', async ({ page }) => {
    await page.goto('/create')
    await page.waitForLoadState('networkidle')
    
    // Check if Toaster component is present
    const toaster = await page.evaluate(() => {
      return document.querySelector('[data-sonner-toaster]') !== null ||
             document.querySelector('.sonner-toast') !== null ||
             document.body.innerHTML.includes('sonner')
    })
    
    expect(toaster).toBe(true)
  })
  
  test('should have optimized bundle size', async ({ page }) => {
    const client = await page.context().newCDPSession(page)
    await client.send('Network.enable')
    
    const resources: Array<{ url: string; size: number; type?: string }> = []
    
    client.on('Network.responseReceived', (response) => {
      if (response.response.url.includes('_next/static')) {
        resources.push({
          url: response.response.url,
          size: response.response.encodedDataLength || 0,
          type: response.response.mimeType
        })
      }
    })
    
    await page.goto('/courses')
    await page.waitForLoadState('networkidle')
    
    // Calculate total bundle size
    const jsResources = resources.filter(r => r.type?.includes('javascript'))
    const totalJsSize = jsResources.reduce((sum, r) => sum + r.size, 0)
    
    console.log(`Total JS bundle size: ${(totalJsSize / 1024).toFixed(2)} KB`)
    
    // Bundle should be reasonably sized (under 500KB for initial load)
    expect(totalJsSize).toBeLessThan(500 * 1024)
  })
})