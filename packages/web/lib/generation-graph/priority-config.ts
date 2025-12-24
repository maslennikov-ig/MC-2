/**
 * Document Priority Configuration - Single Source of Truth
 *
 * This module provides unified priority types, labels, and styling
 * for document classification across all generation stages.
 *
 * Used by: Stage2Dashboard, Stage3 PrioritizationView, and any other
 * component that displays document priorities.
 */

import { Key, Star, FileIcon, type LucideIcon } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Document priority levels for course generation
 * - CORE: Primary/key document that defines the course structure
 * - IMPORTANT: Supporting documents with significant content
 * - SUPPLEMENTARY: Additional reference materials
 */
export type DocumentPriority = 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';

/**
 * Priority styling configuration
 */
export interface PriorityStyle {
  /** Background color classes */
  bg: string;
  /** Text color classes */
  text: string;
  /** Border color classes */
  border: string;
}

/**
 * Full priority configuration
 */
export interface PriorityConfig {
  /** Localized label */
  label: { ru: string; en: string };
  /** Lucide icon component */
  icon: LucideIcon;
  /** Styling for badges and cards */
  style: PriorityStyle;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Priority configuration - Single Source of Truth
 *
 * Labels are consistent across all stages.
 * Styling uses amber/blue/gray palette for visual hierarchy.
 */
export const PRIORITY_CONFIG: Record<DocumentPriority, PriorityConfig> = {
  CORE: {
    label: { ru: 'Ключевой', en: 'Core' },
    icon: Key,
    style: {
      bg: 'bg-amber-100 dark:bg-amber-900/40',
      text: 'text-amber-700 dark:text-amber-400',
      border: 'border-amber-300 dark:border-amber-700',
    },
  },
  IMPORTANT: {
    label: { ru: 'Важный', en: 'Important' },
    icon: Star,
    style: {
      bg: 'bg-blue-100 dark:bg-blue-900/40',
      text: 'text-blue-700 dark:text-blue-400',
      border: 'border-blue-300 dark:border-blue-700',
    },
  },
  SUPPLEMENTARY: {
    label: { ru: 'Дополнительный', en: 'Supplementary' },
    icon: FileIcon,
    style: {
      bg: 'bg-slate-100 dark:bg-slate-800/40',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-300 dark:border-slate-600',
    },
  },
};

/**
 * Valid priority values for validation
 */
export const VALID_PRIORITIES: readonly DocumentPriority[] = ['CORE', 'IMPORTANT', 'SUPPLEMENTARY'] as const;

/**
 * Priority sort order (CORE first, SUPPLEMENTARY last)
 */
export const PRIORITY_ORDER: Record<DocumentPriority, number> = {
  CORE: 0,
  IMPORTANT: 1,
  SUPPLEMENTARY: 2,
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get localized priority label
 */
export function getPriorityLabel(
  priority: DocumentPriority,
  locale: 'ru' | 'en' = 'ru'
): string {
  return PRIORITY_CONFIG[priority]?.label[locale] ?? priority;
}

/**
 * Get priority icon component
 */
export function getPriorityIcon(priority: DocumentPriority): LucideIcon {
  return PRIORITY_CONFIG[priority]?.icon ?? FileIcon;
}

/**
 * Get priority styling
 */
export function getPriorityStyle(priority: DocumentPriority): PriorityStyle {
  return PRIORITY_CONFIG[priority]?.style ?? PRIORITY_CONFIG.SUPPLEMENTARY.style;
}

/**
 * Check if value is a valid DocumentPriority
 */
export function isValidPriority(value: unknown): value is DocumentPriority {
  return typeof value === 'string' && VALID_PRIORITIES.includes(value as DocumentPriority);
}

/**
 * Sort documents by priority (CORE first)
 */
export function sortByPriority<T extends { priority?: DocumentPriority | string | null }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const orderA = PRIORITY_ORDER[a.priority as DocumentPriority] ?? 999;
    const orderB = PRIORITY_ORDER[b.priority as DocumentPriority] ?? 999;
    return orderA - orderB;
  });
}
