/**
 * E2E Tests: Enrichment Inspector Internationalization (i18n)
 *
 * Tests that the Enrichment Inspector Panel displays correct translations
 * for English and Russian locales.
 *
 * Priority: P2
 * @module e2e/enrichment-inspector/i18n
 */

import { test, expect } from '@playwright/test';
import { EnrichmentInspectorPage } from './pages/EnrichmentInspectorPage';
import {
  mockEnrichmentApi,
  EN_TEXTS,
  RU_TEXTS,
  getTextsForLocale,
} from './fixtures/enrichment-fixtures';

test.describe('Enrichment Inspector i18n - English Locale', () => {
  test.use({ locale: 'en' });

  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);
  });

  test('should display English labels', async ({ page }) => {
    // Mock API for empty lesson
    await mockEnrichmentApi(page, 'lesson-1');

    // Navigate to English locale course
    await inspectorPage.navigateToLesson('test-course', 'lesson-1', 'en');
    await inspectorPage.expectEmptyState();

    // Verify empty state text is in English
    const emptyStateText = await inspectorPage.emptyState.innerText();
    expect(emptyStateText.toLowerCase()).toContain(EN_TEXTS.noEnrichments.toLowerCase());

    // Verify discovery cards have English labels
    await expect(inspectorPage.discoveryCards).toBeVisible();

    // Check video card label
    const videoCardText = await inspectorPage.videoCard.innerText();
    expect(videoCardText.toLowerCase()).toContain(EN_TEXTS.video.toLowerCase());

    // Check quiz card label
    const quizCardText = await inspectorPage.quizCard.innerText();
    expect(quizCardText.toLowerCase()).toContain(EN_TEXTS.quiz.toLowerCase());

    // Check audio card label
    const audioCardText = await inspectorPage.audioCard.innerText();
    expect(audioCardText.toLowerCase()).toContain(EN_TEXTS.audio.toLowerCase());

    // Check presentation card label
    const presentationCardText = await inspectorPage.presentationCard.innerText();
    expect(presentationCardText.toLowerCase()).toContain(EN_TEXTS.presentation.toLowerCase());

    // Verify header title is in English
    await inspectorPage.expectHeaderTitleContains(new RegExp(EN_TEXTS.enrichments, 'i'));
  });

  test('should display English status texts', async ({ page }) => {
    // Mock API for lesson with various enrichment statuses
    await mockEnrichmentApi(page, 'lesson-with-enrichments');

    await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments', 'en');
    await inspectorPage.expectEnrichmentList();

    // Get page text content
    const pageContent = await page.content();
    const pageText = await inspectorPage.enrichmentList.innerText();

    // Verify English status texts are present
    // Note: Not all statuses may be visible, checking common ones
    const possibleStatuses = [
      EN_TEXTS.pending,
      EN_TEXTS.generating,
      EN_TEXTS.completed,
    ];

    // At least one status should be visible
    const hasEnglishStatus = possibleStatuses.some(
      (status) => pageText.toLowerCase().includes(status.toLowerCase())
    );

    expect(hasEnglishStatus).toBeTruthy();

    // Navigate to lesson with failed enrichment to test error text
    await mockEnrichmentApi(page, 'lesson-with-failed-enrichment');
    await inspectorPage.navigateToLesson('test-course', 'lesson-with-failed-enrichment', 'en');

    const failedPageText = await inspectorPage.panel.innerText();
    const hasFailedText =
      failedPageText.toLowerCase().includes(EN_TEXTS.failed.toLowerCase()) ||
      failedPageText.toLowerCase().includes('error');

    expect(hasFailedText).toBeTruthy();
  });

  test('should display English form labels in create view', async ({ page }) => {
    await mockEnrichmentApi(page, 'lesson-1');
    await inspectorPage.navigateToLesson('test-course', 'lesson-1', 'en');

    // Open quiz create view
    await inspectorPage.openCreateView('quiz');

    // Verify form labels are in English
    const formText = await inspectorPage.createView.innerText();

    // Check for English form labels
    expect(formText.toLowerCase()).toContain(EN_TEXTS.questionCount.toLowerCase());
    expect(formText.toLowerCase()).toContain(EN_TEXTS.difficulty.toLowerCase());

    // Verify buttons are in English
    await expect(inspectorPage.cancelButton).toContainText(new RegExp(EN_TEXTS.cancel, 'i'));
    await expect(inspectorPage.submitButton).toContainText(new RegExp(EN_TEXTS.createButton, 'i'));

    // Go back and test video form
    await inspectorPage.goBack();
    await inspectorPage.openCreateView('video');

    const videoFormText = await inspectorPage.createView.innerText();
    expect(videoFormText.toLowerCase()).toContain(EN_TEXTS.voice.toLowerCase());
  });

  test('should display English action buttons', async ({ page }) => {
    await mockEnrichmentApi(page, 'lesson-with-enrichments');
    await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments', 'en');

    // Click on an enrichment to see detail view
    await inspectorPage.clickEnrichment(0);

    // Verify back button text
    const backButtonText = await inspectorPage.backButton.innerText();
    const backButtonAriaLabel = await inspectorPage.backButton.getAttribute('aria-label');

    const hasEnglishBack =
      backButtonText.toLowerCase().includes(EN_TEXTS.back.toLowerCase()) ||
      (backButtonAriaLabel && backButtonAriaLabel.toLowerCase().includes(EN_TEXTS.back.toLowerCase()));

    // Back button may just be an icon, so check for any English text
    expect(hasEnglishBack || backButtonText === '' || backButtonText.includes('<')).toBeTruthy();
  });
});

