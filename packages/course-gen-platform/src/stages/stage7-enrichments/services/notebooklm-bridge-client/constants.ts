export const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
export const DEFAULT_POLL_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_POLL_INITIAL_DELAY_MS = 5_000;
export const DEFAULT_POLL_MAX_DELAY_MS = 30_000;
export const DEFAULT_POLL_JITTER_RATIO = 0.2;

export const AUDIO_DEFAULT_PATH = '/artifacts/generate-audio';
export const VIDEO_DEFAULT_PATH = '/video/generate-overview';
export const AUDIO_START_DEFAULT_PATH = '/artifacts/generate-audio/start';
export const VIDEO_START_DEFAULT_PATH = '/video/generate-overview/start';
export const AUDIO_TASK_STATUS_DEFAULT_PATH = '/artifacts/generate-audio/{taskId}/status';
export const VIDEO_TASK_STATUS_DEFAULT_PATH = '/video/generate-overview/{taskId}/status';
export const AUDIO_TASK_RESULT_DEFAULT_PATH = '/artifacts/generate-audio/{taskId}/result';
export const VIDEO_TASK_RESULT_DEFAULT_PATH = '/video/generate-overview/{taskId}/result';

export const STUDY_GUIDE_START_DEFAULT_PATH = '/artifacts/study-guide/start';
export const STUDY_GUIDE_TASK_STATUS_DEFAULT_PATH = '/artifacts/study-guide/{taskId}/status';
export const STUDY_GUIDE_TASK_RESULT_DEFAULT_PATH = '/artifacts/study-guide/{taskId}/result';
export const FLASHCARDS_START_DEFAULT_PATH = '/artifacts/flashcards/start';
export const FLASHCARDS_TASK_STATUS_DEFAULT_PATH = '/artifacts/flashcards/{taskId}/status';
export const FLASHCARDS_TASK_RESULT_DEFAULT_PATH = '/artifacts/flashcards/{taskId}/result';
export const MIND_MAP_START_DEFAULT_PATH = '/artifacts/mind-map/start';
export const MIND_MAP_TASK_STATUS_DEFAULT_PATH = '/artifacts/mind-map/{taskId}/status';
export const MIND_MAP_TASK_RESULT_DEFAULT_PATH = '/artifacts/mind-map/{taskId}/result';
export const INFOGRAPHIC_START_DEFAULT_PATH = '/artifacts/infographic/start';
export const INFOGRAPHIC_TASK_STATUS_DEFAULT_PATH = '/artifacts/infographic/{taskId}/status';
export const INFOGRAPHIC_TASK_RESULT_DEFAULT_PATH = '/artifacts/infographic/{taskId}/result';

// mc2-6ye5z.4/.5/.8. Kebab-case in the URL, snake_case in the media type — the
// same split the mind-map paths already use.
export const SLIDE_DECK_START_DEFAULT_PATH = '/artifacts/slide-deck/start';
export const SLIDE_DECK_TASK_STATUS_DEFAULT_PATH = '/artifacts/slide-deck/{taskId}/status';
export const SLIDE_DECK_TASK_RESULT_DEFAULT_PATH = '/artifacts/slide-deck/{taskId}/result';
export const REPORT_START_DEFAULT_PATH = '/artifacts/report/start';
export const REPORT_TASK_STATUS_DEFAULT_PATH = '/artifacts/report/{taskId}/status';
export const REPORT_TASK_RESULT_DEFAULT_PATH = '/artifacts/report/{taskId}/result';
export const DATA_TABLE_START_DEFAULT_PATH = '/artifacts/data-table/start';
export const DATA_TABLE_TASK_STATUS_DEFAULT_PATH = '/artifacts/data-table/{taskId}/status';
export const DATA_TABLE_TASK_RESULT_DEFAULT_PATH = '/artifacts/data-table/{taskId}/result';
export const INLINE_TASK_ID = 'inline-result';

export const SUCCESS_TASK_STATUSES = new Set([
  'completed',
  'complete',
  'done',
  'success',
  'succeeded',
  'ready',
  'finished',
]);

export const FAILED_TASK_STATUSES = new Set([
  'failed',
  'failure',
  'error',
  'cancelled',
  'canceled',
  'timed_out',
  'timeout',
]);
