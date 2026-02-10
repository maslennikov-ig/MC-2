import { isIP } from 'node:net'
import { resolve4, resolve6 } from 'node:dns/promises'

/**
 * Private/internal IP ranges that should be blocked for SSRF prevention.
 *
 * Includes:
 * - Loopback addresses (127.0.0.0/8)
 * - Private Class A networks (10.0.0.0/8)
 * - Private Class B networks (172.16.0.0/12)
 * - Private Class C networks (192.168.0.0/16)
 * - Link-local addresses (169.254.0.0/16)
 * - Current network (0.0.0.0/8)
 * - Shared address space (100.64.0.0/10)
 * - IPv6 loopback (::1)
 * - IPv6 private (fc00::/7)
 * - IPv6 link-local (fe80::/10)
 */
const PRIVATE_IP_RANGES = [
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./, // Class C private
  /^169\.254\./, // Link-local
  /^0\./, // Current network
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, // Shared address space
  /^::1$/, // IPv6 loopback
  /^f[cd]/, // IPv6 private
  /^fe80:/, // IPv6 link-local
]

/**
 * Checks if an IP address belongs to a private/internal range.
 *
 * @param ip - The IP address to check (IPv4 or IPv6)
 * @returns true if the IP is private/internal, false otherwise
 */
export function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(range => range.test(ip))
}

/**
 * Validates that a webhook URL does not resolve to private IP addresses.
 * This prevents SSRF attacks via DNS rebinding.
 *
 * @param url - The webhook URL to validate
 * @returns Object with validation result and optional error message
 */
export async function validateWebhookUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const parsed = new URL(url)

    // Check if hostname is directly an IP address
    if (isIP(parsed.hostname)) {
      if (isPrivateIP(parsed.hostname)) {
        return { valid: false, error: 'Webhook URL resolves to private IP address' }
      }
      return { valid: true }
    }

    // Resolve hostname and check all IPv4 + IPv6 addresses
    const [ipv4Addresses, ipv6Addresses] = await Promise.all([
      resolve4(parsed.hostname).catch(() => [] as string[]),
      resolve6(parsed.hostname).catch(() => [] as string[]),
    ])

    const allAddresses = [...ipv4Addresses, ...ipv6Addresses]
    if (allAddresses.length === 0) {
      return { valid: false, error: 'Webhook hostname could not be resolved' }
    }

    for (const addr of allAddresses) {
      if (isPrivateIP(addr)) {
        return { valid: false, error: `Webhook hostname resolves to private IP: ${addr}` }
      }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: `Failed to validate webhook URL: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}
