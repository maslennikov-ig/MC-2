import { logger } from '@/shared/logger';
import { INLINE_TASK_ID } from './constants.js';
import type {
  NotebookLMSourceInput,
  NotebookLMBridgeGenerateRequest,
  NotebookLMBridgeMediaResult,
  NotebookLMBridgeWaitOptionsInput,
  NotebookLMBridgeTaskStartResult,
  NotebookLMBridgeTaskStatusResult,
  NotebookLMBridgeTaskResult,
  NotebookLMBridgeConfig,
  NotebookLMBridgeMediaType,
  MediaDefaults,
} from './types.js';
import { getOrCreateBridgeConfig } from './config.js';
import {
  extractTaskId,
  extractTaskStatus,
  getMediaPayloadCandidates,
  hasEmbeddedMediaPayload,
  parseMediaPayload,
  isTextMediaType,
  parseTextPayload,
  extractDownloadUrl,
  getDurationSeconds,
  getMediaDefaults,
  normalizeSources,
  extractTaskError,
  extractTaskProgress,
  isSuccessfulTaskStatus,
  isFailedTaskStatus,
  getStringValue,
} from './payload-utils.js';
import {
  postToBridge,
  getFromBridge,
  resolveTaskPath,
  resolveWaitOptions,
  applyJitter,
  sleep,
  shouldFallbackToLegacyStartPath,
  downloadFromUrl,
} from './network.js';

export class NotebookLMBridgeClient {
  private buildRequestBody(
    request: NotebookLMBridgeGenerateRequest,
    sources: NotebookLMSourceInput[]
  ): Record<string, unknown> {
    return {
      lesson_title: request.lessonTitle,
      script: request.script,
      language: request.language,
      course_id: request.courseId,
      lesson_id: request.lessonId,
      voice: request.voice,
      target_duration_minutes: request.targetDurationMinutes,
      duration_range_min_minutes: request.durationRangeMinMinutes,
      duration_range_max_minutes: request.durationRangeMaxMinutes,
      sources: sources.length > 0 ? sources : undefined,
      report_format: request.reportFormat,
      flashcard_difficulty: request.flashcardDifficulty,
      flashcard_count: request.flashcardCount,
      mind_map_depth: request.mindMapDepth,
      infographic_orientation: request.infographicOrientation,
      infographic_detail: request.infographicDetail,
    };
  }

  private parseStartResponse(
    payload: Record<string, unknown>,
    defaults: MediaDefaults
  ): NotebookLMBridgeTaskStartResult {
    const status = extractTaskStatus(payload);

    for (const candidate of getMediaPayloadCandidates(payload)) {
      if (hasEmbeddedMediaPayload(candidate)) {
        const immediateMedia = parseMediaPayload(candidate, defaults);
        return {
          taskId: extractTaskId(payload) ?? INLINE_TASK_ID,
          status,
          responseMetadata: payload,
          immediateMedia: {
            ...immediateMedia,
            responseMetadata: payload,
          },
        };
      }
    }

    const taskId = extractTaskId(payload);
    if (!taskId) {
      throw new Error('NotebookLM bridge start response did not include task_id');
    }

    return {
      taskId,
      status,
      responseMetadata: payload,
    };
  }

  private async resolveMediaFromTaskResult(
    taskResult: NotebookLMBridgeTaskResult,
    defaults: MediaDefaults,
    config: NotebookLMBridgeConfig,
    mediaType?: NotebookLMBridgeMediaType
  ): Promise<NotebookLMBridgeMediaResult> {
    if (mediaType && isTextMediaType(mediaType)) {
      const textResult = parseTextPayload(taskResult.payload, defaults);
      if (textResult) {
        return {
          ...textResult,
          responseMetadata: taskResult.payload,
        };
      }
    }

    const candidates = getMediaPayloadCandidates(taskResult.payload);

    for (const candidate of candidates) {
      if (hasEmbeddedMediaPayload(candidate)) {
        const media = parseMediaPayload(candidate, defaults);
        return {
          ...media,
          responseMetadata: taskResult.payload,
        };
      }
    }

    for (const candidate of candidates) {
      const downloadUrl = extractDownloadUrl(candidate);
      if (!downloadUrl) {
        continue;
      }

      const downloaded = await downloadFromUrl(downloadUrl, defaults, config);
      return {
        ...downloaded,
        durationSeconds: getDurationSeconds(candidate) ?? getDurationSeconds(taskResult.payload),
        responseMetadata: {
          ...taskResult.payload,
          download_url: downloadUrl,
        },
      };
    }

    throw new Error(
      `NotebookLM bridge task result did not include media payload or download URL (taskId=${taskResult.taskId})`
    );
  }

