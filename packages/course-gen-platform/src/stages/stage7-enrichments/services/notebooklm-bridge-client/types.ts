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
  lessonId?: string;
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
  /** Slide deck: `detailed_deck` | `presenter_slides` (mc2-6ye5z.4). */
  slideDeckFormat?: string;
  /** Slide deck: `default` | `short`. */
  slideDeckLength?: string;
  /** Slide deck download format: `pdf` | `pptx`. Defaults to PDF at the bridge. */
  slideDeckOutputFormat?: string;
  /** Free-text steer, shared by the slide deck and the data table. */
  artifactInstructions?: string;
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
  slideDeckStartPath: string;
  slideDeckTaskStatusPath: string;
  slideDeckTaskResultPath: string;
  reportStartPath: string;
  reportTaskStatusPath: string;
  reportTaskResultPath: string;
  dataTableStartPath: string;
  dataTableTaskStatusPath: string;
  dataTableTaskResultPath: string;
  defaultWaitOptions: NotebookLMBridgeWaitOptions;
}

export type NotebookLMBridgeMediaType =
  | 'audio'
  | 'video'
  | 'study_guide'
  | 'flashcards'
  | 'mind_map'
  | 'infographic'
  // mc2-6ye5z.4/.5/.8. `slide_deck` is binary (PDF or PPTX), the other two are
  // text (Markdown and CSV) — see `isTextMediaType`.
  | 'slide_deck'
  | 'report'
  | 'data_table';
