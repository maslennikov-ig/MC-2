import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '@/server/app-router';
import { careerPlaybookRouter } from '@/server/routers/career-playbook';
import type { Context } from '@/server/trpc';

const authenticatedContext: Context = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'author@example.com',
    role: 'instructor',
    organizationId: '22222222-2222-4222-8222-222222222222',
  },
  req: new Request('http://localhost/trpc'),
};

const unauthenticatedContext: Context = {
  user: null,
  req: new Request('http://localhost/trpc'),
};

async function expectNotImplemented(call: Promise<unknown>) {
  await expect(call).rejects.toMatchObject({
    code: 'METHOD_NOT_SUPPORTED',
  });
}

describe('careerPlaybookRouter skeleton', () => {
  it('is wired into the app router under careerPlaybook', () => {
    expect(appRouter._def.procedures['careerPlaybook.session.start']).toBeDefined();
    expect(appRouter._def.procedures['careerPlaybook.courseBridge.createCourseFromPlaybook']).toBeDefined();
  });

  it('requires authentication for session procedures', async () => {
    const caller = careerPlaybookRouter.createCaller(unauthenticatedContext);

    await expect(caller.session.start({ language: 'ru' })).rejects.toBeInstanceOf(TRPCError);
  });

  it('exposes typed session skeleton procedures', async () => {
    const caller = careerPlaybookRouter.createCaller(authenticatedContext);

    await expectNotImplemented(caller.session.start({ language: 'ru' }));
    await expectNotImplemented(
      caller.session.get({
        playbookId: '33333333-3333-4333-8333-333333333333',
      })
    );
    await expectNotImplemented(
      caller.session.submitAnswer({
        playbookId: '33333333-3333-4333-8333-333333333333',
        phase: 'fixed',
        answer: {
          question_key: 'position',
          value: 'B2B Sales Manager',
        },
      })
    );
    await expectNotImplemented(
      caller.session.getDraft({
        playbookId: '33333333-3333-4333-8333-333333333333',
      })
    );
    await expectNotImplemented(caller.session.getFixedQuestions({ uiLanguage: 'en' }));
  });

  it('exposes typed generation skeleton procedures', async () => {
    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const playbookId = '33333333-3333-4333-8333-333333333333';

    await expectNotImplemented(caller.generation.approveAndGenerate({ playbookId }));
    await expectNotImplemented(caller.generation.getStatus({ playbookId }));
    await expectNotImplemented(caller.generation.getBlock({ playbookId, blockId: 'block_1' }));
  });

  it('exposes typed library skeleton procedures', async () => {
    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const playbookId = '33333333-3333-4333-8333-333333333333';

    await expectNotImplemented(caller.library.list({ limit: 20 }));
    await expectNotImplemented(caller.library.get({ playbookId }));
    await expectNotImplemented(caller.library.delete({ playbookId }));
    await expectNotImplemented(
      caller.library.edit({
        playbookId,
        blockId: 'block_1',
        content: 'Updated block content',
      })
    );
    await expectNotImplemented(
      caller.library.regenerateBlock({
        playbookId,
        blockId: 'block_1',
        instruction: 'Make it more specific',
      })
    );
  });

  it('exposes typed share and course bridge skeleton procedures', async () => {
    const caller = careerPlaybookRouter.createCaller(authenticatedContext);
    const publicCaller = careerPlaybookRouter.createCaller(unauthenticatedContext);
    const playbookId = '33333333-3333-4333-8333-333333333333';

    await expectNotImplemented(caller.share.shareToggle({ playbookId, isPublic: true }));
    await expectNotImplemented(publicCaller.share.getPublicBySlug({ shareSlug: 'sales-guide' }));
    await expectNotImplemented(caller.courseBridge.createCourseFromPlaybook({ playbookId }));
  });
});
