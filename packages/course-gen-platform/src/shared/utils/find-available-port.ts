/**
 * Port availability utility
 * @module shared/utils/find-available-port
 *
 * This module provides utilities to find available ports for server binding.
 * It's used to automatically select a free port when the preferred port is
 * already in use (EADDRINUSE error).
 *
 * ## Usage
 *
 * ```typescript
 * import { findAvailablePort } from '../shared/utils/find-available-port';
 *
 * const preferredPort = 3000;
 * const port = await findAvailablePort(preferredPort);
 * // Returns 3000 if available, or 3001, 3002, etc. if occupied
 * ```
 *
 * ## Algorithm
 *
 * The function tries ports sequentially starting from the preferred port:
 * 1. Attempt to bind to port N
 * 2. If successful, release and return port N
 * 3. If failed, try port N+1
 * 4. Repeat up to maxAttempts times
 * 5. Throw error if no free port found
 *
 * ## Why not use a library?
 *
 * We use Node.js built-in `net` module instead of external dependencies
 * to keep the bundle small and avoid supply chain risks. The implementation
 * is simple and reliable.
 */

import * as net from 'net';

/**
 * Check if a specific port is available for binding
 *
 * @param port - The port number to check (1-65535)
 * @returns Promise resolving to true if port is available, false otherwise
 *
 * @example
 * ```typescript
 * const isAvailable = await isPortAvailable(3000);
 * if (isAvailable) {
 *   console.log('Port 3000 is free');
 * }
 * ```
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    // Port is occupied - another process is listening
    server.once('error', () => resolve(false));

    // Port is available - we can bind to it
    server.once('listening', () => {
      // Close the test server immediately
      server.close();
      resolve(true);
    });

    // Attempt to bind to the port
    server.listen(port);
  });
}

/**
 * Find an available port in the given range
 *
 * This function tries to find a free port starting from the preferred port
 * and incrementing up to maxAttempts times. This is useful when multiple
 * services need to start on the same machine without conflicts.
 *
 * @param preferredPort - The preferred port to start with (e.g., 3000)
 * @param maxAttempts - Maximum number of ports to try (default: 10)
 * @returns Promise resolving to an available port number
 * @throws Error if no available port found in the range
 *
 * @example
 * ```typescript
 * // Try ports 3000-3009
 * const port = await findAvailablePort(3000, 10);
 * console.log(`Server will start on port ${port}`);
 * ```
 *
 * @example
 * ```typescript
 * // Handle case when all ports are occupied
 * try {
 *   const port = await findAvailablePort(3000, 5);
 *   server.listen(port);
 * } catch (error) {
 *   console.error('No available ports:', error.message);
 *   process.exit(1);
 * }
 * ```
 */
export async function findAvailablePort(
  preferredPort: number,
  maxAttempts: number = 10
): Promise<number> {
  // Validate input
  if (preferredPort < 1 || preferredPort > 65535) {
    throw new Error(`Invalid port number: ${preferredPort}. Must be between 1 and 65535`);
  }

  if (maxAttempts < 1) {
    throw new Error(`Invalid maxAttempts: ${maxAttempts}. Must be at least 1`);
  }

  // Try each port in sequence
  for (let i = 0; i < maxAttempts; i++) {
    const port = preferredPort + i;

    // Don't exceed valid port range
    if (port > 65535) {
      break;
    }

    if (await isPortAvailable(port)) {
      return port;
    }
  }

  // No available port found in range
  const rangeEnd = Math.min(preferredPort + maxAttempts - 1, 65535);
  throw new Error(
    `No available port found in range ${preferredPort}-${rangeEnd}. ` +
    `All ${maxAttempts} ports are currently in use. ` +
    `Please stop some services or try a different port range.`
  );
}
