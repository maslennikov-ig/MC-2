/**
 * E2E Tests: Create Enrichment Forms
 *
 * Tests the enrichment creation forms in the Enrichment Inspector Panel.
 * Covers Quiz, Video, Audio, and Presentation form validation and submission.
 *
 * @module e2e/enrichment-inspector/create-enrichment.spec.ts
 */

import { test, expect } from '@playwright/test';
import { EnrichmentInspectorPage } from './pages/EnrichmentInspectorPage';
import {
  mockEnrichmentApi,
  waitForAnimation,
} from './fixtures/enrichment-fixtures';

// Test constants
const TEST_COURSE_SLUG = 'test-course';
const TEST_LESSON_ID = 'lesson-1'; // Empty lesson for testing creation

test.describe('Create Enrichment - Quiz Form', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);

    // Mock API calls
    await mockEnrichmentApi(page, TEST_LESSON_ID);

    // Navigate to course and open inspector
    await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, TEST_LESSON_ID);
  });

  test('should show quiz settings form', async ({ page }) => {
    // Open quiz create view
    await inspectorPage.openCreateView('quiz');

    // Verify create view is visible
    await inspectorPage.expectView('create');

    // Verify form elements are visible
    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Verify Question Count slider is visible
    const questionCountLabel = page.getByText(/question count|количество вопросов/i);
    await expect(questionCountLabel).toBeVisible();

    const slider = page.locator('[role="slider"]').first();
    await expect(slider).toBeVisible();

    // Verify Difficulty select is visible
    const difficultyLabel = page.getByText(/difficulty|сложность/i);
    await expect(difficultyLabel).toBeVisible();

    const difficultySelect = page.getByRole('combobox').first();
    await expect(difficultySelect).toBeVisible();

    // Verify buttons are visible
    await expect(inspectorPage.submitButton).toBeVisible();
    await expect(inspectorPage.cancelButton).toBeVisible();
  });

  test('should create quiz with default settings', async ({ page }) => {
    // Open quiz create view
    await inspectorPage.openCreateView('quiz');

    // Verify default values are set
    // Question count default: 5
    const questionCountDisplay = page.locator('form .text-muted-foreground').first();
    await expect(questionCountDisplay).toContainText('5');

    // Difficulty default: balanced
    const difficultySelect = page.getByRole('combobox').first();
    await expect(difficultySelect).toContainText(/balanced|сбалансированный/i);

    // Submit form with defaults
    await inspectorPage.submitCreateForm();

    // Wait for form submission
    await waitForAnimation(page);

    // Should return to root view after successful creation
    await inspectorPage.expectView('root');
  });

  test('should create quiz with custom settings', async ({ page }) => {
    // Open quiz create view
    await inspectorPage.openCreateView('quiz');

    // Change question count to 8 using slider
    const slider = page.locator('[role="slider"]').first();
    await slider.focus();

    // Increase from default 5 to 8 (3 increments)
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    // Verify question count updated
    const questionCountDisplay = page.locator('form .text-muted-foreground').first();
    await expect(questionCountDisplay).toContainText('8');

    // Change difficulty to "hard"
    const difficultySelect = page.getByRole('combobox').first();
    await difficultySelect.click();
    await page.getByRole('option', { name: /hard|сложный/i }).click();

    // Verify difficulty updated
    await expect(difficultySelect).toContainText(/hard|сложный/i);

    // Submit form
    await inspectorPage.submitCreateForm();

    // Wait for submission
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });

  test('should cancel quiz creation', async ({ page }) => {
    // Open quiz create view
    await inspectorPage.openCreateView('quiz');

    // Verify we're in create view
    await inspectorPage.expectView('create');

    // Click cancel button
    await inspectorPage.cancelCreateForm();

    // Should return to root view without creating
    await inspectorPage.expectView('root');
  });

  test('should navigate back using back button', async ({ page }) => {
    // Open quiz create view
    await inspectorPage.openCreateView('quiz');

    // Verify back button is visible in create view
    await inspectorPage.expectBackButtonVisible(true);

    // Click back button
    await inspectorPage.goBack();

    // Should return to root view
    await inspectorPage.expectView('root');
  });
});

