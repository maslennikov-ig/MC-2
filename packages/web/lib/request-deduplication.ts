/**
 * Request deduplication utility to prevent duplicate API calls
 * Useful for preventing race conditions and redundant network requests
 */

interface PendingRequest<T> {
  promise: Promise<T>
  timestamp: number
}

class RequestDeduplicator {
  protected pendingRequests = new Map<string, PendingRequest<unknown>>()
  private readonly defaultTTL = 5000 // 5 seconds TTL for deduplication

  /**
   * Execute a request with deduplication
   * If the same request is already in flight, return the existing promise
   */
  async execute<T>(
    key: string,
    requestFn: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    const now = Date.now()
    const existingRequest = this.pendingRequests.get(key) as PendingRequest<T> | undefined

    // Check if there's an existing request that hasn't expired
    if (existingRequest && (now - existingRequest.timestamp) < ttl) {
      return existingRequest.promise
    }

    // Create new request
    const promise = requestFn()
      .finally(() => {
        // Clean up after request completes
        this.pendingRequests.delete(key)
      })

    // Store the pending request
    this.pendingRequests.set(key, {
      promise,
      timestamp: now
    })

    return promise
  }

  /**
   * Cancel a pending request
   */
  cancel(key: string): boolean {
    return this.pendingRequests.delete(key)
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pendingRequests.clear()
  }

  /**
   * Get the number of pending requests
   */
  getPendingCount(): number {
    return this.pendingRequests.size
  }

  /**
   * Check if a request is currently pending
   */
  isPending(key: string): boolean {
    return this.pendingRequests.has(key)
  }

  /**
   * Clean up expired requests
   */
  cleanup(maxAge: number = this.defaultTTL): number {
    const now = Date.now()
    let cleaned = 0

    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > maxAge) {
        this.pendingRequests.delete(key)
        cleaned++
      }
    }

    return cleaned
  }
}

// Global instance for the application
export const globalDeduplicator = new RequestDeduplicator()

/**
 * Higher-order function to create a deduplicated version of an async function
 */
export function withDeduplication<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string,
  ttl?: number
): T {
  return (async (...args: Parameters<T>) => {
    const key = keyGenerator ? keyGenerator(...args) : `${fn.name}-${JSON.stringify(args)}`
    return globalDeduplicator.execute(key, () => fn(...args), ttl)
  }) as T
}

/**
 * Utility function to generate cache keys for common use cases
 */
export const createCacheKey = {
  // For API endpoints with parameters
  api: (endpoint: string, params?: Record<string, unknown>) => 
    `api:${endpoint}:${params ? JSON.stringify(params) : 'no-params'}`,
  
  // For database queries
  query: (table: string, conditions?: Record<string, unknown>) =>
    `query:${table}:${conditions ? JSON.stringify(conditions) : 'no-conditions'}`,
  
  // For user-specific requests
  user: (userId: string, resource: string, params?: Record<string, unknown>) =>
    `user:${userId}:${resource}:${params ? JSON.stringify(params) : 'no-params'}`,
  
  // For file operations
  file: (operation: string, path: string) =>
    `file:${operation}:${path}`,
}

/**
 * Hook for request deduplication in React components
 */
export function useRequestDeduplication() {
  const execute = async <T>(
    key: string,
    requestFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> => {
    return globalDeduplicator.execute(key, requestFn, ttl)
  }

  return {
    execute,
    cancel: globalDeduplicator.cancel.bind(globalDeduplicator),
    isPending: globalDeduplicator.isPending.bind(globalDeduplicator),
    getPendingCount: () => globalDeduplicator.getPendingCount(),
    cleanup: globalDeduplicator.cleanup.bind(globalDeduplicator)
  }
}

/**
 * Example usage with Supabase queries
 */
export function createDeduplicatedSupabaseQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>
) {
  return () => globalDeduplicator.execute(
    createCacheKey.query(queryName),
    queryFn,
    3000 // 3 second TTL for database queries
  )
}

/**
 * Middleware for API routes to handle deduplication
 */
export function withApiDeduplication<T>(
  handler: () => Promise<T>,
  req: { url?: string; method?: string; body?: Record<string, unknown> }
): Promise<T> {
  const key = createCacheKey.api(
    `${req.method || 'GET'}:${req.url || 'unknown'}`,
    req.body
  )
  
  return globalDeduplicator.execute(key, handler, 2000) // 2 second TTL for API calls
}

/**
 * AbortController integration for cancellable requests
 */
export class CancellableRequestDeduplicator extends RequestDeduplicator {
  private controllers = new Map<string, AbortController>()

  async execute<T>(
    key: string,
    requestFn: (signal: AbortSignal) => Promise<T>,
    ttl: number = 5000
  ): Promise<T> {
    const now = Date.now()
    const existingRequest = this.pendingRequests.get(key) as PendingRequest<T> | undefined

    if (existingRequest && (now - existingRequest.timestamp) < ttl) {
      return existingRequest.promise
    }

    // Cancel any existing request for this key
    const existingController = this.controllers.get(key)
    if (existingController) {
      existingController.abort()
    }

    // Create new controller
    const controller = new AbortController()
    this.controllers.set(key, controller)

    const promise = requestFn(controller.signal)
      .finally(() => {
        this.pendingRequests.delete(key)
        this.controllers.delete(key)
      })

    this.pendingRequests.set(key, {
      promise,
      timestamp: now
    })

    return promise
  }

  cancel(key: string): boolean {
    const controller = this.controllers.get(key)
    if (controller) {
      controller.abort()
      this.controllers.delete(key)
    }
    return this.pendingRequests.delete(key)
  }

  clear(): void {
    // Abort all pending requests
    for (const controller of this.controllers.values()) {
      controller.abort()
    }
    this.controllers.clear()
    this.pendingRequests.clear()
  }
}

export const cancellableDeduplicator = new CancellableRequestDeduplicator()