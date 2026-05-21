import { describe, expect, it, vi } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';

import {
  buildCareerPlaybookCleanupManifest,
  buildCareerPlaybookLiveSmokePlan,
  runCareerPlaybookLiveSmoke,
  type CareerPlaybookLiveSmokeClient,
} from '@/smoke/career-playbook-live-smoke';
import { validateCareerPlaybookSmokeEvidence } from '@/smoke/career-playbook-validation';

function generatedBlock(content: string): CareerPlaybookBlockState {
  return {
    content,
    status: 'generated',
    attempt: 1,
    generated_at: '2026-05-21T00:00:00.000Z',
  };
}

function buildCompleteBlocks(): Record<CareerPlaybookBlockId, CareerPlaybookBlockState> {
  const blocks = Object.fromEntries(
    [
      'header',
      ...Array.from({ length: 26 }, (_, index) => `block_${index + 1}`),
    ].map(blockId => [
      blockId,
      generatedBlock(`## ${blockId}\n\nUseful smoke evidence for ${blockId}.`),
    ])
  ) as Record<CareerPlaybookBlockId, CareerPlaybookBlockState>;

  blocks.block_2 = generatedBlock(`## 2. Anti-goals

| Anti-goal | Owner |
| --- | --- |
| No enterprise discounting | Sales Ops |
| No product roadmap ownership | Product |
| No customer success handoff gaps | CS |
| No unsupported legal promises | Legal |`);

  blocks.block_5 = generatedBlock(`## 5. Decision Matrix

| Decision | Autonomy | Action |
| --- | --- | --- |
| Prioritize account tier | Own | Decide |
| Escalate deal risk | Consult | Align |
| Approve custom terms | Recommend | Escalate |
| Change territory focus | Consult | Propose |`);

  blocks.block_10 = generatedBlock(`## 10. Dependencies

\`\`\`mermaid
flowchart LR
  Sales --> Product
\`\`\``);

  blocks.block_11 = generatedBlock(`## 11. Career Path

\`\`\`mermaid
flowchart LR
  SDR --> AE --> Lead
\`\`\``);

  blocks.block_16 = generatedBlock(`## 16. Main Process

\`\`\`mermaid
flowchart TD
  Qualify --> Close
\`\`\``);

  blocks.block_21 = generatedBlock(`## 21. Failure Modes

- Pipeline quality collapses.
- Forecast hygiene drifts.
- Handoff quality drops.`);

  return blocks;
}

function buildLiveSmokeClient(
  overrides: Partial<CareerPlaybookLiveSmokeClient> = {}
): CareerPlaybookLiveSmokeClient {
  return {
    startSession: vi.fn().mockResolvedValue({
      playbookId: '33333333-3333-3333-3333-333333333333',
      status: 'answering_fixed',
    }),
    submitAnswer: vi.fn().mockResolvedValue({ ok: true }),
    requestFollowups: vi.fn().mockResolvedValue({
      questions: [],
      completeness_score: 0.85,
      stop_recommendation: 'ready_to_generate',
    }),
    approveAndGenerate: vi.fn().mockResolvedValue({
      playbookId: '33333333-3333-3333-3333-333333333333',
      status: 'generating',
    }),
    getStatus: vi.fn().mockResolvedValue({
      playbookId: '33333333-3333-3333-3333-333333333333',
      status: 'completed',
      progress: 100,
    }),
    getLibraryDetail: vi.fn().mockResolvedValue({
      id: '33333333-3333-3333-3333-333333333333',
      status: 'completed',
      finalMarkdown: '## final\n\n```mermaid\nflowchart LR\nA-->B\n```',
      generatedBlocks: buildCompleteBlocks(),
      completedAt: '2026-05-21T00:00:00.000Z',
    }),
    exportPdf: vi.fn().mockResolvedValue({
      pdfBase64: Buffer.from('%PDF smoke').toString('base64'),
      contentType: 'application/pdf',
      sizeBytes: 1024,
    }),
    toggleShare: vi.fn().mockResolvedValue({
      shareSlug: 'cp-live-smoke',
      isPublic: true,
    }),
    getPublicShare: vi.fn().mockResolvedValue({ ok: true }),
    createCourseFromPlaybook: vi.fn().mockResolvedValue({
      courseId: '44444444-4444-4444-4444-444444444444',
      redirectUrl: '/courses/demo/sales-manager-b2b/generating',
      sourceDocumentIds: ['55555555-5555-5555-5555-555555555555'],
    }),
    ...overrides,
  };
}