test.describe('Create Enrichment - Video Form', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);

    // Mock API calls
    await mockEnrichmentApi(page, TEST_LESSON_ID);

    // Navigate to course and open inspector
    await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, TEST_LESSON_ID);
  });

  test('should show video settings form', async ({ page }) => {
    // Open video create view
    await inspectorPage.openCreateView('video');

    // Verify create view is visible
    await inspectorPage.expectView('create');

    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Verify Voice select is visible
    const voiceLabel = page.getByText(/voice|голос/i);
    await expect(voiceLabel).toBeVisible();

    const voiceSelect = page.getByRole('combobox').first();
    await expect(voiceSelect).toBeVisible();

    // Verify Speed slider is visible
    const speedLabel = page.getByText(/speed|скорость/i);
    await expect(speedLabel).toBeVisible();

    const speedSlider = page.locator('[role="slider"]').first();
    await expect(speedSlider).toBeVisible();

    // Verify Format select is visible
    const formatLabel = page.getByText(/format|формат/i);
    await expect(formatLabel).toBeVisible();
  });

  test('should create video with voice selection', async ({ page }) => {
    // Open video create view
    await inspectorPage.openCreateView('video');

    // Select a different voice
    const voiceSelect = page.getByRole('combobox').first();
    await voiceSelect.click();
    await page.getByRole('option', { name: 'Nova' }).click();

    // Verify voice updated
    await expect(voiceSelect).toContainText('Nova');

    // Submit form
    await inspectorPage.submitCreateForm();

    // Wait for submission
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });

  test('should adjust video speed with slider', async ({ page }) => {
    // Open video create view
    await inspectorPage.openCreateView('video');

    // Focus speed slider and adjust
    const speedSlider = page.locator('[role="slider"]').first();
    await speedSlider.focus();

    // Increase speed
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    // Verify speed display updated (default is 1.0, each step is 0.1)
    const speedDisplay = page.locator('form .text-muted-foreground').filter({ hasText: /x$/ });
    await expect(speedDisplay).toContainText('1.2x');

    // Submit form
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });

  test('should select video format', async ({ page }) => {
    // Open video create view
    await inspectorPage.openCreateView('video');

    // Find and click the format select (third combobox)
    const formatSelects = page.getByRole('combobox');
    const formatSelect = formatSelects.nth(1); // Second combobox (after voice)
    await formatSelect.click();
    await page.getByRole('option', { name: 'WebM' }).click();

    // Verify format updated
    await expect(formatSelect).toContainText('WebM');

    // Submit form
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });
});