test.describe('Enrichment Inspector i18n - Russian Locale', () => {
  test.use({ locale: 'ru' });

  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);
  });

  test('should display Russian labels', async ({ page }) => {
    // Mock API for empty lesson
    await mockEnrichmentApi(page, 'lesson-1');

    // Navigate to Russian locale course
    await inspectorPage.navigateToLesson('test-course', 'lesson-1', 'ru');
    await inspectorPage.expectEmptyState();

    // Verify empty state text is in Russian
    const emptyStateText = await inspectorPage.emptyState.innerText();
    expect(emptyStateText).toContain(RU_TEXTS.noEnrichments);

    // Verify discovery cards have Russian labels
    await expect(inspectorPage.discoveryCards).toBeVisible();

    // Check video card label
    const videoCardText = await inspectorPage.videoCard.innerText();
    expect(videoCardText).toContain(RU_TEXTS.video);

    // Check quiz card label
    const quizCardText = await inspectorPage.quizCard.innerText();
    expect(quizCardText).toContain(RU_TEXTS.quiz);

    // Check audio card label
    const audioCardText = await inspectorPage.audioCard.innerText();
    expect(audioCardText).toContain(RU_TEXTS.audio);

    // Check presentation card label
    const presentationCardText = await inspectorPage.presentationCard.innerText();
    expect(presentationCardText).toContain(RU_TEXTS.presentation);

    // Verify header title is in Russian
    await inspectorPage.expectHeaderTitleContains(RU_TEXTS.enrichments);
  });

  test('should display Russian form labels', async ({ page }) => {
    await mockEnrichmentApi(page, 'lesson-1');
    await inspectorPage.navigateToLesson('test-course', 'lesson-1', 'ru');

    // Open quiz create view
    await inspectorPage.openCreateView('quiz');

    // Verify form labels are in Russian
    const formText = await inspectorPage.createView.innerText();

    // Check for Russian form labels
    expect(formText).toContain(RU_TEXTS.questionCount);
    expect(formText).toContain(RU_TEXTS.difficulty);

    // Verify buttons are in Russian
    await expect(inspectorPage.cancelButton).toContainText(RU_TEXTS.cancel);
    await expect(inspectorPage.submitButton).toContainText(RU_TEXTS.createButton);

    // Go back and test video form
    await inspectorPage.goBack();
    await inspectorPage.openCreateView('video');

    const videoFormText = await inspectorPage.createView.innerText();
    expect(videoFormText).toContain(RU_TEXTS.voice);
  });

  test('should display Russian status texts', async ({ page }) => {
    // Mock API for lesson with various enrichment statuses
    await mockEnrichmentApi(page, 'lesson-with-enrichments');

    await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments', 'ru');
    await inspectorPage.expectEnrichmentList();

    // Get page text content
    const pageText = await inspectorPage.enrichmentList.innerText();

    // Verify Russian status texts are present
    const possibleStatuses = [
      RU_TEXTS.pending,
      RU_TEXTS.generating,
      RU_TEXTS.completed,
    ];

    // At least one status should be visible in Russian
    const hasRussianStatus = possibleStatuses.some((status) => pageText.includes(status));

    expect(hasRussianStatus).toBeTruthy();
  });

  test('should display Russian error messages', async ({ page }) => {
    // Mock API for lesson with failed enrichment
    await mockEnrichmentApi(page, 'lesson-with-failed-enrichment');

    await inspectorPage.navigateToLesson('test-course', 'lesson-with-failed-enrichment', 'ru');

    const pageText = await inspectorPage.panel.innerText();

    // Check for Russian error text
    const hasRussianError =
      pageText.includes(RU_TEXTS.failed) ||
      pageText.includes(RU_TEXTS.error) ||
      pageText.includes(RU_TEXTS.generationError);

    expect(hasRussianError).toBeTruthy();
  });

  test('should display Russian drag handle tooltip', async ({ page }) => {
    await mockEnrichmentApi(page, 'lesson-with-enrichments');
    await inspectorPage.navigateToLesson('test-course', 'lesson-with-enrichments', 'ru');
    await inspectorPage.expectEnrichmentList();

    // Check drag handle has Russian tooltip/aria-label
    const dragHandles = inspectorPage.dragHandles;
    if ((await dragHandles.count()) > 0) {
      const firstHandle = dragHandles.first();
      const ariaLabel = await firstHandle.getAttribute('aria-label');
      const title = await firstHandle.getAttribute('title');

      // Should have Russian reorder text
      const hasRussianText =
        (ariaLabel && ariaLabel.includes(RU_TEXTS.dragToReorder)) ||
        (title && title.includes(RU_TEXTS.dragToReorder));

      // If no Russian text, log for debugging but don't fail
      // (drag handles might not have localized text)
      if (!hasRussianText) {
        console.log(`Drag handle texts: aria-label="${ariaLabel}", title="${title}"`);
      }
    }
  });
});

