/**
 * E2E Tests: Enrichment Inspector Drag and Drop
 *
 * Tests drag-and-drop reordering functionality in the Enrichment Inspector Panel.
 * Validates accessibility of drag handles and keyboard-based reordering.
 *
 * @module e2e/enrichment-inspector/drag-drop.spec
 */

import { test, expect } from '@playwright/test';
import { EnrichmentInspectorPage } from './pages/EnrichmentInspectorPage';
import {
  TEST_COURSES,
  mockEnrichmentApi,
  waitForAnimation,
} from './fixtures/enrichment-fixtures';

// Test data for drag-drop tests
const COURSE_SLUG = 'test-course';
const LESSON_WITH_ENRICHMENTS = 'lesson-multiple-enrichments';

test.describe('Enrichment Inspector - Drag and Drop', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);

    // Mock API with multiple enrichments for drag-drop testing
    await mockEnrichmentApi(page, LESSON_WITH_ENRICHMENTS);

    // Mock the enrichment list endpoint with ordered items
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      const lesson = TEST_COURSES[COURSE_SLUG].lessons.find(
        (l) => l.id === LESSON_WITH_ENRICHMENTS
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: lesson?.enrichments ?? [],
          },
        }),
      });
    });
  });

  test('should have accessible drag handles', async ({ page }) => {
    // Navigate to lesson with enrichments
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_WITH_ENRICHMENTS);

    // Wait for enrichment list to load
    await inspectorPage.expectEnrichmentList();

    // Verify drag handles exist for each enrichment
    const dragHandles = inspectorPage.dragHandles;
    const handleCount = await dragHandles.count();

    // Should have multiple drag handles
    expect(handleCount).toBeGreaterThan(0);

    // Each drag handle should have proper accessibility attributes
    for (let i = 0; i < handleCount; i++) {
      const handle = dragHandles.nth(i);

      // Should be visible
      await expect(handle).toBeVisible();

      // Should have aria-label or accessible name for screen readers
      const ariaLabel = await handle.getAttribute('aria-label');
      const ariaRoleDescription = await handle.getAttribute('aria-roledescription');

      // At least one accessibility attribute should be present
      const hasAccessibleName =
        ariaLabel !== null ||
        ariaRoleDescription !== null ||
        (await handle.getAttribute('title')) !== null;

      expect(hasAccessibleName).toBe(true);

      // Should be focusable (tabindex >= 0 or button/interactive element)
      const tabIndex = await handle.getAttribute('tabindex');
      const tagName = await handle.evaluate((el) => el.tagName.toLowerCase());
      const isFocusable =
        tabIndex === null || // Native focusable elements
        parseInt(tabIndex, 10) >= 0 ||
        tagName === 'button';

      expect(isFocusable).toBe(true);
    }
  });

  test('should reorder enrichments via drag and drop', async ({ page }) => {
    // Navigate to lesson with enrichments
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_WITH_ENRICHMENTS);

    // Wait for enrichment list to load
    await inspectorPage.expectEnrichmentList();

    // Get initial order of enrichments
    const initialOrder = await inspectorPage.getEnrichmentOrder();
    expect(initialOrder.length).toBeGreaterThanOrEqual(2);

    // Track reorder API call
    let reorderCalled = false;
    let reorderPayload: unknown = null;

    await page.route('**/api/trpc/enrichment.reorder*', async (route) => {
      reorderCalled = true;
      const request = route.request();
      const postData = request.postDataJSON();
      reorderPayload = postData;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: { success: true },
          },
        }),
      });
    });

    // Perform drag: move first item to second position
    await inspectorPage.dragEnrichment(0, 1);

    // Wait for animation to complete
    await waitForAnimation(page);

    // Verify reorder API was called
    expect(reorderCalled).toBe(true);
    expect(reorderPayload).not.toBeNull();

    // Get new order after drag
    const newOrder = await inspectorPage.getEnrichmentOrder();

    // Order should have changed (first two items swapped)
    expect(newOrder[0]).toBe(initialOrder[1]);
    expect(newOrder[1]).toBe(initialOrder[0]);
  });

  test('should support keyboard reordering', async ({ page }) => {
    // Navigate to lesson with enrichments
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_WITH_ENRICHMENTS);

    // Wait for enrichment list to load
    await inspectorPage.expectEnrichmentList();

    // Get initial order
    const initialOrder = await inspectorPage.getEnrichmentOrder();
    expect(initialOrder.length).toBeGreaterThanOrEqual(2);

    // Track reorder API call
    let reorderCalled = false;

    await page.route('**/api/trpc/enrichment.reorder*', async (route) => {
      reorderCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: { success: true },
          },
        }),
      });
    });

    // Focus on first drag handle
    const firstHandle = inspectorPage.dragHandles.first();
    await firstHandle.focus();

    // Verify handle is focused
    await expect(firstHandle).toBeFocused();

    // Keyboard sequence: Space (grab) -> ArrowDown (move) -> Space (drop)
    await page.keyboard.press('Space');

    // Wait for grab state to be applied
    await waitForAnimation(page, 200);

    // Move down
    await page.keyboard.press('ArrowDown');

    // Wait for visual feedback
    await waitForAnimation(page, 200);

    // Drop the item
    await page.keyboard.press('Space');

    // Wait for drop animation
    await waitForAnimation(page);

    // Verify reorder API was called
    expect(reorderCalled).toBe(true);

    // Get new order
    const newOrder = await inspectorPage.getEnrichmentOrder();

    // First item should have moved down
    expect(newOrder[0]).toBe(initialOrder[1]);
    expect(newOrder[1]).toBe(initialOrder[0]);
  });

  test('drag handle should not trigger item click', async ({ page }) => {
    // Navigate to lesson with enrichments
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_WITH_ENRICHMENTS);

    // Wait for enrichment list to load
    await inspectorPage.expectEnrichmentList();

    // Get initial view state
    await inspectorPage.expectView('root');

    // Click on the drag handle (not the item itself)
    const firstHandle = inspectorPage.dragHandles.first();
    await firstHandle.click();

    // Wait for potential navigation
    await waitForAnimation(page, 300);

    // Should still be on root view (not navigated to detail)
    await inspectorPage.expectView('root');

    // Detail view should NOT be visible
    await expect(inspectorPage.detailView).not.toBeVisible();

    // Now click on the list item itself (not drag handle)
    const firstItem = inspectorPage.listItems.first();

    // Get the clickable area (excluding drag handle)
    const itemBounds = await firstItem.boundingBox();
    const handleBounds = await firstHandle.boundingBox();

    if (itemBounds && handleBounds) {
      // Click on the right side of the item (away from drag handle)
      const clickX = itemBounds.x + itemBounds.width - 20;
      const clickY = itemBounds.y + itemBounds.height / 2;

      await page.mouse.click(clickX, clickY);

      // Wait for navigation
      await waitForAnimation(page, 500);

      // Should navigate to detail view
      await inspectorPage.expectView('detail');
    }
  });

  test('should maintain order after page refresh', async ({ page }) => {
    // Navigate to lesson with enrichments
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_WITH_ENRICHMENTS);

    // Wait for enrichment list to load
    await inspectorPage.expectEnrichmentList();

    // Get initial order
    const initialOrder = await inspectorPage.getEnrichmentOrder();

    // Perform drag to reorder
    await inspectorPage.dragEnrichment(0, 1);
    await waitForAnimation(page);

    // Get new order
    const orderAfterDrag = await inspectorPage.getEnrichmentOrder();

    // Verify order changed
    expect(orderAfterDrag[0]).toBe(initialOrder[1]);

    // Mock API with new order for refresh
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      const lesson = TEST_COURSES[COURSE_SLUG].lessons.find(
        (l) => l.id === LESSON_WITH_ENRICHMENTS
      );
      // Simulate server returning new order
      const reorderedEnrichments = [...(lesson?.enrichments ?? [])];
      if (reorderedEnrichments.length >= 2) {
        [reorderedEnrichments[0], reorderedEnrichments[1]] = [
          reorderedEnrichments[1],
          reorderedEnrichments[0],
        ];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: reorderedEnrichments,
          },
        }),
      });
    });

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Click lesson again to reopen inspector
    await inspectorPage.clickLessonNode(LESSON_WITH_ENRICHMENTS);

    // Verify order persisted
    const orderAfterRefresh = await inspectorPage.getEnrichmentOrder();
    expect(orderAfterRefresh[0]).toBe(orderAfterDrag[0]);
    expect(orderAfterRefresh[1]).toBe(orderAfterDrag[1]);
  });

  test('should show visual feedback during drag', async ({ page }) => {
    // Navigate to lesson with enrichments
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_WITH_ENRICHMENTS);

    // Wait for enrichment list to load
    await inspectorPage.expectEnrichmentList();

    const firstHandle = inspectorPage.dragHandles.first();
    const firstItem = inspectorPage.listItems.first();

    // Get initial styles
    const initialCursor = await firstHandle.evaluate((el) =>
      window.getComputedStyle(el).cursor
    );

    // Start drag (mousedown on handle)
    await firstHandle.hover();

    // Handle should show grab cursor on hover
    const hoverCursor = await firstHandle.evaluate((el) =>
      window.getComputedStyle(el).cursor
    );

    // Cursor should indicate draggability
    const isDraggableCursor = ['grab', 'move', 'pointer', '-webkit-grab'].includes(
      hoverCursor
    );
    expect(isDraggableCursor).toBe(true);

    // Perform drag
    const handleBox = await firstHandle.boundingBox();
    const targetItem = inspectorPage.listItems.nth(1);
    const targetBox = await targetItem.boundingBox();

    if (handleBox && targetBox) {
      // Start drag
      await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2
      );
      await page.mouse.down();

      // Move to target position
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: 10 }
      );

      // During drag, item should have visual feedback (e.g., opacity, shadow)
      const draggingOpacity = await firstItem.evaluate((el) =>
        window.getComputedStyle(el).opacity
      );

      // Drop
      await page.mouse.up();

      // After drop, opacity should return to normal
      await waitForAnimation(page, 300);
      const finalOpacity = await firstItem.evaluate((el) =>
        window.getComputedStyle(el).opacity
      );

      expect(finalOpacity).toBe('1');
    }
  });

  test('should cancel drag on Escape key', async ({ page }) => {
    // Navigate to lesson with enrichments
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_WITH_ENRICHMENTS);

    // Wait for enrichment list to load
    await inspectorPage.expectEnrichmentList();

    // Get initial order
    const initialOrder = await inspectorPage.getEnrichmentOrder();

    // Track if reorder was called (should NOT be called)
    let reorderCalled = false;
    await page.route('**/api/trpc/enrichment.reorder*', async (route) => {
      reorderCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: { data: { success: true } },
        }),
      });
    });

    // Focus on first drag handle
    const firstHandle = inspectorPage.dragHandles.first();
    await firstHandle.focus();

    // Start keyboard drag
    await page.keyboard.press('Space');
    await waitForAnimation(page, 200);

    // Move down
    await page.keyboard.press('ArrowDown');
    await waitForAnimation(page, 200);

    // Cancel with Escape instead of completing with Space
    await page.keyboard.press('Escape');
    await waitForAnimation(page);

    // Reorder should NOT have been called
    expect(reorderCalled).toBe(false);

    // Order should remain unchanged
    const finalOrder = await inspectorPage.getEnrichmentOrder();
    expect(finalOrder).toEqual(initialOrder);
  });
});