test.describe('Create Enrichment - Audio Form', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);

    // Mock API calls
    await mockEnrichmentApi(page, TEST_LESSON_ID);

    // Navigate to course and open inspector
    await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, TEST_LESSON_ID);
  });

  test('should show audio settings form', async ({ page }) => {
    // Open audio create view
    await inspectorPage.openCreateView('audio');

    // Verify create view is visible
    await inspectorPage.expectView('create');

    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Verify Voice select is visible
    const voiceLabel = page.getByText(/voice|голос/i);
    await expect(voiceLabel).toBeVisible();

    const voiceSelect = page.getByRole('combobox').first();
    await expect(voiceSelect).toBeVisible();

    // Verify Speed slider is visible
    const speedLabel = page.getByText(/speed|скорость/i);
    await expect(speedLabel).toBeVisible();

    const speedSlider = page.locator('[role="slider"]').first();
    await expect(speedSlider).toBeVisible();

    // Verify Format select for audio (MP3, Opus, AAC)
    const formatLabel = page.getByText(/format|формат/i);
    await expect(formatLabel).toBeVisible();
  });

  test('should create audio with default settings', async ({ page }) => {
    // Open audio create view
    await inspectorPage.openCreateView('audio');

    // Verify default voice is Alloy
    const voiceSelect = page.getByRole('combobox').first();
    await expect(voiceSelect).toContainText('Alloy');

    // Verify default speed is 1.0
    const speedDisplay = page.locator('form .text-muted-foreground').filter({ hasText: /x$/ });
    await expect(speedDisplay).toContainText('1.0x');

    // Submit with defaults
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });

  test('should select audio format options', async ({ page }) => {
    // Open audio create view
    await inspectorPage.openCreateView('audio');

    // Find format select (second combobox after voice)
    const formatSelect = page.getByRole('combobox').nth(1);
    await formatSelect.click();

    // Verify audio format options are available
    await expect(page.getByRole('option', { name: 'MP3' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Opus' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'AAC' })).toBeVisible();

    // Select Opus format
    await page.getByRole('option', { name: 'Opus' }).click();

    // Verify format updated
    await expect(formatSelect).toContainText('Opus');

    // Submit form
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });
});

test.describe('Create Enrichment - Presentation Form', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);

    // Mock API calls
    await mockEnrichmentApi(page, TEST_LESSON_ID);

    // Navigate to course and open inspector
    await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, TEST_LESSON_ID);
  });

  test('should show presentation settings form', async ({ page }) => {
    // Open presentation create view
    await inspectorPage.openCreateView('presentation');

    // Verify create view is visible
    await inspectorPage.expectView('create');

    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Verify Theme select is visible
    const themeLabel = page.getByText(/theme|тема/i);
    await expect(themeLabel).toBeVisible();

    const themeSelect = page.getByRole('combobox').first();
    await expect(themeSelect).toBeVisible();

    // Verify Maximum Slides slider is visible
    const slidesLabel = page.getByText(/maximum slides|максимум слайдов/i);
    await expect(slidesLabel).toBeVisible();

    const slidesSlider = page.locator('[role="slider"]').first();
    await expect(slidesSlider).toBeVisible();

    // Verify Include Speaker Notes checkbox is visible
    const notesLabel = page.getByText(/include speaker notes|включить заметки докладчика/i);
    await expect(notesLabel).toBeVisible();

    const notesCheckbox = page.locator('input[type="checkbox"]');
    await expect(notesCheckbox).toBeVisible();
  });

  test('should create presentation with theme selection', async ({ page }) => {
    // Open presentation create view
    await inspectorPage.openCreateView('presentation');

    // Select dark theme
    const themeSelect = page.getByRole('combobox').first();
    await themeSelect.click();
    await page.getByRole('option', { name: /dark|темная/i }).click();

    // Verify theme updated
    await expect(themeSelect).toContainText(/dark|темная/i);

    // Submit form
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });

  test('should adjust slide count with slider', async ({ page }) => {
    // Open presentation create view
    await inspectorPage.openCreateView('presentation');

    // Focus slides slider and adjust
    const slidesSlider = page.locator('[role="slider"]').first();
    await slidesSlider.focus();

    // Increase from default 10 to 15
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }

    // Verify slide count display updated
    const slidesDisplay = page.locator('form .text-muted-foreground').first();
    await expect(slidesDisplay).toContainText('15');

    // Submit form
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });

  test('should toggle speaker notes checkbox', async ({ page }) => {
    // Open presentation create view
    await inspectorPage.openCreateView('presentation');

    // Find and verify checkbox is checked by default
    const notesCheckbox = page.locator('input[type="checkbox"]#includeNotes');
    await expect(notesCheckbox).toBeChecked();

    // Uncheck the checkbox
    await notesCheckbox.click();

    // Verify checkbox is now unchecked
    await expect(notesCheckbox).not.toBeChecked();

    // Submit form
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });

  test('should create presentation with all custom settings', async ({ page }) => {
    // Open presentation create view
    await inspectorPage.openCreateView('presentation');

    // 1. Select colorful theme
    const themeSelect = page.getByRole('combobox').first();
    await themeSelect.click();
    await page.getByRole('option', { name: /colorful|красочная/i }).click();

    // 2. Set slide count to 18
    const slidesSlider = page.locator('[role="slider"]').first();
    await slidesSlider.focus();
    // From default 10 to 18 = 8 increments
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowRight');
    }

    // 3. Disable speaker notes
    const notesCheckbox = page.locator('input[type="checkbox"]#includeNotes');
    await notesCheckbox.click();

    // Submit form
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page);

    // Should return to root view
    await inspectorPage.expectView('root');
  });
});

