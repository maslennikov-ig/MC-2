export interface LoggerOptions {
  level?: string;
  service?: string;
  environment?: string;
  version?: string;
}

export interface ChildLoggerContext {
  module?: string;
  requestId?: string;
  userId?: string;
  courseId?: string;
  jobId?: string;
  stageNumber?: number;
  [key: string]: unknown;
}
