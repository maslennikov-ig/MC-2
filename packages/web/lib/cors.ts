import { NextRequest, NextResponse } from 'next/server'

export interface CorsOptions {
  origin?: string[] | string | boolean
  methods?: string[]
  allowedHeaders?: string[]
  credentials?: boolean
  maxAge?: number
  optionsSuccessStatus?: number
}

const DEFAULT_CORS_OPTIONS: CorsOptions = {
  origin: false, // By default, no cross-origin requests allowed
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 204
}

/**
 * CORS configuration by route pattern
 */
const CORS_CONFIG: Record<string, CorsOptions> = {
  // Public API routes (read-only)
  '/api/courses': {
    origin: ['http://localhost:3000', 'https://megacampus.ai'], // Allow specific origins
    methods: ['GET', 'HEAD'],
    credentials: false,
    maxAge: 3600
  },
  
  // Course details - public read-only
  '/api/courses/[slug]': {
    origin: ['http://localhost:3000', 'https://megacampus.ai'],
    methods: ['GET', 'HEAD'],
    credentials: false,
    maxAge: 3600
  },
  
  // Protected API routes - require authentication
  '/api/courses/create': {
    origin: ['http://localhost:3000', 'https://megacampus.ai'], 
    methods: ['POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
    maxAge: 3600
  },
  
  // Content generation - highly restricted
  '/api/content/generate': {
    origin: ['http://localhost:3000', 'https://megacampus.ai'],
    methods: ['POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
    maxAge: 0 // No caching for security
  },
  
  // Admin/modification routes - strict CORS
  '/api/courses/[slug]/update': {
    origin: process.env.NODE_ENV === 'development' 
      ? ['http://localhost:3000'] 
      : ['https://megacampus.ai'],
    methods: ['PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 0
  }
}

/**
 * Get CORS configuration for a specific route
 */
export function getCorsOptions(pathname: string): CorsOptions {
  // Check for exact matches first
  if (CORS_CONFIG[pathname]) {
    return { ...DEFAULT_CORS_OPTIONS, ...CORS_CONFIG[pathname] }
  }
  
  // Check for pattern matches (simple pattern matching)
  for (const [pattern, config] of Object.entries(CORS_CONFIG)) {
    if (pattern.includes('[slug]')) {
      const regex = pattern.replace('[slug]', '[^/]+')
      if (new RegExp(`^${regex}$`).test(pathname)) {
        return { ...DEFAULT_CORS_OPTIONS, ...config }
      }
    }
  }
  
  // Default: very restrictive CORS for unknown routes
  return {
    ...DEFAULT_CORS_OPTIONS,
    origin: process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : false,
    methods: ['GET', 'HEAD'],
    credentials: false
  }
}

/**
 * Apply CORS headers to response
 */
export function applyCors(request: NextRequest, response: NextResponse, options?: CorsOptions): NextResponse {
  const corsOptions = options || getCorsOptions(new URL(request.url).pathname)
  const origin = request.headers.get('origin')
  
  // Handle origin
  if (corsOptions.origin === true) {
    response.headers.set('Access-Control-Allow-Origin', '*')
  } else if (corsOptions.origin === false) {
    // No CORS headers - same-origin only
  } else if (Array.isArray(corsOptions.origin)) {
    if (origin && corsOptions.origin.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Vary', 'Origin')
    }
  } else if (typeof corsOptions.origin === 'string') {
    if (origin === corsOptions.origin) {
      response.headers.set('Access-Control-Allow-Origin', corsOptions.origin)
    }
  }
  
  // Handle credentials
  if (corsOptions.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }
  
  // Handle methods
  if (corsOptions.methods && corsOptions.methods.length > 0) {
    response.headers.set('Access-Control-Allow-Methods', corsOptions.methods.join(', '))
  }
  
  // Handle allowed headers
  if (corsOptions.allowedHeaders && corsOptions.allowedHeaders.length > 0) {
    response.headers.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '))
  }
  
  // Handle max age
  if (corsOptions.maxAge !== undefined) {
    response.headers.set('Access-Control-Max-Age', corsOptions.maxAge.toString())
  }
  
  return response
}

/**
 * Handle preflight requests
 */
export function handlePreflight(request: NextRequest, options?: CorsOptions): NextResponse {
  const corsOptions = options || getCorsOptions(new URL(request.url).pathname)
  const response = new NextResponse(null, { 
    status: corsOptions.optionsSuccessStatus || 204 
  })
  
  return applyCors(request, response, corsOptions)
}

/**
 * Higher-order function to wrap API handlers with CORS support
 */
export function withCors<T extends unknown[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>,
  corsOptions?: CorsOptions
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return handlePreflight(request, corsOptions)
    }
    
    // Execute handler
    const response = await handler(request, ...args)
    
    // Apply CORS headers to response
    return applyCors(request, response, corsOptions)
  }
}

/**
 * Validate origin against allowed origins
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: CorsOptions['origin']): boolean {
  if (!origin) return false
  
  if (allowedOrigins === true) return true
  if (allowedOrigins === false) return false
  
  if (Array.isArray(allowedOrigins)) {
    return allowedOrigins.includes(origin)
  }
  
  if (typeof allowedOrigins === 'string') {
    return origin === allowedOrigins
  }
  
  return false
}

/**
 * Security-focused CORS options for sensitive endpoints
 */
export const STRICT_CORS: CorsOptions = {
  origin: process.env.NODE_ENV === 'development' 
    ? ['http://localhost:3000'] 
    : ['https://megacampus.ai'], // Update with actual production domain
  methods: ['POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 0 // No preflight caching for security
}

/**
 * Relaxed CORS options for public read-only endpoints
 */
export const PUBLIC_CORS: CorsOptions = {
  origin: ['http://localhost:3000', 'https://megacampus.ai'],
  methods: ['GET', 'HEAD'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  maxAge: 3600
}

/**
 * Development-only CORS - allows all origins
 */
export const DEV_CORS: CorsOptions = {
  origin: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
  maxAge: 0
}