test.describe('Create Enrichment - Error Handling', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);
  });

  test('should display error message on API failure', async ({ page }) => {
    // Mock API with error response
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { data: [] } }),
      });
    });

    await page.route('**/api/trpc/enrichment.create*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Failed to create enrichment' },
        }),
      });
    });

    // Navigate to lesson
    await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, TEST_LESSON_ID);

    // Open quiz create view
    await inspectorPage.openCreateView('quiz');

    // Submit form (which will fail)
    await inspectorPage.submitCreateForm();

    // Wait for error to appear
    await waitForAnimation(page);

    // Verify error alert is displayed
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible();

    // Verify we stay on create view (not navigated away)
    await inspectorPage.expectView('create');
  });

  test('should dismiss error message', async ({ page }) => {
    // Mock API with error
    await page.route('**/api/trpc/enrichment.list*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { data: [] } }),
      });
    });

    await page.route('**/api/trpc/enrichment.create*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Test error' },
        }),
      });
    });

    // Navigate and open quiz form
    await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, TEST_LESSON_ID);
    await inspectorPage.openCreateView('quiz');

    // Submit to trigger error
    await inspectorPage.submitCreateForm();
    await waitForAnimation(page);

    // Verify error is visible
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible();

    // Click dismiss button (X button in alert)
    const dismissButton = errorAlert.locator('button');
    await dismissButton.click();

    // Verify error is dismissed
    await expect(errorAlert).not.toBeVisible();
  });
});

test.describe('Create Enrichment - Form Validation', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);
    await mockEnrichmentApi(page, TEST_LESSON_ID);
    await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, TEST_LESSON_ID);
  });

  test('should disable submit button while submitting', async ({ page }) => {
    // Mock slow API response
    await page.route('**/api/trpc/enrichment.create*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { data: { id: 'new-id', status: 'pending' } } }),
      });
    });

    // Open quiz form
    await inspectorPage.openCreateView('quiz');

    // Click submit
    await inspectorPage.submitButton.click();

    // Verify button shows loading state (has spinner)
    const spinner = inspectorPage.submitButton.locator('.animate-spin');
    await expect(spinner).toBeVisible();

    // Verify button is disabled during submission
    await expect(inspectorPage.submitButton).toBeDisabled();
  });
});

test.describe('Create Enrichment - Discovery Cards', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);
    await mockEnrichmentApi(page, TEST_LESSON_ID);
    await inspectorPage.navigateToLesson(TEST_COURSE_SLUG, TEST_LESSON_ID);
  });

  test('should display all discovery cards in empty state', async ({ page }) => {
    // Verify empty state with discovery cards
    await inspectorPage.expectEmptyState();

    // Verify all four discovery cards are visible
    await expect(inspectorPage.videoCard).toBeVisible();
    await expect(inspectorPage.quizCard).toBeVisible();
    await expect(inspectorPage.audioCard).toBeVisible();
    await expect(inspectorPage.presentationCard).toBeVisible();
  });

  test('should open correct form when clicking each discovery card', async ({ page }) => {
    // Test Video card
    await inspectorPage.videoCard.click();
    await inspectorPage.expectView('create');
    await expect(page.getByText(/voice|голос/i)).toBeVisible();
    await inspectorPage.goBack();

    // Test Quiz card
    await inspectorPage.quizCard.click();
    await inspectorPage.expectView('create');
    await expect(page.getByText(/question count|количество вопросов/i)).toBeVisible();
    await inspectorPage.goBack();

    // Test Audio card
    await inspectorPage.audioCard.click();
    await inspectorPage.expectView('create');
    await expect(page.getByText(/voice|голос/i)).toBeVisible();
    await inspectorPage.goBack();

    // Test Presentation card
    await inspectorPage.presentationCard.click();
    await inspectorPage.expectView('create');
    await expect(page.getByText(/theme|тема/i)).toBeVisible();
  });
});
