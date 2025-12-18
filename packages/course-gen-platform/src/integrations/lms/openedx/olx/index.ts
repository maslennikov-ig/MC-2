/**
 * OLX Module Barrel Export
 * @module integrations/lms/openedx/olx
 *
 * Central export point for all OLX-related functionality.
 * Provides types, validators, generator, packager, and templates.
 */

// Core types
export * from './types';

// Validation functions
export * from './validators';

// Generator class
export * from './generator';

// Packager functions
export * from './packager';

// URL name registry
export { UrlNameRegistry } from './url-name-registry';
export type { OlxElementType } from './url-name-registry';

// Template generators
export * from './templates';
