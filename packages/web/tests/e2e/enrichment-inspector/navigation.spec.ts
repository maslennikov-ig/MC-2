/**
 * E2E Tests: Enrichment Inspector Navigation
 *
 * Tests the Stack Navigator pattern implementation for the
 * Enrichment Inspector Panel, verifying:
 * 1. Empty state display when no enrichments exist
 * 2. Navigation to create view via discovery cards
 * 3. Back navigation from create/detail views
 * 4. History stack preservation across navigations
 * 5. Back button visibility rules (hidden on root, visible elsewhere)
 *
 * @see docs/specs/stage7-enrichment-inspector.md
 */

import { test, expect } from '@playwright/test';
import { EnrichmentInspectorPage } from './pages/EnrichmentInspectorPage';
import {
  mockEnrichmentApi,
  waitForAnimation,
} from './fixtures/enrichment-fixtures';

// Test configuration
const TEST_COURSE_SLUG = 'test-course';

/**
 * Setup: Configure API mocks before each test
 */
test.beforeEach(async ({ page }) => {
  // Authenticate test user if token available
  const token = process.env.TOKEN;
  if (token) {
    await page.addInitScript(
      (authToken) => {
        localStorage.setItem(
          'sb-diqooqbuchsliypgwksu-auth-token',
          JSON.stringify({
            access_token: authToken,
            token_type: 'bearer',
          })
        );
      },
      token
    );
  }
});

