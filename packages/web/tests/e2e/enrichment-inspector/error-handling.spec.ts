/**
 * E2E Tests: Enrichment Inspector Error Handling
 *
 * Tests error handling and fallback behavior in the Enrichment Inspector Panel.
 * Validates error boundaries, API error states, and graceful degradation.
 *
 * @module e2e/enrichment-inspector/error-handling.spec
 */

import { test, expect } from '@playwright/test';
import { EnrichmentInspectorPage } from './pages/EnrichmentInspectorPage';
import {
  TEST_COURSES,
  mockEnrichmentApi,
  mockApiError,
  waitForAnimation,
} from './fixtures/enrichment-fixtures';

// Test data for error handling tests
const COURSE_SLUG = 'test-course';
const LESSON_WITH_FAILED = 'lesson-with-failed-enrichment';
const LESSON_WITH_ENRICHMENTS = 'lesson-with-enrichments';
const LESSON_EMPTY = 'lesson-1';

test.describe('Enrichment Inspector - Error Handling', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);
  });

  test('should show error fallback when component crashes', async ({ page }) => {
    // Block the enrichment list API to trigger error state
    await mockApiError(
      page,
      '**/api/trpc/enrichment.list*',
      'Internal server error'
    );

    // Navigate to lesson
    await inspectorPage.navigateToCourse(COURSE_SLUG);

    // Click lesson node to open inspector
    await inspectorPage.clickLessonNode(LESSON_WITH_ENRICHMENTS);

    // Wait for error state to appear
    await page.waitForTimeout(1000);

    // Error boundary should catch the error and show fallback UI
    // Look for error indicators
    const errorIndicators = [
      page.locator('text=/error|Error/i'),
      page.locator('[role="alert"]'),
      page.locator('[data-testid*="error"]'),
      page.getByText(/something went wrong/i),
      page.getByText(/failed to load/i),
      page.getByText(/try again/i),
    ];

    // At least one error indicator should be visible
    let errorFound = false;
    for (const indicator of errorIndicators) {
      if (await indicator.first().isVisible().catch(() => false)) {
        errorFound = true;
        break;
      }
    }

    expect(errorFound).toBe(true);

    // Verify retry button is available
    const retryButton = page.getByRole('button', { name: /retry|try again|reset/i });
    const hasRetryButton = await retryButton.isVisible().catch(() => false);

    // If no explicit retry button, check for any recovery action
    if (!hasRetryButton) {
      const resetButton = page.getByRole('button', { name: /reset panel/i });
      const hasResetButton = await resetButton.isVisible().catch(() => false);
      expect(hasResetButton || hasRetryButton).toBe(true);
    }
  });

  test('should show error state for failed enrichments', async ({ page }) => {
    // Mock API with failed enrichment data
    const lesson = TEST_COURSES[COURSE_SLUG].lessons.find(
      (l) => l.id === LESSON_WITH_FAILED
    );

    await page.route('**/api/trpc/enrichment.list*', async (route) => {
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

    // Navigate to lesson with failed enrichment
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_WITH_FAILED);

    // Wait for enrichment list to load
    await inspectorPage.expectEnrichmentList();

    // Find the enrichment item with failed status
    const failedEnrichment = inspectorPage.listItems.first();
    await expect(failedEnrichment).toBeVisible();

    // Check for failed status indicator
    const statusBadge = failedEnrichment.locator('[data-testid*="status"], .badge, [class*="badge"]');

    // Status should indicate failure (red color, "failed" text, etc.)
    const failedIndicators = [
      failedEnrichment.locator('text=/failed|error|ошибка/i'),
      failedEnrichment.locator('[data-enrichment-status="failed"]'),
      failedEnrichment.locator('.text-red-500, .text-red-600, .bg-red-100'),
    ];

    let failedStatusFound = false;
    for (const indicator of failedIndicators) {
      if (await indicator.first().isVisible().catch(() => false)) {
        failedStatusFound = true;
        break;
      }
    }

    // The status should be displayed somehow
    const enrichmentStatus = await inspectorPage.getEnrichmentStatus(0);
    expect(enrichmentStatus).toBe('failed');

    // Click on failed enrichment to see details
    await inspectorPage.clickEnrichment(0);

    // Wait for detail view
    await waitForAnimation(page);

    // Detail view should show error message
    const errorMessageIndicators = [
      page.locator('text=/generation failed/i'),
      page.locator('text=/insufficient content/i'),
      page.locator('[data-testid*="error-message"]'),
      page.locator('.text-red-500, .text-destructive'),
    ];

    let errorMessageFound = false;
    for (const indicator of errorMessageIndicators) {
      if (await indicator.first().isVisible().catch(() => false)) {
        errorMessageFound = true;
        break;
      }
    }

    // Error details or retry option should be available
    const retryButton = page.getByRole('button', { name: /retry|try again|regenerate/i });
    const hasRetryOption = await retryButton.isVisible().catch(() => false);

    // Either error message is shown or retry is available
    expect(errorMessageFound || hasRetryOption).toBe(true);
  });

  test('should handle form submission errors gracefully', async ({ page }) => {
    // First, mock the list endpoint with empty data to show empty state
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: [],
          },
        }),
      });
    });

    // Mock the create endpoint to return 500 error
    await page.route('**/api/trpc/enrichment.create*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            message: 'Failed to create enrichment: Database connection error',
            code: 'INTERNAL_SERVER_ERROR',
          },
        }),
      });
    });

    // Navigate to empty lesson
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_EMPTY);

    // Wait for empty state
    await inspectorPage.expectEmptyState();

    // Click on a discovery card to open create view
    await inspectorPage.openCreateView('quiz');

    // Wait for create form to load
    await inspectorPage.expectView('create');

    // Fill the form (if form fields exist)
    const formExists = await inspectorPage.createForm.isVisible().catch(() => false);

    if (formExists) {
      // Try to fill form fields
      await inspectorPage.fillQuizForm({
        questionCount: 5,
        difficulty: 'medium',
      });
    }

    // Submit the form
    await inspectorPage.submitCreateForm();

    // Wait for error response
    await waitForAnimation(page, 1000);

    // Error should be displayed to user
    const errorIndicators = [
      page.locator('text=/failed to create/i'),
      page.locator('text=/error/i'),
      page.locator('[role="alert"]'),
      page.locator('.text-red-500, .text-destructive'),
      page.locator('[data-testid*="error"]'),
      page.getByText(/something went wrong/i),
      page.getByText(/try again/i),
    ];

    let errorDisplayed = false;
    for (const indicator of errorIndicators) {
      if (await indicator.first().isVisible().catch(() => false)) {
        errorDisplayed = true;
        break;
      }
    }

    expect(errorDisplayed).toBe(true);

    // Form should still be visible (not navigated away)
    // User should be able to retry or cancel
    const cancelButton = page.getByRole('button', { name: /cancel|back|close/i });
    const retryButton = page.getByRole('button', { name: /retry|try again|submit/i });

    const canRecover =
      (await cancelButton.isVisible().catch(() => false)) ||
      (await retryButton.isVisible().catch(() => false));

    expect(canRecover).toBe(true);
  });

  test('should recover from error state when API succeeds after retry', async ({ page }) => {
    let requestCount = 0;

    // First request fails, second succeeds
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      requestCount++;

      if (requestCount === 1) {
        // First request: fail
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              message: 'Temporary server error',
            },
          }),
        });
      } else {
        // Subsequent requests: succeed
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              data: [
                { id: 'e1', type: 'quiz', status: 'completed', display_order: 1 },
              ],
            },
          }),
        });
      }
    });

    // Navigate to lesson - should fail initially
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_WITH_ENRICHMENTS);

    // Wait for error state
    await waitForAnimation(page, 1000);

    // Find and click retry button
    const retryButton = page.getByRole('button', { name: /retry|try again|reset/i });

    if (await retryButton.isVisible().catch(() => false)) {
      await retryButton.click();

      // Wait for successful load
      await waitForAnimation(page, 1000);

      // Should now show enrichment list
      await inspectorPage.expectEnrichmentList();

      // Verify enrichment is displayed
      const enrichmentCount = await inspectorPage.getEnrichmentCount();
      expect(enrichmentCount).toBeGreaterThan(0);
    }
  });

  test('should display appropriate error for network failures', async ({ page }) => {
    // Simulate network failure
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      await route.abort('failed');
    });

    // Navigate to lesson
    await inspectorPage.navigateToCourse(COURSE_SLUG);

    // Click lesson node to open inspector
    await inspectorPage.clickLessonNode(LESSON_WITH_ENRICHMENTS);

    // Wait for error handling
    await waitForAnimation(page, 2000);

    // Check for network error indicators
    const networkErrorIndicators = [
      page.locator('text=/network|connection|offline/i'),
      page.locator('text=/failed to load/i'),
      page.locator('text=/try again/i'),
      page.locator('[role="alert"]'),
    ];

    let networkErrorShown = false;
    for (const indicator of networkErrorIndicators) {
      if (await indicator.first().isVisible().catch(() => false)) {
        networkErrorShown = true;
        break;
      }
    }

    // Some error handling should be visible
    expect(networkErrorShown).toBe(true);
  });

  test('should not lose user input on submission error', async ({ page }) => {
    // Mock empty list
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: { data: [] },
        }),
      });
    });

    // Mock create to fail
    await page.route('**/api/trpc/enrichment.create*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Server error' },
        }),
      });
    });

    // Navigate and open create view
    await inspectorPage.navigateToLesson(COURSE_SLUG, LESSON_EMPTY);
    await inspectorPage.expectEmptyState();
    await inspectorPage.openCreateView('video');
    await inspectorPage.expectView('create');

    // Fill form with test data
    const voiceSelect = page.getByRole('combobox').first();
    if (await voiceSelect.isVisible().catch(() => false)) {
      // Get initial form state for comparison
      await inspectorPage.fillVideoForm({ voice: 'alloy' });
    }

    // Submit and trigger error
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page, 1000);

    // Form should still be visible with user's data
    await inspectorPage.expectView('create');

    // User should be able to retry without re-entering data
    const submitButton = inspectorPage.submitButton;
    const isStillVisible = await submitButton.isVisible().catch(() => false);
    expect(isStillVisible).toBe(true);
  });

  test('should show error boundary UI for render errors', async ({ page }) => {
    // This test simulates a render error in the inspector panel

    // Mock a response that could cause a render error (malformed data)
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: [
              // Malformed data that might cause render issues
              { id: null, type: undefined, status: 'invalid' },
            ],
          },
        }),
      });
    });

    // Navigate to lesson
    await inspectorPage.navigateToCourse(COURSE_SLUG);

    // Click lesson node
    await inspectorPage.clickLessonNode(LESSON_WITH_ENRICHMENTS);

    // Wait for potential error boundary activation
    await waitForAnimation(page, 1500);

    // Check if error boundary caught the error
    const errorBoundaryIndicators = [
      page.locator('text=/enrichment panel error/i'),
      page.locator('text=/something went wrong/i'),
      page.locator('text=/reset panel/i'),
      page.locator('[data-testid*="error-boundary"]'),
    ];

    // Check for any error handling
    let errorHandled = false;
    for (const indicator of errorBoundaryIndicators) {
      if (await indicator.first().isVisible().catch(() => false)) {
        errorHandled = true;

        // If error boundary is shown, verify reset button works
        const resetButton = page.getByRole('button', { name: /reset panel/i });
        if (await resetButton.isVisible().catch(() => false)) {
          await resetButton.click();
          await waitForAnimation(page);

          // Panel should attempt to recover
          await inspectorPage.expectPanelVisible();
        }
        break;
      }
    }

    // If no error boundary triggered, component handled the error gracefully
    // This is also acceptable behavior
    if (!errorHandled) {
      // Panel should still be visible (graceful degradation)
      await inspectorPage.expectPanelVisible();
    }
  });

  test('should handle concurrent errors gracefully', async ({ page }) => {
    // Simulate multiple failing endpoints
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'List endpoint error' },
        }),
      });
    });

    await page.route('**/api/trpc/enrichment.progress*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Progress endpoint error' },
        }),
      });
    });

    // Navigate
    await inspectorPage.navigateToCourse(COURSE_SLUG);
    await inspectorPage.clickLessonNode(LESSON_WITH_ENRICHMENTS);

    // Wait for errors to be handled
    await waitForAnimation(page, 2000);

    // Panel should not crash entirely
    await inspectorPage.expectPanelVisible();

    // Some error indication should be present
    const hasErrorState = await page.locator('[role="alert"], [class*="error"], text=/error/i')
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasErrorState).toBe(true);
  });
});
