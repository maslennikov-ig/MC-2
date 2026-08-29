/**
 * The Career Playbook block catalogue: which blocks a playbook has, in what
 * order, under which group heading.
 * @module career-playbook-blocks
 *
 * Split out of `career-playbook.ts` at 841 lines of code against a limit of 800.
 * The seam is the same one that worked for the course-size labels: the other
 * module defines what a playbook IS — questions, quality issues, judge verdicts,
 * cost, evidence — while this one is a 27-entry stored table of content (header
 * plus 26 content blocks). Adding a block
 * no longer touches the schemas, and the schemas are readable without scrolling
 * past the table.
 *
 * Re-exported by `career-playbook.ts`, so every existing import is unaffected.
 */

import type {
  CareerPlaybookAudience,
  CareerPlaybookBlockId,
  CareerPlaybookBlockGroupKey,
} from './career-playbook';

export interface CareerPlaybookBlockCatalogItem {
  blockId: CareerPlaybookBlockId;
  title: string;
  groupKey: CareerPlaybookBlockGroupKey;
  groupLabel: string;
  position: number;
  audiences: readonly CareerPlaybookAudience[];
}

export const CAREER_PLAYBOOK_BLOCK_CATALOG = [
  {
    blockId: 'header',
    title: 'Role guide header',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 0,
    audiences: ['employee', 'manager', 'hr'],
  },
  {
    blockId: 'block_1',
    title: 'Mission and key results',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 1,
    audiences: ['employee', 'manager', 'hr'],
  },
  {
    blockId: 'block_2',
    title: 'Anti-goals',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 2,
    audiences: ['employee', 'manager'],
  },
  {
    blockId: 'block_3',
    title: 'Responsibility zones',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 3,
    audiences: ['employee', 'manager'],
  },
  {
    blockId: 'block_4',
    title: 'Duties',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 4,
    audiences: ['employee', 'manager'],
  },
  {
    blockId: 'block_5',
    title: 'Decision authority matrix',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 5,
    audiences: ['employee', 'manager'],
  },
  {
    blockId: 'block_6',
    title: 'KPI and metrics',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 6,
    audiences: ['employee', 'manager'],
  },
  {
    blockId: 'block_7',
    title: 'Competencies',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 7,
    audiences: ['manager', 'hr'],
  },
  {
    blockId: 'block_8',
    title: 'Tools and technologies',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 8,
    audiences: ['employee', 'hr'],
  },
  {
    blockId: 'block_9',
    title: 'Human-AI collaboration',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 9,
    audiences: ['employee'],
  },
  {
    blockId: 'block_10',
    title: 'Dependencies',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 10,
    audiences: ['employee', 'manager'],
  },
  {
    blockId: 'block_11',
    title: 'Career path',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 11,
    audiences: ['employee', 'hr'],
  },
  {
    blockId: 'block_12',
    title: 'Candidate profile',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 12,
    audiences: ['hr'],
  },
  {
    blockId: 'block_13',
    title: 'Day in the life',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 13,
    audiences: ['employee', 'hr'],
  },
  {
    blockId: 'block_14',
    title: 'Onboarding',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 14,
    audiences: ['employee', 'manager', 'hr'],
  },
  {
    blockId: 'block_15',
    title: 'Motivation',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 15,
    audiences: ['manager', 'hr'],
  },
  {
    blockId: 'block_16',
    title: 'Main process',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 16,
    audiences: ['employee', 'manager'],
  },
  {
    blockId: 'block_17',
    title: 'Red flags',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 17,
    audiences: ['manager', 'hr'],
  },
  {
    blockId: 'block_18',
    title: 'FAQ',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 18,
    audiences: ['employee', 'manager'],
  },
  {
    blockId: 'block_19',
    title: 'Industry context',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 19,
    audiences: ['employee', 'hr'],
  },
  {
    blockId: 'block_20',
    title: 'Business model',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 20,
    audiences: ['employee', 'manager'],
  },
  {
    blockId: 'block_21',
    title: 'Failure modes',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 21,
    audiences: ['manager'],
  },
  {
    blockId: 'block_22',
    title: 'Role README',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 22,
    audiences: ['employee'],
  },
  {
    blockId: 'block_23',
    title: 'Continuity plan',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 23,
    audiences: ['manager'],
  },
  {
    blockId: 'block_24',
    title: 'Role Canvas',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 24,
    audiences: ['employee', 'manager', 'hr'],
  },
  {
    blockId: 'block_25',
    title: 'Footer',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 25,
    audiences: ['employee', 'manager', 'hr'],
  },
  {
    blockId: 'block_26',
    title: 'Implementation checklist',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 26,
    audiences: ['manager', 'hr'],
  },
] as const satisfies readonly CareerPlaybookBlockCatalogItem[];
