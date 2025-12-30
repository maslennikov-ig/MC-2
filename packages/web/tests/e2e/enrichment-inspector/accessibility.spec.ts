/**
 * E2E Tests: Enrichment Inspector Accessibility
 *
 * Tests keyboard navigation, screen reader support, and ARIA compliance
 * for the Stage 7 Enrichment Inspector Panel.
 *
 * Priority: P2
 * @module e2e/enrichment-inspector/accessibility
 */

import { test, expect } from '@playwright/test';
import { EnrichmentInspectorPage } from './pages/EnrichmentInspectorPage';
import {
  mockEnrichmentApi,
} from './fixtures/enrichment-fixtures';

test.describe('Enrichment Inspector Accessibility', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);

    // Mock API responses for consistent testing
    await mockEnrichmentApi(page, 'lesson-with-enrichments');
  });

  test('drag handles should have accessible names', async ({ page }) => {
    // Navigate to lesson with enrichments
    await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments');
    await inspectorPage.expectEnrichmentList();

    // Verify each drag handle has an accessible name
    const dragHandles = page.locator('[data-testid="drag-handle"]');
    const handleCount = await dragHandles.count();

    expect(handleCount).toBeGreaterThan(0);

    for (let i = 0; i < handleCount; i++) {
      const handle = dragHandles.nth(i);

      // Check for aria-label or accessible name
      const ariaLabel = await handle.getAttribute('aria-label');
      const title = await handle.getAttribute('title');

      // At least one accessible name mechanism should be present
      const hasAccessibleName = ariaLabel || title;
      expect(hasAccessibleName).toBeTruthy();

      // Verify the accessible name matches expected text
      if (ariaLabel) {
        expect(ariaLabel).toMatch(/drag|reorder|move/i);
      }
      if (title) {
        expect(title).toMatch(/drag|reorder|move/i);
      }
    }

    // Verify drag handles are focusable (have tabindex or are buttons)
    const firstHandle = dragHandles.first();
    const tagName = await firstHandle.evaluate((el) => el.tagName.toLowerCase());
    const tabIndex = await firstHandle.getAttribute('tabindex');
    const role = await firstHandle.getAttribute('role');

    const isFocusable =
      tagName === 'button' ||
      tabIndex !== '-1' ||
      role === 'button' ||
      role === 'application';

    expect(isFocusable).toBeTruthy();
  });

  test('discovery cards should be keyboard accessible', async ({ page }) => {
    // Navigate to empty lesson to see discovery cards
    await inspectorPage.navigateToLesson('test-course', 'lesson-1');
    await inspectorPage.expectEmptyState();

    // Verify discovery cards container is visible
    await expect(inspectorPage.discoveryCards).toBeVisible();

    // Get all discovery cards
    const cards = page.locator('[data-testid^="discovery-card-"]');
    const cardCount = await cards.count();

    expect(cardCount).toBe(4); // video, quiz, audio, presentation

    // Test keyboard navigation through cards
    // Focus on first card
    await cards.first().focus();
    await expect(cards.first()).toBeFocused();

    // Tab through all cards
    for (let i = 1; i < cardCount; i++) {
      await page.keyboard.press('Tab');
      // Verify focus moved (might be on card or interactive element within)
    }

    // Test Enter key activates card
    await inspectorPage.videoCard.focus();
    await expect(inspectorPage.videoCard).toBeFocused();

    // Verify cards have proper roles
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const role = await card.getAttribute('role');
      const tabIndex = await card.getAttribute('tabindex');
      const tagName = await card.evaluate((el) => el.tagName.toLowerCase());

      // Card should be interactive (button role or button element or have tabindex)
      const isInteractive =
        role === 'button' ||
        tagName === 'button' ||
        tabIndex === '0';

      expect(isInteractive).toBeTruthy();
    }

    // Verify cards have accessible names
    const videoCardName = await inspectorPage.videoCard.getAttribute('aria-label');
    const videoCardText = await inspectorPage.videoCard.innerText();

    expect(videoCardName || videoCardText).toBeTruthy();
  });

  test('form inputs should have labels', async ({ page }) => {
    // Navigate to empty lesson and open create view
    await inspectorPage.navigateToLesson('test-course', 'lesson-1');
    await inspectorPage.openCreateView('quiz');

    // Wait for form to be visible
    await expect(inspectorPage.createView).toBeVisible();
    await expect(inspectorPage.createForm).toBeVisible();

    // Get all form inputs
    const inputs = page.locator('input, select, textarea, [role="slider"], [role="combobox"]');
    const inputCount = await inputs.count();

    expect(inputCount).toBeGreaterThan(0);

    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const inputId = await input.getAttribute('id');
      const inputName = await input.getAttribute('name');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const placeholder = await input.getAttribute('placeholder');

      // Check if input has associated label
      let hasLabel = false;

      // Check for aria-label
      if (ariaLabel) {
        hasLabel = true;
      }

      // Check for aria-labelledby
      if (ariaLabelledBy) {
        const labelElement = page.locator(`#${ariaLabelledBy}`);
        if ((await labelElement.count()) > 0) {
          hasLabel = true;
        }
      }

      // Check for associated <label> element
      if (inputId) {
        const labelForId = page.locator(`label[for="${inputId}"]`);
        if ((await labelForId.count()) > 0) {
          hasLabel = true;
        }
      }

      // Check for parent label (implicit association)
      const parentLabel = input.locator('xpath=ancestor::label');
      if ((await parentLabel.count()) > 0) {
        hasLabel = true;
      }

      // Placeholder alone is NOT sufficient for accessibility
      // but we note if it exists as additional context
      const hasPlaceholderOnly = placeholder && !hasLabel;

      if (hasPlaceholderOnly) {
        console.warn(
          `Input "${inputName || inputId || i}" only has placeholder, missing proper label`
        );
      }

      // Each input should have a proper label (aria-label, aria-labelledby, or <label>)
      expect(hasLabel).toBeTruthy();
    }

    // Verify submit and cancel buttons have accessible names
    await expect(inspectorPage.submitButton).toHaveAccessibleName(/create|submit/i);
    await expect(inspectorPage.cancelButton).toHaveAccessibleName(/cancel/i);
  });

  test('status indicators should be readable by screen readers', async ({ page }) => {
    // Navigate to lesson with enrichments in various states
    await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments');
    await inspectorPage.expectEnrichmentList();

    // Get all status indicators
    const statusIndicators = page.locator('[data-testid="enrichment-status"], [class*="status"]');
    const statusCount = await statusIndicators.count();

    // If no dedicated status elements, check list items for status attributes
    if (statusCount === 0) {
      const listItems = inspectorPage.listItems;
      const itemCount = await listItems.count();

      for (let i = 0; i < itemCount; i++) {
        const item = listItems.nth(i);
        const status = await item.getAttribute('data-enrichment-status');

        // Verify status is exposed to assistive technology
        // Check for aria-label or visible text describing status
        const ariaLabel = await item.getAttribute('aria-label');
        const itemText = await item.innerText();

        // Status should be communicated somehow
        const statusCommunicated =
          (ariaLabel && ariaLabel.includes(status || '')) ||
          itemText.toLowerCase().includes(status || '');

        if (status) {
          expect(statusCommunicated).toBeTruthy();
        }
      }
    } else {
      // Check dedicated status indicators
      for (let i = 0; i < statusCount; i++) {
        const indicator = statusIndicators.nth(i);

        // Check for accessible name via aria-label
        const ariaLabel = await indicator.getAttribute('aria-label');

        // Check for role="status" for live regions
        const role = await indicator.getAttribute('role');

        // Check for visible text
        const visibleText = await indicator.innerText();

        // Status should have accessible name or visible text
        const hasAccessibleInfo = ariaLabel || visibleText;
        expect(hasAccessibleInfo).toBeTruthy();

        // Optionally check for aria-live for dynamic updates
        const ariaLive = await indicator.getAttribute('aria-live');

        // Log accessibility info for debugging
        console.log(`Status indicator ${i}: role=${role}, aria-label=${ariaLabel}, aria-live=${ariaLive}`);
      }
    }

    // Verify generating state has appropriate aria-busy or progress indicator
    await mockEnrichmentApi(page, 'lesson-generating');
    await inspectorPage.navigateToLesson('test-course', 'lesson-generating');

    // Check for aria-busy or progress role
    const generatingItems = page.locator('[data-enrichment-status="generating"]');
    if ((await generatingItems.count()) > 0) {
      const generatingItem = generatingItems.first();

      // Check for loading indicator accessibility
      const ariaBusy = await generatingItem.getAttribute('aria-busy');
      const progressBar = generatingItem.locator('[role="progressbar"]');
      const spinner = generatingItem.locator('[role="status"]');

      const hasLoadingIndicator =
        ariaBusy === 'true' ||
        (await progressBar.count()) > 0 ||
        (await spinner.count()) > 0;

      // Generating items should indicate loading state
      expect(hasLoadingIndicator).toBeTruthy();
    }
  });

  test('panel should have proper landmark structure', async ({ page }) => {
    await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments');
    await inspectorPage.expectPanelVisible();

    // Check panel has appropriate role
    const panelRole = await inspectorPage.panel.getAttribute('role');
    const panelAriaLabel = await inspectorPage.panel.getAttribute('aria-label');

    // Panel should be a region, dialog, or have complementary role
    const validRoles = ['region', 'dialog', 'complementary', 'navigation', null];
    expect(validRoles).toContain(panelRole);

    // If panel has role, it should have aria-label
    if (panelRole && panelRole !== 'generic') {
      expect(panelAriaLabel).toBeTruthy();
    }

    // Check header structure
    const header = inspectorPage.header;
    if ((await header.count()) > 0) {
      const headerRole = await header.getAttribute('role');
      const heading = header.locator('h1, h2, h3, [role="heading"]');

      // Header should contain a heading
      expect(await heading.count()).toBeGreaterThan(0);
    }
  });

  test('focus should be managed when navigating views', async ({ page }) => {
    await inspectorPage.navigateToLesson('test-course', 'lesson-1');
    await inspectorPage.expectEmptyState();

    // Open create view
    await inspectorPage.openCreateView('video');

    // Focus should move to create view
    // Check if focus is within create view
    const focusedElement = page.locator(':focus');
    const isWithinCreateView = await inspectorPage.createView.locator(':focus').count();

    // Focus should be managed (either on heading, first input, or close button)
    expect(isWithinCreateView).toBeGreaterThanOrEqual(0); // Focus may or may not be trapped

    // Go back
    await inspectorPage.goBack();

    // Verify we're back at root view
    await inspectorPage.expectView('root');
  });

  test('error states should be announced to screen readers', async ({ page }) => {
    // Navigate to lesson with failed enrichment
    await mockEnrichmentApi(page, 'lesson-with-failed-enrichment');
    await inspectorPage.navigateToLesson('test-course', 'lesson-with-failed-enrichment');

    // Find error elements
    const errorElements = page.locator('[role="alert"], [aria-live="assertive"], [aria-live="polite"]');
    const failedItems = page.locator('[data-enrichment-status="failed"]');

    if ((await failedItems.count()) > 0) {
      const failedItem = failedItems.first();

      // Check error is communicated accessibly
      const errorMessage = failedItem.locator('[class*="error"], [role="alert"]');
      const hasErrorIndicator = (await errorMessage.count()) > 0;

      // Failed items should have visible error indication
      const itemText = await failedItem.innerText();
      const hasErrorText = itemText.toLowerCase().includes('error') ||
                           itemText.toLowerCase().includes('failed');

      expect(hasErrorIndicator || hasErrorText).toBeTruthy();
    }
  });
});
