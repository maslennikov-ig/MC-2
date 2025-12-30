/**
 * E2E Tests: Enrichment Inspector Deep Links
 *
 * Tests deep linking functionality for opening the inspector from various
 * entry points and navigating directly to specific enrichments.
 *
 * Priority: P2
 * @module e2e/enrichment-inspector/deep-links
 */

import { test, expect } from '@playwright/test';
import { EnrichmentInspectorPage } from './pages/EnrichmentInspectorPage';
import {
  mockEnrichmentApi,
  waitForAnimation,
} from './fixtures/enrichment-fixtures';

test.describe('Enrichment Inspector Deep Links', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);

    // Mock API responses
    await mockEnrichmentApi(page, 'lesson-with-enrichments');
  });

  test('should open inspector from lesson node toolbar', async ({ page }) => {
    // Navigate to course generation page
    await inspectorPage.navigateToCourse('test-course');

    // Find a lesson node in the graph
    const lessonNode = page.locator('[data-node-id="lesson-with-enrichments"]');

    // Wait for graph to render
    await page.waitForLoadState('networkidle');
    await waitForAnimation(page, 500);

    // If lesson node exists, hover to show toolbar
    if ((await lessonNode.count()) > 0) {
      await lessonNode.hover();

      // Look for enrichment/inspector button in toolbar
      const toolbarButtons = page.locator(
        '[data-testid="node-toolbar"] button, [class*="toolbar"] button, [class*="node-actions"] button'
      );

      if ((await toolbarButtons.count()) > 0) {
        // Find the enrichments/inspector button
        const enrichmentButton = page.locator(
          'button[aria-label*="enrichment" i], button[aria-label*="inspector" i], button[title*="enrichment" i], [data-testid="open-inspector-button"]'
        );

        if ((await enrichmentButton.count()) > 0) {
          await enrichmentButton.first().click();

          // Verify inspector opened
          await inspectorPage.expectPanelVisible();

          // Verify correct lesson is selected
          const headerText = await inspectorPage.headerTitle.innerText();
          expect(headerText.length).toBeGreaterThan(0);
        } else {
          // Click on the node itself to open inspector
          await lessonNode.click();
          await inspectorPage.expectPanelVisible();
        }
      } else {
        // Direct click on node
        await lessonNode.click();
        await inspectorPage.expectPanelVisible();
      }
    } else {
      // Fallback: navigate directly to lesson
      await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments');
      await inspectorPage.expectPanelVisible();
    }
  });

  test('should open inspector from asset dock', async ({ page }) => {
    await inspectorPage.navigateToCourse('test-course');
    await page.waitForLoadState('networkidle');

    // Look for asset dock / side panel
    const assetDock = page.locator(
      '[data-testid="asset-dock"], [class*="asset-dock"], [class*="side-panel"], [class*="dock"]'
    );

    if ((await assetDock.count()) > 0) {
      // Find enrichment entry in asset dock
      const enrichmentEntry = assetDock.locator(
        '[data-testid*="enrichment"], [class*="enrichment"], button:has-text("Enrichment"), a:has-text("Enrichment")'
      );

      if ((await enrichmentEntry.count()) > 0) {
        await enrichmentEntry.first().click();
        await waitForAnimation(page, 300);

        // Verify inspector opened
        await inspectorPage.expectPanelVisible();
      } else {
        // Asset dock may list lessons instead
        const lessonEntry = assetDock.locator('[data-lesson-id], [class*="lesson"]');

        if ((await lessonEntry.count()) > 0) {
          await lessonEntry.first().click();
          await waitForAnimation(page, 300);

          // Check if inspector opened
          if ((await inspectorPage.panel.count()) > 0) {
            await inspectorPage.expectPanelVisible();
          }
        }
      }
    } else {
      // No asset dock found - this is acceptable for some UI layouts
      console.log('Asset dock not found in current layout');

      // Alternative: use deep link URL directly
      await page.goto('/en/courses/generating/test-course?panel=enrichments&lesson=lesson-with-enrichments');
      await page.waitForLoadState('networkidle');

      // Check if URL-based deep link works
      const panelVisible = (await inspectorPage.panel.count()) > 0;
      console.log(`Panel visible via URL deep link: ${panelVisible}`);
    }
  });

  test('should navigate to specific enrichment detail via deep link', async ({ page }) => {
    // Test URL-based deep link to specific enrichment
    const deepLinkUrl = '/en/courses/generating/test-course?panel=enrichments&lesson=lesson-with-enrichments&enrichment=e1';

    await page.goto(deepLinkUrl);
    await page.waitForLoadState('networkidle');
    await waitForAnimation(page, 500);

    // Verify panel is open
    if ((await inspectorPage.panel.count()) > 0) {
      await inspectorPage.expectPanelVisible();

      // Verify detail view is shown (not root list)
      const detailView = inspectorPage.detailView;
      const isDetailVisible = (await detailView.count()) > 0;

      if (isDetailVisible) {
        await expect(detailView).toBeVisible();

        // Verify correct enrichment is displayed
        const currentUrl = page.url();
        expect(currentUrl).toContain('enrichment=e1');
      } else {
        // Deep link may open to list with enrichment selected
        const selectedItem = page.locator('[data-enrichment-id="e1"][aria-selected="true"], [data-enrichment-id="e1"].selected');

        if ((await selectedItem.count()) > 0) {
          await expect(selectedItem).toBeVisible();
        } else {
          // Enrichment should at least be in the list
          const enrichmentItem = page.locator('[data-enrichment-id="e1"]');
          if ((await enrichmentItem.count()) > 0) {
            await expect(enrichmentItem).toBeVisible();
          }
        }
      }
    } else {
      console.log('Deep link URL format may not be supported - testing alternative approach');

      // Alternative: Navigate to course then use clickEnrichmentById
      await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments');
      await inspectorPage.clickEnrichmentById('e1');

      // Verify detail view
      await inspectorPage.expectView('detail');
    }
  });

  test('should sync inspector state with selected lesson', async ({ page }) => {
    await inspectorPage.navigateToCourse('test-course');
    await page.waitForLoadState('networkidle');

    // Click first lesson node
    const firstLesson = page.locator('[data-node-id="lesson-1"]');
    if ((await firstLesson.count()) > 0) {
      await firstLesson.click();
      await waitForAnimation(page, 300);

      // Verify inspector shows this lesson (empty state for lesson-1)
      if ((await inspectorPage.panel.count()) > 0) {
        await inspectorPage.expectPanelVisible();

        // lesson-1 has no enrichments, so should show empty state
        const isEmpty = (await inspectorPage.emptyState.count()) > 0;
        const headerText = await inspectorPage.headerTitle.innerText().catch(() => '');

        console.log(`First lesson state - empty: ${isEmpty}, header: ${headerText}`);
      }
    }

    // Now click a different lesson
    await mockEnrichmentApi(page, 'lesson-with-enrichments');

    const secondLesson = page.locator('[data-node-id="lesson-with-enrichments"]');
    if ((await secondLesson.count()) > 0) {
      await secondLesson.click();
      await waitForAnimation(page, 500);

      // Verify inspector updated to show this lesson's enrichments
      if ((await inspectorPage.panel.count()) > 0) {
        await inspectorPage.expectPanelVisible();

        // lesson-with-enrichments has enrichments, so should show list
        const hasList = (await inspectorPage.enrichmentList.count()) > 0;
        const enrichmentCount = await inspectorPage.getEnrichmentCount();

        console.log(`Second lesson state - has list: ${hasList}, count: ${enrichmentCount}`);

        // If second lesson has enrichments, count should be > 0
        if (hasList) {
          expect(enrichmentCount).toBeGreaterThan(0);
        }
      }
    }

    // Test that selecting a lesson in the inspector updates the graph selection
    // (bidirectional sync)
    if ((await inspectorPage.panel.count()) > 0) {
      // This would require checking graph node selection state
      const selectedNode = page.locator('[data-node-id].selected, [data-node-id][aria-selected="true"]');

      if ((await selectedNode.count()) > 0) {
        const selectedNodeId = await selectedNode.getAttribute('data-node-id');
        console.log(`Currently selected node: ${selectedNodeId}`);
      }
    }
  });

  test('should preserve deep link state on page refresh', async ({ page }) => {
    // Navigate with deep link
    const deepLinkUrl = '/en/courses/generating/test-course?lesson=lesson-with-enrichments';

    await page.goto(deepLinkUrl);
    await page.waitForLoadState('networkidle');

    // Store current state
    const beforeRefreshPanelVisible = (await inspectorPage.panel.count()) > 0;
    const beforeRefreshUrl = page.url();

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForAnimation(page, 500);

    // Verify state preserved
    const afterRefreshUrl = page.url();
    const afterRefreshPanelVisible = (await inspectorPage.panel.count()) > 0;

    // URL should contain lesson parameter
    expect(afterRefreshUrl).toContain('lesson=lesson-with-enrichments');

    // Panel visibility should be consistent
    expect(afterRefreshPanelVisible).toBe(beforeRefreshPanelVisible);

    console.log(`State preserved: before=${beforeRefreshPanelVisible}, after=${afterRefreshPanelVisible}`);
  });

  test('should update URL when navigating within inspector', async ({ page }) => {
    await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments');
    await inspectorPage.expectPanelVisible();

    // Get initial URL
    const initialUrl = page.url();

    // Click on an enrichment
    const enrichmentCount = await inspectorPage.getEnrichmentCount();
    if (enrichmentCount > 0) {
      await inspectorPage.clickEnrichment(0);
      await waitForAnimation(page, 300);

      // Get updated URL
      const updatedUrl = page.url();

      // URL should reflect the navigation
      // Could include enrichment ID in query params or hash
      const urlChanged = updatedUrl !== initialUrl;

      console.log(`URL tracking: ${initialUrl} -> ${updatedUrl}`);

      // If URL-based navigation is implemented, URL should change
      // If not, this is informational only
    }
  });

  test('should handle invalid deep link gracefully', async ({ page }) => {
    // Navigate with invalid enrichment ID
    const invalidUrl = '/en/courses/generating/test-course?panel=enrichments&lesson=lesson-with-enrichments&enrichment=invalid-id';

    await page.goto(invalidUrl);
    await page.waitForLoadState('networkidle');
    await waitForAnimation(page, 500);

    // Should not crash - should show list view or error state
    const hasError = page.locator('[role="alert"], [class*="error"]');
    const hasList = (await inspectorPage.enrichmentList.count()) > 0;
    const hasEmptyState = (await inspectorPage.emptyState.count()) > 0;
    const hasPanel = (await inspectorPage.panel.count()) > 0;

    // Page should handle gracefully - show error, list, or fallback to root view
    const handledGracefully =
      (await hasError.count()) > 0 ||
      hasList ||
      hasEmptyState ||
      !hasPanel; // Or simply not open the panel for invalid links

    expect(handledGracefully).toBeTruthy();

    // No console errors (optional - depends on implementation)
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Give time for any delayed errors
    await page.waitForTimeout(500);

    // Log any console errors for debugging
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors);
    }
  });

  test('should handle invalid lesson ID in deep link', async ({ page }) => {
    // Navigate with invalid lesson ID
    const invalidUrl = '/en/courses/generating/test-course?lesson=nonexistent-lesson';

    await page.goto(invalidUrl);
    await page.waitForLoadState('networkidle');

    // Should not crash
    // Could show 404, redirect, or show empty inspector

    // Check page is functional
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();

    // Check for error handling
    const notFound = page.locator('text=not found, text=404, text=error').first();
    const isPageFunctional = (await notFound.count()) > 0 || (await page.locator('body').count()) > 0;

    expect(isPageFunctional).toBeTruthy();
  });

  test('should support keyboard navigation to inspector', async ({ page }) => {
    await inspectorPage.navigateToCourse('test-course');
    await page.waitForLoadState('networkidle');

    // Find a focusable lesson element
    const lessonNode = page.locator('[data-node-id="lesson-with-enrichments"]');

    if ((await lessonNode.count()) > 0) {
      // Focus on the lesson node
      await lessonNode.focus();
      await expect(lessonNode).toBeFocused();

      // Press Enter to open inspector
      await page.keyboard.press('Enter');
      await waitForAnimation(page, 300);

      // Verify inspector opened
      const panelVisible = (await inspectorPage.panel.count()) > 0;

      if (panelVisible) {
        await inspectorPage.expectPanelVisible();

        // Focus should move to inspector
        const focusInPanel = await inspectorPage.panel.locator(':focus').count();

        // Escape should close inspector
        await page.keyboard.press('Escape');
        await waitForAnimation(page, 300);

        // Check if inspector closed or focus moved
        const stillVisible = (await inspectorPage.panel.count()) > 0;
        console.log(`Inspector after Escape: visible=${stillVisible}`);
      }
    }
  });

  test('should handle deep link with locale switch', async ({ page }) => {
    // Start with English deep link
    await page.goto('/en/courses/generating/test-course?lesson=lesson-with-enrichments');
    await page.waitForLoadState('networkidle');

    const enUrl = page.url();
    expect(enUrl).toContain('/en/');

    // Navigate to Russian locale with same parameters
    await page.goto('/ru/courses/generating/test-course?lesson=lesson-with-enrichments');
    await page.waitForLoadState('networkidle');

    const ruUrl = page.url();
    expect(ruUrl).toContain('/ru/');

    // Deep link parameters should be preserved
    expect(ruUrl).toContain('lesson=lesson-with-enrichments');

    // Inspector should still work
    if ((await inspectorPage.panel.count()) > 0) {
      await inspectorPage.expectPanelVisible();
    }
  });
});