  async startAudio(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeTaskStartResult> {
    const config = getOrCreateBridgeConfig();
    const sources = normalizeSources(request.sources);
    const body = {
      ...this.buildRequestBody(request, sources),
      audio_format: request.audioFormat,
      audio_length: request.audioLength,
    };

    let payload: Record<string, unknown>;
    try {
      payload = await postToBridge(config.audioStartPath, body, config);
    } catch (error) {
      if (!shouldFallbackToLegacyStartPath(error, config.audioStartPath, config.audioPath)) {
        throw error;
      }

      logger.warn(
        {
          startPath: config.audioStartPath,
          fallbackPath: config.audioPath,
        },
        'NotebookLM bridge async audio start endpoint not available, falling back to legacy blocking endpoint'
      );
      payload = await postToBridge(config.audioPath, body, config);
    }

    return this.parseStartResponse(payload, getMediaDefaults('audio'));
  }

  async startVideo(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeTaskStartResult> {
    const config = getOrCreateBridgeConfig();
    const sources = normalizeSources(request.sources);
    const body = {
      ...this.buildRequestBody(request, sources),
      video_format: request.videoFormat,
      video_style: request.videoStyle,
    };

    let payload: Record<string, unknown>;
    try {
      payload = await postToBridge(config.videoStartPath, body, config);
    } catch (error) {
      if (!shouldFallbackToLegacyStartPath(error, config.videoStartPath, config.videoPath)) {
        throw error;
      }

      logger.warn(
        {
          startPath: config.videoStartPath,
          fallbackPath: config.videoPath,
        },
        'NotebookLM bridge async video start endpoint not available, falling back to legacy blocking endpoint'
      );
      payload = await postToBridge(config.videoPath, body, config);
    }

    return this.parseStartResponse(payload, getMediaDefaults('video'));
  }

  private getTaskStatusPath(
    config: NotebookLMBridgeConfig,
    mediaType: NotebookLMBridgeMediaType
  ): string {
    switch (mediaType) {
      case 'audio':
        return config.audioTaskStatusPath;
      case 'video':
        return config.videoTaskStatusPath;
      case 'study_guide':
        return config.studyGuideTaskStatusPath;
      case 'flashcards':
        return config.flashcardsTaskStatusPath;
      case 'mind_map':
        return config.mindMapTaskStatusPath;
      case 'infographic':
        return config.infographicTaskStatusPath;
    }
  }

  private getTaskResultPath(
    config: NotebookLMBridgeConfig,
    mediaType: NotebookLMBridgeMediaType
  ): string {
    switch (mediaType) {
      case 'audio':
        return config.audioTaskResultPath;
      case 'video':
        return config.videoTaskResultPath;
      case 'study_guide':
        return config.studyGuideTaskResultPath;
      case 'flashcards':
        return config.flashcardsTaskResultPath;
      case 'mind_map':
        return config.mindMapTaskResultPath;
      case 'infographic':
        return config.infographicTaskResultPath;
    }
  }

  async getTaskStatus(
    taskId: string,
    mediaType: NotebookLMBridgeMediaType
  ): Promise<NotebookLMBridgeTaskStatusResult> {
    const config = getOrCreateBridgeConfig();
    const pathValue = this.getTaskStatusPath(config, mediaType);
    const target = resolveTaskPath(pathValue, taskId);

    const payload = target.body
      ? await postToBridge(target.path, target.body, config, config.pollRequestTimeoutMs)
      : await getFromBridge(target.path, config, config.pollRequestTimeoutMs);

    return {
      taskId: extractTaskId(payload) ?? taskId,
      status: extractTaskStatus(payload),
      progress: extractTaskProgress(payload),
      responseMetadata: payload,
    };
  }

  async getTaskResult(
    taskId: string,
    mediaType: NotebookLMBridgeMediaType
  ): Promise<NotebookLMBridgeTaskResult> {
    const config = getOrCreateBridgeConfig();
    const pathValue = this.getTaskResultPath(config, mediaType);
    const target = resolveTaskPath(pathValue, taskId);

    const payload = target.body
      ? await postToBridge(target.path, target.body, config, config.pollRequestTimeoutMs)
      : await getFromBridge(target.path, config, config.pollRequestTimeoutMs);

    return {
      taskId: extractTaskId(payload) ?? taskId,
      status:
        getStringValue(payload, ['status', 'task_status', 'taskStatus', 'state']) ?? undefined,
      payload,
    };
  }

  async getTaskMedia(
    taskId: string,
    mediaType: NotebookLMBridgeMediaType
  ): Promise<NotebookLMBridgeMediaResult> {
    const config = getOrCreateBridgeConfig();
    const defaults = getMediaDefaults(mediaType);
    const taskResult = await this.getTaskResult(taskId, mediaType);
    return this.resolveMediaFromTaskResult(taskResult, defaults, config, mediaType);
  }

  async waitForTaskMedia(
    taskId: string,
    mediaType: NotebookLMBridgeMediaType,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    const config = getOrCreateBridgeConfig();
    const defaults = getMediaDefaults(mediaType);
    const options = resolveWaitOptions(config, waitOptions);

    const startedAt = Date.now();
    let nextDelayMs = options.initialPollDelayMs;
    let lastStatus = 'unknown';
    const statusHistory: Record<string, unknown>[] = [];

    while (true) {
      if (Date.now() - startedAt >= options.timeoutMs) {
        throw new Error(
          `NotebookLM bridge task timed out after ${options.timeoutMs}ms (taskId=${taskId}, lastStatus=${lastStatus})`
        );
      }

      const status = await this.getTaskStatus(taskId, mediaType);
      lastStatus = status.status;
      statusHistory.push(status.responseMetadata);

      if (isFailedTaskStatus(status.status)) {
        const reason = extractTaskError(status.responseMetadata);
        throw new Error(
          reason
            ? `NotebookLM bridge task failed (taskId=${taskId}, status=${status.status}): ${reason}`
            : `NotebookLM bridge task failed (taskId=${taskId}, status=${status.status})`
        );
      }

      if (isSuccessfulTaskStatus(status.status)) {
        break;
      }

      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= options.timeoutMs) {
        throw new Error(
          `NotebookLM bridge task timed out after ${options.timeoutMs}ms (taskId=${taskId}, lastStatus=${lastStatus})`
        );
      }

      const remainingMs = options.timeoutMs - elapsedMs;
      const delayMs = Math.min(remainingMs, applyJitter(nextDelayMs, options.jitterRatio));
      await sleep(delayMs);
      nextDelayMs = Math.min(
        options.maxPollDelayMs,
        Math.max(options.initialPollDelayMs, nextDelayMs * 2)
      );
    }

    const taskResult = await this.getTaskResult(taskId, mediaType);
    const media = await this.resolveMediaFromTaskResult(taskResult, defaults, config, mediaType);

    return {
      ...media,
      responseMetadata: {
        task_id: taskId,
        final_status: lastStatus,
        status_history: statusHistory,
        task_result: taskResult.payload,
      },
    };
  }

  private async startArtifact(
    request: NotebookLMBridgeGenerateRequest,
    mediaType: NotebookLMBridgeMediaType,
    startPath: string
  ): Promise<NotebookLMBridgeTaskStartResult> {
    const config = getOrCreateBridgeConfig();
    const sources = normalizeSources(request.sources);
    const body = this.buildRequestBody(request, sources);
    const payload = await postToBridge(startPath, body, config);
    return this.parseStartResponse(payload, getMediaDefaults(mediaType));
  }

  async startStudyGuide(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeTaskStartResult> {
    const config = getOrCreateBridgeConfig();
    return this.startArtifact(request, 'study_guide', config.studyGuideStartPath);
  }

  async startFlashcards(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeTaskStartResult> {
    const config = getOrCreateBridgeConfig();
    return this.startArtifact(request, 'flashcards', config.flashcardsStartPath);
  }

  async startMindMap(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeTaskStartResult> {
    const config = getOrCreateBridgeConfig();
    return this.startArtifact(request, 'mind_map', config.mindMapStartPath);
  }

  async startInfographic(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeTaskStartResult> {
    const config = getOrCreateBridgeConfig();
    return this.startArtifact(request, 'infographic', config.infographicStartPath);
  }

  private async generateArtifact(
    request: NotebookLMBridgeGenerateRequest,
    mediaType: NotebookLMBridgeMediaType,
    startFn: (req: NotebookLMBridgeGenerateRequest) => Promise<NotebookLMBridgeTaskStartResult>,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    const start = await startFn.call(this, request);
    if (start.immediateMedia) {
      return start.immediateMedia;
    }

    const media = await this.waitForTaskMedia(start.taskId, mediaType, waitOptions);
    return {
      ...media,
      responseMetadata: {
        start: start.responseMetadata,
        wait: media.responseMetadata,
      },
    };
  }

  async generateStudyGuide(
    request: NotebookLMBridgeGenerateRequest,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    return this.generateArtifact(request, 'study_guide', r => this.startStudyGuide(r), waitOptions);
  }

  async generateFlashcards(
    request: NotebookLMBridgeGenerateRequest,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    return this.generateArtifact(request, 'flashcards', r => this.startFlashcards(r), waitOptions);
  }

  async generateMindMap(
    request: NotebookLMBridgeGenerateRequest,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    return this.generateArtifact(request, 'mind_map', r => this.startMindMap(r), waitOptions);
  }

  async generateInfographic(
    request: NotebookLMBridgeGenerateRequest,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    return this.generateArtifact(
      request,
      'infographic',
      r => this.startInfographic(r),
      waitOptions
    );
  }

  async generateAudio(
    request: NotebookLMBridgeGenerateRequest,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    const start = await this.startAudio(request);
    if (start.immediateMedia) {
      return start.immediateMedia;
    }

    const media = await this.waitForTaskMedia(start.taskId, 'audio', waitOptions);
    return {
      ...media,
      responseMetadata: {
        start: start.responseMetadata,
        wait: media.responseMetadata,
      },
    };
  }

  async generateVideoOverview(
    request: NotebookLMBridgeGenerateRequest,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    const start = await this.startVideo(request);
    if (start.immediateMedia) {
      return start.immediateMedia;
    }

    const media = await this.waitForTaskMedia(start.taskId, 'video', waitOptions);
    return {
      ...media,
      responseMetadata: {
        start: start.responseMetadata,
        wait: media.responseMetadata,
      },
    };
  }
}

export const notebookLmBridgeClient = new NotebookLMBridgeClient();
