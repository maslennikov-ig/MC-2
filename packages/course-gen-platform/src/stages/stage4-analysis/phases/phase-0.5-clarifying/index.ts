/**
 * Barrel re-export for directory resolution.
 *
 * Node.js ESM resolves bare directory imports to index.js.
 * The sibling phase-0.5-clarifying.ts already re-exports every
 * submodule, so we delegate to it to avoid duplication.
 */
export * from '../phase-0.5-clarifying.js';
