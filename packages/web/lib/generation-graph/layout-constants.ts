/**
 * Shared Layout Constants for Generation Graph
 *
 * Single source of truth for node dimensions used by:
 * - ELK layout algorithm (useGraphLayout.ts)
 * - Node builders (graph-builders.ts)
 * - Component styles (ModuleGroup.tsx, Stage2Group.tsx)
 *
 * @module lib/generation-graph/layout-constants
 */

/**
 * Layout Configuration for Stage 6 Modules.
 * Used by ELK layout algorithm and node dimension calculations.
 *
 * @remarks
 * Phase 1: Calculate module heights based on lesson count
 * Phase 2: ELK positions modules, then lessons are positioned within
 *
 * CSS styles in ModuleGroup.tsx should use min-h matching these values.
 */
export const STAGE6_LAYOUT_CONFIG = {
  /** Width of module container node */
  MODULE_WIDTH: 300,
  /** Height when collapsed - matches min-h-[90px] in ModuleGroup CSS */
  MODULE_COLLAPSED_HEIGHT: 90,
  /** Height of header area (title + expand button) */
  MODULE_HEADER_HEIGHT: 60,
  /** Height of each lesson node inside module (64px to accommodate AssetDock) */
  LESSON_HEIGHT: 64,
  /** Vertical gap between lesson nodes */
  LESSON_GAP: 10,
  /** Internal padding inside module container */
  MODULE_PADDING: 15,
} as const;

/**
 * Layout Configuration for Stage 2 Document Processing Container.
 * Used by ELK layout algorithm and node dimension calculations.
 *
 * @remarks
 * Stage 2 uses different dimensions than Stage 6 modules:
 * - CONTAINER_WIDTH: 320 (vs 300) - wider for long filenames
 * - CONTAINER_COLLAPSED_HEIGHT: 100 (vs 90) - taller for document count/progress
 * - DOCUMENT_HEIGHT: 55 (vs 50) - slightly taller for status indicators
 * - DOCUMENT_GAP: 8 (vs 10) - tighter spacing for compact list
 * - CONTAINER_PADDING: 12 (vs 15) - less padding for more document space
 */
export const STAGE2_LAYOUT_CONFIG = {
  /** Width of stage2group container node */
  CONTAINER_WIDTH: 320,
  /** Height when container is collapsed (shows summary only) */
  CONTAINER_COLLAPSED_HEIGHT: 100,
  /** Height of container header area (title + progress) */
  CONTAINER_HEADER_HEIGHT: 70,
  /** Height of each document node inside container */
  DOCUMENT_HEIGHT: 55,
  /** Vertical gap between document nodes */
  DOCUMENT_GAP: 8,
  /** Internal padding inside container */
  CONTAINER_PADDING: 12,
  // Aliases for backward compatibility (graph-builders.ts uses GROUP_* naming)
  /** @deprecated Use CONTAINER_WIDTH */
  GROUP_WIDTH: 320,
  /** @deprecated Use CONTAINER_COLLAPSED_HEIGHT */
  GROUP_COLLAPSED_HEIGHT: 100,
  /** @deprecated Use CONTAINER_HEADER_HEIGHT */
  GROUP_HEADER_HEIGHT: 70,
  /** @deprecated Use CONTAINER_PADDING */
  GROUP_PADDING: 12,
} as const;

// Export type for external use
export type Stage6LayoutConfig = typeof STAGE6_LAYOUT_CONFIG;
export type Stage2LayoutConfig = typeof STAGE2_LAYOUT_CONFIG;
