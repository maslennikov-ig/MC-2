/**
 * Stage 7 Enrichment Configuration
 * Icons, colors, and display metadata for enrichment types
 *
 * @module lib/generation-graph/enrichment-config
 */

import {
  Video,
  Headphones,
  Presentation,
  HelpCircle,
  FileText,
  Image,
  type LucideIcon,
} from 'lucide-react';

/**
 * Enrichment type (matches database enum)
 */
export type EnrichmentType = 'video' | 'audio' | 'presentation' | 'quiz' | 'document' | 'cover';

/**
 * Enrichment status (matches database enum)
 */
export type EnrichmentStatus =
  | 'pending'
  | 'draft_generating'
  | 'draft_ready'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Configuration for a single enrichment type
 */
export interface EnrichmentTypeConfig {
  /** Lucide icon component */
  icon: LucideIcon;
  /** Tailwind color class for the icon */
  color: string;
  /** Tailwind color class (alias for compatibility) */
  colorClass: string;
  /** Tailwind background color class */
  bgColor: string;
  /** Tailwind background class (alias for compatibility) */
  bgClass: string;
  /** Display label in English */
  label: string;
  /** Display label in Russian */
  labelRu: string;
  /** Whether this type uses two-stage generation (draft → final) */
  twoStage: boolean;
  /** Sort order for display */
  order: number;
}

/**
 * Enrichment type configuration map
 */
export const ENRICHMENT_TYPE_CONFIG: Record<EnrichmentType, EnrichmentTypeConfig> = {
  video: {
    icon: Video,
    color: 'text-red-500 dark:text-red-400',
    colorClass: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    bgClass: 'bg-red-100 dark:bg-red-900/30',
    label: 'Video Lecture',
    labelRu: 'Видеолекция',
    twoStage: true,
    order: 1,
  },
  audio: {
    icon: Headphones,
    color: 'text-purple-500 dark:text-purple-400',
    colorClass: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    bgClass: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'Audio Lesson',
    labelRu: 'Аудиоурок',
    twoStage: false,
    order: 2,
  },
  presentation: {
    icon: Presentation,
    color: 'text-orange-500 dark:text-orange-400',
    colorClass: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    bgClass: 'bg-orange-100 dark:bg-orange-900/30',
    label: 'Presentation',
    labelRu: 'Презентация',
    twoStage: true,
    order: 3,
  },
  quiz: {
    icon: HelpCircle,
    color: 'text-green-500 dark:text-green-400',
    colorClass: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    bgClass: 'bg-green-100 dark:bg-green-900/30',
    label: 'Quiz',
    labelRu: 'Тест',
    twoStage: false,
    order: 4,
  },
  document: {
    icon: FileText,
    color: 'text-blue-500 dark:text-blue-400',
    colorClass: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Reading Materials',
    labelRu: 'Дополнительное чтение',
    twoStage: false,
    order: 5,
  },
  cover: {
    icon: Image,
    color: 'text-cyan-500 dark:text-cyan-400',
    colorClass: 'text-cyan-500 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    bgClass: 'bg-cyan-100 dark:bg-cyan-900/30',
    label: 'Lesson Cover',
    labelRu: 'Обложка урока',
    twoStage: false,
    order: 0,
  },
};

/**
 * Status configuration for enrichments
 */
export interface EnrichmentStatusConfig {
  /** Tailwind color class for status indicator */
  color: string;
  /** Whether status should show animation */
  animate: boolean;
  /** Whether status indicates completion */
  isComplete: boolean;
  /** Whether status indicates error */
  isError: boolean;
}

/**
 * Enrichment status configuration map
 */
export const ENRICHMENT_STATUS_CONFIG: Record<EnrichmentStatus, EnrichmentStatusConfig> = {
  pending: {
    color: 'text-slate-400 dark:text-slate-500',
    animate: false,
    isComplete: false,
    isError: false,
  },
  draft_generating: {
    color: 'text-blue-500 dark:text-blue-400',
    animate: true,
    isComplete: false,
    isError: false,
  },
  draft_ready: {
    color: 'text-amber-500 dark:text-amber-400',
    animate: false,
    isComplete: false,
    isError: false,
  },
  generating: {
    color: 'text-blue-500 dark:text-blue-400',
    animate: true,
    isComplete: false,
    isError: false,
  },
  completed: {
    color: 'text-emerald-500 dark:text-emerald-400',
    animate: false,
    isComplete: true,
    isError: false,
  },
  failed: {
    color: 'text-red-500 dark:text-red-400',
    animate: false,
    isComplete: false,
    isError: true,
  },
  cancelled: {
    color: 'text-slate-400 dark:text-slate-500',
    animate: false,
    isComplete: false,
    isError: false,
  },
};

/**
 * Get icon component for enrichment type
 */
export function getEnrichmentIcon(type: EnrichmentType): LucideIcon {
  return ENRICHMENT_TYPE_CONFIG[type].icon;
}

/**
 * Get color class for enrichment type
 */
export function getEnrichmentColor(type: EnrichmentType): string {
  return ENRICHMENT_TYPE_CONFIG[type].color;
}

/**
 * Check if enrichment type uses two-stage generation
 */
export function isTwoStageEnrichment(type: EnrichmentType): boolean {
  return ENRICHMENT_TYPE_CONFIG[type].twoStage;
}

/**
 * Get status configuration
 */
export function getStatusConfig(status: EnrichmentStatus): EnrichmentStatusConfig {
  return ENRICHMENT_STATUS_CONFIG[status];
}

/**
 * Check if status indicates generating (should show animation)
 */
export function isGeneratingStatus(status: EnrichmentStatus): boolean {
  return status === 'generating' || status === 'draft_generating';
}

/**
 * Check if status indicates awaiting user action
 */
export function isAwaitingActionStatus(status: EnrichmentStatus): boolean {
  return status === 'draft_ready';
}

/**
 * Ordered array of enrichment types for consistent display
 */
export const ENRICHMENT_TYPES_ORDERED: EnrichmentType[] = [
  'cover',
  'video',
  'audio',
  'presentation',
  'quiz',
  'document',
];