describe('Career Playbook live smoke gates', () => {
  it('keeps plan mode non-mutating and reports missing live-smoke gates', async () => {
    const client = {
      startSession: vi.fn(),
      submitAnswer: vi.fn(),
      requestFollowups: vi.fn(),
      approveAndGenerate: vi.fn(),
      getStatus: vi.fn(),
      getLibraryDetail: vi.fn(),
      exportPdf: vi.fn(),
      toggleShare: vi.fn(),
      getPublicShare: vi.fn(),
      createCourseFromPlaybook: vi.fn(),
    };

    const report = await runCareerPlaybookLiveSmoke(
      {
        mode: 'plan',
        targetEnvironment: 'staging',
        env: {
          NODE_ENV: 'production',
          BULLMQ_QUEUE_NAME: 'career-playbook-smoke-20260521',
        },
      },
      { client }
    );

    expect(report.status).toBe('blocked');
    expect(report.mutates).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'mode',
        status: 'skipped',
        mutates: false,
      })
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'auth-token',
        status: 'blocked',
      })
    );
    expect(client.startSession).not.toHaveBeenCalled();
    expect(client.approveAndGenerate).not.toHaveBeenCalled();
  });

  it('blocks staging mutation smoke without token, expected fixture IDs, cleanup scope, and budget', () => {
    const plan = buildCareerPlaybookLiveSmokePlan({
      mode: 'mutation-smoke',
      targetEnvironment: 'staging',
      env: {
        NODE_ENV: 'production',
        BULLMQ_QUEUE_NAME: 'career-playbook-smoke-20260521',
      },
      confirmLiveMutation: true,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'auth-token', status: 'blocked' }),
        expect.objectContaining({ id: 'expected-user-id', status: 'blocked' }),
        expect.objectContaining({ id: 'expected-organization-id', status: 'blocked' }),
        expect.objectContaining({ id: 'cleanup-scope', status: 'blocked' }),
        expect.objectContaining({ id: 'max-cost-usd', status: 'blocked' }),
      ])
    );
  });

  it('rejects the shared default queue in staging mutation mode', () => {
    const plan = buildCareerPlaybookLiveSmokePlan({
      mode: 'mutation-smoke',
      targetEnvironment: 'staging',
      token: 'token-value',
      expectedUserId: '11111111-1111-1111-1111-111111111111',
      expectedOrganizationId: '22222222-2222-2222-2222-222222222222',
      cleanupScope: 'playbook-and-course',
      maxCostUsd: 3,
      confirmLiveMutation: true,
      env: {
        NODE_ENV: 'production',
        BULLMQ_QUEUE_NAME: 'course-generation',
      },
    });

    expect(plan.status).toBe('blocked');
    expect(plan.checks).toContainEqual(
      expect.objectContaining({
        id: 'dedicated-queue',
        status: 'blocked',
        note: expect.stringContaining('dedicated non-default'),
      })
    );
  });
});

describe('Career Playbook live smoke mutation report', () => {
  it('keeps course bridge optional while recording exact fixture cleanup IDs from env', async () => {
    const report = await runCareerPlaybookLiveSmoke(
      {
        mode: 'mutation-smoke',
        targetEnvironment: 'staging',
        trpcUrl: 'https://staging.example.test/trpc',
        cleanupScope: 'playbook-only',
        maxCostUsd: 3,
        confirmLiveMutation: true,
        env: {
          TOKEN: 'secret-token',
          BULLMQ_QUEUE_NAME: 'career-playbook-smoke-20260521',
          CAREER_PLAYBOOK_SMOKE_USER_ID: '11111111-1111-1111-1111-111111111111',
          CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID: '22222222-2222-2222-2222-222222222222',
        },
      },
      { client: buildLiveSmokeClient() }
    );

    expect(report.status).toBe('pass');
    expect(report.evidence?.status).toBe('pass');
    expect(report.evidence?.checks).toContainEqual(
      expect.objectContaining({ id: 'course-bridge', status: 'skipped' })
    );
    expect(report.cleanupManifest?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'auth_user', id: '11111111-1111-1111-1111-111111111111' }),
        expect.objectContaining({
          type: 'organization',
          id: '22222222-2222-2222-2222-222222222222',
        }),
      ])
    );
  });

  it('fails the live smoke report when collected PDF evidence is invalid', async () => {
    const client = buildLiveSmokeClient({
      exportPdf: vi.fn().mockResolvedValue({
        pdfBase64: Buffer.from('not a pdf').toString('base64'),
        contentType: 'application/pdf',
        sizeBytes: 1024,
      }),
    });

    const report = await runCareerPlaybookLiveSmoke(
      {
        mode: 'mutation-smoke',
        targetEnvironment: 'staging',
        trpcUrl: 'https://staging.example.test/trpc',
        expectedUserId: '11111111-1111-1111-1111-111111111111',
        expectedOrganizationId: '22222222-2222-2222-2222-222222222222',
        cleanupScope: 'playbook-only',
        maxCostUsd: 3,
        confirmLiveMutation: true,
        env: {
          TOKEN: 'secret-token',
          BULLMQ_QUEUE_NAME: 'career-playbook-smoke-20260521',
        },
      },
      { client }
    );

    expect(report.status).toBe('fail');
    expect(report.evidence?.checks).toContainEqual(
      expect.objectContaining({ id: 'pdf-export', status: 'fail' })
    );
  });
});

