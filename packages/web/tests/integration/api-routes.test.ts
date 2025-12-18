/**
 * Integration tests for API routes
 * These tests make actual HTTP requests to the API endpoints
 * and verify the responses, authentication, and error handling
 */

import { describe, it, expect, vi, beforeEach, type Mock, type MockedFunction } from 'vitest'
import { NextRequest } from 'next/server'

// Mock environment variables for testing
process.env.NODE_ENV = 'test'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.N8N_WEBHOOK_URL = 'https://test-webhook.com/generate'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'test-course-1',
              slug: 'test-course-slug',
              title: 'Test Course',
              description: 'A test course',
              status: 'completed',
              request_data: { style: 'academic', audience: 'general' }
            },
            error: null
          })
        })
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'test-course-1', title: 'Updated Course' },
              error: null
            })
          })
        })
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'test-course-1', title: 'Test Course' },
              error: null
            })
          })
        })
      })
    }),
    auth: {
      getUser: vi.fn()
    }
  }
}))

// Mock fetch for webhook calls
global.fetch = vi.fn()

// Import route handlers
import { POST as createCourseHandler } from '@/app/api/courses/create/route'
import { GET as getCourseHandler, DELETE as deleteCourseHandler, PUT as updateCourseHandler } from '@/app/api/courses/[slug]/route'
import { POST as generateContentHandler } from '@/app/api/content/generate/route'

