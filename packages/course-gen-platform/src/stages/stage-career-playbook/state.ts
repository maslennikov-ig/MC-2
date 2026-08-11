import { Annotation } from '@langchain/langgraph';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookJudgeVerdict,
  CareerPlaybookNodeCost,
  CareerPlaybookQAData,
  CareerPlaybookQualityIssue,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import type { CareerPlaybookWebResearchResult } from './rag/web-research';

export type CareerPlaybookGroupKey =
  | 'group_1_foundation'
  | 'group_2_operations'
  | 'group_3_people'
  | 'group_4_growth'
  | 'group_5_system'
  | 'group_6_wrap';

export type CareerPlaybookGraphNode =
  | 'specBuilder'
  | 'group1Generator'
  | 'group2Generator'
  | 'group3Generator'
  | 'group4Generator'
  | 'group5Generator'
  | 'group6Generator'
  | 'crossBlockJudge'
  | 'blockRegenerator'
  | 'finalAssembler'
  | 'finalProofreader';

export interface CareerPlaybookGroupResult {
  groupKey: CareerPlaybookGroupKey;
  promptKey: string;
  markdown: string;
  blockIds: CareerPlaybookBlockId[];
  generatedAt: string;
  model: string;
}

export const CareerPlaybookGraphState = Annotation.Root({
  playbookId: Annotation<string>,
  userId: Annotation<string>,
  organizationId: Annotation<string>,
  language: Annotation<string>({
    reducer: (current, update) => update ?? current,
    default: () => 'ru',
  }),
  qaData: Annotation<CareerPlaybookQAData>,
  roleProfileSpec: Annotation<CareerPlaybookRoleProfileSpec | null>({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),
  webResearch: Annotation<CareerPlaybookWebResearchResult | null>({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),
  generatedGroups: Annotation<Partial<Record<CareerPlaybookGroupKey, CareerPlaybookGroupResult>>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  generatedBlocks: Annotation<Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  judgeVerdicts: Annotation<CareerPlaybookJudgeVerdict[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  lastJudgeVerdict: Annotation<CareerPlaybookJudgeVerdict | null>({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),
  lastJudgedBlockIds: Annotation<CareerPlaybookBlockId[]>({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),
  blockRegenerationAttempts: Annotation<Partial<Record<CareerPlaybookBlockId, number>>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  // Size of the eligible batch the most recent blockRegenerator pass selected.
  // Zero means the pass regenerated nothing — every flagged block was already at its
  // per-block/window cap — so re-judging identical content would be redundant and the
  // graph can advance. Every blockRegenerator return sets this so the router reads the
  // current pass, never a stale value; recomputing it in the router is impossible once
  // the pass has consumed regeneration attempts.
  lastRegenerationBatchSize: Annotation<number>({
    reducer: (current, update) => update ?? current,
    default: () => 0,
  }),
  finalMarkdown: Annotation<string | null>({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),
  nodeCosts: Annotation<CareerPlaybookNodeCost[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  errors: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  warnings: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  qualityIssues: Annotation<CareerPlaybookQualityIssue[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  currentNode: Annotation<CareerPlaybookGraphNode | null>({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),
});

export type CareerPlaybookGraphStateType = typeof CareerPlaybookGraphState.State;
export type CareerPlaybookGraphStateUpdate = Partial<CareerPlaybookGraphStateType>;
