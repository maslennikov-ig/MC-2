export interface MediaDefaults {
  mimeType: string;
  extension: string;
}

export interface NotebookLMSourceInput {
  title: string;
  content: string;
}

export type NotebookLMAudioFormatPreset = 'deep_dive' | 'brief' | 'critique' | 'debate';
export type NotebookLMAudioLengthPreset = 'short' | 'default' | 'long';
export type NotebookLMVideoFormatPreset = 'explainer' | 'brief';
export type NotebookLMVideoStylePreset =
  | 'auto_select'
  | 'custom'
  | 'classic'
  | 'whiteboard'
  | 'kawaii'
  | 'anime'
  | 'watercolor'
  | 'retro_print'
  | 'heritage'
  | 'paper_craft';

export interface NotebookLMBridgeGenerateRequest {
  lessonTitle: string;
  script: string;
  language: string;
  courseId?: string;
  voice?: string;
  targetDurationMinutes?: number;
  durationRangeMinMinutes?: number;
  durationRangeMaxMinutes?: number;
  sources?: NotebookLMSourceInput[];
  audioFormat?: NotebookLMAudioFormatPreset;
  audioLength?: NotebookLMAudioLengthPreset;
  videoFormat?: NotebookLMVideoFormatPreset;
  videoStyle?: NotebookLMVideoStylePreset;
  reportFormat?: string;
  flashcardDifficulty?: string;
  flashcardCount?: number;
  mindMapDepth?: number;
  infographicOrientation?: string;
  infographicDetail?: string;
}

export interface NotebookLMBridgeMediaResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  durationSeconds?: number;
  responseMetadata?: Record<string, unknown>;
  /** Text content for text-based artifacts (study_guide, flashcards, mind_map) */
  textContent?: string;
}

export interface NotebookLMBridgeWaitOptions {
  timeoutMs: number;
  initialPollDelayMs: number;
  maxPollDelayMs: number;
  jitterRatio: number;
}

export type NotebookLMBridgeWaitOptionsInput = Partial<NotebookLMBridgeWaitOptions>;

export interface NotebookLMBridgeTaskStartResult {
  taskId: string;
  status: string;
  responseMetadata: Record<string, unknown>;
  immediateMedia?: NotebookLMBridgeMediaResult;
}

export interface NotebookLMBridgeTaskStatusResult {
  taskId: string;
  status: string;
  progress?: number;
  responseMetadata: Record<string, unknown>;
}

export interface NotebookLMBridgeTaskResult {
  taskId: string;
  status?: string;
  payload: Record<string, unknown>;
}

export interface NotebookLMBridgeConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  pollRequestTimeoutMs: number;
  audioPath: string;
  videoPath: string;
  audioStartPath: string;
  videoStartPath: string;
  audioTaskStatusPath: string;
  videoTaskStatusPath: string;
  audioTaskResultPath: string;
  videoTaskResultPath: string;
  studyGuideStartPath: string;
  studyGuideTaskStatusPath: string;
  studyGuideTaskResultPath: string;
  flashcardsStartPath: string;
  flashcardsTaskStatusPath: string;
  flashcardsTaskResultPath: string;
  mindMapStartPath: string;
  mindMapTaskStatusPath: string;
  mindMapTaskResultPath: string;
  infographicStartPath: string;
  infographicTaskStatusPath: string;
  infographicTaskResultPath: string;
  defaultWaitOptions: NotebookLMBridgeWaitOptions;
}

export type NotebookLMBridgeMediaType =
  | 'audio'
  | 'video'
  | 'study_guide'
  | 'flashcards'
  | 'mind_map'
  | 'infographic';