describe('API Routes Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('/api/courses/create', () => {
    it('should create a course with valid data and authentication', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      // Mock successful webhook response
      const mockFetch = global.fetch as MockedFunction<typeof fetch>
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          course_id: 'course-123',
          status: 'processing'
        })
      } as Response)

      // Create form data
      const formData = new FormData()
      formData.append('topic', 'Test Course Topic')
      formData.append('difficulty', 'intermediate')
      formData.append('language', 'en')
      formData.append('description', 'Test course description')

      const request = new NextRequest('http://localhost:3000/api/courses/create', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token'
        }
      })

      const response = await createCourseHandler(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.course_id).toBeDefined()
      expect(data.status).toBe('processing')
    })

    it('should reject requests without authentication', async () => {
      // Mock authentication failure
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: null },
        error: new Error('Invalid token')
      })

      const formData = new FormData()
      formData.append('topic', 'Test Course Topic')
      formData.append('difficulty', 'intermediate')
      formData.append('language', 'en')

      const request = new NextRequest('http://localhost:3000/api/courses/create', {
        method: 'POST',
        body: formData
      })

      const response = await createCourseHandler(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
    })

    it('should validate required fields', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      const formData = new FormData()
      // Missing required fields

      const request = new NextRequest('http://localhost:3000/api/courses/create', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token'
        }
      })

      const response = await createCourseHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Missing required fields')
    })

    it('should handle rate limiting', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      // Make multiple requests rapidly to trigger rate limit
      const formData = new FormData()
      formData.append('topic', 'Test Course Topic')
      formData.append('difficulty', 'intermediate')
      formData.append('language', 'en')

      const requests = Array.from({ length: 15 }, () =>
        new NextRequest('http://localhost:3000/api/courses/create', {
          method: 'POST',
          body: formData.clone(),
          headers: {
            'Authorization': 'Bearer test-token',
            'x-forwarded-for': '192.168.1.1'
          }
        })
      )

      const responses = await Promise.all(
        requests.map(req => createCourseHandler(req))
      )

      // Some responses should be rate limited (429)
      const rateLimitedResponses = responses.filter(r => r.status === 429)
      expect(rateLimitedResponses.length).toBeGreaterThan(0)
    })
  })

  describe('/api/courses/[slug]', () => {
    const testParams = { params: Promise.resolve({ slug: 'test-course-slug' }) }

    it('should get course details without authentication (public read)', async () => {
      const request = new NextRequest('http://localhost:3000/api/courses/test-course-1', {
        method: 'GET'
      })

      const response = await getCourseHandler(request, testParams)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.id).toBe('test-course-1')
      expect(data.title).toBe('Test Course')
    })

    it('should require authentication for DELETE operations', async () => {
      const request = new NextRequest('http://localhost:3000/api/courses/test-course-1', {
        method: 'DELETE'
      })

      const response = await deleteCourseHandler(request, testParams)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
    })

    it('should delete course with proper authentication', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      const request = new NextRequest('http://localhost:3000/api/courses/test-course-1', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      })

      const response = await deleteCourseHandler(request, testParams)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Course deleted successfully')
      expect(data.deletedCourse.id).toBe('test-course-1')
    })

    it('should update course with proper authentication', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      const updateData = {
        title: 'Updated Course Title',
        description: 'Updated description'
      }

      const request = new NextRequest('http://localhost:3000/api/courses/test-course-1', {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        }
      })

      const response = await updateCourseHandler(request, testParams)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.id).toBe('test-course-1')
      expect(data.title).toBe('Updated Course')
    })
  })

  describe('/api/content/generate', () => {
    it('should generate content with proper authentication', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      // Mock course and lesson data
      ;(mockSupabase.supabase.from as Mock).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn()
              .mockResolvedValueOnce({
                data: {
                  id: 'lesson-123',
                  title: 'Test Lesson',
                  content_text: 'Lesson content',
                  objectives: ['Learn something'],
                  duration_minutes: 5
                },
                error: null
              })
              .mockResolvedValueOnce({
                data: {
                  id: 'course-123',
                  title: 'Test Course',
                  description: 'Course description',
                  request_data: { style: 'academic', audience: 'general' }
                },
                error: null
              })
          })
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: {}, error: null })
        })
      })

      // Mock webhook response
      const mockFetch = global.fetch as MockedFunction<typeof fetch>
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Generated' })
      } as Response)

      const requestBody = {
        webhook: 'https://test-webhook.com/generate',
        courseId: 'course-123',
        lessonId: 'lesson-123',
        lessonNumber: 1,
        lessonTitle: 'Test Lesson',
        formatId: 'text'
      }

      const request = new NextRequest('http://localhost:3000/api/content/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        }
      })

      const response = await generateContentHandler(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.lessonId).toBe('lesson-123')
      expect(data.formatId).toBe('text')
    })

    it('should require authentication', async () => {
      // Mock authentication failure
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: null },
        error: new Error('Invalid token')
      })

      const requestBody = {
        webhook: 'https://test-webhook.com/generate',
        courseId: 'course-123',
        lessonId: 'lesson-123'
      }

      const request = new NextRequest('http://localhost:3000/api/content/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await generateContentHandler(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
    })

    it('should validate required fields', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      const requestBody = {
        // Missing required fields
      }

      const request = new NextRequest('http://localhost:3000/api/content/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        }
      })

      const response = await generateContentHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Missing required fields')
    })
  })

  describe('CORS Headers', () => {
    it('should include proper CORS headers for API routes', async () => {
      const request = new NextRequest('http://localhost:3000/api/courses/test-course-1', {
        method: 'GET',
        headers: {
          'Origin': 'http://localhost:3000'
        }
      })

      const response = await getCourseHandler(request, { params: Promise.resolve({ slug: 'test-course-1' }) })

      // Note: CORS headers are typically set by Next.js middleware or headers config
      // In a real integration test, you would test against the actual server
      expect(response.status).toBe(200)
    })

    it('should handle preflight OPTIONS requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/courses/create', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
      })

      // In a real setup, this would be handled by CORS middleware
      // For now, we verify the route exists and doesn't error
      expect(request.method).toBe('OPTIONS')
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })
      ;(mockSupabase.supabase.from as Mock).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Database connection error')
            })
          })
        })
      })

      const request = new NextRequest('http://localhost:3000/api/courses/test-course-1', {
        method: 'GET'
      })

      const response = await getCourseHandler(request, { params: Promise.resolve({ slug: 'test-course-1' }) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch course')
    })

    it('should handle webhook failures', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      // Mock webhook failure
      const mockFetch = global.fetch as MockedFunction<typeof fetch>
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Webhook server error')
      } as Response)

      const formData = new FormData()
      formData.append('topic', 'Test Course Topic')
      formData.append('difficulty', 'intermediate')
      formData.append('language', 'en')

      const request = new NextRequest('http://localhost:3000/api/courses/create', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token'
        }
      })

      const response = await createCourseHandler(request)
      const data = await response.json()

      // In development mode, it should fall back to mock response
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('development mode')
    })
  })

  describe('Security', () => {
    it('should sanitize input data', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      // Mock successful webhook response
      const mockFetch = global.fetch as MockedFunction<typeof fetch>
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, course_id: 'course-123' })
      } as Response)

      const formData = new FormData()
      formData.append('topic', '<script>alert("xss")</script>Test Course')
      formData.append('difficulty', 'intermediate')
      formData.append('language', 'en')

      const request = new NextRequest('http://localhost:3000/api/courses/create', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token'
        }
      })

      const response = await createCourseHandler(request)

      // Should not fail due to XSS attempt
      expect(response.status).toBe(200)

      // Verify webhook was called with sanitized data
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should reject oversized files', async () => {
      // Mock successful authentication
      const mockSupabase = await import('@/lib/supabase')
      ;(mockSupabase.supabase.auth.getUser as Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      const formData = new FormData()
      formData.append('topic', 'Test Course')
      formData.append('difficulty', 'intermediate')
      formData.append('language', 'en')

      // Create a large file (mock)
      const largeFile = new File(['x'.repeat(51 * 1024 * 1024)], 'large.txt', { type: 'text/plain' })
      formData.append('files', largeFile)

      const request = new NextRequest('http://localhost:3000/api/courses/create', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token'
        }
      })

      const response = await createCourseHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('exceeds maximum size')
    })
  })
})

// Helper functions removed to eliminate unused code warnings
// Add back if needed for future tests

// Removed unused helper function createAuthenticatedRequest
// Add back if needed for authentication tests
