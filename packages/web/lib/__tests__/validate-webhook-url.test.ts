import { describe, it, expect } from 'vitest'
import { isPrivateIP, validateWebhookUrl } from '../validate-webhook-url'

describe('isPrivateIP', () => {
  describe('IPv4 private ranges', () => {
    it('should detect loopback addresses', () => {
      expect(isPrivateIP('127.0.0.1')).toBe(true)
      expect(isPrivateIP('127.255.255.255')).toBe(true)
    })

    it('should detect Class A private networks', () => {
      expect(isPrivateIP('10.0.0.1')).toBe(true)
      expect(isPrivateIP('10.255.255.255')).toBe(true)
    })

    it('should detect Class B private networks', () => {
      expect(isPrivateIP('172.16.0.1')).toBe(true)
      expect(isPrivateIP('172.31.255.255')).toBe(true)
    })

    it('should detect Class C private networks', () => {
      expect(isPrivateIP('192.168.0.1')).toBe(true)
      expect(isPrivateIP('192.168.255.255')).toBe(true)
    })

    it('should detect link-local addresses', () => {
      expect(isPrivateIP('169.254.1.1')).toBe(true)
    })

    it('should detect shared address space', () => {
      expect(isPrivateIP('100.64.0.1')).toBe(true)
      expect(isPrivateIP('100.127.255.255')).toBe(true)
    })

    it('should detect current network', () => {
      expect(isPrivateIP('0.0.0.1')).toBe(true)
    })
  })

  describe('IPv6 private ranges', () => {
    it('should detect IPv6 loopback', () => {
      expect(isPrivateIP('::1')).toBe(true)
    })

    it('should detect IPv6 private addresses', () => {
      expect(isPrivateIP('fc00::1')).toBe(true)
      expect(isPrivateIP('fd00::1')).toBe(true)
    })

    it('should detect IPv6 link-local', () => {
      expect(isPrivateIP('fe80::1')).toBe(true)
    })
  })

  describe('Public IP addresses', () => {
    it('should allow public IPv4 addresses', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false)
      expect(isPrivateIP('1.1.1.1')).toBe(false)
      expect(isPrivateIP('93.184.216.34')).toBe(false) // example.com
    })
  })
})

describe('validateWebhookUrl', () => {
  describe('Direct IP validation', () => {
    it('should reject private IPs', async () => {
      const result = await validateWebhookUrl('http://127.0.0.1/webhook')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('private IP')
    })

    it('should allow public IPs', async () => {
      const result = await validateWebhookUrl('http://8.8.8.8/webhook')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('Hostname resolution', () => {
    it('should allow hostnames that resolve to public IPs', async () => {
      // google.com should resolve to public IPs
      const result = await validateWebhookUrl('https://google.com/webhook')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    }, 10000) // Allow time for DNS resolution

    it('should reject hostnames that fail DNS resolution', async () => {
      const result = await validateWebhookUrl('https://this-domain-definitely-does-not-exist-12345.com/webhook')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Failed to validate')
    }, 10000)
  })

  describe('Invalid URLs', () => {
    it('should reject malformed URLs', async () => {
      const result = await validateWebhookUrl('not-a-url')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Failed to validate')
    })
  })
})
