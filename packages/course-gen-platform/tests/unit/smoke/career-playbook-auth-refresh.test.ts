import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  linkOptions: undefined as
    | { headers: () => Record<string, string> | Promise<Record<string, string>> }
    | undefined,
}));

vi.mock('@trpc/client', () => ({
  httpBatchLink: vi.fn(
    (options: { headers: () => Record<string, string> | Promise<Record<string, string>> }) => {
      mocks.linkOptions = options;
      return options;
    }
  ),
  createTRPCClient: vi.fn(() => ({
    careerPlaybook: {
      session: {
        start: { mutate: vi.fn() },
        submitAnswer: { mutate: vi.fn() },
      },
      generation: {
        requestFollowups: { mutate: vi.fn() },
        approveAndGenerate: { mutate: vi.fn() },
        getStatus: { query: mocks.getStatus },
      },
      library: { get: { query: vi.fn() } },
      exportPdf: { query: vi.fn() },
      share: {
        shareToggle: { mutate: vi.fn() },
        getPublicBySlug: { query: vi.fn() },
      },
      courseBridge: {
        createCourseFromPlaybook: { mutate: vi.fn() },
      },
    },
    generation: { getStatus: { query: vi.fn() } },
  })),
}));

const { createRefreshableCareerPlaybookBearerToken, createTrpcLiveSmokeClient } = await import(
  '../../../scripts/career-playbook-live-smoke'
);

describe('Career Playbook live-smoke auth refresh', () => {
  it('deduplicates concurrent refreshes and rotates both tokens', async () => {
    const refreshSession = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: 'access-2', refreshToken: 'refresh-2' })
      .mockResolvedValueOnce({ accessToken: 'access-3', refreshToken: 'refresh-3' });
    const source = createRefreshableCareerPlaybookBearerToken({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      refreshSession,
    });

    await Promise.all([source.refreshAccessToken(), source.refreshAccessToken()]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenLastCalledWith('refresh-1');
    expect(source.getAccessToken()).toBe('access-2');

    await source.refreshAccessToken();
    expect(refreshSession).toHaveBeenLastCalledWith('refresh-2');
    expect(source.getAccessToken()).toBe('access-3');
  });

  it('refreshes once on UNAUTHORIZED and retries with the current bearer token', async () => {
    let currentToken = 'access-1';
    const refreshAccessToken = vi.fn(async () => {
      currentToken = 'access-2';
      return currentToken;
    });
    mocks.getStatus
      .mockRejectedValueOnce(
        Object.assign(new Error('Authentication required'), {
          data: { code: 'UNAUTHORIZED' },
        })
      )
      .mockResolvedValueOnce({
        playbookId: '00000000-0000-4000-8000-000000000001',
        status: 'completed',
      });

    const client = createTrpcLiveSmokeClient('https://api.example.test/trpc', {
      getAccessToken: () => currentToken,
      refreshAccessToken,
    });

    expect(await mocks.linkOptions?.headers()).toMatchObject({
      Authorization: 'Bearer access-1',
    });
    await expect(
      client.getStatus({ playbookId: '00000000-0000-4000-8000-000000000001' })
    ).resolves.toMatchObject({ status: 'completed' });
    expect(await mocks.linkOptions?.headers()).toMatchObject({
      Authorization: 'Bearer access-2',
    });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.getStatus).toHaveBeenCalledTimes(2);
  });
});
