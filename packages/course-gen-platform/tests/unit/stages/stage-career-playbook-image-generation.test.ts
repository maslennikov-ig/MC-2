import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobType, type CareerPlaybookGenerateImageJobData } from '@megacampus/shared-types';
import type { CareerPlaybookRow } from '../../../src/server/routers/career-playbook/service-mappers';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  renderPrompt: vi.fn(),
  generateCardImage: vi.fn(),
  base64ToBuffer: vi.fn(),
  convertToWebP: vi.fn(),
  uploadCareerPlaybookCard: vi.fn(),
  buildPublicUrl: vi.fn(),
}));

vi.mock('../../../src/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mocks.from,
  })),
}));

vi.mock('../../../src/shared/prompts/prompt-service', () => ({
  createPromptService: vi.fn(() => ({
    renderPrompt: mocks.renderPrompt,
  })),
}));

vi.mock('../../../src/stages/stage7-enrichments/services/image-generation-service', () => ({
  generateCardImage: mocks.generateCardImage,
  base64ToBuffer: mocks.base64ToBuffer,
  convertToWebP: mocks.convertToWebP,
}));

vi.mock('../../../src/stages/stage7-enrichments/services/unified-storage-service', () => ({
  uploadCareerPlaybookCard: mocks.uploadCareerPlaybookCard,
  buildPublicUrl: mocks.buildPublicUrl,
}));

const { generateCareerPlaybookImage } = await import(
  '../../../src/stages/stage-career-playbook/image-generation'
);

const playbookId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const organizationId = '00000000-0000-4000-8000-000000000003';

const baseRow: CareerPlaybookRow = {
  id: playbookId,
  user_id: userId,
  organization_id: organizationId,
  status: 'completed',
  language: 'en',
  slug: null,
  position_title: 'Head of Sales',
  department: 'sales',
  specialization: null,
  level: 'lead',
  q_a_data: {
    fixed: [],
    followups: [],
    freeform: [],
    business_context: {
      mode: 'universal',
      status: 'skipped',
      digest: null,
      source_ids: [],
    },
  },
  role_profile_spec: null,
  generated_blocks: {},
  final_markdown: '# Head of Sales',
  web_research: null,
  cost_breakdown: null,
  image_status: null,
  image_content: null,
  image_metadata: null,
  image_generation_attempt: 0,
  image_error_message: null,
  image_updated_at: null,
  share_slug: null,
  is_public: false,
  visibility: 'private',
  created_at: '2026-06-26T10:00:00.000Z',
  updated_at: '2026-06-26T10:00:00.000Z',
  completed_at: '2026-06-26T10:05:00.000Z',
};

function imageJobData(): CareerPlaybookGenerateImageJobData {
  return {
    jobType: JobType.CAREER_PLAYBOOK,
    operation: 'GENERATE_IMAGE',
    playbookId,
    userId,
    organizationId,
    language: 'en',
    locale: 'en',
    createdAt: '2026-06-26T10:10:00.000Z',
    force: false,
  };
}

function createBuilder(singleResults: Array<{ data: unknown; error: unknown }>) {
  const updateSpy = vi.fn();
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    update: vi.fn((values: unknown) => {
      updateSpy(values);
      return builder;
    }),
    single: vi.fn(() =>
      Promise.resolve(singleResults.shift() ?? { data: { id: playbookId }, error: null })
    ),
  };

  return { builder, updateSpy };
}

describe('Career Playbook image generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.renderPrompt.mockResolvedValue('rendered image prompt');
    mocks.generateCardImage.mockResolvedValue({
      base64Data: 'base64-image',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      costUsd: 0.007,
      modelUsed: 'openai/gpt-5-image-mini',
    });
    mocks.base64ToBuffer.mockReturnValue(Buffer.from('png'));
    mocks.convertToWebP.mockResolvedValue({
      buffer: Buffer.from('webp'),
      mimeType: 'image/webp',
      sizeBytes: 1234,
      originalSizeBytes: 2345,
      compressionRatio: 0.53,
    });
    mocks.uploadCareerPlaybookCard.mockResolvedValue(`career-playbooks/${playbookId}/card.webp`);
    mocks.buildPublicUrl.mockReturnValue('https://cdn.example.test/career-playbooks/card.webp');
  });

  it('writes completed image content and metadata on success', async () => {
    const { builder, updateSpy } = createBuilder([{ data: baseRow, error: null }]);
    mocks.from.mockReturnValue(builder);

    const result = await generateCareerPlaybookImage(imageJobData());

    expect(result.imageUrl).toBe('https://cdn.example.test/career-playbooks/card.webp');
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        image_status: 'generating',
        image_generation_attempt: 1,
      })
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        image_status: 'completed',
        image_content: expect.objectContaining({
          type: 'card',
          imageUrl: 'https://cdn.example.test/career-playbooks/card.webp',
          format: 'webp',
        }),
        image_metadata: expect.objectContaining({
          estimated_cost_usd: 0.007,
          model_used: 'openai/gpt-5-image-mini',
        }),
      })
    );
  });

  it('writes failed image status without changing completed playbook status on generation errors', async () => {
    const { builder, updateSpy } = createBuilder([{ data: baseRow, error: null }]);
    mocks.from.mockReturnValue(builder);
    mocks.generateCardImage.mockRejectedValue(new Error('image provider unavailable'));

    await expect(generateCareerPlaybookImage(imageJobData())).rejects.toThrow(
      'image provider unavailable'
    );

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ image_status: 'generating' }));
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        image_status: 'failed',
        image_error_message: 'image provider unavailable',
      })
    );
    expect(updateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});
