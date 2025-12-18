import { AppNode, AppEdge } from '../../components/generation-graph/types';

export const mockNodes: AppNode[] = [
  {
    id: 'stage_1',
    type: 'stage',
    position: { x: 0, y: 0 },
    data: {
      label: 'Trigger',
      stageNumber: 1,
      status: 'completed',
      color: '#6B7280',
      icon: 'Play',
      type: 'trigger',
      metrics: { duration: 120 }
    },
  },
  {
    id: 'stage_2',
    type: 'stage',
    position: { x: 250, y: 0 },
    data: {
      label: 'Document Processing',
      stageNumber: 2,
      status: 'completed',
      color: '#3B82F6',
      icon: 'FileText',
      type: 'document',
      metrics: { duration: 4500 }
    },
  },
  {
    id: 'doc_1',
    type: 'document',
    position: { x: 250, y: 100 },
    parentId: 'stage_2',
    data: {
      label: 'Document 1',
      filename: 'syllabus.pdf',
      stageNumber: 2,
      status: 'completed',
      color: '#3B82F6',
      icon: 'FileText',
      type: 'document'
    },
  },
  {
    id: 'stage_3',
    type: 'stage',
    position: { x: 500, y: 0 },
    data: {
      label: 'Concept Extraction',
      stageNumber: 3,
      status: 'active',
      color: '#8B5CF6',
      icon: 'Sparkles',
      type: 'ai',
      progress: 45
    },
  },
];

export const mockEdges: AppEdge[] = [
  {
    id: 'e1-2',
    source: 'stage_1',
    target: 'stage_2',
    type: 'animated',
    data: {
        status: 'completed',
        animated: false
    }
  },
  {
    id: 'e2-3',
    source: 'stage_2',
    target: 'stage_3',
    type: 'dataflow',
    data: {
        status: 'active',
        animated: true
    }
  }
];
