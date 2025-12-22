import type { TransportSingleOptions, TransportMultiOptions } from 'pino';

type TransportConfig = TransportSingleOptions | TransportMultiOptions | undefined;

interface TransportTarget {
  target: string;
  options?: Record<string, unknown>;
  level?: string;
}

/**
 * Returns transport configuration for Pino logger.
 *
 * NOTE: This module is Node.js-only. For browser logging, use
 * '@/lib/client-logger' in the web package.
 *
 * IMPORTANT: In development with Next.js, we return undefined to use
 * synchronous stdout logging (via pino.destination in index.ts).
 * This prevents "the worker has exited" errors caused by worker threads
 * being terminated before logs are written.
 *
 * In production, we use async transports for better performance.
 */
export function getTransportConfig(): TransportConfig {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (isDevelopment) {
    // CRITICAL: Do NOT use pino.transport() in development with Next.js!
    //
    // pino.transport() ALWAYS creates worker threads, even with sync: true.
    // The sync option only affects buffering inside the transport, not the
    // worker thread itself.
    //
    // When Next.js Server Components finish rendering, worker threads are
    // terminated, causing "the worker has exited" errors.
    //
    // Solution: Return undefined and use pino.destination(1) with sync: true
    // in the main logger config. This writes directly to stdout without
    // worker threads.
    //
    // For pretty printing in development, pipe output through pino-pretty:
    //   pnpm dev | pino-pretty
    //
    // Or use the PINO_PRETTY=1 environment variable (handled in index.ts)
    return undefined;
  }

  const targets: TransportTarget[] = [];

  // Axiom transport (production only, if configured)
  if (process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET) {
    targets.push({
      target: '@axiomhq/pino',
      options: {
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN,
      },
      level: 'info',
    });
  }

  // Always log to stdout for container logs
  targets.push({
    target: 'pino/file',
    options: { destination: 1 },
    level: 'info',
  });

  if (targets.length === 0) {
    return undefined;
  }

  if (targets.length === 1) {
    return targets[0] as TransportSingleOptions;
  }

  return { targets } as TransportMultiOptions;
}
