/**
 * Base error classes with HTTP status mapping
 * @module errors/typed-errors
 */

import { UnrecoverableError } from 'bullmq';

export enum ErrorCode {
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: ErrorCode, statusCode: number, isOperational = true) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, ErrorCode.AUTHENTICATION_ERROR, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, ErrorCode.AUTHORIZATION_ERROR, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, ErrorCode.VALIDATION_ERROR, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, ErrorCode.NOT_FOUND, 404);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'Quota exceeded') {
    super(message, ErrorCode.QUOTA_EXCEEDED, 429);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, ErrorCode.BAD_REQUEST, 400);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, ErrorCode.INTERNAL_ERROR, 500, false);
  }
}

/**
 * Job cancellation error
 *
 * Thrown when a job is cancelled by user request. Extends UnrecoverableError
 * to tell BullMQ that this job should not be retried.
 *
 * This is NOT a failure - it's a controlled termination requested by the user.
 */
export class JobCancelledError extends UnrecoverableError {
  public readonly jobId: string;
  public readonly cancelledBy?: string;
  public readonly cancelledAt: string;

  constructor(jobId: string, cancelledBy?: string) {
    super(`Job ${jobId} was cancelled by user request`);
    this.name = 'JobCancelledError';
    this.jobId = jobId;
    this.cancelledBy = cancelledBy;
    this.cancelledAt = new Date().toISOString();
  }
}
