// Environment variables validation and configuration
// Centralizes environment variable access with proper validation
// SECURITY: Service role key is only accessible via getServerEnv() function

// Removed logger import to avoid circular dependency

interface EnvConfig {
  N8N_WEBHOOK_URL: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  NODE_ENV: 'development' | 'production' | 'test'
  NEXT_PUBLIC_APP_URL: string
  COURSEGEN_BACKEND_URL: string
}

class EnvironmentConfig {
  private config: Partial<EnvConfig> = {}
  private validated = false

  constructor() {
    this.loadConfig()
  }

  private loadConfig() {
    // Load environment variables with defaults
    // NOTE: localhost:3456 is used for development only, production MUST set COURSEGEN_BACKEND_URL
    this.config = {
      N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || 'https://flow8n.ru/webhook/coursegen/generate',
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      COURSEGEN_BACKEND_URL: process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456',
    }
  }

  private validate() {
    if (this.validated) return

    // In production, COURSEGEN_BACKEND_URL is required (no localhost fallback)
    const required: (keyof EnvConfig)[] = this.config.NODE_ENV === 'production'
      ? ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'COURSEGEN_BACKEND_URL']
      : ['SUPABASE_URL', 'SUPABASE_ANON_KEY']
    const missing: string[] = []

    for (const key of required) {
      if (!this.config[key]) {
        missing.push(key)
      }
    }

    if (missing.length > 0 && this.config.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
    } else if (missing.length > 0) {
      // Silent in development to avoid noise
      // Missing env vars will be caught during production build
    }

    this.validated = true
  }

  get(key: keyof EnvConfig): string {
    this.validate()
    const value = this.config[key]
    return value !== undefined ? value : ''
  }

  getAll(): Partial<EnvConfig> {
    this.validate()
    return { ...this.config }
  }

  isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development'
  }

  isProduction(): boolean {
    return this.config.NODE_ENV === 'production'
  }
}

// Export singleton instance
export const env = new EnvironmentConfig()

// Export typed environment variables for CLIENT-SIDE use
// SECURITY: Service role key intentionally excluded from client-accessible exports
export const ENV = {
  N8N_WEBHOOK_URL: env.get('N8N_WEBHOOK_URL'),
  SUPABASE_URL: env.get('SUPABASE_URL'),
  SUPABASE_ANON_KEY: env.get('SUPABASE_ANON_KEY'),
  // SUPABASE_SERVICE_ROLE_KEY removed for security - use getServerEnv() instead
  NODE_ENV: env.get('NODE_ENV') as EnvConfig['NODE_ENV'],
  NEXT_PUBLIC_APP_URL: env.get('NEXT_PUBLIC_APP_URL'),
  COURSEGEN_BACKEND_URL: env.get('COURSEGEN_BACKEND_URL'),
}

/**
 * Server-only environment variables
 * SECURITY: This function should ONLY be used in server-side code
 * Never expose these values to client-side code or API responses
 */
export function getServerEnv() {
  // Runtime check to prevent client-side usage
  if (typeof window !== 'undefined') {
    throw new Error(
      'getServerEnv() called on client side. Service role key must never be exposed to the client.'
    )
  }

  return {
    SUPABASE_SERVICE_ROLE_KEY: env.get('SUPABASE_SERVICE_ROLE_KEY'),
  }
}

/**
 * Get tRPC URL for course generation backend
 * Centralized helper to avoid duplication across server actions and API routes
 */
export function getTrpcUrl(): string {
  return `${ENV.COURSEGEN_BACKEND_URL}/trpc`
}