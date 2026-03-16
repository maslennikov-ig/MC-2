/**
 * Barrel re-export for directory resolution.
 *
 * Node.js ESM resolves bare directory imports to index.js.
 * The sibling generation-phases.ts already re-exports every
 * submodule, so we delegate to it to avoid duplication.
 */
export * from '../generation-phases.js';
