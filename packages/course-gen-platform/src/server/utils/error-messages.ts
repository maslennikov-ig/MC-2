/**
 * Standardized error message formatter for consistent user-facing error messages
 *
 * Format: "Action failed. Reason. Suggestion."
 * Example: "File upload failed. Storage quota exceeded. Please upgrade to higher tier."
 *
 * @module error-messages
 */

export interface ErrorMessageOptions {
  action: string;
  reason: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

/**
 * Format a standardized error message following the pattern:
 * "Action failed. Reason. Suggestion."
 *
 * @param options - Error message components
 * @returns Formatted error message string
 *
 * @example
 * formatErrorMessage({
 *   action: 'File upload',
 *   reason: 'Storage quota exceeded',
 *   suggestion: 'Please upgrade to higher tier'
 * })
 * // Returns: "File upload failed. Storage quota exceeded. Please upgrade to higher tier."
 */
export function formatErrorMessage(options: ErrorMessageOptions): string {
  const { action, reason, suggestion } = options;

  let message = `${action} failed. ${reason}.`;

  if (suggestion) {
    message += ` ${suggestion}.`;
  }

  return message;
}

/**
 * Common error message templates for reuse across routers
 */
export const ErrorMessages = {
  // Authentication & Authorization
  authRequired: () =>
    formatErrorMessage({
      action: 'Request',
      reason: 'Authentication required',
      suggestion: 'Please sign in to continue',
    }),

  forbidden: (resource: string) =>
    formatErrorMessage({
      action: 'Access',
      reason: `You do not have permission to access this ${resource}`,
      suggestion: 'Contact your organization administrator if you believe this is an error',
    }),

  // Resource Not Found
  notFound: (resource: string, identifier?: string) =>
    formatErrorMessage({
      action: 'Resource lookup',
      reason: identifier
        ? `${resource} not found: ${identifier}`
        : `${resource} not found`,
      suggestion: 'Please verify the ID and try again',
    }),

  // Database Operations
  databaseError: (operation: string, details?: string) =>
    formatErrorMessage({
      action: operation,
      reason: details || 'Database operation failed',
      suggestion: 'Please try again later or contact support if the issue persists',
    }),

  // File Operations
  fileUploadFailed: (reason: string, suggestion?: string) =>
    formatErrorMessage({
      action: 'File upload',
      reason,
      suggestion: suggestion || 'Please verify the file and try again',
    }),

  invalidFile: (reason: string, suggestion?: string) =>
    formatErrorMessage({
      action: 'File validation',
      reason,
      suggestion: suggestion || 'Please upload a valid file',
    }),

  // Quota & Limits
  quotaExceeded: (quotaType: 'storage' | 'files', suggestion?: string) =>
    formatErrorMessage({
      action: quotaType === 'storage' ? 'Storage allocation' : 'File upload',
      reason: `${quotaType === 'storage' ? 'Storage' : 'File count'} quota exceeded`,
      suggestion: suggestion || 'Please upgrade to a higher tier or remove existing files',
    }),

  // Job Operations
  jobNotFound: (jobId: string) =>
    formatErrorMessage({
      action: 'Job lookup',
      reason: `Job ${jobId} not found`,
      suggestion: 'Please verify the job ID and try again',
    }),

  jobCancellationFailed: (jobId: string, reason: string) =>
    formatErrorMessage({
      action: 'Job cancellation',
      reason: `Cannot cancel job ${jobId} because ${reason}`,
      suggestion: 'Jobs can only be cancelled while pending, waiting, or active',
    }),

  // Course Operations
  courseNotFound: (courseId: string) =>
    formatErrorMessage({
      action: 'Course lookup',
      reason: `Course not found: ${courseId}`,
      suggestion: 'Please verify the course ID and try again',
    }),

  courseGenerationFailed: (reason: string) =>
    formatErrorMessage({
      action: 'Course generation',
      reason,
      suggestion: 'Please check the input parameters and try again',
    }),

  // Organization Operations
  organizationNotFound: (orgId: string) =>
    formatErrorMessage({
      action: 'Organization lookup',
      reason: `Organization not found: ${orgId}`,
      suggestion: 'Please verify the organization ID and try again',
    }),

  // Validation Errors
  validationFailed: (fieldName: string, reason: string, suggestion?: string) =>
    formatErrorMessage({
      action: `${fieldName} validation`,
      reason,
      suggestion: suggestion || 'Please provide valid input and try again',
    }),

  // Generic Errors
  internalError: (operation: string, details?: string) =>
    formatErrorMessage({
      action: operation,
      reason: details || 'An unexpected error occurred',
      suggestion: 'Please try again later or contact support if the issue persists',
    }),
} as const;
