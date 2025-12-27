import { describe, it, expect } from 'vitest';
import { CHECK_NAMES, WORKER_MESSAGES, ERROR_MESSAGES } from '@/shared/constants/messages';

describe('CHECK_NAMES', () => {
  it('should have all pre-flight check names', () => {
    expect(CHECK_NAMES.UPLOADS_DIRECTORY).toBe('uploads_directory');
    expect(CHECK_NAMES.DISK_SPACE).toBe('disk_space');
    expect(CHECK_NAMES.REDIS_CONNECTION).toBe('redis_connection');
  });

  it('should have snake_case naming format', () => {
    Object.values(CHECK_NAMES).forEach(name => {
      expect(name).toMatch(/^[a-z_]+$/);
    });
  });

  it('should have unique check names', () => {
    const names = Object.values(CHECK_NAMES);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

describe('WORKER_MESSAGES', () => {
  it('should have worker ready messages', () => {
    expect(WORKER_MESSAGES.WORKER_READY).toBe('Worker ready');
    expect(WORKER_MESSAGES.WORKER_NOT_READY).toBe('Worker not ready');
    expect(WORKER_MESSAGES.ALL_CHECKS_PASSED).toBeDefined();
  });

  it('should have pre-flight check messages', () => {
    expect(WORKER_MESSAGES.PRE_FLIGHT_STARTING).toBeDefined();
    expect(WORKER_MESSAGES.PRE_FLIGHT_ALREADY_RUNNING).toBeDefined();
    expect(WORKER_MESSAGES.PRE_FLIGHT_FAILED).toBeDefined();
  });

  it('should have uploads directory messages', () => {
    expect(WORKER_MESSAGES.UPLOADS_CHECKING).toBeDefined();
    expect(WORKER_MESSAGES.UPLOADS_ACCESSIBLE).toBeDefined();
    expect(WORKER_MESSAGES.UPLOADS_NOT_READY).toBeDefined();
    expect(WORKER_MESSAGES.UPLOADS_FAILED).toBeDefined();
  });

  it('should have Redis messages', () => {
    expect(WORKER_MESSAGES.REDIS_CHECKING).toBeDefined();
    expect(WORKER_MESSAGES.REDIS_HEALTHY).toBeDefined();
    expect(WORKER_MESSAGES.REDIS_FAILED).toBeDefined();
  });

  it('should have disk space messages', () => {
    expect(WORKER_MESSAGES.DISK_CHECKING).toBeDefined();
    expect(WORKER_MESSAGES.DISK_ADEQUATE).toBeDefined();
    expect(WORKER_MESSAGES.DISK_LOW).toBeDefined();
    expect(WORKER_MESSAGES.DISK_FAILED).toBeDefined();
  });

  it('should have non-empty messages', () => {
    Object.values(WORKER_MESSAGES).forEach(message => {
      expect(message).toBeTruthy();
      expect(message.length).toBeGreaterThan(0);
    });
  });
});

describe('ERROR_MESSAGES', () => {
  it('should have error messages', () => {
    expect(ERROR_MESSAGES.QUEUE_UNHEALTHY).toBe('Queue system unhealthy');
    expect(ERROR_MESSAGES.READINESS_CHECK_FAILED).toBe('Worker readiness check failed');
    expect(ERROR_MESSAGES.TOO_MANY_REQUESTS).toBe('Too many requests');
    expect(ERROR_MESSAGES.INTERNAL_ERROR).toBe('Internal server error');
  });

  it('should have non-empty error messages', () => {
    Object.values(ERROR_MESSAGES).forEach(message => {
      expect(message).toBeTruthy();
      expect(message.length).toBeGreaterThan(0);
    });
  });

  it('should have unique error messages', () => {
    const messages = Object.values(ERROR_MESSAGES);
    const uniqueMessages = new Set(messages);
    expect(uniqueMessages.size).toBe(messages.length);
  });
});
