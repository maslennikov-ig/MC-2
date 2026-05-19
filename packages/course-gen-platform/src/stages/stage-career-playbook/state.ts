import { Annotation } from '@langchain/langgraph';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookNodeCost,
  CareerPlaybookQAData,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import type { CareerPlaybookWebResearchResult } from './rag/web-research';

export type CareerPlaybookGroupKey = 'group_1_foundation' | 'group_2_operations';

export type CareerPlaybookGraphNode = 'specBuilder' | 'group1Generator' | 'group2Generator';

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
  nodeCosts: Annotation<CareerPlaybookNodeCost[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  errors: Annotation<string[]>({
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
