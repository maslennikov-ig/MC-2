import { test, expect } from '@playwright/test';

test('take courses page screenshot', async ({ page }) => {
  // Navigate to courses page
  await page.goto('/courses');
  
  // Wait for the page to be fully loaded
  await page.waitForLoadState('networkidle');
  
  // Wait for main content to be visible
  await expect(page.locator('main')).toBeVisible();
  
  // Wait for any animations to complete
  await page.waitForTimeout(2000);
  
  // Take full page screenshot
  await page.screenshot({ 
    path: 'courses-page-full.png', 
    fullPage: true 
  });
  
  // Take viewport screenshot
  await page.screenshot({ 
    path: 'courses-page-viewport.png', 
    fullPage: false 
  });
});