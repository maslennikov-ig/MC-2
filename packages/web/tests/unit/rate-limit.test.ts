import { NextRequest } from 'next/server'
import { rateLimiters, createRateLimiter, checkRateLimit } from '@/lib/rate-limit'

// Mock NextRequest for testing
const createMockRequest = (ip = '127.0.0.1', userAgent = 'test-agent') => {
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/test',
    headers: new Map([
      ['x-forwarded-for', ip],
      ['user-agent', userAgent]
    ])
  } as unknown as NextRequest
}

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Reset rate limiters before each test
    rateLimiters.api.reset()
    rateLimiters.auth.reset()
    rateLimiters.upload.reset()
  })

  describe('Basic Rate Limiting', () => {
    it('should allow requests within the limit', () => {
      const req = createMockRequest()
      const result = rateLimiters.api.consume(req)
      
      expect(result.allowed).toBe(true)
      expect(result.info.remaining).toBe(59) // 60 - 1
      expect(result.info.limit).toBe(60)
    })

    it('should block requests exceeding the limit', () => {
      const req = createMockRequest()
      
      // Consume all allowed requests
      for (let i = 0; i < 60; i++) {
        const result = rateLimiters.api.consume(req)
        expect(result.allowed).toBe(true)
      }
      
      // 61st request should be blocked
      const result = rateLimiters.api.consume(req)
      expect(result.allowed).toBe(false)
      expect(result.info.remaining).toBe(0)
    })

    it('should differentiate between different IPs', () => {
      const req1 = createMockRequest('192.168.1.1')
      const req2 = createMockRequest('192.168.1.2')
      
      // Exhaust limit for first IP
      for (let i = 0; i < 60; i++) {
        rateLimiters.api.consume(req1)
      }
      
      const result1 = rateLimiters.api.consume(req1)
      const result2 = rateLimiters.api.consume(req2)
      
      expect(result1.allowed).toBe(false) // First IP blocked
      expect(result2.allowed).toBe(true)  // Second IP allowed
    })
  })

  describe('Different Rate Limiter Configurations', () => {
    it('should apply stricter limits for auth endpoints', () => {
      const req = createMockRequest()
      
      // Auth limiter allows only 5 requests per 15 minutes
      for (let i = 0; i < 5; i++) {
        const result = rateLimiters.auth.consume(req)
        expect(result.allowed).toBe(true)
      }
      
      const result = rateLimiters.auth.consume(req)
      expect(result.allowed).toBe(false)
    })

    it('should apply different limits for upload endpoints', () => {
      const req = createMockRequest()
      
      // Upload limiter allows 10 requests per minute
      for (let i = 0; i < 10; i++) {
        const result = rateLimiters.upload.consume(req)
        expect(result.allowed).toBe(true)
      }
      
      const result = rateLimiters.upload.consume(req)
      expect(result.allowed).toBe(false)
    })
  })

  describe('Custom Rate Limiter', () => {
    it('should create custom rate limiter with specified config', () => {
      const customLimiter = createRateLimiter({
        windowMs: 1000, // 1 second
        maxRequests: 2,  // 2 requests per second
        message: 'Custom limit exceeded'
      })
      
      const req = createMockRequest()
      
      // First two requests should succeed
      expect(customLimiter.consume(req).allowed).toBe(true)
      expect(customLimiter.consume(req).allowed).toBe(true)
      
      // Third request should fail
      expect(customLimiter.consume(req).allowed).toBe(false)
    })
  })

  describe('Rate Limit Info', () => {
    it('should provide accurate rate limit information', () => {
      const req = createMockRequest()
      
      const result1 = rateLimiters.api.consume(req)
      expect(result1.info.limit).toBe(60)
      expect(result1.info.remaining).toBe(59)
      expect(result1.info.total).toBe(1)
      expect(result1.info.reset).toBeGreaterThan(Date.now())
      
      const result2 = rateLimiters.api.consume(req)
      expect(result2.info.remaining).toBe(58)
      expect(result2.info.total).toBe(2)
    })

    it('should check rate limit without consuming', () => {
      const req = createMockRequest()
      
      // Check without consuming
      const info1 = checkRateLimit(req, rateLimiters.api)
      expect(info1.remaining).toBe(60)
      expect(info1.total).toBe(0)
      
      // Consume one request
      rateLimiters.api.consume(req)
      
      // Check again
      const info2 = checkRateLimit(req, rateLimiters.api)
      expect(info2.remaining).toBe(59)
      expect(info2.total).toBe(1)
    })
  })

  describe('Rate Limiter Management', () => {
    it('should reset rate limiter state', () => {
      const req = createMockRequest()
      
      // Consume some requests
      rateLimiters.api.consume(req)
      rateLimiters.api.consume(req)
      
      expect(rateLimiters.api.check(req).info.total).toBe(2)
      
      // Reset and check
      rateLimiters.api.reset()
      expect(rateLimiters.api.check(req).info.total).toBe(0)
    })

    it('should provide statistics', () => {
      const req1 = createMockRequest('192.168.1.1')
      const req2 = createMockRequest('192.168.1.2')
      
      rateLimiters.api.consume(req1)
      rateLimiters.api.consume(req2)
      
      const stats = rateLimiters.api.getStats()
      expect(stats.totalKeys).toBe(2)
      expect(stats.totalRequests).toBe(2)
    })
  })

  describe('Fallback Key Generation', () => {
    it('should handle requests without IP headers', () => {
      const req = {
        method: 'POST',
        url: 'http://localhost:3000/api/test',
        headers: new Map([
          ['user-agent', 'Mozilla/5.0 (test)'],
          ['accept', 'application/json']
        ])
      } as unknown as NextRequest
      
      const result = rateLimiters.api.consume(req)
      expect(result.allowed).toBe(true)
      
      // Should generate consistent key for same headers
      const result2 = rateLimiters.api.consume(req)
      expect(result2.info.total).toBe(2)
    })
  })
})