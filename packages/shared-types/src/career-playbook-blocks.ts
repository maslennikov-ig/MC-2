/**
 * The Career Playbook block catalogue: which blocks a playbook has, in what
 * order, under which group heading.
 * @module career-playbook-blocks
 *
 * Split out of `career-playbook.ts` at 841 lines of code against a limit of 800.
 * The seam is the same one that worked for the course-size labels: the other
 * module defines what a playbook IS — questions, quality issues, judge verdicts,
 * cost, evidence — while this one is a 26-entry table of content. Adding a block
 * no longer touches the schemas, and the schemas are readable without scrolling
 * past the table.
 *
 * Re-exported by `career-playbook.ts`, so every existing import is unaffected.
 */

import type { CareerPlaybookBlockId, CareerPlaybookBlockGroupKey } from './career-playbook';

export interface CareerPlaybookBlockCatalogItem {
  blockId: CareerPlaybookBlockId;
  title: string;
  groupKey: CareerPlaybookBlockGroupKey;
  groupLabel: string;
  position: number;
}

export const CAREER_PLAYBOOK_BLOCK_CATALOG = [
  {
    blockId: 'header',
    title: 'Role guide header',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 0,
  },
  {
    blockId: 'block_1',
    title: 'Mission and key results',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 1,
  },
  {
    blockId: 'block_2',
    title: 'Anti-goals',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 2,
  },
  {
    blockId: 'block_3',
    title: 'Responsibility zones',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 3,
  },
  {
    blockId: 'block_4',
    title: 'Duties',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 4,
  },
  {
    blockId: 'block_5',
    title: 'Decision authority matrix',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 5,
  },
  {
    blockId: 'block_6',
    title: 'KPI and metrics',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 6,
  },
  {
    blockId: 'block_7',
    title: 'Competencies',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 7,
  },
  {
    blockId: 'block_8',
    title: 'Tools and technologies',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 8,
  },
  {
    blockId: 'block_9',
    title: 'Human-AI collaboration',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 9,
  },
  {
    blockId: 'block_10',
    title: 'Dependencies',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 10,
  },
  {
    blockId: 'block_11',
    title: 'Career path',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 11,
  },
  {
    blockId: 'block_12',
    title: 'Candidate profile',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 12,
  },
  {
    blockId: 'block_13',
    title: 'Day in the life',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 13,
  },
  {
    blockId: 'block_14',
    title: 'Onboarding',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 14,
  },
  {
    blockId: 'block_15',
    title: 'Motivation',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 15,
  },
  {
    blockId: 'block_16',
    title: 'Main process',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 16,
  },
  {
    blockId: 'block_17',
    title: 'Red flags',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 17,
  },
  {
    blockId: 'block_18',
    title: 'FAQ',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 18,
  },
  {
    blockId: 'block_19',
    title: 'Industry context',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 19,
  },
  {
    blockId: 'block_20',
    title: 'Business model',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 20,
  },
  {
    blockId: 'block_21',
    title: 'Failure modes',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 21,
  },
  {
    blockId: 'block_22',
    title: 'Role README',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 22,
  },
  {
    blockId: 'block_23',
    title: 'Continuity plan',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 23,
  },
  {
    blockId: 'block_24',
    title: 'Role Canvas',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 24,
  },
  {
    blockId: 'block_25',
    title: 'Footer',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 25,
  },
  {
    blockId: 'block_26',
    title: 'Implementation checklist',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 26,
  },
] as const satisfies readonly CareerPlaybookBlockCatalogItem[];
