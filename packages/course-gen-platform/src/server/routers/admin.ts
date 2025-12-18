/**
 * Admin Router
 * @module server/routers/admin
 *
 * Re-exports the modular admin router from ./admin/index.ts
 *
 * This file provides backward compatibility for existing imports.
 * The actual implementation is now split into sub-routers in the ./admin/ directory.
 */

export { adminRouter, type AdminRouter } from './admin/index';

// Re-export shared types for convenience
export * from './admin/shared/types';
export * from './admin/shared/schemas';
