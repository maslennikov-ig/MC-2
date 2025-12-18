import { test, expect } from '@playwright/test';

test.describe('Visual Assessment - Courses Page', () => {
  test('capture courses page screenshots', async ({ page }) => {
    // Set viewport for desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Navigate to courses page
    await page.goto('http://localhost:3001/courses');
    
    // Wait for content to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for animations
    
    // Take full page screenshot
    await page.screenshot({ 
      path: 'screenshots/courses-desktop-full.png',
      fullPage: true 
    });
    
    // Take viewport screenshot
    await page.screenshot({ 
      path: 'screenshots/courses-desktop-viewport.png',
      fullPage: false 
    });
    
    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    await page.screenshot({ 
      path: 'screenshots/courses-tablet.png',
      fullPage: false 
    });
    
    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await page.screenshot({ 
      path: 'screenshots/courses-mobile.png',
      fullPage: false 
    });
    
    // Test filter interactions
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Type in search
    const searchInput = page.locator('input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('React');
      await page.waitForTimeout(500);
      await page.screenshot({ 
        path: 'screenshots/courses-search-active.png',
        fullPage: false 
      });
    }
    
    // Hover on a card
    const firstCard = page.locator('[data-testid="course-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.hover();
      await page.waitForTimeout(300);
      await page.screenshot({ 
        path: 'screenshots/courses-card-hover.png',
        fullPage: false 
      });
    }
    
    console.log('Screenshots captured successfully!');
  });
  
  test('check performance metrics', async ({ page }) => {
    // Navigate to courses page
    await page.goto('http://localhost:3001/courses');
    
    // Get performance metrics
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
      };
    });
    
    console.log('Performance Metrics:', metrics);
    
    // Check Core Web Vitals
    expect(metrics.firstContentfulPaint).toBeLessThan(2000); // FCP < 2s
  });
});