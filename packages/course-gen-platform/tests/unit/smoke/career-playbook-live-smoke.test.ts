import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';

import {
  buildCareerPlaybookCleanupManifest,
  buildCareerPlaybookLiveSmokePlan,
  runCareerPlaybookLiveSmoke,
  type CareerPlaybookLiveSmokeClient,
  type CareerPlaybookLiveSmokeReport,
} from '@/smoke/career-playbook-live-smoke';
import { validateCareerPlaybookSmokeEvidence } from '@/smoke/career-playbook-validation';
import {
  buildCareerPlaybookSmokeArtifact,
  writeCareerPlaybookSmokeArtifact,
} from '../../../scripts/career-playbook-live-smoke';

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
    ['header', ...Array.from({ length: 26 }, (_, index) => `block_${index + 1}`)].map(blockId => [
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
    getCourseStatus: vi.fn().mockResolvedValue({
      courseId: '44444444-4444-4444-4444-444444444444',
      status: 'stage_2_awaiting_approval',
      progress: 35,
      currentPhase: 'document_processing',
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
      getCourseStatus: vi.fn(),
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
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'business-context',
        status: 'skipped',
        mutates: false,
        note: expect.stringContaining('business_context skipped submit before requestFollowups'),
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
  it('submits skipped business context before requesting followups', async () => {
    const client = buildLiveSmokeClient();

    await runCareerPlaybookLiveSmoke(
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

    expect(client.submitAnswer).toHaveBeenNthCalledWith(8, {
      playbookId: '33333333-3333-3333-3333-333333333333',
      phase: 'business_context',
      answer: {
        business_context: {
          mode: 'universal',
          status: 'skipped',
          digest: null,
          source_ids: [],
          skip_reason: 'live_smoke_universal_business_context',
        },
      },
    });
    expect(vi.mocked(client.submitAnswer).mock.invocationCallOrder[7]).toBeLessThan(
      vi.mocked(client.requestFollowups).mock.invocationCallOrder[0]
    );
  });

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

  it('waits for course bridge document processing when course bridge is included', async () => {
    const client = buildLiveSmokeClient({
      getCourseStatus: vi
        .fn()
        .mockResolvedValueOnce({
          courseId: '44444444-4444-4444-4444-444444444444',
          status: 'stage_2_processing',
          progress: 12,
          currentPhase: 'document_processing',
        })
        .mockResolvedValueOnce({
          courseId: '44444444-4444-4444-4444-444444444444',
          status: 'stage_2_awaiting_approval',
          progress: 35,
          currentPhase: 'stage_2_review',
        }),
    });

    const report = await runCareerPlaybookLiveSmoke(
      {
        mode: 'mutation-smoke',
        targetEnvironment: 'staging',
        trpcUrl: 'https://staging.example.test/trpc',
        expectedUserId: '11111111-1111-1111-1111-111111111111',
        expectedOrganizationId: '22222222-2222-2222-2222-222222222222',
        cleanupScope: 'playbook-and-course',
        maxCostUsd: 3,
        confirmLiveMutation: true,
        includeCourseBridge: true,
        pollIntervalMs: 1,
        env: {
          TOKEN: 'secret-token',
          BULLMQ_QUEUE_NAME: 'career-playbook-smoke-20260521',
        },
      },
      { client, sleep: vi.fn().mockResolvedValue(undefined) }
    );

    expect(client.getCourseStatus).toHaveBeenCalledTimes(2);
    expect(client.getCourseStatus).toHaveBeenCalledWith({
      courseId: '44444444-4444-4444-4444-444444444444',
    });
    expect(report.status).toBe('pass');
    expect(report.evidence?.checks).toContainEqual(
      expect.objectContaining({
        id: 'course-bridge',
        status: 'pass',
        note: expect.stringContaining('stage_2_awaiting_approval'),
      })
    );
  });

  it('resumes evidence capture for an existing playbook without starting a new session', async () => {
    const client = buildLiveSmokeClient({
      getStatus: vi.fn().mockResolvedValue({
        playbookId: '77777777-7777-7777-7777-777777777777',
        status: 'completed',
        progress: 100,
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
        resumePlaybookId: '77777777-7777-7777-7777-777777777777',
        env: {
          TOKEN: 'secret-token',
          BULLMQ_QUEUE_NAME: 'career-playbook-smoke-20260521',
        },
      },
      { client }
    );

    expect(client.startSession).not.toHaveBeenCalled();
    expect(client.submitAnswer).not.toHaveBeenCalled();
    expect(client.requestFollowups).not.toHaveBeenCalled();
    expect(client.approveAndGenerate).not.toHaveBeenCalled();
    expect(client.getStatus).toHaveBeenCalledWith({
      playbookId: '77777777-7777-7777-7777-777777777777',
    });
    expect(report.status).toBe('pass');
    expect(report.cleanupManifest?.items).toContainEqual(
      expect.objectContaining({
        type: 'career_playbook',
        id: '77777777-7777-7777-7777-777777777777',
      })
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
      careerPlaybookJobId: 'career-playbook-33333333-3333-3333-3333-333333333333',
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
        expect.objectContaining({
          type: 'career_playbook',
          id: '33333333-3333-3333-3333-333333333333',
        }),
        expect.objectContaining({
          type: 'bullmq_job',
          id: 'career-playbook-33333333-3333-3333-3333-333333333333',
        }),
        expect.objectContaining({ type: 'course', id: '44444444-4444-4444-4444-444444444444' }),
        expect.objectContaining({ type: 'upload_path', id: expect.stringContaining('demo.md') }),
      ])
    );
    expect(serialized).not.toContain('super-secret-token');
  });
});

function buildSmokeArtifactReport(
  overrides: Partial<CareerPlaybookLiveSmokeReport> = {}
): CareerPlaybookLiveSmokeReport {
  return {
    mode: 'mutation-smoke',
    targetEnvironment: 'dev',
    status: 'pass',
    mutates: true,
    checks: [],
    playbookId: '33333333-3333-3333-3333-333333333333',
    evidence: {
      status: 'pass',
      checks: [
        { id: 'completed-playbook', status: 'pass', note: 'completed with final markdown' },
        { id: 'generated-blocks', status: 'pass', note: 'all blocks present' },
      ],
    },
    cleanupManifest: {
      runId: 'career-playbook-smoke-20260704',
      targetEnvironment: 'dev',
      queueName: 'course-generation-dev',
      mutates: false,
      items: [
        {
          type: 'career_playbook',
          id: '33333333-3333-3333-3333-333333333333',
          note: 'Delete by exact playbook id.',
        },
      ],
    },
    ...overrides,
  };
}

const SAMPLE_ARTIFACT_TIMINGS = {
  startedAt: '2026-07-04T10:00:00.000Z',
  finishedAt: '2026-07-04T10:44:24.000Z',
  durationMs: 2664000,
  pollTimeoutMs: 7200000,
  pollIntervalMs: 5000,
};

describe('Career Playbook live smoke artifact writer', () => {
  it('derives filenames from the timestamp + playbookId and records cost/timings/evidence', () => {
    const files = buildCareerPlaybookSmokeArtifact({
      generatedAt: '2026-07-04T10:44:25.123Z',
      report: buildSmokeArtifactReport(),
      finalMarkdown: '# Sales Manager B2B\n\nRich generated content.',
      finalMarkdownSource: 'trpc-library-detail',
      costBreakdown: { nodeCosts: [{ cost_usd: 0.12 }], total_cost_usd: 0.24 },
      costSource: 'supabase-row',
      language: 'ru',
      timings: SAMPLE_ARTIFACT_TIMINGS,
    });

    expect(files.markdownFileName).toBe(
      '2026-07-04T10-44-25-123Z-33333333-3333-3333-3333-333333333333.md'
    );
    expect(files.jsonFileName).toBe(
      '2026-07-04T10-44-25-123Z-33333333-3333-3333-3333-333333333333.json'
    );
    expect(files.markdown).toBe('# Sales Manager B2B\n\nRich generated content.');

    const meta = JSON.parse(files.json) as Record<string, unknown> & {
      costBreakdown: { total_cost_usd: number };
      timings: { durationMs: number };
      evidence: { status: string; checks: { id: string; status: string }[] };
    };
    expect(meta.playbookId).toBe('33333333-3333-3333-3333-333333333333');
    expect(meta.costBreakdown.total_cost_usd).toBe(0.24);
    expect(meta.costSource).toBe('supabase-row');
    expect(meta.timings.durationMs).toBe(2664000);
    expect(meta.finalMarkdownSource).toBe('trpc-library-detail');
    expect(meta.finalMarkdownFile).toBe(files.markdownFileName);
    expect(meta.evidence.status).toBe('pass');
    expect(meta.evidence.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'generated-blocks', status: 'pass' }),
      ])
    );
  });

  it('writes a diagnostic placeholder and unavailable cost when nothing was captured', () => {
    const files = buildCareerPlaybookSmokeArtifact({
      generatedAt: '2026-07-04T10:44:25.000Z',
      report: buildSmokeArtifactReport({ status: 'fail' }),
      finalMarkdown: null,
      finalMarkdownSource: 'none',
      costBreakdown: null,
      costSource: 'unavailable',
      language: null,
      timings: SAMPLE_ARTIFACT_TIMINGS,
    });

    expect(files.markdown).toContain('no final_markdown captured');
    expect(files.markdown).toContain('runStatus=fail');
    const meta = JSON.parse(files.json) as { costBreakdown: unknown; costSource: string; finalMarkdownSource: string };
    expect(meta.costBreakdown).toBeNull();
    expect(meta.costSource).toBe('unavailable');
    expect(meta.finalMarkdownSource).toBe('none');
  });

  it('persists both files to disk and never serializes secrets', async () => {
    const files = buildCareerPlaybookSmokeArtifact({
      generatedAt: '2026-07-04T10:44:25.000Z',
      report: buildSmokeArtifactReport(),
      finalMarkdown: '# content only, no secrets',
      finalMarkdownSource: 'supabase-row',
      costBreakdown: { total_cost_usd: 0.5 },
      costSource: 'supabase-row',
      language: 'ru',
      timings: SAMPLE_ARTIFACT_TIMINGS,
    });

    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-smoke-artifact-'));
    try {
      const paths = await writeCareerPlaybookSmokeArtifact(files, baseDir);

      expect(paths.markdownPath).toBe(path.join(baseDir, files.markdownFileName));
      expect(paths.jsonPath).toBe(path.join(baseDir, files.jsonFileName));

      const writtenMarkdown = await fs.readFile(paths.markdownPath, 'utf8');
      const writtenJson = await fs.readFile(paths.jsonPath, 'utf8');
      expect(writtenMarkdown).toBe(files.markdown);
      expect((JSON.parse(writtenJson) as { playbookId: string }).playbookId).toBe(
        '33333333-3333-3333-3333-333333333333'
      );

      const serialized = writtenMarkdown + writtenJson;
      expect(serialized).not.toMatch(/Bearer /);
      expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]+\./); // JWT-shaped token
      expect(serialized).not.toContain('SUPABASE_SERVICE');
    } finally {
      await fs.rm(baseDir, { recursive: true, force: true });
    }
  });
});