describe('Career Playbook live smoke evidence validation', () => {
  it('passes complete generated playbook, PDF, share, and course bridge evidence', () => {
    const report = validateCareerPlaybookSmokeEvidence({
      playbook: {
        id: '33333333-3333-3333-3333-333333333333',
        status: 'completed',
        completedAt: '2026-05-21T00:00:00.000Z',
        generatedBlocks: buildCompleteBlocks(),
        finalMarkdown: '## final\n\n```mermaid\nflowchart LR\nA-->B\n```',
      },
      pdf: {
        contentType: 'application/pdf',
        sizeBytes: 1024,
        startsWithPdfHeader: true,
      },
      share: {
        isPublic: true,
        shareSlug: 'cp-live-smoke',
        publicFetchOk: true,
      },
      courseBridge: {
        courseId: '44444444-4444-4444-4444-444444444444',
        redirectUrl: '/courses/demo/sales-manager-b2b/generating',
        sourceDocumentIds: ['55555555-5555-5555-5555-555555555555'],
      },
    });

    expect(report.status).toBe('pass');
    expect(report.checks.every(check => check.status === 'pass')).toBe(true);
  });

  it('fails when generated blocks are incomplete or deterministic thresholds are missing', () => {
    const blocks = buildCompleteBlocks();
    delete (blocks as Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>).block_26;
    blocks.block_2 = generatedBlock('## 2. Anti-goals\n\n- One item only');

    const report = validateCareerPlaybookSmokeEvidence({
      playbook: {
        id: '33333333-3333-3333-3333-333333333333',
        status: 'completed',
        completedAt: '2026-05-21T00:00:00.000Z',
        generatedBlocks: blocks,
        finalMarkdown: '## final',
      },
    });

    expect(report.status).toBe('fail');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'generated-blocks', status: 'fail' }),
        expect.objectContaining({ id: 'deterministic-content', status: 'fail' }),
      ])
    );
  });
});

describe('Career Playbook live smoke cleanup manifest', () => {
  it('records exact cleanup targets without leaking secrets', () => {
    const manifest = buildCareerPlaybookCleanupManifest({
      runId: 'career-playbook-smoke-20260521',
      targetEnvironment: 'staging',
      queueName: 'career-playbook-smoke-20260521',
      token: 'super-secret-token',
      expectedUserId: '11111111-1111-1111-1111-111111111111',
      expectedOrganizationId: '22222222-2222-2222-2222-222222222222',
      playbookId: '33333333-3333-3333-3333-333333333333',
      careerPlaybookJobId: 'career-playbook:33333333-3333-3333-3333-333333333333',
      shareSlug: 'cp-live-smoke',
      courseId: '44444444-4444-4444-4444-444444444444',
      sourceDocumentIds: ['55555555-5555-5555-5555-555555555555'],
      uploadPaths: [
        'uploads/22222222-2222-2222-2222-222222222222/44444444-4444-4444-4444-444444444444/demo.md',
      ],
    });

    const serialized = JSON.stringify(manifest);

    expect(manifest.mutates).toBe(false);
    expect(manifest.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'career_playbook', id: '33333333-3333-3333-3333-333333333333' }),
        expect.objectContaining({ type: 'bullmq_job', id: 'career-playbook:33333333-3333-3333-3333-333333333333' }),
        expect.objectContaining({ type: 'course', id: '44444444-4444-4444-4444-444444444444' }),
        expect.objectContaining({ type: 'upload_path', id: expect.stringContaining('demo.md') }),
      ])
    );
    expect(serialized).not.toContain('super-secret-token');
  });
});
