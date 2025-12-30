/**
 * Page Object Model for Enrichment Inspector Panel
 *
 * Provides methods and locators for E2E testing of the Stage 7
 * Enrichment Inspector functionality.
 *
 * @module e2e/enrichment-inspector/pages/EnrichmentInspectorPage
 */

import { Page, Locator, expect } from '@playwright/test';

export class EnrichmentInspectorPage {
  readonly page: Page;

  // Main panel selectors
  readonly panel: Locator;
  readonly header: Locator;
  readonly backButton: Locator;
  readonly headerTitle: Locator;

  // Root view selectors
  readonly enrichmentList: Locator;
  readonly emptyState: Locator;
  readonly discoveryCards: Locator;

  // Discovery cards (empty state)
  readonly videoCard: Locator;
  readonly quizCard: Locator;
  readonly audioCard: Locator;
  readonly presentationCard: Locator;

  // List item selectors
  readonly listItems: Locator;
  readonly dragHandles: Locator;

  // Create view selectors
  readonly createView: Locator;
  readonly createForm: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  // Detail view selectors
  readonly detailView: Locator;
  readonly previewContent: Locator;

  // Progress indicators
  readonly loadingSpinner: Locator;
  readonly progressBar: Locator;
  readonly generationLog: Locator;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators using test IDs (most reliable)
    this.panel = page.locator('[data-testid="enrichment-inspector-panel"]');
    this.header = page.locator('[data-testid="inspector-header"]');
    this.backButton = page.locator('[data-testid="back-button"]');
    this.headerTitle = page.locator('[data-testid="header-title"]');

    this.enrichmentList = page.locator('[data-testid="enrichment-list"]');
    this.emptyState = page.locator('[data-testid="empty-state"]');
    this.discoveryCards = page.locator('[data-testid="discovery-cards"]');

    // Discovery cards by type
    this.videoCard = page.locator('[data-testid="discovery-card-video"]');
    this.quizCard = page.locator('[data-testid="discovery-card-quiz"]');
    this.audioCard = page.locator('[data-testid="discovery-card-audio"]');
    this.presentationCard = page.locator('[data-testid="discovery-card-presentation"]');

    this.listItems = page.locator('[data-testid="enrichment-list-item"]');
    this.dragHandles = page.locator('[data-testid="drag-handle"]');

    this.createView = page.locator('[data-testid="create-view"]');
    this.createForm = page.locator('form');
    this.submitButton = page.getByRole('button', { name: /create|создать/i });
    this.cancelButton = page.getByRole('button', { name: /cancel|отмена/i });

    this.detailView = page.locator('[data-testid="detail-view"]');
    this.previewContent = page.locator('[data-testid="preview-content"]');

