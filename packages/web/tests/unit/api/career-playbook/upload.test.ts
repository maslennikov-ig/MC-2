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

  it('rejects non-FormData upload bodies before calling tRPC upload', async () => {
    const request = new NextRequest('http://localhost:3000/api/career-playbook/upload', {
      method: 'POST',
      body: JSON.stringify({
        playbookId: '00000000-0000-4000-8000-000000000001',
        filename: 'context.pdf',
        fileContent: 'Y29udGV4dA==',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: 'Invalid request format',
      code: 'INVALID_REQUEST',
    })
    expect(routeMocks.getServerTrpcClient).not.toHaveBeenCalled()
  })

  it('uploads a multipart file through the current tRPC base64 bridge', async () => {
    const mutate = vi.fn().mockResolvedValue({
      sourceId: '00000000-0000-4000-8000-000000000101',
      fileId: '00000000-0000-4000-8000-000000000201',
      storagePath: 'career-playbook/context.pdf',
      status: 'processing',
      message: 'queued',
    })
    routeMocks.getServerTrpcClient.mockResolvedValue({
      careerPlaybook: {
        sources: {
          uploadFile: {
            mutate,
          },
        },
      },
    })

    const file = {
      name: 'context.pdf',
      size: 15,
      type: 'application/pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('company context').buffer),
    } as unknown as File
    const formData = {
      get: vi.fn((key: string) =>
        key === 'playbookId' ? '00000000-0000-4000-8000-000000000001' : key === 'file' ? file : null
      ),
    } as unknown as FormData
    const request = {
      headers: new Headers({ 'content-type': 'multipart/form-data; boundary=test' }),
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      sourceId: '00000000-0000-4000-8000-000000000101',
      fileId: '00000000-0000-4000-8000-000000000201',
      storagePath: 'career-playbook/context.pdf',
      status: 'processing',
      message: 'queued',
    })
    expect(mutate).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000001',
      filename: 'context.pdf',
      fileSize: 15,
      mimeType: 'application/pdf',
      fileContent: Buffer.from('company context').toString('base64'),
    })
  })
})
