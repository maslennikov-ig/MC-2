import { StageConfig, NodeStyles } from '@megacampus/shared-types';
import { CourseStatus } from '@/types/course-generation';

/**
 * Active Course Statuses
 * Statuses that indicate the generation is in progress
 */
export const ACTIVE_STATUSES: CourseStatus[] = [
  'initializing',
  'processing_documents',
  'analyzing_task',
  'generating_structure',
  'generating_content',
  'finalizing',
];

/**
 * Stage Configuration
 * Defines the visual and behavioral properties of each pipeline stage
 */
export const GRAPH_STAGE_CONFIG: Record<string, StageConfig> = {
  stage_1: {
    id: 'stage_1',
    number: 1,
    name: 'stages.stage_1',
    icon: 'Play',
    color: '#6B7280', // Gray
    type: 'trigger',
    category: 'core',
    parallelizable: false,
  },
  stage_2: {
    id: 'stage_2',
    number: 2,
    name: 'stages.stage_2',
    icon: 'FileText',
    color: '#3B82F6', // Blue
    type: 'document',
    category: 'core',
    parallelizable: true,
  },
  stage_3: {
    id: 'stage_3',
    number: 3,
    name: 'stages.stage_3',
    icon: 'Tag',
    color: '#8B5CF6', // Purple
    type: 'ai',
    category: 'core',
    parallelizable: false,
  },
  stage_4: {
    id: 'stage_4',
    number: 4,
    name: 'stages.stage_4',
    icon: 'Brain',
    color: '#6366F1', // Indigo
    type: 'ai',
    category: 'core',
    parallelizable: false,
  },
  stage_5: {
    id: 'stage_5',
    number: 5,
    name: 'stages.stage_5',
    icon: 'GitBranch',
    color: '#F59E0B', // Orange
    type: 'structure',
    category: 'core',
    parallelizable: false,
  },
  stage_6: {
    id: 'stage_6',
    number: 6,
    name: 'stages.stage_6',
    icon: 'PenTool',
    color: '#10B981', // Green
    type: 'content',
    category: 'content',
    parallelizable: true,
  },
};

/**
 * Node Styles by Status
 * WCAG AA compliant colors for node headers and borders
 */
export const NODE_STYLES: NodeStyles = {
  pending: {
    background: '#F9FAFB',
    border: '#D1D5DB',
    text: '#6B7280',
    header: '#9CA3AF',
  },
  active: {
    background: '#DBEAFE',
    border: '#3B82F6',
    text: '#1E40AF',
    header: '#3B82F6',
  },
  completed: {
    background: '#D1FAE5',
    border: '#10B981',
    text: '#065F46',
    header: '#10B981',
  },
  error: {
    background: '#FEE2E2',
    border: '#EF4444',
    text: '#991B1B',
    header: '#EF4444',
  },
  awaiting: {
    background: '#FEF3C7',
    border: '#F59E0B',
    text: '#92400E',
    header: '#F59E0B',
  },
  skipped: {
    background: '#F1F5F9',
    border: '#94A3B8',
    text: '#475569',
    header: '#94A3B8',
  },
};

/**
 * ElkJS Layout Options
 */
export const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '50',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.mergeEdges': 'true',
};

/**
 * Document Priority Types and Configuration
 * Used for document classification in Stage 3
 */
export type DocumentPriorityType = 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';

import { Key, Star, FileText, type LucideIcon } from 'lucide-react';

export interface PriorityConfigItem {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  description: string;
}

/**
 * Priority Configuration for Document Classification
 * - CORE: Exactly 1 per course (enforced by database constraint)
 * - IMPORTANT: Up to 30% of documents
 * - SUPPLEMENTARY: Remaining documents
 */
export const PRIORITY_CONFIG: Record<DocumentPriorityType, PriorityConfigItem> = {
  CORE: {
    label: 'Ключевой',
    icon: Key,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    description: 'Самый важный документ курса (только 1)',
  },
  IMPORTANT: {
    label: 'Важный',
    icon: Star,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    description: 'Основные материалы курса (до 30%)',
  },
  SUPPLEMENTARY: {
    label: 'Дополнительный',
    icon: FileText,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800/50',
    description: 'Вспомогательные материалы',
  },
};