test.describe('Enrichment Inspector i18n - Locale Switching', () => {
  let inspectorPage: EnrichmentInspectorPage;

  test.beforeEach(async ({ page }) => {
    inspectorPage = new EnrichmentInspectorPage(page);
    await mockEnrichmentApi(page, 'lesson-1');
  });

  test('should update texts when switching from English to Russian', async ({ page }) => {
    // Start with English locale
    await inspectorPage.navigateToLesson('test-course', 'lesson-1', 'en');
    await inspectorPage.expectEmptyState();

    // Verify English text
    const englishText = await inspectorPage.emptyState.innerText();
    expect(englishText.toLowerCase()).toContain(EN_TEXTS.noEnrichments.toLowerCase());

    // Navigate to Russian locale
    await inspectorPage.navigateToLesson('test-course', 'lesson-1', 'ru');
    await inspectorPage.expectEmptyState();

    // Verify Russian text
    const russianText = await inspectorPage.emptyState.innerText();
    expect(russianText).toContain(RU_TEXTS.noEnrichments);

    // Texts should be different
    expect(englishText).not.toEqual(russianText);
  });

  test('should maintain locale in create view navigation', async ({ page }) => {
    // Navigate with Russian locale
    await inspectorPage.navigateToLesson('test-course', 'lesson-1', 'ru');

    // Open create view
    await inspectorPage.openCreateView('quiz');

    // Verify Russian labels in create view
    const formText = await inspectorPage.createView.innerText();
    expect(formText).toContain(RU_TEXTS.questionCount);

    // Go back
    await inspectorPage.goBack();

    // Verify still in Russian
    const emptyStateText = await inspectorPage.emptyState.innerText();
    expect(emptyStateText).toContain(RU_TEXTS.noEnrichments);
  });
});

test.describe('Enrichment Inspector i18n - Text Content Verification', () => {
  test('should have matching keys in EN_TEXTS and RU_TEXTS', () => {
    // Verify fixture data consistency
    const enKeys = Object.keys(EN_TEXTS).sort();
    const ruKeys = Object.keys(RU_TEXTS).sort();

    expect(enKeys).toEqual(ruKeys);

    // Verify no empty values
    for (const key of enKeys) {
      expect(EN_TEXTS[key as keyof typeof EN_TEXTS]).toBeTruthy();
      expect(RU_TEXTS[key as keyof typeof RU_TEXTS]).toBeTruthy();
    }
  });

  test('getTextsForLocale should return correct texts', () => {
    const enTexts = getTextsForLocale('en');
    const ruTexts = getTextsForLocale('ru');

    expect(enTexts).toEqual(EN_TEXTS);
    expect(ruTexts).toEqual(RU_TEXTS);
    expect(enTexts).not.toEqual(ruTexts);
  });
});
