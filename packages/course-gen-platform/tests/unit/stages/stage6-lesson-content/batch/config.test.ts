import { afterEach, describe, expect, it } from 'vitest';
import {
  getStage6BatchMaxWaitMs,
  getStage6BatchPollIntervalMs,
  isStage6BatchEnabled,
} from '@/stages/stage6-lesson-content/batch/config';

const original = {
  enabled: process.env.FEATURE_STAGE6_BATCH_GENERATION,
  maxWait: process.env.STAGE6_BATCH_MAX_WAIT_MS,
  poll: process.env.STAGE6_BATCH_POLL_INTERVAL_MS,
};

afterEach(() => {
  if (original.enabled === undefined) delete process.env.FEATURE_STAGE6_BATCH_GENERATION;
  else process.env.FEATURE_STAGE6_BATCH_GENERATION = original.enabled;
  if (original.maxWait === undefined) delete process.env.STAGE6_BATCH_MAX_WAIT_MS;
  else process.env.STAGE6_BATCH_MAX_WAIT_MS = original.maxWait;
  if (original.poll === undefined) delete process.env.STAGE6_BATCH_POLL_INTERVAL_MS;
  else process.env.STAGE6_BATCH_POLL_INTERVAL_MS = original.poll;
});

describe('Stage 6 Batch configuration', () => {
  it('is off by default and uses the accepted two-hour fallback deadline', () => {
    delete process.env.FEATURE_STAGE6_BATCH_GENERATION;
    delete process.env.STAGE6_BATCH_MAX_WAIT_MS;
    delete process.env.STAGE6_BATCH_POLL_INTERVAL_MS;

    expect(isStage6BatchEnabled()).toBe(false);
    expect(getStage6BatchMaxWaitMs()).toBe(2 * 60 * 60 * 1000);
    expect(getStage6BatchPollIntervalMs()).toBe(60 * 1000);
  });

  it('requires an exact true flag and bounds unsafe timing overrides', () => {
    process.env.FEATURE_STAGE6_BATCH_GENERATION = 'TRUE';
    process.env.STAGE6_BATCH_MAX_WAIT_MS = '1';
    process.env.STAGE6_BATCH_POLL_INTERVAL_MS = String(60 * 60 * 1000);

    expect(isStage6BatchEnabled()).toBe(false);
    expect(getStage6BatchMaxWaitMs()).toBe(5 * 60 * 1000);
    expect(getStage6BatchPollIntervalMs()).toBe(5 * 60 * 1000);

    process.env.FEATURE_STAGE6_BATCH_GENERATION = 'true';
    expect(isStage6BatchEnabled()).toBe(true);
  });
});
