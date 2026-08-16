/**
 * Contract: a log line says which deployment it came from, not which mode Node
 * was built in.
 *
 * Every dev container runs with NODE_ENV=production — correctly; that is Node's
 * build mode — and the logger stamped that onto every line, so a dev log was
 * indistinguishable from a production one. Noticed while reading dev worker
 * logs to find where a course's cost went (mc2-qrdkt.9, 2026-08-16).
 */

import { describe, expect, it, afterEach } from 'vitest';

import { detectEnvironment } from '../src/utils';

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe('deployment label', () => {
  it('calls the dev host dev, whatever NODE_ENV says', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_URL = 'https://dev.ai.megacampus.ru';

    expect(detectEnvironment()).toBe('dev');
  });

  it('calls the staging host stage', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_URL = 'https://ai.megacampus.ru';

    expect(detectEnvironment()).toBe('stage');
  });

  it('answers nothing when there is no app url to read, leaving the fallback to the caller', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;

    expect(detectEnvironment()).toBeNull();
  });
});
