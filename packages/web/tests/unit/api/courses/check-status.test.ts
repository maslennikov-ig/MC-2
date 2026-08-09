import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  GET as checkStatusGet,
  POST as checkStatusPost,
} from '@/app/api/courses/[orgSlug]/[courseSlug]/check-status/route'

type MockCourse = {
  id: string
  slug: string
  user_id: string
  organization_id: string
  status: string
  generation_status: string
  generation_progress: Record<string, unknown> | null
  created_at: string
  updated_at: string
  auto_finalize_after_stage6?: boolean | null
  course_structure?: {
    sections: Array<{
      lessons: Array<{ id: string }>
    }>
  } | null
}

type MockLessonContent = {
  lesson_id: string
  status: string
  created_at: string
}

const { mockSupabaseClient, mockAdminClient, createClientMock, createAdminClientMock } = vi.hoisted(
  () => {
    const supabaseClient = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
    }

    const adminClient = {
      from: vi.fn(),
    }

    return {
      mockSupabaseClient: supabaseClient,
      mockAdminClient: adminClient,
      createClientMock: vi.fn(() => supabaseClient),
      createAdminClientMock: vi.fn(() => adminClient),
    }
  }
)

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
  createAdminClient: createAdminClientMock,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@megacampus/shared-logger', () => ({
  createModuleLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function child() {
      return this
    }),
  })),
}))

vi.mock('@/lib/helpers/organization', () => ({
  getCourseByOrgAndSlug: vi.fn(),
}))

function createMockParams(
  courseSlug = 'course-slug',
  orgSlug = 'org-slug'
): { params: Promise<{ orgSlug: string; courseSlug: string }> } {
  return {
    params: Promise.resolve({ orgSlug, courseSlug }),
  }
}

function createGetRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/courses/org-slug/course-slug/check-status')
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/courses/org-slug/course-slug/check-status', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  })
}

function createAwaitableBuilder<T>(result: T) {
  const builder: {
    eq: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    single: ReturnType<typeof vi.fn>
    then: Promise<T>['then']
  } = {
    eq: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    single: vi.fn(),
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  }

  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.single.mockReturnValue(builder)

  return builder
}

async function mockCourseLookup(course: MockCourse | null) {
  const { getCourseByOrgAndSlug } = await import('@/lib/helpers/organization')
  ;(getCourseByOrgAndSlug as import('vitest').Mock).mockResolvedValue(course)
}

function mockAuthenticatedUser(userId = 'user-123') {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: {
      user: {
        id: userId,
        email: 'user@example.com',
      },
    },
    error: null,
  })
}

function setupLessonContentsSelect(rows: MockLessonContent[]) {
  const lessonContentsBuilder = createAwaitableBuilder({
    data: rows,
    error: null,
  })
  const lessonContentsSelect = vi.fn(() => lessonContentsBuilder)

  mockAdminClient.from.mockImplementation((table: string) => {
    if (table === 'lesson_contents') {
      return {
        select: lessonContentsSelect,
      }
    }

    throw new Error(`Unexpected admin table: ${table}`)
  })

  return {
    lessonContentsBuilder,
    lessonContentsSelect,
  }
}

function setupCoursesUpdate() {
  const updateBuilder = createAwaitableBuilder({ error: null })
  const update = vi.fn(() => updateBuilder)

  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'courses') {
      return {
        update,
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })

  return { update, updateBuilder }
}

function createStage6GeneratingCourse(overrides: Partial<MockCourse> = {}): MockCourse {
  return {
    id: 'course-123',
    slug: 'course-slug',
    user_id: 'user-123',
    organization_id: 'org-123',
    status: 'draft',
    generation_status: 'stage_6_generating',
    generation_progress: null,
    created_at: '2026-04-06T08:00:00.000Z',
    updated_at: '2026-04-06T08:05:00.000Z',
    auto_finalize_after_stage6: false,
    course_structure: {
      sections: [
        {
          lessons: [{ id: 'lesson-1' }, { id: 'lesson-2' }],
        },
      ],
    },
    ...overrides,
  }
}

describe('GET /api/courses/[orgSlug]/[courseSlug]/check-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.from.mockReset()
    mockAdminClient.from.mockReset()
  })

  it('suggests stage_6_complete when all latest lesson rows are terminal and some require review', async () => {
    mockAuthenticatedUser()
    await mockCourseLookup(createStage6GeneratingCourse())
    setupLessonContentsSelect([
      { lesson_id: 'lesson-1', status: 'review_required', created_at: '2026-04-06T08:05:00.000Z' },
      { lesson_id: 'lesson-1', status: 'generating', created_at: '2026-04-06T08:04:00.000Z' },
      { lesson_id: 'lesson-2', status: 'completed', created_at: '2026-04-06T08:06:00.000Z' },
    ])

    const response = await checkStatusGet(createGetRequest(), createMockParams())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isStuck).toBe(true)
    expect(json.suggestedStatus).toBe('stage_6_complete')
  })

  it('suggests completed when all latest lesson rows are fully completed and auto-finalize is enabled', async () => {
    mockAuthenticatedUser()
    await mockCourseLookup(
      createStage6GeneratingCourse({
        auto_finalize_after_stage6: true,
      })
    )
    setupLessonContentsSelect([
      { lesson_id: 'lesson-1', status: 'completed', created_at: '2026-04-06T08:05:00.000Z' },
      { lesson_id: 'lesson-2', status: 'approved', created_at: '2026-04-06T08:06:00.000Z' },
    ])

    const response = await checkStatusGet(createGetRequest(), createMockParams())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isStuck).toBe(true)
    expect(json.suggestedStatus).toBe('completed')
  })

  it('does not suggest reconciliation when latest lesson rows are still incomplete', async () => {
    mockAuthenticatedUser()
    await mockCourseLookup(createStage6GeneratingCourse())
    setupLessonContentsSelect([
      { lesson_id: 'lesson-1', status: 'completed', created_at: '2026-04-06T08:05:00.000Z' },
      { lesson_id: 'lesson-2', status: 'generating', created_at: '2026-04-06T08:06:00.000Z' },
    ])

    const response = await checkStatusGet(createGetRequest(), createMockParams())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isStuck).toBe(false)
    expect(json.suggestedStatus).toBe('stage_6_generating')
  })
})

describe('POST /api/courses/[orgSlug]/[courseSlug]/check-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.from.mockReset()
    mockAdminClient.from.mockReset()
  })

  it('updates generation_status based on Stage 6 reconciliation instead of courses.status', async () => {
    mockAuthenticatedUser()
    await mockCourseLookup(createStage6GeneratingCourse())
    setupLessonContentsSelect([
      { lesson_id: 'lesson-1', status: 'review_required', created_at: '2026-04-06T08:05:00.000Z' },
      { lesson_id: 'lesson-2', status: 'failed', created_at: '2026-04-06T08:06:00.000Z' },
    ])
    const { update } = setupCoursesUpdate()

    const response = await checkStatusPost(createPostRequest({}), createMockParams())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_status: 'stage_6_complete',
      })
    )
    expect(update.mock.calls[0][0]).not.toHaveProperty('status', 'stage_6_complete')
    expect(json.newStatus).toBe('stage_6_complete')
  })
})