test.describe('Enrichment Inspector Navigation', () => {
  test.describe('Empty State', () => {
    test('should show empty state when no enrichments', async ({ page }) => {
      // Setup: Mock API to return empty enrichments list
      await mockEnrichmentApi(page, 'lesson-1'); // lesson-1 has no enrichments

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector for empty lesson
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');

      // Assert: Empty state should be visible
      await inspectorPage.expectEmptyState();

      // Assert: Discovery cards should be visible for adding enrichments
      await expect(inspectorPage.discoveryCards).toBeVisible();

      // Assert: All four discovery card types should be present
      await expect(inspectorPage.videoCard).toBeVisible();
      await expect(inspectorPage.quizCard).toBeVisible();
      await expect(inspectorPage.audioCard).toBeVisible();
      await expect(inspectorPage.presentationCard).toBeVisible();

      // Assert: Enrichment list should NOT be visible
      await expect(inspectorPage.enrichmentList).not.toBeVisible();
    });
  });

  test.describe('Discovery Card Navigation', () => {
    test('should navigate to create view when clicking discovery card', async ({
      page,
    }) => {
      // Setup: Mock API for empty lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');

      // Wait for empty state to be visible
      await inspectorPage.expectEmptyState();

      // Act: Click video discovery card
      await inspectorPage.openCreateView('video');

      // Wait for navigation animation
      await waitForAnimation(page);

      // Assert: Create view should be visible
      await inspectorPage.expectView('create');

      // Assert: Empty state should NOT be visible
      await expect(inspectorPage.emptyState).not.toBeVisible();
    });

    test('should navigate to quiz create view', async ({ page }) => {
      await mockEnrichmentApi(page, 'lesson-1');
      const inspectorPage = new EnrichmentInspectorPage(page);

      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Act: Click quiz discovery card
      await inspectorPage.openCreateView('quiz');
      await waitForAnimation(page);

      // Assert: Create view should be visible
      await inspectorPage.expectView('create');
    });

    test('should navigate to audio create view', async ({ page }) => {
      await mockEnrichmentApi(page, 'lesson-1');
      const inspectorPage = new EnrichmentInspectorPage(page);

      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Act: Click audio discovery card
      await inspectorPage.openCreateView('audio');
      await waitForAnimation(page);

      // Assert: Create view should be visible
      await inspectorPage.expectView('create');
    });

    test('should navigate to presentation create view', async ({ page }) => {
      await mockEnrichmentApi(page, 'lesson-1');
      const inspectorPage = new EnrichmentInspectorPage(page);

      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Act: Click presentation discovery card
      await inspectorPage.openCreateView('presentation');
      await waitForAnimation(page);

      // Assert: Create view should be visible
      await inspectorPage.expectView('create');
    });
  });

  test.describe('Back Navigation', () => {
    test('should navigate back from create view', async ({ page }) => {
      // Setup: Mock API for empty lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Navigate to create view
      await inspectorPage.openCreateView('video');
      await waitForAnimation(page);
      await inspectorPage.expectView('create');

      // Act: Click back button
      await inspectorPage.goBack();
      await waitForAnimation(page);

      // Assert: Should be back on root view with empty state
      await inspectorPage.expectEmptyState();
      await expect(inspectorPage.discoveryCards).toBeVisible();
    });

    test('should navigate back from detail view to root', async ({ page }) => {
      // Setup: Mock API for lesson with enrichments
      await mockEnrichmentApi(page, 'lesson-with-enrichments');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(
        TEST_COURSE_SLUG,
        'lesson-with-enrichments'
      );

      // Wait for enrichment list
      await inspectorPage.expectEnrichmentList();

      // Click on first enrichment to open detail view
      await inspectorPage.clickEnrichment(0);
      await waitForAnimation(page);

      // Assert: Detail view should be visible
      await inspectorPage.expectView('detail');

      // Act: Click back button
      await inspectorPage.goBack();
      await waitForAnimation(page);

      // Assert: Should be back on root view with enrichment list
      await inspectorPage.expectEnrichmentList();
    });
  });

  test.describe('History Stack', () => {
    test('should preserve history stack for multiple navigations', async ({
      page,
    }) => {
      // Setup: Mock API for lesson with enrichments
      await mockEnrichmentApi(page, 'lesson-with-enrichments');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(
        TEST_COURSE_SLUG,
        'lesson-with-enrichments'
      );

      // Step 1: Start on root (list view)
      await inspectorPage.expectEnrichmentList();

      // Step 2: Navigate to detail view
      await inspectorPage.clickEnrichment(0);
      await waitForAnimation(page);
      await inspectorPage.expectView('detail');

      // Step 3: Go back to root
      await inspectorPage.goBack();
      await waitForAnimation(page);
      await inspectorPage.expectEnrichmentList();

      // Step 4: Navigate to another enrichment detail
      await inspectorPage.clickEnrichment(1);
      await waitForAnimation(page);
      await inspectorPage.expectView('detail');

      // Step 5: Go back again
      await inspectorPage.goBack();
      await waitForAnimation(page);

      // Assert: Should be back on root view
      await inspectorPage.expectEnrichmentList();

      // Step 6: Verify we can still navigate after back
      await inspectorPage.clickEnrichment(2);
      await waitForAnimation(page);
      await inspectorPage.expectView('detail');
    });

    test('should maintain correct navigation state after create and back', async ({
      page,
    }) => {
      // Setup: Mock API for empty lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Navigate to create view
      await inspectorPage.openCreateView('quiz');
      await waitForAnimation(page);
      await inspectorPage.expectView('create');

      // Go back
      await inspectorPage.goBack();
      await waitForAnimation(page);
      await inspectorPage.expectEmptyState();

      // Navigate to different create view
      await inspectorPage.openCreateView('video');
      await waitForAnimation(page);
      await inspectorPage.expectView('create');

      // Go back
      await inspectorPage.goBack();
      await waitForAnimation(page);
      await inspectorPage.expectEmptyState();

      // Navigate again
      await inspectorPage.openCreateView('audio');
      await waitForAnimation(page);
      await inspectorPage.expectView('create');
    });
  });

  test.describe('Back Button Visibility', () => {
    test('back button should be hidden on root view', async ({ page }) => {
      // Setup: Mock API for empty lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Assert: Back button should NOT be visible on root view (empty state)
      await inspectorPage.expectBackButtonVisible(false);
    });

    test('back button should be hidden on root view with enrichments', async ({
      page,
    }) => {
      // Setup: Mock API for lesson with enrichments
      await mockEnrichmentApi(page, 'lesson-with-enrichments');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(
        TEST_COURSE_SLUG,
        'lesson-with-enrichments'
      );
      await inspectorPage.expectEnrichmentList();

      // Assert: Back button should NOT be visible on root view (list view)
      await inspectorPage.expectBackButtonVisible(false);
    });

    test('back button should be visible on create views', async ({ page }) => {
      // Setup: Mock API for empty lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Navigate to create view
      await inspectorPage.openCreateView('quiz');
      await waitForAnimation(page);

      // Assert: Back button should be visible on create view
      await inspectorPage.expectBackButtonVisible(true);
    });

    test('back button should be visible on detail views', async ({ page }) => {
      // Setup: Mock API for lesson with enrichments
      await mockEnrichmentApi(page, 'lesson-with-enrichments');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(
        TEST_COURSE_SLUG,
        'lesson-with-enrichments'
      );
      await inspectorPage.expectEnrichmentList();

      // Navigate to detail view
      await inspectorPage.clickEnrichment(0);
      await waitForAnimation(page);

      // Assert: Back button should be visible on detail view
      await inspectorPage.expectBackButtonVisible(true);
    });

    test('back button visibility toggles correctly during navigation', async ({
      page,
    }) => {
      // Setup: Mock API for empty lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Root view: back button hidden
      await inspectorPage.expectBackButtonVisible(false);

      // Navigate to create view
      await inspectorPage.openCreateView('video');
      await waitForAnimation(page);

      // Create view: back button visible
      await inspectorPage.expectBackButtonVisible(true);

      // Go back
      await inspectorPage.goBack();
      await waitForAnimation(page);

      // Root view again: back button hidden
      await inspectorPage.expectBackButtonVisible(false);
    });
  });

  test.describe('Cancel Button Navigation', () => {
    test('should return to root when clicking cancel on create view', async ({
      page,
    }) => {
      // Setup: Mock API for empty lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Navigate to create view
      await inspectorPage.openCreateView('quiz');
      await waitForAnimation(page);
      await inspectorPage.expectView('create');

      // Act: Click cancel button
      await inspectorPage.cancelCreateForm();
      await waitForAnimation(page);

      // Assert: Should be back on root view
      await inspectorPage.expectEmptyState();
    });
  });

  test.describe('Header Title Updates', () => {
    test('should show correct title on root view', async ({ page }) => {
      // Setup: Mock API for empty lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');
      await inspectorPage.expectEmptyState();

      // Assert: Header should show "Enrichments" or equivalent
      await inspectorPage.expectHeaderTitleContains(/enrichment/i);
    });

    test('should update title when navigating to create view', async ({
      page,
    }) => {
      // Setup: Mock API for empty lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, 'lesson-1');

      // Navigate to create view
      await inspectorPage.openCreateView('quiz');
      await waitForAnimation(page);

      // Assert: Header should show create-related title
      await inspectorPage.expectHeaderTitleContains(/create|quiz|new/i);
    });
  });

  test.describe('Panel Visibility', () => {
    test('should show panel when lesson node is clicked', async ({ page }) => {
      // Setup: Mock API for lesson
      await mockEnrichmentApi(page, 'lesson-1');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course only
      await inspectorPage.navigateToCourse(TEST_COURSE_SLUG);

      // Initially panel should not be visible
      await inspectorPage.expectPanelNotVisible();

      // Click lesson node
      await inspectorPage.clickLessonNode('lesson-1');

      // Assert: Panel should now be visible
      await inspectorPage.expectPanelVisible();
    });
  });

  test.describe('Navigation with Existing Enrichments', () => {
    test('should show enrichment list instead of empty state', async ({
      page,
    }) => {
      // Setup: Mock API for lesson with enrichments
      await mockEnrichmentApi(page, 'lesson-with-enrichments');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(
        TEST_COURSE_SLUG,
        'lesson-with-enrichments'
      );

      // Assert: Enrichment list should be visible
      await inspectorPage.expectEnrichmentList();

      // Assert: Empty state should NOT be visible
      await expect(inspectorPage.emptyState).not.toBeVisible();

      // Assert: Should have expected number of enrichments
      const count = await inspectorPage.getEnrichmentCount();
      expect(count).toBe(3); // lesson-with-enrichments has 3 enrichments
    });

    test('should navigate to detail view when clicking enrichment item', async ({
      page,
    }) => {
      // Setup: Mock API for lesson with enrichments
      await mockEnrichmentApi(page, 'lesson-with-enrichments');

      const inspectorPage = new EnrichmentInspectorPage(page);

      // Navigate to course and open inspector
      await inspectorPage.navigateToLesson(
        TEST_COURSE_SLUG,
        'lesson-with-enrichments'
      );
      await inspectorPage.expectEnrichmentList();

      // Act: Click first enrichment
      await inspectorPage.clickEnrichment(0);
      await waitForAnimation(page);

      // Assert: Detail view should be visible
      await inspectorPage.expectView('detail');
    });
  });
});
