import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const routeMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getServerTrpcClient: vi.fn(),
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  logPermanentFailure: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: routeMocks.createClient,
}))

vi.mock('@/lib/trpc/server-caller', () => ({
  getServerTrpcClient: routeMocks.getServerTrpcClient,
}))

vi.mock('@/lib/logger', () => ({
  logger: routeMocks.logger,
  logPermanentFailure: routeMocks.logPermanentFailure,
}))

import { POST } from '@/app/api/career-playbook/upload/route'

function mockAuthenticatedUser() {
  routeMocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
  })
}

describe('/api/career-playbook/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedUser()
  })

  it('rejects oversized content-length before calling tRPC upload', async () => {
    const request = new NextRequest('http://localhost:3000/api/career-playbook/upload', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        'content-length': '200000000',
      },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(413)
    expect(body).toEqual({
      error: 'Upload payload is too large',
      code: 'PAYLOAD_TOO_LARGE',
    })
    expect(routeMocks.getServerTrpcClient).not.toHaveBeenCalled()
  })
})