    this.loadingSpinner = page.locator('.animate-spin');
    this.progressBar = page.locator('[data-testid="progress-bar"]');
    this.generationLog = page.locator('[data-testid="generation-log"]');
  }

  /**
   * Navigate to a course generation page
   */
  async navigateToCourse(courseSlug: string, locale: string = 'en') {
    await this.page.goto(`/${locale}/courses/generating/${courseSlug}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click a lesson node to open the inspector
   */
  async clickLessonNode(lessonId: string) {
    await this.page.click(`[data-node-id="${lessonId}"]`);
    await expect(this.panel).toBeVisible();
  }

  /**
   * Navigate to a lesson and open inspector
   */
  async navigateToLesson(courseSlug: string, lessonId: string, locale: string = 'en') {
    await this.navigateToCourse(courseSlug, locale);
    await this.clickLessonNode(lessonId);
  }

  /**
   * Go back in navigation history
   */
  async goBack() {
    await this.backButton.click();
  }

  /**
   * Open create view for a specific enrichment type
   */
  async openCreateView(type: 'video' | 'quiz' | 'audio' | 'presentation') {
    const card = {
      video: this.videoCard,
      quiz: this.quizCard,
      audio: this.audioCard,
      presentation: this.presentationCard,
    }[type];
    await card.click();
    await expect(this.createView).toBeVisible();
  }

  /**
   * Fill quiz form with settings
   */
  async fillQuizForm(options: { questionCount?: number; difficulty?: string }) {
    if (options.questionCount !== undefined) {
      // Slider interaction
      const slider = this.page.locator('[role="slider"]').first();
      await slider.click();
      // Set value via keyboard
      for (let i = 5; i < options.questionCount; i++) {
        await this.page.keyboard.press('ArrowRight');
      }
      for (let i = 5; i > options.questionCount; i--) {
        await this.page.keyboard.press('ArrowLeft');
      }
    }
    if (options.difficulty) {
      await this.page.getByRole('combobox').first().click();
      await this.page.getByRole('option', { name: new RegExp(options.difficulty, 'i') }).click();
    }
  }

  /**
   * Fill video form with settings
   */
  async fillVideoForm(options: { voice?: string; speed?: number }) {
    if (options.voice) {
      await this.page.getByRole('combobox').first().click();
      await this.page.getByRole('option', { name: new RegExp(options.voice, 'i') }).click();
    }
    if (options.speed !== undefined) {
      const slider = this.page.locator('[role="slider"]').first();
      await slider.click();
    }
  }

  /**
   * Submit the create form
   */
  async submitCreateForm() {
    await this.submitButton.click();
  }

  /**
   * Cancel the create form
   */
  async cancelCreateForm() {
    await this.cancelButton.click();
  }

  /**
   * Get enrichment count in list
   */
  async getEnrichmentCount(): Promise<number> {
    return await this.listItems.count();
  }

  /**
   * Click an enrichment item by index
   */
  async clickEnrichment(index: number) {
    await this.listItems.nth(index).click();
  }

  /**
   * Click an enrichment item by ID
   */
  async clickEnrichmentById(enrichmentId: string) {
    await this.page.click(`[data-enrichment-id="${enrichmentId}"]`);
  }

  /**
   * Drag an enrichment from one position to another
   */
  async dragEnrichment(fromIndex: number, toIndex: number) {
    const source = this.dragHandles.nth(fromIndex);
    const target = this.listItems.nth(toIndex);
    await source.dragTo(target);
  }

  /**
   * Get enrichment type by index
   */
  async getEnrichmentType(index: number): Promise<string | null> {
    return await this.listItems.nth(index).getAttribute('data-enrichment-type');
  }

  /**
   * Get enrichment status by index
   */
  async getEnrichmentStatus(index: number): Promise<string | null> {
    return await this.listItems.nth(index).getAttribute('data-enrichment-status');
  }

  /**
   * Get all enrichment IDs in order
   */
  async getEnrichmentOrder(): Promise<string[]> {
    const items = await this.listItems.all();
    const ids: string[] = [];
    for (const item of items) {
      const id = await item.getAttribute('data-enrichment-id');
      if (id) ids.push(id);
    }
    return ids;
  }

  // Assertion helpers

  /**
   * Assert empty state is visible
   */
  async expectEmptyState() {
    await expect(this.emptyState).toBeVisible();
  }

  /**
   * Assert enrichment list is visible
   */
  async expectEnrichmentList() {
    await expect(this.enrichmentList).toBeVisible();
  }

  /**
   * Assert specific view is active
   */
  async expectView(view: 'root' | 'create' | 'detail') {
    switch (view) {
      case 'root':
        await expect(this.emptyState.or(this.enrichmentList)).toBeVisible();
        break;
      case 'create':
        await expect(this.createView).toBeVisible();
        break;
      case 'detail':
        await expect(this.detailView).toBeVisible();
        break;
    }
  }

  /**
   * Assert loading state
   */
  async expectLoadingState() {
    await expect(this.loadingSpinner).toBeVisible();
  }

  /**
   * Assert progress bar with optional value
   */
  async expectProgressBar(progress?: number) {
    await expect(this.progressBar).toBeVisible();
    if (progress !== undefined) {
      await expect(this.progressBar).toHaveAttribute('aria-valuenow', String(progress));
    }
  }

  /**
   * Assert back button visibility
   */
  async expectBackButtonVisible(visible: boolean = true) {
    if (visible) {
      await expect(this.backButton).toBeVisible();
    } else {
      await expect(this.backButton).not.toBeVisible();
    }
  }

  /**
   * Assert header title contains text
   */
  async expectHeaderTitleContains(text: string | RegExp) {
    await expect(this.headerTitle).toContainText(text);
  }

  /**
   * Assert panel is visible
   */
  async expectPanelVisible() {
    await expect(this.panel).toBeVisible();
  }

  /**
   * Assert panel is not visible
   */
  async expectPanelNotVisible() {
    await expect(this.panel).not.toBeVisible();
  }
}
